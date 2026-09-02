from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.core.auth import get_current_user, resolve_tenant_scope
from backend.app.utils.firestore_utils import get_db

router = APIRouter(prefix="/youth", tags=["Youth"])

COLLECTIONS = {"programs": "sk_programs", "events": "sk_events", "feedback": "youth_feedback"}


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_youth_manager(user: dict) -> dict:
    if user.get("role") not in {"admin", "sk", "super_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SK or admin access required")
    return user


def _list(collection: str, barangay_id: str | None = None) -> list[dict]:
    query = get_db().collection(collection)
    if barangay_id:
        query = query.where("barangayId", "==", barangay_id)
    return [{"id": snapshot.id, **snapshot.to_dict()} for snapshot in query.stream()]


def _get_or_404(collection: str, document_id: str):
    snapshot = get_db().collection(collection).document(document_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Youth record not found")
    return snapshot


@router.get("/{resource}")
def list_youth_records(resource: str, barangayId: str | None = None, user: dict = Depends(get_current_user)):
    collection = COLLECTIONS.get(resource)
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown youth resource")
    return _list(collection, resolve_tenant_scope(user, barangayId))


@router.post("/{resource}", status_code=status.HTTP_201_CREATED)
def create_youth_record(resource: str, payload: dict, user: dict = Depends(get_current_user)):
    collection = COLLECTIONS.get(resource)
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown youth resource")
    if resource != "feedback":
        _require_youth_manager(user)

    data = {**payload, "barangayId": user.get("barangayId"), "createdAt": payload.get("createdAt") or _timestamp()}
    if resource == "feedback":
        data["authorUid"] = user.get("uid")
        data.setdefault("authorName", user.get("fullName") or user.get("email") or "Resident")
        data.setdefault("status", "new")

    reference = get_db().collection(collection).add(data)
    return {"id": reference.id, **data}


@router.put("/{resource}/{document_id}")
def update_youth_record(resource: str, document_id: str, payload: dict, user: dict = Depends(get_current_user)):
    collection = COLLECTIONS.get(resource)
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown youth resource")
    _require_youth_manager(user)
    snapshot = _get_or_404(collection, document_id)
    data = {**payload, "updatedAt": _timestamp()}
    snapshot.reference.update(data)
    return {"id": document_id, **snapshot.to_dict(), **data}


@router.delete("/{resource}/{document_id}")
def delete_youth_record(resource: str, document_id: str, user: dict = Depends(get_current_user)):
    collection = COLLECTIONS.get(resource)
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown youth resource")
    _require_youth_manager(user)
    _get_or_404(collection, document_id).reference.delete()
    return {"id": document_id, "deleted": True}