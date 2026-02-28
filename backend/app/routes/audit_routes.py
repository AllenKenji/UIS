# app/routes/audit_routes.py
from fastapi import APIRouter, HTTPException
from backend.app.utils.firestore_utils import get_db
import logging

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

@router.get("/", tags=["Audit"])
def list_audit_logs(limit: int = 50):
    """
    Return the latest document audit logs.
    """
    try:
        logs = (
            get_db().collection("document_audit")
            .order_by("timestamp", direction="DESCENDING")
            .limit(limit)
            .stream()
        )
        return [log.to_dict() for log in logs]
    except Exception as e:
        logger.error("❌ Error fetching audit logs: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")
