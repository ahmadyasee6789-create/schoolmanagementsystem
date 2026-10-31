"""Print-ready two-per-A4 DMC generator for ReportLab.

Pass the school logo from the authenticated organization's School Profile via
meta['logo_path'] (local trusted path) OR meta['logo_bytes'] (image bytes).
The PDF utility deliberately does not query the database or fetch remote URLs.
"""
from __future__ import annotations
from reportlab.lib.utils import ImageReader
import io
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

logger = logging.getLogger(__name__)
W, PAGE_H = A4
CARD_H = PAGE_H / 2
LEFT, RIGHT = 14 * mm, W - 14 * mm
INNER_W = RIGHT - LEFT
DARK = colors.HexColor('#243449')
LIGHT = colors.HexColor('#EFF3F8')
MUTED = colors.HexColor('#596779')
BORDER = colors.HexColor('#CBD5E1')
MAX_SUBJECTS = 12
REQUIRED_META = {'school_name', 'exam_name', 'class_label'}
REQUIRED_STUDENT = {'roll_no', 'student_name', 'father_name', 'position',
                    'subjects', 'grand_total', 'obtained_total', 'percentage', 'result'}
REQUIRED_SUBJECT = {'name', 'total', 'obtained'}
def draw_school_logo(c, logo_bytes, x, y, size=45):
    if not logo_bytes:
        return

    try:
        logo = ImageReader(io.BytesIO(logo_bytes))

        c.drawImage(
            logo,
            x,
            y,
            width=size,
            height=size,
            preserveAspectRatio=True,
            anchor="c",
            mask="auto",
        )

    except Exception as e:
        print(f"Could not draw school logo: {e}")

def _fit(value: Any, font: str, size: float, max_width: float) -> str:
    """Ellipsize by rendered width, not character count."""
    s = '' if value is None else str(value).strip()
    if stringWidth(s, font, size) <= max_width:
        return s
    while s and stringWidth(s + '...', font, size) > max_width:
        s = s[:-1]
    return s + '...' if s else ''


def _ordinal(value: Any) -> str:
    if value is None or str(value).strip() in ('', '-', '0'):
        return '-'
    try:
        n = int(value)
    except (ValueError, TypeError):
        return str(value)
    suffix = 'th' if 11 <= n % 100 <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def _grade(percentage: Any, bands: list[dict] | None = None) -> str:
    try:
        p = float(str(percentage).replace('%', '').strip())
    except (ValueError, TypeError):
        return '-'
    if bands:
        for band in sorted(bands, key=lambda b: float(b['min']), reverse=True):
            if p >= float(band['min']):
                return str(band['grade'])
        return '-'
    return 'A+' if p >= 80 else 'A' if p >= 70 else 'B' if p >= 60 else 'C' if p >= 50 else 'F'


def _number(value: Any, label: str) -> float:
    try:
        n = float(value)
    except (ValueError, TypeError):
        raise ValueError(f'{label} must be a number') from None
    if not (0 <= n < float('inf')):
        raise ValueError(f'{label} must be a finite non-negative number')
    return n


def _validate_student(student: dict, index: int) -> None:
    if not isinstance(student, dict):
        raise ValueError(f'Student at index {index} must be an object')
    missing = REQUIRED_STUDENT - student.keys()
    if missing:
        raise ValueError(f'Student at index {index} missing: {sorted(missing)}')
    subjects = student['subjects']
    if not isinstance(subjects, list) or not 1 <= len(subjects) <= MAX_SUBJECTS:
        raise ValueError(f'Student at index {index} must have 1-{MAX_SUBJECTS} subjects')
    total_sum = obtained_sum = 0.0
    for j, subject in enumerate(subjects, 1):
        if not isinstance(subject, dict) or REQUIRED_SUBJECT - subject.keys():
            raise ValueError(f'Student {index}, subject {j}: missing subject fields')
        total = _number(subject['total'], f'Subject {j} total')
        obtained = _number(subject['obtained'], f'Subject {j} obtained')
        if total <= 0 or obtained > total:
            raise ValueError(f'Student {index}, subject {j}: invalid marks')
        total_sum += total
        obtained_sum += obtained
    grand = _number(student['grand_total'], 'grand_total')
    obtained = _number(student['obtained_total'], 'obtained_total')
    percentage = _number(str(student['percentage']).replace('%', ''), 'percentage')
    if abs(total_sum - grand) > 0.01 or abs(obtained_sum - obtained) > 0.01:
        raise ValueError(f'Student {index}: totals do not match subject marks')
    if percentage > 100 or abs(percentage - 100 * obtained / grand) > 0.15:
        raise ValueError(f'Student {index}: percentage does not match marks')



