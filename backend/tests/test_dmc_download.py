"""Synthetic DMC download regressions for the query budget and both layouts."""
from io import BytesIO
import re
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import event

import test_exam_result_entry as fixture
from app.models.exams import ExamPaper, ExamResult, GradeScale, Subject
from app.models.student_enrollment import StudentEnrollment
from app.models.users import Organization
from app.routers import dmc


class DmcDownloadTests(unittest.TestCase):
    def setUp(self):
        fixture.ExamResultEntryTests.setUp(self)

    def seed_complete_class(self):
        for enrollment in self.db.query(StudentEnrollment):
            enrollment.roll_number = str(enrollment.student_id)
            if enrollment.student_id == 4:
                enrollment.is_active = False
        self.db.add_all([
            GradeScale(organization_id=1, min_percentage=40, max_percentage=79.99, grade="B", gpa=3),
            GradeScale(organization_id=1, min_percentage=80, max_percentage=100, grade="A", gpa=4),
        ])
        for student, marks in enumerate(((85, 85, 85, 85), (85, 85, 85, 85), (0, 40, 40, 80)), 1):
            self.db.add_all(ExamResult(exam_paper_id=paper, student_enrollment_id=self.enrollments[student], obtained_marks=mark)
                            for paper, mark in enumerate(marks, 1))
        logo = BytesIO()
        Image.new("RGB", (120, 80), "#204b75").save(logo, format="PNG")
        self.db.get(Organization, 1).logo = logo.getvalue()
        self.db.commit()
        self.db.expunge_all()

    def download(self, layout, session=1):
        return dmc.bulk_dmc(1, 1, layout, self.db, self.actor, SimpleNamespace(id=session, name="2026-27"))

    def test_both_layouts_use_six_queries_and_preserve_marks_grades_and_ranks(self):
        self.seed_complete_class()
        queries = []

        def record(_conn, _cursor, statement, _params, _context, _many):
            queries.append(statement)

        event.listen(self.engine, "before_cursor_execute", record)
        try:
            for layout, method, pages in ((2, "generate_bulk_dmc", 2), (3, "generate_bulk_dmc_three", 1)):
                with self.subTest(layout=layout):
                    queries.clear()
                    with patch.object(dmc, method, wraps=getattr(dmc, method)) as render:
                        response = self.download(layout)
                    self.assertEqual(len(queries), 6)
                    self.assertEqual(response.media_type, "application/pdf")
                    self.assertTrue(response.body.startswith(b"%PDF-"))
                    self.assertEqual(len(re.findall(rb"/Type\s*/Page\b", response.body)), pages)
                    self.assertIn(b"/Subtype /Image", response.body)
                    _, meta, students = render.call_args.args
                    self.assertIsNotNone(meta["logo_image"])
                    self.assertEqual([(s["grade"], s["position"], s["result"]) for s in students],
                                     [("A", 1, "PASSED"), ("A", 1, "PASSED"), ("B", 3, "PASSED")])
                    self.assertEqual(students[2]["subjects"][0]["obtained"], 0)
        finally:
            event.remove(self.engine, "before_cursor_execute", record)

    def test_missing_marks_report_the_subject_before_rendering(self):
        with patch.object(dmc, "generate_bulk_dmc") as render, self.assertRaises(HTTPException) as raised:
            self.download(2)
        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("Subject 1", raised.exception.detail)
        render.assert_not_called()

    def test_http_downloads_render_both_layouts_with_up_to_twelve_subjects(self):
        self.seed_complete_class()
        app = FastAPI()
        app.include_router(dmc.router)
        app.dependency_overrides[dmc.get_db] = lambda: self.db
        app.dependency_overrides[dmc.get_current_user] = lambda: self.actor
        app.dependency_overrides[dmc.get_active_session] = lambda: SimpleNamespace(id=1, name="2026-27")

        with TestClient(app) as client:
            for subject_count in (4, 12):
                if subject_count == 12:
                    self.db.add_all(Subject(id=i, name=f"Mathematics and General Science {i}",
                                            organization_id=1, session_id=1) for i in range(5, 13))
                    self.db.flush()
                    self.db.add_all(ExamPaper(id=i, exam_id=1, classroom_id=1, subject_id=i,
                                              total_marks=100, pass_marks=40) for i in range(5, 13))
                    self.db.flush()
                    self.db.add_all(ExamResult(exam_paper_id=i, student_enrollment_id=self.enrollments[student],
                                                obtained_marks=85)
                                    for student in range(1, 4) for i in range(5, 13))
                    self.db.commit()
                    self.db.expunge_all()
                for layout, pages in ((2, 2), (3, 1)):
                    with self.subTest(subjects=subject_count, layout=layout):
                        response = client.get(f"/dmc/exam/1/class/1?layout={layout}")
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response.headers["content-type"], "application/pdf")
                        self.assertIn(".pdf", response.headers["content-disposition"])
                        self.assertTrue(response.content.startswith(b"%PDF-"))
                        self.assertEqual(len(re.findall(rb"/Type\s*/Page\b", response.content)), pages)

    def test_other_session_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            self.download(2, session=2)
        self.assertEqual(raised.exception.status_code, 404)
