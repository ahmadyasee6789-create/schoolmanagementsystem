"""Render saved exam results as a printable PDF."""
import os
import re
from collections import defaultdict
from datetime import datetime
from io import BytesIO
from xml.sax.saxutils import escape

from fastapi import Response
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from starlette.concurrency import run_in_threadpool

from app.services.school_logo import organization_logo

try:  # optional: needed only for Arabic / Urdu names
    import arabic_reshaper  # type: ignore[import-not-found]
    try:
        from bidi import get_display  # type: ignore[import-not-found]  # python-bidi >= 0.5
    except ImportError:
        from bidi.algorithm import get_display  # type: ignore[import-not-found]  # older versions
except ImportError:  # pragma: no cover
    arabic_reshaper = get_display = None

PAGE = landscape(A4)
MARGIN = 18
FOOTER_Y = 14
RTL_RE = re.compile(r'[\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]')

NAVY = colors.HexColor('#26324A')
HEADER_BG = colors.HexColor('#E8EAF2')
GRID = colors.HexColor('#D1D5DF')
ZEBRA = colors.HexColor('#F7F8FB')
FAIL_RED = colors.HexColor('#B42318')

# --------------------------------------------------------------------------
# Fonts: Helvetica has no Arabic/Urdu/CJK glyphs, so prefer a Unicode TTF.
# Set EXAM_PDF_FONT / EXAM_PDF_FONT_BOLD to a path, or install DejaVu/Noto.
# --------------------------------------------------------------------------
_FONT_CANDIDATES = [
    (os.getenv('EXAM_PDF_FONT'), os.getenv('EXAM_PDF_FONT_BOLD')),
    ('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
     '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'),
    ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
     '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
]
_fonts = None


def fonts():
    """Return (regular, bold) font names, registering a TTF once if found."""
    global _fonts
    if _fonts:
        return _fonts
    for regular, bold in _FONT_CANDIDATES:
        if regular and bold and os.path.exists(regular) and os.path.exists(bold):
            pdfmetrics.registerFont(TTFont('ExamFont', regular))
            pdfmetrics.registerFont(TTFont('ExamFont-Bold', bold))
            _fonts = ('ExamFont', 'ExamFont-Bold')
            return _fonts
    _fonts = ('Helvetica', 'Helvetica-Bold')  # Latin-only fallback
    return _fonts


# --------------------------------------------------------------------------
# Formatting helpers
# --------------------------------------------------------------------------
def shape(value):
    """Prepare text for display: reshape and reorder RTL scripts when possible."""
    text = '' if value is None else str(value)
    if get_display and RTL_RE.search(text):
        text = get_display(arabic_reshaper.reshape(text))
    return text


def fmt_num(value):
    if value is None:
        return ''
    number = float(value)
    return str(int(number)) if number.is_integer() else f'{number:.2f}'.rstrip('0').rstrip('.')


def fmt_pct(value):
    return 'Incomplete' if value is None else f'{float(value):.1f}%'


def safe_filename_part(value):
    return re.sub(r'[^A-Za-z0-9_-]', '', str(value)) or 'export'


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------
def export_pdf(sheet, organization=None, filters=''):
    data = pdf_sheet(sheet, organization, filters)
    name = safe_filename_part(sheet['exam_id'])
    return Response(data, media_type='application/pdf', headers={
        'Content-Disposition': f'attachment; filename="exam_{name}_results.pdf"',
        'Cache-Control': 'private, no-store',
    })


async def export_pdf_async(sheet, organization=None, filters=''):
    """Use this from `async def` routes so ReportLab doesn't block the event loop."""
    return await run_in_threadpool(export_pdf, sheet, organization, filters)


def pdf_sheet(sheet, organization, filters):
    """Render one complete subject table, paginating students vertically."""
    columns = sheet['columns']
    positions = compute_positions(sheet.get('ranking_items', sheet['items']))
    styles = make_styles(len(columns))
    headers, rows = build_rows(sheet, columns, positions)

    out = BytesIO()
    document = SimpleDocTemplate(out, pagesize=PAGE, leftMargin=MARGIN, rightMargin=MARGIN,
                                 topMargin=24, bottomMargin=28)
    story = build_header(sheet, organization, filters, styles)
    story.append(build_table(headers, rows, len(columns), document.width, styles))

    generated = datetime.now().strftime('%Y-%m-%d %H:%M')
    document.build(story, canvasmaker=numbered_canvas(generated))
    return out.getvalue()


# --------------------------------------------------------------------------
# Ranking
# --------------------------------------------------------------------------
def compute_positions(students):
    """Competition ranking ("1224") per class, by percentage.

    Percentage is used instead of the raw total so students with different
    possible totals (e.g. a subject that is N/A for their class) compare fairly.
    """
    by_class = defaultdict(list)
    for s in students:
        if s['result'] != 'INCOMPLETE' and s['percentage'] is not None:
            by_class[(s.get('classroom_id'), s.get('grade_name'), s.get('section'))].append(s)

    positions = {}
    for group in by_class.values():
        ranked = sorted(group, key=lambda r: float(r['percentage']), reverse=True)
        previous_score, previous_position = None, 0
        for index, s in enumerate(ranked, start=1):
            score = float(s['percentage'])
            if score != previous_score:
                previous_position = index
            positions[s['enrollment_id']] = previous_position
            previous_score = score
    return positions


