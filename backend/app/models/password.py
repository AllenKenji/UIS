from pydantic import BaseModel, Field, field_validator, StringConstraints, ValidationInfo
from typing import Annotated, Optional

# 🔑 Strong password type
PasswordStr = Annotated[str, StringConstraints(min_length=8, max_length=128)]

# 📩 Request model
class ResetRequest(BaseModel):
    email: str

class ResetApply(BaseModel):
    token: str
    new_password: PasswordStr
    confirm_password: str

    @field_validator("new_password")
    def validate_password(cls, value: str):
        if not any(c.islower() for c in value):
            raise ValueError("Password must contain a lowercase letter")
        if not any(c.isupper() for c in value):
            raise ValueError("Password must contain an uppercase letter")
        if not any(c.isdigit() for c in value):
            raise ValueError("Password must contain a digit")
        if not any(c in "!@#$%^&*()-_=+[]{};:,.<>?/\\|" for c in value):
            raise ValueError("Password must contain a special character")
        return value

    @field_validator("confirm_password")
    def passwords_match(cls, v: str, info: ValidationInfo):
        new_password = info.data.get("new_password")
        if new_password and v != new_password:
            raise ValueError("Passwords do not match")
        return v


# 🏠 Address model
class Address(BaseModel):
    barangay: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = Field(default=None, alias="houseNumber")
    purok: Optional[str] = None
    zip_code: Optional[str] = Field(default=None, alias="zipCode")

# 👤 Unified user model
class UserOut(BaseModel):
    uid: str
    email: str
    full_name: str = Field(alias="fullName")   # ✅ maps both fullName (resident) and full_name (account)
    role: Optional[str] = None
    barangay: Optional[str] = None
    address: Optional[Address] = None
