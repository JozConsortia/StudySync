"""Sends email (password reset codes) through the SMTP server set in server/.env."""

import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from .. import config
from ..errors import ApiError


def _send(to: str, subject: str, text: str, html: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"StudySync <{config.SMTP_FROM}>"
    msg["To"] = to
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    context = ssl.create_default_context()
    try:
        if config.SMTP_SECURITY == "ssl":
            server = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=20, context=context)
        else:
            server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20)
        with server:
            if config.SMTP_SECURITY == "starttls":
                server.starttls(context=context)
            if config.SMTP_USER and config.SMTP_PASSWORD:
                server.login(config.SMTP_USER, config.SMTP_PASSWORD)
            server.send_message(msg)
    except smtplib.SMTPAuthenticationError as exc:
        config.log.error("SMTP login failed: %s", exc)
        raise ApiError(502, "The server could not sign in to its email account, so the code was not sent.") from exc
    except (smtplib.SMTPException, OSError) as exc:
        config.log.error("Sending email to %s failed: %s", to, exc)
        raise ApiError(502, "The email could not be sent right now. Please try again in a minute.") from exc


def send_reset_code(to: str, name: str, code: str, minutes: int) -> None:
    """Emails a password reset code. Without SMTP settings the code is written to the server log instead."""
    if not config.MAIL_CONFIGURED:
        config.log.warning("Email is not set up. Password reset code for %s: %s (valid %s minutes)", to, code, minutes)
        return

    first = (name or "").split(" ")[0] or "there"
    spaced = " ".join(code)
    text = (
        f"Hi {first},\n\n"
        f"Your StudySync password reset code is: {code}\n\n"
        f"Enter it in the app to choose a new password. It expires in {minutes} minutes.\n\n"
        "If you didn't ask to reset your password, you can ignore this email; your password has not changed.\n\n"
        "- StudySync"
    )
    html = f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f5fc;padding:32px 16px">
  <div style="max-width:460px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e3e5f3">
    <div style="background:linear-gradient(135deg,#7c4dea,#4f6ef7,#14b4d4);padding:24px 28px;color:#ffffff">
      <div style="font-size:20px;font-weight:800">StudySync</div>
      <div style="font-size:14px;opacity:.9;margin-top:4px">Reset your password</div>
    </div>
    <div style="padding:28px;color:#13152b;font-size:15px;line-height:1.55">
      <p style="margin:0 0 14px">Hi {escape(first)},</p>
      <p style="margin:0 0 18px">Use this code in the StudySync app to choose a new password:</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;text-align:center;background:#f1f2fa;
                  border-radius:14px;padding:18px 0;color:#3d4ad6">{spaced}</div>
      <p style="margin:18px 0 0;color:#5f6485;font-size:13px">The code expires in {minutes} minutes. If you didn't ask
      to reset your password, you can ignore this email; your password has not changed.</p>
    </div>
  </div>
</div>"""
    _send(to, f"{code} is your StudySync reset code", text, html)
