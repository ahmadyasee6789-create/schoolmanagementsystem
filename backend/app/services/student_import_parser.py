"""Read source cells without assuming a worksheet or header layout."""
import csv
import io
import re
from datetime import date, datetime
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from fastapi import HTTPException
from openpyxl import load_workbook

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 10000
MAX_COLUMNS = 100
MAX_SHEETS = 50

FIELD_ALIASES = {
    "full_name": ["name", "student name", "students name", "full name", "pupil name"],
    "first_name": ["first name", "given name"],
    "last_name": ["last name", "surname", "family name"],
    "father_name": ["father name", "fathers name", "f name", "f/name"],
    "mother_name": ["mother name", "mothers name"],
    "guardian_name": ["guardian name"],
    "phone": ["phone", "mobile", "contact no", "contact number", "student phone", "students contact no", "student contact no", "studnt contct no"],
    "father_phone": ["father phone", "father mobile", "father contact no"],
    "guardian_phone": ["guardian phone", "guardian mobile", "guardian contact no"],
    "email": ["email", "email address"],
    "date_of_birth": ["date of birth", "dob", "birth date"],
    "gender": ["gender", "sex"],
    "grade": ["grade", "class", "class name", "grade name"],
    "section": ["section", "class section"],
}


def normalize(value):
    return re.sub(r"[^\w]", "", str(value).casefold(), flags=re.UNICODE)


ALIASES = {normalize(alias): field for field, aliases in FIELD_ALIASES.items() for alias in [field, *aliases]}


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def suggested_fields(row):
    fields, used = {}, set()
    for index, value in enumerate(row):
        field = ALIASES.get(normalize(value), "ignore")
        if field in used:
            field = "ignore"
        if field != "ignore":
            used.add(field)
        fields[str(index)] = field
    return fields


def detect_header(rows):
    best_row, best_score = 1, 0
    for index, row in enumerate(rows[:20]):
        fields = set(suggested_fields(row).values()) - {"ignore"}
        score = len(fields) + (4 if fields & {"full_name", "first_name"} else 0)
        if score > best_score:
            best_row, best_score = index + 1, score
    fields = set(suggested_fields(rows[best_row - 1]).values()) if rows else set()
    likely_student = bool(fields & {"full_name", "first_name"}) and bool(
        fields & {"father_name", "date_of_birth", "grade", "guardian_name", "phone", "email", "last_name"}
    )
    return best_row, likely_student


def read_student_file(file):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".csv", ".tsv"}:
        raise HTTPException(400, "Upload an .xlsx, .csv or .tsv file. Save older .xls files as .xlsx first.")
    content = file.file.read(MAX_BYTES + 1)
    if not content:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(content) > MAX_BYTES:
        raise HTTPException(400, "Files must be 10 MB or smaller.")
    sheets, total_rows = [], 0

    def append_sheet(name, hidden, source):
        nonlocal total_rows
        rows = []
        for row in source:
            total_rows += 1
            if total_rows > MAX_ROWS:
                raise HTTPException(400, "Files may contain at most 10,000 rows across all sheets.")
            values = list(row)
            while values and not values[-1]:
                values.pop()
            if len(values) > MAX_COLUMNS:
                raise HTTPException(400, "Sheets may contain at most 100 populated columns.")
            rows.append(values)
        while rows and not any(rows[-1]):
            rows.pop()
        sheets.append({"name": name, "hidden": hidden, "rows": rows})

    try:
        if suffix in {".csv", ".tsv"}:
            try:
                text = content.decode("utf-8-sig")
            except UnicodeDecodeError:
                raise HTTPException(400, "Save the text file using UTF-8 encoding and upload it again.")
            delimiter = "\t" if suffix == ".tsv" else ","
            if suffix == ".csv":
                try:
                    delimiter = csv.Sniffer().sniff(text[:8192], delimiters=",;\t").delimiter
                except csv.Error:
                    pass
            append_sheet("Students", False, ([cell_text(v) for v in row] for row in csv.reader(io.StringIO(text), delimiter=delimiter, strict=True)))
        else:
            with ZipFile(io.BytesIO(content)) as archive:
                if sum(item.file_size for item in archive.infolist()) > 60 * 1024 * 1024:
                    raise HTTPException(400, "The workbook is too large when expanded.")
            workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=False, keep_links=False)
            try:
                if len(workbook.worksheets) > MAX_SHEETS:
                    raise HTTPException(400, "Workbooks may contain at most 50 sheets.")
                for sheet in workbook.worksheets:
                    if (sheet.max_column or 0) > MAX_COLUMNS or (sheet.max_row or 0) > MAX_ROWS:
                        raise HTTPException(400, f"Sheet '{sheet.title}' exceeds 10,000 rows or 100 columns. Remove unused formatted cells.")

                    def source_rows():
                        for row in sheet.iter_rows():
                            values = []
                            for cell in row:
                                value = cell_text(cell.value)
                                if isinstance(cell.value, (int, float)) and re.fullmatch(r"0{2,20}", cell.number_format or "") and float(cell.value).is_integer():
                                    value = value.zfill(len(cell.number_format))
                                values.append(value)
                            yield values

                    append_sheet(sheet.title, sheet.sheet_state != "visible", source_rows())
            finally:
                workbook.close()
    except HTTPException:
        raise
    except (BadZipFile, ValueError, KeyError, OSError, csv.Error) as exc:
        raise HTTPException(400, "Could not read this file. Check its format and upload it again.") from exc
    except Exception as exc:
        raise HTTPException(400, "The workbook could not be read. Save a fresh .xlsx copy and try again.") from exc
    if not any(sheet["rows"] for sheet in sheets):
        raise HTTPException(400, "The uploaded file contains no data.")
    return sheets
