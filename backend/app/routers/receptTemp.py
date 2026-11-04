from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from io import BytesIO

def render_fee_receipt(fee, transaction, student_name, org_name="My School"):
    receipt_no = transaction.receipt_no
    output = BytesIO()

    c = canvas.Canvas(output, pagesize=A4)
    width, height = A4

    # Header
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, height - 50, org_name)
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 70, "Fee Receipt")

    # Receipt info
    c.drawString(50, height - 120, f"Receipt No: {receipt_no}")
    c.drawString(50, height - 140, f"Date: {transaction.payment_date}")
    c.drawString(50, height - 160, f"Student: {student_name}")
    c.drawString(50, height - 180, f"Class: {fee.class_id}")

    # Amount
    c.drawString(50, height - 220, f"Paid Amount: Rs. {transaction.amount}")
    c.drawString(50, height - 240, f"Total Fee: Rs. {fee.final_amount}")
    status = transaction.fee_status_after
    # A historical balance cannot be reconstructed from legacy receipt fields.
    if status:
        c.drawString(50, height - 260, f"Status after payment: {status}")

    c.drawString(50, height - 300, "Signature: _____________________")
    c.showPage()
    c.save()

    return output.getvalue()


def render_multi_fee_receipt(info, *, logo_image=None):
    """Render immutable issue-time data, including advance-only cash receipts."""
    from html import escape
    from decimal import Decimal
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Flowable, SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    output = BytesIO()
    styles = getSampleStyleSheet()
    def paragraph(value, style="Normal"):
        return Paragraph(escape(str(value)), styles[style])
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=50, leftMargin=50, topMargin=45, bottomMargin=45)
    title = paragraph(info["school_name"], "Title")
    if logo_image is not None:
        class ReceiptLogo(Flowable):
            def __init__(self):
                super().__init__()
                image_width, image_height = logo_image.getSize()
                scale = 44 / max(image_width, image_height)
                self.width, self.height = image_width * scale, image_height * scale

            def draw(self):
                self.canv.drawImage(logo_image, 0, 0, width=self.width, height=self.height, mask="auto")

        # Reserve the same width on either side so the title stays centered.
        side = 56
        title = Table([[ReceiptLogo(), title, ""]], colWidths=[side, doc.width - 12 - 2 * side, side],
                      style=[("VALIGN", (0, 0), (-1, -1), "MIDDLE")])
    story = [title, paragraph("Fee Receipt", "Heading2"), Spacer(1, 12)]
    for label, value in (("Receipt", info["receipt_no"]), ("Date", info["payment_date"]),
                         ("Student", info["student_name"]), ("Academic session", info["session_name"]),
                         ("Class", ", ".join(info["class_names"]) or "No monthly obligation selected"),
                         ("Method", info["payment_method"] or "Not recorded"),
                         ("Cash received", "Rs. " + info["cash_received"])):
        story.append(paragraph(f"{label}: {value}"))
    story.append(Spacer(1, 16))
    at_issue = info["balance_basis"] == "at_issue"
    balance_label = "Balance at issue (Rs.)" if at_issue else "Current balance (Rs.)"
    rows = [[paragraph(h) for h in ("Month", "Class ID", "Yearly discount (Rs.)", "This payment (Rs.)", balance_label)]]
    applied = {}
    for allocation in info["allocations"]:
        month = allocation["billing_period"]
        applied[month] = applied.get(month, Decimal(0)) + Decimal(allocation["amount"])
    for fee in info["obligations"]:
        rows.append([paragraph(fee["billing_period"]), paragraph(fee["class_id"]), paragraph(fee.get("yearly_discount_amount", "0.00")),
                     paragraph(format(applied.get(fee["billing_period"], Decimal(0)), ".2f")), paragraph(fee["outstanding"])])
    if len(rows) > 1:
        table = Table(rows, colWidths=[75, 55, 110, 125, 110], repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")),
                                   ("GRID", (0, 0), (-1, -1), .4, colors.lightgrey),
                                   ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                   ("TOPPADDING", (0, 0), (-1, -1), 8),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
        story.append(table)
    else:
        story.append(paragraph("Advance payment: no monthly obligations covered at issue."))
    credit_label = "Unapplied credit from this payment at issue: Rs. " if at_issue else "Current unapplied credit from this payment: Rs. "
    note = ("Balances shown are recorded at issue. Later credit applications appear in payment history." if at_issue
            else "Legacy receipt: balances and allocations are current; historical balances at issue were not recorded.")
    remaining = sum((Decimal(f["outstanding"]) for f in info["obligations"]), Decimal(0))
    story.extend([Spacer(1, 16), paragraph("Remaining balance of selected months: Rs. " + format(remaining, ".2f")),
                  paragraph(credit_label + info["remaining_advance_credit"]),
                  paragraph(note),
                  Spacer(1, 24), paragraph("Signature: _____________________")])
    doc.build(story)
    return output.getvalue()
