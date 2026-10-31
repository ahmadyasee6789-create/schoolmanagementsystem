"""Student profile integration tests against real routes and a disposable SQLite DB."""
import io
import os
import unittest
from contextlib import redirect_stdout
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

with patch.dict(os.environ, {"DATABASE_URL": "sqlite://"}), redirect_stdout(io.StringIO()):
    from app.routers import students, exams_results, exam_papers

import app.models
from app.db.base import Base
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.student_enrollment import StudentEnrollment
from app.models.students import Student
from app.models.users import Organization, OrganizationMember, User
from app.models.exams import Term, Subject, Exam, ExamPaper, ExamResult, GradeScale


class StudentDetailsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([Organization(id=1, name="Example School"), Organization(id=2, name="Other School"),
                         User(id=1, full_name="School Admin", email="admin@example.com")])
        self.db.flush()
        self.db.add_all([
            OrganizationMember(id=1, organization_id=1, user_id=1, role="admin"),
            AcademicSession(id=1, name="2026–27", organization_id=1, is_active=True, start_date=date(2026, 1, 1), end_date=date(2027, 12, 31)),
            AcademicSession(id=2, name="2025–26", organization_id=1, is_active=False, start_date=date(2025, 1, 1), end_date=date(2025, 12, 31)),
            AcademicSession(id=3, name="Other session", organization_id=2, is_active=True, start_date=date(2026, 1, 1), end_date=date(2027, 12, 31)),
            Grade(id=1, organization_id=1, name="Grade 5"),
            Student(id=1, organization_id=1, admission_no="ADM-001", first_name="Ayesha", last_name="Khan", gender="female", date_of_birth=date(2015, 4, 12), phone="03001234567", email="ayesha@example.com", father_name="Imran Khan", father_phone="03007654321", mother_name="Sara Khan", guardian_name="Imran Khan", guardian_phone="03007654321", is_active=True),
            Student(id=2, organization_id=2, admission_no="OTHER-001", first_name="Private", last_name="Student"),
            Student(id=3, organization_id=1, admission_no="ADM-003", first_name="Single", last_name=None),
        ])
        self.db.flush()
        self.db.add(Classroom(id=1, organization_id=1, grade_id=1, section="A", academic_year_id=1))
        self.db.flush()
        self.db.add_all([
            StudentEnrollment(id=1, student_id=1, session_id=1, classroom_id=1, roll_number="007", discount_percent=12.5, enrollment_date=date(2026, 4, 1), is_active=True),
            StudentEnrollment(id=2, student_id=1, session_id=2, classroom_id=None, roll_number="OLD", discount_percent=99, enrollment_date=date(2025, 4, 1), is_active=False),
        ])
        self.db.commit()
        self.current_user = SimpleNamespace(id=1, org_id=1, org_role="admin")
        self.app = FastAPI()
        self.app.include_router(students.router)
        self.app.include_router(exams_results.router)
        self.app.include_router(exam_papers.router)
        self.app.dependency_overrides[students.get_db] = lambda: self.db
        self.app.dependency_overrides[students.get_current_user] = lambda: self.current_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def test_details_use_active_session_and_real_grade_section(self):
        response = self.client.get("/students/1/details")
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["admission_no"], "ADM-001")
        self.assertEqual(data["active_session"], {"id": 1, "name": "2026–27"})
        enrollment = data["current_enrollment"]
        self.assertEqual(enrollment["class_name"], "Grade 5 – A")
        self.assertEqual(enrollment["grade_name"], "Grade 5")
        self.assertEqual(enrollment["section"], "A")
        self.assertEqual(enrollment["roll_number"], "007")
        self.assertEqual(enrollment["discount_percent"], 12.5)

    def test_missing_enrollment_and_nullable_surname(self):
        response = self.client.get("/students/3/details")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["last_name"])
        self.assertIsNone(response.json()["current_enrollment"])
        self.assertEqual(response.json()["active_session"]["id"], 1)

    def test_profile_remains_available_without_active_session(self):
        self.db.get(AcademicSession, 1).is_active = False
        self.db.commit()
        response = self.client.get("/students/1/details")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["active_session"])
        self.assertIsNone(response.json()["current_enrollment"])

    def test_inactive_enrollment_and_missing_classroom(self):
        enrollment = self.db.get(StudentEnrollment, 1)
        enrollment.is_active = False
        enrollment.classroom_id = None
        enrollment.withdrawal_date = date(2026, 5, 1)
        self.db.commit()
        data = self.client.get("/students/1/details").json()["current_enrollment"]
        self.assertFalse(data["is_active"])
        self.assertIsNone(data["class_name"])
        self.assertEqual(data["withdrawal_date"], "2026-05-01")

    def test_partial_update_persists_and_keeps_enrollment(self):
        response = self.client.put("/students/1", json={"first_name": "  Ayesha Updated  ", "email": None, "last_name": None, "is_active": False})
        self.assertEqual(response.status_code, 200, response.text)
        data = self.client.get("/students/1/details").json()
        self.assertEqual(data["first_name"], "Ayesha Updated")
        self.assertIsNone(data["email"])
        self.assertIsNone(data["last_name"])
        self.assertFalse(data["is_active"])
        self.assertEqual(data["father_name"], "Imran Khan")
        self.assertEqual(data["current_enrollment"]["roll_number"], "007")
        self.assertEqual(self.client.get("/students").json()["items"][0]["first_name"], "Ayesha Updated")

    def test_update_rejects_invalid_fields(self):
        for field, value in [("first_name", "  "), ("first_name", None), ("first_name", "x" * 101), ("email", "not-an-email"), ("date_of_birth", "2026-02-30"), ("date_of_birth", "2999-01-01"), ("phone", "1" * 21), ("is_active", None)]:
            with self.subTest(field=field, value=value):
                response = self.client.put("/students/1", json={field: value})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()["detail"][0]["loc"], ["body", field])
        self.assertEqual(self.db.get(Student, 1).first_name, "Ayesha")

    def test_org_and_enrollment_fields_cannot_be_overridden(self):
        response = self.client.put("/students/1?org_id=2", json={"organization_id": 2, "org_id": 2, "classroom_id": 999, "session_id": 3, "roll_number": "BAD", "discount_percent": 100, "first_name": "Allowed"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["organization_id"], 1)
        enrollment = self.db.get(StudentEnrollment, 1)
        self.assertEqual(enrollment.classroom_id, 1)
        self.assertEqual(enrollment.session_id, 1)
        self.assertEqual(enrollment.roll_number, "007")
        self.assertEqual(enrollment.discount_percent, 12.5)

    def test_foreign_and_missing_students_are_not_accessible(self):
        for student_id in [2, 9999]:
            for suffix in ["", "/details"]:
                self.assertEqual(self.client.get(f"/students/{student_id}{suffix}?org_id=2").status_code, 404)
            self.assertEqual(self.client.put(f"/students/{student_id}", json={"organization_id": 1, "first_name": "Forbidden"}).status_code, 404)
        self.assertEqual(self.db.get(Student, 2).first_name, "Private")

    def test_read_only_role_cannot_update(self):
        self.current_user.org_role = "viewer"
        self.assertEqual(self.client.put("/students/1", json={"first_name": "Forbidden"}).status_code, 403)

    def test_authentication_is_still_required(self):
        self.app.dependency_overrides.pop(students.get_current_user)
        self.assertIn(self.client.get("/students/1/details").status_code, [401, 403])
        self.assertIn(self.client.put("/students/1", json={"first_name": "Forbidden"}).status_code, [401, 403])

    def test_existing_results_endpoint_empty_and_tenant_scoped(self):
        self.assertEqual(self.client.get("/exam-results/student/1").json(), [])
        self.assertEqual(self.client.get("/exam-results/student/2").status_code, 404)

    def seed_results(self):
        self.db.add_all([Term(id=1, name="First term", academic_year_id=1, organization_id=1),
                         Subject(id=1, name="Mathematics", organization_id=1, session_id=1),
                         GradeScale(organization_id=1, min_percentage=80, max_percentage=100, grade="A", gpa=4.0)])
        self.db.flush()
        self.db.add(Exam(id=1, name="Midterm", start_date=date(2026, 10, 1), end_date=date(2026, 10, 10), organization_id=1, term_id=1))
        self.db.flush()
        self.db.add(ExamPaper(id=1, exam_id=1, classroom_id=1, subject_id=1, total_marks=100, pass_marks=40))
        self.db.flush()
        self.db.add(ExamResult(exam_paper_id=1, student_enrollment_id=1, obtained_marks=87))
        self.db.commit()

    def test_results_and_paper_labels_come_from_existing_endpoints(self):
        self.seed_results()
        response = self.client.get("/exam-results/student/1")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()[0]["obtained_marks"], 87)
        self.assertEqual(response.json()[0]["grade"], "A")
        papers = self.client.get("/exam-papers")
        self.assertEqual(papers.status_code, 200, papers.text)
        self.assertEqual(papers.json()[0]["exam_name"], "Midterm")
        self.assertEqual(papers.json()[0]["subject_name"], "Mathematics")


if __name__ == "__main__":
    unittest.main()
