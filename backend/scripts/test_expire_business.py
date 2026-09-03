"""Local-only test helper: backdates a business's permit validUntil and runs
the real expiration-check endpoint, so you can see a permit flip to
"expired" (and the renewal email get sent) without waiting a year.

This calls check_business_permit_expirations() directly — the exact same
function the Render Cron Job calls in production (see
app/routes/business_permit_routes.py) — so what you see here is what
production will do, not a reimplementation of it.

Usage — run it *inside* the backend container so it has the same
DATABASE_URL/GMAIL_*/etc. env vars the real server uses:

    docker compose exec backend python backend/scripts/test_expire_business.py
    docker compose exec backend python backend/scripts/test_expire_business.py BIZ-SOMEBARANGAY-2026-1234

(Omit the id to just grab the first approved business found.)
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def _bootstrap_path() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    backend_root = repo_root / "backend"
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

    # Running outside the container (bare venv), env vars won't already be
    # set the way docker-compose sets them — fall back to the repo-root
    # .env docker-compose itself reads, if present. Never overrides
    # already-set vars (e.g. the container's real environment).
    try:
        from dotenv import load_dotenv
        load_dotenv(repo_root / ".env")
    except ImportError:
        pass


def main() -> None:
    _bootstrap_path()

    from backend.app.core.postgres_store import initialize_database
    from backend.app.routes.business_permit_routes import check_business_permit_expirations
    from backend.app.utils.firestore_utils import get_db

    initialize_database()
    db = get_db()

    business_id = sys.argv[1] if len(sys.argv) > 1 else None
    if business_id:
        docs = db.collection("businesses").where("businessId", "==", business_id).limit(1).get()
        if not docs:
            raise SystemExit(f"❌ No business found with businessId={business_id}")
        doc = docs[0]
    else:
        docs = db.collection("businesses").where("status", "==", "approved").limit(1).get()
        if not docs:
            raise SystemExit(
                "❌ No approved business found to test with. Approve one first "
                "(via the staff evaluation modal, or register one as a walk-in)."
            )
        doc = docs[0]

    data = doc.to_dict() or {}
    if str(data.get("status", "")).lower() != "approved":
        raise SystemExit(
            f"❌ Business {data.get('businessId')} has status={data.get('status')!r}, "
            "not 'approved' — pick/approve one that's currently approved."
        )

    backdated = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    doc.reference.update({"validUntil": backdated, "permitExpiryNoticeSent": False})
    print(f"⏪ Backdated validUntil for '{data.get('businessName')}' ({data.get('businessId')}) to {backdated}")

    key = os.environ.get("BUSINESS_PERMIT_CHECK_KEY")
    if not key:
        # Not set locally — the endpoint requires *some* non-empty key to
        # match, so mint a throwaway one for this run only. In Render this
        # must be the real BUSINESS_PERMIT_CHECK_KEY env var instead.
        key = "local-test-key"
        os.environ["BUSINESS_PERMIT_CHECK_KEY"] = key
        print("⚠️  BUSINESS_PERMIT_CHECK_KEY was not set — using a throwaway key for this run only.")

    result = asyncio.run(check_business_permit_expirations(x_bis_permit_check_key=key))
    print("✅ check-expirations response:", result)

    refreshed = doc.reference.get().to_dict() or {}
    print(f"📋 Business status is now: {refreshed.get('status')!r}")
    print(
        "📧 If GMAIL_* env vars are configured, an expiration email should have "
        f"gone out to: {refreshed.get('email') or '(no email on file)'}"
    )


if __name__ == "__main__":
    main()
