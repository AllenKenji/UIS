# BIS Complete Source Code Reference

Generated on: 2026-05-06 10:39:18

This document is auto-generated from project source files.

## apphosting.yaml

```yaml
runtime: python3.12

runConfig:
  minInstances: 0
  maxInstances: 50
  concurrency: 80
  cpu: 1
  memoryMiB: 512
  entrypoint: uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT

env:
  # Firebase bucket
  - variable: FIREBASE_STORAGE_BUCKET
    value: barangay-1721d.appspot.com
    availability:
      - RUNTIME

  # PayMongo secrets
  - variable: PAYMONGO_SECRET_KEY
    secret: paymongoSecretKeyRef
    availability:
      - RUNTIME
  - variable: PAYMONGO_PUBLIC_KEY
    secret: paymongoPublicKeyRef
    availability:
      - RUNTIME
  - variable: PAYMONGO_WEBHOOK_SECRET
    secret: paymongoWebhookSecretRef
    availability:
      - RUNTIME

```

## backend\__init__.py

```python
# backend package
```

## backend\app\__init__.py

```python
```

## backend\app\config.py

```python
import os

class Settings:
    PAYMONGO_SECRET_KEY = os.environ.get("PAYMONGO_SECRET_KEY")
    PAYMONGO_PUBLIC_KEY = os.environ.get("PAYMONGO_PUBLIC_KEY")
    PAYMONGO_WEBHOOK_SECRET = os.environ.get("PAYMONGO_WEBHOOK_SECRET")
    FIREBASE_STORAGE_BUCKET = os.environ.get("FIREBASE_STORAGE_BUCKET")

settings = Settings()

```

## backend\app\core\auth.py

```python
# backend/app/core/auth.py
from firebase_admin import auth, firestore
from fastapi import Depends, HTTPException, Header, status
from backend.app.core.roles import get_permissions
from backend.app.core.firebase import ensure_firebase_initialized  # ✅ centralized init
import logging

logger = logging.getLogger("uvicorn.error")

def get_db() -> firestore.Client:
    """Return Firestore client, ensuring Firebase is initialized."""
    ensure_firebase_initialized()
    return firestore.client()

def _verify_token(authorization: str) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        decoded = auth.verify_id_token(token)
        logger.info("✅ Token verified: uid=%s, role=%s, aud=%s, iss=%s",
                    decoded.get("uid"), decoded.get("role"), decoded.get("aud"), decoded.get("iss"))
        return decoded
    except Exception as e:
        # Log unverified claims for debugging
        try:
            import jwt
            unverified = jwt.decode(token, options={"verify_signature": False})
            logger.error("❌ Token verification failed: %s | Claims=%s", e, unverified)
        except Exception:
            logger.error("❌ Token verification failed: %s | Could not decode claims", e)
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

async def get_current_user(authorization: str = Header(...)) -> dict:
    """Return decoded token payload for the current user, resolving role from Firestore if missing."""
    decoded = _verify_token(authorization)
    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload: UID missing")

    role = decoded.get("role")

    logger.debug("🔍 Resolving role for uid=%s: token role=%s", uid, role)

    # 🔎 Derive role if not present in claims
    if not role:
        logger.warning("⚠️ No role claim in token for uid=%s. Falling back to Firestore.", uid)
        db = get_db()  
        user_doc = db.collection("users").document(uid).get()
        if user_doc.exists:
            role = user_doc.to_dict().get("role")
        elif db.collection("residents").document(uid).get().exists:
            role = "resident"

    decoded["role"] = str(role or "resident").strip().lower()
    return decoded


async def get_admin_uid(user: dict = Depends(get_current_user)) -> str:
    """Require that the user has role=admin and return UID."""
    uid = user.get("uid")
    role = user.get("role")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return uid


def require_permission(permission: str | list[str]):
    """
    Factory that returns a dependency requiring one or more permissions.
    Accepts either a single permission string or a list of permission strings.
    """
    async def dependency(user: dict = Depends(get_current_user)) -> str:
        uid = user.get("uid")
        role = user.get("role")

        # Prefer explicit claims if present
        permissions = user.get("permissions")

        # Force certain staff roles to always use JSON permissions
        if role in ("admin", "staff", "secretary", "treasurer", "sk", "dilg"):
            permissions = get_permissions(role)

        # Residents fallback to JSON if token has no permissions
        elif permissions is None:
            permissions = get_permissions(role)

        # Handle single vs. multiple permissions
        if isinstance(permission, list):
            if not any(permissions.get(p, False) for p in permission):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"One of {permission} required"
                )
        else:
            if not permissions.get(permission, False):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission '{permission}' required"
                )

        return uid

    return dependency

def set_user_role(uid: str, role: str):
    auth.set_custom_user_claims(uid, {"role": role})
    return {"uid": uid, "role": role}

```

## backend\app\core\firebase.py

```python
import os, logging, json, firebase_admin
from firebase_admin import credentials, firestore, storage
from google.cloud.storage.bucket import Bucket
from google.cloud import exceptions
from datetime import timedelta
from urllib.parse import quote
from uuid import uuid4

logger = logging.getLogger("uvicorn.error")


def ensure_firebase_initialized() -> firebase_admin.App:
    try:
        app = firebase_admin.get_app()
        logger.debug("ℹ️ Firebase already initialized. Options: %s", app.options.__dict__)
        return app
    except ValueError:
        bucket = os.environ.get("FIREBASE_STORAGE_BUCKET")
        if not bucket:
            raise RuntimeError("❌ FIREBASE_STORAGE_BUCKET environment variable is not set")

        # Case 1: Service account JSON injected directly into env var
        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        if service_account_json:
            logger.info("🔑 Using service account JSON from FIREBASE_SERVICE_ACCOUNT env var")
            cred = credentials.Certificate(json.loads(service_account_json))
            app = firebase_admin.initialize_app(cred, {"storageBucket": bucket})
        else:
            # Case 2: Fallback to GOOGLE_APPLICATION_CREDENTIALS file path (local dev)
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path and os.path.exists(cred_path):
                logger.info("🔍 Using service account key at: %s", cred_path)
                cred = credentials.Certificate(cred_path)
                app = firebase_admin.initialize_app(cred, {"storageBucket": bucket})
            else:
                logger.info("🔑 Using default application credentials")
                app = firebase_admin.initialize_app(options={"storageBucket": bucket})

        logger.info("✅ Firebase initialized successfully with bucket: %s", bucket)
        return app


def get_firestore() -> firestore.Client:
    ensure_firebase_initialized()
    return firestore.client()


def get_storage_bucket() -> Bucket:
    app = ensure_firebase_initialized()
    bucket_name = app.options.get("storageBucket")
    logger.info("🔍 Firebase app storageBucket option = %s", bucket_name)
    logger.info("🔍 Bucket repr = %r", bucket_name)
    if not bucket_name:
        raise RuntimeError("❌ Firebase app has no storageBucket configured")
    return storage.bucket(bucket_name)


def upload_file(file_obj, path: str, public: bool = True) -> dict:
    bucket = get_storage_bucket()
    blob = bucket.blob(path)

    try:
        file_obj.file.seek(0)
        content_type = getattr(file_obj, "content_type", "application/octet-stream")

        download_token = None
        if public:
            download_token = str(uuid4())
            blob.metadata = {
                "firebaseStorageDownloadTokens": download_token,
            }

        blob.upload_from_file(file_obj.file, content_type=content_type)

        if public:
            encoded_path = quote(path, safe="")
            url = (
                f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/"
                f"{encoded_path}?alt=media&token={download_token}"
            )
        else:
            url = blob.generate_signed_url(expiration=timedelta(hours=24))

        logger.info("📤 Uploaded file %s → %s", getattr(file_obj, "filename", "<unknown>"), url)
        return {"url": url, "path": path}

    except exceptions.GoogleCloudError as gce:
        logger.error("❌ Google Cloud error uploading file %s: %s", getattr(file_obj, "filename", "<unknown>"), gce)
        raise RuntimeError("File upload failed") from gce
    except Exception as e:
        logger.exception("❌ Unexpected error uploading file %s: %s", getattr(file_obj, "filename", "<unknown>"), e)
        raise RuntimeError("File upload failed") from e


def delete_file(path: str) -> None:
    bucket = get_storage_bucket()
    blob = bucket.blob(path)

    try:
        blob.delete()
        logger.info("🗑️ Deleted file at path=%s", path)
    except exceptions.NotFound:
        logger.warning("⚠️ File not found in storage: %s", path)
    except exceptions.GoogleCloudError as gce:
        logger.error("❌ Google Cloud error deleting file %s: %s", path, gce)
        raise RuntimeError("File deletion failed") from gce
    except Exception as e:
        logger.exception("❌ Unexpected error deleting file %s: %s", path, e)
        raise RuntimeError("File deletion failed") from e

```

## backend\app\core\roles.py

```python
# backend/app/core/roles.py

import json
from pathlib import Path
from typing import Dict

CONFIG_PATH = Path(__file__).resolve().parents[3] / "config" / "role_permissions.json"

def load_role_permissions(path: Path = CONFIG_PATH) -> Dict[str, Dict[str, bool]]:
    with open(path, "r", encoding="utf-8") as f:
        overrides = json.load(f)

    # Collect all permissions mentioned across roles
    all_perms = {perm for keys in overrides.values() for perm in keys}

    # Build full map: each role gets True/False for every permission
    role_maps = {
        role: {perm: perm in keys for perm in all_perms}
        for role, keys in overrides.items()
    }

    return role_maps, all_perms

ROLE_PERMISSIONS, ALL_PERMISSIONS = load_role_permissions()

def get_permissions(role: str) -> Dict[str, bool]:
    role = role.lower().strip()
    return ROLE_PERMISSIONS.get(role, {perm: False for perm in ALL_PERMISSIONS})


```

## backend\app\core\websocket_manager.py

```python
import logging
from typing import Dict
from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from starlette.websockets import WebSocketState

logger = logging.getLogger("uvicorn.error")

class ConnectionManager:
    def __init__(self):
        # Map WebSocket -> user info (role, user_id, auth_method, etc.)
        self.active_connections: Dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket, user_info: dict):
        """
        Accept and store a new WebSocket connection with user metadata.
        user_info should include: uid, role, user_id, and optionally auth_method.
        """
        if websocket.client_state == WebSocketState.CONNECTING:
            await websocket.accept()
        self.active_connections[websocket] = user_info
        logger.info(
            "🔌 WebSocket connected (role=%s, user_id=%s, auth=%s). Total connections: %d",
            user_info.get("role"),
            user_info.get("user_id"),
            user_info.get("auth_method", "unknown"),
            len(self.active_connections),
        )

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            info = self.active_connections.pop(websocket, None)
            logger.info(
                "❌ WebSocket disconnected (role=%s, user_id=%s, auth=%s). Total connections: %d",
                info.get("role") if info else None,
                info.get("user_id") if info else None,
                info.get("auth_method") if info else None,
                len(self.active_connections),
            )

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send a message to a specific WebSocket client."""
        try:
            await websocket.send_json(jsonable_encoder(message))
        except Exception as e:
            logger.error("⚠️ Failed to send personal message: %s", e)

    async def broadcast(self, message: dict, role: str = None, user_id: str = None):
        """
        Broadcast a message to all connected clients.
        Optionally filter by role and/or user_id.
        """
        logger.debug(
            "📢 Broadcasting message (role=%s, user_id=%s) to %d clients: %s",
            role,
            user_id,
            len(self.active_connections),
            message,
        )
        for connection, info in list(self.active_connections.items()):
            try:
                if role and info.get("role") != role:
                    continue
                if user_id and info.get("user_id") != user_id:
                    continue
                await connection.send_json(jsonable_encoder(message))
            except Exception as e:
                logger.error("⚠️ Failed to send message to client: %s", e)
                self.disconnect(connection)


manager = ConnectionManager()

```

## backend\app\main.py

```python
import os
import logging
from dotenv import load_dotenv
load_dotenv()

from backend.app.config import settings

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import ENCODERS_BY_TYPE

from backend.app.core.firebase import ensure_firebase_initialized
from backend.app.routes import (
    resident_routes,
    dashboard,
    business_routes,
    payment_routes,
    paymongo_routes,
    document_routes,
    incident_routes,
    complaint_routes,
    account_routes,
    audit_routes,
    fee_routes,
    disbursement_routes,
    role_routes,
    password_routes,
    ws_routes,
    notification_routes,
)

logger = logging.getLogger("barangay")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    try:
        bucket_env = os.environ.get("FIREBASE_STORAGE_BUCKET") 
        logger.info("🔍 FIREBASE_STORAGE_BUCKET env var = %s", bucket_env)
        
        logger.info("🚀 Initializing Firebase...")
        ensure_firebase_initialized()
    except Exception as e:
        logger.error(f"❌ Firebase initialization failed: {e}")
        raise

    yield  # <-- app runs here

    # Shutdown logic
    logger.info("🛑 Shutting down Barangay API")

def create_app() -> FastAPI:
    app = FastAPI(
        title="Barangay Information System API",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,   # ✅ attach lifespan handler
        root_path="/", # optional 
        proxy_headers=True
    )

    # 🌐 CORS Configuration
    cors_env = os.environ.get("CORS_ORIGINS", "")
    allowed_origins = [origin.strip() for origin in cors_env.split(",") if origin] or [
        "http://localhost:3000",
        "https://barangay-1721d.web.app",
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 📦 Route Registration
    api_prefix = "/api"
    app.include_router(resident_routes.router, prefix=api_prefix, tags=["Residents"])
    app.include_router(document_routes.router, prefix=f"{api_prefix}/documents", tags=["Documents"])
    app.include_router(incident_routes.router, prefix=f"{api_prefix}/incidents", tags=["Incidents"])
    app.include_router(complaint_routes.router, prefix=f"{api_prefix}/complaints", tags=["Complaints"])
    app.include_router(account_routes.router, prefix=f"{api_prefix}", tags=["Accounts"])
    app.include_router(audit_routes.router, prefix=f"{api_prefix}/document_audit", tags=["Audit"])
    app.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
    app.include_router(business_routes.router, prefix=api_prefix, tags=["Business"])
    app.include_router(payment_routes.router, prefix=api_prefix, tags=["Payments"]) 
    app.include_router(paymongo_routes.router, prefix=f"{api_prefix}/paymongo", tags=["PayMongo"])
    app.include_router(fee_routes.router, prefix=f"{api_prefix}", tags=["Fees"])
    app.include_router(disbursement_routes.router, prefix=f"{api_prefix}", tags=["Disbursements"])
    app.include_router(role_routes.router, prefix=f"{api_prefix}", tags=["Roles"])
    app.include_router(password_routes.router, prefix=f"{api_prefix}", tags=["Password Reset"])
    app.include_router(ws_routes.router, tags=["websocket"])
    app.include_router(notification_routes.router, prefix=f"{api_prefix}", tags=["notifications"])

    # 🧪 Health Check
    @app.get(f"{api_prefix}/status", tags=["Health"])
    def status():
        return {"status": "ok", "message": "API is running"}

    # 🧾 Request Logger
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        if "paymongo" not in request.url.path:
            body = await request.body()
            if request.headers.get("content-type", "").startswith("application/json"):
                try:
                    body_text = body.decode("utf-8")
                except UnicodeDecodeError:
                    body_text = "<invalid utf-8>"
            else:
                body_text = f"<non-text body, length={len(body)}>"
            logger.info("📦 %s %s → %s", request.method, request.url.path, body_text or "<empty>")
        return await call_next(request)

    return app

# 🧩 Entrypoint for Uvicorn
app = create_app()

# 🔧 Override FastAPI's default bytes encoder
ENCODERS_BY_TYPE[bytes] = lambda o: "<binary data>"

```

## backend\app\models\__init__.py

```python
from .resident import ResidentCreate, ResidentUpdate, ResidentOut

```

## backend\app\models\account.py

```python
from pydantic import BaseModel, EmailStr, Field
from enum import Enum
from typing import Optional
from datetime import datetime

# 🎯 Role definitions
class RoleEnum(str, Enum):
    staff = "staff"
    secretary = "secretary"
    treasurer = "treasurer"
    sk = "sk"
    dilg = "dilg"
    admin = "admin"

# 🧾 Base account schema
class AccountBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    role: RoleEnum

# 🆕 Account creation schema
class AccountCreate(AccountBase):
    password: str = Field(..., min_length=8, max_length=128)

# 📤 Account response schema
class AccountResponse(AccountBase):
    uid: str
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None

# 🛠️ Firestore payload schema
class AccountFirestorePayload(AccountBase):
    created_by: str = Field(..., alias="createdBy")
    created_at: datetime = Field(..., alias="createdAt")
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")

    class Config:
        validate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

# 🔄 Account update schema
class AccountUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    role: Optional[RoleEnum] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)

```

## backend\app\models\business.py

```python
from pydantic import BaseModel, Field
from typing import Optional, Dict

class BusinessDetails(BaseModel):
    name: str
    type: str
    barangay: str
    address: str
    registration_date: str

class BusinessDocuments(BaseModel):
    valid_id: str
    proof_of_address: str
    dti_cert: Optional[str] = None
    business_logo: Optional[str] = None

class BusinessApplication(BaseModel):
    owner_uid: str
    owner_name: str
    contact_number: str
    email: str
    business: BusinessDetails
    documents: BusinessDocuments

```

## backend\app\models\complaint.py

