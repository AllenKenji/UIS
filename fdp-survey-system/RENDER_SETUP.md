# FDP Render Setup

## Fast path (Render Blueprint)

This repository now includes [render.yaml](render.yaml).

In Render, use New + Blueprint and point it to this repo/branch.
Render will create the fdp-survey web service.

Then set all environment variables marked sync: false.

## Services to create

Create two Render services for FDP:

1. Web Service: FDP server
2. Static Site: FDP client

You also need a managed PostgreSQL database for production.

## 1) Server service (Web Service)

- Root directory: `fdp-survey-system`
- Runtime: Node
- Build command:

```bash
pnpm install --frozen-lockfile && pnpm build
```

- Start command:

```bash
pnpm start
```

### Required environment variables

- `NODE_ENV=production`
- `PORT` (Render provides this automatically)
- `DATABASE_URL`
- `JWT_SECRET`
- `BIS_API_BASE_URL`
- `BIS_ACCOUNT_PROVISION_API_KEY` (also used to authenticate resident sync — see `bisSync.ts` — against BIS's `FDP_TO_BIS_PROVISION_API_KEY`)
- `OAUTH_SERVER_URL` (or `VITE_OAUTH_PORTAL_URL`)

### Optional environment variables

- `DEV_AUTH_BYPASS=false`
- `LOCAL_AUTH_ENABLED=true`
- `LOCAL_AUTH_BOOTSTRAP=false`
- `BIS_ACCOUNT_PROVISION_URL` (defaults to `${BIS_API_BASE_URL}/api/internal/fdp/provision-account`)
- `BIS_ACCOUNT_PROVISION_REQUIRED=false` (set `true` to fail FDP registration when BIS sync fails)

## 2) Client service (Static Site)

If your client is served by Vite static build:

- Root directory: `fdp-survey-system`
- Build command:

```bash
pnpm install --frozen-lockfile && pnpm build
```

- Publish directory:

```bash
dist/public
```

If the client is bundled into the Node server response, you may only need the server web service.

## Database migration

Run after first deployment:

```bash
pnpm db:push
```

Run this in Render shell for the server service or in a trusted CI job with production `DATABASE_URL`.

## Post-deploy checks

1. Confirm server health and logs show startup success.
2. Confirm auth flow works in production mode.
3. Confirm survey creation and status workflow works.
4. Confirm reports and exports run against production database.
