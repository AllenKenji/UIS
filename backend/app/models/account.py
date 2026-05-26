from pydantic import BaseModel, EmailStr, Field
from enum import Enum
from typing import Optional
from datetime import datetime

# 🎯 Role definitions
class RoleEnum(str, Enum):
    staff = "staff"
    secretary = "secretary"
    treasurer = "treasurer"
    sk = "sk"
    dilg = "dilg"
    admin = "admin"
    surveyor = "surveyor"
    supervisor = "supervisor"

# 🧾 Base account schema
class AccountBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    role: RoleEnum

# 🆕 Account creation schema
class AccountCreate(AccountBase):
    password: str = Field(..., min_length=8, max_length=128)

# 📤 Account response schema
class AccountResponse(AccountBase):
    uid: str
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None

# 🛠️ Firestore payload schema
class AccountFirestorePayload(AccountBase):
    created_by: str = Field(..., alias="createdBy")
    created_at: datetime = Field(..., alias="createdAt")
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")

    class Config:
        validate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

# 🔄 Account update schema
class AccountUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    role: Optional[RoleEnum] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)
