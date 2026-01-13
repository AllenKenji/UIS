from fastapi import APIRouter
from app.core.firebase import get_firestore

router = APIRouter(tags=["Test"])

@router.get("/test/firestore")
def test_firestore():
    db = get_firestore()
    doc = db.collection("test").document("ping")
    doc.set({"message": "pong"})
    return {"status": "ok", "message": "pong written"}
