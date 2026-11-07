"""Read-only attendance totals for the existing dashboard request.

No school timezone/calendar columns currently exist. Deployments may configure
SCHOOL_TIMEZONE (IANA name; otherwise UTC), and optional per-organization JSON:
SCHOOL_CALENDAR_CONFIG={"1":{"timezone":"Asia/Karachi",
"non_school_weekdays":[6],"holidays":["2026-12-25"]}}.
Weekdays use Monday=0. An absent calendar means unknown, never assumed weekends.
"""
from datetime import date, datetime, timezone
import json
import os
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, case, func, or_

from app.models.attendance import Attendance
from app.models.classroom import Classroom
from app.models.student_enrollment import StudentEnrollment
from app.models.students import Student


def school_day_context(org_id, active_session, *, now=None):
    try:
        all_config = json.loads(os.getenv("SCHOOL_CALENDAR_CONFIG", "{}"))
        config = all_config.get(str(org_id), {}) if isinstance(all_config, dict) else {}
        if not isinstance(config, dict):
            config = {}
    except (TypeError, ValueError):
        config = {}
    zone_name = config.get("timezone") or os.getenv("SCHOOL_TIMEZONE") or "UTC"
    try:
        zone = ZoneInfo(zone_name)
    except (TypeError, ValueError, ZoneInfoNotFoundError):
        zone = timezone.utc
        zone_name = "UTC"
    today = (now or datetime.now(timezone.utc)).astimezone(zone).date()
    weekdays = config.get("non_school_weekdays")
    holidays = config.get("holidays")
    if not (isinstance(weekdays, list) and all(type(day) is int and 0 <= day <= 6 for day in weekdays)):
        weekdays = None
    try:
        if not isinstance(holidays, list):
            holidays = None
        else:
            holidays = [date.fromisoformat(day).isoformat() for day in holidays]
    except (TypeError, ValueError):
        holidays = None
    calendar_configured = weekdays is not None or holidays is not None
    reason = None
    if ((active_session.start_date and today < active_session.start_date)
            or (active_session.end_date and today > active_session.end_date)):
        reason = "outside_session"
    elif isinstance(holidays, list) and today.isoformat() in holidays:
        reason = "holiday"
    elif isinstance(weekdays, list) and today.weekday() in weekdays:
        reason = "non_school_weekday"
    return {
        "date": today, "timezone": zone_name, "calendar_configured": calendar_configured,
        "is_school_day": False if reason else True if calendar_configured else None,
        "non_school_day_reason": reason,
    }


def dashboard_attendance_summary(db, *, org_id, active_session, class_ids, now=None):
    context = school_day_context(org_id, active_session, now=now)
    today = context["date"]
    # The existing student/session uniqueness and daily attendance constraints
    # ensure one eligible enrollment and at most one matching record per pupil.
    # Scope BOTH sides of the join; stale transfers and foreign rows cannot count.
    eligible = db.query(
        StudentEnrollment.student_id, StudentEnrollment.classroom_id,
    ).join(Student, Student.id == StudentEnrollment.student_id).join(
        Classroom, Classroom.id == StudentEnrollment.classroom_id,
    ).filter(
        Student.organization_id == org_id, Student.is_active.is_(True),
        Classroom.organization_id == org_id, Classroom.academic_year_id == active_session.id,
        StudentEnrollment.session_id == active_session.id,
        StudentEnrollment.classroom_id.in_(class_ids),
        StudentEnrollment.is_active.is_(True), StudentEnrollment.enrollment_date <= today,
        or_(StudentEnrollment.withdrawal_date.is_(None), StudentEnrollment.withdrawal_date >= today),
    ).distinct().subquery()
    status = func.lower(func.trim(Attendance.status))
    recognized = ("present", "absent", "leave", "late")
    result = db.query(
        func.count(eligible.c.student_id).label("total"),
        *(func.coalesce(func.sum(case((status == value, 1), else_=0)), 0).label(value) for value in recognized),
        func.coalesce(func.sum(case((Attendance.id.is_(None), 1), else_=0)), 0).label("not_marked"),
        func.coalesce(func.sum(case((and_(Attendance.id.is_not(None),
            or_(Attendance.status.is_(None), status.notin_(recognized))), 1), else_=0)), 0).label("other"),
    ).select_from(eligible).outerjoin(Attendance, and_(
        Attendance.student_id == eligible.c.student_id,
        Attendance.class_id == eligible.c.classroom_id,
        Attendance.session_id == active_session.id, Attendance.date == today,
    )).one()
    counts = {key: int(getattr(result, key)) for key in ("total", *recognized, "not_marked", "other")}
    return {
        **counts, **context, "date": today.isoformat(), "session_id": active_session.id,
        "percentage": round(counts["present"] / counts["total"] * 100, 2) if counts["total"] else 0,
        "marked": counts["total"] > counts["not_marked"],
    }
