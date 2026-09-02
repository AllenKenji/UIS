from datetime import date
from typing import Annotated, Optional

from pydantic import BaseModel, EmailStr, Field, StringConstraints

from .resident import Address, CivilStatus, Gender, VoterStatus


class PublicResidentRegistration(BaseModel):
    barangayId: str = Field(..., min_length=1)
    fullName: str = Field(..., min_length=2, max_length=100)
    birthDate: date
    gender: Gender
    civilStatus: CivilStatus
    email: EmailStr
    contactNumber: Optional[Annotated[str, StringConstraints(pattern=r"^09\d{9}$")]] = None
    address: Address
    isHeadOfFamily: bool = False
    voterStatus: VoterStatus = VoterStatus.Unknown
    occupation: Optional[str] = Field(None, max_length=100)


class PublicAccessLookupRequest(BaseModel):
    barangayId: str = Field(..., min_length=1)
    identifier: str = Field(..., min_length=1, max_length=100)
    birthDate: date