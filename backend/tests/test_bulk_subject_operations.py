"""Existing subject APIs and new bulk operations on disposable PostgreSQL only."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import os
from threading import Barrier
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import test_fee_integrity as fixture
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.exams import ClassSubject, Exam, ExamPaper, ExamResult, Subject, Term
from app.models.users import OrganizationMember, User
from app.routers import classes, subjects
from app.schemas.subjects import BulkClassSubjectsCreate, BulkSubjectsCreate, SubjectCreate, SubjectUpdate
from app.services.subject_management import assign_subjects, bulk_create_subjects, mutate_subject

NAMES = ["Mathematics", "English", "Urdu", "Science", "Computer", "Islamiat", "Social Studies"]


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Requires guarded disposable PostgreSQL")
class BulkSubjectOperationsTests(unittest.TestCase):
    def setUp(self):
        fixture.FeeIntegrityTests.setUp(self)
        self.actor.org_role = "admin"
        self.active = SimpleNamespace(id=1)
        self.db.get(Grade, 1).name = "Grade 5"
        self.db.add_all([
            AcademicSession(id=3, name="Earlier year", organization_id=1, is_active=False,
                            start_date=date(2025, 4, 1), end_date=date(2026, 3, 31)),
            Grade(id=2, name="Private grade", organization_id=2),
            User(id=2, full_name="Fixture Teacher", email="teacher@example.invalid"),
        ])
        self.db.flush()
        self.db.add_all([
            Classroom(id=2, organization_id=2, grade_id=2, section="A", academic_year_id=2),
            Classroom(id=3, organization_id=1, grade_id=1, section="OLD", academic_year_id=3),
            OrganizationMember(id=2, organization_id=1, user_id=2, role="teacher"),
        ])
        self.db.commit()
        app = FastAPI()
        app.include_router(subjects.router)
        app.include_router(classes.router)
        app.dependency_overrides[subjects.get_db] = lambda: self.db
        app.dependency_overrides[subjects.get_current_user] = lambda: self.actor
        app.dependency_overrides[subjects.get_active_session] = lambda: self.active
        self.app = app
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def seed(self, names=NAMES, org_id=1, session_id=1):
        rows = [Subject(name=name, organization_id=org_id, session_id=session_id) for name in names]
        self.db.add_all(rows)
        self.db.commit()
        return [row.id for row in rows]

    def create(self, names=NAMES):
        return self.client.post("/subjects/bulk", json={"names": names})

    def assign(self, ids, classroom_id=1):
        return self.client.post("/subjects/assign-to-class/bulk", json={"classroom_id": classroom_id, "subject_ids": ids})

    def test_seven_subjects_in_one_request_and_repeated_request_is_safe(self):
        first = self.create()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual((first.json()["created_count"], first.json()["skipped_count"]), (7, 0))
        ids = [row["id"] for row in first.json()["created"]]
        second = self.create()
        self.assertEqual((second.json()["created_count"], second.json()["skipped_count"]), (0, 7))
        self.assertEqual([row.id for row in self.db.query(Subject).order_by(Subject.id)], ids)

    def test_whitespace_and_case_insensitive_duplicates_inside_request(self):
        response = self.create([" English ", "english", "ENGLISH", " Science "])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()["created_count"], response.json()["skipped_count"]), (2, 2))
        self.assertEqual([row.name for row in self.db.query(Subject).order_by(Subject.id)], ["English", "Science"])

    def test_existing_subject_keeps_its_original_name_and_id(self):
        original = self.seed([" English "])[0]
        response = self.create(["ENGLISH", "Urdu"])
        self.assertEqual((response.json()["created_count"], response.json()["skipped_count"]), (1, 1))
        self.assertEqual(self.db.get(Subject, original).name, " English ")

    def test_legacy_whitespace_names_are_not_rewritten_or_hidden(self):
        original = self.seed(["   "])[0]
        self.assertEqual(self.client.get("/subjects").status_code, 200)
        self.assertEqual(self.create(["English"]).status_code, 200)
        self.assertEqual(self.db.get(Subject, original).name, "   ")

    def test_subject_names_remain_scoped_to_school_and_active_session(self):
        self.seed(["English"], org_id=2, session_id=2)
        self.seed(["English"], session_id=3)
        self.assertEqual(self.create(["English"]).json()["created_count"], 1)
        self.assertEqual(len(self.client.get("/subjects").json()), 1)

    def test_invalid_name_or_extra_ownership_input_rejects_entire_request(self):
        for payload in ({"names": ["English", " "]}, {"names": ["English", "x" * 101]},
                        {"names": []}, {"names": ["English"], "organization_id": 2},
                        {"names": ["English"], "session_id": 3}):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/subjects/bulk", json=payload).status_code, 422)
                self.assertEqual(self.db.query(Subject).count(), 0)

    def test_only_admin_can_use_bulk_operations_and_login_is_required(self):
        ids = self.seed()
        for role in ("teacher", "manager", "accountant", "viewer", None):
            self.actor.org_role = role
            self.assertEqual(self.create().status_code, 403)
            self.assertEqual(self.assign(ids).status_code, 403)
        self.app.dependency_overrides.pop(subjects.get_current_user)
        self.assertIn(self.create().status_code, (401, 403))
        self.assertIn(self.assign(ids).status_code, (401, 403))
        self.assertEqual(self.db.query(ClassSubject).count(), 0)

    def test_assign_seven_to_grade_five_a_and_repeating_skips_all(self):
        ids = self.seed()
        response = self.assign(ids)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()["assigned_count"], response.json()["skipped_count"]), (7, 0))
        again = self.assign(ids)
        self.assertEqual((again.json()["assigned_count"], again.json()["skipped_count"]), (0, 7))
        rows = self.client.get("/subjects/assignments").json()
        self.assertEqual(len(rows), 7)
        self.assertEqual({row["classroom_name"] for row in rows}, {"Grade 5"})
        self.assertEqual({row["section"] for row in rows}, {"A"})

    def test_duplicate_ids_and_existing_teachers_are_preserved(self):
        ids = self.seed()
        existing = ClassSubject(classroom_id=1, subject_id=ids[0], teacher_member_id=2)
        self.db.add(existing)
        self.db.commit()
        original_id = existing.id
        response = self.assign([ids[0], ids[0], ids[1]])
        self.assertEqual((response.json()["assigned_count"], response.json()["skipped_count"]), (1, 2))
        self.db.refresh(existing)
        self.assertEqual((existing.id, existing.teacher_member_id), (original_id, 2))

    def test_foreign_or_wrong_session_subjects_and_classes_reject_all_assignments(self):
        ids = self.seed()
        foreign = self.seed(["Private"], org_id=2, session_id=2)[0]
        old = self.seed(["Earlier"], session_id=3)[0]
        for selected, classroom in (([ids[0], foreign], 1), ([ids[0], old], 1), ([ids[0], 99999], 1), (ids, 2), (ids, 3)):
            with self.subTest(selected=selected, classroom=classroom):
                self.assertEqual(self.assign(selected, classroom).status_code, 404)
                self.assertEqual(self.db.query(ClassSubject).count(), 0)
        self.actor.org_id = 2
        self.assertEqual(self.assign(ids).status_code, 404)

    def test_invalid_assignment_payload_makes_no_changes(self):
        ids = self.seed()
        for payload in ({"classroom_id": 1, "subject_ids": []}, {"classroom_id": 1, "subject_ids": [ids[0], 0]},
                        {"classroom_id": 1, "subject_ids": [True]}, {"classroom_id": 1, "subject_ids": ids, "organization_id": 2}):
            self.assertEqual(self.client.post("/subjects/assign-to-class/bulk", json=payload).status_code, 422)
            self.assertEqual(self.db.query(ClassSubject).count(), 0)

    def test_database_unique_constraint_remains_the_assignment_backstop(self):
        ids = self.seed()
        self.assign(ids)
        self.db.add(ClassSubject(classroom_id=1, subject_id=ids[0]))
        with self.assertRaises(IntegrityError): self.db.commit()
        self.db.rollback()
        self.assertEqual(self.db.query(ClassSubject).count(), 7)

    def test_commit_failures_roll_back_both_bulk_operations(self):
        with patch.object(self.db, "commit", side_effect=RuntimeError("Synthetic failure")):
            with self.assertRaises(RuntimeError): self.create()
        self.assertEqual(self.db.query(Subject).count(), 0)
        ids = self.seed()
        with patch.object(self.db, "commit", side_effect=RuntimeError("Synthetic failure")):
            with self.assertRaises(RuntimeError): self.assign(ids)
        self.assertEqual(self.db.query(ClassSubject).count(), 0)

    def race(self, operation):
        self.db.rollback()
        barrier = Barrier(2)
        def invoke(index):
            with Session(self.engine) as db:
                barrier.wait(timeout=10)
                try: return operation(db, index)
                except HTTPException as error: return error.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(invoke, range(2)))

    def test_concurrent_subject_requests_create_one_set(self):
        request = BulkSubjectsCreate(names=NAMES)
        counts = self.race(lambda db, _: bulk_create_subjects(db, self.actor, self.active, request).created_count)
        self.assertEqual(sorted(counts), [0, 7])
        self.assertEqual(self.db.query(Subject).count(), 7)

    def test_concurrent_single_and_bulk_subject_creation_share_the_same_lock(self):
        def create(db, index):
            if index: return bulk_create_subjects(db, self.actor, self.active, BulkSubjectsCreate(names=NAMES)).created_count
            return mutate_subject(db, self.actor, self.active, SubjectCreate(name=" english ")).id
        self.race(create)
        self.assertEqual(self.db.query(Subject).count(), 7)
        self.assertEqual(sum(row.name.strip().lower() == "english" for row in self.db.query(Subject)), 1)

    def test_concurrent_assignments_create_one_set(self):
        ids = self.seed()
        counts = self.race(lambda db, _: assign_subjects(db, self.actor, self.active, ids, 1, bulk=True).assigned_count)
        self.assertEqual(sorted(counts), [0, 7])
        self.assertEqual(self.db.query(ClassSubject).count(), 7)

    def test_single_subject_crud_and_assignment_remain_compatible(self):
        self.actor.org_role = "manager"
        created = self.client.post("/subjects", json={"name": " English "})
        self.assertEqual(created.status_code, 200, created.text)
        subject_id = created.json()["id"]
        self.assertEqual(self.client.put(f"/subjects/{subject_id}", json={"name": "Literature"}).status_code, 200)
        self.assertEqual(self.client.get(f"/subjects/{subject_id}").json()["name"], "Literature")
        self.assertEqual(self.client.post("/subjects/assign-to-class", json={"classroom_id": 1, "subject_id": subject_id, "teacher_member_id": 2}).status_code, 200)
        self.actor.org_role = "admin"
        self.assertEqual(self.client.delete(f"/subjects/{subject_id}").status_code, 400)
        spare = self.client.post("/subjects", json={"name": "Unused"}).json()["id"]
        self.assertEqual(self.client.delete(f"/subjects/{spare}").status_code, 200)

    def test_single_rename_cannot_create_a_case_insensitive_duplicate(self):
        ids = self.seed(["English", "Urdu"])
        self.assertEqual(self.client.put(f"/subjects/{ids[1]}", json={"name": " ENGLISH "}).status_code, 400)
        self.assertEqual(self.db.get(Subject, ids[1]).name, "Urdu")

    def test_existing_papers_and_results_remain_unchanged(self):
        ids = self.seed()
        self.db.add(Term(id=1, name="First term", organization_id=1, academic_year_id=1))
        self.db.flush()
        self.db.add(Exam(id=1, name="Final", term_id=1, organization_id=1, start_date=date(2026, 11, 1), end_date=date(2026, 11, 9)))
        self.db.flush()
        paper = ExamPaper(exam_id=1, classroom_id=1, subject_id=ids[0], total_marks=100, pass_marks=40)
        self.db.add(paper)
        self.db.flush()
        self.db.add(ExamResult(exam_paper_id=paper.id, student_enrollment_id=1, obtained_marks=82))
        self.db.commit()
        def records(model):
            return [{column.name: getattr(row, column.name) for column in model.__table__.columns} for row in self.db.query(model).order_by(model.id)]
        before = {model: records(model) for model in (ExamPaper, ExamResult)}
        self.assertEqual(self.client.delete(f"/subjects/{ids[0]}").status_code, 409)
        self.create(["Art", "English"])
        self.assign(ids)
        for model, data in before.items(): self.assertEqual(records(model), data)
        self.assertEqual(self.client.delete(f"/subjects/{ids[0]}").status_code, 400)

    def test_classroom_list_can_be_scoped_to_the_selected_session(self):
        self.assertEqual([row["id"] for row in self.client.get("/classes?session_id=1").json()], [1])
        self.assertEqual(self.client.get("/classes?session_id=2").status_code, 404)
        self.assertEqual({row["id"] for row in self.client.get("/classes").json()}, {1, 3})
