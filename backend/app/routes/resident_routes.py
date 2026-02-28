import logging
from fastapi import APIRouter, Query, Body, HTTPException, status, Request
from typing import Optional, List
from starlette.concurrency import run_in_threadpool
from backend.app.models import ResidentCreate, ResidentUpdate, ResidentOut
from backend.app.services import resident_service
from backend.app.services.resident_service import ResidentError
from pydantic import BaseModel, ValidationError

logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Residents"])

# 📦 Response models
class BulkResidentResponse(BaseModel):
    householdId: str
    count: int
    items: List[ResidentOut]
    message: str

class DeleteResponse(BaseModel):
    id: Optional[str] = None
    householdId: Optional[str] = None
    message: str

# 🔧 Safe service call wrapper with detailed error logging
async def safe_service_call(context: str, func, *args, **kwargs):
    try:
        return await run_in_threadpool(func, *args, **kwargs)
    except ValidationError as e:
        # Log detailed validation errors
        logger.error("❌ Validation error in %s: %s", context, e.errors())
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.errors())
    except ResidentError as e:
        logger.warning("⚠️ %s: %s", context, str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.warning("⚠️ %s not found: %s", context, str(e))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        # Log full stack trace for unexpected errors
        logger.error("❌ %s failed: %s", context, str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Service call '{context}' failed"
        )

# 🚀 GET /residents
@router.get("/residents", response_model=List[ResidentOut])
async def list_residents(
    limit: int = Query(50, ge=1, le=100),
    start_after_id: Optional[str] = Query(None),
    full_name: Optional[str] = Query(None, alias="fullName"),
    birth_date: Optional[str] = Query(None, alias="birthDate")
):
    if full_name and birth_date:
        return await safe_service_call(
            "find duplicates",
            resident_service.find_duplicates,
            full_name,
            birth_date
        )
    return await safe_service_call(
        "list residents",
        resident_service.get_all_residents,
        limit,
        start_after_id
    )

@router.get("/residents/{id}", response_model=ResidentOut)
async def get_resident(id: str):
    logger.info("📤 Fetching resident with ID: %s", id)
    return await safe_service_call("get resident", resident_service.get_resident_by_id, id)


# 🚀 POST /residents
@router.post("/residents", response_model=ResidentOut, status_code=status.HTTP_201_CREATED)
async def add_resident(data: ResidentCreate = Body(...)) -> ResidentOut:
    logger.debug("📥 Incoming resident payload: %s", data.model_dump(by_alias=True))
    return await safe_service_call(
        "create resident",
        resident_service.add_resident,
        data.model_dump(by_alias=True)
    )

# 🚀 PUT /residents/{id}
@router.put("/residents/{id}", response_model=ResidentOut)
async def update_resident(id: str, data: ResidentUpdate = Body(...)) -> ResidentOut:
    logger.debug("📥 Update resident %s payload: %s", id, data.model_dump(by_alias=True))
    return await safe_service_call(
        "update resident",
        resident_service.update_resident,
        id,
        data.model_dump(by_alias=True)
    )

# 🚀 PATCH /residents/{id}
@router.patch("/residents/{id}", response_model=ResidentOut)
async def patch_resident(id: str, data: ResidentUpdate = Body(...)) -> ResidentOut:
    logger.debug("📥 Patch resident %s payload: %s", id, data.model_dump(exclude_unset=True, by_alias=True))
    return await safe_service_call(
        "patch resident",
        resident_service.patch_resident,
        id,
        data.model_dump(exclude_unset=True, by_alias=True)
    )

# 🚀 DELETE /residents/{id}
@router.delete("/residents/{id}", response_model=DeleteResponse)
async def delete_resident(id: str):
    logger.info("🗑️ Deleting resident with ID: %s", id)
    return await safe_service_call("delete resident", resident_service.delete_resident, id)

# 🚀 GET /households/{householdId}
@router.get("/households/{householdId}", response_model=List[ResidentOut])
async def get_household_residents(householdId: str):
    logger.info("📤 Fetching residents for household %s", householdId)
    return await safe_service_call("fetch household residents", resident_service.get_residents_by_household, householdId)

# 🚀 DELETE /households/{householdId}
@router.delete("/households/{householdId}", response_model=DeleteResponse)
async def delete_household_residents(householdId: str):
    logger.info("🗑️ Deleting residents in household %s", householdId)
    return await safe_service_call("delete household residents", resident_service.delete_by_household, householdId)

# 🚀 POST /residents/bulk
@router.post("/residents/bulk", response_model=BulkResidentResponse)
async def add_residents_bulk(
    data: List[ResidentCreate] = Body(...),
    household_id: Optional[str] = Query(None, alias="householdId")
):
    logger.debug("📥 Bulk resident payload count: %d", len(data))
    result = await safe_service_call(
        "bulk create residents",
        resident_service.add_residents_bulk,
        [d.model_dump(by_alias=True) for d in data],
        household_id
    )
    if "message" not in result:
        result["message"] = "Bulk residents created successfully"
    return result

# 🚀 DEBUG /residents/debug
@router.post("/residents/debug")
async def debug_resident(request: Request):
    """
    Debug endpoint: manually validate incoming payload against ResidentCreate.
    Useful for catching validation errors that FastAPI swallows.
    """
    body = await request.json()
    logger.debug("🐞 Raw incoming payload: %s", body)
    try:
        resident = ResidentCreate.model_validate(body)
        logger.info("✅ ResidentCreate validated successfully")
        return {"parsed": resident.model_dump()}
    except ValidationError as e:
        logger.error("❌ Debug validation error: %s", e.errors())
        raise HTTPException(status_code=422, detail=e.errors())
