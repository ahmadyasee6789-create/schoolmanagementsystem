"""Calendar-month identity. Partial calendar months are billed without proration."""
from calendar import monthrange
from datetime import date

MONTH_TO_NUMBER = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
}
NUMBER_TO_MONTH = {value: key for key, value in MONTH_TO_NUMBER.items()}


def validate_period(period, start, end, enrollment_start=None, withdrawal=None):
    if type(period) is not date or period.day != 1:
        raise ValueError("Billing period must be a date on the first day of its month")
    if type(start) is not date or type(end) is not date or start >= end:
        raise ValueError("Academic session dates are missing or invalid")
    month_end = date(period.year, period.month, monthrange(period.year, period.month)[1])
    if period > end or month_end < start:
        raise ValueError("Billing period is outside the academic session")
    if enrollment_start is not None:
        if type(enrollment_start) is not date or (withdrawal is not None and
                (type(withdrawal) is not date or withdrawal < enrollment_start)):
            raise ValueError("Enrollment dates are invalid")
        if max(period, start, enrollment_start) > min(month_end, end, withdrawal or end):
            raise ValueError("Billing period is outside the student's enrollment")
    elif withdrawal is not None:
        raise ValueError("Enrollment start date is missing")
    return period


def resolve_legacy_month(month, start, end):
    """Resolve only a single possible year; never use today's year or a name label."""
    if month not in MONTH_TO_NUMBER:
        raise ValueError(f"Unsupported fee month: {month!r}")
    if type(start) is not date or type(end) is not date or start >= end:
        raise ValueError("Academic session dates are missing or invalid")
    candidates = []
    for year in range(start.year, end.year + 1):
        candidate = date(year, MONTH_TO_NUMBER[month], 1)
        month_end = date(year, candidate.month, monthrange(year, candidate.month)[1])
        if candidate <= end and month_end >= start:
            candidates.append(candidate)
    if len(candidates) != 1:
        raise ValueError("Month has no unique billing year within the academic session")
    return candidates[0]
