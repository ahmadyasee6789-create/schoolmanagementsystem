"""Run with: python -B -m unittest discover -s tests -v.

All databases and workbooks in these tests are disposable in-memory fixtures.
"""
import io
import os
import unittest
from contextlib import redirect_stdout
from datetime import date, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4
from types import SimpleNamespace

from fastapi import HTTPException, UploadFile
from openpyxl import Workbook
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # Register relationships before creating the test schema.
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.student_enrollment import StudentEnrollment
from app.models.student_import import StudentImportBatch
from app.models.students import Student
from app.models.users import Organization, User
from app.schemas.student_import import StudentImportConfirmation, StudentImportValidation
from app.services import student_import_service as service
from app.services.student_import_parser import read_student_file


def upload_csv(text, filename="students.csv"):
    return UploadFile(filename=filename, file=io.BytesIO(text.encode("utf-8-sig")))


def upload_workbook():
    workbook = Workbook()
    old = workbook.active
    old.title = "Old students"
    old.append(["Name", "F.Name"])
    old.append(["Archived Child", "Archived Parent"])
    old.sheet_state = "hidden"
    sheet = workbook.create_sheet("Nursery A")
    sheet.append(["School title"])
    sheet.append(["Class: Nursery A"])
    sheet.append(["S.No.", "Name", "F.Name", "Students Contact No", "Fee", "Total"])
    sheet.append([1, "Alpha Child", "Parent One", "0300-1234567", 500, "=SUM(E4)"])
    sheet.append([2, "Single", "Parent Two", 3001234568, 500, "=SUM(E5)"])
    sheet["D5"].number_format = "00000000000"
    sheet.append([None, "Total", None, None, 1000])
    sheet.append([])
    payroll = workbook.create_sheet("Payroll")
    payroll.append(["Name", "Designation", "Salary"])
    payroll.append(["A Teacher", "Teacher", 20000])
    data = io.BytesIO()
    workbook.save(data)
    data.seek(0)
    return UploadFile(filename="roster.XLSX", file=data)


class StudentImportTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([Organization(id=1, name="School One"), Organization(id=2, name="School Two"),
                         User(id=1, full_name="Importer", email="importer@example.test"),
                         User(id=2, full_name="Other User", email="other@example.test")])
        self.db.flush()
        self.db.add_all([AcademicSession(id=1, name="2026-27", organization_id=1, is_active=True, start_date=date(2026, 1, 1), end_date=date(2027, 12, 31)),
                         AcademicSession(id=2, name="Other session", organization_id=2, is_active=True, start_date=date(2026, 1, 1), end_date=date(2027, 12, 31)),
                         Grade(id=1, organization_id=1, name="Nursery"), Grade(id=2, organization_id=2, name="Nursery")])
        self.db.flush()
        self.db.add_all([Classroom(id=1, organization_id=1, grade_id=1, section="A", academic_year_id=1),
                         Classroom(id=2, organization_id=2, grade_id=2, section="B", academic_year_id=2)])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def upload(self, file=None):
        return service.preview_student_import(file or upload_workbook(), self.db, 1, 1, 1)

    def validation_request(self, preview, **overrides):
        options = dict(batch_id=preview["batch_id"], enrollment_date=date(2026, 10, 22), sheets=[
            dict(sheet_index=sheet["index"], header_row=sheet["header_row"], fields=sheet["suggested_fields"],
                 classroom_id=sheet["suggested_classroom_id"] or 1)
            for sheet in preview["sheets"] if sheet["selected"]
        ])
        options.update(overrides)
        return StudentImportValidation(**options)

    def validate(self, preview, **overrides):
        return service.validate_student_import(self.validation_request(preview, **overrides), self.db, 1, 1, 1)

    def confirmation(self, validation, row_ids=None):
        return StudentImportConfirmation(batch_id=validation["batch_id"], validation_id=validation["validation_id"],
            row_ids=row_ids if row_ids is not None else [r["id"] for r in validation["rows"] if r["status"] == "ready"])

    def count(self, model):
        return self.db.scalar(select(func.count()).select_from(model))

    def test_multisheet_upload_detects_headers_and_ignores_hidden_and_payroll(self):
        preview = self.upload()
        self.assertEqual([s["name"] for s in preview["sheets"] if s["selected"]], ["Nursery A"])
        sheet = preview["sheets"][1]
        self.assertEqual(sheet["header_row"], 3)
        self.assertEqual(sheet["suggested_classroom_id"], 1)
        self.assertEqual(sheet["suggested_fields"]["2"], "father_name")
        self.assertEqual(sheet["suggested_fields"]["4"], "ignore")
        self.assertEqual(self.count(Student), 0)

    def test_validation_writes_no_students_and_confirm_is_idempotent(self):
        validated = self.validate(self.upload())
        self.assertEqual(validated["ready"], 2)
        self.assertEqual(validated["ignored_rows"], 1)
        self.assertEqual(self.count(Student), 0)
        self.assertEqual(self.count(StudentEnrollment), 0)
        request = self.confirmation(validated)
        first = service.confirm_student_import(request, self.db, 1, 1, 1)
        second = service.confirm_student_import(request, self.db, 1, 1, 1)
        self.assertEqual(first, second)
        self.assertEqual(self.count(Student), 2)
        self.assertEqual(self.count(StudentEnrollment), 2)
        single = self.db.scalar(select(Student).where(Student.first_name == "Single"))
        self.assertEqual(single.last_name, "")
        self.assertEqual(single.phone, "03001234568")
        batch = self.db.get(StudentImportBatch, validated["batch_id"])
        self.assertEqual(batch.raw_sheets, [])
        self.assertIsNone(batch.validated_rows)

    def test_csv_aliases_and_phone_zeroes_and_optional_gender(self):
        preview = self.upload(upload_csv("Student Name,F.Name,Studnt Contct No,Class\nAlpha Child,Parent One,03001234567,Nursery A\n"))
        request = self.validation_request(preview)
        request.sheets[0].classroom_id = None
        validation = service.validate_student_import(request, self.db, 1, 1, 1)
        self.assertEqual(validation["ready"], 1)
        row = validation["rows"][0]
        self.assertEqual(row["student"]["phone"], "03001234567")
        self.assertIsNone(row["student"]["gender"])
        self.assertEqual(row["classroom"], "Nursery A")

    def test_tsv_and_duplicate_headers_use_column_positions(self):
        preview = self.upload(upload_csv("Name\tName\tGrade\nAlpha Child\tParent One\tNursery A\n", "students.tsv"))
        request = self.validation_request(preview)
        request.sheets[0].fields = {"0": "full_name", "1": "father_name", "2": "grade"}
        validation = service.validate_student_import(request, self.db, 1, 1, 1)
        self.assertEqual(validation["rows"][0]["student"]["father_name"], "Parent One")

    def test_bad_values_report_real_rows_and_cannot_be_confirmed(self):
        preview = self.upload(upload_csv("Name,F.Name,DOB,Email\nAlpha Child,Parent One,31/12/2020,valid@example.test\nBeta Child,Parent Two,not-a-date,bad\n,Gamma Parent,2020-01-01,\n"))
        validation = self.validate(preview, date_format="dmy")
        self.assertEqual(validation["ready"], 1)
        self.assertEqual(validation["invalid"], 2)
        self.assertEqual(validation["rows"][0]["student"]["date_of_birth"], "2020-12-31")
        invalid = validation["rows"][1]
        self.assertEqual(invalid["row"], 3)
        with self.assertRaises(HTTPException) as caught:
            service.confirm_student_import(self.confirmation(validation, [invalid["id"]]), self.db, 1, 1, 1)
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(self.count(Student), 0)

    def test_formula_in_mapped_field_is_invalid_but_unmapped_fees_are_ignored(self):
        validation = self.validate(self.upload(upload_csv('Name,F.Name\n=SUM(A1),Parent One\n')))
        self.assertEqual(validation["invalid"], 1)
        self.assertTrue(any("formula" in e for e in validation["rows"][0]["errors"]))

    def test_phone_problem_is_visible_warning_not_silent_repair(self):
        validation = self.validate(self.upload(upload_csv("Name,Phone\nAlpha Child,1234\n")))
        self.assertEqual(validation["ready"], 1)
        self.assertTrue(validation["rows"][0]["warnings"])
        self.assertEqual(validation["rows"][0]["student"]["phone"], "1234")

    def test_total_label_in_phone_column_is_not_a_student(self):
        validation = self.validate(self.upload(upload_csv("Name,Phone\nAlpha Child,03001234567\n,Total\n")))
        self.assertEqual(len(validation["rows"]), 1)
        self.assertEqual(validation["ignored_rows"], 1)

    def test_duplicate_rows_and_existing_names_need_review(self):
        self.db.add(Student(organization_id=1, admission_no="existing", first_name="Alpha", last_name="Child"))
        self.db.commit()
        validation = self.validate(self.upload(upload_csv("Name,F.Name\nAlpha Child,Parent One\nAlpha Child,Parent One\n")))
        self.assertEqual(validation["review"], 1)
        self.assertEqual(validation["invalid"], 1)
        self.assertTrue(validation["rows"][0]["warnings"])

    def test_other_organization_name_does_not_mark_duplicate(self):
        self.db.add(Student(organization_id=2, admission_no="existing", first_name="Alpha", last_name="Child"))
        self.db.commit()
        validation = self.validate(self.upload())
        self.assertEqual(validation["review"], 0)

    def test_same_name_different_parents_in_file_requires_review_without_merging(self):
        validation = self.validate(self.upload(upload_csv("Name,F.Name\nAlpha Child,Parent One\nAlpha Child,Parent Two\n")))
        self.assertEqual(validation["review"], 2)
        self.assertEqual(validation["invalid"], 0)

    def test_malformed_mapping_is_rejected_before_row_processing(self):
        preview = self.upload()
        for fields in ({"1": "full_name", "99": "phone"}, {"1": "full_name", "2": "full_name"}, {"1": "full_name", "2": "organization_id"}):
            request = self.validation_request(preview)
            request.sheets[0].fields = fields
            with self.subTest(fields=fields), self.assertRaises(HTTPException):
                service.validate_student_import(request, self.db, 1, 1, 1)

    def test_deleted_classroom_after_validation_rejects_confirmation(self):
        validation = self.validate(self.upload())
        classroom = self.db.get(Classroom, 1)
        self.db.delete(classroom)
        self.db.commit()
        with self.assertRaises(HTTPException) as caught:
            service.confirm_student_import(self.confirmation(validation), self.db, 1, 1, 1)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(self.count(Student), 0)

    def test_requires_validation_and_rejects_old_validation_version(self):
        preview = self.upload()
        request = StudentImportConfirmation(batch_id=preview["batch_id"], validation_id=str(uuid4()), row_ids=["1:4"])
        with self.assertRaises(HTTPException):
            service.confirm_student_import(request, self.db, 1, 1, 1)
        old = self.validate(preview)
        self.validate(preview)
        with self.assertRaises(HTTPException) as caught:
            service.confirm_student_import(self.confirmation(old), self.db, 1, 1, 1)
        self.assertEqual(caught.exception.status_code, 409)

    def test_batch_is_scoped_to_user_organization_and_session(self):
        preview = self.upload()
        request = self.validation_request(preview)
        for org, session, user, expected in [(2, 2, 2, 404), (1, 1, 2, 404), (1, 2, 1, 409)]:
            with self.subTest(org=org, session=session, user=user), self.assertRaises(HTTPException) as caught:
                service.validate_student_import(request, self.db, org, session, user)
            self.assertEqual(caught.exception.status_code, expected)

    def test_expired_import_and_foreign_classroom_are_rejected(self):
        preview = self.upload()
        request = self.validation_request(preview)
        request.sheets[0].classroom_id = 2
        with self.assertRaises(HTTPException):
            service.validate_student_import(request, self.db, 1, 1, 1)
        batch = self.db.get(StudentImportBatch, preview["batch_id"])
        batch.expires_at = datetime.utcnow() - timedelta(seconds=1)
        self.db.commit()
        with self.assertRaises(HTTPException) as caught:
            self.validate(preview)
        self.assertEqual(caught.exception.status_code, 410)

    def test_ambiguous_class_requires_section(self):
        self.db.add(Classroom(organization_id=1, grade_id=1, section="B", academic_year_id=1))
        self.db.commit()
        preview = self.upload(upload_csv("Name,Grade\nAlpha Child,Nursery\n"))
        request = self.validation_request(preview)
        request.sheets[0].classroom_id = None
        validation = service.validate_student_import(request, self.db, 1, 1, 1)
        self.assertEqual(validation["invalid"], 1)

    def test_new_duplicate_after_validation_requires_revalidation(self):
        validation = self.validate(self.upload())
        self.db.add(Student(organization_id=1, admission_no="new", first_name="Alpha", last_name="Child"))
        self.db.commit()
        with self.assertRaises(HTTPException) as caught:
            service.confirm_student_import(self.confirmation(validation), self.db, 1, 1, 1)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(self.count(StudentEnrollment), 0)

    def test_failure_rolls_back_students_enrollments_and_batch_then_can_retry(self):
        validation = self.validate(self.upload())
        real_enroll = service.student_crud.enroll_student
        calls = 0

        def failing_enroll(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise IntegrityError("test insert", {}, Exception("test failure"))
            return real_enroll(**kwargs)

        with patch.object(service.student_crud, "enroll_student", side_effect=failing_enroll):
            with self.assertRaises(HTTPException):
                service.confirm_student_import(self.confirmation(validation), self.db, 1, 1, 1)
        self.assertEqual(self.count(Student), 0)
        self.assertEqual(self.count(StudentEnrollment), 0)
        self.assertEqual(self.db.get(StudentImportBatch, validation["batch_id"]).status, "validated")
        result = service.confirm_student_import(self.confirmation(validation), self.db, 1, 1, 1)
        self.assertEqual(result["imported"], 2)

    def test_only_selected_validated_rows_are_imported(self):
        validation = self.validate(self.upload())
        result = service.confirm_student_import(self.confirmation(validation, [validation["rows"][0]["id"]]), self.db, 1, 1, 1)
        self.assertEqual(result["imported"], 1)
        self.assertEqual(result["skipped"], 1)

    def test_malformed_empty_and_unsupported_files(self):
        for content, filename in [("", "empty.csv"), ("bad", "bad.xlsx"), ("Name", "bad.pdf")]:
            with self.subTest(filename=filename), self.assertRaises(HTTPException) as caught:
                read_student_file(upload_csv(content, filename))
            self.assertEqual(caught.exception.status_code, 400)

    def test_http_workflow_permissions_validation_and_repeated_confirmation(self):
        # Force a disposable URL before importing routes; never use the configured DB.
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite://"}), redirect_stdout(io.StringIO()):
            from fastapi import FastAPI
            from fastapi.testclient import TestClient
            from app.routers import students as routes
        app = FastAPI()
        app.include_router(routes.router)
        actor = SimpleNamespace(id=1, org_id=1, org_role="admin")
        app.dependency_overrides[routes.get_db] = lambda: self.db
        app.dependency_overrides[routes.get_current_user] = lambda: actor
        app.dependency_overrides[routes.get_active_session] = lambda: SimpleNamespace(id=1)
        with TestClient(app) as client:
            actor.org_role = "viewer"
            denied = client.post("/students/import/preview", files={"file": ("roster.csv", b"Name,Phone\nAlpha Child,03001234567\n", "text/csv")})
            self.assertEqual(denied.status_code, 403)
            actor.org_role = "admin"
            response = client.post("/students/import/preview", files={"file": ("roster.csv", b"Name,Phone\nAlpha Child,03001234567\n", "text/csv")})
            self.assertEqual(response.status_code, 200, response.text)
            preview = response.json()
            invalid = client.post("/students/import/validate", json={"batch_id": preview["batch_id"]})
            self.assertEqual(invalid.status_code, 422)
            request = self.validation_request(preview).model_dump(mode="json")
            response = client.post("/students/import/validate", json=request)
            self.assertEqual(response.status_code, 200, response.text)
            validation = response.json()
            self.assertEqual(self.count(Student), 0)
            confirmation = self.confirmation(validation).model_dump(mode="json")
            first = client.post("/students/import/confirm", json=confirmation)
            second = client.post("/students/import/confirm", json=confirmation)
            self.assertEqual(first.status_code, 200, first.text)
            self.assertEqual(first.json(), second.json())
            self.assertEqual(self.count(Student), 1)


if __name__ == "__main__":
    unittest.main()
