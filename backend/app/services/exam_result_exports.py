"""Serialize the same saved result sheet to CSV, Excel and printable PDF."""
import csv
from io import BytesIO, StringIO
from xml.sax.saxutils import escape

from fastapi import Response
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image

from app.services.school_logo import organization_logo


def matrix(sheet, summary=False):
    columns = sheet['columns']
    headers = ['Roll number', 'Student name', 'Admission number']
    if summary:
        headers += ['Class']
    headers += [f"{c['subject_name']} ({c['total_marks']})" for c in columns]
    if summary:
        headers += ['Obtained / Possible', 'Percentage', 'Grade', 'Failed subjects', 'Overall result']
    rows = []
    for student in sheet['items']:
        subjects = {s['key']: s for s in student['subjects']}
        row = [student['roll_number'] or '', student['student_name'], student['admission_no'] or '']
        if summary:
            row += [f"{student['grade_name'] or ''} {student['section'] or ''}".strip()]
        row += [(subjects[c['key']]['obtained_marks'] if subjects[c['key']]['obtained_marks'] is not None else 'Missing')
                if c['key'] in subjects else 'N/A' for c in columns]
        if summary:
            row += [f"{student['obtained_total']} / {student['possible_total']}",
                    student['percentage'] if student['percentage'] is not None else 'Incomplete',
                    student['grade'] or 'Unassigned', student['failed_count'], student['result']]
        rows.append(row)
    return headers, rows


def csv_value(value):
    # Spreadsheet formula injection applies to text, including student names
    # and subject headings. Numeric marks (including zero) remain numeric.
    if isinstance(value, str) and value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')):
        return "'" + value
    return value


def export_sheet(sheet, format, summary=False, organization=None, filters=''):
    headers, rows = matrix(sheet, summary)
    if format == 'csv':
        out = StringIO(newline='')
        csv.writer(out).writerows([[csv_value(v) for v in row] for row in [headers, *rows]])
        data, media = out.getvalue().encode('utf-8-sig'), 'text/csv; charset=utf-8'
    elif format == 'xlsx':
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = 'Exam results' if summary else 'Marks sheet'
        for row in [headers, *rows]:
            worksheet.append(row)
            for cell in worksheet[worksheet.max_row]:
                if isinstance(cell.value, str):
                    cell.data_type = 's'  # Keep names and IDs literal, never formulas.
        for cell in worksheet[1]:
            cell.font = Font(bold=True, color='FFFFFF')
            cell.fill = PatternFill('solid', fgColor='654AC2')
        worksheet.freeze_panes = 'D2'
        worksheet.auto_filter.ref = worksheet.dimensions
        for column in worksheet.columns:
            worksheet.column_dimensions[column[0].column_letter].width = min(42, max(16, len(str(column[0].value)) + 2))
        info = workbook.create_sheet('Report details')
        for row in [('Exam', sheet['exam_name']), ('Academic session', sheet['session_name']), ('Filters', filters), ('Source', 'Saved database marks only')]:
            info.append(row)
            for cell in info[info.max_row]:
                cell.data_type = 's'
        out = BytesIO()
        workbook.save(out)
        data, media = out.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    else:
        data, media = pdf_sheet(sheet, organization, filters), 'application/pdf'
    return Response(data, media_type=media, headers={
        'Content-Disposition': f'attachment; filename="exam_{sheet["exam_id"]}_{"results" if summary else "marks"}.{format}"',
        'Cache-Control': 'private, no-store',
    })


def pdf_sheet(sheet, organization, filters):
    """Split wide subjects into readable bands; paginate student rows vertically."""
    out = BytesIO()
    document = SimpleDocTemplate(out, pagesize=landscape(A4), leftMargin=24, rightMargin=24, topMargin=28, bottomMargin=28)
    text = ParagraphStyle('cell', fontName='Helvetica', fontSize=8, leading=10.5)
    title = ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=15, leading=19, spaceAfter=7)
    story = []
    columns = sheet['columns']
    bands = [columns[i:i+4] for i in range(0, len(columns), 4)] or [[]]
    logo = organization_logo(organization)
    for index, band in enumerate(bands):
        if index:
            story.append(PageBreak())
        if logo:
            width, height = logo.getSize()
            factor = min(72 / width, 42 / height)
            story.append(Image(BytesIO(organization.logo), width=width*factor, height=height*factor, hAlign='LEFT'))
        story.append(Paragraph(escape(organization.name if organization else 'Examination report'), title))
        story.append(Paragraph(escape(f"{sheet['exam_name']} | {sheet['session_name']} | {filters}"), text))
        story.append(Paragraph(f'Subject group {index+1} of {len(bands)}. Missing = marks not saved; N/A = subject not assigned to that class.', text))
        story.append(Spacer(1, 12))
        headers, rows = matrix({**sheet, 'columns': band}, summary=True)
        cells = [[Paragraph(escape(str(value)), text) for value in row] for row in [headers, *rows]]
        width = document.width
        widths = [40, 92, 58, 58] + [53] * len(band)
        widths += [60, 64, 60, 52, width - sum(widths) - 60 - 64 - 60 - 52]
        table = Table(cells, colWidths=widths, repeatRows=1, hAlign='LEFT')
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EEEAF8')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('GRID', (0, 0), (-1, -1), .35, colors.HexColor('#D9DDE5')),
            ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(table)

    def footer(canvas, doc):
        canvas.setFont('Helvetica', 8)
        canvas.drawString(24, 14, 'Saved database results - read-only export')
        canvas.drawRightString(landscape(A4)[0]-24, 14, f'Page {doc.page}')
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return out.getvalue()
