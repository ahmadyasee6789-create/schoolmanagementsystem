"""Upload -> map -> validate (no student writes) -> atomic confirmation."""
import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError

from app.crud import student as student_crud
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.student_import import StudentImportBatch
from app.models.students import Student
from app.models.users import Organization
from app.schemas.student import StudentWithEnrollmentCreate
from app.services.student_import_parser import ALIASES, FIELD_ALIASES, detect_header, normalize, read_student_file, suggested_fields


def grade_key(value):
    value = re.sub(r"^(class|grade)\s*:?\s*", "", value.strip(), flags=re.I)
    value = re.sub(r"^(\d+)(st|nd|rd|th)$", r"\1", value, flags=re.I)
    return normalize(value)


def split_grade_section(value):
    value = re.sub(r"^class\s*:\s*", "", value.strip(), flags=re.I)
    match = re.fullmatch(r"(.+?)\s+([a-zA-Z])", value)
    return (match[1].strip(), match[2].upper()) if match else (value, "")


def classrooms_for_import(db, org_id, session_id):
    rows = db.execute(select(Classroom.id, Grade.name, Classroom.section).join(Grade).where(
        Classroom.organization_id == org_id,
        Grade.organization_id == org_id,
        Classroom.academic_year_id == session_id,
    ).order_by(Grade.display_order, Grade.name, Classroom.section)).all()
    return [{"id": row.id, "grade": row.name, "section": row.section, "label": f"{row.name} {row.section}".strip()} for row in rows]


def match_classroom(classes, grade, section):
    return [c for c in classes if grade_key(c["grade"]) == grade_key(grade) and (not section or normalize(c["section"]) == normalize(section))]


def preview_student_import(file, db, org_id, session_id, user_id):
    sheets = read_student_file(file)
    classes = classrooms_for_import(db, org_id, session_id)
    session = db.get(AcademicSession, session_id)
    previews = []
    for index, sheet in enumerate(sheets):
        rows = sheet["rows"]
        header, likely = detect_header(rows)
        heading = next((cell for row in rows[:header - 1] for cell in row if re.match(r"^class\s*:", cell, re.I)), "")
        # Sheet names take precedence over headings, which are often copied templates.
        grade, section = split_grade_section(sheet["name"])
        matches = match_classroom(classes, grade, section)
        if not matches and heading:
            grade, section = split_grade_section(heading)
            matches = match_classroom(classes, grade, section)
        previews.append({
            "index": index, "name": sheet["name"], "hidden": sheet["hidden"],
            "selected": likely and not sheet["hidden"], "header_row": header,
            "row_count": max(0, len(rows) - header), "sample_rows": rows[:25],
            "suggested_fields": suggested_fields(rows[header - 1]) if rows else {},
            "suggested_classroom_id": matches[0]["id"] if len(matches) == 1 else None,
            "heading": heading,
        })
    now = datetime.utcnow()
    db.execute(delete(StudentImportBatch).where(StudentImportBatch.organization_id == org_id, StudentImportBatch.expires_at < now))
    batch = StudentImportBatch(
        id=str(uuid4()), organization_id=org_id, user_id=user_id, session_id=session_id,
        filename=(file.filename or "students")[:255], raw_sheets=sheets,
        expires_at=now + timedelta(hours=24), status="uploaded",
    )
    db.add(batch)
    db.commit()
    return {"batch_id": batch.id, "filename": batch.filename, "sheets": previews, "classrooms": classes,
            "session": {"id": session.id, "name": session.name}, "field_aliases": ALIASES,
            "expires_at": batch.expires_at.isoformat() + "Z"}


def get_batch(db, batch_id, org_id, session_id, user_id):
    batch = db.execute(select(StudentImportBatch).where(
        StudentImportBatch.id == batch_id, StudentImportBatch.organization_id == org_id,
        StudentImportBatch.user_id == user_id,
    ).with_for_update()).scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Import not found. Upload the file again.")
    if batch.expires_at < datetime.utcnow():
        raise HTTPException(410, "This import expired. Upload the file again.")
    if batch.session_id != session_id:
        raise HTTPException(409, "The active session changed. Upload again for the correct session.")
    return batch


def name_key(first, last):
    return " ".join(f"{first or ''} {last or ''}".casefold().split())


def existing_students(db, org_id):
    by_name = defaultdict(list)
    for student in db.scalars(select(Student).where(Student.organization_id == org_id)):
        by_name[name_key(student.first_name, student.last_name if student.last_name != "-" else "")].append(student)
    return by_name


def possible_matches(data, existing):
    # A shared name is a review hint, never an automatic merge or overwrite.
    return [student.id for student in existing.get(name_key(data["first_name"], data["last_name"]), [])]


