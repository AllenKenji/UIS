import logging
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from backend.app.utils.firestore_utils import get_db  


logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Dashboard"])

# 📦 Response model
class DashboardSummary(BaseModel):
    residents: int
    businesses: int
    complaints: int
    officials: int
    incidents: int

@router.get("/dashboard-summary", response_model=DashboardSummary)
async def get_dashboard_summary():

    try:
        collections = ["residents", "businesses", "complaints", "officials", "incidents"]
        counts = {}

        for col in collections:
            docs = get_db().collection(col).get()
            counts[col] = len(docs)

        logger.info("📊 Dashboard summary fetched successfully")
        return DashboardSummary(**counts)

    except Exception as e:
        logger.error("❌ Failed to fetch dashboard summary: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch dashboard summary"
        )
