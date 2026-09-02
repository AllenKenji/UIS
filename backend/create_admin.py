"""Create the first local PostgreSQL-backed BIS administrator."""
from __future__ import annotations

import getpass
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from backend.app.core.local_auth import create_user
from backend.app.core.roles import ROLE_PERMISSIONS

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def main() -> None:
    email = input("Admin email: ").strip().lower()
    full_name = input("Admin full name: ").strip()
    password = getpass.getpass("Admin password (minimum 8 characters): ")
    confirmation = getpass.getpass("Confirm password: ")

    if not email or "@" not in email:
        raise SystemExit("A valid admin email is required.")
    if len(full_name) < 2:
        raise SystemExit("Admin full name must contain at least 2 characters.")
    if len(password) < 8:
        raise SystemExit("Admin password must contain at least 8 characters.")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")

    now = datetime.now(timezone.utc)
    try:
        uid = create_user(email, password, {
            "full_name": full_name,
            "role": "admin",
            "permissions": ROLE_PERMISSIONS["admin"],
            "createdBy": "bootstrap",
            "createdAt": now,
            "updatedAt": now,
        })
    except ValueError as error:
        raise SystemExit(str(error)) from error

    print(f"Admin account created successfully. UID: {uid}")


if __name__ == "__main__":
    main()
