"""
Email service — handles sending transactional emails for SaaS mode.

Uses Python's built-in smtplib for sending emails.
When SMTP is not configured, emails are logged instead of sent
(useful for development and testing).
"""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from config import Config

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending transactional emails."""

    @staticmethod
    def is_configured():
        """Check if SMTP is configured."""
        return bool(Config.SMTP_HOST and Config.SMTP_USER)

    @staticmethod
    def send_verification_email(email, verification_url):
        """
        Send an email verification link.

        Args:
            email: Recipient email address.
            verification_url: Full URL with verification token.
        """
        subject = "Verify your Equitee account"
        html_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3b82f6;">Welcome to Equitee!</h2>
            <p>Please verify your email address to activate your account.</p>
            <a href="{verification_url}"
               style="display: inline-block; padding: 12px 24px; background-color: #3b82f6;
                      color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
                Verify Email Address
            </a>
            <p style="color: #666; font-size: 14px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="{verification_url}">{verification_url}</a>
            </p>
            <p style="color: #666; font-size: 14px;">
                This link expires in {Config.EMAIL_VERIFICATION_EXPIRY_HOURS} hours.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">
                If you didn't create an account with Equitee, you can safely ignore this email.
            </p>
        </div>
        """
        text_body = (
            f"Welcome to Equitee!\n\n"
            f"Please verify your email address by visiting:\n{verification_url}\n\n"
            f"This link expires in {Config.EMAIL_VERIFICATION_EXPIRY_HOURS} hours.\n\n"
            f"If you didn't create an account with Equitee, you can safely ignore this email."
        )

        EmailService._send_email(email, subject, html_body, text_body)

    @staticmethod
    def _send_email(to_email, subject, html_body, text_body):
        """
        Send an email. If SMTP is not configured, log the email instead.
        """
        if not EmailService.is_configured():
            logger.info(
                "SMTP not configured — would send email to %s:\n"
                "Subject: %s\n%s",
                to_email, subject, text_body,
            )
            return

        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = Config.MAIL_FROM
        msg['To'] = to_email

        msg.attach(MIMEText(text_body, 'plain'))
        msg.attach(MIMEText(html_body, 'html'))

        try:
            if Config.SMTP_USE_TLS:
                server = smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT, timeout=30)
                server.starttls()
            else:
                server = smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT, timeout=30)
    
            server.login(Config.SMTP_USER, Config.SMTP_PASSWORD)
            server.sendmail(Config.MAIL_FROM, [to_email], msg.as_string())
            server.quit()

            logger.info("Email sent successfully to %s", to_email)
        except Exception:
            logger.exception("Failed to send email to %s", to_email)
            raise
