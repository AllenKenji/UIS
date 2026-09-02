from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from backend.app.core.auth import get_current_user
from backend.app.services.email_service import send_email

router = APIRouter(prefix="/email", tags=["Email"])


class EmailRequest(BaseModel):
    type: str = "welcome"
    fullName: str = "User"
    email: EmailStr
    resetLink: str | None = None


@router.post("")
def send_authenticated_email(payload: EmailRequest, _: dict = Depends(get_current_user)):
    try:
        send_email(payload.type, str(payload.email), payload.fullName, payload.resetLink)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception:
        raise HTTPException(status_code=502, detail="Unable to send email")
    return {"success": True}
