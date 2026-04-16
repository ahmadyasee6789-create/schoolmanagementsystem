# /backend/utils/email_sender.py

import os
import resend

resend.api_key = os.getenv("RESEND_API_KEY")

def send_activation_email(to_email: str, invite_token: str):
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    activation_link = f"{frontend_url}/organization/invitations/accept?token={invite_token}"

    subject = "You're Invited to Join the School Management System"

    html = f"""
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
          <p style="margin-top:20px;">If the button doesn’t work, copy this link:</p>
          <p style="word-break:break-all;">{activation_link}</p>
        </div>
      </body>
    </html>
    """

    try:
        resend.Emails.send({
            "from": "onboarding@resend.dev",
            "to": to_email,
            "subject": subject,
            "html": html
        })
    except Exception as e:
        print(f"❌ Failed to send email: {str(e)}")