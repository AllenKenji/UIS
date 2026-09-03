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
    authUid: Optional[str] = Field(
        None, description="UID of the user (resident or staff) who logged the incident"
    )
    residentId: Optional[str] = Field(
        None, description="Resident UID who is the subject of the incident"
    )
    barangayId: Optional[str] = Field(None, description="Tenant this incident belongs to")

# 🆕 Incident creation schema
class IncidentCreate(IncidentBase):
    authUid: str = Field(..., description="UID of the user creating the incident")
    residentId: str = Field(..., description="Resident UID involved in the incident")
    timestamp: Optional[datetime] = None

# 📤 Incident response schema
class Incident(BaseModel):
    id: str
    type: IncidentType
    description: str
    location: str
    authUid: Optional[str] = None
    residentId: Optional[str] = None
    barangayId: Optional[str] = None
    assigned_to_uid: Optional[str] = None
    timestamp: datetime
    updated_at: Optional[datetime] = None
    status: IncidentStatus = IncidentStatus.pending
    remarks: Optional[str] = Field(
        None, description="Staff notes on how the incident was handled/resolved"
    )

    class Config:
        validate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }

# 📤 Incident with enriched display details
class IncidentWithResident(Incident):
    reported_by_name: Optional[str] = Field(None, description="Resident full name")
    logged_by_officer: Optional[str] = Field(None, description="Officer full name")
    assigned_to_name: Optional[str] = Field(None, description="Assigned staff name")
