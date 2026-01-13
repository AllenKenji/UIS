from fastapi import APIRouter, Depends, HTTPException
from backend.app.core.firebase import get_firestore
from backend.app.core.auth import get_admin_uid
from backend.app.models.fee import (
    DocumentFee, BusinessFee, MiscFee,
    NewDocumentFee, NewBusinessFee, NewMiscFee
)

db = get_firestore()
router = APIRouter(prefix="/fees", tags=["Fees"])

# -----------------------------
# 🔧 Shared Firestore Helpers
# -----------------------------
def list_collection(collection: str):
    """Return all documents in a Firestore collection as dicts with id."""
    docs = db.collection(collection).get()
    return [doc.to_dict() | {"id": doc.id} for doc in docs]

def list_with_misc(collection: str):
    docs = db.collection(collection).get()
    misc_map = {
        m.id.strip().lower().replace(" ", "_"): m.to_dict()
        for m in db.collection("misc_fees").get()
    }

    result = []
    for doc in docs:
        data = doc.to_dict()
        misc_type_raw = data.get("miscType")
        if misc_type_raw:
            misc_type_key = misc_type_raw.strip().lower().replace(" ", "_")
            misc_entry = misc_map.get(misc_type_key)
            if misc_entry and misc_entry.get("enabled") and data.get("enabled"):
                # ✅ resolve only if both misc fee and the record itself are enabled
                data["miscFeeResolved"] = misc_entry["fee"]
            else:
                data["miscFeeResolved"] = None
        else:
            data["miscFeeResolved"] = None
        result.append(data | {"id": doc.id})
    return result

def create_document(collection: str, doc_id: str, data: dict):
    ref = db.collection(collection).document(doc_id)
    if ref.get().exists:
        raise HTTPException(status_code=400, detail=f"{collection} {doc_id} already exists")
    ref.set(data)
    return {"success": True, "id": doc_id, **data}

def update_document(collection: str, doc_id: str, data: dict):
    ref = db.collection(collection).document(doc_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail=f"{collection} {doc_id} not found")
    ref.update(data)
    return {"success": True, "id": doc_id, "updated": data}

def delete_document(collection: str, doc_id: str):
    ref = db.collection(collection).document(doc_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail=f"{collection} {doc_id} not found")
    ref.delete()
    return {"success": True, "message": f"{collection} {doc_id} deleted"}

# -----------------------------
# 🔨 Router Factory
# -----------------------------
def make_fee_routes(
    collection: str,
    prefix: str,
    new_model,
    update_model,
    id_field: str,
    extra_fields: list[str] = None,
    resolve_misc: bool = False,
):
    """Generate CRUD endpoints for a fee type."""
    if extra_fields is None:
        extra_fields = []

    @router.get(f"/{prefix}")
    def list_fees(admin=Depends(get_admin_uid)):
        return list_with_misc(collection) if resolve_misc else list_collection(collection)

    @router.post(f"/{prefix}")
    def create_fee(payload: new_model, admin=Depends(get_admin_uid)):
        fee_id = getattr(payload, id_field).strip().lower().replace(" ", "_")
        data = {id_field: getattr(payload, id_field).strip(), "fee": payload.fee}
        for field in extra_fields:
            data[field] = getattr(payload, field)
        return create_document(collection, fee_id, data)

    @router.put(f"/{prefix}/{{fee_id}}")
    def update_fee(fee_id: str, payload: update_model, admin=Depends(get_admin_uid)):
        update_data = {"fee": payload.fee}
        for field in extra_fields:
            value = getattr(payload, field, None)
            if value is not None:
                update_data[field] = value
        return update_document(collection, fee_id, update_data)

    @router.delete(f"/{prefix}/{{fee_id}}")
    def delete_fee(fee_id: str, admin=Depends(get_admin_uid)):
        return delete_document(collection, fee_id)

# -----------------------------
# 📄 Document Fee Routes
# -----------------------------
make_fee_routes(
    collection="document_types",
    prefix="documents",
    new_model=NewDocumentFee,
    update_model=DocumentFee,
    id_field="documentType",
    extra_fields=["miscType", "enabled"],
    resolve_misc=True, 
)

# -----------------------------
# 🏢 Business Fee Routes
# -----------------------------
make_fee_routes(
    collection="business_types",
    prefix="businesses",
    new_model=NewBusinessFee,
    update_model=BusinessFee,
    id_field="businessType",
    extra_fields=["registrationFee", "annualFee", "miscType", "enabled"],
    resolve_misc=True,  
)

# -----------------------------
# 🆕 Miscellaneous Fee Routes
# -----------------------------
make_fee_routes(
    collection="misc_fees",
    prefix="misc",
    new_model=NewMiscFee,
    update_model=MiscFee,
    id_field="miscType",
    extra_fields=["enabled"],
)
