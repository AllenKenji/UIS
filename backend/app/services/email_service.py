"""Gmail OAuth2 mail delivery for the BIS backend."""
from __future__ import annotations

import base64
import os
import smtplib
from email.message import EmailMessage

import requests

TOKEN_URL = "https://oauth2.googleapis.com/token"
OAUTH_USER = os.environ.get("GMAIL_SENDER", "jonladyong@gmail.com")


def _template(email_type: str, full_name: str, reset_link: str | None = None, detail: str | None = None) -> tuple[str, str]:
    name = full_name or "User"
    if email_type == "welcome":
        return "Welcome to Barangay Information System", f"Welcome, {name}. Your Barangay Information System account is ready."
    if email_type == "reset":
        return "Reset your Barangay Information System password", f"Hello, {name}. Reset your password using this link: {reset_link}"
    if email_type == "access_link":
        return "Your Barangay Services QR access link", f"Hello, {name}. Use this private link to access Barangay services and prefill your saved profile: {reset_link}. This link expires in 15 minutes."
    if email_type == "permit_expiring":
        body = detail or "Your business permit is expiring soon."
        return "Your business permit is expiring soon", f"Hello, {name}. {body} Please visit your Barangay portal to pay the annual renewal fee and keep your permit active."
    if email_type == "permit_expired":
        body = detail or "Your business permit has expired."
        return "Your business permit has expired", f"Hello, {name}. {body} Your business is no longer covered by an active permit. Pay the annual renewal fee through your Barangay portal to reactivate it."
    raise ValueError("Invalid email type")


def _access_token() -> str:
    client_id = os.environ.get("GMAIL_CLIENT_ID")
    client_secret = os.environ.get("GMAIL_CLIENT_SECRET")
    refresh_token = os.environ.get("GMAIL_REFRESH_TOKEN")
    if not all((client_id, client_secret, refresh_token)):
        raise RuntimeError("Gmail OAuth configuration is missing")
    response = requests.post(TOKEN_URL, data={
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }, timeout=10)
    response.raise_for_status()
    token = response.json().get("access_token")
    if not token:
        raise RuntimeError("Gmail OAuth token response did not include an access token")
    return token


def send_email(email_type: str, recipient: str, full_name: str, reset_link: str | None = None, detail: str | None = None) -> None:
    subject, text = _template(email_type, full_name, reset_link, detail)
    message = EmailMessage()
    message["From"] = f"Barangay System <{OAUTH_USER}>"
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(text)

    auth = base64.b64encode(f"user={OAUTH_USER}\x01auth=Bearer {_access_token()}\x01\x01".encode()).decode()
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.docmd("AUTH", f"XOAUTH2 {auth}")
        smtp.send_message(message)
