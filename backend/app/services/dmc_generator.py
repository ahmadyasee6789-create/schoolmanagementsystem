"""
app/utils/dmc_pdf.py
--------------------
Production-ready DMC PDF generator.
Two DMC cards per A4 page, canvas-based layout.
"""

import io
import logging
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

logger = logging.getLogger(__name__)

# ── Required keys for validation ────────────────────────────────────────────
_REQUIRED_META_KEYS    = {"school_name", "exam_name", "class_label"}
_REQUIRED_STUDENT_KEYS = {"roll_no", "student_name", "father_name",
                          "position", "subjects", "grand_total",
                          "obtained_total", "percentage", "result"}
_REQUIRED_SUBJECT_KEYS = {"name", "total", "obtained"}

# Max subjects that safely fit in a half-A4 card without overflow
_MAX_SUBJECTS = 12


# ── Helpers ──────────────────────────────────────────────────────────────────

def _ordinal(n) -> str:
    try:
        n = int(n)
    except Exception:
        return str(n)
    suffix = (
        "th" if 11 <= n % 100 <= 13
        else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    )
    return f"{n}{suffix}"


def _calculate_grade(p) -> str:
    try:
        p = float(str(p).replace("%", "").strip())
    except Exception:
        return "-"
    if p >= 80: return "A+"
    if p >= 70: return "A"
    if p >= 60: return "B"
    if p >= 50: return "C"
    return "F"


def _safe_str(value, max_chars: int = 40) -> str:
    """Convert value to string and truncate to prevent layout overflow."""
    return str(value)[:max_chars]


def _validate_meta(meta: dict):
    missing = _REQUIRED_META_KEYS - meta.keys()
    if missing:
        raise ValueError(f"meta is missing required keys: {missing}")


def _validate_student(student: dict, index: int):
    missing = _REQUIRED_STUDENT_KEYS - student.keys()
    if missing:
        raise ValueError(
            f"Student at index {index} missing required keys: {missing}"
        )
    if not isinstance(student["subjects"], list) or len(student["subjects"]) == 0:
        raise ValueError(
            f"Student '{student.get('student_name', index)}' has no subjects"
        )
    if len(student["subjects"]) > _MAX_SUBJECTS:
        raise ValueError(
            f"Student '{student.get('student_name', index)}' has "
            f"{len(student['subjects'])} subjects — max allowed is {_MAX_SUBJECTS} "
            f"to prevent card overflow"
        )
    for j, s in enumerate(student["subjects"]):
        missing_s = _REQUIRED_SUBJECT_KEYS - s.keys()
        if missing_s:
            raise ValueError(
                f"Subject {j} of student '{student.get('student_name', index)}' "
                f"missing keys: {missing_s}"
            )


# ── Single card renderer ──────────────────────────────────────────────────────

