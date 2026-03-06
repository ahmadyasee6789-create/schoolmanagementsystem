from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import os

def create_fee_receipt(fee, transaction, student_name, org_name="My School"):
    receipt_no = transaction.receipt_no
    filename = f"receipts/{receipt_no}.pdf"
    os.makedirs("receipts", exist_ok=True)

    c = canvas.Canvas(filename, pagesize=A4)
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
    c.drawString(50, height - 260, f"Status: {fee.status}")

    c.drawString(50, height - 300, "Signature: _____________________")
    c.showPage()
    c.save()

    return filename