# --------------------------------------------------------------------------
# Rows
# --------------------------------------------------------------------------
def build_rows(sheet, columns, positions):
    headers = ['Roll no.', 'Student', 'Admission no.', 'Class']
    headers += [f"{c['subject_name']} ({fmt_num(c['total_marks'])})" for c in columns]
    headers += ['Obtained', 'Possible', '%', 'Result', 'Position']

    rows = []
    for student in sheet['items']:
        subjects = {s['key']: s for s in student['subjects']}
        row = [
            student.get('roll_number') or '',
            student['student_name'],
            student.get('admission_no') or '',
            f"{student.get('grade_name') or ''} {student.get('section') or ''}".strip(),
        ]
        for c in columns:
            subject = subjects.get(c['key'])
            if subject is None:
                row.append('N/A')
            elif subject['obtained_marks'] is None:
                row.append('Missing')
            else:
                row.append(fmt_num(subject['obtained_marks']))
        row += [
            fmt_num(student['obtained_total']),
            fmt_num(student['possible_total']),
            fmt_pct(student['percentage']),
            student['result'],
            positions.get(student['enrollment_id'], '—'),
        ]
        rows.append(row)
    return headers, rows


# --------------------------------------------------------------------------
# Layout
# --------------------------------------------------------------------------
def make_styles(subject_count):
    regular, bold = fonts()
    # Shrink type as the exam gets wider so subject columns stay legible.
    size = max(6.0, min(10.0, 10.0 - 0.35 * max(0, subject_count - 6)))
    leading = size + 2
    base = dict(fontName=regular, fontSize=size, leading=leading)
    return {
        'size': size,
        'text': ParagraphStyle('cell', **base),
        'num': ParagraphStyle('num', alignment=TA_CENTER, **base),
        'fail': ParagraphStyle('fail', alignment=TA_CENTER, textColor=FAIL_RED,
                               **{**base, 'fontName': bold}),
        'head': ParagraphStyle('head', alignment=TA_CENTER, textColor=NAVY,
                               **{**base, 'fontName': bold}),
        'head_left': ParagraphStyle('head_left', textColor=NAVY, **{**base, 'fontName': bold}),
        'title': ParagraphStyle('title', fontName=bold, fontSize=14, leading=17, spaceAfter=5),
        'meta': ParagraphStyle('meta', fontName=regular, fontSize=10, leading=12),
    }


def build_header(sheet, organization, filters, styles):
    story = []
    logo_bytes = getattr(organization, 'logo', None) if organization else None
    logo = organization_logo(organization) if logo_bytes else None
    if logo:
        try:
            width, height = logo.getSize()
            factor = min(68 / width, 36 / height)
            story.append(Image(BytesIO(logo_bytes), width=width * factor, height=height * factor,
                               hAlign='LEFT'))
        except Exception:  # a bad logo must never break the report
            pass
    name = organization.name if organization else 'Examination report'
    story.append(Paragraph(escape(shape(name)), styles['title']))
    meta = ' | '.join(str(p) for p in (sheet['exam_name'], sheet['session_name'], filters) if p)
    story.append(Paragraph(escape(shape(meta)), styles['meta']))
    story.append(Paragraph('Missing = marks not saved; N/A = subject not assigned to that class.',
                           styles['meta']))
    story.append(Spacer(1, 7))
    return story


def column_widths(headers, rows, total_width, size):
    """Size columns from measured text, then scale to exactly the printable width."""
    regular, bold = fonts()
    widths = []
    for i, header in enumerate(headers):
        longest_cell = max((pdfmetrics.stringWidth(shape(r[i]), regular, size) for r in rows),
                           default=0)
        # Headers may wrap onto several lines, so only count their longest word.
        longest_word = max((pdfmetrics.stringWidth(shape(w), bold, size)
                            for w in header.split()), default=0)
        cap = 150 if i == 1 else 90  # student names may wrap; other columns stay compact
        widths.append(min(cap, max(longest_cell, longest_word, 22)) + 6)
    scale = total_width / sum(widths)
    return [w * scale for w in widths]


def build_table(headers, rows, subject_count, total_width, styles):
    text, num, fail = styles['text'], styles['num'], styles['fail']
    left_cols = {1}  # student name is left-aligned; everything else is centred
    result_col = len(headers) - 2

    def cell(value, col):
        label = escape(shape(value))
        if col == result_col and str(value).upper() == 'FAIL':
            return Paragraph(label, fail)
        return Paragraph(label, text if col in left_cols else num)

    head = [Paragraph(escape(shape(h)), styles['head_left'] if i in left_cols else styles['head'])
            for i, h in enumerate(headers)]
    data = [head] + [[cell(v, c) for c, v in enumerate(row)] for row in rows]

    table = Table(data, colWidths=column_widths(headers, rows, total_width, styles['size']),
                  repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, ZEBRA]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), .3, GRID),
        ('LEFTPADDING', (0, 0), (-1, -1), 2), ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    return table


# --------------------------------------------------------------------------
# Footer with "Page X of Y"
# --------------------------------------------------------------------------
def numbered_canvas(generated_at):
    regular, _ = fonts()

    class NumberedCanvas(rl_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved_pages = []

        def showPage(self):
            self._saved_pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._saved_pages)
            for state in self._saved_pages:
                self.__dict__.update(state)
                self.setFont(regular, 8)
                self.drawString(MARGIN, FOOTER_Y,
                                f'Saved database results - read-only export | Generated {generated_at}')
                self.drawRightString(PAGE[0] - MARGIN, FOOTER_Y, f'Page {self._pageNumber} of {total}')
                super().showPage()
            super().save()

    return NumberedCanvas