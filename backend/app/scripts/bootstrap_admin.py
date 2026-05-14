# backend/app/scripts/bootstrap_admin.py
import os
from pathlib import Path
from firebase_admin import auth, credentials, initialize_app


def main():
    # Prefer env credentials path, then fallback to backend/serviceAccountKey.json
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path:
        cred_path = str(Path(__file__).resolve().parents[2] / "serviceAccountKey.json")

    cred = credentials.Certificate(cred_path)
    initialize_app(cred)

    uid = "kGC89j9mSWb2jt8FcFvqj7DRTZb2"
    auth.set_custom_user_claims(uid, {"role": "admin"})
    print("✅ Admin role set")


if __name__ == "__main__":
    main()