def _logo_reader(meta: dict) -> ImageReader | None:
    # Preferred: shared School Profile logo service
    if meta.get("logo_image") is not None:
        return meta["logo_image"]

    # Backward compatibility: raw image bytes
    if meta.get("logo_bytes"):
        try:
            return ImageReader(io.BytesIO(meta["logo_bytes"]))
        except Exception as exc:
            logger.warning("School logo could not be loaded: %s", exc)

    return None



def _draw_label_value(c: canvas.Canvas, label: str, value: Any,
                      x: float, y: float, label_width: float, value_width: float):
    c.setFont('Helvetica-Bold', 7.3)
    c.setFillColor(MUTED)
    c.drawString(x, y, label)
    c.setFont('Helvetica', 8.3)
    c.setFillColor(DARK)
    c.drawString(x + label_width, y, _fit(value, 'Helvetica', 8.3, value_width))


def _draw_card(c: canvas.Canvas, meta: dict, student: dict, base: float,
               logo: ImageReader | None):
    """Render one card entirely inside a half-A4 slot."""
    def yy(local: float) -> float:
        return base + local

    # Borders and white header
    c.setStrokeColor(BORDER)
    c.setLineWidth(.7)
    c.roundRect(9*mm, yy(7*mm), W-18*mm, CARD_H-14*mm, 2*mm, stroke=1, fill=0)
    header_top = CARD_H - 12*mm
    logo_size = 17*mm
    logo_x = LEFT
    logo_y = yy(header_top - logo_size)
    if logo:
        c.drawImage(logo, logo_x, logo_y, logo_size, logo_size,
                    preserveAspectRatio=True, anchor='c', mask='auto')
    title_x = W/2 + (7*mm if logo else 0)
    title_max = INNER_W - (28*mm if logo else 0)
    c.setFillColor(DARK)
    c.setFont('Helvetica-Bold', 11)
    c.drawCentredString(title_x, yy(header_top - 5*mm),
                        _fit(meta['school_name'].upper(), 'Helvetica-Bold', 11, title_max))
    c.setFont('Helvetica-Bold', 8)
    c.drawCentredString(title_x, yy(header_top - 10*mm), 'DETAILED MARKS CERTIFICATE')
    c.setFont('Helvetica', 7.4)
    c.setFillColor(MUTED)
    c.drawCentredString(title_x, yy(header_top - 14*mm),
                        _fit(meta['exam_name'], 'Helvetica', 7.4, title_max))
    line_y = CARD_H - 34*mm
    c.setStrokeColor(BORDER)
    c.line(LEFT, yy(line_y), RIGHT, yy(line_y))

    # Student info: two fixed columns, no overlaps
    y = CARD_H - 40*mm
    half = INNER_W / 2
    _draw_label_value(c, 'Roll No:', student['roll_no'], LEFT, yy(y), 18*mm, half-20*mm)
    _draw_label_value(c, 'Class:', meta['class_label'], LEFT+half, yy(y), 16*mm, half-17*mm)
    y -= 5.3*mm
    _draw_label_value(c, 'Student:', student['student_name'], LEFT, yy(y), 18*mm, half-20*mm)
    _draw_label_value(c, 'Position:', _ordinal(student['position']), LEFT+half, yy(y), 16*mm, half-17*mm)
    y -= 5.3*mm
    _draw_label_value(c, 'Father:', student['father_name'], LEFT, yy(y), 18*mm, INNER_W-20*mm)

    # Compact marks table, height calculated before placing
    y -= 5*mm
    widths = [13*mm, INNER_W-13*mm-31*mm-32*mm, 31*mm, 32*mm]
    rows = [['#', 'Subject', 'Total Marks', 'Obtained']]
    for i, sub in enumerate(student['subjects'], 1):
        rows.append([str(i), _fit(sub['name'], 'Helvetica', 7.2, widths[1]-5*mm),
                     str(sub['total']), str(sub['obtained'])])
    rows.append(['', 'GRAND TOTAL', str(student['grand_total']), str(student['obtained_total'])])
    tbl = Table(rows, colWidths=widths, rowHeights=[6*mm]+[4.1*mm]*len(student['subjects'])+[5.5*mm])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,0), LIGHT),
        ('BACKGROUND', (0,-1),(-1,-1), LIGHT),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),
        ('FONTNAME',(0,1),(-1,-2),'Helvetica'),
        ('FONTSIZE',(0,0),(-1,-1),7.2),
        ('TEXTCOLOR',(0,0),(-1,-1),DARK),
        ('ALIGN',(0,0),(0,-1),'CENTER'),
        ('ALIGN',(2,0),(-1,-1),'CENTER'),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LEFTPADDING',(0,0),(-1,-1),5),
        ('RIGHTPADDING',(0,0),(-1,-1),5),
        ('TOPPADDING',(0,0),(-1,-1),0),
        ('BOTTOMPADDING',(0,0),(-1,-1),0),
        ('LINEBELOW',(0,0),(-1,-1),.35,BORDER),
        ('BOX',(0,0),(-1,-1),.6,BORDER),
    ]))
    _, table_h = tbl.wrapOn(c, INNER_W, CARD_H)
    table_bottom = y - table_h
    # Summary and signature have reserved space, even for 12 subjects
    summary_y = table_bottom - 7*mm
    footer_y = summary_y - 10*mm
    if footer_y < 11*mm:
        raise ValueError(f'DMC layout does not fit {len(student["subjects"])} subjects')
    tbl.drawOn(c, LEFT, yy(table_bottom))

    c.setFillColor(LIGHT)
    c.roundRect(LEFT, yy(summary_y-2*mm), INNER_W, 8*mm, 1.3*mm, fill=1, stroke=0)
    c.setFillColor(DARK)
    c.setFont('Helvetica-Bold', 8)
    pct = str(student['percentage']).strip()
    if not pct.endswith('%'):
        pct += '%'
    for x, text in [(.16, f'Percentage: {pct}'),
                    f'Grade: {student["grade"]}',
                    (.82, f'Result: {student["result"]}')]:
        c.drawCentredString(LEFT+INNER_W*x, yy(summary_y+1*mm),
                            _fit(text, 'Helvetica-Bold', 8, INNER_W*.28))

    c.setFont('Helvetica', 7.4)
    c.setFillColor(MUTED)
    c.drawString(LEFT, yy(footer_y), 'Principal Signature: _____________________')
    issued = meta.get('issue_date') or date.today()
    if isinstance(issued, (date, datetime)):
        issued = issued.strftime('%d-%m-%Y')
    c.drawRightString(RIGHT, yy(footer_y), f'Date Issued: {issued}')


