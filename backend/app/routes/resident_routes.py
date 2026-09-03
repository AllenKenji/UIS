import logging
import os
from fastapi import APIRouter, Depends, Header, Query, Body, HTTPException, status, Request
from typing import Optional, List
from starlette.concurrency import run_in_threadpool
from backend.app.models import ResidentCreate, ResidentUpdate, ResidentOut
from backend.app.services import resident_service
from backend.app.services.resident_service import ResidentError
from backend.app.services.email_service import send_email
from backend.app.services.tenant_service import list_tenants
from backend.app.core.auth import get_current_user, require_permission, resolve_tenant_scope
from pydantic import BaseModel, ValidationError

logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Residents"])


def _ensure_in_scope(resident: ResidentOut, scope: Optional[str]) -> ResidentOut:
    """A barangay admin/staff may only touch residents in their own tenant."""
    if scope is not None and resident.barangay_id != scope:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resident not found")
    return resident

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
    email: Optional[str] = Query(None),
    full_name: Optional[str] = Query(None, alias="fullName"),
    birth_date: Optional[str] = Query(None, alias="birthDate"),
    barangayId: Optional[str] = Query(None),
    verificationStatus: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    # Secretaries don't manage resident records, but they do need to look up
    # their own barangay's registered residents to attach to a walk-in
    # document request — allow listing on either permission, tenant-scoped
    # below by resolve_tenant_scope either way.
    _: None = Depends(require_permission(["manageResidents", "manageDocuments"])),
):
    scope = resolve_tenant_scope(current_user, barangayId)
    if email:
        resident = await safe_service_call(
            "find resident by email",
            resident_service.find_by_email,
            email,
            scope,
        )
        return [resident] if resident else []
    if full_name and birth_date:
        return await safe_service_call(
            "find duplicates",
            resident_service.find_duplicates,
            full_name,
            birth_date,
            None,
            None,
            scope,
        )
    return await safe_service_call(
        "list residents",
        resident_service.get_all_residents,
        limit,
        start_after_id,
        scope,
        verificationStatus,
    )

@router.get("/residents/{id}", response_model=ResidentOut)
async def get_resident(
    id: str,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission("manageResidents")),
):
    logger.info("📤 Fetching resident with ID: %s", id)
    resident = await safe_service_call("get resident", resident_service.get_resident_by_id, id)
    return _ensure_in_scope(resident, resolve_tenant_scope(current_user))


# 🚀 POST /residents
@router.post("/residents", response_model=ResidentOut, status_code=status.HTTP_201_CREATED)
async def add_resident(
    data: ResidentCreate = Body(...),
    barangayId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission("manageResidents")),
) -> ResidentOut:
    scope = resolve_tenant_scope(current_user, barangayId)
    logger.debug("📥 Incoming resident payload: %s", data.model_dump(by_alias=True))
    resident = await safe_service_call(
        "create resident",
        resident_service.add_resident,
        data.model_dump(by_alias=True),
        None,
        True,
        scope,
    )
    if resident.email:
        try:
            send_email("welcome", resident.email, resident.full_name)
        except Exception as error:
            logger.warning("Welcome email could not be sent to resident %s: %s", resident.email, error)
    return resident


class FdpResidentProvisionResponse(BaseModel):
    id: str
    created: bool


def _resolve_barangay_id(barangay: str, city: str) -> Optional[str]:
    """Match a plain barangay/city name pair (as recorded on a FDP household
    survey) to a registered BIS tenant. Same name-matching approach as the
    document-request forms' barangay picker — there's no other link between
    the two systems, since FDP only knows barangay/city as free text."""
    barangay_norm = barangay.strip().lower()
    city_norm = city.strip().lower()
    for tenant in list_tenants():
        if tenant.barangay.strip().lower() == barangay_norm and tenant.city.strip().lower() == city_norm:
            return tenant.id
    return None


@router.post(
    "/internal/fdp/provision-resident",
    response_model=FdpResidentProvisionResponse,
    summary="Provision or find a BIS resident from a FDP household survey",
    description="Internal, API-key-authenticated endpoint used by the FDP survey system to create (or "
    "return an existing) resident record from a submitted/approved household survey — the "
    "service-to-service counterpart of /internal/fdp/provision-account, since POST /residents "
    "requires an interactive staff login the survey system's server can't provide.",
)
async def provision_resident_from_fdp(
    payload: ResidentCreate = Body(...),
    x_fdp_provision_key: Optional[str] = Header(default=None),
) -> FdpResidentProvisionResponse:
    expected_key = os.environ.get("FDP_TO_BIS_PROVISION_API_KEY", "").strip()
    provided_key = (x_fdp_provision_key or "").strip()
    if not expected_key or provided_key != expected_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    barangay_id = _resolve_barangay_id(payload.address.barangay, payload.address.city)
    if not barangay_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'No registered barangay matches "{payload.address.barangay}, {payload.address.city}"',
        )

    if payload.email:
        existing = await safe_service_call(
            "find resident by email (FDP provision)",
            resident_service.find_by_email,
            payload.email,
            barangay_id,
        )
        if existing:
            return FdpResidentProvisionResponse(id=existing.id, created=False)

    created = await safe_service_call(
        "create resident (FDP provision)",
        resident_service.add_resident,
        payload.model_dump(by_alias=True),
        None,
        True,
        barangay_id,
    )
    return FdpResidentProvisionResponse(id=created.id, created=True)

