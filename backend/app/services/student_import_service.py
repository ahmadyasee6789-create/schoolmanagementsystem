import pandas as pd
from fastapi import UploadFile,HTTPException
from sqlalchemy.orm import Session
REQUIRED_COLUMNS=[
    "first_name",
    "last_name",
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








