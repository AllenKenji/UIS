from fastapi import APIRouter
from backend.app.models.business import BusinessApplication
from backend.app.services.business_service import create_business_application

router = APIRouter(prefix="/business", tags=["Business"])

@router.post("/applications")
def create_application(payload: BusinessApplication):
    return create_business_application(payload)