```python
from pydantic import BaseModel, Field, StringConstraints
from typing import Optional, Annotated
from datetime import datetime
from enum import Enum

# 🎯 Controlled vocabularies
class ComplaintCategory(str, Enum):
    noise = "Noise"
    service = "Service"
    neighbor = "Neighbor"
    other = "Other"

class ComplaintStatus(str, Enum):
    open = "open"
    in_review = "in_review"   # ✅ underscore for consistency
    resolved = "resolved"

# 📥 Base complaint schema
class ComplaintBase(BaseModel):
    category: ComplaintCategory
    description: Annotated[str, StringConstraints(min_length=5, max_length=500)]
    location: str
    filed_by: Annotated[str, StringConstraints(min_length=28, max_length=28)] = Field(
        ..., description="UID of user who entered the complaint (resident self-filing or staff/admin proxy)"
    )
    filed_for: Optional[Annotated[str, StringConstraints(min_length=28, max_length=28)]] = Field(
        None, description="Resident UID the complaint is about (defaults to filed_by if resident self-filing)"
    )

# 🆕 Complaint creation schema
class ComplaintCreate(ComplaintBase):
    """
    Used when a complaint is filed.
    - filed_by: who entered the complaint (resident or staff/admin)
    - filed_for: resident the complaint is about (optional if resident self-filing)
    Timestamp is set by backend (Firestore SERVER_TIMESTAMP).
    """
    pass

# 📤 Complaint response schema
class Complaint(BaseModel):
    id: str
    category: ComplaintCategory
    description: str
    location: str
    filed_by: str
    filed_for: Optional[str] = None
    timestamp: datetime
    status: ComplaintStatus = ComplaintStatus.open
    resolution_notes: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        validate_by_name = True
        from_attributes = True  # ✅ allows dict/ORM integration

    @classmethod
    def from_firestore(cls, snapshot) -> "Complaint":
        """
        Helper to instantiate from Firestore DocumentSnapshot.
        Ensures Firestore timestamps are converted to Python datetime.
        """
        data = snapshot.to_dict() or {}
        if "timestamp" in data and hasattr(data["timestamp"], "to_datetime"):
            data["timestamp"] = data["timestamp"].to_datetime()
        if "updated_at" in data and hasattr(data["updated_at"], "to_datetime"):
            data["updated_at"] = data["updated_at"].to_datetime()
        return cls(id=snapshot.id, **data)

    def to_dict(self) -> dict:
        """
        Convert to dict for Firestore writes, excluding None values.
        """
        return self.dict(exclude_none=True)

# 📤 Complaint with resident + filer details
class ComplaintWithResident(Complaint):
    filed_for_name: str = Field(..., description="Resident full name for display")
    filed_by_name: Optional[str] = Field(None, description="Name of user who filed (staff/admin or resident)")

```

## backend\app\models\document.py

```python
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class DocumentStatus(str, Enum):
    pending = "pending"
    for_payment = "for_payment"
    payment_submitted = "payment_submitted"
    paid = "paid"
    approved = "approved"
    rejected = "rejected"

class Attachment(BaseModel):
    url: str = Field(..., description="Public or signed URL to the uploaded file")
    path: str = Field(..., description="Storage path inside Firebase bucket")

class Document(BaseModel):
    # 🔑 Firestore document ID
    id: str = Field(..., description="Firestore auto-generated document ID")

    # 🆔 Human-readable sequential ID
    documentId: str = Field(..., description="Type-based sequential identifier, e.g. Barangay_Clearance-0001")

    # 👤 Resident info
    residentId: str = Field(..., description="Resident ID who requested the document")
    residentName: Optional[str] = Field(None, description="Full name of the resident")
    authUid: Optional[str] = Field(None, description="Auth UID if available")

    # 📄 Document details
    documentType: str = Field(..., description="Type of document requested")
    purpose: Optional[str] = Field(None, description="Purpose of the document")
    remarks: Optional[str] = Field(None, description="Remarks from secretary/admin")

    # 🔄 Status lifecycle
    status: DocumentStatus = Field(..., description="Current status of the document")
    resubmitted: Optional[bool] = Field(False, description="Whether a rejected document was resubmitted")

    # 🕒 Timestamps
    createdAt: datetime = Field(..., description="When the document was created")
    updatedAt: datetime = Field(..., description="When the document was last updated")
    issuedAt: Optional[datetime] = Field(None, description="When the document was issued")

    # 📎 Attachments (now objects with url + path)
    attachments: Optional[Dict[str, Attachment]] = Field(
        None,
        description="Uploaded file metadata including URL and storage path"
    )

    # 💳 Payment info
    amount: Optional[int] = Field(None, description="Payment amount if required")
    paymentStatus: Optional[str] = Field(None, description="Payment status string")
    referenceNumber: Optional[str] = Field(None, description="Payment reference number")
    paymentIntentId: Optional[str] = Field(None, description="PayMongo Payment Intent ID")
    transactionId: Optional[str] = Field(None, description="PayMongo Transaction ID")

    # 📜 Issuance info
    issuedBy: Optional[str] = Field(None, description="Secretary/Admin who issued the document")
    fileUrl: Optional[str] = Field(None, description="URL to the issued document file")

    # 🧩 Flexible extra fields for type-specific data
    extraFields: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional fields depending on document type"
    )
    
    # Common extras
    occupation: Optional[str] = Field(None, description="Resident occupation")
    voterStatus: Optional[str] = Field(None, description="Resident voter status")

```

## backend\app\models\fee.py

```python
from pydantic import BaseModel, Field
from typing import Optional

# -----------------------------
# 🔑 Base Models
# -----------------------------
class BaseFee(BaseModel):
    """Common fields shared by all fee types."""
    fee: int = Field(..., ge=0, description="Base/base fee amount")
    enabled: bool = Field(default=True, description="Enable/disable this fee")
    miscType: Optional[str] = Field(
        default=None,
        description="Reference to a miscellaneous fee type (from misc_fees)"
    )

# -----------------------------
# 📄 Document Fee Models
# -----------------------------
class DocumentFee(BaseFee):
    """Update model for existing document fees."""
    documentType: Optional[str] = Field(None, min_length=1, description="Type of document")

class NewDocumentFee(BaseFee):
    """Creation model for new document fees."""
    documentType: str = Field(..., min_length=1, description="Type of document")

# -----------------------------
# 🏢 Business Fee Models
# -----------------------------
class BusinessFee(BaseFee):
    """Update model for existing business fees."""
    registrationFee: Optional[int] = Field(default=None, ge=0, description="Registration fee")
    annualFee: Optional[int] = Field(default=None, ge=0, description="Annual fee")
    businessType: Optional[str] = Field(None, min_length=1, description="Type of business")

class NewBusinessFee(BusinessFee):
    """Creation model for new business fees."""
    businessType: str = Field(..., min_length=1, description="Type of business")

# -----------------------------
# 🆕 Miscellaneous Fee Models
# -----------------------------
class MiscFee(BaseModel):
    """Update model for miscellaneous fees."""
    fee: int = Field(..., ge=0, description="Miscellaneous fee amount")
    enabled: bool = Field(default=True, description="Enable/disable this fee")

class NewMiscFee(MiscFee):
    """Creation model for new miscellaneous fees."""
    miscType: str = Field(..., min_length=1, description="Type of miscellaneous fee")

```

## backend\app\models\incident.py

```python
from pydantic import BaseModel, Field, StringConstraints
from typing import Optional, Annotated
from datetime import datetime
from enum import Enum

# 🎯 Controlled vocabularies
class IncidentType(str, Enum):
    theft = "Theft"
    dispute = "Dispute"
    accident = "Accident"
    other = "Other"

class IncidentStatus(str, Enum):
    pending = "pending"
    resolved = "resolved"
    escalated = "escalated"

# 📥 Base incident schema
class IncidentBase(BaseModel):
    type: IncidentType
    description: Annotated[str, StringConstraints(min_length=5, max_length=500)]
    location: str
    authUid: Optional[str] = Field(
        None, description="UID of the user (resident or staff) who logged the incident"
    )
    residentId: Optional[str] = Field(
        None, description="Resident UID who is the subject of the incident"
    )

# 🆕 Incident creation schema
class IncidentCreate(IncidentBase):
    authUid: str = Field(..., description="UID of the user creating the incident")
    residentId: str = Field(..., description="Resident UID involved in the incident")
    timestamp: Optional[datetime] = None

# 📤 Incident response schema
class Incident(BaseModel):
    id: str
    type: IncidentType
    description: str
    location: str
    authUid: Optional[str] = None
    residentId: Optional[str] = None
    timestamp: datetime
    updated_at: Optional[datetime] = None
    status: IncidentStatus = IncidentStatus.pending

    class Config:
        validate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }

# 📤 Incident with enriched display details
class IncidentWithResident(Incident):
    reported_by_name: Optional[str] = Field(None, description="Resident full name")
    logged_by_officer: Optional[str] = Field(None, description="Officer full name")
    assigned_to_name: Optional[str] = Field(None, description="Assigned staff name")

```

## backend\app\models\notification.py

```python
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, timezone
import uuid

class Notification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))  # unique per instance
    
    # Who should see this notification
    role: Literal["admin", "staff", "secretary", "treasurer", "resident"]
    
    # What type of event triggered it
    type: Literal[
        "login", "logout",
        "incident", "incident_update",
        "complaint", "complaint_update",
        "business", "business_update",
        "document", "document_update",
        "payment", "payment_update"
    ]
    
    # Scope clarifies login/logout context
    scope: Optional[Literal["resident", "officer"]] = None
    
    # Aggregated count (e.g., 3 residents logged in)
    count: Optional[int] = None
    
    # Officer/staff name if applicable
    user: Optional[str] = None
    
    # Resident UID for personal notifications
    user_id: Optional[str] = None
    
    # Human-readable message
    message: str
    
    # Timestamp defaults to UTC now
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Whether the notification has been read
    read: bool = False


```

## backend\app\models\password.py

```python
from pydantic import BaseModel, Field, field_validator, StringConstraints, ValidationInfo
from typing import Annotated, Optional

# 🔑 Strong password type
PasswordStr = Annotated[str, StringConstraints(min_length=8, max_length=128)]

# 📩 Request model
class ResetRequest(BaseModel):
    email: str

class ResetApply(BaseModel):
    token: str
    new_password: PasswordStr
    confirm_password: str

    @field_validator("new_password")
    def validate_password(cls, value: str):
        if not any(c.islower() for c in value):
            raise ValueError("Password must contain a lowercase letter")
        if not any(c.isupper() for c in value):
            raise ValueError("Password must contain an uppercase letter")
        if not any(c.isdigit() for c in value):
            raise ValueError("Password must contain a digit")
        if not any(c in "!@#$%^&*()-_=+[]{};:,.<>?/\\|" for c in value):
            raise ValueError("Password must contain a special character")
        return value

    @field_validator("confirm_password")
    def passwords_match(cls, v: str, info: ValidationInfo):
        new_password = info.data.get("new_password")
        if new_password and v != new_password:
            raise ValueError("Passwords do not match")
        return v


# 🏠 Address model
class Address(BaseModel):
    barangay: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = Field(default=None, alias="houseNumber")
    purok: Optional[str] = None
    zip_code: Optional[str] = Field(default=None, alias="zipCode")

# 👤 Unified user model
class UserOut(BaseModel):
    uid: str
    email: str
    full_name: str = Field(alias="fullName")   # ✅ maps both fullName (resident) and full_name (account)
    role: Optional[str] = None
    barangay: Optional[str] = None
    address: Optional[Address] = None

```

## backend\app\models\payment.py

```python
from pydantic import BaseModel

class PaymentInit(BaseModel):
    business_id: str
    amount: int

```

## backend\app\models\paymongo.py

```python
from pydantic import BaseModel, Field
from typing import Optional, Dict

# ----------------------------- 
# Request Models 
# ----------------------------- 

class DocumentPaymentRequest(BaseModel): 
    documentId: str 
    documentType: str                       # e.g. "Barangay Clearance" 
    remarks: str = "" 
    
class BusinessPaymentRequest(BaseModel): 
    businessId: str 
    businessType: str                       # e.g. "Retail Store" 
    feeType: str                            # "registrationFee" or "annualFee" 
    remarks: str = "" 
    
class BillingInfo(BaseModel):
    name: str = Field(..., description="Resident's full name")
    email: str = Field(..., description="Resident's email address")

class AttachPaymentRequest(BaseModel):
    paymentIntentId: str = Field(..., description="Payment Intent ID from PayMongo")
    paymongoClientKey: str = Field(..., description="Client key from PayMongo intent creation")
    method: str = Field(..., description="Payment method type (e.g., 'gcash', 'grab_pay')")
    billing: BillingInfo = Field(..., description="Billing information for the resident")
    type: str = Field(..., description="business or document")
    return_url: Optional[str] = Field(
        None,
        description="URL to redirect after payment success/failure"
    )

```

## backend\app\models\resident.py

```python
from pydantic import BaseModel, Field, EmailStr, HttpUrl, StringConstraints, ConfigDict
from typing import Optional, Annotated
from datetime import date, datetime
from enum import Enum

# 🎯 Controlled vocabularies
class Gender(str, Enum):
    Male = "Male"
    Female = "Female"
    Other = "Other"

class CivilStatus(str, Enum):
    Single = "Single"
    Married = "Married"
    Widowed = "Widowed"
    Separated = "Separated"

class VoterStatus(str, Enum):
    Yes = "yes"
    No = "no"
    Unknown = "unknown"

# 🖐 Fingerprints model
class Fingerprints(BaseModel):
    left: Optional[str] = Field(None, alias="left")
    right: Optional[str] = Field(None, alias="right")

# 🏠 Address model
class Address(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    house_number: str = Field(..., alias="houseNumber", example="123")
    street: str = Field(..., example="Main St")
    purok: str = Field(..., example="3")
    barangay: str = Field(..., example="Moonwalk")
    city: str = Field(..., example="Parañaque")
    province: str = Field(..., example="Metro Manila")
    zip_code: Optional[str] = Field(None, alias="zipCode", example="1700")

# 📥 Resident creation model
class ResidentCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    full_name: str = Field(..., min_length=2, max_length=100, alias="fullName")
    middle_name: Optional[str] = Field(None, alias="middleName")
    suffix: Optional[str] = Field(None, alias="suffix")
    birth_date: date = Field(..., alias="birthDate")
    gender: Gender
    civil_status: CivilStatus = Field(..., alias="civilStatus")
    contact_number: Annotated[str, StringConstraints(pattern=r"^09\d{9}$")] = Field(..., alias="contactNumber", example="09171234567")
    email: Optional[EmailStr]
    address: Address
    household_id: Optional[str] = Field(None, alias="householdId")
    is_head_of_family: bool = Field(..., alias="isHeadOfFamily")
    voter_status: VoterStatus = Field(..., alias="voterStatus")
    occupation: Optional[str]
    photo_url: Optional[str] = Field(None, alias="photoUrl")
    fingerprints: Optional[Fingerprints] = Field(None, alias="fingerprints")  # ✅ nested object
    signature_url: Optional[str] = Field(None, alias="signatureUrl")
    remarks: Optional[str] = None

# 📤 Resident output model
class ResidentOut(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={
            datetime: lambda v: v.isoformat() if v else None,
            date: lambda v: v.isoformat() if v else None,
        },
    )

    id: str
    full_name: str = Field(..., alias="fullName")
    birth_date: Optional[date] = Field(None, alias="birthDate")
    gender: Optional[Gender]
    civil_status: Optional[CivilStatus] = Field(None, alias="civilStatus")
    contact_number: Optional[str] = Field(None, alias="contactNumber")
    email: Optional[EmailStr]
    address: Optional[Address]
    household_id: Optional[str] = Field(None, alias="householdId")
    is_head_of_family: Optional[bool] = Field(False, alias="isHeadOfFamily")
    voter_status: Optional[VoterStatus] = Field(None, alias="voterStatus")
    occupation: Optional[str]
    photo_url: Optional[str] = Field(None, alias="photoUrl")
    fingerprints: Optional[Fingerprints] = Field(None, alias="fingerprints")
    signature_url: Optional[str] = Field(None, alias="signatureUrl")
    remarks: Optional[str]
    created_at: Optional[datetime] = Field(None, alias="createdAt")
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")

# 🔄 Partial update model
class ResidentUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    full_name: Optional[str] = Field(None, alias="fullName")
    middle_name: Optional[str] = Field(None, alias="middleName")
    suffix: Optional[str] = Field(None, alias="suffix")
    birth_date: Optional[date] = Field(None, alias="birthDate")
    gender: Optional[Gender]
    civil_status: Optional[CivilStatus] = Field(None, alias="civilStatus")
    contact_number: Optional[Annotated[str, StringConstraints(pattern=r"^09\d{9}$")]] = Field(None, alias="contactNumber", example="09171234567")
    email: Optional[EmailStr]
    address: Optional[Address]
    household_id: Optional[str] = Field(None, alias="householdId")
    is_head_of_family: Optional[bool] = Field(None, alias="isHeadOfFamily")
    voter_status: Optional[VoterStatus] = Field(None, alias="voterStatus")
    occupation: Optional[str]
    photo_url: Optional[str] = Field(None, alias="photoUrl")
    fingerprints: Optional[Fingerprints] = Field(None, alias="fingerprints")  # ✅ nested object
    signature_url: Optional[str] = Field(None, alias="signatureUrl")
    remarks: Optional[str]
    updated_at: datetime = Field(default_factory=datetime.utcnow, alias="updatedAt")

```

## backend\app\models\role.py

```python
from pydantic import BaseModel, field_validator

ALLOWED_ROLES = {"admin", "staff", "secretary", "treasurer", "sk", "dilg", "resident"}

class RoleUpdate(BaseModel):
    role: str

    @field_validator("role")
    def validate_role(cls, v: str) -> str:
        if v not in ALLOWED_ROLES:
            raise ValueError(f"Invalid role: {v}")
        return v


class RoleResponse(BaseModel):
    uid: str
    role: str

```

## backend\app\models\settings.py

```python
from pydantic import BaseModel, Field, condecimal
from typing import Dict
from typing import Annotated

# Define a reusable constrained type
FeeAmount = Annotated[condecimal(gt=0, lt=10000), Field(...)]


class RolePermission(BaseModel):
    role: str = Field(
        ..., 
        example="staff", 
        description="Role name to assign permissions to (e.g., admin, staff, resident)"
    )
    permissions: Dict[str, bool] = Field(
        ..., 
        example={
            "viewDashboard": True,
            "fileComplaints": True,
            "manageResidents": False
        },
        description="Full permission map for the role. Keys must match known permission identifiers."
    )

class DocumentFee(BaseModel):
    document_type: str = Field(
        ..., 
        example="barangay_clearance", 
        description="Type of document (e.g., barangay_clearance, certificate_of_indigency)"
    )
    fee: FeeAmount = Field(
        ..., 
        example="50.0",  # Pydantic prefers Decimal-compatible strings here
        description="Fee amount in PHP (must be greater than 0 and less than 10,000)"
    )

```

## backend\app\routes\__init__.py

```python
```

## backend\app\routes\account_routes.py

