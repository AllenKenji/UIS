# backend/app/scripts/bootstrap_admin.py
from firebase_admin import auth, credentials, initialize_app

def main():
    # Initialize Firebase Admin SDK with your service account
    

    cred = credentials.Certificate(r"C:\Projects\BIS\backend\serviceAccountKey.json")
    initialize_app(cred)

    uid = "kGC89j9mSWb2jt8FcFvqj7DRTZb2"
    auth.set_custom_user_claims(uid, {"role": "admin"})
    print("✅ Admin role set")


if __name__ == "__main__":
    main()
