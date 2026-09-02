"""Backfill resident role permissions in local PostgreSQL."""
from backend.app.core.roles import ROLE_PERMISSIONS
from backend.app.utils.firestore_utils import get_db


def main() -> None:
    for snapshot in get_db().collection("residents").stream():
        snapshot.reference.update({"role": "resident", "permissions": ROLE_PERMISSIONS["resident"]})
        print(f"Updated resident {snapshot.id}")


if __name__ == "__main__":
    main()