def generate_bulk_dmc(output: io.BytesIO, meta: dict, students: list) -> dict:
    """Generate PDF and return {'total', 'success', 'skipped'}.

    Validation errors skip individual records. Rendering errors fail the entire
    operation; no partial PDF is returned as a successful result.
    """
    if not isinstance(output, io.BytesIO):
        raise TypeError('output must be an io.BytesIO')
    if not isinstance(meta, dict) or REQUIRED_META - meta.keys():
        raise ValueError(f'meta is missing: {sorted(REQUIRED_META - set(meta or {}))}')
    if not isinstance(students, list) or not students:
        raise ValueError('students must be a non-empty list')
    valid, skipped = [], []
    for index, student in enumerate(students):
        try:
            _validate_student(student, index)
            valid.append(student)
        except ValueError as exc:
            skipped.append({'index': index,
                            'name': student.get('student_name', f'index_{index}') if isinstance(student, dict) else f'index_{index}',
                            'reason': str(exc)})
    if not valid:
        raise ValueError('No valid student records found')
    logo = _logo_reader(meta)
    temp = io.BytesIO()
    c = canvas.Canvas(temp, pagesize=A4)
    for i in range(0, len(valid), 2):
        _draw_card(c, meta, valid[i], CARD_H, logo)
        if i+1 < len(valid):
            _draw_card(c, meta, valid[i+1], 0, logo)
        c.setStrokeColor(BORDER)
        c.setDash(4, 3)
        c.line(9*mm, CARD_H, W-9*mm, CARD_H)
        c.setDash()
        c.showPage()
    c.save()
    output.write(temp.getvalue())
    logger.info('Generated %s DMCs; skipped %s', len(valid), len(skipped))
    return {'total': len(students), 'success': len(valid), 'skipped': skipped}
