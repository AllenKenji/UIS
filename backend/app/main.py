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
)

logger = logging.getLogger("barangay")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    try:
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

if __name__ == "__main__":
    logger.info("🚀 Starting FastAPI app...")
    port = int(os.environ.get("PORT", 8080))
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=port, reload=True)
