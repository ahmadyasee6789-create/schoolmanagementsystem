"""Exam form requests against synthetic, isolated database fixtures only."""
from datetime import date
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

import test_fee_integrity as fixture
from app.models.exams import Exam, Term
from app.routers import exams


class ExamUpdateValidationTests(unittest.TestCase):
    def setUp(self):
        fixture.FeeIntegrityTests.setUp(self)
        self.actor.org_role = "admin"
        self.db.add(Term(id=3, name="First Term", academic_year_id=1, organization_id=1))
        self.db.flush()
        self.exam = Exam(
            id=1, name="Existing Examination", term_id=3, organization_id=1,
            start_date=date(2026, 10, 1), end_date=date(2026, 10, 7), weightage=0.5,
            is_locked=False, is_published=False,
        )
        self.db.add(self.exam)
        self.db.commit()
        app = FastAPI()
        app.include_router(exams.router)
        app.dependency_overrides[exams.get_db] = lambda: self.db
        app.dependency_overrides[exams.get_current_user] = lambda: self.actor
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.form = {
            "name": "First Term Examination", "start_date": "2026-10-26",
            "end_date": "2026-12-26", "weightage": 0, "term_id": 3,
        }

    def test_edit_accepts_the_form_without_lifecycle_fields(self):
        response = self.client.put("/exams/1", json=self.form)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual({key: response.json()[key] for key in self.form}, self.form)
        self.assertFalse(response.json()["is_locked"])
        self.assertFalse(response.json()["is_published"])
        self.db.refresh(self.exam)
        self.assertEqual(self.exam.weightage, 0)

    def test_partial_edit_preserves_omitted_fields(self):
        response = self.client.put("/exams/1", json={"name": "Corrected Name"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["name"], "Corrected Name")
        self.assertEqual(response.json()["start_date"], "2026-10-01")
        self.assertEqual(response.json()["end_date"], "2026-10-07")
        self.assertEqual(response.json()["weightage"], 0.5)
        self.assertEqual(response.json()["term_id"], 3)

    def test_create_also_accepts_the_form_without_lifecycle_fields(self):
        response = self.client.post("/exams", json=self.form)
        self.assertEqual(response.status_code, 201, response.text)
        self.assertFalse(response.json()["is_locked"])
        self.assertFalse(response.json()["is_published"])

    def test_edit_cannot_publish_or_lock_using_legacy_status_fields(self):
        response = self.client.put("/exams/1", json={
            **self.form, "is_locked": True, "is_published": True,
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.db.refresh(self.exam)
        self.assertFalse(self.exam.is_locked)
        self.assertFalse(self.exam.is_published)

    def test_status_fields_cannot_bypass_locked_or_published_protection(self):
        for locked, published in ((True, False), (False, True), (True, True)):
            with self.subTest(locked=locked, published=published):
                self.exam.is_locked, self.exam.is_published = locked, published
                self.db.commit()
                response = self.client.put("/exams/1", json={
                    **self.form, "is_locked": False, "is_published": False,
                })
                self.assertEqual(response.status_code, 409, response.text)
                self.db.refresh(self.exam)
                self.assertEqual((self.exam.is_locked, self.exam.is_published), (locked, published))
                self.assertEqual(self.exam.name, "Existing Examination")

    def test_another_school_cannot_edit_the_exam(self):
        self.actor.org_id = 2
        response = self.client.put("/exams/1", json=self.form)
        self.assertEqual(response.status_code, 404, response.text)
        self.db.refresh(self.exam)
        self.assertEqual(self.exam.name, "Existing Examination")


if __name__ == "__main__":
    unittest.main()
