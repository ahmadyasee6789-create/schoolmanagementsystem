"""Assignment removal uses only guarded disposable PostgreSQL fixtures."""
from datetime import date
import os
import unittest
from unittest.mock import patch

from sqlalchemy.exc import IntegrityError, SQLAlchemyError

import test_bulk_subject_operations as fixture
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom
from app.models.exams import ClassSubject, Exam, ExamPaper, ExamResult, Subject, Term
from app.models.student_enrollment import StudentEnrollment


@unittest.skipUnless(os.environ.get('TEST_POSTGRES_URL'), 'Requires disposable loopback PostgreSQL')
class SubjectAssignmentDeleteTests(unittest.TestCase):
    def setUp(self):
        fixture.BulkSubjectOperationsTests.setUp(self)
        self.subject_ids = fixture.BulkSubjectOperationsTests.seed(self, ['English', 'Mathematics'])
        self.db.add_all([ClassSubject(id=32, classroom_id=1, subject_id=self.subject_ids[0], teacher_member_id=2),
                         ClassSubject(id=33, classroom_id=1, subject_id=self.subject_ids[1])])
        self.db.commit()

    def delete(self, assignment_id=32):
        return self.client.delete(f'/subjects/assignments/{assignment_id}')

    def records(self, model):
        return [{c.name: getattr(row, c.name) for c in model.__table__.columns}
                for row in self.db.query(model).order_by(model.id)]

    def test_delete_uses_assignment_id_returns_empty_204_and_preserves_parents(self):
        parents = {model: self.records(model) for model in (Subject, Classroom)}
        response = self.delete()
        self.assertEqual(response.status_code, 204, response.text)
        self.assertEqual(response.content, b'')
        self.assertIsNone(self.db.get(ClassSubject, 32))
        self.assertIsNotNone(self.db.get(ClassSubject, 33))
        self.assertEqual([a['id'] for a in self.client.get('/subjects/assignments').json()], [33])
        for model, before in parents.items():
            self.assertEqual(self.records(model), before)

    def test_nonexistent_subject_id_and_repeated_removal_are_custom_404(self):
        for identifier in (9999, self.subject_ids[0]):
            response = self.delete(identifier)
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json(), {'detail': 'Assignment not found'})
        self.assertEqual(self.delete().status_code, 204)
        self.assertEqual(self.delete().status_code, 404)

    def test_foreign_and_mismatched_ownership_are_indistinguishable_from_missing(self):
        foreign_id = fixture.BulkSubjectOperationsTests.seed(self, ['Private'], org_id=2, session_id=2)[0]
        self.db.add_all([ClassSubject(id=90, classroom_id=2, subject_id=foreign_id),
                         ClassSubject(id=91, classroom_id=1, subject_id=foreign_id)])
        self.db.commit()
        for identifier in (90, 91):
            response = self.delete(identifier)
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json(), {'detail': 'Assignment not found'})
            self.assertIsNotNone(self.db.get(ClassSubject, identifier))

    def test_old_session_assignment_cannot_be_deleted_from_current_session(self):
        subject_id = fixture.BulkSubjectOperationsTests.seed(self, ['Historical'], session_id=3)[0]
        self.db.add(ClassSubject(id=90, classroom_id=3, subject_id=subject_id))
        self.db.commit()
        self.assertEqual(self.delete(90).status_code, 404)
        self.assertIsNotNone(self.db.get(ClassSubject, 90))

    def test_admin_and_manager_policy_rejects_other_roles(self):
        for role in ('teacher', 'accountant', 'parent', 'student', 'viewer', None):
            self.actor.org_role = role
            self.assertEqual(self.delete().status_code, 403)
            self.assertIsNotNone(self.db.get(ClassSubject, 32))
        self.actor.org_role = 'manager'
        self.assertEqual(self.delete().status_code, 204)

    def test_authentication_is_required(self):
        from app.routers.subjects import get_current_user
        self.app.dependency_overrides.pop(get_current_user)
        self.assertIn(self.delete().status_code, (401, 403))
        self.assertIsNotNone(self.db.get(ClassSubject, 32))

    def test_exam_papers_marks_and_session_history_are_unchanged(self):
        self.db.add(Term(id=1, organization_id=1, academic_year_id=1, name='First Term'))
        self.db.flush()
        self.db.add(Exam(id=1, organization_id=1, term_id=1, name='Published exam', is_locked=True, is_published=True,
                         start_date=date(2026, 10, 1), end_date=date(2026, 10, 8)))
        self.db.flush()
        self.db.add(ExamPaper(id=1, exam_id=1, classroom_id=1, subject_id=self.subject_ids[0], total_marks=100, pass_marks=40))
        self.db.flush()
        self.db.add(ExamResult(id=1, exam_paper_id=1, student_enrollment_id=1, obtained_marks=82))
        self.db.commit()
        models = (Subject, Classroom, Exam, ExamPaper, ExamResult, StudentEnrollment, AcademicSession)
        before = {model: self.records(model) for model in models}
        self.assertEqual(self.delete().status_code, 204)
        for model in models:
            self.assertEqual(self.records(model), before[model], model.__name__)
        # Existing subject deletion still protects the now-unassigned paper.
        self.assertEqual(self.client.delete(f'/subjects/{self.subject_ids[0]}').status_code, 409)

    def test_failure_rolls_back_deletion_and_releases_transaction(self):
        for error, expected in ((SQLAlchemyError('fixture'), 503),
                                (IntegrityError('fixture', {}, Exception('referenced')), 409)):
            with self.subTest(expected=expected):
                before = self.records(ClassSubject)
                def failed_commit():
                    self.db.flush()  # Exercise rollback after a real DELETE.
                    raise error
                with patch.object(self.db, 'commit', side_effect=failed_commit):
                    response = self.delete()
                self.assertEqual(response.status_code, expected, response.text)
                self.assertEqual(self.records(ClassSubject), before)
        self.assertEqual(self.delete().status_code, 204)

    def test_assignment_can_be_recreated_by_single_then_bulk_without_duplicates(self):
        self.assertEqual(self.delete().status_code, 204)
        payload = dict(classroom_id=1, subject_id=self.subject_ids[0])
        single = self.client.post('/subjects/assign-to-class', json=payload)
        self.assertEqual(single.status_code, 200, single.text)
        self.assertEqual(self.delete(single.json()['id']).status_code, 204)
        response = self.client.post('/subjects/assign-to-class/bulk', json=dict(classroom_id=1, subject_ids=self.subject_ids))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()['assigned_count'], response.json()['skipped_count']), (1, 1))
        self.assertEqual(self.db.query(ClassSubject).count(), 2)
