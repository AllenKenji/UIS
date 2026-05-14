# BIS Render Setup

# BIS Render Setup

## Fast path (Render Blueprint)

This repository includes [render.yaml](render.yaml) that deploys the BIS backend.

In Render, use New → Blueprint and select `AllenKenji/UIS`.

It will create the **bis-backend** web service.

The **bis-frontend** is deployed separately (see below).

## Frontend deployment (manual)

Frontend is a static React site. Deploy separately:

1. Render → New → Static Site
2. Connect repo `AllenKenji/UIS`
3. Set Publish directory: `frontend/build`
4. Build command: `npm ci && npm run build`
5. Root directory: `frontend`
6. Add environment variables:
   - REACT_APP_API_BASE_URL
   - REACT_APP_WS_BASE_URL
   - REACT_APP_MAIL_URL
   - REACT_APP_CFDP_SURVEY_URL

## Services to create

Create two Render services for BIS:

1. Web Service: BIS backend (FastAPI)
2. Static Site: BIS frontend (React build)

## 1) Backend service (Web Service)

- Root directory: `BIS/backend`
- Runtime: Python
- Build command:

```bash
pip install -r requirements.txt
```

- Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Required environment variables

- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_PROJECT_ID`
- `GOOGLE_CLOUD_PROJECT`
- `FIREBASE_SERVICE_ACCOUNT` (JSON string secret)
- `PAYMONGO_SECRET_KEY`
- `PAYMONGO_PUBLIC_KEY`
- `PAYMONGO_WEBHOOK_SECRET`

## 2) Frontend service (Static Site)

- Root directory: `BIS/frontend`
- Build command:

```bash
npm ci && npm run build
```

- Publish directory:

```bash
build
```

### Required environment variables

- `REACT_APP_API_BASE_URL=https://<your-bis-backend>.onrender.com`
- `REACT_APP_WS_BASE_URL=wss://<your-bis-backend>.onrender.com`
- `REACT_APP_MAIL_URL=<your-firebase-function-url>`
- `REACT_APP_CFDP_SURVEY_URL=https://<your-cfdp-frontend>.onrender.com`

## Post-deploy checks

1. Open backend URL and verify `/docs` loads.
2. Open frontend URL and verify login page loads.
3. Test an authenticated API call from frontend.
4. Test WebSocket notifications.
5. Test PayMongo webhook endpoint using test mode.
