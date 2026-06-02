"""Remove orphan SK-linked disbursement documents.

Orphan definition:
- disbursement.sourceType == "sk_program" and sourceId doc does not exist in sk_programs
- disbursement.sourceType == "sk_event" and sourceId doc does not exist in sk_events

Manual disbursements (without SK sourceType/sourceId) are left untouched.

Usage:
  python backend/scripts/cleanup_orphan_disbursements.py
  python backend/scripts/cleanup_orphan_disbursements.py --dry-run
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


def _bootstrap_path() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    backend_root = repo_root / "backend"
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))


def _normalize_text(value: object) -> str:
    return str(value or "").strip().lower()


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean orphan SK disbursement records")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted without deleting")
    args = parser.parse_args()

    _bootstrap_path()

    from backend.app.utils.firestore_utils import get_db  # pylint: disable=import-outside-toplevel

    db = get_db()
    disbursement_docs = list(db.collection("disbursements").stream())

    scanned = 0
    linked_sk = 0
    orphan_ids: list[str] = []

    for entry in disbursement_docs:
        scanned += 1
        data = entry.to_dict() or {}

        source_type = _normalize_text(data.get("sourceType"))
        source_id = str(data.get("sourceId") or "").strip()

        if source_type not in {"sk_program", "sk_event"}:
            continue
        if not source_id:
            orphan_ids.append(entry.id)
            continue

        linked_sk += 1
        target_collection = "sk_programs" if source_type == "sk_program" else "sk_events"
        exists = db.collection(target_collection).document(source_id).get().exists
        if not exists:
            orphan_ids.append(entry.id)

    if args.dry_run:
        print("[dry-run] cleanup_orphan_disbursements")
        print(f"scanned={scanned}")
        print(f"linked_sk={linked_sk}")
        print(f"orphans_found={len(orphan_ids)}")
        if orphan_ids:
            print("orphan_ids=")
            for orphan_id in orphan_ids:
                print(f"- {orphan_id}")
        return 0

    deleted = 0
    for orphan_id in orphan_ids:
        db.collection("disbursements").document(orphan_id).delete()
        deleted += 1

    print("cleanup_orphan_disbursements completed")
    print(f"scanned={scanned}")
    print(f"linked_sk={linked_sk}")
    print(f"orphans_deleted={deleted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