```python
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.app.models.account import AccountCreate, AccountResponse, RoleEnum
from backend.app.services.account_service import (
    create_barangay_account,
    delete_barangay_account,
    update_user_role,
    list_barangay_accounts,
)
from backend.app.core.auth import get_admin_uid, get_current_user, require_permission

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Accounts"])


# ===============================
# 📦 Response Models
# ===============================
class ActionResponse(BaseModel):
    detail: str


class RoleUpdatePayload(BaseModel):
    role: RoleEnum


# ===============================
# 🔧 Helper: wrap service calls
# ===============================
async def safe_service_call(service_func, *args, **kwargs):
    try:
        return await service_func(*args, **kwargs)
    except ValueError as ve:
        logger.warning("⚠️ Conflict: %s", str(ve))
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(ve))
    except PermissionError as pe:
        logger.warning("🚫 Permission denied: %s", str(pe))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except HTTPException as he:
        logger.error("❌ HTTP error: %s", he.detail)
        raise he
    except Exception as e:
        logger.exception("❌ Unexpected error")
        msg = str(e)
        if isinstance(msg, (dict, list)):
            msg = "; ".join(map(str, msg))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Operation failed: {msg}",
        )



# ===============================
# 🚀 Routes
# ===============================
@router.post(
    "/admin/create-account",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new barangay account",
    description="Accessible only to admins. Creates a new account with role-based access."
)
async def create_account_handler(
    payload: AccountCreate,
    admin_uid: str = Depends(get_admin_uid),
    _: None = Depends(require_permission("createAccount")),
) -> AccountResponse:
    logger.info("📥 Account creation requested by admin: %s", admin_uid)
    account = await safe_service_call(create_barangay_account, payload, created_by=admin_uid)
    logger.info("✅ Account created successfully: %s", account.uid)
    return account


@router.delete(
    "/admin/delete-account/{uid}",
    response_model=ActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete a barangay account",
    description="Accessible only to admins. Deletes both Firestore and Firebase Auth user."
)
async def delete_account_handler(
    uid: str,
    admin_uid: str = Depends(get_admin_uid),
    _: None = Depends(require_permission("deleteAccount")),
) -> ActionResponse:
    logger.info("🗑️ Account deletion requested by admin: %s for user: %s", admin_uid, uid)
    await safe_service_call(delete_barangay_account, uid, deleted_by=admin_uid)
    logger.info("✅ Account deleted successfully: %s", uid)
    return ActionResponse(detail=f"Account {uid} deleted successfully")


@router.put(
    "/admin/update-role/{uid}",
    response_model=AccountResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a user's role",
    description="Accessible only to admins. Updates role in Firestore, Firebase Auth claims, and logs the change."
)
async def update_role_handler(
    uid: str,
    payload: RoleUpdatePayload,
    admin_uid: str = Depends(get_admin_uid),
    _: None = Depends(require_permission("updateRole")),
) -> AccountResponse:
    logger.info("🔄 Role update requested by admin: %s for user: %s", admin_uid, uid)
    account = await safe_service_call(update_user_role, uid, payload.role, changed_by=admin_uid)
    logger.info("✅ Role updated to %s for UID: %s", payload.role, uid)
    return account

@router.get(
    "/admin/accounts",
    response_model=list[AccountResponse],
    status_code=status.HTTP_200_OK,
    summary="List all barangay accounts",
    description="Accessible to admins and treasurers."
)
async def list_accounts_handler(
    user_uid: str = Depends(get_current_user),
    _: None = Depends(require_permission("manageUsers")),
    role: RoleEnum | None = None,
    limit: int = 20,
    offset: int = 0,
):
    logger.info("📋 Account list requested by user: %s", user_uid)
    # You’d implement a service function to query Firestore
    accounts = await safe_service_call(list_barangay_accounts, role=role, limit=limit, offset=offset) 
    return accounts

```

## backend\app\routes\audit_routes.py

```python
# app/routes/audit_routes.py
from fastapi import APIRouter, HTTPException
from backend.app.utils.firestore_utils import get_db
import logging

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

@router.get("/", tags=["Audit"])
def list_audit_logs(limit: int = 50):
    """
    Return the latest document audit logs.
    """
    try:
        logs = (
            get_db().collection("document_audit")
            .order_by("timestamp", direction="DESCENDING")
            .limit(limit)
            .stream()
        )
        return [log.to_dict() for log in logs]
    except Exception as e:
        logger.error("❌ Error fetching audit logs: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")

```

## backend\app\routes\business_routes.py

```python
from fastapi import APIRouter
from backend.app.core.firebase import delete_file
from backend.app.models.business import BusinessApplication
from backend.app.services.business_service import create_business_application
import logging
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/businesses", tags=["Business"])

@router.post("/applications")
def create_application(payload: BusinessApplication):
    return create_business_application(payload)

@router.get("")
def list_businesses(ownerUid: str = None, ownerName: str = None):
    ref = get_db().collection("businesses")
    if ownerUid:
        docs = ref.where("ownerUid", "==", ownerUid).stream()
    elif ownerName:
        docs = ref.where("ownerName", "==", ownerName).stream()
    else:
        docs = ref.stream()
    return [doc.to_dict() for doc in docs]

@router.delete("/{business_id}")
def delete_business(business_id: str):
    """Delete a business, related payments/receipts, and attachments in Storage."""
    business_docs = get_db().collection("businesses").where("businessId", "==", business_id).get()
    if not business_docs:
        return {"success": False, "message": "Business not found"}

    business_doc = business_docs[0]
    business_data = business_doc.to_dict()

    # --- Delete attachments from Storage using stored paths ---
    if business_data.get("documents"):
        for key, doc in business_data["documents"].items():
            # Expecting each doc to be a dict with {"url": ..., "path": ...}
            path = None
            if isinstance(doc, dict):
                path = doc.get("path")
            elif isinstance(doc, str):
                # Fallback for legacy records that only stored URL
                logger.warning("⚠️ Document %s has only URL, no path. Skipping storage deletion.", key)

            if path:
                try:
                    delete_file(path)
                except Exception as e:
                    logger.warning("⚠️ Failed to delete storage file %s: %s", path, e)

    # --- Delete business doc ---
    business_doc.reference.delete()
    logger.info("🗑️ Deleted business %s", business_id)

    # --- Delete related payments ---
    payments = get_db().collection("payments").where("businessId", "==", business_id).get()
    for pay in payments:
        pay.reference.delete()
        logger.info("🗑️ Deleted payment %s for business %s", pay.id, business_id)

    # --- Delete related receipts ---
    receipts = get_db().collection("receipts").where("businessId", "==", business_id).get()
    for rec in receipts:
        rec.reference.delete()
        logger.info("🗑️ Deleted receipt %s for business %s", rec.id, business_id)

    return {"success": True, "message": f"Business {business_id}, related records, and attachments deleted"}

```

## backend\app\routes\complaint_routes.py

```python
import logging
from typing import Optional, List

from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel

from backend.app.models.complaint import (
    ComplaintCreate,
    Complaint,
    ComplaintWithResident,
    ComplaintStatus,
)
from backend.app.services.complaint_service import (
    file_complaint,
    get_complaint_by_id,
    list_complaints_with_residents,
    list_complaints_by_resident_id,
    update_complaint_status,
    delete_complaint,
)
from backend.app.core.auth import require_permission
from backend.app.services.notification_service import NotificationService

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Complaints"])


# ---------------------------------------------------------
# ✅ Shared Models
# ---------------------------------------------------------

class ActionResponse(BaseModel):
    message: str


class StatusUpdateRequest(BaseModel):
    status: ComplaintStatus
    notes: Optional[str] = None
    resolution_notes: Optional[str] = None


# ---------------------------------------------------------
# ✅ 1. Resident submits a complaint
# ---------------------------------------------------------

@router.post(
    "/",
    response_model=Complaint,
    status_code=status.HTTP_201_CREATED,
    summary="File a new complaint (resident or staff on behalf of resident)",
)
async def submit_complaint(
    complaint: ComplaintCreate,
    current_user=Depends(require_permission(["fileComplaints", "fileComplaintsForResidents"])),
):
    """
    Submit a complaint.
    - Residents: filed_by == filed_for (self-filing)
    - Staff/Admin: filed_by = staff/admin UID, filed_for = resident UID
    """
    try:
        # Ensure filed_for is set: if not provided, default to self-filing
        if not complaint.filed_for:
            complaint.filed_for = complaint.filed_by

        created = file_complaint(complaint)
        if not created:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to file complaint",
            )

        logger.info(
            "📝 Complaint submitted: %s (filed_by=%s, filed_for=%s)",
            created.id,
            complaint.filed_by,
            complaint.filed_for,
        )

        try:
            await NotificationService.notify(
                role="admin",
                type="complaint",
                message=f"New complaint filed ({created.category.value})",
            )
            await NotificationService.notify(
                role="staff",
                type="complaint",
                message=f"New complaint filed ({created.category.value})",
            )
        except Exception as notify_err:
            logger.warning("⚠️ Complaint submit notification failed: %s", notify_err)

        return created

    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Failed to file complaint: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error while filing complaint",
        )


# ---------------------------------------------------------
# ✅ 2. Resident lists their own complaints
# ---------------------------------------------------------

@router.get(
    "/mine",
    response_model=List[Complaint],
    summary="Resident lists their own complaints",
)
def get_my_complaints(
    resident_uid: str = Depends(require_permission("viewOwnComplaints")),
    limit: Optional[int] = Query(None, ge=0, le=100),
):
    return list_complaints_by_resident_id(resident_uid, limit)

# ---------------------------------------------------------
# ✅ 3. Admin/staff lists ALL complaints
#    (STATIC ROUTE — must come BEFORE /{complaint_id})
# ---------------------------------------------------------

@router.get(
    "/all",
    response_model=List[ComplaintWithResident],
    summary="Admin/staff lists all complaints with resident + filer info",
)
def get_all_complaints(
    _: None = Depends(require_permission("viewAllComplaints")),
    limit: Optional[int] = Query(None, ge=0, le=100),
    status: Optional[ComplaintStatus] = Query(None),
):
    return list_complaints_with_residents(limit, status)

# ---------------------------------------------------------
# ✅ 4. Get a specific complaint by ID
# ---------------------------------------------------------

@router.get(
    "/{complaint_id}",
    summary="Get a specific complaint by ID",
)
def get_complaint(
    complaint_id: str,
    current_user=Depends(require_permission(["viewOwnComplaints", "viewAllComplaints"])),
):
    complaint = get_complaint_by_id(complaint_id)
    if complaint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found",
        )

    # Residents → plain Complaint
    if getattr(current_user, "role", None) == "resident":
        return Complaint(**complaint.dict())

    # Staff/Admin → enriched ComplaintWithResident
    return complaint

# ---------------------------------------------------------
# ✅ 5. Update complaint status (admin/staff)
# ---------------------------------------------------------

@router.patch(
    "/{complaint_id}/status",
    response_model=ComplaintWithResident,
    summary="Admin updates complaint status",
)
async def update_status(
    complaint_id: str,
    payload: StatusUpdateRequest,
    _: None = Depends(require_permission("manageComplaints")),
):
    effective_notes = payload.notes
    if effective_notes is None:
        effective_notes = payload.resolution_notes

    updated = update_complaint_status(complaint_id, payload.status, effective_notes)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found",
        )

    try:
        status_label = payload.status.value.replace("_", " ")
        await NotificationService.notify(
            role="admin",
            type="complaint_update",
            message=f"Complaint status updated to {status_label}",
        )
        await NotificationService.notify(
            role="staff",
            type="complaint_update",
            message=f"Complaint status updated to {status_label}",
        )

        resident_uid = getattr(updated, "filed_for", None) or getattr(updated, "filed_by", None)
        if resident_uid:
            await NotificationService.notify(
                role="resident",
                type="complaint_update",
                message=f"Your complaint status was updated to {status_label}",
                user_id=resident_uid,
            )
    except Exception as notify_err:
        logger.warning("⚠️ Complaint status notification failed: %s", notify_err)

    return updated

# ---------------------------------------------------------
# ✅ 6. Delete a complaint (admin only)
# ---------------------------------------------------------

@router.delete(
    "/{complaint_id}",
    response_model=ActionResponse,
    summary="Admin deletes a complaint",
    status_code=status.HTTP_200_OK,
)
def delete_complaint_route(
    complaint_id: str,
    _: None = Depends(require_permission("manageComplaints")),
):
    deleted = delete_complaint(complaint_id)
    if deleted is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found",
        )
    return ActionResponse(message=f"Complaint {complaint_id} deleted successfully")

```

## backend\app\routes\dashboard.py

```python
import logging
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from backend.app.utils.firestore_utils import get_db  


logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Dashboard"])

# 📦 Response model
class DashboardSummary(BaseModel):
    residents: int
    businesses: int
    complaints: int
    officials: int
    incidents: int

@router.get("/dashboard-summary", response_model=DashboardSummary)
async def get_dashboard_summary():

    try:
        collections = ["residents", "businesses", "complaints", "officials", "incidents"]
        counts = {}

        for col in collections:
            docs = get_db().collection(col).get()
            counts[col] = len(docs)

        logger.info("📊 Dashboard summary fetched successfully")
        return DashboardSummary(**counts)

    except Exception as e:
        logger.error("❌ Failed to fetch dashboard summary: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch dashboard summary"
        )

```

## backend\app\routes\disbursement_routes.py

```python
from fastapi import APIRouter, HTTPException
from backend.app.services import disbursement_service

router = APIRouter(tags=["Disbursements"])

@router.post("/disbursements")
async def create_disbursement(payload: dict):
    return disbursement_service.create_disbursement(payload)

@router.get("/disbursements")
async def list_disbursements():
    return disbursement_service.list_disbursements()

@router.get("/disbursements/{id}")
async def get_disbursement(id: str):
    result = disbursement_service.get_disbursement(id)
    if not result:
        raise HTTPException(status_code=404, detail="Disbursement not found")
    return result

@router.patch("/disbursements/{id}/status")
async def update_status(id: str, payload: dict):
    result = disbursement_service.update_status(id, payload.get("status"))
    if not result:
        raise HTTPException(status_code=404, detail="Disbursement not found")
    return result

@router.put("/disbursements/{id}")
async def update_disbursement(id: str, payload: dict):
    result = disbursement_service.update_disbursement(id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Disbursement not found")
    return result

@router.delete("/disbursements/{id}")
async def delete_disbursement(id: str):
    success = disbursement_service.delete_disbursement(id)
    if not success:
        raise HTTPException(status_code=404, detail="Disbursement not found")
    return {"id": id, "deleted": True}

```

## backend\app\routes\document_routes.py

```python
from fastapi import APIRouter, Query, UploadFile, File, Form, Depends
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from backend.app.models.document import Document, DocumentStatus
from backend.app.core.auth import require_permission
from backend.app.services import document_service
from backend.app.services.notification_service import NotificationService
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Documents"])


async def _notify_document_submitted(doc: Document):
    try:
        suffix = f" ({doc.documentType})" if doc.documentType else ""
        await NotificationService.notify(
            role="admin",
            type="document",
            message=f"New document request submitted{suffix}",
        )
        await NotificationService.notify(
            role="secretary",
            type="document",
            message=f"New document request submitted{suffix}",
        )
    except Exception as notify_err:
        logger.warning("⚠️ Document submit notification failed: %s", notify_err)


async def _notify_document_status_change(doc: Document):
    try:
        status_value = doc.status.value if hasattr(doc.status, "value") else str(doc.status)
        status_label = str(status_value).replace("_", " ")
        suffix = f" ({doc.documentType})" if doc.documentType else ""

        await NotificationService.notify(
            role="admin",
            type="document_update",
            message=f"Document status updated to {status_label}{suffix}",
        )
        await NotificationService.notify(
            role="secretary",
            type="document_update",
            message=f"Document status updated to {status_label}{suffix}",
        )

        if doc.residentId:
            await NotificationService.notify(
                role="resident",
                type="document_update",
                message=f"Your document status was updated to {status_label}{suffix}",
                user_id=doc.residentId,
            )
    except Exception as notify_err:
        logger.warning("⚠️ Document status notification failed: %s", notify_err)

# ===============================
# 📤 List Documents
# ===============================
@router.get("", response_model=List[Document])
async def list_documents(
    residentId: Optional[str] = Query(None),
    documentType: Optional[str] = Query(None),
    issuedBy: Optional[str] = Query(None),
    fromDate: Optional[datetime] = Query(None),
    toDate: Optional[datetime] = Query(None),
    uid: str = Depends(require_permission("viewDocuments"))
) -> List[Document]:
    return document_service.list_documents(
        uid=uid,
        residentId=residentId,
        documentType=documentType,
        issuedBy=issuedBy,
        fromDate=fromDate,
        toDate=toDate,
    )

@router.get("/my", response_model=List[Document])
async def list_my_documents(resident_id: str) -> List[Document]:
    return document_service.list_my_documents(resident_id)

@router.get("/my/active", response_model=List[Document])
async def list_active_documents(resident_id: str) -> List[Document]:
    return document_service.list_active_documents(resident_id)

@router.get("/my/history", response_model=List[Document])
async def list_history_documents(resident_id: str) -> List[Document]:
    return document_service.list_history_documents(resident_id)

@router.get("/{doc_id}", response_model=Document)
async def get_document(doc_id: str) -> Document:
    return document_service.get_document(doc_id)

# ===============================
# 🔄 Mark Document as Resubmitted
# ===============================
class ResubmissionPayload(BaseModel):
    resubmitted: bool = True

@router.patch("/{doc_id}/resubmission", response_model=Document)
async def mark_document_resubmitted(doc_id: str, payload: ResubmissionPayload) -> Document:
    return await document_service.mark_resubmitted(doc_id)

# ===============================
# 📝 Create Document (Resident)
# ===============================
@router.post("", response_model=Document, status_code=201)
async def create_document(
    resident_id: str = Form(...),
    document_type: str = Form(...),
    purpose: Optional[str] = Form(None),
    remarks: Optional[str] = Form(None),

    # Attachments
    idAttachment: UploadFile = File(None),
    residencyAttachment: UploadFile = File(None),
    medicalAttachment: UploadFile = File(None),   
    photoAttachment: UploadFile = File(None),  
    activityPlan: UploadFile = File(None),
    businessPermit: UploadFile = File(None),


    # Extra fields
    complainant: Optional[str] = Form(None),
    respondent: Optional[str] = Form(None),
    incident: Optional[str] = Form(None),
    businessName: Optional[str] = Form(None),
    activityName: Optional[str] = Form(None),
    activityDate: Optional[str] = Form(None),
    occupation: Optional[str] = Form(None),
    voterStatus: Optional[str] = Form(None),
    yearsOfStay: Optional[int] = Form(None),

    # ✅ Location fields
    locationBarangay: Optional[str] = Form(None),
    locationStreet: Optional[str] = Form(None),
    locationCity: Optional[str] = Form(None),
    locationProvince: Optional[str] = Form(None),
) -> Document:
    created = await document_service.create_document(
        resident_id=resident_id,
        resident_name=None,  # Will be populated in service layer based on residentId
        document_type=document_type,
        purpose=purpose,
        remarks=remarks,
        idAttachment=idAttachment,
        residencyAttachment=residencyAttachment,
        medicalAttachment=medicalAttachment, 
        photoAttachment=photoAttachment,
        activityPlan=activityPlan,
        businessPermit=businessPermit,
        complainant=complainant,
        respondent=respondent,
        incident=incident,
        businessName=businessName,
        activityName=activityName,
        activityDate=activityDate,
        occupation=occupation,
        voterStatus=voterStatus,
        yearsOfStay=yearsOfStay,
        locationBarangay=locationBarangay,
        locationStreet=locationStreet,
        locationCity=locationCity,
        locationProvince=locationProvince,
    )
    await _notify_document_submitted(created)
    return created

# ===============================
# 🔄 Update Status
# ===============================
class StatusUpdatePayload(BaseModel): 
    newStatus: DocumentStatus 
    remarks: Optional[str] = None

@router.patch("/{doc_id}/status", response_model=Document)
async def update_document_status(doc_id: str, payload: StatusUpdatePayload) -> Document:
    updated = await document_service.update_status(doc_id, payload.newStatus, payload.remarks)
    await _notify_document_status_change(updated)
    return updated

# ===============================
# 💳 Confirm Payment
# ===============================
@router.patch("/{doc_id}/payment", response_model=Document)
async def confirm_payment(doc_id: str) -> Document:
    updated = await document_service.confirm_payment(doc_id)
    await _notify_document_status_change(updated)
    return updated

# ===============================
# 📜 Issue Document
# ===============================
class IssuePayload(BaseModel): 
    issued_by: str 
    file_url: Optional[str] = None
    remarks: Optional[str] = None

@router.patch("/{doc_id}/issue", response_model=Document)
async def issue_document(doc_id: str, payload: IssuePayload) -> Document:
    updated = await document_service.issue_document(
        doc_id, 
        payload.issued_by, 
        payload.file_url, 
        payload.remarks
    )
    await _notify_document_status_change(updated)
    return updated

@router.delete("/{doc_id}", response_model=Document)
async def delete_document(doc_id: str, uid: str = Depends(require_permission("manageDocuments"))) -> Document:
    return await document_service.delete_document(doc_id, uid)

@router.get("/count/issued")
async def get_issued_count(documentType: Optional[str] = Query(None)) -> dict:
    count = document_service.count_issued_documents(documentType)
    return {"documentType": documentType, "issuedCount": count}


```

