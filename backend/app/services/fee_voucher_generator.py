import io
from decimal import Decimal, InvalidOperation
from typing import Mapping, Sequence

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle


INK = colors.HexColor("#202020")
SOFT_BLUE = colors.HexColor("#e8f1fa")
PALE_GREY = colors.HexColor("#f0f2f4")
MAX_FEE_ITEMS = 7


def _money(value) -> Decimal:
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"Invalid money value: {value!r}") from exc
    if not amount.is_finite() or amount < 0:
        raise ValueError("Fee amounts, arrears and discounts must be nonnegative")
    return amount
def _rs(amount: Decimal) -> str:
    return f"{amount:,.2f}" if amount % 1 else f"{amount:,.0f}"


def _in_words(n: int) -> str:
    """English words, suitable for integer PKR amounts below one billion."""
    if n == 0:
        return "Zero"
    if not 0 <= n < 1_000_000_000:
        return str(n)
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
            "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
            "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def under_thousand(v):
        chunks = []
        if v >= 100:
            chunks.append(f"{ones[v // 100]} Hundred")
            v %= 100
        if v >= 20:
            chunks.append(tens[v // 10] + (f" {ones[v % 10]}" if v % 10 else ""))
        elif v:
            chunks.append(ones[v])
        return " ".join(chunks)

    groups = [(1_000_000, "Million"), (1000, "Thousand"), (1, "")]
    parts = []
    for size, label in groups:
        qty, n = divmod(n, size)
        if qty:
            parts.append(f"{under_thousand(qty)} {label}".strip())
    return " ".join(parts)


def _amount_in_words(amount: Decimal) -> str:
    rupees = int(amount)
    paisa = int((amount - rupees) * 100)
    base = f"{_in_words(rupees)} Rupees"
    return base + (f" and {_in_words(paisa)} Paisa Only" if paisa else " Only")


def _fit(c, value, x, y, width, *, font="Helvetica", max_size=8, min_size=5.5, centered=False):
    """Fit single-line text safely inside a specified width."""
    value = str(value or "-")
    size = max_size
    while size > min_size and stringWidth(value, font, size) > width:
        size -= 0.25
    if stringWidth(value, font, size) > width:
        while value and stringWidth(value + "...", font, min_size) > width:
            value = value[:-1]
        value += "..."
    c.setFont(font, size)
    if centered:
        c.drawCentredString(x + width/2, y, value)
    else:
        c.drawString(x, y, value)


def _draw_copy(c: canvas.Canvas, left: float, bottom: float, w: float, h: float,
               label: str, school: Mapping, student: Mapping, voucher: Mapping,
               items: Sequence[Mapping], current_total: Decimal, arrears: Decimal,
               discount: Decimal, total_payable: Decimal, received: Decimal,
               balance: Decimal, status: str, payment: Mapping):
    c.saveState()
    c.translate(left, bottom)
    c.setStrokeColor(INK)
    c.setLineWidth(0.8)
    c.rect(0, 0, w, h)

    # Uploaded images are validated in memory; paths are only for trusted callers.
    logo = school.get("logo_image") or school.get("logo_path")
    if logo:
        try:
            c.drawImage(logo, 6*mm, h-26*mm, width=20*mm, height=20*mm,
                        preserveAspectRatio=True, anchor="c", mask="auto")
        except Exception:
            pass  # Missing logo should not prevent fee voucher generation.

    # Equal left/right space keeps the title centered on the copy, even with a logo.
    heading_margin = 30*mm if logo else 6*mm
    heading_width = w - 2*heading_margin
    _fit(c, school.get("school_name", "School Name"), heading_margin, h-12*mm,
         heading_width, font="Times-Bold", max_size=15, min_size=8, centered=True)
    if school.get("address"):
        _fit(c, school["address"], heading_margin, h-19*mm, heading_width, max_size=8, centered=True)
    if school.get("phone"):
        _fit(c, f"Phone: {school['phone']}", heading_margin, h-25*mm, heading_width, max_size=8, centered=True)
    c.setLineWidth(0.5)
    c.line(5*mm, h-30*mm, w-5*mm, h-30*mm)

    # Keep the copy label beside the voucher label, below the school heading.
    c.setFillColor(SOFT_BLUE)
    label_w = 32*mm
    c.rect(w-label_w-5*mm, h-42*mm, label_w, 8*mm, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(w-label_w/2-5*mm, h-39.2*mm, label)

    title_w, title_h = 45*mm, 8*mm
    c.roundRect((w-title_w)/2, h-42*mm, title_w, title_h, radius=1.4*mm)
    c.setFont("Times-Bold", 12)
    c.drawCentredString(w/2, h-39.4*mm, "FEE VOUCHER")

    # Two aligned columns of information, no overflow into the neighbouring copy.
    left_rows = [
        ("Student", student.get("student_name")),
        ("Father", student.get("father_name")),
        ("Class / Sec.", student.get("class_section")),
        ("Student ID", student.get("student_id")),
        ("Session", student.get("session")),
    ]
    right_rows = [
        ("Voucher No.", voucher.get("voucher_no")),
        ("Fee Month", voucher.get("fee_month")),
        ("Issue Date", voucher.get("issue_date")),
        ("Due Date", voucher.get("due_date")),
        ("Status", status),
    ]
    for i, ((l1, v1), (l2, v2)) in enumerate(zip(left_rows, right_rows)):
        y = h - (50.5 + i * 6.2)*mm
        c.setFont("Helvetica-Bold", 6.8)
        c.drawString(5*mm, y, f"{l1}:")
        c.drawString(72*mm, y, f"{l2}:")
        _fit(c, v1, 24*mm, y, 46*mm, max_size=7.2)
        _fit(c, v2, 90*mm, y, w-95*mm, max_size=7.2)
    c.setLineWidth(0.35)
    c.line(5*mm, h-80*mm, w-5*mm, h-80*mm)

    table_data = [["S.No", "Description", "Amount (PKR)"]]
    for i, item in enumerate(items, 1):
        table_data.append([str(i), str(item["description"])[:32], _rs(_money(item["amount"]))])
    table_data.extend([
        ["Total Current Fees", "", _rs(current_total)],
        ["Previous Arrears", "", _rs(arrears)],
        ["Discount (-)", "", _rs(discount)],
        ["TOTAL PAYABLE", "", _rs(total_payable)],
    ])
    table_width = w - 10*mm
    tbl = Table(table_data,
                colWidths=[13*mm, table_width-13*mm-33*mm, 33*mm],
                rowHeights=[7*mm] + [5.8*mm] * len(items) + [6.2*mm] * 4)
    tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#666666")),
        ("BACKGROUND", (0, 0), (-1, 0), SOFT_BLUE),
        ("BACKGROUND", (0, -4), (-1, -2), PALE_GREY),
        ("BACKGROUND", (0, -1), (-1, -1), SOFT_BLUE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -4), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("FONTSIZE", (0, -1), (-1, -1), 8.2),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 1), (2, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("SPAN", (0, -4), (1, -4)),
        ("SPAN", (0, -3), (1, -3)),
        ("SPAN", (0, -2), (1, -2)),
        ("SPAN", (0, -1), (1, -1)),
        ("ALIGN", (0, -4), (1, -1), "CENTER"),
    ]))
   
   
    _, table_h = tbl.wrapOn(c, table_width, h)
    table_bottom = h-85*mm-table_h
    tbl.drawOn(c, 5*mm, table_bottom)

    # Payment area stays blank before collection and can be reprinted with
    # confirmed backend transactions after fee collection.
    y_words = table_bottom-5.3*mm
    c.setFont("Helvetica-Bold", 7.4)
    c.drawString(5*mm, y_words, "Amount in Words:")
    _fit(c, _amount_in_words(total_payable), 32*mm, y_words,
         w-37*mm, max_size=7.2)
    pay_y = table_bottom-13*mm
    c.setFont("Helvetica-Bold", 7.1)
    c.drawString(5*mm, pay_y, "Received:")
    c.drawString(72*mm, pay_y, "Balance:")
    _fit(c, _rs(received) if received else "________", 23*mm, pay_y,
         44*mm, max_size=7.3)
    _fit(c, _rs(balance), 88*mm, pay_y, w-94*mm, max_size=7.3)

    pay_y2 = table_bottom-20.5*mm
    c.setFont("Helvetica-Bold", 7.1)
    c.drawString(5*mm, pay_y2, "Txn ID:")
    c.drawString(72*mm, pay_y2, "Paid On:")
    _fit(c, payment.get("transaction_id", "") if received else "________",
         20*mm, pay_y2, 48*mm, max_size=7)
    _fit(c, payment.get("payment_date", "") if received else "________",
         88*mm, pay_y2, w-94*mm, max_size=7)

    # Wet-ink signature and physical stamp areas are deliberately left clear.
    c.setLineWidth(0.5)
    footer_y = 12*mm
    for center, caption, line_w in [
        (25*mm, "Prepared By", 34*mm),
        (70*mm, "Accountant Sign", 37*mm),
        (116*mm, "School Stamp", 35*mm),
    ]:
        c.line(center-line_w/2, footer_y, center+line_w/2, footer_y)
        c.setFont("Helvetica", 6.7)
        c.drawCentredString(center, footer_y-4*mm, caption)
    c.setFont("Helvetica-Oblique", 6)
    c.drawCentredString(w/2, 2.8*mm,
                        "Valid as payment proof only after fee collection, signature and stamp")
    c.restoreState()


