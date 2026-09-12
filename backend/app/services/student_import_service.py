import pandas as pd
from fastapi import UploadFile,HTTPException
from sqlalchemy.orm import Session
from app.models.classroom import Classroom,Grade

from app.schemas.student import StudentWithEnrollmentCreate
from app.crud import student as student_crud
from sqlalchemy.exc import IntegrityError
REQUIRED_COLUMNS=[
    "first_name",
    "last_name",
    "grade",
    "gender",
    "section",
]
def read_student_file(file:UploadFile):
    if not file.filename.endswith(('.xlsx','.csv')):
        raise HTTPException(status_code=400,detail="only .xlsx and .csv files are allowed")
    if file.filename.endswith(".csv"):
        return pd.read_csv(file.file)
    return pd.read_excel(file.file)
def preview_student_import(
    file: UploadFile,
    db: Session,
    org_id: int,
    session_id: int,
):
    df = read_student_file(file)

    missing_columns = []

    for column in REQUIRED_COLUMNS:
        if column not in df.columns:
            missing_columns.append(column)

    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail=f"Missing columns: {', '.join(missing_columns)}"
        )

    return {
        "message": "File read successfully",
        "total_rows": len(df),
        "columns": list(df.columns),
        "preview": df.head(5).fillna("").to_dict(orient="records"),
    }
import json
from datetime import date
from sqlalchemy import func, select
from fastapi import Form

def confirm_student_import(file, mapping, db, org_id, session_id):
    df = read_student_file(file).fillna("")

    # column -> schoolify field (drop "ignore"), then invert
    column_by_field = {
        field: col for col, field in mapping.items() if field != "ignore"
    }

    def value(row, field):
        col = column_by_field.get(field)
        return str(row[col]).strip() if col else ""

    imported, skipped, errors = 0, 0, []

    for index, row in df.iterrows():
        row_num = index + 2  # header row + 1-indexed
        try:
            first_name = value(row, "first_name")
            last_name = value(row, "last_name")

            if not first_name and column_by_field.get("full_name"):
                parts = value(row, "full_name").split(" ", 1)
                first_name = parts[0]
                last_name = parts[1] if len(parts) > 1 else ""

            gender = value(row, "gender").lower()
            grade_value = value(row, "grade")
            section_value = value(row, "section")

            if not (first_name and gender and grade_value and section_value):
                skipped += 1
                errors.append(f"Row {row_num}: missing a required field")
                continue

            classroom = db.execute(
                select(Classroom)
                .join(Grade, Classroom.grade_id == Grade.id)
                .where(
                    Classroom.organization_id == org_id,
                    func.lower(Grade.name) == grade_value.lower(),
                    func.lower(Classroom.section) == section_value.lower(),
                )
            ).scalar_one_or_none()

            if not classroom:
                skipped += 1
                errors.append(f"Row {row_num}: no class '{grade_value} {section_value}'")
                continue

            student_data = StudentWithEnrollmentCreate(
                first_name=first_name,
                last_name=last_name or "-",
                gender=gender,
                phone=value(row, "phone") or None,
                email=value(row, "email") or None,
                father_name=value(row, "father_name") or None,
                father_phone=value(row, "father_phone") or None,
                mother_name=value(row, "mother_name") or None,
                guardian_name=value(row, "guardian_name") or None,
                guardian_phone=value(row, "guardian_phone") or None,
                date_of_birth=value(row, "date_of_birth") or None,
                classroom_id=classroom.id,
                session_id=session_id,
                enrollment_date=date.today(),
                discount_percent=0,
            )

            student = student_crud.create_student(db=db, student=student_data, org_id=org_id)
            student_crud.enroll_student(
                db=db,
                student_id=student.id,
                classroom_id=classroom.id,
                session_id=session_id,
                enrollment_date=student_data.enrollment_date,
                discount_percent=0,
            )
            db.commit()
            imported += 1

        except IntegrityError:
            db.rollback()
            skipped += 1
            errors.append(f"Row {row_num}: duplicate admission number")
        except Exception as e:
            db.rollback()
            skipped += 1
            errors.append(f"Row {row_num}: {e}")

    return {"imported": imported, "skipped": skipped, "errors": errors[:20]}







