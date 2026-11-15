"""Render saved exam results as a printable PDF."""
from collections import defaultdict
from io import BytesIO
from xml.sax.saxutils import escape

from fastapi import Response
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

from app.services.school_logo import organization_logo


def export_pdf(sheet, organization=None, filters=''):
    data = pdf_sheet(sheet, organization, filters)
    return Response(data, media_type='application/pdf', headers={
        'Content-Disposition': f'attachment; filename="exam_{sheet["exam_id"]}_results.pdf"',
        'Cache-Control': 'private, no-store',
    })


def pdf_sheet(sheet, organization, filters):
    """Render one complete subject table, paginating students vertically."""
    out = BytesIO()
    document = SimpleDocTemplate(out, pagesize=landscape(A4), leftMargin=18, rightMargin=18, topMargin=24, bottomMargin=24)
    text = ParagraphStyle('cell', fontName='Helvetica', fontSize=6.5, leading=6.5, wordWrap='CJK')
    title = ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=14, leading=17, spaceAfter=5)
    story = []
    columns = sheet['columns']
    logo = organization_logo(organization)
    if logo:
        width, height = logo.getSize()
        factor = min(68 / width, 36 / height)
        story.append(Image(BytesIO(organization.logo), width=width*factor, height=height*factor, hAlign='LEFT'))
    story.append(Paragraph(escape(organization.name if organization else 'Examination report'), title))
    story.append(Paragraph(escape(f"{sheet['exam_name']} | {sheet['session_name']} | {filters}"), text))
    story.append(Paragraph('Missing = marks not saved; N/A = subject not assigned to that class.', text))
    story.append(Spacer(1, 7))

    headers = ['Roll no.', 'Student', 'Admission no.', 'Class / Section']
    headers += [f"{c['subject_name']} ({c['total_marks']})" for c in columns]
    headers += ['Obtained', 'Possible', '%', 'Grade', 'Result', 'Position']
    positions = {}
    by_class = defaultdict(list)
    for student in sheet.get('ranking_items', sheet['items']):
        if student['result'] != 'INCOMPLETE' and student['percentage'] is not None:
            by_class[(student.get('classroom_id'), student.get('grade_name'), student.get('section'))].append(student)
    for students in by_class.values():
        ranked = sorted(students, key=lambda row: row['obtained_total'], reverse=True)
        previous_total, previous_position = None, 0
        for index, student in enumerate(ranked, start=1):
            if student['obtained_total'] != previous_total:
                previous_position = index
            positions[student['enrollment_id']] = previous_position
            previous_total = student['obtained_total']

    rows = []
    for student in sheet['items']:
        subjects = {s['key']: s for s in student['subjects']}
        row = [student.get('roll_number') or '', student['student_name'], student.get('admission_no') or '',
               f"{student.get('grade_name') or ''} {student.get('section') or ''}".strip()]
        row += [(subjects[c['key']]['obtained_marks'] if subjects[c['key']]['obtained_marks'] is not None else 'Missing')
                if c['key'] in subjects else 'N/A' for c in columns]
        row += [student['obtained_total'], student['possible_total'],
                f"{student['percentage']}%" if student['percentage'] is not None else 'Incomplete',
                student.get('grade') or 'Unassigned', student['result'],
                positions.get(student['enrollment_id'], '—')]
        rows.append(row)
    cells = [[Paragraph(escape(str(value)), text) for value in row] for row in [headers, *rows]]
    # Allocate widths from the actual labels and data, then scale the complete
    # matrix to the printable width so no subject is omitted or overflows A4.
    desired = [max(30, min(70, max(len(str(r[i])) for r in [headers, *rows]) * 3.0 + 10)) for i in range(len(headers))]
    for i in range(4, 4 + len(columns)):
        desired[i] = max(21, min(66, max(len(str(headers[i])), 5) * 2.8 + 8))
    widths = [value * document.width / sum(desired) for value in desired]
    table = Table(cells, colWidths=widths, repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E8EAF2')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#26324A')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), .3, colors.HexColor('#D1D5DF')),
        ('LEFTPADDING', (0, 0), (-1, -1), 2), ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(table)

    def footer(canvas, doc):
        canvas.setFont('Helvetica', 8)
        canvas.drawString(24, 14, 'Saved database results - read-only export')
        canvas.drawRightString(landscape(A4)[0]-24, 14, f'Page {doc.page}')
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return out.getvalue()
