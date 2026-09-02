"""Read-only reporting data for role dashboards."""
from collections import Counter

from fastapi import APIRouter, Depends

from backend.app.core.auth import require_permission
from backend.app.utils.firestore_utils import get_db


router = APIRouter(prefix="/reporting", tags=["Reporting"])


def _list_collection(collection_name: str) -> list[dict]:
    return [
        {"id": snapshot.id, **(snapshot.to_dict() or {})}
        for snapshot in get_db().collection(collection_name).get()
    ]


@router.get("/counters")
def list_counters(_uid: str = Depends(require_permission("viewDocuments"))) -> list[dict]:
    """List document counters for the secretary dashboard."""
    return _list_collection("counters")


@router.get("/documents/statuses")
def document_statuses(_uid: str = Depends(require_permission("viewDocuments"))) -> dict:
    """Aggregate the fixed documents collection by its status field."""
    documents = _list_collection("documents")
    return {
        "total": len(documents),
        "counts": dict(
            Counter(
                str(document.get("status")).strip()
                for document in documents
                if document.get("status") is not None
            )
        ),
    }


def _require_financial_reporting(
    _uid: str = Depends(require_permission(["incomingPayments", "viewFinancialRecords"]))
) -> str:
    return _uid


@router.get("/treasurer/payments")
def list_payments(_uid: str = Depends(_require_financial_reporting)) -> list[dict]:
    return _list_collection("payments")


@router.get("/treasurer/receipts")
def list_receipts(_uid: str = Depends(_require_financial_reporting)) -> list[dict]:
    return _list_collection("receipts")


@router.get("/treasurer/businesses")
def list_treasurer_businesses(_uid: str = Depends(_require_financial_reporting)) -> list[dict]:
    return _list_collection("businesses")


@router.get("/treasurer/documents")
def list_treasurer_documents(_uid: str = Depends(_require_financial_reporting)) -> list[dict]:
    return _list_collection("documents")