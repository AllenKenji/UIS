import logging
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException

from backend.app.models.tenant import City, Tenant, TenantCreate
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def _tenant_id(payload: TenantCreate) -> str:
    return f"{_slugify(payload.city)}-{_slugify(payload.barangay)}"


def _city_id(city: str) -> str:
    return _slugify(city)


def get_or_create_city(city: str) -> City:
    city_id = _city_id(city)
    doc_ref = get_db().collection("cities").document(city_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        data = {"name": city, "logoUrl": None, "createdAt": datetime.now(timezone.utc)}
        doc_ref.set(data)
        logger.info("✅ City created: %s", city_id)
        return City(id=city_id, **data)
    return City(id=city_id, **(snapshot.to_dict() or {}))


def list_cities() -> List[City]:
    docs = get_db().collection("cities").order_by("name").get()
    return [City(id=doc.id, **(doc.to_dict() or {})) for doc in docs]


def get_city(city_id: str) -> City:
    snapshot = get_db().collection("cities").document(city_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="City not found")
    return City(id=city_id, **(snapshot.to_dict() or {}))


def set_city_logo(city_id: str, logo_url: str) -> City:
    doc_ref = get_db().collection("cities").document(city_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="City not found")
    doc_ref.update({"logoUrl": logo_url})
    return get_city(city_id)


def create_tenant(payload: TenantCreate) -> Tenant:
    tenant_id = _tenant_id(payload)
    doc_ref = get_db().collection("tenants").document(tenant_id)
    if doc_ref.get().exists:
        raise HTTPException(status_code=409, detail="This city/barangay combination already exists")

    data = {**payload.model_dump(), "createdAt": datetime.now(timezone.utc)}
    doc_ref.set(data)
    get_or_create_city(payload.city)
    logger.info("✅ Tenant created: %s", tenant_id)
    return Tenant(id=tenant_id, **data)


def list_tenants(city: Optional[str] = None) -> List[Tenant]:
    query = get_db().collection("tenants").order_by("city")
    if city:
        query = query.where("city", "==", city)
    docs = query.get()
    return [Tenant(id=doc.id, **(doc.to_dict() or {})) for doc in docs]


def get_tenant(tenant_id: str) -> Tenant:
    snapshot = get_db().collection("tenants").document(tenant_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Barangay not found")
    return Tenant(id=tenant_id, **(snapshot.to_dict() or {}))


def update_tenant(tenant_id: str, updates: dict) -> Tenant:
    doc_ref = get_db().collection("tenants").document(tenant_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Barangay not found")
    clean = {k: v for k, v in updates.items() if v is not None}
    if clean:
        doc_ref.update(clean)
    return get_tenant(tenant_id)


def set_tenant_logo(tenant_id: str, logo_url: str) -> Tenant:
    return update_tenant(tenant_id, {"logoUrl": logo_url})


def delete_tenant(tenant_id: str) -> dict:
    doc_ref = get_db().collection("tenants").document(tenant_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Barangay not found")
    doc_ref.delete()
    return {"id": tenant_id, "message": "Tenant deleted"}


def delete_city(city_id: str) -> dict:
    doc_ref = get_db().collection("cities").document(city_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="City not found")

    city_name = (snapshot.to_dict() or {}).get("name")
    still_in_use = get_db().collection("tenants").where("city", "==", city_name).limit(1).get()
    if still_in_use:
        raise HTTPException(
            status_code=409,
            detail="This city still has barangays registered under it. Delete or reassign those barangays first.",
        )

    doc_ref.delete()
    return {"id": city_id, "message": "City deleted"}


def require_tenant_exists(tenant_id: Optional[str]) -> None:
    if not tenant_id:
        raise HTTPException(status_code=400, detail="barangayId is required")
    if not get_db().collection("tenants").document(tenant_id).get().exists:
        raise HTTPException(status_code=404, detail="Barangay not found")
