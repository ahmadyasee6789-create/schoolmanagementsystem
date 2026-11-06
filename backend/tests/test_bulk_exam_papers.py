"""Bulk paper write regressions using a guarded disposable PostgreSQL database."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import os
from threading import Barrier
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import test_fee_integrity as fixture
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.exams import ClassSubject, Exam, ExamPaper, Subject, Term
from app.models.users import OrganizationMember
from app.routers import exam_papers, subjects
from app.schemas.exam_paper import BulkExamPaperCreate
from app.services.bulk_exam_papers import create_bulk_exam_papers


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Requires a disposable loopback PostgreSQL test database")
class BulkExamPaperTests(unittest.TestCase):
    def setUp(self):
        fixture.FeeIntegrityTests.setUp(self)
        self.actor.org_role = "admin"
        self.db.add(AcademicSession(id=3, name="Earlier session", organization_id=1, is_active=False,
                                    start_date=date(2025, 4, 1), end_date=date(2026, 3, 31)))
        self.db.add_all([Term(id=1, name="Term 1", organization_id=1, academic_year_id=1),
                         Term(id=2, name="Other school", organization_id=2, academic_year_id=2)])
        self.db.add_all([Subject(id=i, name=f"Subject {i}", organization_id=1, session_id=1) for i in range(1, 8)])
        self.db.add_all([Subject(id=8, name="Private subject", organization_id=2, session_id=2),
                         Subject(id=9, name="Unassigned", organization_id=1, session_id=1),
                         Subject(id=10, name="Earlier subject", organization_id=1, session_id=3),
                         Grade(id=2, name="Private grade", organization_id=2)])
        self.db.flush()
        self.db.add_all([Exam(id=1, name="Final", term_id=1, organization_id=1,
                             start_date=date(2026, 11, 1), end_date=date(2026, 11, 10)),
                         Exam(id=2, name="Private Final", term_id=2, organization_id=2,
                             start_date=date(2026, 11, 1), end_date=date(2026, 11, 10)),
                         Classroom(id=2, grade_id=2, section="A", organization_id=2, academic_year_id=2),
                         Classroom(id=3, grade_id=1, section="B", organization_id=1, academic_year_id=3)])
        self.db.flush()
        self.db.add_all(ClassSubject(classroom_id=1, subject_id=i) for i in range(1, 8))
        self.db.add(ClassSubject(classroom_id=2, subject_id=8))
        self.db.commit()
        self.active = SimpleNamespace(id=1)
        app = FastAPI()
        app.include_router(exam_papers.router)
        app.include_router(subjects.router)
        app.dependency_overrides[exam_papers.get_db] = lambda: self.db
        app.dependency_overrides[exam_papers.get_current_user] = lambda: self.actor
        app.dependency_overrides[exam_papers.get_active_session] = lambda: self.active
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.request = dict(exam_id=1, classroom_id=1, papers=[
            dict(subject_id=i, total_marks=100, pass_marks=40) for i in range(1, 8)
        ])

    def bulk(self, request=None):
        return self.client.post("/exam-papers/bulk", json=self.request if request is None else request)

    def rows(self):
        return [(row.id, row.exam_id, row.classroom_id, row.subject_id, row.total_marks, row.pass_marks)
                for row in self.db.query(ExamPaper).order_by(ExamPaper.id)]

    def test_seven_papers_are_created_in_one_request(self):
        response = self.bulk()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["created_count"], 7)
        self.assertEqual(response.json()["skipped_count"], 0)
        self.assertEqual(len(self.rows()), 7)
        self.assertEqual([row["subject_name"] for row in response.json()["created"]], [f"Subject {i}" for i in range(1, 8)])
        self.assertEqual({row["classroom_name"] for row in response.json()["created"]}, {"Test Grade A"})

    def test_existing_papers_are_skipped_without_modification(self):
        self.db.add_all([ExamPaper(exam_id=1, classroom_id=1, subject_id=i, total_marks=75, pass_marks=30)
                         for i in (1, 2)])
        self.db.commit()
        before = self.rows()
        response = self.bulk()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["created_count"], 5)
        self.assertEqual(response.json()["skipped_count"], 2)
        self.assertEqual(self.rows()[:2], before)
        self.assertEqual({paper["total_marks"] for paper in response.json()["skipped"]}, {75})

    def test_repeated_submission_creates_no_duplicates(self):
        self.assertEqual(self.bulk().status_code, 200)
        before = self.rows()
        response = self.bulk()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()["created_count"], response.json()["skipped_count"]), (0, 7))
        self.assertEqual(self.rows(), before)

    def test_legacy_incomplete_paper_cannot_cause_a_response_failure_after_commit(self):
        self.db.add(ExamPaper(exam_id=1, classroom_id=1, subject_id=1, total_marks=None, pass_marks=None))
        self.db.commit()
        before = self.rows()
        response = self.bulk()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.rows(), before)

    def test_invalid_marks_in_any_row_reject_the_entire_batch(self):
        for total, passing in ((0, 0), (-1, 0), (100, -1), (40, 41), (100.5, 40), (True, 0)):
            with self.subTest(total=total, passing=passing):
                request = {**self.request, "papers": [*self.request["papers"][:-1],
                    dict(subject_id=7, total_marks=total, pass_marks=passing)]}
                response = self.bulk(request)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(self.rows(), [])

    def test_duplicate_subjects_empty_and_excessive_batches_are_rejected(self):
        for papers in ([], [self.request["papers"][0]] * 2, [self.request["papers"][0]] * 201):
            response = self.bulk({**self.request, "papers": papers})
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(self.rows(), [])

    def test_unassigned_or_foreign_subject_rolls_back_the_entire_batch(self):
        for subject_id in (8, 9, 10, 999):
            with self.subTest(subject_id=subject_id):
                response = self.bulk({**self.request, "papers": [self.request["papers"][0],
                    dict(subject_id=subject_id, total_marks=100, pass_marks=40)]})
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(self.rows(), [])

    def test_locked_and_published_exams_cannot_receive_papers(self):
        for locked, published in ((True, False), (False, True), (True, True)):
            with self.subTest(locked=locked, published=published):
                exam = self.db.get(Exam, 1)
                exam.is_locked, exam.is_published = locked, published
                self.db.commit()
                response = self.bulk()
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(self.rows(), [])

    def test_only_administrators_can_create_multiple_papers(self):
        for role in ("teacher", "manager", "accountant", "viewer", None):
            self.actor.org_role = role
            response = self.bulk()
            self.assertEqual(response.status_code, 403, response.text)
            self.assertEqual(self.rows(), [])

    def test_unauthenticated_request_is_rejected(self):
        self.client.app.dependency_overrides.pop(exam_papers.get_current_user)
        self.assertIn(self.bulk().status_code, (401, 403))
        self.assertEqual(self.rows(), [])

    def test_school_and_session_ownership(self):
        for changes in ({"exam_id": 2}, {"classroom_id": 2}, {"classroom_id": 3}, {"exam_id": 999}):
            response = self.bulk({**self.request, **changes})
            self.assertEqual(response.status_code, 404, response.text)
            self.assertEqual(self.rows(), [])
        self.active.id = 2
        self.assertEqual(self.bulk().status_code, 404)
        self.active.id = 1
        self.actor.org_id = 2
        self.assertEqual(self.bulk().status_code, 404)
        self.assertEqual(self.rows(), [])

    def test_foreign_or_wrong_session_assignments_do_not_authorize_a_subject(self):
        for subject_id in (8, 10):
            self.db.add(ClassSubject(classroom_id=1, subject_id=subject_id))
        self.db.commit()
        for subject_id in (8, 10):
            response = self.bulk({**self.request, "papers": [dict(subject_id=subject_id, total_marks=100, pass_marks=40)]})
            self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.rows(), [])

    def test_failure_after_insert_rolls_back_every_paper(self):
        def fail_after_insert(*_args):
            raise RuntimeError("Synthetic insert failure")
        event.listen(ExamPaper, "after_insert", fail_after_insert)
        try:
            with self.assertRaisesRegex(RuntimeError, "Synthetic insert failure"):
                self.bulk()
        finally:
            event.remove(ExamPaper, "after_insert", fail_after_insert)
        self.assertEqual(self.rows(), [])

    def test_failed_commit_rolls_back_every_paper(self):
        with patch.object(self.db, "commit", side_effect=RuntimeError("Synthetic commit failure")):
            with self.assertRaisesRegex(RuntimeError, "Synthetic commit failure"):
                self.bulk()
        self.assertEqual(self.rows(), [])

    def test_concurrent_submissions_skip_the_winning_batch(self):
        request = BulkExamPaperCreate.model_validate(self.request)
        self.db.rollback()
        barrier = Barrier(2)
        def create():
            with Session(self.engine) as db:
                barrier.wait(timeout=10)
                return create_bulk_exam_papers(db, self.actor, request, SimpleNamespace(id=1))
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: create(), range(2)))
        self.assertEqual(sorted((result["created_count"], result["skipped_count"]) for result in results), [(0, 7), (7, 0)])
        self.assertEqual(len(self.rows()), 7)

    def test_existing_database_constraint_rejects_duplicate_papers(self):
        self.bulk()
        self.db.add(ExamPaper(exam_id=1, classroom_id=1, subject_id=1, total_marks=10, pass_marks=5))
        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()
        self.assertEqual(len(self.rows()), 7)

    def test_single_paper_creation_and_editing_still_work(self):
        response = self.client.post("/exam-papers", json={**self.request["papers"][0], "exam_id": 1, "classroom_id": 1})
        self.assertEqual(response.status_code, 201, response.text)
        paper_id = response.json()["id"]
        response = self.client.put(f"/exam-papers/{paper_id}", json={"total_marks": 80, "pass_marks": 32})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()["total_marks"], response.json()["pass_marks"]), (80, 32))
        self.assertEqual(self.bulk().json()["skipped_count"], 1)
        self.assertEqual(self.db.get(ExamPaper, paper_id).total_marks, 80)

    def test_single_paper_also_rejects_invalid_combined_marks(self):
        response = self.client.post("/exam-papers", json={"exam_id": 1, "classroom_id": 1, "subject_id": 1,
                                                         "total_marks": 40, "pass_marks": 41})
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.rows(), [])
        self.bulk()
        paper = self.db.query(ExamPaper).filter_by(subject_id=1).one()
        for changes in ({"total_marks": 30}, {"pass_marks": 101}, {"total_marks": 10, "pass_marks": 11}):
            response = self.client.put(f"/exam-papers/{paper.id}", json=changes)
            self.assertEqual(response.status_code, 422, response.text)
            self.db.refresh(paper)
            self.assertEqual((paper.total_marks, paper.pass_marks), (100, 40))

    def test_assignments_follow_authenticated_school_not_first_membership(self):
        self.db.add_all([OrganizationMember(id=1, user_id=1, organization_id=2, role="admin"),
                         OrganizationMember(id=2, user_id=1, organization_id=1, role="admin")])
        self.db.commit()
        response = self.client.get("/subjects/assignments")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual({item["subject_id"] for item in response.json()}, set(range(1, 8)))
        self.actor.org_id, self.active.id = 2, 2
        response = self.client.get("/subjects/assignments")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([item["subject_id"] for item in response.json()], [8])

    def test_assignments_exclude_wrong_session_and_foreign_subjects(self):
        self.db.add_all([ClassSubject(classroom_id=1, subject_id=8), ClassSubject(classroom_id=1, subject_id=10)])
        self.db.commit()
        response = self.client.get("/subjects/assignments")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual({item["subject_id"] for item in response.json()}, set(range(1, 8)))


if __name__ == "__main__":
    unittest.main()
