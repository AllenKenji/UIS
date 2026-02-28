# backend/app/utils/firestore_utils.py
import logging
from fastapi import HTTPException
from backend.app.core.firebase import get_firestore
from datetime import datetime

logger = logging.getLogger("uvicorn.error")

def get_db(): 
    """Return a Firestore client lazily.""" 
    return get_firestore()

# -----------------------------
# 🔧 Unified Fee Validator
# -----------------------------
def validate_fee(data: dict):
    """
    Ensure fee is non-negative.
    Accepts 0 as valid, rejects None or negative values.
    """
    fee = data.get("fee")
    if fee is None or fee < 0:
        raise HTTPException(status_code=400, detail="Fee must be a non-negative number")

# -----------------------------
# 📄 Create Document
# -----------------------------
def create_document(collection: str, doc_id: str, data: dict):

    logger.info("Firestore create_document data=%s", data)

    try:
        validate_fee(data)  # ✅ unified check
        ref = get_db().collection(collection).document(doc_id)
        data["createdAt"] = datetime.utcnow().isoformat()
        ref.set(data)
        return {"id": doc_id, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create {collection}/{doc_id}: {str(e)}")

# -----------------------------
# ✏️ Update Document
# -----------------------------
def update_document(collection: str, doc_id: str, data: dict):
    try:
        validate_fee(data)  # ✅ unified check
        ref = get_db().collection(collection).document(doc_id)
        if not ref.get().exists:
            raise HTTPException(status_code=404, detail=f"{collection}/{doc_id} not found")
        data["updatedAt"] = datetime.utcnow().isoformat()
        ref.update(data)
        return {"id": doc_id, "updated": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update {collection}/{doc_id}: {str(e)}")

# -----------------------------
# ❌ Delete Document
# -----------------------------
def delete_document(collection: str, doc_id: str):
    try:
        ref = get_db().collection(collection).document(doc_id)
        if not ref.get().exists:
            raise HTTPException(status_code=404, detail=f"{collection}/{doc_id} not found")
        ref.delete()
        return {"id": doc_id, "status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete {collection}/{doc_id}: {str(e)}")

# -----------------------------
# 🔍 Get Document
# -----------------------------
def get_document(collection: str, doc_id: str):
    try:
        ref = get_db().collection(collection).document(doc_id)
        doc = ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"{collection}/{doc_id} not found")
        return doc.to_dict() | {"id": doc.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch {collection}/{doc_id}: {str(e)}")
