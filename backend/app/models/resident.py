from pydantic import BaseModel, Field, EmailStr, HttpUrl, StringConstraints, ConfigDict
from typing import Optional, Annotated
from datetime import date, datetime
from enum import Enum

# 🎯 Controlled vocabularies
class Gender(str, Enum):
    Male = "Male"
    Female = "Female"
    Other = "Other"

class CivilStatus(str, Enum):
    Single = "Single"
    Married = "Married"
    Widowed = "Widowed"
    Separated = "Separated"

class VoterStatus(str, Enum):
    Yes = "yes"
    No = "no"
    Unknown = "unknown"

# 🖐 Fingerprints model
class Fingerprints(BaseModel):
    left: Optional[str] = Field(None, alias="left")
    right: Optional[str] = Field(None, alias="right")

# 🏠 Address model
class Address(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    house_number: str = Field(..., alias="houseNumber", example="123")
    street: str = Field(..., example="Main St")
    purok: str = Field(..., example="3")
    barangay: str = Field(..., example="Moonwalk")
    city: str = Field(..., example="Parañaque")
    province: str = Field(..., example="Metro Manila")
    zip_code: Optional[str] = Field(None, alias="zipCode", example="1700")

# 📥 Resident creation model
class ResidentCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    full_name: str = Field(..., min_length=2, max_length=100, alias="fullName")
    middle_name: Optional[str] = Field(None, alias="middleName")
    suffix: Optional[str] = Field(None, alias="suffix")
    birth_date: date = Field(..., alias="birthDate")
    gender: Gender
    civil_status: CivilStatus = Field(..., alias="civilStatus")
    contact_number: Annotated[str, StringConstraints(pattern=r"^09\d{9}$")] = Field(..., alias="contactNumber", example="09171234567")
    email: Optional[EmailStr]
    address: Address
    household_id: Optional[str] = Field(None, alias="householdId")
    is_head_of_family: bool = Field(..., alias="isHeadOfFamily")
    voter_status: VoterStatus = Field(..., alias="voterStatus")
    occupation: Optional[str]
    photo_url: Optional[str] = Field(None, alias="photoUrl")
    fingerprints: Optional[Fingerprints] = Field(None, alias="fingerprints")  # ✅ nested object
    signature_url: Optional[str] = Field(None, alias="signatureUrl")
    remarks: Optional[str] = None

# 📤 Resident output model
class ResidentOut(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={
            datetime: lambda v: v.isoformat() if v else None,
            date: lambda v: v.isoformat() if v else None,
        },
    )

    id: str
    full_name: str = Field(..., alias="fullName")
    birth_date: Optional[date] = Field(None, alias="birthDate")
    gender: Optional[Gender]
    civil_status: Optional[CivilStatus] = Field(None, alias="civilStatus")
    contact_number: Optional[str] = Field(None, alias="contactNumber")
    email: Optional[EmailStr]
    address: Optional[Address]
    household_id: Optional[str] = Field(None, alias="householdId")
    is_head_of_family: Optional[bool] = Field(False, alias="isHeadOfFamily")
    voter_status: Optional[VoterStatus] = Field(None, alias="voterStatus")
    occupation: Optional[str]
    photo_url: Optional[str] = Field(None, alias="photoUrl")
    fingerprints: Optional[Fingerprints] = Field(None, alias="fingerprints")
    signature_url: Optional[str] = Field(None, alias="signatureUrl")
    remarks: Optional[str]
    created_at: Optional[datetime] = Field(None, alias="createdAt")
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")

# 🔄 Partial update model
class ResidentUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    full_name: Optional[str] = Field(None, alias="fullName")
    middle_name: Optional[str] = Field(None, alias="middleName")
    suffix: Optional[str] = Field(None, alias="suffix")
    birth_date: Optional[date] = Field(None, alias="birthDate")
    gender: Optional[Gender]
    civil_status: Optional[CivilStatus] = Field(None, alias="civilStatus")
    contact_number: Optional[Annotated[str, StringConstraints(pattern=r"^09\d{9}$")]] = Field(None, alias="contactNumber", example="09171234567")
    email: Optional[EmailStr]
    address: Optional[Address]
    household_id: Optional[str] = Field(None, alias="householdId")
    is_head_of_family: Optional[bool] = Field(None, alias="isHeadOfFamily")
    voter_status: Optional[VoterStatus] = Field(None, alias="voterStatus")
    occupation: Optional[str]
    photo_url: Optional[str] = Field(None, alias="photoUrl")
    fingerprints: Optional[Fingerprints] = Field(None, alias="fingerprints")  # ✅ nested object
    signature_url: Optional[str] = Field(None, alias="signatureUrl")
    remarks: Optional[str]
    updated_at: datetime = Field(default_factory=datetime.utcnow, alias="updatedAt")
