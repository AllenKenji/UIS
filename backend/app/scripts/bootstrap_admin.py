# backend/app/scripts/bootstrap_admin.py
import os
from backend.app.utils.firestore_utils import get_db


def main():
    uid = os.environ["ADMIN_UID"]
    get_db().collection("users").document(uid).update({"role": "admin"})
    print("Admin role set")


if __name__ == "__main__":
    main()
