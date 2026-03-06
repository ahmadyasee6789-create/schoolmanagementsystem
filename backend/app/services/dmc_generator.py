"""
app/utils/dmc_pdf.py
--------------------
Generates a multi-page PDF — one A4 page per student DMC.
"""

import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle


def _ordinal(n: int) -> str:
    suffix = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _draw_dmc_page(c: canvas.Canvas, meta: dict, student: dict):
    """Draw a single DMC page on the current canvas page."""
    W, H = A4

    # ── Outer border ────────────────────────────────────────────────
    c.setLineWidth(2.5)
    c.setStrokeColorRGB(0.17, 0.24, 0.31)
    c.rect(10*mm, 10*mm, W - 20*mm, H - 20*mm)

    # Inner thin border
    c.setLineWidth(0.6)
    c.rect(12*mm, 12*mm, W - 24*mm, H - 24*mm)

    # ── Header background strip ──────────────────────────────────────
    c.setFillColorRGB(0.17, 0.24, 0.31)
    c.rect(12*mm, H - 47*mm, W - 24*mm, 35*mm, fill=1, stroke=0)

    # School name
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(W / 2, H - 25*mm, meta["school_name"].upper())

    # DMC title
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(W / 2, H - 33*mm, "DETAILED MARKS CERTIFICATE (DMC)")

    # Exam name
    c.setFont("Helvetica", 10)
    c.drawCentredString(W / 2, H - 40*mm, meta["exam_name"])

    # ── Student info section ─────────────────────────────────────────
    y = H - 54*mm
    c.setFillColorRGB(0.17, 0.24, 0.31)

    def info_row(label1, val1, label2, val2, y_pos):
        c.setFont("Helvetica-Bold", 9)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawString(16*mm, y_pos, label1)
        c.drawString(W/2 + 2*mm, y_pos, label2)

        c.setFont("Helvetica-Bold", 10)
        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.drawString(45*mm, y_pos, str(val1))
        c.drawString(W/2 + 30*mm, y_pos, str(val2))

        # underline
        c.setLineWidth(0.3)
        c.setStrokeColorRGB(0.8, 0.8, 0.8)
        c.line(43*mm, y_pos - 1.5*mm, W/2 - 5*mm, y_pos - 1.5*mm)
        c.line(W/2 + 28*mm, y_pos - 1.5*mm, W - 16*mm, y_pos - 1.5*mm)

    info_row("Roll No:",      student["roll_no"],
             "Class:",        meta["class_label"], y)
    y -= 8*mm
    info_row("Student Name:", student["student_name"],
             "Position:",     student["position"], y)
    y -= 8*mm

    c.setFont("Helvetica-Bold", 9)
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.drawString(16*mm, y, "Father's Name:")
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.drawString(45*mm, y, student["father_name"])
    c.setLineWidth(0.3)
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.line(43*mm, y - 1.5*mm, W - 16*mm, y - 1.5*mm)

    y -= 7*mm

    # Divider
    c.setLineWidth(1)
    c.setStrokeColorRGB(0.17, 0.24, 0.31)
    c.line(16*mm, y, W - 16*mm, y)
    y -= 5*mm

    # ── Marks table ──────────────────────────────────────────────────
    header = [["S.No", "Subject", "Total Marks", "Obtained Marks"]]
    rows = []
    for i, s in enumerate(student["subjects"], 1):
        rows.append([str(i), s["name"], str(s["total"]), str(s["obtained"])])

    # Grand total row
    rows.append(["", "Grand Total",
                 str(student["grand_total"]),
                 str(student["obtained_total"])])

    table_data = header + rows
    col_widths = [14*mm, 94*mm, 35*mm, 35*mm]

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
        ("FONTSIZE",      (0, 1), (-1, -2), 9.5),
        ("ALIGN",         (0, 1), (0,  -1), "CENTER"),
        ("ALIGN",         (2, 1), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 1), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),

        # Alternating rows
        ("ROWBACKGROUNDS", (0, 1), (-1, -2),
         [colors.white, colors.HexColor("#f4f6f8")]),

        # Grand total row
        ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",      (0, -1), (-1, -1), 10),
        ("BACKGROUND",    (0, -1), (-1, -1), colors.HexColor("#eaf0fb")),

        # Grid
        ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#bdc3c7")),
        ("BOX",           (0, 0), (-1, -1), 1.2, colors.HexColor("#2c3e50")),
    ]))

    tbl_w, tbl_h = tbl.wrapOn(c, W - 32*mm, H)
    tbl.drawOn(c, 16*mm, y - tbl_h)
    y = y - tbl_h - 8*mm

    # ── Summary bar ──────────────────────────────────────────────────
    bar_h = 14*mm
    c.setFillColorRGB(0.17, 0.24, 0.31)
    c.roundRect(16*mm, y - bar_h, W - 32*mm, bar_h, 3*mm, fill=1, stroke=0)

    result_color = (0.18, 0.8, 0.44) if student["result"] == "PASSED" else (0.91, 0.30, 0.24)
    summary_items = [
        (f"Percentage:  {student['percentage']}",  0.20),
        (f"Grade:  {student['grade']}",            0.50),
        (f"Result:  {student['result']}",          0.78),
    ]
    for text, x_frac in summary_items:
        if "Result" in text:
            c.setFillColorRGB(*result_color)
        else:
            c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(16*mm + (W - 32*mm) * x_frac, y - bar_h + 4*mm, text)

    y -= bar_h + 10*mm

    # ── Footer ───────────────────────────────────────────────────────
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.drawString(16*mm, y, "Principal Signature: _______________________")
    c.drawRightString(W - 16*mm, y, "Date Issued: ___________________")


def generate_bulk_dmc(output: io.BytesIO, meta: dict, students: list):
    """
    Generate one PDF with one DMC page per student.
    meta = { school_name, exam_name, class_label }
    students = list of student dicts (see dmc_router.py)
    """
    c = canvas.Canvas(output, pagesize=A4)
    for i, student in enumerate(students):
        _draw_dmc_page(c, meta, student)
        if i < len(students) - 1:
            c.showPage()   # new page for next student
    c.save()