## backend\app\routes\fee_routes.py

```python
from fastapi import APIRouter, Depends, HTTPException, Body
from backend.app.core.auth import get_admin_uid
from backend.app.services.paymongo_service import ( 
    create_payment_link, 
    create_payment_intent # ✅ new helper for e-wallets 
)
from backend.app.models.fee import (
    DocumentFee, BusinessFee, MiscFee,
    NewDocumentFee, NewBusinessFee, NewMiscFee
)
from backend.app.utils.firestore_utils import (
    create_document,
    update_document,
    delete_document,
    get_db
)
import re
import logging
from typing import List, Dict, Optional, Type
from pydantic import BaseModel


router = APIRouter(prefix="/fees", tags=["Fees"])
logger = logging.getLogger("uvicorn.error")



# -----------------------------
# 🔧 Utility: Normalize IDs
# -----------------------------
def normalize_id(value: str) -> str:
    return re.sub(r"[^a-z0-9_]", "_", value.strip().lower())

# -----------------------------
# 🔧 Shared Firestore Helpers
# -----------------------------
def list_collection(collection: str) -> List[Dict]:
    docs = get_db().collection(collection).get()
    return [doc.to_dict() | {"id": doc.id} for doc in docs]

def list_with_misc(collection: str) -> List[Dict]:
    docs = get_db().collection(collection).get()
    misc_map = {
        normalize_id(m.id): m.to_dict()
        for m in get_db().collection("misc_fees").get()
    }
    result = []
    for doc in docs:
        data = doc.to_dict()
        misc_type_raw = data.get("miscType")
        if misc_type_raw:
            misc_type_key = normalize_id(misc_type_raw)
            misc_entry = misc_map.get(misc_type_key)
            if misc_entry and misc_entry.get("enabled") and data.get("enabled"):
                data["miscFeeResolved"] = misc_entry["fee"]
            else:
                data["miscFeeResolved"] = None
        else:
            data["miscFeeResolved"] = None
        result.append(data | {"id": doc.id})
    return result

def get_business_ref(identifier: str):
    # Try Firestore doc ID
    ref = get_db().collection("businesses").document(identifier)
    if ref.get().exists:
        return ref
    # Try custom businessId field
    docs = get_db().collection("businesses").where("businessId", "==", identifier).limit(1).get()
    if docs:
        return docs[0].reference
    raise HTTPException(status_code=404, detail=f"Business {identifier} not found")

def get_document_ref(identifier: str):
    ref = get_db().collection("documents").document(identifier)
    if ref.get().exists:
        return ref
    docs = get_db().collection("documents").where("documentId", "==", identifier).limit(1).get()
    if docs:
        return docs[0].reference
    raise HTTPException(status_code=404, detail=f"Document {identifier} not found")

# -----------------------------
# 🔨 Router Factory
# -----------------------------
def make_fee_routes(
    collection: str,
    prefix: str,
    new_model: Type[BaseModel],
    update_model: Type[BaseModel],
    id_field: str,
    extra_fields: Optional[List[str]] = None,
    resolve_misc: bool = False,
):
    if extra_fields is None:
        extra_fields = []

    @router.get(f"/{prefix}")
    def list_fees(admin=Depends(get_admin_uid)):
        return list_with_misc(collection) if resolve_misc else list_collection(collection)

    @router.post(f"/{prefix}")
    def create_fee(payload: new_model = Body(...), admin=Depends(get_admin_uid)):  # type: ignore
        """
        Create a new fee entry in Firestore.
        FastAPI will validate `payload` against the `new_model` schema.
        """
        logger.info("Creating fee with payload=%s", payload.dict())

        fee_id = normalize_id(getattr(payload, id_field))
        data = {id_field: getattr(payload, id_field).strip(), "fee": payload.fee}
        for field in extra_fields:
            data[field] = getattr(payload, field, None)
        return create_document(collection, fee_id, data)

    @router.put(f"/{prefix}/{{fee_id}}")
    def update_fee(fee_id: str, payload: update_model = Body(...), admin=Depends(get_admin_uid)):  # type: ignore
        """
        Update an existing fee entry in Firestore.
        FastAPI will validate `payload` against the `update_model` schema.
        """
        update_data = {"fee": payload.fee}
        for field in extra_fields:
            value = getattr(payload, field, None)
            if value is not None:
                update_data[field] = value
        return update_document(collection, normalize_id(fee_id), update_data)

    @router.delete(f"/{prefix}/{{fee_id}}")
    def delete_fee(fee_id: str, admin=Depends(get_admin_uid)):
        """
        Delete a fee entry from Firestore.
        """
        return delete_document(collection, normalize_id(fee_id))

# -----------------------------
# 📄 Document Fee Routes
# -----------------------------
make_fee_routes(
    collection="document_types",
    prefix="documents",
    new_model=NewDocumentFee,
    update_model=DocumentFee,
    id_field="documentType",
    extra_fields=["miscType", "enabled"],
    resolve_misc=True,
)

# -----------------------------
# 🏢 Business Fee Routes
# -----------------------------
make_fee_routes(
    collection="business_types",
    prefix="businesses",
    new_model=NewBusinessFee,
    update_model=BusinessFee,
    id_field="businessType",
    extra_fields=["registrationFee", "annualFee", "miscType", "enabled"],
    resolve_misc=True,
)

# -----------------------------
# 🆕 Miscellaneous Fee Routes
# -----------------------------
make_fee_routes(
    collection="misc_fees",
    prefix="misc",
    new_model=NewMiscFee,
    update_model=MiscFee,
    id_field="miscType",
    extra_fields=["enabled"],
)

# -----------------------------
# 🌐 Public Business Fee View
# -----------------------------
@router.get("/public/businesses")
def list_public_business_types():
    all_types = list_with_misc("business_types")
    result = []
    for bt in all_types:
            total = (bt.get("fee", 0) +
                     bt.get("registrationFee", 0) +
                     (bt.get("miscFeeResolved") or 0))
            bt["totalFee"] = total
            result.append(bt)
    return result

# 🌐 Public Document Fee View
@router.get("/public/documents")
def list_public_document_types():
    all_docs = list_with_misc("document_types")
    result = []
    for doc in all_docs:
            total = (doc.get("fee", 0) +
                     (doc.get("miscFeeResolved") or 0))
            doc["totalFee"] = total
            result.append(doc)
    return result


# -----------------------------
# 💰 Fee Computation Helpers
# -----------------------------
def resolve_misc_fee(bt: dict) -> int:
    misc_type_raw = bt.get("miscType") 
    if misc_type_raw: 
        misc_type_key = normalize_id(misc_type_raw) 
        misc_entry = get_db().collection("misc_fees").document(misc_type_key).get() 
        if misc_entry.exists: 
            misc = misc_entry.to_dict() 
            if misc.get("enabled") and bt.get("enabled"): 
                return misc.get("fee", 0) 
    return 0

def compute_document_fee(document_type: str) -> int:
    docs = get_db().collection("document_types").where("documentType", "==", document_type).limit(1).get()
    if not docs:
        raise HTTPException(status_code=404, detail=f"No fee configured for document type: {document_type}")
    doc = docs[0].to_dict()

    # ✅ Align with frontend: base + misc if enabled
    total = doc.get("fee", 0)
    total += resolve_misc_fee(doc)
    return total


def compute_business_registration_fee(business_type: str) -> int:
    docs = get_db().collection("business_types").where("businessType", "==", business_type).limit(1).get()
    if not docs:
        raise HTTPException(status_code=404, detail=f"No fee configured for business type: {business_type}")
    bt = docs[0].to_dict()

    # ✅ Align with frontend: base + registration + misc if enabled
    total = (bt.get("fee", 0) + bt.get("registrationFee", 0))
    total += resolve_misc_fee(bt)
    return total


def compute_business_annual_fee(business_type: str) -> int:
    docs = get_db().collection("business_types").where("businessType", "==", business_type).limit(1).get()
    if not docs:
        raise HTTPException(status_code=404, detail=f"No fee configured for business type: {business_type}")
    bt = docs[0].to_dict()

    # ✅ Align with frontend: base + annual + misc if enabled
    total = (bt.get("fee", 0) + bt.get("annualFee", 0))
    total += resolve_misc_fee(bt)
    return total


@router.post("/businesses/{business_id}/payment")
def create_business_payment(business_id: str, payload: dict = Body(...)):
    """
    Create a PayMongo payment for a business.
    Decides between registration vs annual renewal based on payload["paymentType"].
    """
    payment_type = payload.get("paymentType", "registration")  # default to registration
    remarks = payload.get("remarks", f"Business {payment_type} fee")
    ref = get_business_ref(business_id)
    business = ref.get().to_dict()

    # ✅ Decide which fee to compute
    if payment_type == "annual":
        fee = compute_business_annual_fee(business.get("businessType"))
        description = f"Annual Business Fee for {business_id}"
    else:
        fee = compute_business_registration_fee(business.get("businessType"))
        description = f"Registration Business Fee for {business_id}"

    if fee <= 0:
        raise HTTPException(status_code=400, detail="Invalid fee amount")

    # ✅ Decide API based on fee amount
    if fee < 100:
        result = create_payment_intent(
            amount=fee,
            description=description,
            remarks=remarks,
            metadata={
                "businessId": business_id,
                "businessType": business.get("businessType"),
                "paymentType": payment_type,
            },
            success_url="https://your-app.com/business/payment-success",
            cancel_url="https://your-app.com/business/payment-cancel"
        )
    else:
        result = create_payment_link(
            amount=fee,
            description=description,
            remarks=remarks,
            metadata={
                "businessId": business_id,
                "businessType": business.get("businessType"),
                "paymentType": payment_type,
            },
            success_url="https://your-app.com/business/payment-success",
            cancel_url="https://your-app.com/business/payment-cancel"
        )

    # ✅ Update Firestore with checkout details
    ref.update({
        "checkoutUrl": result["checkout_url"],
        "paymongoLinkId": result.get("link_id"),
        "paymentIntentId": result.get("intent_id"),
        "status": "for_payment",
        "fee": fee,
        "paymentType": payment_type,  # store type for audit clarity
    })

    return result


@router.post("/documents/{document_id}/payment")
def create_document_payment(document_id: str, payload: dict = Body(...)):
    remarks = payload.get("remarks", "Document fee")
    ref = get_document_ref(document_id)
    document = ref.get().to_dict()

    doc_type = document.get("documentType")
    fee = compute_document_fee(doc_type)
    if fee < 0:
        raise HTTPException(status_code=400, detail="Invalid fee amount")
    
    if fee == 0:
        ref.update({
            "status": "paid",
            "fee": 0,
            "paymentType": "free"
        })
        return {"message": f"{doc_type} is free, no payment required"}


    description = f"{doc_type} Request {document_id}"

    # ✅ Decide API based on fee
    if fee < 100:
        result = create_payment_intent(
            amount=fee,
            description=description,
            remarks=remarks,
            metadata={"documentId": document_id, "documentType": doc_type},
            success_url="https://your-app.com/documents/payment-success",
            cancel_url="https://your-app.com/documents/payment-cancel"
        )
    else:
        result = create_payment_link(
            amount=fee,
            description=description,
            remarks=remarks,
            metadata={"documentId": document_id, "documentType": doc_type},
            success_url="https://your-app.com/documents/payment-success",
            cancel_url="https://your-app.com/documents/payment-cancel"
        )

    ref.update({
        "checkoutUrl": result["checkout_url"],
        "paymongoLinkId": result.get("link_id"),
        "paymentIntentId": result.get("intent_id"),
        "status": "awaiting_payment",
        "fee": fee
    })

    logger.info("Updated Firestore with new checkoutUrl=%s fee=%s", result["checkout_url"], fee)

    return result

```

## backend\app\routes\incident_routes.py

```python
import logging
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

from backend.app.models.incident import (
    IncidentCreate,
    Incident,
    IncidentWithResident,
    IncidentStatus,
)
from backend.app.services.incident_service import (
    create_incident,
    get_incident_by_id,
    list_incidents_with_residents,
    update_incident_status,
    delete_incident,
)
from backend.app.services.notification_service import NotificationService
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Incidents"])

# 📦 Response models
class ActionResponse(BaseModel):
    message: str

# 🔧 Request models
class AdminStatusUpdateRequest(BaseModel):
    status: IncidentStatus
    assigned_to: Optional[str] = None


def _resolve_incident_owner_resident_uid(incident_obj: Incident) -> Optional[str]:
    resident_uid = getattr(incident_obj, "residentId", None)
    if resident_uid:
        return resident_uid

    auth_uid = getattr(incident_obj, "authUid", None)
    if not auth_uid:
        return None

    try:
        if get_db().collection("residents").document(auth_uid).get().exists:
            return auth_uid
    except Exception:
        return None

    return None


# 📝 Report a new incident
@router.post("", response_model=Incident, status_code=status.HTTP_201_CREATED)
async def report_incident(incident: IncidentCreate):
    try:
        created = create_incident(incident)
        logger.info("📝 Incident reported with ID: %s by resident %s", created.id, incident.authUid)

        try:
            await NotificationService.notify(
                role="admin",
                type="incident",
                message=f"New incident filed ({created.type.value})",
            )
            await NotificationService.notify(
                role="staff",
                type="incident",
                message=f"New incident filed ({created.type.value})",
            )
        except Exception as notify_err:
            logger.warning("⚠️ Incident submit notification failed: %s", notify_err)

        return created
    except Exception as e:
        logger.error("❌ Failed to create incident: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create incident")


# 🔍 Get a specific incident
@router.get("/{incident_id}", response_model=Incident)
def get_incident(incident_id: str):
    try:
        incident = get_incident_by_id(incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        logger.info("🔍 Incident retrieved: %s", incident_id)
        return incident
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Error retrieving incident %s: %s", incident_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# 📋 List all incidents with resident info
@router.get("", response_model=List[IncidentWithResident])
def get_all_incidents(status: Optional[str] = None):
    try:
        incidents = list_incidents_with_residents(status=status)
        logger.info("📋 Retrieved %d incidents (status=%s)", len(incidents), status)
        return incidents
    except Exception as e:
        logger.error("❌ Error listing incidents: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# 🔧 Admin: update incident status + assignment
@router.patch("/{incident_id}/status", response_model=ActionResponse)
async def admin_update_status(incident_id: str, payload: AdminStatusUpdateRequest):
    try:
        existing = get_incident_by_id(incident_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Incident not found")

        success = update_incident_status(
            incident_id,
            payload.status.value,
            assigned_to=payload.assigned_to,
        )
        if not success:
            raise HTTPException(status_code=404, detail="Incident not found")
        logger.info(
            "🔧 Incident %s updated: status=%s, assigned_to=%s",
            incident_id,
            payload.status.value,
            payload.assigned_to,
        )

        try:
            status_label = payload.status.value.replace("_", " ")
            await NotificationService.notify(
                role="admin",
                type="incident_update",
                message=f"Incident status updated to {status_label}",
            )
            await NotificationService.notify(
                role="staff",
                type="incident_update",
                message=f"Incident status updated to {status_label}",
            )

            resident_uid = _resolve_incident_owner_resident_uid(existing)
            if resident_uid:
                await NotificationService.notify(
                    role="resident",
                    type="incident_update",
                    message=f"Your incident status was updated to {status_label}",
                    user_id=resident_uid,
                )
        except Exception as notify_err:
            logger.warning("⚠️ Incident status notification failed: %s", notify_err)

        return ActionResponse(message="Incident updated successfully")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Error updating incident %s: %s", incident_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# 🗑️ Delete an incident
@router.delete("/{incident_id}", response_model=ActionResponse)
def delete_incident_route(incident_id: str):
    try:
        success = delete_incident(incident_id)
        if not success:
            raise HTTPException(status_code=404, detail="Incident not found")
        logger.info("🗑️ Incident deleted: %s", incident_id)
        return ActionResponse(message="Incident deleted successfully")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Error deleting incident %s: %s", incident_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

```

