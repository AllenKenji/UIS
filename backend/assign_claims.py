"""Synchronize role permissions in local PostgreSQL user profiles."""
from backend.app.core.roles import ROLE_PERMISSIONS
from backend.app.utils.firestore_utils import get_db


def main() -> None:
    for snapshot in get_db().collection("users").stream():
        data = snapshot.to_dict() or {}
        role = str(data.get("role", "resident")).lower()
        if role in ROLE_PERMISSIONS:
            snapshot.reference.update({"permissions": ROLE_PERMISSIONS[role]})
            print(f"Updated {snapshot.id}: {role}")


if __name__ == "__main__":
    main()
