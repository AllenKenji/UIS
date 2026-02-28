from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, timezone
import uuid

class Notification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))  # unique per instance
    
    # Who should see this notification
    role: Literal["admin", "staff", "secretary", "resident"]
    
    # What type of event triggered it
    type: Literal[
        "login", "logout",
        "incident", "incident_update",
        "complaint", "complaint_update",
        "business", "business_update",
        "document", "document_update"
    ]
    
    # Scope clarifies login/logout context
    scope: Optional[Literal["resident", "officer"]] = None
    
    # Aggregated count (e.g., 3 residents logged in)
    count: Optional[int] = None
    
    # Officer/staff name if applicable
    user: Optional[str] = None
    
    # Resident UID for personal notifications
    user_id: Optional[str] = None
    
    # Human-readable message
    message: str
    
    # Timestamp defaults to UTC now
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Whether the notification has been read
    read: bool = False

