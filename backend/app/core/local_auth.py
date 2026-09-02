"""Local password authentication backed by the PostgreSQL document store."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from uuid import uuid4

import jwt

from backend.app.core.postgres_store import get_database


def _secret() -> str:
    secret = os.environ.get("JWT_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET must be set to at least 32 characters")
    return secret


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return "pbkdf2_sha256$310000${}${}".format(
        base64.urlsafe_b64encode(salt).decode(),
        base64.urlsafe_b64encode(digest).decode(),
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt_value, digest_value = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_value.encode())
        expected = base64.urlsafe_b64decode(digest_value.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(rounds))
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def create_user(identifier: str, password: str, profile: dict) -> str:
    clean_identifier = identifier.strip().lower()
    identifier_field = "email" if "@" in clean_identifier else "contactNumber"
    existing = get_database().collection("users").where(identifier_field, "==", clean_identifier).limit(1).get()
    if existing:
        raise ValueError("Email already in use")
    uid = str(uuid4())
    get_database().collection("users").document(uid).set({
        **profile,
        identifier_field: clean_identifier,
        "passwordHash": hash_password(password),
    })
    return uid


def delete_user(uid: str) -> None:
    get_database().collection("users").document(uid).delete()


def authenticate(identifier: str, password: str) -> dict | None:
    clean_identifier = identifier.strip().lower()
    identifier_field = "email" if "@" in clean_identifier else "contactNumber"
    matches = get_database().collection("users").where(identifier_field, "==", clean_identifier).limit(1).get()
    if not matches:
        matches = get_database().collection("residents").where(identifier_field, "==", clean_identifier).limit(1).get()
    if not matches:
        return None
    snapshot = matches[0]
    data = snapshot.to_dict() or {}
    if not verify_password(password, data.get("passwordHash", "")):
        return None
    role = str(data.get("role", "resident")).lower()
    return {"uid": snapshot.id, **data, "role": role}


def issue_token(user: dict) -> str:
    now = int(time.time())
    roles = user.get("roles") or [user.get("role", "resident")]
    payload = {
        "sub": user["uid"],
        "uid": user["uid"],
        "role": user.get("role", "resident"),
        "roles": roles,
        "barangayId": user.get("barangayId"),
        "iat": now,
        "exp": now + 86400,
    }
    return jwt.encode(payload, _secret(), algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=["HS256"])