## backend\app\routes\notification_routes.py

```python
# backend/app/routes/notification_routes.py

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from typing import List, Set, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
import logging
from backend.app.services.notification_service import NotificationService
from backend.app.models.notification import Notification
from backend.app.core.auth import get_current_user
from backend.app.core.websocket_manager import manager
from backend.app.utils.firestore_utils import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])
logger = logging.getLogger("uvicorn.error")

class ResidentLoginPayload(BaseModel):
    count: int

class OfficerLoginPayload(BaseModel):
    name: str
    role: str


class BusinessSubmittedPayload(BaseModel):
    resident_name: str
    business_name: str | None = None


class BusinessStatusUpdatePayload(BaseModel):
    status: str
    resident_uid: str | None = None
    business_id: str | None = None
    firestore_id: str | None = None
    business_name: str | None = None


def _resident_message(event_type: str, count: int) -> str:
    if event_type == "login":
        return f"{count} resident logged in" if count == 1 else f"{count} residents logged in"
    return f"{count} resident logged out" if count == 1 else f"{count} residents logged out"


def _record_login_event(
    *,
    scope: str,
    actor_role: str,
    actor_uid: Optional[str],
    actor_name: Optional[str],
    count: int = 1,
):
    try:
        now = datetime.now(timezone.utc)
        payload = {
            "type": "login",
            "scope": scope,
            "role": actor_role,
            "user_id": actor_uid,
            "user": actor_name,
            "count": max(1, int(count or 1)),
            "timestamp": now,
            "createdAt": now,
        }
        get_db().collection("logins").add(payload)
    except Exception as err:
        logger.warning("⚠️ Failed to record login event: %s", err)


def _first_or_none(stream):
    for item in stream:
        return item
    return None


def _normalize_role(value: str | None) -> str:
    return str(value or "").strip().lower()


def _resolve_audience_user_ids(data: dict) -> Set[str]:
    """
    Resolve intended recipient UIDs for a notification document.
    - user_id present => single-recipient notification
    - role-targeted => all users with that role in users collection
    """
    explicit_uid = data.get("user_id")
    if explicit_uid:
        return {str(explicit_uid)}

    target_role = _normalize_role(data.get("role"))
    if not target_role:
        return set()

    if target_role == "resident":
        return set()

    audience: Set[str] = set()
    try:
        users = get_db().collection("users").where("role", "==", target_role).stream()
        for doc in users:
            audience.add(doc.id)
    except Exception:
        return set()

    return audience


def _is_notification_visible_to_user(data: dict, role: str, uid: str) -> bool:
    target_role = _normalize_role(data.get("role"))
    if role == "admin":
        return target_role == "admin"
    if role == "resident":
        return str(data.get("user_id") or "") == str(uid)
    return target_role == _normalize_role(role)


def _iter_scoped_notification_docs(role: str, uid: str):
    query = get_db().collection("notifications")
    if role == "admin":
        return query.where("role", "==", "admin").stream()
    if role == "resident":
        return query.where("user_id", "==", uid).stream()
    return query.where("role", "==", role).stream()


def _resolve_business_owner_uid(payload: BusinessStatusUpdatePayload) -> Optional[str]:
    if payload.resident_uid:
        return str(payload.resident_uid)

    db = get_db()
    business_data = None

    try:
        if payload.firestore_id:
            doc = db.collection("businesses").document(payload.firestore_id).get()
            if doc.exists:
                business_data = doc.to_dict() or {}
        elif payload.business_id:
            docs = db.collection("businesses").where("businessId", "==", payload.business_id).limit(1).stream()
            first = _first_or_none(docs)
            if first:
                business_data = first.to_dict() or {}
    except Exception:
        business_data = None

    if not business_data:
        return None

    owner_uid = business_data.get("ownerUid")
    if owner_uid:
        return str(owner_uid)

    email = business_data.get("email")
    if not email:
        return None

    try:
        users = db.collection("users").where("email", "==", email).limit(1).stream()
        user_doc = _first_or_none(users)
        if user_doc:
            return str(user_doc.id)
    except Exception:
        pass

    try:
        residents = db.collection("residents").where("email", "==", email).limit(1).stream()
        resident_doc = _first_or_none(residents)
        if resident_doc:
            return str(resident_doc.id)
    except Exception:
        pass

    return None


def _delete_for_user_or_globally(doc, uid: str):
    data = doc.to_dict() or {}
    deleted_by = {str(item) for item in (data.get("deleted_by") or [])}

    if str(uid) in deleted_by:
        return {"status": "already_deleted_for_user", "notification_id": doc.id}

    deleted_by.add(str(uid))
    audience_user_ids = _resolve_audience_user_ids(data)

    if audience_user_ids and audience_user_ids.issubset(deleted_by):
        doc.reference.delete()
        return {
            "status": "deleted_globally",
            "notification_id": doc.id,
            "deleted_by_count": len(deleted_by),
        }

    doc.reference.update({"deleted_by": sorted(deleted_by)})
    return {
        "status": "deleted_for_user",
        "notification_id": doc.id,
        "deleted_by_count": len(deleted_by),
    }


async def _broadcast_admin_notification(data: dict):
    payload = dict(data)
    await manager.broadcast(payload, role="admin")


async def _upsert_unread_resident_aggregate(event_type: str, delta: int) -> dict:
    collection = get_db().collection("notifications")
    existing = _first_or_none(
        collection
        .where("role", "==", "admin")
        .where("scope", "==", "resident")
        .where("type", "==", event_type)
        .where("read", "==", False)
        .limit(1)
        .stream()
    )

    if existing:
        current = existing.to_dict() or {}
        next_count = max(0, int(current.get("count") or 0) + int(delta))
        updates = {
            "count": next_count,
            "message": _resident_message(event_type, next_count),
            "timestamp": datetime.now(timezone.utc),
            "read": False,
        }
        existing.reference.update(updates)
        updated = {**current, **updates, "id": existing.id}
        await _broadcast_admin_notification(updated)
        return updated

    if delta <= 0:
        return {"count": 0}

    notif = await NotificationService.notify(
        role="admin",
        type=event_type,
        message=_resident_message(event_type, delta),
        scope="resident",
        count=delta,
    )
    return notif.model_dump()


async def _decrement_unread_resident_logins(delta: int):
    collection = get_db().collection("notifications")
    login_doc = _first_or_none(
        collection
        .where("role", "==", "admin")
        .where("scope", "==", "resident")
        .where("type", "==", "login")
        .where("read", "==", False)
        .limit(1)
        .stream()
    )

    if not login_doc:
        return

    current = login_doc.to_dict() or {}
    current_count = int(current.get("count") or 0)
    next_count = max(0, current_count - int(delta))

    updates = {
        "count": next_count,
        "message": _resident_message("login", next_count),
        "timestamp": datetime.now(timezone.utc),
        "read": next_count == 0,
    }
    login_doc.reference.update(updates)
    updated = {**current, **updates, "id": login_doc.id}
    await _broadcast_admin_notification(updated)


async def _notify_multiple(notifications: List[dict]) -> List[Notification]:
    """
    Helper to notify multiple roles/types in one call.
    Returns the list of Notification objects created.
    """
    results = []
    for n in notifications:
        notif = await NotificationService.notify(**n)
        results.append(notif)
    return results

@router.get("/", response_model=List[Notification])
async def get_notifications(user: dict = Depends(get_current_user)):
    """
    Fetch notifications for the current user.
    - Admin: see all notifications.
    - Resident: only own notifications (user_id filter).
    - Other roles: only notifications addressed to their role.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        query = get_db().collection("notifications")

        if role == "admin":
            docs = query.where("role", "==", "admin").stream()
        elif role == "resident":
            docs = query.where("user_id", "==", uid).stream()
        else:
            docs = query.where("role", "==", role).stream()

        notifications = []
        for doc in docs:
            data = doc.to_dict()
            deleted_by = {str(item) for item in (data.get("deleted_by") or [])}
            if uid and str(uid) in deleted_by:
                continue
            try:
                notifications.append(Notification(**data))
            except Exception as e:
                # Skip malformed documents
                import logging
                logging.getLogger("uvicorn.error").warning("⚠️ Skipping invalid notification doc: %s", e)

        notifications.sort(key=lambda n: n.timestamp, reverse=True)

        return notifications

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch notifications: {str(e)}")
    
@router.patch("/{notification_id}/read", response_model=Notification)
async def mark_notification_read(
    notification_id: str = Path(..., description="Notification ID"),
    user: dict = Depends(get_current_user)
):
    """
    Mark a notification as read.
    - Residents can only mark their own notifications.
    - Admin/staff/secretary can mark any notification.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        doc_ref = get_db().collection("notifications").document(notification_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Notification not found")

        data = doc.to_dict()

        # Residents can only mark their own notifications
        if role == "resident" and data.get("user_id") != uid:
            raise HTTPException(status_code=403, detail="Not authorized to modify this notification")

        # Update read status
        doc_ref.update({"read": True})
        data["read"] = True

        return Notification(**data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update notification: {str(e)}")

@router.post("/resident-login", response_model=Notification)
async def resident_login(payload: ResidentLoginPayload, user: dict = Depends(get_current_user)):
    """Admin unread resident-login aggregate increments until read."""
    step = max(1, int(payload.count or 1))
    _record_login_event(
        scope="resident",
        actor_role="resident",
        actor_uid=user.get("uid"),
        actor_name=user.get("fullName") or user.get("name") or user.get("email"),
        count=step,
    )
    updated = await _upsert_unread_resident_aggregate("login", step)
    return Notification(**updated)

@router.post("/resident-logout", response_model=Notification)
async def resident_logout(payload: ResidentLoginPayload, user: dict = Depends(get_current_user)):
    """Admin unread resident-logout aggregate increments and unread login aggregate decrements."""
    step = max(1, int(payload.count or 1))
    await _decrement_unread_resident_logins(step)
    updated = await _upsert_unread_resident_aggregate("logout", step)
    return Notification(**updated)

@router.post("/officer-login", response_model=Notification)
async def officer_login(payload: OfficerLoginPayload, user: dict = Depends(get_current_user)):
    """Admin receives officer login notifications with names."""
    officer_role = (payload.role or "officer").replace("_", " ").title()
    _record_login_event(
        scope="officer",
        actor_role=(payload.role or user.get("role") or "officer"),
        actor_uid=user.get("uid"),
        actor_name=payload.name,
        count=1,
    )
    return await NotificationService.notify(
        role="admin",
        type="login",
        message=f"{officer_role} {payload.name} logged in",
        scope="officer",
        user=payload.name,
    )

@router.post("/officer-logout", response_model=Notification)
async def officer_logout(payload: OfficerLoginPayload, user: dict = Depends(get_current_user)):
    """Admin receives officer logout notifications with names."""
    officer_role = (payload.role or "officer").replace("_", " ").title()
    return await NotificationService.notify(
        role="admin",
        type="logout",
        message=f"{officer_role} {payload.name} logged out",
        scope="officer",
        user=payload.name,
    )


@router.post("/incident", response_model=List[Notification])
async def incident_submitted(resident_name: str, user: dict = Depends(get_current_user)):
    """Admin + staff receive incident submission notifications."""
    return await _notify_multiple([
        {"role": "admin", "type": "incident", "message": f"Incident submitted by {resident_name}"},
        {"role": "staff", "type": "incident", "message": "New incident submitted"},
    ])

@router.post("/complaint", response_model=List[Notification])
async def complaint_submitted(resident_name: str, user: dict = Depends(get_current_user)):
    """Admin + staff receive complaint submission notifications."""
    return await _notify_multiple([
        {"role": "admin", "type": "complaint", "message": f"Complaint submitted by {resident_name}"},
        {"role": "staff", "type": "complaint", "message": "New complaint submitted"},
    ])

@router.post("/business", response_model=List[Notification])
async def business_registration(resident_name: str, user: dict = Depends(get_current_user)):
    """Admin + staff receive business registration notifications."""
    return await _notify_multiple([
        {"role": "admin", "type": "business", "message": f"Business registration submitted by {resident_name}"},
        {"role": "staff", "type": "business", "message": "New business registration submitted"},
    ])


@router.post("/business-submitted", response_model=List[Notification])
async def business_submitted(payload: BusinessSubmittedPayload, user: dict = Depends(get_current_user)):
    """Admin + staff receive business submission notifications."""
    business_suffix = f" ({payload.business_name})" if payload.business_name else ""
    return await _notify_multiple([
        {
            "role": "admin",
            "type": "business",
            "message": f"Business registration submitted by {payload.resident_name}{business_suffix}",
        },
        {
            "role": "staff",
            "type": "business",
            "message": f"New business registration submitted{business_suffix}",
        },
    ])


@router.post("/business-status-update", response_model=List[Notification])
async def business_status_update(payload: BusinessStatusUpdatePayload, user: dict = Depends(get_current_user)):
    """Admin + staff + owner resident receive business status update notifications."""
    status_label = payload.status.replace("_", " ")
    business_suffix = f" ({payload.business_name})" if payload.business_name else ""
    resolved_resident_uid = _resolve_business_owner_uid(payload)
    notifications = [
        {
            "role": "admin",
            "type": "business_update",
            "message": f"Business status updated to {status_label}{business_suffix}",
        },
        {
            "role": "staff",
            "type": "business_update",
            "message": f"Business status updated to {status_label}{business_suffix}",
        },
    ]

    if resolved_resident_uid:
        notifications.append({
            "role": "resident",
            "type": "business_update",
            "message": f"Your business status was updated to {status_label}{business_suffix}",
            "user_id": resolved_resident_uid,
        })

    return await _notify_multiple(notifications)

@router.post("/document", response_model=List[Notification])
async def document_request(resident_name: str, user: dict = Depends(get_current_user)):
    """Admin + secretary receive document request notifications."""
    return await _notify_multiple([
        {"role": "admin", "type": "document", "message": f"Document request submitted by {resident_name}"},
        {"role": "secretary", "type": "document", "message": "New document request submitted"},
    ])

@router.delete("/actions/bulk-delete", response_model=dict)
async def bulk_delete_notifications_actions(
    only_read: bool = Query(False, description="Delete only read notifications"),
    user: dict = Depends(get_current_user)
):
    """
    Bulk delete notifications for current user scope.
    - Applies per-user hide (`deleted_by`) for this account.
    - Permanently deletes only when all intended recipients have deleted.
    - Optionally restrict to only read notifications.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        docs = _iter_scoped_notification_docs(role, uid)
        deleted_ids = []
        globally_deleted_ids = []
        for doc in docs:
            data = doc.to_dict() or {}
            if only_read and not bool(data.get("read")):
                continue
            result = _delete_for_user_or_globally(doc, str(uid))
            if result.get("status") in {"deleted_for_user", "deleted_globally"}:
                deleted_ids.append(doc.id)
            if result.get("status") == "deleted_globally":
                globally_deleted_ids.append(doc.id)

        return {
            "status": "bulk_deleted_for_user",
            "count": len(deleted_ids),
            "deleted_ids": deleted_ids,
            "globally_deleted_ids": globally_deleted_ids,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to bulk delete notifications: {str(e)}")

@router.delete("/actions/delete-all", response_model=dict)
async def delete_all_notifications_actions(
    user: dict = Depends(get_current_user)
):
    """
    Delete all notifications for current user scope.
    - Applies per-user hide (`deleted_by`) for this account.
    - Permanently deletes only when all intended recipients have deleted.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        docs = _iter_scoped_notification_docs(role, uid)
        deleted_ids = []
        globally_deleted_ids = []
        for doc in docs:
            result = _delete_for_user_or_globally(doc, str(uid))
            if result.get("status") in {"deleted_for_user", "deleted_globally"}:
                deleted_ids.append(doc.id)
            if result.get("status") == "deleted_globally":
                globally_deleted_ids.append(doc.id)

        return {
            "status": "all_deleted_for_user",
            "count": len(deleted_ids),
            "deleted_ids": deleted_ids,
            "globally_deleted_ids": globally_deleted_ids,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete all notifications: {str(e)}")

@router.patch("/actions/mark-all-read", response_model=dict)
async def mark_all_notifications_read_actions(
    user: dict = Depends(get_current_user)
):
    """
    Mark all unread notifications as read for the caller scope.
    - Admin: mark admin-targeted notifications.
    - Resident: mark only own notifications.
    - Other roles: mark notifications addressed to their role.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        query = get_db().collection("notifications").where("read", "==", False)

        if role == "admin":
            query = query.where("role", "==", "admin")
        elif role == "resident":
            query = query.where("user_id", "==", uid)
        else:
            query = query.where("role", "==", role)

        docs = query.stream()
        updated_ids = []
        now = datetime.now(timezone.utc)
        for doc in docs:
            ref = get_db().collection("notifications").document(doc.id)
            ref.update({"read": True, "timestamp": now})
            updated_ids.append(doc.id)

        return {"status": "marked_read", "count": len(updated_ids), "updated_ids": updated_ids}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mark all as read: {str(e)}")

@router.delete("/{notification_id}", response_model=dict)
async def delete_notification(
    notification_id: str = Path(..., description="Notification ID"),
    user: dict = Depends(get_current_user)
):
    """
    Delete a notification for the current user account.
    - Marks notification hidden for this user using `deleted_by`.
    - Permanently deletes from Firestore only when all intended recipients deleted it.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        doc_ref = get_db().collection("notifications").document(notification_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Notification not found")

        data = doc.to_dict()

        # Role scoping guard
        if not _is_notification_visible_to_user(data, role, uid):
            raise HTTPException(status_code=403, detail="Not authorized to delete this notification")

        return _delete_for_user_or_globally(doc, str(uid))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete notification: {str(e)}")
    
 

@router.delete("/bulk", response_model=dict)
async def bulk_delete_notifications(
    only_read: bool = Query(False, description="Delete only read notifications"),
    user: dict = Depends(get_current_user)
):
    """
    Legacy bulk delete endpoint.
    Uses same per-user delete semantics as /actions/bulk-delete.
    """
    role = user.get("role")
    uid = user.get("uid")

    try:
        docs = _iter_scoped_notification_docs(role, uid)
        deleted_ids = []
        globally_deleted_ids = []
        for doc in docs:
            data = doc.to_dict() or {}
            if only_read and not bool(data.get("read")):
                continue
            result = _delete_for_user_or_globally(doc, str(uid))
            if result.get("status") in {"deleted_for_user", "deleted_globally"}:
                deleted_ids.append(doc.id)
            if result.get("status") == "deleted_globally":
                globally_deleted_ids.append(doc.id)

        return {
            "status": "bulk_deleted_for_user",
            "count": len(deleted_ids),
            "deleted_ids": deleted_ids,
            "globally_deleted_ids": globally_deleted_ids,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to bulk delete notifications: {str(e)}")


```

