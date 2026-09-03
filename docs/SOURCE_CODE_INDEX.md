# BIS Source Code Documentation

## Project Overview

Barangay Information System (BIS) is a full-stack system composed of:

- FastAPI backend for core business logic, records, workflow state updates, and integrations.
- React frontend for role-based dashboard interfaces.
- PostgreSQL for application persistence, with JSONB compatibility records during the incremental typed-table migration.
- Local JWT authentication, local filesystem uploads, and Gmail OAuth2 email delivery through FastAPI.

## High-Level Structure

- `backend/app/main.py`: FastAPI app factory, router registration, CORS, health endpoint.
- `backend/app/core`: PostgreSQL document-store compatibility API, local JWT auth, local storage, and role utilities.
- `backend/app/models`: Pydantic request and response schemas.
- `backend/app/routes`: HTTP and websocket API route handlers.
- `backend/app/services`: Service-layer business logic, local mail delivery, and PostgreSQL-backed records.
- `frontend/src`: UI pages, reusable components, context, route definitions, API client.
- `config/role_permissions.json`: role permission matrix.

## Backend Route Modules

- `account_routes.py`
- `audit_routes.py`
- `business_routes.py`
- `complaint_routes.py`
- `dashboard.py`
- `disbursement_routes.py`
- `document_routes.py`
- `fee_routes.py`
- `incident_routes.py`
- `notification_routes.py`
- `password_routes.py`
- `payment_routes.py`
- `paymongo_routes.py`
- `reporting_routes.py`
- `resident_routes.py`
- `role_routes.py`
- `settings_routes.py`
- `storage_routes.py`
- `ws_routes.py`
- `youth_routes.py`

## API Surface Summary

The backend registers routers in `backend/app/main.py` with the following prefixes:

- `/api`
- `/api/documents`
- `/api/incidents`
- `/api/complaints`
- `/api/paymongo`
- `/api/document_audit`
- `/api/reporting`
- `/api/storage`
- `/api/youth`
- `/api/email`
- `/dashboard`
- `/api` for payments, fees, disbursements, roles, password reset, notifications
- websocket notifications via `/ws/notifications`

Representative endpoints include:

- Residents: `/api/residents`, `/api/residents/{id}`, `/api/residents/bulk`
- Households: `/api/households/{householdId}`
- Documents: `/api/documents`, `/api/documents/{doc_id}/status`, `/api/documents/{doc_id}/issue`
- Incidents: `/api/incidents`, `/api/incidents/{incident_id}/status`
- Complaints: `/api/complaints`, `/api/complaints/{id}`, `/api/complaints/{id}/status`
- Fees: `/api/fees/documents`, `/api/fees/businesses`, `/api/public/documents`, `/api/public/businesses`
- Payments: `/api/payments/business`, `/api/payments/document`, `/api/webhook`
- Disbursements: `/api/disbursements`, `/api/disbursements/{id}`
- Accounts: `/api/admin/create-account`, `/api/admin/accounts`
- Password reset: `/api/password/request`, `/api/password/verify/{token}`, `/api/password/apply`
- Email: `/api/email`
- Uploads: `/api/storage/upload`, with local files served at `/storage/...`

## Frontend Route Map

Frontend routes are defined in `frontend/src/routes/AppRoutes.js` and include:

Public:
- `/login`
- `/reset-password`
- `/payment-success`
- `/payment-cancel`

Role dashboards:
- `/admin`
- `/staff`
- `/resident`
- `/secretary`
- `/treasurer`
- `/youth`
- `/audit`

Feature pages:
- Residents registry and creation
- Business applications and resident business views
- Complaint and incident filing and evaluation
- Document request, review, payment, issue, and resubmission flows
- Treasurer collections, disbursements, reports, and settings

## Environment Variables

Backend-critical variables observed in source:

- `DATABASE_URL`
- `JWT_SECRET`
- `LOCAL_STORAGE_DIR`
- `PAYMONGO_SECRET_KEY`
- `PAYMONGO_PUBLIC_KEY`
- `PAYMONGO_WEBHOOK_SECRET`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `CORS_ORIGINS`

Frontend variables observed in source:

- `REACT_APP_API_BASE_URL`
- `REACT_APP_WS_BASE_URL`
- `REACT_APP_FDP_SURVEY_URL`

## Local Run Reference

Backend local:

- install dependencies from `backend/requirements.txt`
- run Uvicorn app: `backend.app.main:app`

Frontend local:

- install dependencies from `frontend/package.json`
- start React app with `npm start` in `frontend`

Docker:

- `docker-compose.yml` defines the backend and PostgreSQL services for local development.
- `Dockerfile` starts backend with Uvicorn.

## Full Source Export

Use `docs/generate_source_documentation.ps1` to generate a timestamped source reference from the current files.
