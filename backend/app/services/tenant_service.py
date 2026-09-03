import logging
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException

from backend.app.models.tenant import City, Province, Tenant, TenantCreate
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def _tenant_id(payload: TenantCreate) -> str:
    return f"{_slugify(payload.city)}-{_slugify(payload.barangay)}"


def _city_id(city: str) -> str:
    return _slugify(city)


def _province_id(province: str) -> str:
    return _slugify(province)


def create_province(name: str) -> Province:
    province_id = _province_id(name)
    doc_ref = get_db().collection("provinces").document(province_id)
    if doc_ref.get().exists:
        raise HTTPException(status_code=409, detail="This province is already registered")
    data = {"name": name.strip(), "createdAt": datetime.now(timezone.utc)}
    doc_ref.set(data)
    logger.info("✅ Province created: %s", province_id)
    return Province(id=province_id, **data)


def list_provinces() -> List[Province]:
    docs = get_db().collection("provinces").order_by("name").get()
    return [Province(id=doc.id, **(doc.to_dict() or {})) for doc in docs]


def get_province(province_id: str) -> Province:
    snapshot = get_db().collection("provinces").document(province_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Province not found")
    return Province(id=province_id, **(snapshot.to_dict() or {}))


def update_province(province_id: str, name: str) -> Province:
    """Rename a province, cascading down through City.province and
    Tenant.province — both are plain duplicated strings, not foreign keys
    (same situation as Tenant.city; see update_city), so every city and
    barangay under this province would silently stop matching it otherwise."""
    doc_ref = get_db().collection("provinces").document(province_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Province not found")

    new_name = name.strip()
    if not new_name:
        raise HTTPException(status_code=422, detail="Province name cannot be empty")

    old_name = (snapshot.to_dict() or {}).get("name")
    if new_name == old_name:
        return get_province(province_id)

    if any(p.id != province_id and p.name == new_name for p in list_provinces()):
        raise HTTPException(status_code=409, detail="Another province already has this name")

    db = get_db()
    affected_city_names = [
        c.name for c in list_cities() if c.province == old_name
    ]

    batch = db.batch()
    batch.update(doc_ref, {"name": new_name})
    for city_doc in db.collection("cities").where("province", "==", old_name).stream():
        batch.update(city_doc.reference, {"province": new_name})
    for city_name in affected_city_names:
        for tenant_doc in db.collection("tenants").where("city", "==", city_name).stream():
            batch.update(tenant_doc.reference, {"province": new_name})
    batch.commit()

    logger.info("✅ Province renamed: %s -> %s (id=%s)", old_name, new_name, province_id)
    return get_province(province_id)


def delete_province(province_id: str) -> dict:
    doc_ref = get_db().collection("provinces").document(province_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Province not found")

    province_name = (snapshot.to_dict() or {}).get("name")
    still_in_use = get_db().collection("cities").where("province", "==", province_name).limit(1).get()
    if still_in_use:
        raise HTTPException(
            status_code=409,
            detail="This province still has cities registered under it. Delete or reassign those cities first.",
        )

    doc_ref.delete()
    return {"id": province_id, "message": "Province deleted"}


def get_or_create_city(city: str) -> City:
    city_id = _city_id(city)
    doc_ref = get_db().collection("cities").document(city_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        # Cities are meant to be created explicitly via create_city (picking
        # a registered province) before any barangay references them — this
        # implicit path only exists as a fallback for create_tenant, so a
        # city that lands here has no province on record until edited.
        data = {"name": city, "province": None, "logoUrl": None, "createdAt": datetime.now(timezone.utc)}
        doc_ref.set(data)
        logger.info("✅ City created: %s", city_id)
        return City(id=city_id, **data)
    return City(id=city_id, **(snapshot.to_dict() or {}))


def create_city(name: str, province: str) -> City:
    """Explicitly register a city, ahead of any barangay being added under
    it — unlike get_or_create_city (used as a side effect of create_tenant),
    this rejects a name that already exists instead of silently returning
    the existing one, since it's driven by its own "Add a City" action now
    that barangay creation picks from the registered list rather than
    free-typing a city name."""
    city_id = _city_id(name)
    doc_ref = get_db().collection("cities").document(city_id)
    if doc_ref.get().exists:
        raise HTTPException(status_code=409, detail="This city is already registered")
    data = {
        "name": name.strip(),
        "province": province.strip(),
        "logoUrl": None,
        "createdAt": datetime.now(timezone.utc),
    }
    doc_ref.set(data)
    logger.info("✅ City created: %s", city_id)
    return City(id=city_id, **data)


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


def update_city(city_id: str, name: str, province: Optional[str] = None) -> City:
    """Rename a city and/or (re)assign its province.

    Tenant.city and Tenant.province are stored as plain strings (there's no
    cityId foreign key — see list_tenants/delete_city, which both match
    tenants by that string), so every barangay/tenant filtered, grouped, or
    matched by city/province name (super-admin Payments/Receipts/Accounts
    filters, the document forms' barangay picker, the public
    province/city/barangay picker, etc.) would silently stop matching this
    city the moment either changed if we didn't also rewrite those tenant
    records here. The city document's own id is left untouched — it's just a
    Firestore key, nothing else references it — so no cascading id change is
    needed.
    """
    doc_ref = get_db().collection("cities").document(city_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="City not found")

    existing = snapshot.to_dict() or {}
    old_name = existing.get("name")
    old_province = existing.get("province")

    new_name = name.strip()
    if not new_name:
        raise HTTPException(status_code=422, detail="City name cannot be empty")

    new_province = province.strip() if province else old_province

    if new_name != old_name:
        duplicate = [c for c in list_cities() if c.id != city_id and c.name == new_name]
        if duplicate:
            raise HTTPException(status_code=409, detail="Another city already has this name")

    if new_name == old_name and new_province == old_province:
        return get_city(city_id)

    db = get_db()
    batch = db.batch()
    city_updates = {}
    if new_name != old_name:
        city_updates["name"] = new_name
    if new_province != old_province:
        city_updates["province"] = new_province
    batch.update(doc_ref, city_updates)

    # Tenants are matched by the city's *current* name (before this update),
    # since that's what's still stored on them at this point.
    for tenant_doc in db.collection("tenants").where("city", "==", old_name).stream():
        tenant_updates = {}
        if new_name != old_name:
            tenant_updates["city"] = new_name
        if new_province != old_province:
            tenant_updates["province"] = new_province
        if tenant_updates:
            batch.update(tenant_doc.reference, tenant_updates)
    batch.commit()

    logger.info(
        "✅ City updated (id=%s): name %s -> %s, province %s -> %s",
        city_id, old_name, new_name, old_province, new_province,
    )
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
