# /backend/utils/email_sender.py
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

def send_activation_email(to_email: str, invite_token: str):
    """
    Sends an account activation email to the candidate with a full invite link.
    """

    # 1️⃣ Base SMTP setup
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    sender_email = os.getenv("EMAIL_USER")
    sender_password = os.getenv("EMAIL_PASS")

    if not sender_email or not sender_password:
        raise ValueError("❌ Missing EMAIL_USER or EMAIL_PASS in environment variables")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    activation_link = f"{frontend_url}/organization/invitations/accept?token={invite_token}"




    # 3️⃣ Email content
    subject = "You're Invited to Join the School Management System"
    body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; padding: 20px; text-align: center;">
          <h2>Welcome!</h2>
          <p>You’ve been invited by our HR team to join the school management system.</p>
          <a href="{activation_link}" 
             style="background-color:#2563eb;color:white;padding:12px 24px;
             text-decoration:none;border-radius:8px;display:inline-block;margin-top:10px;">
             Activate Account
          </a>
          <p style="margin-top:20px;">If the button doesn’t work, copy this link into your browser:</p>
          <p style="word-break:break-all;">{activation_link}</p>
        </div>
      </body>
    </html>
    """

    # 4️⃣ Send email
    msg = MIMEMultipart("alternative")
    msg["From"] = sender_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html"))

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(msg)
        print(f"✅ Invitation email sent to {to_email}")

    except Exception as e:
        print(f"❌ Failed to send email: {str(e)}")
        raise e
