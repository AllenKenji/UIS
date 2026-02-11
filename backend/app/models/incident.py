from pydantic import BaseModel, Field, StringConstraints
from typing import Optional, Annotated
from datetime import datetime
from enum import Enum

# 🎯 Controlled vocabularies
class IncidentType(str, Enum):
    theft = "Theft"
    dispute = "Dispute"
    accident = "Accident"
    other = "Other"

class IncidentStatus(str, Enum):
    pending = "pending"
    resolved = "resolved"
    escalated = "escalated"

# 📥 Base incident schema
class IncidentBase(BaseModel):
    type: IncidentType
    description: Annotated[str, StringConstraints(min_length=5, max_length=500)]
    location: str
    # ✅ authUid is the officer/resident who logged the report
    authUid: Optional[str] = Field(
        None, description="UID of the user (resident or staff) who logged the incident"
    )
    # ✅ residentId is the resident involved in the incident
    residentId: Optional[str] = Field(
        None, description="Resident UID who is the subject of the incident"
    )

# 🆕 Incident creation schema
class IncidentCreate(IncidentBase):
    # For creation, enforce that IDs must be present
    authUid: str = Field(..., description="UID of the user creating the incident")
    residentId: str = Field(..., description="Resident UID involved in the incident")
    createdAt: datetime = Field(default_factory=datetime.utcnow)

# 📤 Incident response schema
class Incident(BaseModel):
    id: str
    type: IncidentType
    description: str
    location: str
    authUid: Optional[str] = None
    residentId: Optional[str] = None
    createdAt: datetime
    updatedAt: Optional[datetime] = None
    status: IncidentStatus = IncidentStatus.pending

    class Config:
        validate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }

# 📤 Incident with enriched display details
class IncidentWithResident(Incident):
    reported_by_name: str = Field(..., description="Resident full name (always the resident involved)")
    logged_by_officer: Optional[str] = Field(None, description="Staff full name if logged by staff")
    assigned_to_name: Optional[str] = None
