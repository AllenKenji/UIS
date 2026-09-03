from datetime import datetime
from pathlib import PurePosixPath
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from backend.app.core.auth import get_super_admin
from backend.app.core.local_storage import LocalStorage
from backend.app.models.tenant import (
    City,
    CityCreate,
    CityUpdate,
    Province,
    ProvinceCreate,
    ProvinceUpdate,
    Tenant,
    TenantCreate,
    TenantUpdate,
)
from backend.app.models.account import AccountResponse, RoleEnum
from backend.app.services.tenant_service import (
    create_city,
    create_province,
    create_tenant,
    delete_city,
    delete_province,
    delete_tenant,
    get_city,
    get_province,
    get_tenant,
    list_cities,
    list_provinces,
    list_tenants,
    set_city_logo,
    set_tenant_logo,
    update_city,
    update_province,
    update_tenant,
)
from backend.app.services.account_service import list_barangay_accounts
from backend.app.services.payment_service import delete_payment, delete_receipt, list_payments, list_receipts, payments_summary

router = APIRouter(prefix="/super-admin", tags=["Super Admin"])


def _logo_storage_path(scope: str, scope_id: str, filename: str) -> str:
    safe_name = PurePosixPath(filename or "logo.png").name
    return f"{scope}/{scope_id}/logo/{safe_name}"


@router.get("/tenants", response_model=List[Tenant])
def list_tenants_handler(city: Optional[str] = None, _: dict = Depends(get_super_admin)):
    return list_tenants(city=city)


@router.post("/tenants", response_model=Tenant, status_code=201)
def create_tenant_handler(payload: TenantCreate, _: dict = Depends(get_super_admin)):
    return create_tenant(payload)


@router.get("/tenants/{tenant_id}", response_model=Tenant)
def get_tenant_handler(tenant_id: str, _: dict = Depends(get_super_admin)):
    return get_tenant(tenant_id)


@router.patch("/tenants/{tenant_id}", response_model=Tenant)
def update_tenant_handler(tenant_id: str, payload: TenantUpdate, _: dict = Depends(get_super_admin)):
    return update_tenant(tenant_id, payload.model_dump(exclude_unset=True))


@router.post("/tenants/{tenant_id}/logo", response_model=Tenant)
async def upload_tenant_logo_handler(
    tenant_id: str,
    file: UploadFile = File(...),
    _: dict = Depends(get_super_admin),
):
    get_tenant(tenant_id)  # 404s if missing
    storage_path = _logo_storage_path("tenants", tenant_id, file.filename)
    blob = LocalStorage().blob(storage_path)
    blob.upload_from_file(file.file, content_type=file.content_type)
    return set_tenant_logo(tenant_id, blob.generate_signed_url())


@router.delete("/tenants/{tenant_id}")
def delete_tenant_handler(tenant_id: str, _: dict = Depends(get_super_admin)):
    return delete_tenant(tenant_id)


@router.get("/provinces", response_model=List[Province])
def list_provinces_handler(_: dict = Depends(get_super_admin)):
    return list_provinces()


@router.post("/provinces", response_model=Province, status_code=status.HTTP_201_CREATED)
def create_province_handler(payload: ProvinceCreate, _: dict = Depends(get_super_admin)):
    return create_province(payload.name)


@router.get("/provinces/{province_id}", response_model=Province)
def get_province_handler(province_id: str, _: dict = Depends(get_super_admin)):
    return get_province(province_id)


@router.patch("/provinces/{province_id}", response_model=Province)
def update_province_handler(province_id: str, payload: ProvinceUpdate, _: dict = Depends(get_super_admin)):
    return update_province(province_id, payload.name)


@router.delete("/provinces/{province_id}")
def delete_province_handler(province_id: str, _: dict = Depends(get_super_admin)):
    return delete_province(province_id)


@router.get("/cities", response_model=List[City])
def list_cities_handler(_: dict = Depends(get_super_admin)):
    return list_cities()


@router.post("/cities", response_model=City, status_code=status.HTTP_201_CREATED)
def create_city_handler(payload: CityCreate, _: dict = Depends(get_super_admin)):
    return create_city(payload.name, payload.province)


