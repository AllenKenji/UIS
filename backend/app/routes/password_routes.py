import logging
import os
from fastapi import APIRouter, HTTPException
from backend.app.models.password import ResetApply, ResetRequest
from backend.app.services.password_service import (
    create_reset_token,
    verify_reset_token,
    apply_password_reset,
    find_user_by_email
)
from backend.app.services.email_service import send_email

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/password", tags=["Password Reset"])

FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "https://uis.lits.com.ph").rstrip("/")


@router.post("/request")
async def request_reset(data: ResetRequest):
    user_record = find_user_by_email(data.email)
    if not user_record:
        raise HTTPException(status_code=404, detail="No matching resident or account found")

    token = create_reset_token(data.email)
    reset_link = f"{FRONTEND_BASE_URL}/reset-password?token={token}"

    full_name = user_record.full_name or "User"
    barangay = user_record.barangay or (user_record.address.barangay if user_record.address else "Unknown")

    payload = {
        "type": "reset",
        "fullName": full_name,
        "email": data.email,
        "barangay": barangay,
        "resetLink": reset_link,
    }

    try:
        send_email("reset", data.email, full_name, reset_link)
    except Exception as error:
        logger.error("Email delivery failed: %s", error)
        raise HTTPException(status_code=500, detail="Failed to send reset email") from error

    return {"success": True, "message": "Reset email sent"}


@router.get("/verify/{token}")
async def verify_reset(token: str):
    """Verify if a reset token is valid and not expired."""
    data = verify_reset_token(token)
    return {"valid": True, "email": data["email"]}


@router.post("/apply")
async def apply_reset(data: ResetApply):
    """Apply a new password if token is valid."""
    apply_password_reset(data.token, data.new_password)
    return {"success": True, "message": "Password reset successful"}
