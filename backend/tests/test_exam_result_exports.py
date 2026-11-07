"""Saved result exports: disposable PostgreSQL only, never application DB writes."""
import csv
from io import BytesIO, StringIO
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from openpyxl import load_workbook
from sqlalchemy import event

import test_reports as fixture
from app.models.users import OrganizationMember
from app.models.students import Student
from app.models.student_enrollment import StudentEnrollment
from app.models.classroom import Classroom
from app.models.exams import ExamResult
from app.models.exams import ExamPaper, Subject
from app.routers import exams_results


@unittest.skipUnless(os.environ.get('TEST_POSTGRES_URL'), 'Requires disposable PostgreSQL')
class ExamExportTests(unittest.TestCase):
    def setUp(self):
        fixture.ReportsTests.setUp(self)
        self.client.app.include_router(exams_results.router)
        self.actor.org_role = 'admin'
        self.enrollment.roll_number = '007'
        self.db.add_all([ExamResult(exam_paper_id=i, student_enrollment_id=self.enrollment.id, obtained_marks=mark)
                         for i, mark in enumerate([0, 40, 100], 1)])
        self.db.commit()

    def sheet(self):
        response = self.client.get('/exam-results/sheet', params=dict(exam_id=1, classroom_id=1))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def export(self, format, summary=False, **filters):
        url = '/reports/exam-summary/export' if summary else '/exam-results/sheet/export'
        params = dict(exam_id=1, format=format, **filters)
        if not summary:
            params.setdefault('classroom_id', 1)
        return self.client.get(url, params=params)

    def test_grouped_summary_and_sheet_share_saved_zero_and_incomplete_marks(self):
        sheet = self.sheet()
        self.assertEqual(len(sheet['items']), 1)
        row = sheet['items'][0]
        self.assertEqual([s['obtained_marks'] for s in row['subjects']], [0, 40, 100, None])
        self.assertEqual((row['obtained_total'], row['possible_total'], row['percentage'], row['result']), (140, 400, None, 'INCOMPLETE'))
        report = self.client.get('/reports/exam-summary', params=dict(exam_id=1)).json()
        self.assertEqual(report['items'], sheet['items'])

    def test_csv_and_excel_are_identical_saved_matrices_and_keep_roll_ids(self):
        csv_response, excel_response = self.export('csv'), self.export('xlsx')
        self.assertEqual(csv_response.status_code, 200, csv_response.text)
        self.assertEqual(excel_response.status_code, 200, excel_response.text)
        csv_rows = list(csv.reader(StringIO(csv_response.content.decode('utf-8-sig'))))
        workbook = load_workbook(BytesIO(excel_response.content))
        excel_rows = list(workbook.active.values)
        self.assertEqual(csv_rows, [[str(v) if v is not None else '' for v in row] for row in excel_rows])
        self.assertEqual(csv_rows[0][3:], [f'Subject {i} (100)' for i in range(1, 5)])
        self.assertEqual(csv_rows[1][0], '007')
        self.assertEqual(csv_rows[1][3:], ['0', '40', '100', 'Missing'])
        self.assertEqual(excel_response.headers['cache-control'], 'private, no-store')

    def test_exports_ignore_unsaved_session_state_and_include_all_students(self):
        self.db.add_all([Student(id=i, organization_id=1, first_name=f'Fixture {i}', admission_no=f'F-{i}') for i in range(2, 54)])
        self.db.flush()
        self.db.add_all([StudentEnrollment(student_id=i, session_id=1, classroom_id=1, is_active=True) for i in range(2, 54)])
        self.db.commit()
        csv_rows = list(csv.reader(StringIO(self.export('csv').content.decode('utf-8-sig'))))
        self.assertEqual(len(csv_rows), 54)  # Header + 53 students, not a visible page.
        self.assertEqual(csv_rows[1][3], '0')

    def test_formula_strings_are_literal_in_excel_and_escaped_in_csv(self):
        self.db.get(Student, 1).first_name = '=HYPERLINK("bad")'
        self.db.commit()
        worksheet = load_workbook(BytesIO(self.export('xlsx').content)).active
        self.assertEqual(worksheet['B2'].data_type, 's')
        self.assertTrue(worksheet['B2'].value.startswith('='))
        row = list(csv.reader(StringIO(self.export('csv').content.decode('utf-8-sig'))))[1]
        self.assertTrue(row[1].startswith("'="))

    def test_only_assigned_class_teacher_can_export_and_cannot_read_schoolwide_reports(self):
        self.actor.org_role = 'teacher'
        self.assertEqual(self.export('csv').status_code, 403)
        self.db.add(OrganizationMember(id=10, organization_id=1, user_id=1, role='teacher'))
        self.db.flush()
        self.db.get(Classroom, 1).class_teacher_member_id = 10
        self.db.commit()
        self.assertEqual(self.export('xlsx').status_code, 200)
        self.assertEqual(self.export('csv', summary=True).status_code, 403)
        for role in ('parent', 'student', 'accountant', None):
            self.actor.org_role = role
            self.assertEqual(self.export('csv').status_code, 403)

    def test_tenant_session_filters_and_formats_are_enforced(self):
        self.assertEqual(self.export('csv', classroom_id=2).status_code, 404)
        self.assertEqual(self.export('csv', summary=True, session_id=2).status_code, 404)
        self.assertEqual(self.export('csv', summary=True, session_id=3).status_code, 404)
        self.assertEqual(self.export('exe').status_code, 422)
        response = self.export('csv', summary=True, result='pass')
        self.assertEqual(len(list(csv.reader(StringIO(response.content.decode('utf-8-sig'))))), 1)
        self.assertEqual(len(list(csv.reader(StringIO(self.export('csv', summary=True, grade_name='Other').content.decode('utf-8-sig'))))), 1)

    def test_exports_are_read_only_and_allowed_for_locked_or_published_exam(self):
        from app.models.exams import Exam
        exam = self.db.get(Exam, 1)
        exam.is_locked = exam.is_published = True
        self.db.commit()
        statements = []
        def record(_conn, _cursor, statement, *_args): statements.append(statement)
        event.listen(self.engine, 'before_cursor_execute', record)
        try:
            for format in ('csv', 'xlsx', 'pdf'):
                self.assertEqual(self.export(format, summary=True).status_code, 200)
        finally:
            event.remove(self.engine, 'before_cursor_execute', record)
        self.assertFalse(any(s.lstrip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')) for s in statements))

    def test_wide_reports_include_every_subject_and_preserve_school_logo(self):
        from app.models.users import Organization
        from PIL import Image
        image = BytesIO()
        Image.new('RGB', (120, 45), '#654AC2').save(image, format='PNG')
        self.db.get(Organization, 1).logo = image.getvalue()
        for i in range(5, 13):
            self.db.add(Subject(id=i+20, organization_id=1, session_id=1, name=f'Additional Subject {i}'))
        self.db.flush()
        for i in range(5, 13):
            self.db.add(ExamPaper(id=i, exam_id=1, classroom_id=1, subject_id=i+20, total_marks=100, pass_marks=40))
        self.db.add_all(Student(id=i, organization_id=1, first_name=f'Wide Fixture {i}', admission_no=f'WIDE-{i}') for i in range(2, 30))
        self.db.flush()
        self.db.add_all(StudentEnrollment(student_id=i, session_id=1, classroom_id=1, roll_number=str(i), is_active=True) for i in range(2, 30))
        self.db.commit()
        response = self.export('pdf', summary=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'/Subtype /Image', response.content)
        self.assertEqual(len(self.sheet()['columns']), 12)
        if os.environ.get('EXAM_EXPORT_QA_DIR'):
            target = Path(os.environ['EXAM_EXPORT_QA_DIR'])
            target.mkdir(parents=True, exist_ok=True)
            (target/'exam-report-wide.pdf').write_bytes(response.content)

    def test_exports_require_authentication(self):
        from app.routers.reports import get_current_user
        self.client.app.dependency_overrides.pop(get_current_user)
        self.assertIn(self.export('csv').status_code, (401, 403))

    @unittest.skipUnless(shutil.which('pdftotext') or os.environ.get('PDF_TEST_PYTHON'), 'PDF text extraction runtime required')
    def test_report_pdf_csv_excel_share_totals_and_missing_status(self):
        pdf = self.export('pdf', summary=True)
        self.assertEqual(pdf.status_code, 200, pdf.text)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'report.pdf'
            path.write_bytes(pdf.content)
            if os.environ.get('PDF_TEST_PYTHON'):
                text = subprocess.check_output([os.environ['PDF_TEST_PYTHON'], '-c',
                    'from pypdf import PdfReader; import sys; print("\\n".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))', str(path)],
                    env={**os.environ, 'PYTHONIOENCODING': 'utf-8'}).decode('utf-8')
            else:
                text = subprocess.check_output([shutil.which('pdftotext'), '-layout', str(path), '-']).decode('utf-8')
        for value in ('140 / 400', 'INCOMPLETE', 'Missing', 'Subject 1', 'Synthetic School', '2026-27'):
            self.assertIn(value, text)
        csv_rows = list(csv.reader(StringIO(self.export('csv', summary=True).content.decode('utf-8-sig'))))
        excel_rows = list(load_workbook(BytesIO(self.export('xlsx', summary=True).content)).active.values)
        self.assertEqual(csv_rows, [[str(v) if v is not None else '' for v in row] for row in excel_rows])
        self.assertEqual(csv_rows[1][-5:], ['140 / 400', 'Incomplete', 'Unassigned', '1', 'INCOMPLETE'])
        if os.environ.get('EXAM_EXPORT_QA_DIR'):
            target = Path(os.environ['EXAM_EXPORT_QA_DIR'])
            target.mkdir(parents=True, exist_ok=True)
            (target/'exam-report.pdf').write_bytes(pdf.content)
