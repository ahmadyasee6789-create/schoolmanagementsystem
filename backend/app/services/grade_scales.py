"""Grade-scale administration. Pass/fail remains in exam_evaluation.py."""
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException
from sqlalchemy import or_

from app.models.exams import Exam, GradeScale
from app.models.users import Organization
from app.models.exam_reopen_snapshot import ExamReopenSnapshot
from app.services.exam_snapshot_storage import snapshot_storage_available

HISTORY_MESSAGE = (
    "Grade scales cannot be changed because this school has finalized examination history. "
    "Historical grades are calculated from this shared scale. Per-exam scale versioning "
    "is required before changing rules for future exams."
)


def organization_id(user):
    if user.org_id is None:
        raise HTTPException(403, "School membership is required")
    return user.org_id


def require_admin(user):
    organization_id(user)
    if user.org_role != "admin":
        raise HTTPException(403, "Only school administrators can manage grade scales")


def lock_scale_organization(db, org_id):
    # Also acquired by publish/lock, so finalization cannot race a scale edit.
    if db.query(Organization.id).filter(Organization.id == org_id).with_for_update().first() is None:
        raise HTTPException(404, "School not found")


def history_locked(db, org_id):
    current_history = db.query(Exam.id).filter(
        Exam.organization_id == org_id,
        or_(Exam.is_published.is_(True), Exam.is_locked.is_(True)),
    ).first() is not None
    if current_history:
        return True
    # Reopening must not erase the fact that finalized grading history exists.
    return snapshot_storage_available(db) and db.query(ExamReopenSnapshot.id).filter_by(organization_id=org_id).first() is not None


def coverage(rows):
    """Check inclusive percentage bands at the supported 0.01% precision."""
    intervals, issues, names = [], [], set()
    for row in rows:
        try:
            low, high = Decimal(str(row.min_percentage)), Decimal(str(row.max_percentage))
            if (not low.is_finite() or not high.is_finite() or not 0 <= low <= high <= 100
                    or low * 100 != (low * 100).to_integral_value()
                    or high * 100 != (high * 100).to_integral_value()):
                raise ValueError()
        except (ValueError, InvalidOperation):
            issues.append(f"Grade {row.grade} has invalid percentage boundaries")
            continue
        name = row.grade.strip().casefold()
        if not name or name in names:
            issues.append(f"Duplicate or empty grade label: {row.grade}")
        names.add(name)
        intervals.append((int(low * 100), int(high * 100), row.grade))
    cursor, gaps = 0, []
    for low, high, grade in sorted(intervals):
        if low < cursor:
            issues.append(f"Grade {grade} overlaps another range")
        elif low > cursor:
            gaps.append({"minimum": cursor / 100, "maximum": (low - 1) / 100})
        cursor = max(cursor, high + 1)
    if cursor <= 10000:
        gaps.append({"minimum": cursor / 100, "maximum": 100.0})
    return dict(complete=not gaps and not issues, gaps=gaps, issues=issues)


def require_scale_for_finalization(db, org_id):
    """Called with the organization lock held; existing finalized exams are untouched."""
    rows = db.query(GradeScale).filter(GradeScale.organization_id == org_id).all()
    if not coverage(rows)["complete"]:
        raise HTTPException(409, "Complete the grade scale from 0% to 100%, without gaps or conflicts, before publishing or locking an exam")


def validate_candidate(db, org_id, payload, excluding_id=None):
    rows = db.query(GradeScale).filter(GradeScale.organization_id == org_id).all()
    for row in rows:
        if row.id == excluding_id:
            continue
        if row.grade.strip().casefold() == payload.grade.casefold():
            raise HTTPException(409, "This grade label already exists")
        if payload.min_percentage <= Decimal(str(row.max_percentage)) and payload.max_percentage >= Decimal(str(row.min_percentage)):
            raise HTTPException(409, f"This range overlaps grade {row.grade}")


def save_scale(db, user, payload=None, scale_id=None, delete=False):
    require_admin(user)
    org_id = organization_id(user)
    try:
        lock_scale_organization(db, org_id)
        row = None
        if scale_id is not None:
            row = db.query(GradeScale).filter(GradeScale.id == scale_id, GradeScale.organization_id == org_id).first()
            if row is None:
                raise HTTPException(404, "Grade range not found")
        if history_locked(db, org_id):
            raise HTTPException(409, HISTORY_MESSAGE)
        if delete:
            db.delete(row)
        else:
            validate_candidate(db, org_id, payload, scale_id)
            if row is None:
                row = GradeScale(organization_id=org_id)
                db.add(row)
            row.grade, row.min_percentage, row.max_percentage, row.gpa = (
                payload.grade, float(payload.min_percentage), float(payload.max_percentage), payload.gpa,
            )
        db.commit()
        if not delete:
            db.refresh(row)
            return row
    except Exception:
        db.rollback()
        raise