## backend\app\routes\password_routes.py

```python
import logging
from fastapi import APIRouter, HTTPException
from backend.app.models.password import ResetApply, ResetRequest
from backend.app.services.password_service import (
    create_reset_token,
    verify_reset_token,
    apply_password_reset,
    find_user_by_email
)
from firebase_admin import auth
import requests

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/password", tags=["Password Reset"])

MAIL_URL = "https://sendemailasia-phy3kbzjda-as.a.run.app"


@router.post("/request")
async def request_reset(data: ResetRequest):
    try:
        user = auth.get_user_by_email(data.email)
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")

    user_record = find_user_by_email(data.email)
    if not user_record:
        raise HTTPException(status_code=404, detail="No matching resident or account found")

    token = create_reset_token(data.email)
    reset_link = f"https://barangay-1721d.web.app/reset-password?token={token}"

    full_name = user_record.full_name or user.display_name or "User"
    barangay = user_record.barangay or (user_record.address.barangay if user_record.address else "Unknown")

    payload = {
        "type": "reset",
        "fullName": full_name,
        "email": data.email,
        "barangay": barangay,
        "resetLink": reset_link,
    }

    resp = requests.post(MAIL_URL, json=payload)
    if resp.status_code != 200:
        logger.error("❌ Email service error [%s]: %s", resp.status_code, resp.text)
        raise HTTPException(status_code=500, detail="Failed to send reset email")

    return {"success": True, "message": "Reset email sent"}


@router.get("/verify/{token}")
async def verify_reset(token: str):
    """Verify if a reset token is valid and not expired."""
    data = verify_reset_token(token)
    return {"valid": True, "email": data["email"]}


@router.post("/apply")
async def apply_reset(data: ResetApply):
    """Apply a new password if token is valid."""
    apply_password_reset(data.token, data.new_password)
    return {"success": True, "message": "Password reset successful"}

```

## backend\app\routes\payment_routes.py

```python
import logging
import hmac
import hashlib
import os
from backend.app.services.payment_service import log_payment_record, _next_receipt_number, _get_business_doc
from backend.app.services.notification_service import NotificationService
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from google.cloud import firestore
from fastapi.concurrency import run_in_threadpool
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/paymongo", tags=["Payments"])


PAYMONGO_WEBHOOK_SECRET = os.getenv("PAYMONGO_WEBHOOK_SECRET", "")


async def _notify_payment_roles(message: str, event_type: str = "payment_update"):
    for target_role in ("admin", "treasurer", "staff"):
        try:
            await NotificationService.notify(
                role=target_role,
                type=event_type,
                message=message,
            )
        except Exception as notify_err:
            logger.warning("⚠️ Payment notification failed for role=%s: %s", target_role, notify_err)

def verify_signature(raw_body: bytes, header_signature: str) -> bool:
    if not PAYMONGO_WEBHOOK_SECRET:
        logger.error("❌ PAYMONGO_WEBHOOK_SECRET not set")
        return False

    parts = {}
    for item in header_signature.split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            parts[k.strip()] = v.strip()

    timestamp = parts.get("t")
    provided = parts.get("s") or parts.get("te") or parts.get("li")

    if not timestamp or not provided:
        logger.error("❌ Missing timestamp or signature field in header: %s", header_signature)
        return False

    signed_payload = f"{timestamp}.{raw_body.decode('utf-8')}".encode("utf-8")
    computed = hmac.new(
        PAYMONGO_WEBHOOK_SECRET.encode("utf-8"),
        signed_payload,
        hashlib.sha256
    ).hexdigest()

    valid = hmac.compare_digest(computed, provided)
    if not valid:
        logger.warning("⚠️ Signature mismatch. computed=%s provided=%s", computed, provided)
    return valid

def _next_transaction_id():
    counter_ref = get_db().collection("counters").document("transactions")
    transaction = get_db().transaction()

    @firestore.transactional
    def increment_counter(transaction):
        snapshot = counter_ref.get(transaction=transaction)
        current = snapshot.get("value") if snapshot.exists else 0
        new_value = current + 1
        transaction.set(counter_ref, {"value": new_value})
        return new_value

    new_number = increment_counter(transaction)
    return f"TXN-{new_number:05d}"

@router.post("/webhook")
async def paymongo_webhook(request: Request):
    try:
        raw_body = await request.body()
        header_signature = request.headers.get("Paymongo-Signature", "")

        logger.debug("📥 Raw webhook body=%s", raw_body.decode("utf-8"))
        logger.debug("📥 Signature header=%s", header_signature)

        if not header_signature or not verify_signature(raw_body, header_signature):
            return JSONResponse(status_code=400, content={"success": False, "message": "Invalid signature"})

        payload = await request.json()
        attributes = payload.get("data", {}).get("attributes", {})
        event_type = attributes.get("type")
        inner_data = attributes.get("data", {})
        inner_attrs = inner_data.get("attributes", {})

        status = inner_attrs.get("status")
        metadata = inner_attrs.get("metadata", {}) or {}
        reference_number = (
            inner_attrs.get("reference_number")
            or inner_attrs.get("externalReferenceNumber")
            or metadata.get("pmReferenceNumber")
        )
        paid_at = inner_attrs.get("paidAt")

        transaction_id = inner_data.get("id")
        intent_id = inner_attrs.get("paymentIntentId")

        # logger.info("📦 Webhook event=%s status=%s metadata=%s ref=%s",
        #             event_type, status, metadata, reference_number)

        allowed_events = {
            "link.payment.paid",
            "payment.paid",
            "payment.failed",
            "payment.cancelled",
            "payment.refunded",
            "source.chargeable",
            "source.consumed"
        }
        if event_type not in allowed_events:
            return JSONResponse(status_code=200, content={"success": True, "message": f"Ignored event {event_type}"})

        if not status:
            return JSONResponse(status_code=400, content={"success": False, "message": "Invalid payload"})

        workflow_map = {
            "paid": "payment_submitted",
            "failed": "payment_failed",
            "cancelled": "payment_cancelled",
            "refunded": "payment_refunded"
        }
        workflow_status = workflow_map.get(status, status)

        update_data = {
            "paymentStatus": status,
            "status": workflow_status,
            "transactionId": transaction_id,
            "paymentIntentId": intent_id,
            "paymentDate": paid_at or firestore.SERVER_TIMESTAMP,
            "eventType": event_type
        }

        # --- Business update ---
        if "businessId" in metadata:
            docs = get_db().collection("businesses").where("businessId", "==", metadata["businessId"]).limit(1).get()
            if docs:
                await run_in_threadpool(docs[0].reference.update, update_data)
                logger.info("✅ Updated business=%s status=%s", metadata["businessId"], status)

                business_data = docs[0].to_dict()
                log_payment_record( 
                    reference_number=reference_number or transaction_id,
                    transaction_id=transaction_id, 
                    amount=(inner_attrs.get("amount") or 0) / 100,
                    status=status, 
                    fee_type=metadata.get("feeType"),
                    business_id=metadata.get("businessId"), 
                    owner_name=business_data.get("ownerName"),
                    business_name=business_data.get("businessName"),
                    business_type=business_data.get("businessType"),
                    event_type=event_type, 
                    paid_at=paid_at,
                    method="paymongo"
                )

                await _notify_payment_roles(
                    f"Business payment {status} ({metadata.get('businessId')})",
                    "payment_update",
                )

        # --- Document update via Firestore ID ---
        elif "documentId" in metadata:
            docs = get_db().collection("documents").where("documentId", "==", metadata["documentId"]).limit(1).get()
            if docs:
                await run_in_threadpool(docs[0].reference.update, update_data)
                logger.info("✅ Updated document via documentId=%s status=%s", metadata["documentId"], status)
                
                doc_data = docs[0].to_dict()
                # 👉 Log payment + receipt here 
                log_payment_record( 
                    reference_number=reference_number or transaction_id,
                    transaction_id=transaction_id, 
                    amount=(inner_attrs.get("amount") or 0) / 100, 
                    status=status, 
                    fee_type=metadata.get("feeType"),
                    document_id=metadata.get("documentId"),
                    owner_name=doc_data.get("ownerName"),
                    business_name=doc_data.get("businessName"),
                    document_type=doc_data.get("documentType"),
                    event_type=event_type, 
                    paid_at=paid_at,
                    method="paymongo"
                )
                await _notify_payment_roles(
                    f"Document payment {status} ({metadata.get('documentId')})",
                    "payment_update",
                )
            else:
                logger.warning("⚠️ No document found for documentId=%s", metadata["documentId"])

        # --- Fallback: referenceNumber ---
        elif reference_number:
            # Try businesses first
            docs = get_db().collection("businesses").where("referenceNumber", "==", reference_number).limit(1).get()
            if docs:
                await run_in_threadpool(docs[0].reference.update, update_data)
                logger.info("✅ Updated business via referenceNumber=%s status=%s", reference_number, status)

                business_data = docs[0].to_dict() 
                log_payment_record( 
                    reference_number=reference_number or transaction_id, 
                    transaction_id=transaction_id, 
                    amount=(inner_attrs.get("amount") or 0) / 100, 
                    status=status, 
                    fee_type=metadata.get("feeType"), 
                    business_id=business_data.get("businessId"), 
                    owner_name=business_data.get("ownerName"), 
                    business_name=business_data.get("businessName"), 
                    business_type=business_data.get("businessType"),
                    event_type=event_type, 
                    paid_at=paid_at,
                    method="paymongo" 
                )
                await _notify_payment_roles(
                    f"Business payment {status} ({business_data.get('businessId') or reference_number})",
                    "payment_update",
                )
            else:
                # Then try documents
                docs = get_db().collection("documents").where("referenceNumber", "==", reference_number).limit(1).get()
                if docs:
                    await run_in_threadpool(docs[0].reference.update, update_data)
                    logger.info("✅ Updated document via referenceNumber=%s status=%s", reference_number, status)

                    doc_data = docs[0].to_dict() 
                    log_payment_record( 
                        reference_number=reference_number or transaction_id, 
                        transaction_id=transaction_id, 
                        amount=(inner_attrs.get("amount") or 0) / 100, 
                        status=status, 
                        fee_type=metadata.get("feeType"), 
                        document_id=doc_data.get("documentId"), 
                        owner_name=doc_data.get("ownerName"), 
                        business_name=doc_data.get("businessName"), 
                        document_type=doc_data.get("documentType"),
                        event_type=event_type, 
                        paid_at=paid_at,
                        method="paymongo"
                    )
                    await _notify_payment_roles(
                        f"Document payment {status} ({doc_data.get('documentId') or reference_number})",
                        "payment_update",
                    )
                else:
                    logger.warning("⚠️ No record found for referenceNumber=%s", reference_number)
                    return JSONResponse(status_code=200, content={"success": False, "message": "Unmatched webhook"})

        else:
            logger.warning("⚠️ No identifiers in webhook payload: %s", payload)
            return JSONResponse(status_code=200, content={"success": False, "message": "Unmatched webhook"})

        return {"success": True}

    except Exception as e:
        logger.exception("❌ Webhook processing failed: %s", e)
        return JSONResponse(status_code=500, content={"success": False, "message": "Webhook error"})
    
@router.post("/payments/business")
async def record_business_payment(payload: dict):
    business_id = payload["businessId"]
    amount = payload["amount"]
    method = payload.get("method")

    # fetch business doc
    doc = _get_business_doc(business_id)
    if not doc:
        return {"success": False, "message": "Business not found"}

    business_data = doc.to_dict()

    transaction_id = payload.get("transactionId") or _next_transaction_id()
    receipt_number = _next_receipt_number()

    log_payment_record(
        reference_number=business_data.get("referenceNumber") or business_id,
        transaction_id=transaction_id,
        amount=amount,
        status="paid",
        fee_type="business_fee",
        business_id=business_id,
        business_name=business_data.get("businessName"),
        owner_name=business_data.get("ownerName"),
        business_type=business_data.get("businessType"),
        event_type="staff.payment",
        paid_at=firestore.SERVER_TIMESTAMP,
        method=method,
        receipt_number=receipt_number   # pass explicitly
    )

    response = { 
        "success": True, 
        "receiptNumber": receipt_number, 
        "transactionId": transaction_id,
        "businessId": business_id, 
        "businessName": business_data.get("businessName"), 
        "ownerName": business_data.get("ownerName"), 
        "businessType": business_data.get("businessType"), 
        "barangay": business_data.get("barangay"), 
        "method": method
    } 
    await _notify_payment_roles(
        f"Business payment paid ({business_id})",
        "payment",
    )
    
    return response

@router.post("/payments/document")
async def record_document_payment(payload: dict):
    try:
        document_id = payload["documentId"]
        amount = payload["amount"]
        method = payload.get("method")

        # fetch document doc
        doc_ref = get_db().collection("documents").document(document_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            return {"success": False, "message": "Document not found"}

        doc_data = snapshot.to_dict()

        transaction_id = payload.get("transactionId") or _next_transaction_id()
        receipt_number = _next_receipt_number()

        # 🔑 Update document payment status immediately 
        update_data = { 
            "paymentStatus": "paid", 
            "status": "paid", # secretary payments can be final 
            "transactionId": transaction_id, 
            "paymentDate": firestore.SERVER_TIMESTAMP, 
            "method": method, 
            "eventType": "staff.payment" 
        } 
        doc_ref.update(update_data)

        # log payment + receipt
        log_payment_record(
            reference_number=doc_data.get("referenceNumber") or document_id,
            transaction_id=transaction_id,
            amount=amount,
            status="paid",
            fee_type="document_fee",
            document_id=document_id,
            owner_name=doc_data.get("ownerName"),
            business_name=doc_data.get("businessName"),
            document_type=doc_data.get("documentType"),
            event_type="staff.payment",
            paid_at=firestore.SERVER_TIMESTAMP,
            method=method,
            receipt_number=receipt_number
        )

        response = {
            "success": True,
            "receiptNumber": receipt_number,
            "transactionId": transaction_id,
            "documentId": document_id,
            "documentType": doc_data.get("documentType"),
            "ownerName": doc_data.get("ownerName"),
            "businessName": doc_data.get("businessName"),
            "method": method
        }
        await _notify_payment_roles(
            f"Document payment paid ({document_id})",
            "payment",
        )
        return response

    except Exception as e:
        logger.exception("❌ Document payment failed: %s", e)
        return JSONResponse(status_code=500, content={"success": False, "message": "Payment error", "details": str(e)})

```

## backend\app\routes\paymongo_routes.py

