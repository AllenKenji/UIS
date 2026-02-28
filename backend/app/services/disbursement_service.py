from backend.app.utils.firestore_utils import get_db


def create_disbursement(payload: dict) -> dict:
    ref = get_db().collection("disbursements").document()
    ref.set(payload)
    return {"id": ref.id, **payload}

def list_disbursements() -> list[dict]:
    docs = get_db().collection("disbursements").stream()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]

def get_disbursement(id: str) -> dict | None:
    doc = get_db().collection("disbursements").document(id).get()
    return {"id": doc.id, **doc.to_dict()} if doc.exists else None

def update_disbursement(id: str, payload: dict) -> dict | None:
    ref = get_db().collection("disbursements").document(id)
    if not ref.get().exists:
        return None
    ref.update(payload)
    return {"id": id, **payload}

def update_status(id: str, status: str) -> dict | None:
    ref = get_db().collection("disbursements").document(id)
    if not ref.get().exists:
        return None
    ref.update({"status": status})
    return {"id": id, "status": status}

def delete_disbursement(id: str) -> bool:
    ref = get_db().collection("disbursements").document(id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True
