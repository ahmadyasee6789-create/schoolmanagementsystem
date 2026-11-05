"""Three compact DMCs on each portrait A4 page.

Keep the original two-per-page generator unchanged. This module deliberately
reuses its validation, text fitting, and logo helpers.
"""
from __future__ import annotations

import io
import logging
from datetime import date, datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.services.dmc_generator import (
    _fit, _ordinal, _logo_reader, _validate_student,
    REQUIRED_META,
)

logger = logging.getLogger(__name__)
W, H = A4
SLOT_H = H / 3
LEFT = 12 * mm
RIGHT = W - 12 * mm
WIDTH = RIGHT - LEFT
INK = colors.HexColor('#243449')
BLUE = colors.HexColor('#24446C')
SOFT = colors.HexColor('#EDF3F8')
LINE = colors.HexColor('#CBD5E1')
MUTED = colors.HexColor('#566577')


def _str(value: Any) -> str:
    return '-' if value is None else str(value)


def _draw_dmc(c: canvas.Canvas, meta: dict, student: dict, base_y: float, logo) -> None:
    """Draw one compact DMC within a 99mm-high third of the page."""
    def y(mm_from_slot_bottom: float) -> float:
        return base_y + mm_from_slot_bottom * mm

    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.roundRect(7 * mm, y(3.8), W - 14 * mm, SLOT_H - 7.6 * mm, 1.5 * mm, stroke=1, fill=0)

    # Header with optional saved school logo.
    if logo is not None:
        c.drawImage(logo, LEFT, y(79), 13 * mm, 13 * mm,
                    preserveAspectRatio=True, anchor='c', mask='auto')
    cx = W / 2 + (5 * mm if logo is not None else 0)
    max_title = 140 * mm if logo is not None else WIDTH
    c.setFillColor(BLUE)
    c.setFont('Helvetica-Bold', 11.5)
    c.drawCentredString(cx, y(90.5), _fit(meta['school_name'].upper(), 'Helvetica-Bold', 11.5, max_title))
    c.setFillColor(INK)
    c.setFont('Helvetica-Bold', 8)
    c.drawCentredString(cx, y(86), 'DETAILED MARKS CERTIFICATE (DMC)')
    c.setFont('Helvetica', 7.5)
    exam_session = (
    f"{meta['exam_name']}  |  "
    f"Session: {meta.get('session_name', '—')}"
)
    c.drawCentredString(cx, y(82), _fit(exam_session, 'Helvetica', 7.5, max_title))
    c.setStrokeColor(LINE)
    c.line(LEFT, y(77.5), RIGHT, y(77.5))

    # Student identity, three compact rows.
    c.setFillColor(INK)
    c.setFont('Helvetica-Bold', 7.5)
    c.drawString(LEFT, y(73.4), 'Student:')
    c.setFont('Helvetica', 7.8)
    c.drawString(LEFT + 16 * mm, y(73.4), _fit(student['student_name'], 'Helvetica', 7.8, 87 * mm))
    c.setFont('Helvetica-Bold', 7.5)
    c.drawString(LEFT + 111 * mm, y(73.4), 'Roll No:')
    c.setFont('Helvetica', 7.8)
    c.drawString(LEFT + 127 * mm, y(73.4), _fit(student['roll_no'], 'Helvetica', 7.8, 36 * mm))

    c.setFont('Helvetica-Bold', 7.5)
    c.drawString(LEFT, y(69.2), 'Father:')
    c.setFont('Helvetica', 7.8)
    c.drawString(LEFT + 16 * mm, y(69.2), _fit(student['father_name'], 'Helvetica', 7.8, 87 * mm))
    c.setFont('Helvetica-Bold', 7.5)
    c.drawString(LEFT + 111 * mm, y(69.2), 'Class:')
    c.setFont('Helvetica', 7.8)
    c.drawString(LEFT + 127 * mm, y(69.2), _fit(meta['class_label'], 'Helvetica', 7.8, 36 * mm))

    c.setFont('Helvetica-Bold', 7.5)
    c.drawString(LEFT, y(65), 'Position:')
    c.setFont('Helvetica', 7.8)
    c.drawString(LEFT + 16 * mm, y(65), _ordinal(student['position']))

    # Subject names run vertically DOWN the page (one subject per row).
    col_edges = [LEFT, LEFT + 10 * mm, LEFT + 103 * mm, LEFT + 128 * mm, RIGHT]
    table_top = y(61.0)
    head_h = 4.4 * mm
    subjects = student['subjects']
    row_h = min(4.2 * mm, (40 * mm) / len(subjects))
    bottom = table_top - head_h - len(subjects) * row_h
    if bottom < y(16):
        raise ValueError('Too many subjects to fit 3 DMCs on one A4 page')

    c.setFillColor(SOFT)
    c.rect(LEFT, table_top-head_h, WIDTH, head_h, stroke=0, fill=1)
    c.setStrokeColor(LINE)
    c.rect(LEFT, bottom, WIDTH, table_top-bottom, stroke=1, fill=0)
    for edge in col_edges[1:-1]:
        c.line(edge, bottom, edge, table_top)
    c.line(LEFT, table_top-head_h, RIGHT, table_top-head_h)

    c.setFillColor(INK)
    c.setFont('Helvetica-Bold', 7.2)
    headers = ['#', 'SUBJECT', 'TOTAL', 'OBTAINED']
    centers = [(col_edges[i]+col_edges[i+1])/2 for i in range(4)]
    head_baseline = table_top - 3.15 * mm
    for idx, text in enumerate(headers):
        if idx == 1:
            c.drawString(col_edges[idx] + 2 * mm, head_baseline, text)
        else:
            c.drawCentredString(centers[idx], head_baseline, text)

    for idx, subject in enumerate(subjects):
        row_top = table_top - head_h - idx * row_h
        row_bottom = row_top - row_h
        baseline = row_bottom + (row_h - 7.2)/2 + 1
        if idx:
            c.setStrokeColor(LINE)
            c.setLineWidth(.3)
            c.line(LEFT, row_top, RIGHT, row_top)
        c.setFillColor(INK)
        c.setFont('Helvetica', 7.2)
        c.drawCentredString(centers[0], baseline, str(idx+1))
        c.drawString(col_edges[1] + 2*mm, baseline,
                     _fit(subject['name'], 'Helvetica', 7.2, 89*mm))
        c.drawCentredString(centers[2], baseline, _str(subject['total']))
        c.drawCentredString(centers[3], baseline, _str(subject['obtained']))

    # Summary is below the table; never overlaps it.
    summary_y = bottom - 4.0 * mm
    percent = str(student['percentage'])
    if not percent.endswith('%'):
        percent += '%'
    summary_parts = [
        f"Total: {_str(student['grand_total'])}",
        f"Obtained: {_str(student['obtained_total'])}",
        f"Percentage: {percent}",
        f"Grade: {_str(student.get('grade', '-'))}",
        f"Result: {_str(student['result'])}",
    ]
    c.setFont('Helvetica-Bold', 7.2)
    c.setFillColor(BLUE)
    summary = '   |   '.join(summary_parts)
    c.drawCentredString(W/2, summary_y, _fit(summary, 'Helvetica-Bold', 7.2, WIDTH))

    issued = meta.get('issue_date') or date.today()
    if isinstance(issued, (date, datetime)):
        issued = issued.strftime('%d-%m-%Y')
    c.setFont('Helvetica', 7)
    c.setFillColor(MUTED)
    c.drawString(LEFT, y(6.5), 'Class Teacher: __________________')
    c.drawCentredString(W/2, y(6.5), 'Principal: __________________')
    c.drawRightString(RIGHT, y(6.5), f'Date: {_str(issued)}')