def _draw_dmc_page(c: canvas.Canvas, meta: dict, student: dict, y_offset: float = 0):
    """Draw one DMC card. y_offset shifts the entire card up the page."""
    W, H = A4
    H = H / 2

    # ── Outer border ────────────────────────────────────────────────
    c.setLineWidth(2.5)
    c.setStrokeColorRGB(0.17, 0.24, 0.31)
    c.rect(10*mm, y_offset + 10*mm, W - 20*mm, H - 20*mm)

    # Inner thin border
    c.setLineWidth(0.6)
    c.rect(12*mm, y_offset + 12*mm, W - 24*mm, H - 24*mm)

    # ── Header background strip ──────────────────────────────────────
    c.setFillColorRGB(0.17, 0.24, 0.31)
    c.rect(12*mm, y_offset + H - 47*mm, W - 24*mm, 35*mm, fill=1, stroke=0)

    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(W / 2, y_offset + H - 25*mm,
                        _safe_str(meta["school_name"], 60).upper())

    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(W / 2, y_offset + H - 33*mm,
                        "DETAILED MARKS CERTIFICATE (DMC)")

    c.setFont("Helvetica", 7.5)
    c.drawCentredString(W / 2, y_offset + H - 40*mm,
                        _safe_str(meta["exam_name"], 80))

    # ── Student info section ─────────────────────────────────────────
    y = H - 54*mm

    def info_row(label1, val1, label2, val2, y_pos):
        c.setFont("Helvetica-Bold", 9)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawString(16*mm, y_offset + y_pos, label1)
        c.drawString(W / 2 + 2*mm, y_offset + y_pos, label2)

        c.setFont("Helvetica-Bold", 10)
        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.drawString(45*mm, y_offset + y_pos, _safe_str(val1, 30))
        c.drawString(W / 2 + 30*mm, y_offset + y_pos, _safe_str(val2, 20))

        c.setLineWidth(0.3)
        c.setStrokeColorRGB(0.8, 0.8, 0.8)
        c.line(43*mm, y_offset + y_pos - 1.5*mm,
               W / 2 - 5*mm, y_offset + y_pos - 1.5*mm)
        c.line(W / 2 + 28*mm, y_offset + y_pos - 1.5*mm,
               W - 16*mm, y_offset + y_pos - 1.5*mm)

    info_row("Roll No:",      student["roll_no"],
             "Class:",        meta["class_label"], y)
    y -= 5.5*mm
    info_row("Student Name:", student["student_name"],
             "Position:",     _ordinal(student["position"]), y)
    y -= 5.5*mm

    c.setFont("Helvetica-Bold", 9)
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.drawString(16*mm, y_offset + y, "Father's Name:")
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.drawString(45*mm, y_offset + y, _safe_str(student["father_name"], 35))
    c.setLineWidth(0.3)
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.line(43*mm, y_offset + y - 1.5*mm, W - 16*mm, y_offset + y - 1.5*mm)

    y -= 7*mm

    # Divider
    c.setLineWidth(1)
    c.setStrokeColorRGB(0.17, 0.24, 0.31)
    c.line(16*mm, y_offset + y, W - 16*mm, y_offset + y)
    y -= 5*mm

    # ── Marks table ──────────────────────────────────────────────────
    header = [["S.No", "Subject", "Total Marks", "Obtained Marks"]]
    rows = []
    for idx, s in enumerate(student["subjects"], 1):
        rows.append([
            str(idx),
            _safe_str(s["name"], 35),
            str(s["total"]),
            str(s["obtained"]),
        ])

    rows.append(["", "Grand Total",
                 str(student["grand_total"]),
                 str(student["obtained_total"])])

    table_data = header + rows
    col_widths = [14*mm, 94*mm, 35*mm, 35*mm]

    # Alternating row backgrounds — explicit per-row (ROWBACKGROUNDS is invalid)
    row_styles = []
    for ri in range(1, len(rows)):      # skip header; grand total handled separately
        bg = colors.white if ri % 2 == 1 else colors.HexColor("#f4f6f8")
        row_styles.append(("BACKGROUND", (0, ri), (-1, ri), bg))

    tbl = Table(table_data, colWidths=col_widths)
    tbl.setStyle(TableStyle([
        # Header
        ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#2c3e50")),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0),  9),
        ("ALIGN",         (0, 0), (-1, 0),  "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, 0),  5),
        ("BOTTOMPADDING", (0, 0), (-1, 0),  5),

        # Data rows
        ("FONTNAME",      (0, 1), (-1, -2), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -2), 8),
        ("ALIGN",         (0, 1), (0,  -1), "CENTER"),
        ("ALIGN",         (2, 1), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 1), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),

        # Grand total row
        ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",      (0, -1), (-1, -1), 10),
        ("BACKGROUND",    (0, -1), (-1, -1), colors.HexColor("#eaf0fb")),

        # Grid
        ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#bdc3c7")),
        ("BOX",           (0, 0), (-1, -1), 1.2, colors.HexColor("#2c3e50")),

        *row_styles,
    ]))

    tbl_w, tbl_h = tbl.wrapOn(c, W - 32*mm, H)
    tbl.drawOn(c, 16*mm, y_offset + y - tbl_h)
    y = y - tbl_h - 8*mm

    # ── Summary bar ──────────────────────────────────────────────────
    bar_h = 9*mm
    c.setFillColorRGB(0.17, 0.24, 0.31)
    c.roundRect(16*mm, y_offset + y - bar_h, W - 32*mm, bar_h,
                3*mm, fill=1, stroke=0)

    # Normalise result string for safe comparison
    result_str  = str(student["result"]).strip().upper()
    result_display = str(student["result"]).strip()
    result_color = (0.18, 0.8, 0.44) if result_str == "PASSED" else (0.91, 0.30, 0.24)
    grade = _calculate_grade(student["percentage"])

    summary_items = [
        (f"Percentage:  {student['percentage']}", 0.20),
        (f"Grade:  {grade}",                      0.50),
        (f"Result:  {result_display}",            0.78),
    ]
    for text, x_frac in summary_items:
        if "Result" in text:
            c.setFillColorRGB(*result_color)
        else:
            c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(
            16*mm + (W - 32*mm) * x_frac,
            y_offset + y - bar_h + 4*mm,
            text,
        )

    y -= bar_h + 10*mm

    # ── Footer ───────────────────────────────────────────────────────
    date_str = datetime.now().strftime("%d-%m-%Y")
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.drawString(16*mm, y_offset + y,
                 "Principal Signature: _______________________")
    c.drawRightString(W - 16*mm, y_offset + y, f"Date Issued: {date_str}")


