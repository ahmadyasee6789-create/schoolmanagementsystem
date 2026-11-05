"""Grade administration and historical guards using disposable databases only."""
from concurrent.futures import ThreadPoolExecutor
import os
from threading import Barrier, Event
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import test_exam_result_entry as fixture
from app.models.exams import Exam, ExamResult, GradeScale
from app.routers import dmc, exams, exams_results, grade_scales
from app.schemas.grade_scale import GradeScaleInput
from app.services.exam_evaluation import evaluate_result
from app.services.grade_scales import lock_scale_organization


class GradeScaleTests(unittest.TestCase):
    def setUp(self):
        fixture.ExamResultEntryTests.setUp(self)
        self.actor.org_role = "admin"
        self.active = SimpleNamespace(id=1, name="2026-27")
        self.app = FastAPI()
        self.app.include_router(grade_scales.router)
        self.app.include_router(exams.router)
        self.app.dependency_overrides[grade_scales.get_db] = lambda: self.db
        self.app.dependency_overrides[grade_scales.get_current_user] = lambda: self.actor
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def add(self, grade="Configured", low=0, high=100, **values):
        return self.client.post("/grade-scales", json=dict(grade=grade, min_percentage=low, max_percentage=high, **values))

    def test_crud_is_scoped_and_preserves_optional_gpa(self):
        self.db.add(GradeScale(organization_id=2, grade="Other school", min_percentage=0, max_percentage=100, gpa=5))
        self.db.commit()
        created = self.add(gpa=3.75)
        self.assertEqual(created.status_code, 201)
        row = created.json()
        self.assertEqual(self.db.get(GradeScale, row["id"]).organization_id, 1)
        response = self.client.get("/grade-scales").json()
        self.assertEqual([r["grade"] for r in response["items"]], ["Configured"])
        self.assertTrue(response["complete"])
        self.assertTrue(response["require_complete_for_finalization"])
        response = self.client.put(f'/grade-scales/{row["id"]}', json=dict(grade="Updated", min_percentage=0, max_percentage=100, gpa=3.75))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["gpa"], 3.75)
        self.assertEqual(self.client.delete(f'/grade-scales/{row["id"]}').status_code, 204)
        self.assertEqual(self.db.query(GradeScale).one().grade, "Other school")

    def test_invalid_input_and_client_ownership_are_rejected(self):
        for values in [dict(min_percentage=-1), dict(max_percentage=101), dict(min_percentage=80,max_percentage=70),
                       dict(grade="  "), dict(min_percentage=True), dict(gpa=True), dict(gpa=-1),
                       dict(min_percentage="NaN"), dict(max_percentage="Infinity"), dict(min_percentage="0.001"),
                       dict(organization_id=2), dict(id=77)]:
            with self.subTest(values=values):
                payload=dict(grade="Test",min_percentage=0,max_percentage=100)
                payload.update(values)
                self.assertEqual(self.client.post("/grade-scales",json=payload).status_code,422)
        self.assertEqual(self.db.query(GradeScale).count(),0)

    def test_overlaps_shared_endpoints_and_duplicate_labels_are_rejected(self):
        self.assertEqual(self.add("Lower",0,39.99).status_code,201)
        for grade, low, high in [("Overlap",30,50),("Endpoint",39.99,50),(" lower ",80,100)]:
            with self.subTest(grade=grade):
                self.assertEqual(self.add(grade,low,high).status_code,409)
        self.assertEqual(self.add("Upper",40,100).status_code,201)
        self.assertTrue(self.client.get("/grade-scales").json()["complete"])

    def test_gaps_are_reported_without_inventing_default_grades(self):
        empty=self.client.get("/grade-scales").json()
        self.assertEqual(empty["items"],[])
        self.assertEqual(empty["gaps"],[dict(minimum=0,maximum=100)])
        self.add("Only configured range",40,79.99)
        response=self.client.get("/grade-scales").json()
        self.assertFalse(response["complete"])
        self.assertEqual(response["gaps"],[dict(minimum=0,maximum=39.99),dict(minimum=80,maximum=100)])

    def test_other_school_rows_cannot_be_updated_or_deleted(self):
        row=GradeScale(organization_id=2,grade="Other",min_percentage=0,max_percentage=100)
        self.db.add(row);self.db.commit()
        body=dict(grade="Changed",min_percentage=0,max_percentage=100)
        self.assertEqual(self.client.put(f"/grade-scales/{row.id}",json=body).status_code,404)
        self.assertEqual(self.client.delete(f"/grade-scales/{row.id}").status_code,404)
        self.assertEqual(self.db.get(GradeScale,row.id).grade,"Other")

    def test_teachers_and_other_nonadmins_can_read_but_cannot_write(self):
        row=self.add().json()
        for role in ("teacher","viewer","accountant","manager"):
            with self.subTest(role=role):
                self.actor.org_role=role
                self.assertFalse(self.client.get("/grade-scales").json()["can_manage"])
                self.assertEqual(self.add("Denied").status_code,403)
                self.assertEqual(self.client.put(f'/grade-scales/{row["id"]}',json=dict(grade="Denied",min_percentage=0,max_percentage=100)).status_code,403)
                self.assertEqual(self.client.delete(f'/grade-scales/{row["id"]}').status_code,403)

    def test_authentication_and_membership_are_required(self):
        self.actor.org_id=None
        self.assertEqual(self.client.get("/grade-scales").status_code,403)
        self.assertEqual(self.add().status_code,403)
        self.app.dependency_overrides.pop(grade_scales.get_current_user)
        self.assertEqual(self.client.get("/grade-scales").status_code,401)
        self.assertEqual(self.add().status_code,401)

    def test_published_and_locked_history_blocks_all_grade_mutations(self):
        row=self.add(gpa=2.5).json()
        for flag in ("is_published","is_locked"):
            with self.subTest(flag=flag):
                exam=self.db.get(Exam,1);setattr(exam,flag,True);self.db.commit()
                state=self.client.get("/grade-scales").json()
                self.assertTrue(state["history_locked"])
                self.assertFalse(state["can_manage"])
                self.assertEqual(self.add("Future",0,100).status_code,409)
                self.assertEqual(self.client.put(f'/grade-scales/{row["id"]}',json=dict(grade="Regraded",min_percentage=0,max_percentage=100)).status_code,409)
                self.assertEqual(self.client.delete(f'/grade-scales/{row["id"]}').status_code,409)
                self.assertEqual(self.db.get(GradeScale,row["id"]).grade,"Configured")
                setattr(self.db.get(Exam,1),flag,False);self.db.commit()

    def test_finalization_requires_complete_coverage(self):
        for action in ("publish","lock"):
            with self.subTest(action=action):
                self.assertEqual(self.client.put(f"/exams/1/{action}").status_code,409)
                exam=self.db.get(Exam,1)
                self.assertFalse(exam.is_published)
                self.assertFalse(exam.is_locked)
        self.add("Lower",0,39.99)
        self.assertEqual(self.client.put("/exams/1/publish").status_code,409)
        self.add("Upper",40,100)
        self.assertEqual(self.client.put("/exams/1/publish").status_code,200)
        self.assertEqual(self.client.put("/exams/1/lock").status_code,200)

    def test_legacy_conflicts_are_visible_and_never_rewritten_on_read(self):
        self.db.add_all([GradeScale(organization_id=1,grade="Legacy",min_percentage=0,max_percentage=80),
                         GradeScale(organization_id=1,grade="legacy",min_percentage=80,max_percentage=100)])
        self.db.commit()
        state=self.client.get("/grade-scales").json()
        self.assertFalse(state["complete"])
        self.assertTrue(any("overlap" in issue for issue in state["issues"]))
        self.assertTrue(any("Duplicate" in issue for issue in state["issues"]))
        self.assertEqual(self.db.query(GradeScale).count(),2)

    def test_already_finalized_legacy_exams_are_not_retroactively_blocked(self):
        # The new coverage gate applies to an exam's first finalization. It must
        # not prevent publishing an already locked legacy exam with no scale.
        self.db.get(Exam,1).is_locked=True
        self.db.commit()
        self.assertEqual(self.client.put("/exams/1/publish").status_code,200)
        self.assertEqual(self.db.query(GradeScale).count(),0)
        self.assertTrue(self.client.get("/grade-scales").json()["history_locked"])

    def test_failed_commit_rolls_back_the_edit(self):
        row=self.add().json()
        with patch.object(self.db,"commit",side_effect=RuntimeError("Synthetic commit failure")):
            with self.assertRaises(RuntimeError):
                self.client.put(f'/grade-scales/{row["id"]}',json=dict(grade="Changed",min_percentage=0,max_percentage=100))
        self.assertEqual(self.db.get(GradeScale,row["id"]).grade,"Configured")

    def test_grade_labels_do_not_change_pass_fail_and_existing_dmc_uses_scale(self):
        self.add("School custom label",0,100,gpa=2.25)
        self.db.add_all(ExamResult(exam_paper_id=paper,student_enrollment_id=enrollment,obtained_marks=25)
                        for enrollment in self.enrollments.values() for paper in range(1,5))
        self.db.commit()
        marks=exams_results.get_exam_results(1,self.db,self.actor,self.active)
        self.assertEqual({row.grade for row in marks},{"School custom label"})
        self.assertEqual({row.gpa for row in marks},{2.25})
        self.assertEqual(evaluate_result([dict(total=100,obtained=25,**{"pass":40})])["result"],"FAILED")
        for method,layout in (("generate_bulk_dmc",2),("generate_bulk_dmc_three",3)):
            with patch.object(dmc,method) as render:
                dmc.bulk_dmc(1,1,layout,self.db,self.actor,self.active)
            students=render.call_args.args[2]
            self.assertEqual({row["grade"] for row in students},{"School custom label"})
            self.assertEqual({row["result"] for row in students},{"FAILED"})

    @unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"),"Requires disposable PostgreSQL row locks")
    def test_concurrent_overlapping_ranges_cannot_both_be_created(self):
        self.db.rollback()
        barrier=Barrier(2)
        def create(label,low,high):
            with Session(self.engine) as db:
                barrier.wait(timeout=10)
                try:
                    grade_scales.create_grade_scale(GradeScaleInput(grade=label,min_percentage=low,max_percentage=high),db,self.actor)
                    return 201
                except HTTPException as exc:
                    return exc.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(create,"First",0,80),pool.submit(create,"Second",50,100)]
            self.assertEqual(sorted(f.result(timeout=15) for f in futures),[201,409])
        self.assertEqual(self.db.query(GradeScale).count(),1)

    @unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"),"Requires disposable PostgreSQL row locks")
    def test_finalization_in_progress_blocks_a_concurrent_regrade(self):
        row=self.add().json();self.db.rollback()
        started=Event()
        def edit():
            with Session(self.engine) as db:
                started.set()
                try:
                    grade_scales.update_grade_scale(row["id"],GradeScaleInput(grade="Changed",min_percentage=0,max_percentage=100),db,self.actor)
                    return 200
                except HTTPException as exc:
                    return exc.status_code
        with Session(self.engine) as finalizing, ThreadPoolExecutor(max_workers=1) as pool:
            lock_scale_organization(finalizing,1)
            finalizing.get(Exam,1).is_published=True
            finalizing.flush()
            future=pool.submit(edit)
            self.assertTrue(started.wait(timeout=5))
            finalizing.commit()
            self.assertEqual(future.result(timeout=15),409)
        self.assertEqual(self.db.get(GradeScale,row["id"]).grade,"Configured")