def parse_birth_date(value, date_format):
    if not value:
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        formats = {"iso": ("%Y/%m/%d",), "dmy": ("%d/%m/%Y", "%d-%m-%Y"), "mdy": ("%m/%d/%Y", "%m-%d-%Y")}
        parsed = None
        for pattern in formats[date_format]:
            try:
                parsed = datetime.strptime(value, pattern).date()
                break
            except ValueError:
                pass
        if parsed is None:
            raise ValueError("Date of birth does not match the selected date format.")
    if parsed > date.today():
        raise ValueError("Date of birth cannot be in the future.")
    return parsed


def validate_student_import(request, db, org_id, session_id, user_id):
    batch = get_batch(db, request.batch_id, org_id, session_id, user_id)
    if batch.status == "completed":
        raise HTTPException(409, "This batch has already been imported. Upload a new file to start again.")
    classes = classrooms_for_import(db, org_id, session_id)
    by_id = {c["id"]: c for c in classes}
    existing = existing_students(db, org_id)
    results, seen_rows, seen_sheets = [], {}, set()
    source_names = defaultdict(list)
    ignored = 0
    for config in request.sheets:
        if config.sheet_index in seen_sheets or config.sheet_index >= len(batch.raw_sheets):
            raise HTTPException(400, "Select each valid sheet only once.")
        seen_sheets.add(config.sheet_index)
        sheet = batch.raw_sheets[config.sheet_index]
        source = sheet["rows"]
        if config.header_row >= len(source):
            raise HTTPException(400, f"{sheet['name']}: select a header row with data below it.")
        width = max(len(row) for row in source)
        field_columns = {}
        for column, field in config.fields.items():
            if field == "ignore":
                continue
            if field not in FIELD_ALIASES or not column.isdigit() or int(column) >= width:
                raise HTTPException(400, f"{sheet['name']}: invalid column mapping.")
            if field in field_columns:
                raise HTTPException(400, f"{sheet['name']}: map '{field}' only once.")
            field_columns[field] = int(column)
        if not ({"full_name", "first_name"} & field_columns.keys()):
            raise HTTPException(400, f"{sheet['name']}: map Full name or First name.")
        if config.classroom_id and config.classroom_id not in by_id:
            raise HTTPException(400, f"{sheet['name']}: choose a classroom in the active session.")
        if not config.classroom_id and "grade" not in field_columns:
            raise HTTPException(400, f"{sheet['name']}: choose a classroom or map the Grade column.")
        for number, row in enumerate(source[config.header_row:], config.header_row + 1):
            values = {field: (row[col].strip() if col < len(row) else "") for field, col in field_columns.items()}
            identity_values = {k: v for k, v in values.items() if k not in {"grade", "section"}}
            name = values.get("first_name") or values.get("full_name", "")
            summary_labels = {"total", "grandtotal", "preparedby", "checkedby"}
            populated = [value for value in identity_values.values() if value]
            is_summary = not name and populated and all(normalize(value) in summary_labels for value in populated)
            if not populated or is_summary or normalize(name) in summary_labels | {"name", "studentname", "firstname", "fullname"}:
                ignored += 1
                continue
            errors, warnings = [], []
            if not name or not any(char.isalpha() for char in name):
                errors.append("Student name is required and must contain letters.")
            if any(value.startswith("=") for value in values.values()):
                errors.append("A mapped student field contains a formula. Replace it with a value in the source file.")
            first = values.get("first_name", "")
            last = values.get("last_name", "")
            if not first:
                parts = values.get("full_name", "").split(maxsplit=1)
                first = parts[0] if parts else ""
                last = parts[1] if len(parts) > 1 else ""
            data = {key: values.get(key) or None for key in FIELD_ALIASES if key not in {"full_name", "grade", "section"}}
            data.update(first_name=first, last_name=last, session_id=session_id, enrollment_date=request.enrollment_date.isoformat(), discount_percent=0)
            gender = (values.get("gender") or "").casefold()
            data["gender"] = {"m": "male", "f": "female"}.get(gender, gender) or None
            if data["gender"] and data["gender"] not in {"male", "female", "other"}:
                errors.append("Gender must be male, female, other, or blank.")
            try:
                birth = parse_birth_date(values.get("date_of_birth", ""), request.date_format)
                data["date_of_birth"] = birth.isoformat() if birth else None
            except ValueError as exc:
                errors.append(str(exc))
            limits = {"first_name": 100, "last_name": 100, "phone": 20, "father_phone": 20, "guardian_phone": 20,
                      "email": 255, "father_name": 255, "mother_name": 255, "guardian_name": 255}
            for field, limit in limits.items():
                if len(data.get(field) or "") > limit:
                    errors.append(f"{field.replace('_', ' ').capitalize()} exceeds {limit} characters.")
            for field in ("phone", "father_phone", "guardian_phone"):
                value = data[field]
                if value and (not re.fullmatch(r"\+?[\d\s().-]+", value) or not 7 <= len(re.sub(r"\D", "", value)) <= 15):
                    warnings.append(f"Check {field.replace('_', ' ')}: unusual or incomplete number. The original value will be kept.")
                elif value and len(re.sub(r"\D", "", value)) == 10 and not value.startswith("+"):
                    warnings.append(f"Check {field.replace('_', ' ')}: a leading zero may be missing. The original value will be kept.")
            if data["email"] and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", data["email"]):
                errors.append("Email address is invalid.")
            classroom = by_id.get(config.classroom_id)
            if not classroom:
                grade, inferred_section = split_grade_section(values.get("grade", ""))
                matches = match_classroom(classes, grade, values.get("section") or inferred_section)
                if len(matches) == 1:
                    classroom = matches[0]
                else:
                    errors.append("Classroom is missing or ambiguous. Choose a classroom for this sheet, or correct Grade and Section.")
            data["classroom_id"] = classroom["id"] if classroom else None
            if not errors:
                try:
                    StudentWithEnrollmentCreate(**data)
                except ValidationError:
                    errors.append("Student details contain an invalid value.")
            fingerprint = json.dumps(data, sort_keys=True, ensure_ascii=False)
            if fingerprint in seen_rows:
                errors.append(f"Duplicate of {seen_rows[fingerprint]}. Keep one copy.")
            else:
                seen_rows[fingerprint] = f"{sheet['name']}, row {number}"
            matches = possible_matches(data, existing)
            if matches:
                warnings.append("An existing student has this name. Review before creating another student.")
            result = {
                "id": f"{config.sheet_index}:{number}", "sheet": sheet["name"], "row": number,
                "student": data, "classroom": classroom["label"] if classroom else "",
                "errors": errors, "warnings": warnings, "existing_ids": matches,
                "status": "invalid" if errors else ("review" if matches else "ready"),
            }
            key = name_key(first, last)
            if key and source_names[key]:
                message = "Another row in this file has this student name. Review these rows before importing."
                for candidate in [*source_names[key], result]:
                    if message not in candidate["warnings"]:
                        candidate["warnings"].append(message)
                    if not candidate["errors"]:
                        candidate["status"] = "review"
            if key:
                source_names[key].append(result)
            results.append(result)
    if not results:
        raise HTTPException(400, "No student rows found. Check the selected sheets, headers and mappings.")
    batch.validation_id = str(uuid4())
    batch.validated_rows = results
    batch.status = "validated"
    db.commit()
    return {"batch_id": batch.id, "validation_id": batch.validation_id, "rows": results, "ignored_rows": ignored,
            "ready": sum(r["status"] == "ready" for r in results), "review": sum(r["status"] == "review" for r in results),
            "invalid": sum(r["status"] == "invalid" for r in results)}


