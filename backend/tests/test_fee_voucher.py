"""Voucher and ledger regression tests; all records are synthetic and in memory.

Run: python -B -m unittest discover -s tests -p test_fee_voucher.py -v
"""
import io
import os
import re
import unittest
from contextlib import contextmanager, redirect_stdout
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # Register the full relationship graph.
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.models.users import Organization
from app.services.fee_voucher_generator import generate_fee_voucher
from app.services.school_logo import MAX_LOGO_BYTES

# The application normally configures a remote database at import time.
with patch.dict(os.environ, {"DATABASE_URL": "sqlite://"}), redirect_stdout(io.StringIO()):
    from app.routers import fee_voucher as routes
    from app.routers import student_fee as fee_routes
    from app.routers import organization_profile as profile_routes


class FeeVoucherTests(unittest.TestCase):
    @staticmethod
    def logo_bytes(format="PNG", size=(160, 120)):
        output = io.BytesIO()
        Image.new("RGB", size, "#204b75").save(output, format=format)
        return output.getvalue()

    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([Organization(id=1, name="Example School"), Organization(id=2, name="Other School")])
        self.db.flush()
        self.db.add_all([
            AcademicSession(id=1, name="2026-27", organization_id=1, is_active=True, start_date=date(2026, 4, 1), end_date=date(2027, 3, 31)),
            AcademicSession(id=2, name="2026-27", organization_id=2, is_active=True, start_date=date(2026, 4, 1), end_date=date(2027, 3, 31)),
            AcademicSession(id=3, name="2025-26", organization_id=1, is_active=False, start_date=date(2025, 4, 1), end_date=date(2026, 3, 31)),
            Grade(id=1, name="Nursery", organization_id=1), Grade(id=2, name="Nursery", organization_id=2),
            Student(id=1, organization_id=1, admission_no="ST-001", first_name="Example", last_name=None, father_name="Example Parent"),
            Student(id=2, organization_id=2, admission_no="ST-002", first_name="Other", last_name="Child"),
        ])
        self.db.flush()
        self.db.add_all([
            Classroom(id=1, organization_id=1, grade_id=1, section="A", academic_year_id=1),
            Classroom(id=2, organization_id=2, grade_id=2, section="B", academic_year_id=2),
            Classroom(id=3, organization_id=1, grade_id=1, section="C", academic_year_id=3),
        ])
        self.db.flush()
        self.db.add(StudentEnrollment(student_id=1, classroom_id=1, session_id=1, is_active=True))
        self.fee = self.add_fee(month="January", monthly_fee=1000, admission_fee=500, exam_fee=200, total_amount=1700,
                                discount_amount=Decimal("100.50"), final_amount=Decimal("1599.50"))
        self.db.commit()
        self.actor = SimpleNamespace(id=1, org_id=1, org_role="admin")
        self.session = self.db.get(AcademicSession, 1)
        app = FastAPI()
        app.include_router(routes.router)
        app.include_router(fee_routes.router)
        app.include_router(profile_routes.router)
        app.dependency_overrides[routes.get_db] = lambda: self.db
        app.dependency_overrides[routes.get_current_user] = lambda: self.actor
        app.dependency_overrides[routes.get_active_session] = lambda: self.session
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def add_fee(self, **changes):
        values = dict(student_id=1, class_id=1, organization_id=1, session_id=1, month="December", monthly_fee=1000,
                      admission_fee=0, exam_fee=0, total_amount=1000, discount_amount=0, final_amount=1000, paid_amount=0)
        values.update(changes)
        fee = StudentFee(**values)
        self.db.add(fee)
        self.db.flush()
        return fee

    @contextmanager
    def legacy_invalid_amounts(self):
        """Exercise voucher defenses against pre-migration corruption only."""
        self.db.execute(text("PRAGMA ignore_check_constraints=ON"))
        try:
            yield
        finally:
            self.db.execute(text("PRAGMA ignore_check_constraints=OFF"))

    def voucher(self, fee_id=None, **kwargs):
        return self.client.get(f"/fees/{fee_id or self.fee.id}/voucher", params={"due_date": "2027-01-10"}, **kwargs)

    def bulk_voucher(self, **changes):
        params = dict(class_id=1, month="January", due_date="2027-01-10")
        params.update(changes)
        return self.client.get("/fees/vouchers/bulk", params=params)

    def add_class_student(self, student_id, paid=0, enrolled=True):
        self.db.add(Student(id=student_id, organization_id=1, admission_no=f"ST-{student_id:03d}",
                            first_name=f"Child {student_id:03d}", last_name="Example"))
        self.db.flush()
        self.db.add(StudentEnrollment(student_id=student_id, classroom_id=1, session_id=1, is_active=enrolled))
        return self.add_fee(student_id=student_id, month="January", paid_amount=paid)

    def test_single_voucher_automatically_uses_saved_png_and_jpeg_logos(self):
        for format, extension, mime in (("PNG", "png", "image/png"), ("JPEG", "jpg", "image/jpeg")):
            with self.subTest(format=format):
                saved = self.client.put("/organization/logo",
                    files={"logo": (f"logo.{extension}", self.logo_bytes(format), mime)})
                self.assertEqual(saved.status_code, 200)
                self.db.expire_all()
                profile = self.client.get("/organization/profile").json()
                self.assertTrue(profile["logo"].startswith("data:image/png;base64,"))
                response = self.voucher()
                self.assertEqual(response.status_code, 200, response.text[:100])
                self.assertIn(b"/Subtype /Image", response.content)
                self.assertEqual(len(re.findall(rb"/Type\s*/Page\b", response.content)), 1)

    def test_bulk_automatically_reuses_one_saved_logo_on_every_voucher(self):
        self.add_class_student(3)
        self.db.commit()
        saved = self.client.put("/organization/logo", files={"logo": ("logo.png", self.logo_bytes(), "image/png")})
        self.assertEqual(saved.status_code, 200)
        with patch.object(routes, "generate_fee_vouchers", wraps=routes.generate_fee_vouchers) as generate:
            response = self.bulk_voucher()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["x-voucher-count"], "2")
        payloads = generate.call_args.args[1]
        self.assertIsNotNone(payloads[0]["school"]["logo_image"])
        self.assertIs(payloads[0]["school"]["logo_image"], payloads[1]["school"]["logo_image"])
        self.assertIn(b"/Subtype /Image", response.content)
        self.assertEqual(len(re.findall(rb"/Type\s*/Page\b", response.content)), 2)

    def test_logo_validation_rejects_bad_types_sizes_and_dimensions(self):
        self.client.put("/organization/logo", files={"logo": ("logo.png", self.logo_bytes(), "image/png")})
        original = self.db.get(Organization, 1).logo
        cases = [
            (b"not an image", 422),
            (b"<svg xmlns='http://www.w3.org/2000/svg'/>", 422),
            (self.logo_bytes("GIF"), 422),
            (b"x" * (MAX_LOGO_BYTES + 1), 413),
            (self.logo_bytes(size=(4001, 1)), 422),
        ]
        for contents, status in cases:
            with self.subTest(status=status, size=len(contents)):
                response = self.client.put("/organization/logo",
                    files={"logo": ("logo.png", contents, "image/png")})
                self.assertEqual(response.status_code, status)
                self.assertIn("logo", response.json()["detail"])
                self.assertEqual(self.db.get(Organization, 1).logo, original)

    def test_school_logos_are_scoped_to_the_organization(self):
        self.db.get(Organization, 2).logo = self.logo_bytes()
        self.db.commit()
        self.assertIsNone(self.client.get("/organization/profile").json()["logo"])
        self.assertNotIn(b"/Subtype /Image", self.voucher().content)
        self.client.put("/organization/logo", files={"logo": ("logo.png", self.logo_bytes(), "image/png")})
        self.client.delete("/organization/logo")
        self.assertIsNone(self.db.get(Organization, 1).logo)
        self.assertIsNotNone(self.db.get(Organization, 2).logo)

    def test_only_administrators_can_save_or_remove_school_logo(self):
        self.actor.org_role = "teacher"
        self.assertEqual(self.client.get("/organization/profile").status_code, 200)
        self.assertEqual(self.client.put("/organization/logo",
            files={"logo": ("logo.png", self.logo_bytes(), "image/png")}).status_code, 403)
        self.assertEqual(self.client.delete("/organization/logo").status_code, 403)
        self.assertIsNone(self.db.get(Organization, 1).logo)

    def test_removing_saved_logo_restores_vouchers_without_logo(self):
        self.client.put("/organization/logo", files={"logo": ("logo.png", self.logo_bytes(), "image/png")})
        self.assertIn(b"/Subtype /Image", self.voucher().content)
        response = self.client.delete("/organization/logo")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["logo"])
        self.assertNotIn(b"/Subtype /Image", self.voucher().content)

    def test_school_title_is_centered_on_both_copies_with_or_without_logo(self):
        expected_center = (landscape(A4)[0] / 2 - 10*mm) / 2
        for use_logo in (False, True):
            self.db.get(Organization, 1).logo = self.logo_bytes() if use_logo else None
            self.db.commit()
            with patch("app.services.fee_voucher_generator.canvas.Canvas.drawCentredString", autospec=True) as draw:
                response = self.voucher()
            self.assertEqual(response.status_code, 200)
            titles = [call.args for call in draw.call_args_list if call.args[3] == "Example School"]
            self.assertEqual(len(titles), 2)
            for call in titles:
                self.assertAlmostEqual(call[1], expected_center)

    def test_bulk_includes_all_pages_and_keeps_student_balances_separate(self):
        for student_id in range(3, 15):
            self.add_class_student(student_id)
        self.add_class_student(15, paid=500)
        self.add_class_student(16, paid=1000)
        self.add_class_student(17, enrolled=False)
        self.add_fee(month="December", paid_amount=600)
        self.add_fee(student_id=3, month="December", paid_amount=300)
        self.add_fee(month="February")
        self.add_fee(month="January", student_id=2, organization_id=2, session_id=2, class_id=2)
        self.add_fee(month="January", class_id=3, session_id=3)
        other_class_fee = self.add_class_student(18)
        other_class_fee.class_id = 3
        self.db.commit()
        statements = []
        def record_query(connection, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)
        event.listen(self.engine, "before_cursor_execute", record_query)
        try:
            with patch.object(routes, "generate_fee_vouchers", wraps=routes.generate_fee_vouchers) as generate:
                response = self.bulk_voucher()
        finally:
            event.remove(self.engine, "before_cursor_execute", record_query)
        self.assertEqual(response.status_code, 200, response.text[:100])
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertEqual(response.headers["x-voucher-count"], "13")
        self.assertEqual(response.headers["x-voucher-skipped"], "2")
        self.assertIn("X-Voucher-Count", response.headers["access-control-expose-headers"])
        self.assertIn("no-store", response.headers["cache-control"])
        self.assertIn("class-1-January-2027-01-10.pdf", response.headers["content-disposition"])
        self.assertEqual(len(re.findall(rb"/Type\s*/Page\b", response.content)), 13)
        payloads = generate.call_args.args[1]
        by_student = {item["student"]["student_id"]: item for item in payloads}
        self.assertEqual(len(by_student), 13)
        self.assertEqual(by_student["ST-001"]["voucher"]["arrears"], Decimal("400"))
        self.assertEqual(by_student["ST-003"]["voucher"]["arrears"], Decimal("700"))
        self.assertEqual(by_student["ST-004"]["voucher"]["arrears"], Decimal("0"))
        self.assertTrue(all(item["voucher"]["due_date"] == "10-01-2027" for item in payloads))
        self.assertEqual(payloads[0]["student"]["student_id"], "ST-003")
        # Class, students/organizations and prior balances are loaded in batches.
        self.assertLessEqual(len(statements), 5)
        self.db.refresh(self.fee)
        self.assertEqual(self.fee.paid_amount, 0)

    def test_bulk_rejects_foreign_and_inactive_classrooms(self):
        for classroom_id in (2, 3, 999):
            self.assertEqual(self.bulk_voucher(class_id=classroom_id).status_code, 404)

    def test_bulk_reports_missing_fees_and_all_payments_recorded(self):
        response = self.bulk_voucher(month="February")
        self.assertEqual(response.status_code, 404)
        self.assertIn("Generate fees first", response.json()["detail"])
        self.fee.paid_amount = 100
        self.db.commit()
        response = self.bulk_voucher()
        self.assertEqual(response.status_code, 409)
        self.assertIn("all matching fees", response.json()["detail"])

    def test_bulk_requires_valid_class_month_and_date(self):
        for changes in ({"class_id": 0}, {"month": "Bad month"}, {"due_date": "2027-02-30"}):
            self.assertEqual(self.bulk_voucher(**changes).status_code, 422)
        self.assertEqual(self.client.get("/fees/vouchers/bulk?class_id=1&month=January").status_code, 422)

    def test_bulk_bad_fee_identifies_student_and_does_not_return_incomplete_pdf(self):
        bad = self.add_class_student(3)
        with self.legacy_invalid_amounts():
            bad.final_amount = 20
            self.db.commit()
        with patch.object(routes, "generate_fee_vouchers") as generate:
            response = self.bulk_voucher()
        self.assertEqual(response.status_code, 409)
        self.assertIn("ST-003", response.json()["detail"])
        self.assertIn("does not match the ledger", response.json()["detail"])
        generate.assert_not_called()

    def test_pdf_contains_correct_student_class_and_balances(self):
        self.add_fee(month="December", paid_amount=600)  # 400 outstanding across the year boundary.
        self.add_fee(month="November", paid_amount=1000)  # Settled.
        self.add_fee(month="October", paid_amount=1000)  # Settled; new writes cannot overpay.
        self.add_fee(month="February")  # Future month, not arrears.
        self.add_fee(month="September", session_id=3, class_id=3)  # Previous session.
        self.add_fee(month="September", student_id=2, organization_id=2, session_id=2, class_id=2)
        self.db.commit()
        with patch.object(routes, "generate_fee_voucher", wraps=generate_fee_voucher) as generate:
            response = self.voucher()
        self.assertEqual(response.status_code, 200, response.text[:100])
        self.assertTrue(response.content.startswith(b"%PDF-"))
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertIn("no-store", response.headers["cache-control"])
        data = generate.call_args.kwargs
        self.assertEqual(data["student"]["class_section"], "Nursery - A")
        self.assertEqual(data["student"]["student_name"], "Example")
        self.assertEqual(data["student"]["student_id"], "ST-001")
        self.assertEqual(data["school"]["school_name"], "Example School")
        self.assertEqual(data["voucher"]["arrears"], Decimal("400"))
        self.assertEqual(data["voucher"]["discount"], Decimal("100.50"))
        self.assertEqual(data["voucher"]["due_date"], "10-01-2027")
        self.assertIsNone(data["payment"])
        result = generate_fee_voucher(io.BytesIO(), **data)
        self.assertEqual(result["total_payable"], "1999.50")
        self.assertEqual(result["status"], "UNPAID")
        self.db.refresh(self.fee)
        self.assertEqual(self.fee.paid_amount, 0)  # Rendering must not collect payment.

    def test_legacy_url_still_works(self):
        response = self.client.get(f"/fee/{self.fee.id}/voucher?due_date=2027-01-10")
        self.assertEqual(response.status_code, 200)

    def test_other_organization_and_inactive_session_fees_are_hidden(self):
        other = self.add_fee(student_id=2, organization_id=2, session_id=2, class_id=2)
        previous = self.add_fee(session_id=3, class_id=3)
        for fee_id in (other.id, previous.id, 99999):
            with self.subTest(fee_id=fee_id):
                self.assertEqual(self.voucher(fee_id).status_code, 404)

    def test_mismatched_classroom_cannot_leak_organization_data(self):
        for classroom_id in (2, 3):
            self.fee.class_id = classroom_id
            self.db.commit()
            self.assertEqual(self.voucher().status_code, 404)

    def test_paid_and_partial_vouchers_are_rejected(self):
        for paid in (500, Decimal("1599.50")):
            self.fee.paid_amount = paid
            self.db.commit()
            self.assertEqual(self.voucher().status_code, 409)

    def test_date_is_required_and_validated(self):
        for suffix in ("", "?due_date=2027-02-30", "?due_date=not-a-date"):
            self.assertEqual(self.client.get(f"/fees/{self.fee.id}/voucher{suffix}").status_code, 422)

    def test_inconsistent_or_negative_amounts_are_rejected(self):
        with self.legacy_invalid_amounts():
            self.fee.final_amount = 123
            self.db.commit()
            self.assertEqual(self.voucher().status_code, 409)
            self.fee.monthly_fee = -100
            self.db.commit()
            self.assertEqual(self.voucher().status_code, 409)

    def test_invalid_month_is_explained(self):
        self.fee.month = "Unknown"
        self.db.commit()
        self.assertEqual(self.voucher().status_code, 422)

    def test_zero_fee_voucher_has_no_dues(self):
        empty = self.add_fee(month="April", monthly_fee=0, total_amount=0, final_amount=0)
        with patch.object(routes, "generate_fee_voucher", wraps=generate_fee_voucher) as generate:
            response = self.voucher(empty.id)
        self.assertEqual(response.status_code, 200)
        result = generate_fee_voucher(io.BytesIO(), **generate.call_args.kwargs)
        self.assertEqual(result["status"], "NO DUES")

    def test_ledger_uses_the_fees_class_and_active_session_enrollment(self):
        other_class_fee = self.add_class_student(3)
        other_class_fee.class_id = 3
        self.db.add(StudentEnrollment(student_id=1, classroom_id=1, session_id=3, is_active=True))
        self.db.commit()
        response = self.client.get("/fees/ledger?class_id=1&month=January&limit=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total_pages"], 1)
        self.assertEqual(response.json()["items"][0]["id"], self.fee.id)
        self.assertEqual(response.json()["items"][0]["student_name"], "Example")

    def test_discount_cannot_reduce_prior_arrears(self):
        with self.assertRaisesRegex(ValueError, "Discount cannot exceed current fees"):
            generate_fee_voucher(io.BytesIO(), school={},
                student={"student_name": "Example", "student_id": "1", "class_section": "Nursery A"},
                voucher={"voucher_no": "1", "fee_month": "January", "due_date": "10-01-2027", "arrears": 500, "discount": 200},
                fee_items=[{"description": "Tuition", "amount": 100}])


if __name__ == "__main__":
    unittest.main()