@router.get("/cities/{city_id}", response_model=City)
def get_city_handler(city_id: str, _: dict = Depends(get_super_admin)):
    return get_city(city_id)


@router.patch("/cities/{city_id}", response_model=City)
def update_city_handler(city_id: str, payload: CityUpdate, _: dict = Depends(get_super_admin)):
    return update_city(city_id, payload.name, payload.province)


@router.post("/cities/{city_id}/logo", response_model=City)
async def upload_city_logo_handler(
    city_id: str,
    file: UploadFile = File(...),
    _: dict = Depends(get_super_admin),
):
    get_city(city_id)  # 404s if missing
    storage_path = _logo_storage_path("cities", city_id, file.filename)
    blob = LocalStorage().blob(storage_path)
    blob.upload_from_file(file.file, content_type=file.content_type)
    return set_city_logo(city_id, blob.generate_signed_url())


@router.delete("/cities/{city_id}")
def delete_city_handler(city_id: str, _: dict = Depends(get_super_admin)):
    return delete_city(city_id)


@router.get("/accounts", response_model=List[AccountResponse])
async def list_accounts_handler(
    barangayId: Optional[str] = None,
    city: Optional[str] = None,
    role: Optional[RoleEnum] = None,
    limit: int = 50,
    offset: int = 0,
    _: dict = Depends(get_super_admin),
):
    accounts = await list_barangay_accounts(role=role, limit=limit, offset=offset, barangay_id=barangayId)
    if city:
        tenant_ids = {t.id for t in list_tenants(city=city)}
        accounts = [a for a in accounts if a.barangayId in tenant_ids]
    return accounts


@router.get("/payments")
def list_payments_handler(
    barangayId: Optional[str] = None,
    city: Optional[str] = None,
    status: Optional[str] = None,
    fromDate: Optional[datetime] = None,
    toDate: Optional[datetime] = None,
    limit: int = 200,
    offset: int = 0,
    _: dict = Depends(get_super_admin),
):
    payments = list_payments(
        barangay_id=barangayId,
        status=status,
        from_date=fromDate,
        to_date=toDate,
        limit=limit,
        offset=offset,
    )
    if city:
        tenant_ids = {t.id for t in list_tenants(city=city)}
        payments = [p for p in payments if p.get("barangayId") in tenant_ids]
    return payments


@router.delete("/payments/{payment_id}")
def delete_payment_handler(payment_id: str, _: dict = Depends(get_super_admin)):
    result = delete_payment(payment_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return {"success": True, "id": payment_id, "deletedReceiptIds": result["deletedReceiptIds"]}


@router.get("/payments/summary")
def payments_summary_handler(city: Optional[str] = None, _: dict = Depends(get_super_admin)):
    tenant_ids = {t.id for t in list_tenants(city=city)} if city else None
    summary = payments_summary(barangay_ids=list(tenant_ids) if tenant_ids is not None else None)
    tenants_by_id = {t.id: t for t in list_tenants()}
    for entry in summary:
        tenant = tenants_by_id.get(entry["barangayId"])
        entry["barangay"] = tenant.barangay if tenant else None
        entry["city"] = tenant.city if tenant else None
    return summary


@router.get("/receipts")
def list_receipts_handler(
    barangayId: Optional[str] = None,
    city: Optional[str] = None,
    fromDate: Optional[datetime] = None,
    toDate: Optional[datetime] = None,
    limit: int = 200,
    offset: int = 0,
    _: dict = Depends(get_super_admin),
):
    receipts = list_receipts(barangay_id=barangayId, from_date=fromDate, to_date=toDate, limit=limit, offset=offset)
    if city:
        tenant_ids = {t.id for t in list_tenants(city=city)}
        receipts = [r for r in receipts if r.get("barangayId") in tenant_ids]
    return receipts


@router.delete("/receipts/{receipt_id}")
def delete_receipt_handler(receipt_id: str, _: dict = Depends(get_super_admin)):
    result = delete_receipt(receipt_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return {"success": True, "id": receipt_id, "deletedPaymentIds": result["deletedPaymentIds"]}