def confirm_student_import(request, db, org_id, session_id, user_id):
    batch = get_batch(db, request.batch_id, org_id, session_id, user_id)
    if batch.validation_id != request.validation_id or batch.status not in {"validated", "completed"}:
        raise HTTPException(409, "Validate the current mapping before importing.")
    if batch.status == "completed":
        return batch.result
    rows = {row["id"]: row for row in batch.validated_rows or []}
    selected_ids = set(request.row_ids)
    if len(selected_ids) != len(request.row_ids) or any(key not in rows or rows[key]["errors"] for key in selected_ids):
        raise HTTPException(400, "Select only validated rows without errors.")
    # Serialize imports for an organization while generating admission and roll numbers.
    db.execute(select(Organization.id).where(Organization.id == org_id).with_for_update()).one()
    classes = {c["id"] for c in classrooms_for_import(db, org_id, session_id)}
    existing = existing_students(db, org_id)
    selected = [row for row in batch.validated_rows if row["id"] in selected_ids]
    for row in selected:
        if row["student"]["classroom_id"] not in classes:
            raise HTTPException(409, "A mapped classroom changed. Go back and validate again.")
        if set(possible_matches(row["student"], existing)) - set(row["existing_ids"]):
            raise HTTPException(409, "Matching students were added after validation. Go back and validate again.")
    try:
        for row in selected:
            data = StudentWithEnrollmentCreate(**row["student"])
            student = student_crud.create_student(db=db, student=data, org_id=org_id)
            student_crud.enroll_student(db=db, student_id=student.id, classroom_id=data.classroom_id,
                                       session_id=session_id, enrollment_date=data.enrollment_date, discount_percent=0)
        result = {"imported": len(selected), "skipped": len(rows) - len(selected), "batch_id": batch.id}
        batch.status = "completed"
        batch.result = result
        batch.raw_sheets = []
        batch.validated_rows = None
        db.commit()
        return result
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(409, "No students were imported because the database changed or rejected a record. Validate again and retry.") from exc
