import uuid
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from firebase_admin import auth
from backend.app.utils.firestore_utils import get_db
from backend.app.models.password import UserOut

RESET_EXPIRY_MINUTES = 30


def create_reset_token(email: str) -> str:
    """Generate and store a reset token for the given email."""
    token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_EXPIRY_MINUTES)

    db = get_db()
    db.collection("passwordResets").document(token).set({
        "email": email,
        "expiresAt": expires_at.isoformat()
    })

    return token


def verify_reset_token(token: str) -> dict:
    """Verify if a reset token exists and is still valid."""
    db = get_db()
    doc = db.collection("passwordResets").document(token).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Invalid token")

    data = doc.to_dict()
    expires_at = datetime.fromisoformat(data["expiresAt"])

    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Token expired")

    return data


def delete_reset_token(token: str) -> None:
    """Delete a reset token after use or expiry."""
    db = get_db()
    db.collection("passwordResets").document(token).delete()


def apply_password_reset(token: str, new_password: str) -> None:
    """Apply a new password if the token is valid."""
    token_data = verify_reset_token(token)

    # Update password in Firebase Auth
    user = auth.get_user_by_email(token_data["email"])
    auth.update_user(user.uid, password=new_password)

    # Delete token after successful reset
    delete_reset_token(token)

def find_user_by_email(email: str) -> Optional[UserOut]:
    clean_email = email.strip().lower()

    # Residents
    resident_docs = get_db().collection("residents").where("email", "==", clean_email).stream()
    for doc in resident_docs:
        return UserOut(uid=doc.id, **doc.to_dict())

    # Accounts
    account_docs = get_db().collection("users").where("email", "==", clean_email).stream()
    for doc in account_docs:
        return UserOut(uid=doc.id, **doc.to_dict())

    return None