# 🚀 PUT /residents/{id}
@router.put("/residents/{id}", response_model=ResidentOut)
async def update_resident(
    id: str,
    data: ResidentUpdate = Body(...),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission("manageResidents")),
) -> ResidentOut:
    existing = await safe_service_call("get resident", resident_service.get_resident_by_id, id)
    _ensure_in_scope(existing, resolve_tenant_scope(current_user))
    logger.debug("📥 Update resident %s payload: %s", id, data.model_dump(by_alias=True))
    return await safe_service_call(
        "update resident",
        resident_service.update_resident,
        id,
        data.model_dump(by_alias=True)
    )

# 🚀 PATCH /residents/{id}
@router.patch("/residents/{id}", response_model=ResidentOut)
async def patch_resident(
    id: str,
    data: ResidentUpdate = Body(...),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission("manageResidents")),
) -> ResidentOut:
    existing = await safe_service_call("get resident", resident_service.get_resident_by_id, id)
    _ensure_in_scope(existing, resolve_tenant_scope(current_user))
    logger.debug("📥 Patch resident %s payload: %s", id, data.model_dump(exclude_unset=True, by_alias=True))
    return await safe_service_call(
        "patch resident",
        resident_service.patch_resident,
        id,
        data.model_dump(exclude_unset=True, by_alias=True)
    )

# 🚀 DELETE /residents/{id}
@router.delete("/residents/{id}", response_model=DeleteResponse)
async def delete_resident(
    id: str,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission("manageResidents")),
):
    existing = await safe_service_call("get resident", resident_service.get_resident_by_id, id)
    _ensure_in_scope(existing, resolve_tenant_scope(current_user))
    logger.info("🗑️ Deleting resident with ID: %s", id)
    return await safe_service_call("delete resident", resident_service.delete_resident, id)


# 🚀 PATCH /residents/{id}/verification
class VerificationPayload(BaseModel):
    verificationStatus: str  # "verified" | "rejected" | "pending"
    notes: Optional[str] = None


@router.patch("/residents/{id}/verification", response_model=ResidentOut)
async def verify_resident(
    id: str,
    payload: VerificationPayload = Body(...),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission("manageResidents")),
):
    existing = await safe_service_call("get resident", resident_service.get_resident_by_id, id)
    _ensure_in_scope(existing, resolve_tenant_scope(current_user))
    logger.info("🔎 Resident %s verification set to %s by %s", id, payload.verificationStatus, current_user.get("uid"))
    return await safe_service_call(
        "verify resident",
        resident_service.verify_resident,
        id,
        payload.verificationStatus,
        current_user.get("uid"),
        payload.notes,
    )

# 🚀 GET /households/{householdId}
@router.get("/households/{householdId}", response_model=List[ResidentOut])
async def get_household_residents(
    householdId: str,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission("manageResidents")),
):
    scope = resolve_tenant_scope(current_user)
    logger.info("📤 Fetching residents for household %s", householdId)
    return await safe_service_call("fetch household residents", resident_service.get_residents_by_household, householdId, scope)

# 🚀 DELETE /households/{householdId}
@router.delete("/households/{householdId}", response_model=DeleteResponse)
async def delete_household_residents(
    householdId: str,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission("manageResidents")),
):
    logger.info("🗑️ Deleting residents in household %s", householdId)
    return await safe_service_call("delete household residents", resident_service.delete_by_household, householdId)

# 🚀 POST /residents/bulk
@router.post("/residents/bulk", response_model=BulkResidentResponse)
async def add_residents_bulk(
    data: List[ResidentCreate] = Body(...),
    household_id: Optional[str] = Query(None, alias="householdId"),
    barangayId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permission("manageResidents")),
):
    scope = resolve_tenant_scope(current_user, barangayId)
    logger.debug("📥 Bulk resident payload count: %d", len(data))
    result = await safe_service_call(
        "bulk create residents",
        resident_service.add_residents_bulk,
        [d.model_dump(by_alias=True) for d in data],
        household_id,
        scope,
    )
    if "message" not in result:
        result["message"] = "Bulk residents created successfully"
    for resident in result["items"]:
        if not resident.email:
            continue
        try:
            send_email("welcome", resident.email, resident.full_name)
        except Exception as error:
            logger.warning("Welcome email could not be sent to resident %s: %s", resident.email, error)
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
