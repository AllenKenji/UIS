from pydantic import BaseModel, Field, StringConstraints
from typing import Optional, Annotated
from datetime import datetime
from enum import Enum

# 🎯 Controlled vocabularies
class ComplaintCategory(str, Enum):
    noise = "Noise"
    service = "Service"
    neighbor = "Neighbor"
    other = "Other"

class ComplaintStatus(str, Enum):
    open = "open"
    in_review = "in_review"   # ✅ underscore for consistency
    resolved = "resolved"

# 📥 Base complaint schema
class ComplaintBase(BaseModel):
    category: ComplaintCategory
    description: Annotated[str, StringConstraints(min_length=5, max_length=500)]
    location: str
    filed_by: Annotated[str, StringConstraints(min_length=28, max_length=28)] = Field(
        ..., description="Resident UID who filed the complaint"
    )

# 🆕 Complaint creation schema
class ComplaintCreate(ComplaintBase):
    """
    Used when a resident files a complaint.
    Timestamp is set by backend (Firestore SERVER_TIMESTAMP).
    """
    pass

# 📤 Complaint response schema
class Complaint(BaseModel):
    id: str
    category: ComplaintCategory
    description: str
    location: str
    filed_by: str
    timestamp: datetime
    status: ComplaintStatus = ComplaintStatus.open
    resolution_notes: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        validate_by_name = True
        from_attributes = True  # ✅ allows dict/ORM integration

    @classmethod
    def from_firestore(cls, snapshot) -> "Complaint":
        """
        Helper to instantiate from Firestore DocumentSnapshot.
        Ensures Firestore timestamps are converted to Python datetime.
        """
        data = snapshot.to_dict() or {}
        if "timestamp" in data and hasattr(data["timestamp"], "to_datetime"):
            data["timestamp"] = data["timestamp"].to_datetime()
        if "updated_at" in data and hasattr(data["updated_at"], "to_datetime"):
            data["updated_at"] = data["updated_at"].to_datetime()
        return cls(id=snapshot.id, **data)

    def to_dict(self) -> dict:
        """
        Convert to dict for Firestore writes, excluding None values.
        """
        return self.dict(exclude_none=True)

# 📤 Complaint with resident details
class ComplaintWithResident(Complaint):
    filed_by_name: str = Field(..., description="Resident full name for display")
