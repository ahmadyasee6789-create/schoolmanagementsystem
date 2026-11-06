"""Subject and assignment mutations share organization locks and one transaction.

Subjects belong to an academic session in the existing model. Subject-name
uniqueness is enforced by all API writers under the same database row lock;
assignment uniqueness additionally has the existing uq_class_subject constraint.
"""
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.exams import ClassSubject, ExamPaper, Subject
from app.models.users import Organization, OrganizationMember
from app.schemas.subjects import BulkClassSubjectsOut, BulkSubjectsOut, SubjectResponse


def subject_key(name):
    return name.strip().lower()


def lock_subject_scope(db, user, active_session, *, bulk=False):
    if user.org_role not in ({"admin"} if bulk else {"admin", "manager"}) or user.org_id is None:
        raise HTTPException(403, "Only school administrators can perform this bulk operation" if bulk else "Insufficient permissions")
    organization = db.query(Organization.id).filter_by(id=user.org_id).with_for_update().first()
    session = db.query(AcademicSession.id).filter_by(id=active_session.id, organization_id=user.org_id, is_active=True).first()
    if organization is None or session is None:
        raise HTTPException(404, "Academic session not found in your organization")


def scoped_subjects(db, user, active_session):
    return db.query(Subject).filter_by(organization_id=user.org_id, session_id=active_session.id).populate_existing()


def scoped_classroom(db, user, active_session, classroom_id):
    classroom = db.query(Classroom).join(Grade).filter(
        Classroom.id == classroom_id, Classroom.organization_id == user.org_id,
        Classroom.academic_year_id == active_session.id, Grade.organization_id == user.org_id,
    ).first()
    if classroom is None:
        raise HTTPException(404, "Classroom not found in this school and academic session")
    return classroom


def mutate_subject(db, user, active_session, data, *, subject_id=None):
    try:
        lock_subject_scope(db, user, active_session)
        subjects = scoped_subjects(db, user, active_session).order_by(Subject.id).all()
        subject = next((item for item in subjects if item.id == subject_id), None) if subject_id is not None else None
        if subject_id is not None and subject is None:
            raise HTTPException(404, "Subject not found")
        if data.name is not None:
            if any(item.id != subject_id and subject_key(item.name) == subject_key(data.name) for item in subjects):
                raise HTTPException(400, "Subject with this name already exists")
            if subject is None:
                subject = Subject(name=data.name, organization_id=user.org_id, session_id=active_session.id)
                db.add(subject)
            else:
                subject.name = data.name
        db.flush()
        response = SubjectResponse.model_validate(subject)
        db.commit()
        return response
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Subject operation conflicted; refresh and retry") from exc
    except Exception:
        db.rollback()
        raise


def bulk_create_subjects(db, user, active_session, request):
    try:
        lock_subject_scope(db, user, active_session, bulk=True)
        existing = {subject_key(item.name) for item in scoped_subjects(db, user, active_session).all()}
        seen, created, skipped = set(), [], []
        for name in request.names:
            key = subject_key(name)
            reason = "Duplicate in this request" if key in seen else "Already exists" if key in existing else None
            seen.add(key)
            if reason:
                skipped.append(dict(name=name, reason=reason))
            else:
                subject = Subject(name=name, organization_id=user.org_id, session_id=active_session.id)
                db.add(subject)
                created.append(subject)
        db.flush()
        response = BulkSubjectsOut(created_count=len(created), skipped_count=len(skipped), created=created, skipped=skipped)
        db.commit()
        return response
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Subject creation conflicted; refresh and retry") from exc
    except Exception:
        db.rollback()
        raise


def assign_subjects(db, user, active_session, subject_ids, classroom_id, *, bulk=False, teacher_member_id=None):
    try:
        lock_subject_scope(db, user, active_session, bulk=bulk)
        scoped_classroom(db, user, active_session, classroom_id)
        ids = set(subject_ids)
        subjects = scoped_subjects(db, user, active_session).filter(Subject.id.in_(ids)).all()
        if len(subjects) != len(ids):
            raise HTTPException(404, "One or more subjects are unavailable in this school and academic session")
        if teacher_member_id is not None:
            teacher = db.query(OrganizationMember.id).filter_by(id=teacher_member_id, organization_id=user.org_id, role="teacher").first()
            if teacher is None:
                raise HTTPException(404, "Teacher not found")
        existing = {row.subject_id for row in db.query(ClassSubject).filter(
            ClassSubject.classroom_id == classroom_id, ClassSubject.subject_id.in_(ids),
        ).all()}
        created, skipped, seen = [], [], set()
        for subject_id in subject_ids:
            if subject_id in existing or subject_id in seen:
                if not bulk:
                    raise HTTPException(400, "Subject already assigned to this class")
                skipped.append(subject_id)
            else:
                row = ClassSubject(classroom_id=classroom_id, subject_id=subject_id, teacher_member_id=teacher_member_id)
                db.add(row)
                created.append(row)
            seen.add(subject_id)
        db.flush()
        response = BulkClassSubjectsOut(assigned_count=len(created), skipped_count=len(skipped), assigned=created, skipped=skipped)
        db.commit()
        return response if bulk else response.assigned[0]
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Assignment creation conflicted; refresh and retry") from exc
    except Exception:
        db.rollback()
        raise


def remove_subject(db, user, active_session, subject_id):
    try:
        if user.org_role != "admin":
            raise HTTPException(403, "Only admins can delete subjects")
        lock_subject_scope(db, user, active_session)
        subject = scoped_subjects(db, user, active_session).filter_by(id=subject_id).first()
        if subject is None:
            raise HTTPException(404, "Subject not found")
        if db.query(ClassSubject.id).filter_by(subject_id=subject_id).first():
            raise HTTPException(400, "Cannot delete subject that is assigned to classes. Remove from classes first.")
        if db.query(ExamPaper.id).filter_by(subject_id=subject_id).first():
            raise HTTPException(409, "Cannot delete a subject used in examination papers")
        db.delete(subject)
        db.commit()
        return {"message": "Subject deleted successfully"}
    except Exception:
        db.rollback()
        raise
