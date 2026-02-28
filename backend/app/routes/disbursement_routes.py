from fastapi import APIRouter, HTTPException
from backend.app.services import disbursement_service

router = APIRouter(tags=["Disbursements"])

@router.post("/disbursements")
async def create_disbursement(payload: dict):
    return disbursement_service.create_disbursement(payload)

@router.get("/disbursements")
async def list_disbursements():
    return disbursement_service.list_disbursements()

@router.get("/disbursements/{id}")
async def get_disbursement(id: str):
    result = disbursement_service.get_disbursement(id)
    if not result:
        raise HTTPException(status_code=404, detail="Disbursement not found")
    return result

@router.patch("/disbursements/{id}/status")
async def update_status(id: str, payload: dict):
    result = disbursement_service.update_status(id, payload.get("status"))
    if not result:
        raise HTTPException(status_code=404, detail="Disbursement not found")
    return result

@router.put("/disbursements/{id}")
async def update_disbursement(id: str, payload: dict):
    result = disbursement_service.update_disbursement(id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Disbursement not found")
    return result

@router.delete("/disbursements/{id}")
async def delete_disbursement(id: str):
    success = disbursement_service.delete_disbursement(id)
    if not success:
        raise HTTPException(status_code=404, detail="Disbursement not found")
    return {"id": id, "deleted": True}
