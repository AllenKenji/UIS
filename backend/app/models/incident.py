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
    authUid: str = Field(..., description="Resident UID who reported the incident")

# 🆕 Incident creation schema
class IncidentCreate(IncidentBase):
    createdAt: datetime = Field(default_factory=datetime.utcnow)

# 📤 Incident response schema
class Incident(BaseModel):
    id: str
    type: IncidentType
    description: str
    location: str
    authUid: str
    createdAt: datetime
    updatedAt: Optional[datetime] = None
    status: IncidentStatus = IncidentStatus.pending

    class Config:
        validate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }

# 📤 Incident with resident details
class IncidentWithResident(Incident):
    reported_by_name: str = Field(..., description="Resident full name for display")