```python
import base64
import logging
import os
import requests
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from backend.app.utils.firestore_utils import get_db
from backend.app.services.paymongo_service import create_payment_link, create_payment_intent, attach_payment_method
from backend.app.models.paymongo import DocumentPaymentRequest, BusinessPaymentRequest, AttachPaymentRequest
from backend.app.routes.fee_routes import (
    compute_document_fee,
    compute_business_registration_fee,
    compute_business_annual_fee,
)


logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Payments"])

# -----------------------------
# Firestore helpers
# -----------------------------
def _get_document_doc(document_id: str):
    docs = get_db().collection("documents").where("documentId", "==", document_id).limit(1).get()
    return docs[0] if docs else None

def _get_business_doc(business_id: str):
    docs = get_db().collection("businesses").where("businessId", "==", business_id).limit(1).get()
    return docs[0] if docs else None

# -----------------------------
# Shared payment creation logic
# -----------------------------
def _create_payment(fee: int, description: str, remarks: str, metadata: dict,
                    success_url: str, cancel_url: str):
    """Create either a Payment Intent (< ₱100) or Payment Link (≥ ₱100)."""
    if fee < 100:
        result = create_payment_intent(
            amount=fee, description=description, remarks=remarks,
            metadata=metadata
        )
        return {
            "checkoutUrl": result.get("checkoutUrl"),
            "referenceNumber": result.get("referenceNumber"),
            "paymentStatus": result.get("paymentStatus") or "awaiting_payment" or "for_payment",
            "paymentIntentId": result.get("paymentIntentId"),
            "paymongoClientKey": result.get("paymongoClientKey"),
            "type": "intent"
        }
    else:
        result = create_payment_link(
            amount=fee, description=description, remarks=remarks,
            metadata=metadata, success_url=success_url, cancel_url=cancel_url
        )
        return {
            "checkoutUrl": result.get("checkoutUrl"),
            "referenceNumber": result.get("referenceNumber"),
            "paymentStatus": result.get("paymentStatus") or "awaiting_payment" or "for_payment",
            "paymongoLinkId": result.get("paymongoLinkId"),
            "type": "link"
        }

# -----------------------------
# Document Payment Route
# -----------------------------
@router.post("/create-document-link")
async def create_document_payment_link(payload: DocumentPaymentRequest) -> dict:
    try:
        fee = compute_document_fee(payload.documentType)
        if fee <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid fee for document type: {payload.documentType}")

        description = f"{payload.documentType} Request {payload.documentId}"
        metadata = {"documentId": payload.documentId, "documentType": payload.documentType}

        result = _create_payment(
            fee, description, payload.remarks, metadata,
            success_url="http://localhost:3000/payment-success?type=document",
            cancel_url="http://localhost:3000/documents/payment-cancel"
        )

        doc = _get_document_doc(payload.documentId)
        if doc:
            update_data = {
                "checkoutUrl": result["checkoutUrl"],
                "paymentStatus": result["paymentStatus"],
                "status": "for_payment",
                "fee": fee,
                "referenceNumber": result.get("referenceNumber"),
                "paymentIntentId": result.get("paymentIntentId"),
                "paymongoClientKey": result.get("paymongoClientKey"),
                "paymongoLinkId": result.get("paymongoLinkId")
            }
            await run_in_threadpool(doc.reference.update, update_data)
        else:
            logger.warning("⚠️ No Firestore document found for %s", payload.documentId)

        return {"success": True, "fee": fee, **result}

    except Exception as e:
        logger.exception("❌ Failed to create document payment: %s", e)
        raise HTTPException(status_code=500, detail="Document payment creation failed")

# -----------------------------
# Business Payment Route
# -----------------------------
@router.post("/create-business-link")
async def create_business_payment_link(payload: BusinessPaymentRequest) -> dict:
    try:
        fee = compute_business_annual_fee(payload.businessType) if payload.feeType == "annual" \
              else compute_business_registration_fee(payload.businessType)
        if fee <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid fee for {payload.feeType} of {payload.businessType}")

        description = f"{payload.feeType} for {payload.businessType} ({payload.businessId})"
        metadata = {"businessId": payload.businessId, "businessType": payload.businessType, "feeType": payload.feeType}

        result = _create_payment(
            fee, description, payload.remarks, metadata,
            success_url="http://localhost:3000/payment-success?type=business",
            cancel_url="http://localhost:3000/business/payment-cancel"
        )

        doc = _get_business_doc(payload.businessId)
        if doc:
            update_data = {
                "fee": fee,
                "feeType": payload.feeType,
                "status": "awaiting_payment",
                "paymentStatus": result["paymentStatus"],
                "checkoutUrl": result["checkoutUrl"],
                "referenceNumber": result.get("referenceNumber"),
                "paymentIntentId": result.get("paymentIntentId"),
                "paymongoClientKey": result.get("paymongoClientKey"),
                "paymongoLinkId": result.get("paymongoLinkId")
            }
            await run_in_threadpool(doc.reference.update, update_data)
        else:
            logger.warning("⚠️ No Firestore business found for %s", payload.businessId)

        return {"success": True, "fee": fee, **result}

    except Exception as e:
        logger.exception("❌ Failed to create business payment: %s", e)
        raise HTTPException(status_code=500, detail="Business payment creation failed")

# -----------------------------
# Attach Payment Method Route
# -----------------------------
@router.post("/attach-payment-method")
async def attach_payment_method(payload: AttachPaymentRequest) -> dict:
    """
    Attach a payment method (GCash/GrabPay) to a PayMongo Payment Intent.
    Supports both business and document flows by setting the correct return_url.
    """
    try:
        PAYMONGO_SECRET_KEY = os.getenv("PAYMONGO_SECRET_KEY")
        if not PAYMONGO_SECRET_KEY:
            raise HTTPException(status_code=500, detail="PayMongo secret key not configured")

        headers = {
            "Authorization": f"Basic {base64.b64encode(PAYMONGO_SECRET_KEY.encode()).decode()}",
            "Content-Type": "application/json"
        }

        # Step 1: Create payment method
        pm_payload = {
            "data": {
                "attributes": {
                    "type": payload.method,  # "gcash" or "grab_pay"
                    "billing": payload.billing.model_dump()
                }
            }
        }
        pm_res = requests.post("https://api.paymongo.com/v1/payment_methods", json=pm_payload, headers=headers)
        pm_data = pm_res.json()
        # logger.info("📥 Payment method response: %s", pm_data)

        if "errors" in pm_data:
            logger.error("❌ Payment method creation failed: %s", pm_data)
            raise HTTPException(status_code=400, detail="Payment method creation failed")

        payment_method_id = pm_data["data"]["id"]

        # Step 2: Attach to intent
        if payload.type == "business":
            return_url = "http://localhost:3000/payment-success?type=business"
        else:
            return_url = "http://localhost:3000/payment-success?type=document"

        attach_payload = {
            "data": {
                "attributes": {
                    "payment_method": payment_method_id,
                    "client_key": payload.paymongoClientKey,
                    "return_url": return_url
                }
            }
        }
        intent_res = requests.post(
            f"https://api.paymongo.com/v1/payment_intents/{payload.paymentIntentId}/attach",
            json=attach_payload, headers=headers
        )
        intent_data = intent_res.json()
        # logger.info("📥 Attach response: %s", intent_data)

        if "errors" in intent_data:
            logger.error("❌ Payment intent attach failed: %s", intent_data)
            raise HTTPException(status_code=400, detail="Payment intent attach failed")

        attrs = intent_data["data"]["attributes"]
        redirect_url = attrs.get("next_action", {}).get("redirect", {}).get("url")
        if not redirect_url:
            logger.error("⚠️ No redirect URL in intent attach response: %s", intent_data)
            raise HTTPException(status_code=500, detail="No redirect URL returned from PayMongo")

        return {
            "redirectUrl": redirect_url,
            "status": attrs.get("status"),
            "referenceNumber": attrs.get("reference_number"),
            "paymentIntentId": payload.paymentIntentId
        }

    except Exception as e:
        logger.exception("❌ Failed to attach payment method: %s", e)
        raise HTTPException(status_code=500, detail="Attach payment method failed")

```

## backend\app\routes\resident_routes.py

```python
import logging
from fastapi import APIRouter, Query, Body, HTTPException, status, Request
from typing import Optional, List
from starlette.concurrency import run_in_threadpool
from backend.app.models import ResidentCreate, ResidentUpdate, ResidentOut
from backend.app.services import resident_service
from backend.app.services.resident_service import ResidentError
from pydantic import BaseModel, ValidationError

logger = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["Residents"])

# 📦 Response models
class BulkResidentResponse(BaseModel):
    householdId: str
    count: int
    items: List[ResidentOut]
    message: str

class DeleteResponse(BaseModel):
    id: Optional[str] = None
    householdId: Optional[str] = None
    message: str

# 🔧 Safe service call wrapper with detailed error logging
async def safe_service_call(context: str, func, *args, **kwargs):
    try:
        return await run_in_threadpool(func, *args, **kwargs)
    except ValidationError as e:
        # Log detailed validation errors
        logger.error("❌ Validation error in %s: %s", context, e.errors())
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.errors())
    except ResidentError as e:
        logger.warning("⚠️ %s: %s", context, str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.warning("⚠️ %s not found: %s", context, str(e))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        # Log full stack trace for unexpected errors
        logger.error("❌ %s failed: %s", context, str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Service call '{context}' failed"
        )

# 🚀 GET /residents
@router.get("/residents", response_model=List[ResidentOut])
async def list_residents(
    limit: int = Query(50, ge=1, le=100),
    start_after_id: Optional[str] = Query(None),
    full_name: Optional[str] = Query(None, alias="fullName"),
    birth_date: Optional[str] = Query(None, alias="birthDate")
):
    if full_name and birth_date:
        return await safe_service_call(
            "find duplicates",
            resident_service.find_duplicates,
            full_name,
            birth_date
        )
    return await safe_service_call(
        "list residents",
        resident_service.get_all_residents,
        limit,
        start_after_id
    )

@router.get("/residents/{id}", response_model=ResidentOut)
async def get_resident(id: str):
    logger.info("📤 Fetching resident with ID: %s", id)
    return await safe_service_call("get resident", resident_service.get_resident_by_id, id)


# 🚀 POST /residents
@router.post("/residents", response_model=ResidentOut, status_code=status.HTTP_201_CREATED)
async def add_resident(data: ResidentCreate = Body(...)) -> ResidentOut:
    logger.debug("📥 Incoming resident payload: %s", data.model_dump(by_alias=True))
    return await safe_service_call(
        "create resident",
        resident_service.add_resident,
        data.model_dump(by_alias=True)
    )

# 🚀 PUT /residents/{id}
@router.put("/residents/{id}", response_model=ResidentOut)
async def update_resident(id: str, data: ResidentUpdate = Body(...)) -> ResidentOut:
    logger.debug("📥 Update resident %s payload: %s", id, data.model_dump(by_alias=True))
    return await safe_service_call(
        "update resident",
        resident_service.update_resident,
        id,
        data.model_dump(by_alias=True)
    )

# 🚀 PATCH /residents/{id}
@router.patch("/residents/{id}", response_model=ResidentOut)
async def patch_resident(id: str, data: ResidentUpdate = Body(...)) -> ResidentOut:
    logger.debug("📥 Patch resident %s payload: %s", id, data.model_dump(exclude_unset=True, by_alias=True))
    return await safe_service_call(
        "patch resident",
        resident_service.patch_resident,
        id,
        data.model_dump(exclude_unset=True, by_alias=True)
    )

# 🚀 DELETE /residents/{id}
@router.delete("/residents/{id}", response_model=DeleteResponse)
async def delete_resident(id: str):
    logger.info("🗑️ Deleting resident with ID: %s", id)
    return await safe_service_call("delete resident", resident_service.delete_resident, id)

# 🚀 GET /households/{householdId}
@router.get("/households/{householdId}", response_model=List[ResidentOut])
async def get_household_residents(householdId: str):
    logger.info("📤 Fetching residents for household %s", householdId)
    return await safe_service_call("fetch household residents", resident_service.get_residents_by_household, householdId)

# 🚀 DELETE /households/{householdId}
@router.delete("/households/{householdId}", response_model=DeleteResponse)
async def delete_household_residents(householdId: str):
    logger.info("🗑️ Deleting residents in household %s", householdId)
    return await safe_service_call("delete household residents", resident_service.delete_by_household, householdId)

# 🚀 POST /residents/bulk
@router.post("/residents/bulk", response_model=BulkResidentResponse)
async def add_residents_bulk(
    data: List[ResidentCreate] = Body(...),
    household_id: Optional[str] = Query(None, alias="householdId")
):
    logger.debug("📥 Bulk resident payload count: %d", len(data))
    result = await safe_service_call(
        "bulk create residents",
        resident_service.add_residents_bulk,
        [d.model_dump(by_alias=True) for d in data],
        household_id
    )
    if "message" not in result:
        result["message"] = "Bulk residents created successfully"
    return result

# 🚀 DEBUG /residents/debug
@router.post("/residents/debug")
async def debug_resident(request: Request):
    """
    Debug endpoint: manually validate incoming payload against ResidentCreate.
    Useful for catching validation errors that FastAPI swallows.
    """
    body = await request.json()
    logger.debug("🐞 Raw incoming payload: %s", body)
    try:
        resident = ResidentCreate.model_validate(body)
        logger.info("✅ ResidentCreate validated successfully")
        return {"parsed": resident.model_dump()}
    except ValidationError as e:
        logger.error("❌ Debug validation error: %s", e.errors())
        raise HTTPException(status_code=422, detail=e.errors())

```

## backend\app\routes\role_routes.py

```python
from fastapi import APIRouter, Depends
from backend.app.core.auth import set_user_role, get_admin_uid
from backend.app.models.role import RoleUpdate, RoleResponse

router = APIRouter()

@router.post("/users/{uid}/role", response_model=RoleResponse, tags=["Roles"])
async def assign_role(uid: str, update: RoleUpdate):
    # If no admins exist yet, allow bootstrap
    if update.role == "admin":
        return set_user_role(uid, "admin")
    # Otherwise require admin
    _ = Depends(get_admin_uid)
    return set_user_role(uid, update.role)

```

## backend\app\routes\settings_routes.py

```python
from fastapi import APIRouter, HTTPException, status, Depends
from backend.app.models.settings import RolePermission, DocumentFee
from backend.app.services.settings_service import SettingsService

router = APIRouter(tags=["Settings"])

# 🔐 Centralized role-permission map
ALLOWED_ROLE_KEYS = {
    "admin": ["viewDashboard", "manageResidents", "approveClearance", "generateCertificates"],
    "staff": ["viewDashboard", "fileComplaints", "generateCertificates"],
    "resident": ["viewDashboard", "fileComplaints"],
    # Extend as needed
}

# 🔧 Dependency injection
def get_settings_service():
    return SettingsService()

# 🔐 Get all role permissions
@router.get("/permissions", response_model=dict)
def get_permissions(service: SettingsService = Depends(get_settings_service)):
    try:
        return service.get_permissions()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch permissions: {str(e)}"
        )

# 🔐 Update permissions for a specific role
@router.post("/permissions")
def update_permissions(
    data: RolePermission,
    service: SettingsService = Depends(get_settings_service)
):
    role = data.role
    permission_map = data.permissions

    # 🚫 Prevent admin override
    if role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions cannot be overridden."
        )

    # 🔍 Validate role
    allowed_keys = ALLOWED_ROLE_KEYS.get(role)
    if not allowed_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown role: '{role}'"
        )

    # 🔍 Validate keys in payload
    invalid_keys = [key for key in permission_map.keys() if key not in allowed_keys]
    if invalid_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid permission keys for role '{role}': {invalid_keys}"
        )

    try:
        success = service.update_permissions(role, permission_map)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Permission update failed"
            )
        return {"message": f"✅ Permissions updated for role: {role}"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update permissions: {str(e)}"
        )

# 💰 Get all document fees
@router.get("/fees", response_model=dict)
def get_fees(service: SettingsService = Depends(get_settings_service)):
    try:
        return service.get_fees()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch fees: {str(e)}"
        )

# 💰 Update fee for a specific document type
@router.post("/fees")
def update_fee(
    data: DocumentFee,
    service: SettingsService = Depends(get_settings_service)
):
    try:
        success = service.update_fee(data.document_type, data.fee)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Fee update failed"
            )
        return {"message": f"✅ Fee updated for document: {data.document_type}"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update fee: {str(e)}"
        )

```

## backend\app\routes\ws_routes.py

```python
# backend/app/routes/ws_routes.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState
from backend.app.core.websocket_manager import manager
from backend.app.core.auth import _verify_token, get_db, require_permission
from fastapi import Depends
import logging
import json

router = APIRouter(tags=["websocket"])
logger = logging.getLogger("uvicorn.error")


@router.get("/api/ws/presence/roles")
async def get_role_presence(_uid: str = Depends(require_permission("manageUsers"))):
    role_counts = {}
    for info in manager.active_connections.values():
        role = str(info.get("role") or "resident").strip().lower()
        role_counts[role] = role_counts.get(role, 0) + 1

    tracked_roles = ["admin", "secretary", "staff", "treasurer", "sk", "dilg", "resident"]
    roles = {
        role: {
            "online": role_counts.get(role, 0) > 0,
            "count": role_counts.get(role, 0),
        }
        for role in tracked_roles
    }

    for role, count in role_counts.items():
        if role not in roles:
            roles[role] = {"online": count > 0, "count": count}

    return {
        "roles": roles,
        "total_active_connections": len(manager.active_connections),
    }

@router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket, token: str = Query(None)):
    user_info = None
    try:
        await websocket.accept()

        token_value = None
        auth_method = None

        # First, check query string
        if token:
            token_value = token
            auth_method = "query"
        else:
            # Otherwise, expect the client to send token as first message
            try:
                initial_msg = await websocket.receive_text()
                payload = json.loads(initial_msg)
                token_value = payload.get("token")
                auth_method = "message"
            except Exception:
                await websocket.close(code=4001, reason="Missing authentication token")
                return

        if not token_value:
            await websocket.close(code=4001, reason="Missing authentication token")
            return

        logger.info("🔑 Auth method=%s", auth_method)

        # Verify token
        try:
            decoded = _verify_token(f"Bearer {token_value}")
        except Exception as e:
            logger.error("❌ Token verification failed: %s", e)
            await websocket.close(code=4001, reason="Invalid token")
            return

        uid = decoded.get("uid")
        role = decoded.get("role")

        if not role and uid:
            db = get_db()
            user_doc = db.collection("users").document(uid).get()
            if user_doc.exists:
                role = user_doc.to_dict().get("role")
            elif db.collection("residents").document(uid).get().exists:
                role = "resident"

        role = (str(role or "resident").strip().lower())
        user_info = {"uid": uid, "role": role, "user_id": uid, "auth_method": auth_method}

        await manager.connect(websocket, user_info)
        logger.info("✅ WebSocket connected for uid=%s role=%s via %s", uid, role, auth_method)

        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("❌ WebSocket disconnected")

    except Exception as e:
        logger.error("❌ WebSocket error uid=%s: %s", user_info.get("user_id") if user_info else "unknown", e)
        if websocket.client_state != WebSocketState.CLOSED:
            await websocket.close(code=1011)
        manager.disconnect(websocket)

```

## backend\app\scripts\__init__.py

```python
```

## backend\app\scripts\bootstrap_admin.py

```python
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

```

## backend\app\services\__init__.py

```python
```

## backend\app\services\account_service.py

