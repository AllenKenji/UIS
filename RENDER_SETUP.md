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
   - VITE_API_BASE_URL
   - VITE_WS_BASE_URL
   - VITE_FDP_SURVEY_URL

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

- `DATABASE_URL`
- `JWT_SECRET`
- `LOCAL_STORAGE_DIR`
- `PAYMONGO_SECRET_KEY`
- `PAYMONGO_PUBLIC_KEY`
- `PAYMONGO_WEBHOOK_SECRET`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `BUSINESS_PERMIT_CHECK_KEY` (shared secret required by `POST /api/internal/business-permits/check-expirations` in the `X-BIS-Permit-Check-Key` header — see "Business permit expiration cron job" below)

### Optional FDP provisioning variables (for surveyor/supervisor sync)

- `FDP_PROVISION_URL` (FDP internal endpoint, e.g. `/survey/api/internal/bis/provision-user`)
- `FDP_PROVISION_API_KEY` (shared secret expected by FDP in `X-BIS-Provision-Key`)
- `FDP_PROVISION_REQUIRED` (`true` to block BIS account creation when FDP sync fails; default is `false`)
- `FDP_TO_BIS_PROVISION_API_KEY` (shared secret required by BIS internal endpoints `POST /api/internal/fdp/provision-account` and `POST /api/internal/fdp/provision-resident` — same key FDP sends as `BIS_ACCOUNT_PROVISION_API_KEY` for both calls)
- `FDP_SURVEY_BASE_URL` (optional public FDP base URL used for auto-login handoff; if omitted BIS derives it from `FDP_PROVISION_URL`)

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

- `VITE_API_BASE_URL=https://<your-bis-backend>.onrender.com`
- `VITE_WS_BASE_URL=wss://<your-bis-backend>.onrender.com`
- `VITE_FDP_SURVEY_URL=https://<your-fdp-frontend>.onrender.com`

## Business permit expiration cron job

Business permits warn residents by email 30 days before `validUntil` and
automatically flip to `expired` on the day they lapse without a renewal
payment. Nothing in the backend runs this on a timer — it's a plain
endpoint that needs an external daily trigger:

1. Render → New → Cron Job (same repo, root directory `BIS/backend`).
2. Schedule: `0 0 * * *` (once daily; time doesn't matter much).
3. Command:

```bash
curl -X POST "$BACKEND_URL/api/internal/business-permits/check-expirations" \
  -H "X-BIS-Permit-Check-Key: $BUSINESS_PERMIT_CHECK_KEY"
```

4. Set `BACKEND_URL` and `BUSINESS_PERMIT_CHECK_KEY` as env vars on the Cron
   Job service — `BUSINESS_PERMIT_CHECK_KEY` must match the value set on
   the **bis-backend** web service, or the endpoint returns 403.

## Post-deploy checks

1. Open backend URL and verify `/docs` loads.
2. Open frontend URL and verify login page loads.
3. Test an authenticated API call from frontend.
4. Test WebSocket notifications.
5. Test PayMongo webhook endpoint using test mode.
