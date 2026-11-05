"""Explicit exam correction using only synthetic SQLite / isolated PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
import copy
import os
from threading import Barrier, Event
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import test_exam_result_entry as fixture
from app.models.exams import Exam, ExamResult, GradeScale
from app.models.exam_reopen_snapshot import ExamReopenSnapshot
from app.routers import exams, exam_papers, exams_results, grade_scales
from app.schemas.exam_result import ExamResultCreate
from app.services.exam_editing import lock_exam_record
from app.services.exam_reopening import reopen_exam, snapshot_hash


class ExamReopenTests(unittest.TestCase):
    def setUp(self):
        fixture.ExamResultEntryTests.setUp(self)
        self.actor.org_role = "admin"
        self.db.add(GradeScale(organization_id=1,grade="School scale",min_percentage=0,max_percentage=100,gpa=3))
        self.db.add_all(ExamResult(exam_paper_id=paper,student_enrollment_id=enrollment,obtained_marks=50)
                        for enrollment in self.enrollments.values() for paper in range(1,5))
        self.exam.is_locked = self.exam.is_published = True
        self.db.commit()
        self.app=FastAPI()
        for module in (exams,exams_results,exam_papers,grade_scales): self.app.include_router(module.router)
        self.app.dependency_overrides[exams.get_db]=lambda:self.db
        self.app.dependency_overrides[exams.get_current_user]=lambda:self.actor
        self.client=TestClient(self.app)
        self.addCleanup(self.client.close)

    def reopen(self,reason="Correct accidentally entered marks"):
        return self.client.post("/exams/1/reopen",json={"reason":reason})

    def marks(self):
        return [(row.id,row.exam_paper_id,row.student_enrollment_id,row.obtained_marks)
                for row in self.db.query(ExamResult).order_by(ExamResult.id)]

    def test_reopen_saves_every_original_value_and_only_changes_status(self):
        original=self.marks()
        result=self.reopen()
        self.assertEqual(result.status_code,200)
        self.assertFalse(result.json()["exam"]["is_locked"])
        self.assertFalse(result.json()["exam"]["is_published"])
        self.assertEqual(self.marks(),original)
        snapshot=self.db.query(ExamReopenSnapshot).one()
        self.assertEqual(snapshot.created_by,1)
        self.assertIsNotNone(snapshot.created_at)
        self.assertEqual(snapshot.reason,"Correct accidentally entered marks")
        self.assertTrue(snapshot.snapshot["exam"]["is_locked"])
        self.assertTrue(snapshot.snapshot["exam"]["is_published"])
        self.assertEqual(len(snapshot.snapshot["results"]),16)
        self.assertEqual(len(snapshot.snapshot["papers"]),4)
        self.assertEqual(snapshot.snapshot["grade_scales"][0]["grade"],"School scale")
        self.assertEqual(snapshot.snapshot["results"][0]["grade"],"School scale")
        self.assertEqual(snapshot.snapshot_sha256,snapshot_hash(snapshot.snapshot))

    def test_reason_confirmation_cannot_supply_identity_status_or_timestamp(self):
        for body in ({},{"reason":"  "},{"reason":"x"*1001},{"reason":"Valid reason","created_by":99},
                     {"reason":"Valid reason","organization_id":2},{"reason":"Valid reason","is_published":False}):
            with self.subTest(body=body):
                self.assertEqual(self.client.post("/exams/1/reopen",json=body).status_code,422)
        self.assertTrue(self.db.get(Exam,1).is_locked)
        self.assertEqual(self.db.query(ExamReopenSnapshot).count(),0)

    def test_only_school_admins_can_reopen_or_read_snapshots(self):
        for role in ("teacher","viewer","accountant","manager"):
            with self.subTest(role=role):
                self.actor.org_role=role
                self.assertEqual(self.reopen().status_code,403)
                self.assertEqual(self.client.get("/exams/1/reopen-snapshots").status_code,403)
                self.assertEqual(self.client.put("/exams/1/lock").status_code,403)
                self.assertEqual(self.client.put("/exams/1/publish").status_code,403)
        self.actor.org_role="admin";self.actor.org_id=2
        self.assertEqual(self.reopen().status_code,404)
        self.assertEqual(self.db.query(ExamReopenSnapshot).count(),0)

    def test_missing_snapshot_migration_fails_closed_without_touching_exam(self):
        with patch("app.services.exam_snapshot_storage.snapshot_storage_available",return_value=False):
            self.assertEqual(self.reopen().status_code,503)
        self.assertTrue(self.db.get(Exam,1).is_locked)
        self.assertTrue(self.db.get(Exam,1).is_published)
        self.assertEqual(self.db.query(ExamReopenSnapshot).count(),0)

    def test_repeated_request_cannot_replace_original_snapshot(self):
        self.assertEqual(self.reopen().status_code,200)
        original=copy.deepcopy(self.db.query(ExamReopenSnapshot).one().snapshot)
        self.assertEqual(self.reopen().status_code,409)
        self.assertEqual(self.db.query(ExamReopenSnapshot).count(),1)
        self.assertEqual(self.db.query(ExamReopenSnapshot).one().snapshot,original)

    def test_commit_failure_rolls_back_snapshot_and_both_flags(self):
        original=self.marks()
        with patch.object(self.db,"commit",side_effect=RuntimeError("Synthetic commit failure")):
            with self.assertRaises(RuntimeError): self.reopen()
        self.assertEqual(self.db.query(ExamReopenSnapshot).count(),0)
        self.assertTrue(self.db.get(Exam,1).is_locked)
        self.assertTrue(self.db.get(Exam,1).is_published)
        self.assertEqual(self.marks(),original)

    def test_snapshot_insert_failure_does_not_unlock_the_exam(self):
        def fail(*_args): raise RuntimeError("Synthetic snapshot failure")
        event.listen(ExamReopenSnapshot,"after_insert",fail)
        try:
            with self.assertRaises(RuntimeError): self.reopen()
        finally: event.remove(ExamReopenSnapshot,"after_insert",fail)
        self.assertEqual(self.db.query(ExamReopenSnapshot).count(),0)
        self.assertTrue(self.db.get(Exam,1).is_locked)

    def test_all_result_and_paper_writers_reject_both_protected_states(self):
        mark=dict(exam_paper_id=1,student_enrollment_id=self.enrollments[1],obtained_marks=90)
        result_id=self.db.query(ExamResult.id).first()[0]
        for locked,published in ((True,False),(False,True),(True,True)):
            with self.subTest(locked=locked,published=published):
                exam=self.db.get(Exam,1);exam.is_locked=locked;exam.is_published=published;self.db.commit()
                self.assertEqual(self.client.post("/exam-results",json=mark).status_code,409)
                bulk=self.client.post("/exam-results/bulk",json=[mark]).json()
                self.assertEqual(bulk["succeeded"],[])
                self.assertEqual(len(bulk["failed"]),1)
                self.assertEqual(self.client.delete(f"/exam-results/{result_id}").status_code,409)
                self.assertEqual(self.client.put("/exam-papers/1",json={"total_marks":120}).status_code,409)
                self.assertEqual(self.client.delete("/exam-papers/1").status_code,409)
                self.assertEqual(self.client.post("/exam-papers",json=dict(exam_id=1,classroom_id=1,subject_id=1,total_marks=100,pass_marks=40)).status_code,409)
        self.assertEqual({m[-1] for m in self.marks()},{50})

    def test_correction_relock_republish_preserves_first_snapshot_and_scale_guard(self):
        first=self.reopen().json()["snapshot_id"]
        original=self.client.get(f"/exams/1/reopen-snapshots/{first}").json()
        self.assertTrue(self.client.get("/grade-scales").json()["history_locked"])
        response=self.client.post("/exam-results",json=dict(exam_paper_id=1,student_enrollment_id=self.enrollments[1],obtained_marks=90))
        self.assertEqual(response.status_code,201)
        self.assertEqual(self.client.put("/exams/1/lock").status_code,200)
        self.assertEqual(self.client.put("/exams/1/publish").status_code,200)
        self.assertEqual(self.client.get(f"/exams/1/reopen-snapshots/{first}").json(),original)
        self.assertEqual(self.db.query(ExamReopenSnapshot).count(),1)
        second=self.reopen().json()["snapshot_id"]
        self.assertNotEqual(first,second)
        newer=self.client.get(f"/exams/1/reopen-snapshots/{second}").json()
        self.assertEqual(newer["snapshot"]["results"][0]["obtained_marks"],90)
        self.assertEqual(original["snapshot"]["results"][0]["obtained_marks"],50)
        self.assertEqual(len(self.client.get("/exams/1/reopen-snapshots").json()),2)

    def test_snapshot_is_read_only_in_orm_and_exam_cannot_be_deleted(self):
        self.reopen()
        snapshot=self.db.query(ExamReopenSnapshot).one()
        snapshot.reason="Altered history"
        with self.assertRaises(ValueError): self.db.commit()
        self.db.rollback()
        self.assertEqual(self.db.query(ExamReopenSnapshot).one().reason,"Correct accidentally entered marks")
        self.assertEqual(self.client.delete("/exams/1").status_code,409)

    def test_legacy_exam_without_grade_coverage_can_be_corrected_and_finalized_again(self):
        # Coverage is required at first finalization, not retroactively for a
        # legacy exam whose original finalized state is now preserved.
        self.db.query(GradeScale).delete();self.db.commit()
        self.assertEqual(self.reopen().status_code,200)
        self.assertEqual(self.db.query(ExamReopenSnapshot).one().snapshot["grade_scales"],[])
        self.assertEqual(self.client.put("/exams/1/lock").status_code,200)
        self.assertEqual(self.client.put("/exams/1/publish").status_code,200)

    def test_snapshot_history_is_scoped_to_its_school(self):
        snapshot_id=self.reopen().json()["snapshot_id"]
        self.actor.org_id=2
        self.assertEqual(self.client.get("/exams/1/reopen-snapshots").status_code,404)
        self.assertEqual(self.client.get(f"/exams/1/reopen-snapshots/{snapshot_id}").status_code,404)

    def test_snapshot_owner_foreign_key_rejects_other_school(self):
        self.reopen()
        row=self.db.query(ExamReopenSnapshot).one()
        invalid=ExamReopenSnapshot(organization_id=2,exam_id=1,created_by=1,created_at=row.created_at,
                                   reason="Cross-school mismatch",snapshot=row.snapshot,snapshot_sha256=row.snapshot_sha256)
        self.db.add(invalid)
        with self.assertRaises(IntegrityError): self.db.commit()
        self.db.rollback()
        self.assertEqual(self.db.query(ExamReopenSnapshot).count(),1)

    def test_null_marks_are_preserved_and_not_evaluated_as_passed(self):
        self.db.query(ExamResult).first().obtained_marks=None;self.db.commit()
        self.assertEqual(self.reopen().status_code,200)
        payload=self.db.query(ExamReopenSnapshot).one().snapshot
        self.assertIsNone(payload["results"][0]["obtained_marks"])
        student=next(s for s in payload["students"] if s["enrollment_id"]==self.enrollments[1])
        self.assertIsNone(student["evaluation"])

    @unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"),"Requires disposable PostgreSQL")
    def test_database_prevents_update_delete_and_truncate_of_snapshots(self):
        self.reopen();self.db.rollback()
        for sql in ("UPDATE exam_reopen_snapshots SET reason='changed'","DELETE FROM exam_reopen_snapshots","TRUNCATE exam_reopen_snapshots"):
            with self.subTest(sql=sql), self.assertRaises(IntegrityError): self.db.execute(text(sql))
            self.db.rollback()
            self.assertEqual(self.db.query(ExamReopenSnapshot).count(),1)

    @unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"),"Requires disposable PostgreSQL")
    def test_concurrent_reopen_creates_one_snapshot(self):
        self.db.rollback();barrier=Barrier(2)
        def run():
            with Session(self.engine) as db:
                barrier.wait(timeout=10)
                try: reopen_exam(db,self.actor,1,"Concurrent correction");return 200
                except HTTPException as exc:return exc.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(run),pool.submit(run)]
            self.assertEqual(sorted(f.result(timeout=15) for f in futures),[200,409])
        self.assertEqual(self.db.query(ExamReopenSnapshot).count(),1)

    @unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"),"Requires disposable PostgreSQL")
    def test_waiting_mark_save_cannot_cross_a_publication(self):
        self.db.get(Exam,1).is_locked=False;self.db.get(Exam,1).is_published=False;self.db.commit();self.db.rollback()
        started=Event()
        def save():
            with Session(self.engine) as db:
                started.set()
                try:
                    exams_results.create_exam_result(ExamResultCreate(exam_paper_id=1,student_enrollment_id=self.enrollments[1],obtained_marks=99),db,self.actor,SimpleNamespace(id=1))
                    return 201
                except HTTPException as exc:return exc.status_code
        with Session(self.engine) as publisher, ThreadPoolExecutor(max_workers=1) as pool:
            exam=lock_exam_record(publisher,1,1)
            future=pool.submit(save)
            self.assertTrue(started.wait(timeout=5))
            exam.is_published=True;publisher.commit()
            self.assertEqual(future.result(timeout=15),409)
        self.assertEqual({row[-1] for row in self.marks()},{50})

    @unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"),"Requires disposable PostgreSQL")
    def test_snapshot_and_status_are_only_visible_together_at_commit(self):
        self.db.rollback();inserted=Event();release=Event()
        def pause(*_args):
            inserted.set()
            if not release.wait(timeout=10): raise RuntimeError("Snapshot test timed out")
        def run():
            with Session(self.engine) as db: return reopen_exam(db,self.actor,1,"Atomic visibility")
        event.listen(ExamReopenSnapshot,"after_insert",pause)
        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                future=pool.submit(run)
                try:
                    self.assertTrue(inserted.wait(timeout=5))
                    with Session(self.engine) as observer:
                        self.assertEqual(observer.query(ExamReopenSnapshot).count(),0)
                        self.assertTrue(observer.get(Exam,1).is_locked)
                        self.assertTrue(observer.get(Exam,1).is_published)
                finally: release.set()
                future.result(timeout=15)
        finally: event.remove(ExamReopenSnapshot,"after_insert",pause)
        self.assertFalse(self.db.get(Exam,1).is_locked)
        self.assertEqual(self.db.query(ExamReopenSnapshot).count(),1)