```python
import logging
from typing import Optional
from datetime import datetime, timezone
from fastapi import HTTPException, status
from firebase_admin import auth
from firebase_admin.exceptions import FirebaseError
from firebase_admin._auth_utils import UserNotFoundError
from google.cloud import firestore
from backend.app.utils.firestore_utils import get_db
from backend.app.models.account import AccountCreate, AccountResponse, RoleEnum
from backend.app.core.roles import ROLE_PERMISSIONS
from backend.app.core.firebase import get_firestore

logger: logging.Logger = logging.getLogger("uvicorn.error")


# ===============================
# 🔧 Helpers
# ===============================
def sanitize_account_payload(data: AccountCreate, created_by: str) -> dict:
    """Prepare Firestore payload with consistent metadata."""
    return {
        "full_name": data.full_name,
        "email": data.email,
        "role": data.role.value,
        "createdBy": created_by,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }


def create_firebase_user(data: AccountCreate) -> str:
    """Create a Firebase Auth user and return UID."""
    try:
        user = auth.create_user(email=data.email, password=data.password)
        logger.info("🔐 Firebase Auth user created: %s", user.uid)
        return user.uid
    except FirebaseError as e:
        if "EMAIL_EXISTS" in str(e).upper():
            logger.warning("⚠️ Email already in use: %s", data.email)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already in use. Please choose a different one.",
            )
        logger.error("❌ Firebase Auth creation failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create Firebase user: {str(e)}",
        )


def set_user_claims(uid: str, role: RoleEnum):
    """Assign custom claims for Firestore rules enforcement."""
    try:
        permissions = ROLE_PERMISSIONS.get(str(role), {})
        auth.set_custom_user_claims(uid, {
            "role": role.value,
            "permissions": permissions
        })
        logger.info("🔐 Custom claims set for UID %s → role=%s, permissions=%s", uid, role, permissions)
    except Exception as e:
        logger.error("❌ Failed to set custom claims for UID %s: %s", uid, str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set custom claims: {str(e)}"
        )


def delete_firebase_user(uid: str):
    """Delete a Firebase Auth user by UID."""
    try:
        auth.delete_user(uid)
        logger.info("🗑️ Firebase Auth user deleted: %s", uid)
    except UserNotFoundError:
        logger.warning("⚠️ Tried to delete non-existent Firebase Auth user: %s", uid)
    except FirebaseError as e:
        logger.error("❌ Firebase Auth deletion failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete Firebase Auth user: {str(e)}",
        )


def write_firestore_profile(uid: str, payload: dict):
    """Write user profile to Firestore."""
    try:
        get_db().collection("users").document(uid).set(payload, merge=True)
        logger.info("✅ Firestore profile created for UID: %s", uid)
    except Exception as e:
        logger.error("❌ Firestore write failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write user profile: {str(e)}",
        )


def delete_firestore_profile(uid: str, deleted_by: str):
    """Delete user profile from Firestore and log audit trail."""
    try:
        get_db().collection("users").document(uid).delete()
        logger.info("🗑️ Firestore profile deleted for UID: %s", uid)

        get_db().collection("role_changes").add({
            "action": "delete",
            "target_user": uid,
            "changed_by": deleted_by,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })
    except Exception as e:
        logger.error("❌ Firestore deletion failed: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete Firestore profile: {str(e)}",
        )


def update_user_role(uid: str, new_role: RoleEnum, changed_by: str) -> AccountResponse:
    """Update a user's role in Firestore and Firebase Auth, log the change."""
    try:
        user_ref = get_db().collection("users").document(uid)
        snapshot = user_ref.get()

        if not snapshot.exists:
            logger.warning("⚠️ Tried to update role for non-existent user: %s", uid)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {uid} not found"
            )

        data = snapshot.to_dict()

        # 🔄 Update Firestore role
        user_ref.update({
            "role": new_role.value,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        logger.info("✅ Role updated to %s for UID: %s", new_role, uid)

        # 🔐 Update Firebase Auth custom claims
        set_user_claims(uid, new_role)

        # 📝 Log role change
        get_db().collection("role_changes").add({
            "action": "update_role",
            "target_user": uid,
            "new_role": new_role.value,
            "changed_by": changed_by,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return AccountResponse(
            uid=uid,
            email=data.get("email"),
            full_name=data.get("full_name"),
            role=new_role,
            created_by=data.get("createdBy", changed_by),
            created_at=data.get("createdAt", datetime.now(timezone.utc)),
            updated_at=datetime.now(timezone.utc),
        )

    except Exception as e:
        logger.error("❌ Failed to update role for UID %s: %s", uid, str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update role: {str(e)}"
        )


# ===============================
# 🚀 Public Service Functions
# ===============================
async def create_barangay_account(data: AccountCreate, created_by: str) -> AccountResponse:
    """Create a Firebase Auth user, Firestore profile, and set claims."""
    uid = create_firebase_user(data)
    payload = sanitize_account_payload(data, created_by)
    write_firestore_profile(uid, payload)
    set_user_claims(uid, data.role)

    # 📝 Log account creation in audit trail
    try:
        get_db().collection("role_changes").add({
            "action": "create",
            "target_user": uid,
            "new_role": data.role.value,
            "changed_by": created_by,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })
        logger.info("📝 Audit trail logged for account creation: %s", uid)
    except Exception as e:
        logger.error("❌ Failed to log account creation audit trail: %s", str(e), exc_info=True)

    return AccountResponse(
        uid=uid,
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        created_by=created_by,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


async def delete_barangay_account(uid: str, deleted_by: str):
    """Delete a Firebase Auth user and Firestore profile."""
    delete_firebase_user(uid)
    delete_firestore_profile(uid, deleted_by)
    return {"detail": f"Account {uid} deleted successfully"}

async def list_barangay_accounts( 
        role: RoleEnum | None = None, 
        limit: int = 20, 
        offset: int = 0, 
        order_by: str = "createdAt"
    ) -> list[AccountResponse]:
        """List all barangay accounts, optionally filtered by role."""
        try:
            query = get_db().collection("users").order_by(order_by)
            if role:
                query = query.where("role", "==", role.value)
            snapshots = query.limit(limit).offset(offset).stream()

            accounts = []
            for snap in snapshots:
                data = snap.to_dict()
                accounts.append(AccountResponse(
                    uid=snap.id,
                    email=data.get("email"),
                    full_name=data.get("full_name"),
                    role=RoleEnum(data.get("role")),
                    created_by=data.get("createdBy"),
                    created_at=data.get("createdAt", datetime.now(timezone.utc)),
                    updated_at=data.get("updatedAt", datetime.now(timezone.utc)),
                ))
            return accounts
        except Exception as e:
            logger.error("❌ Failed to list accounts: %s", str(e), exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list accounts: {str(e)}"
            )

def find_account_by_email(email: str) -> Optional[dict]:
    clean_email = email.strip().lower()
    docs = get_db().collection("users").where("email", "==", clean_email).stream()

    for doc in docs:
        return {**doc.to_dict(), "uid": doc.id}

    return None

```

## backend\app\services\business_service.py

```python
import uuid
from datetime import datetime, timezone
import logging
from backend.app.core.firebase import delete_file
from backend.app.services.paymongo_service import create_payment_link
from backend.app.services.fee_service import resolve_business_fee, determine_business_fee_type
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")

def create_business_application(data):
    business = data.business
    documents = data.documents

    # Decide fee type (registration vs annual)
    fee_type = determine_business_fee_type(business.dict())
    fee_breakdown = resolve_business_fee(business.type, fee_type)
    amount = fee_breakdown["totalFee"]

    doc_ref = get_db().collection("businesses").document()
    year = datetime.now().year
    business_id = f"BIZ-{business.barangay.upper()}-{year}-{uuid.uuid4().hex[:4]}"

    # Create PayMongo link
    paymongo = create_payment_link(
        amount=amount,
        description=f"{fee_type} for {business.name}",
        remarks=f"business_id:{business_id}"
    )

    biz_data = business.dict()

    # Store documents with both URL and path
    documents_data = {}
    for key, doc in documents.dict().items():
        if isinstance(doc, dict):
            # Already has url/path structure
            documents_data[key] = doc
        else:
            # Fallback if only URL was provided
            documents_data[key] = {"url": doc, "path": None}

    doc_ref.set({
        "ownerUid": data.owner_uid,
        "ownerName": data.owner_name,
        "contactNumber": data.contact_number,
        "email": data.email,
        "businessId": business_id,
        "businessName": biz_data.get("name"),
        "businessType": biz_data.get("type"),
        "barangay": biz_data.get("barangay"),
        "street": biz_data.get("street"),
        "city": biz_data.get("city"),
        "province": biz_data.get("province"),
        "address": f"{biz_data.get('street', '')}, Brgy. {biz_data.get('barangay', '')}, {biz_data.get('city', '')}, {biz_data.get('province', '')}",
        "documents": documents_data,
        "amount": amount,
        "feeType": fee_type,
        "status": "awaiting_payment",
        "paymentStatus": "unpaid",
        "paymongoLinkId": paymongo["paymongoLinkId"],
        "checkoutUrl": paymongo["checkoutUrl"],
        "referenceNumber": paymongo["referenceNumber"]
    })

    return {
        "business_id": business_id,
        "checkout_url": paymongo["checkoutUrl"],
        "fee_breakdown": fee_breakdown
    }


def update_businesses_for_annual_renewal():
    """Scan businesses and move those past their anniversary into for_payment with annual fee."""
    now = datetime.now(timezone.utc)
    businesses = get_db().collection("businesses").stream()

    for biz in businesses:
        data = biz.to_dict()
        fee_type = determine_business_fee_type(data)

        # If the fee type is annual, update status and amount
        if fee_type == "annualFee":
            fee_breakdown = resolve_business_fee(data["businessType"], fee_type)
            amount = fee_breakdown["totalFee"]

            biz.reference.update({
                "status": "for_payment",
                "paymentStatus": "unpaid",
                "feeType": fee_type,
                "amount": amount,
                "updatedAt": now
            })


def delete_business_and_related(business_id: str):
    """Delete a business and all related payments, receipts, and storage attachments."""
    business_docs = get_db().collection("businesses").where("businessId", "==", business_id).limit(1).get()
    if not business_docs:
        logger.warning("⚠️ No business found for businessId=%s", business_id)
        return {"success": False, "message": "Business not found"}

    business_doc = business_docs[0]
    business_data = business_doc.to_dict()

    # --- Delete attachments from Storage using stored paths ---
    if business_data.get("documents"):
        for key, doc in business_data["documents"].items():
            path = doc.get("path")
            if path:
                try:
                    delete_file(path)
                except Exception as e:
                    logger.warning("⚠️ Failed to delete storage file %s: %s", path, e)

    # --- Delete business doc ---
    business_doc.reference.delete()
    logger.info("🗑️ Deleted business %s", business_id)

    # --- Delete related payments ---
    payments = get_db().collection("payments").where("businessId", "==", business_id).get()
    for pay in payments:
        pay.reference.delete()
        logger.info("🗑️ Deleted payment %s for business %s", pay.id, business_id)

    # --- Delete related receipts ---
    receipts = get_db().collection("receipts").where("businessId", "==", business_id).get()
    for rec in receipts:
        rec.reference.delete()
        logger.info("🗑️ Deleted receipt %s for business %s", rec.id, business_id)

    return {"success": True, "message": f"Business {business_id} and related records + attachments deleted"}

```

## backend\app\services\complaint_service.py

```python
import logging
from typing import Optional, List
from google.cloud import firestore
from backend.app.utils.firestore_utils import get_db
from backend.app.models.complaint import (
    ComplaintCreate,
    Complaint,
    ComplaintWithResident,
    ComplaintStatus,
)

logger = logging.getLogger("uvicorn.error")

COMPLAINT_COLLECTION = "complaints"
RESIDENT_COLLECTION = "residents"


# ✅ Timestamp normalization helper
def _to_datetime(value):
    try:
        return value.to_datetime() if hasattr(value, "to_datetime") else value
    except Exception as e:
        logger.warning("⚠️ Failed to convert timestamp: %s", e)
        return value


# ✅ Shared Firestore → Complaint dict normalization
def _normalize_complaint(doc) -> dict:
    data = doc.to_dict()
    data["id"] = doc.id

    if "timestamp" in data:
        data["timestamp"] = _to_datetime(data["timestamp"])
    if "updated_at" in data:
        data["updated_at"] = _to_datetime(data["updated_at"])

    return data


# ✅ Enrich complaint with resident info (admin/staff view)
def _enrich_with_resident(data: dict) -> ComplaintWithResident:

    # Resident info (complaint subject)
    resident_id = data.get("filed_for") or data.get("filed_by")
    filed_for_name = "Unknown"
    if resident_id:
        try:
            doc = get_db().collection(RESIDENT_COLLECTION).document(resident_id).get()
            if doc.exists:
                filed_for_name = doc.to_dict().get("fullName", "Unknown")
        except Exception as e:
            logger.warning("⚠️ Failed to fetch resident %s: %s", resident_id, e)

    # Filer info (always resolve, even if same as filed_for)
    filed_by_name = "Unknown"
    filer_id = data.get("filed_by")
    if filer_id:
        try:
            doc = get_db().collection(RESIDENT_COLLECTION).document(filer_id).get()
            if doc.exists:
                filed_by_name = doc.to_dict().get("fullName", "Unknown")
        except Exception as e:
            logger.warning("⚠️ Failed to fetch filer %s: %s", filer_id, e)

    return ComplaintWithResident(
        **{
            **data,
            "filed_for_name": filed_for_name,
            "filed_by_name": filed_by_name,
            "residentName": filed_for_name,
        }
    )

# 📝 File a complaint (resident or staff on behalf of resident)
def file_complaint(data: ComplaintCreate) -> Optional[Complaint]:
    """
    Create a complaint record.
    - filed_by: the ID of the user who entered the complaint (resident or staff/admin)
    - filed_for: the resident ID the complaint is about (required if staff/admin files)
    """
    doc_ref = get_db().collection(COMPLAINT_COLLECTION).document()

    # Ensure filed_for is set: if not provided, default to filed_by (resident self-filing)
    filed_for = data.filed_for or data.filed_by

    payload = {
        **data.model_dump(),
        "filed_by": data.filed_by,       # who entered the complaint
        "filed_for": filed_for,          # resident the complaint is about
        "timestamp": firestore.SERVER_TIMESTAMP,
        "updated_at": None,
        "status": ComplaintStatus.open.value,
    }

    try:
        doc_ref.set(payload)
        snapshot = doc_ref.get()
        logger.info(
            "✅ Complaint filed with ID: %s (filed_by=%s, filed_for=%s)",
            doc_ref.id,
            data.filed_by,
            filed_for,
        )
        return Complaint.from_firestore(snapshot)
    except Exception as e:
        logger.error("❌ Failed to file complaint: %s", e)
        return None

# 🔍 Get a specific complaint (enriched with resident + filer info)
def get_complaint_by_id(complaint_id: str) -> Optional[ComplaintWithResident]:
    try:
        doc = get_db().collection(COMPLAINT_COLLECTION).document(complaint_id).get()
        if doc.exists:
            normalized = _normalize_complaint(doc)
            enriched = _enrich_with_resident(normalized)  # ✅ add resident + filer names
            return enriched
        logger.warning("⚠️ Complaint %s not found", complaint_id)
    except Exception as e:
        logger.error("❌ Failed to fetch complaint %s: %s", complaint_id, e)
    return None

# 👤 Resident: list complaints filed for them (self or by staff)
def list_complaints_by_resident_id(auth_uid: str, limit: Optional[int] = None):
    results: List[Complaint] = []

    try:
        query = get_db().collection(COMPLAINT_COLLECTION).where("filed_for", "==", auth_uid)
        if limit:
            query = query.limit(limit)

        for doc in query.stream():
            results.append(Complaint(**_normalize_complaint(doc)))

        logger.info("👤 Resident %s retrieved %d complaints", auth_uid, len(results))
    except Exception as e:
        logger.error("❌ Failed to list complaints for resident %s: %s", auth_uid, e)

    return results

# 🗂️ Admin/Staff: list all complaints with resident + filer info
def list_complaints_with_residents(
    limit: Optional[int] = None,
    status: Optional[ComplaintStatus] = None,
) -> List[ComplaintWithResident]:
    results: List[ComplaintWithResident] = []

    try:
        query = get_db().collection(COMPLAINT_COLLECTION).order_by(
            "timestamp", direction=firestore.Query.DESCENDING
        )

        if status:
            query = query.where("status", "==", status.value)
        if limit:
            query = query.limit(limit)

        for doc in query.stream():
            normalized = _normalize_complaint(doc)
            enriched = _enrich_with_resident(normalized)  # ✅ directly enrich
            results.append(enriched)

        logger.info("📋 Admin listed %d complaints", len(results))
    except Exception as e:
        logger.error("❌ Failed to list complaints: %s", e)

    return results

# 🔧 Update complaint status (admin)
def update_complaint_status(
    complaint_id: str,
    status: ComplaintStatus,
    notes: Optional[str] = None,
) -> Optional[Complaint]:
    doc_ref = get_db().collection(COMPLAINT_COLLECTION).document(complaint_id)

    try:
        snapshot = doc_ref.get()
        if not snapshot.exists:
            logger.warning("⚠️ Complaint %s not found for update", complaint_id)
            return None

        update_data = {
            "status": status.value,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }

        if notes:
            update_data["resolution_notes"] = notes

        doc_ref.update(update_data)

        logger.info(
            "🔧 Complaint %s status updated to %s (notes=%s)",
            complaint_id,
            status.value,
            notes,
        )

        return get_complaint_by_id(complaint_id)

    except Exception as e:
        logger.error("❌ Failed to update complaint %s: %s", complaint_id, e)
        return None

# 🗑️ Delete complaint (admin only)
def delete_complaint(complaint_id: str) -> Optional[Complaint]:
    doc_ref = get_db().collection(COMPLAINT_COLLECTION).document(complaint_id)

    try:
        snapshot = doc_ref.get()
        if not snapshot.exists:
            logger.warning("⚠️ Complaint %s not found for deletion", complaint_id)
            return None

        doc_ref.delete()
        logger.info("🗑️ Complaint %s deleted successfully", complaint_id)

        # Optionally return the deleted complaint data for confirmation
        normalized = _normalize_complaint(snapshot)
        return Complaint(**normalized)

    except Exception as e:
        logger.error("❌ Failed to delete complaint %s: %s", complaint_id, e)
        return None

```

## backend\app\services\disbursement_service.py

```python
from backend.app.utils.firestore_utils import get_db


def create_disbursement(payload: dict) -> dict:
    ref = get_db().collection("disbursements").document()
    ref.set(payload)
    return {"id": ref.id, **payload}

def list_disbursements() -> list[dict]:
    docs = get_db().collection("disbursements").stream()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]

def get_disbursement(id: str) -> dict | None:
    doc = get_db().collection("disbursements").document(id).get()
    return {"id": doc.id, **doc.to_dict()} if doc.exists else None

def update_disbursement(id: str, payload: dict) -> dict | None:
    ref = get_db().collection("disbursements").document(id)
    if not ref.get().exists:
        return None
    ref.update(payload)
    return {"id": id, **payload}

def update_status(id: str, status: str) -> dict | None:
    ref = get_db().collection("disbursements").document(id)
    if not ref.get().exists:
        return None
    ref.update({"status": status})
    return {"id": id, "status": status}

def delete_disbursement(id: str) -> bool:
    ref = get_db().collection("disbursements").document(id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True

```

## backend\app\services\document_service.py

```python