def generate_bulk_dmc_three(output: io.BytesIO, meta: dict, students: list) -> dict:
    """Generate 3 vertically stacked student DMCs per A4 sheet.

    Same data contract as generate_bulk_dmc(). Invalid student records are
    skipped, with a report. No partial PDF is returned after rendering failure.
    """
    if not isinstance(output, io.BytesIO):
        raise TypeError('output must be an io.BytesIO')
    if not isinstance(meta, dict) or REQUIRED_META - meta.keys():
        raise ValueError(f'meta is missing: {sorted(REQUIRED_META - set(meta or {}))}')
    if not isinstance(students, list) or not students:
        raise ValueError('students must be a non-empty list')
    valid = []
    skipped = []
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
    for start in range(0, len(valid), 3):
        for slot, student in enumerate(valid[start:start+3]):
            base_y = H - (slot+1)*SLOT_H
            _draw_dmc(c, meta, student, base_y, logo)
        c.setStrokeColor(LINE)
        c.setDash(3, 3)
        for slot_line in (1, 2):
            yy = H - slot_line*SLOT_H
            c.line(7*mm, yy, W-7*mm, yy)
        c.setDash()
        c.showPage()
    c.save()
    output.write(temp.getvalue())
    logger.info('Generated %s three-up DMCs; skipped %s', len(valid), len(skipped))
    return {'total': len(students), 'success': len(valid), 'skipped': skipped}