# ── Public entry point ────────────────────────────────────────────────────────

def generate_bulk_dmc(output: io.BytesIO, meta: dict, students: list) -> dict:
    """
    Generate a bulk DMC PDF into `output`.

    Returns a summary dict:
        {
            "total":   int,   # total students received
            "success": int,   # cards successfully rendered
            "skipped": list,  # list of {"index": i, "name": str, "reason": str}
        }
    """
    if not isinstance(output, io.IOBase) or not output.writable():
        raise TypeError("output must be a writable binary stream (e.g. io.BytesIO)")

    if not students:
        raise ValueError("students list is empty — nothing to generate")

    _validate_meta(meta)

    # ── Validate all students up front so we fail early ──────────────
    valid_students   = []
    skipped_students = []

    for i, student in enumerate(students):
        try:
            _validate_student(student, i)
            valid_students.append((i, student))
        except ValueError as e:
            reason = str(e)
            logger.warning("Skipping student at index %d: %s", i, reason)
            skipped_students.append({
                "index":  i,
                "name":   student.get("student_name", f"index_{i}"),
                "reason": reason,
            })

    if not valid_students:
        raise ValueError("No valid student records found — PDF not generated")

    # ── Render ───────────────────────────────────────────────────────
    c = canvas.Canvas(output, pagesize=A4)
    W, H = A4

    pairs = list(zip(
        valid_students[0::2],   # even slots → top card
        valid_students[1::2],   # odd slots  → bottom card
    ))
    # handle last unpaired student
    if len(valid_students) % 2 == 1:
        pairs.append((valid_students[-1], None))

    for (_, top_student), bottom_pair in pairs:
        try:
            _draw_dmc_page(c, meta, top_student, y_offset=H / 2)
        except Exception as e:
            logger.error("Failed to draw card for '%s': %s",
                         top_student.get("student_name", "?"), e)

        # dashed separator line
        c.setDash(5, 3)
        c.setStrokeColorRGB(0.7, 0.7, 0.7)
        c.line(10*mm, H / 2, W - 10*mm, H / 2)
        c.setDash()

        if bottom_pair is not None:
            _, bottom_student = bottom_pair
            try:
                _draw_dmc_page(c, meta, bottom_student, y_offset=0)
            except Exception as e:
                logger.error("Failed to draw card for '%s': %s",
                             bottom_student.get("student_name", "?"), e)

        c.showPage()

    c.save()

    result = {
        "total":   len(students),
        "success": len(valid_students),
        "skipped": skipped_students,
    }

    if skipped_students:
        logger.warning(
            "DMC generation complete — %d/%d skipped: %s",
            len(skipped_students),
            len(students),
            [s["name"] for s in skipped_students],
        )
    else:
        logger.info("DMC generation complete — %d cards rendered", len(valid_students))

    return result