def generate_fee_voucher(
    output: io.BytesIO, *, school: Mapping, student: Mapping,
    voucher: Mapping, fee_items: Sequence[Mapping], payment: Mapping | None = None
) -> dict:
    """Write a one-page A4 landscape, two-copy PDF to ``output``.

    ``payment`` should come from **confirmed, persisted** fee transactions.
    If no payment exists, omit it / use None; printed signature and stamp stay blank.
    """
    if not hasattr(output, "write"):
        raise TypeError("output must be a writable binary stream")
    c = canvas.Canvas(output, pagesize=landscape(A4))
    result = _draw_voucher_page(c, school=school, student=student, voucher=voucher,
                                fee_items=fee_items, payment=payment)
    c.save()
    return result


def generate_fee_vouchers(output: io.BytesIO, vouchers: Sequence[Mapping]) -> int:
    """Write one two-copy page per voucher into a single printable PDF."""
    if not hasattr(output, "write"):
        raise TypeError("output must be a writable binary stream")
    if not vouchers:
        raise ValueError("At least one voucher is required")
    c = canvas.Canvas(output, pagesize=landscape(A4))
    for voucher_data in vouchers:
        _draw_voucher_page(c, **voucher_data)
    c.save()
    return len(vouchers)


def _draw_voucher_page(
    c: canvas.Canvas, *, school: Mapping, student: Mapping,
    voucher: Mapping, fee_items: Sequence[Mapping], payment: Mapping | None = None
) -> dict:
    if not fee_items or len(fee_items) > MAX_FEE_ITEMS:
        raise ValueError(f"fee_items must contain between 1 and {MAX_FEE_ITEMS} rows")
    for name in ("student_name", "student_id", "class_section"):
        if not student.get(name):
            raise ValueError(f"Missing student field: {name}")
    for name in ("voucher_no", "fee_month", "due_date"):
        if not voucher.get(name):
            raise ValueError(f"Missing voucher field: {name}")

    current_total = sum((_money(item["amount"]) for item in fee_items), Decimal("0"))
    arrears = _money(voucher.get("arrears", 0))
    discount = _money(voucher.get("discount", 0))
    total_payable = current_total + arrears - discount
    if discount > current_total:
        raise ValueError("Discount cannot exceed current fees")
    payment = payment or {}
    received = _money(payment.get("amount_received", 0))
    if received > total_payable:
        raise ValueError("Received amount exceeds total payable; reconcile payments")
    balance = total_payable - received
    status = "PAID" if received == total_payable and total_payable > 0 else (
        "PARTIAL" if received else ("NO DUES" if total_payable == 0 else "UNPAID")
    )

    page_w, page_h = landscape(A4)
    half_w = page_w/2
    margin_x, cut_gap = 6*mm, 4*mm
    copy_w = half_w - margin_x - cut_gap
    copy_bottom, copy_h = 6*mm, page_h - 12*mm

    for left, copy_label in [(margin_x, "STUDENT COPY"),
                             (half_w+cut_gap, "SCHOOL COPY")]:
        _draw_copy(c, left, copy_bottom, copy_w, copy_h,
                   copy_label, school, student, voucher, fee_items,
                   current_total, arrears, discount, total_payable,
                   received, balance, status, payment)

    c.setStrokeColor(colors.grey)
    c.setLineWidth(0.7)
    c.setDash(4, 4)
    c.line(half_w, 4*mm, half_w, page_h-4*mm)
    c.setDash()
    c.showPage()
    return {"current_total": str(current_total), "arrears": str(arrears),
            "discount": str(discount), "total_payable": str(total_payable),
            "received": str(received), "balance": str(balance), "status": status}
