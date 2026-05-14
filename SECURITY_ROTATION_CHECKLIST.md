# Security Rotation Checklist

Use this checklist immediately after any secret exposure.

## Rotate now

1. Firebase service account key(s)
2. PayMongo secret, public, and webhook keys
3. Gmail OAuth client secret and refresh token
4. JWT secrets and API keys used by integrated services
5. Database credentials and connection strings

## After rotation

1. Update Render environment variables for all services.
2. Confirm local .env files use new values.
3. Revoke old credentials in provider dashboards.
4. Trigger a full redeploy of all services.

## Prevent recurrence

1. Keep .env and key files in .gitignore.
2. Commit only .env.example templates.
3. Enable GitHub secret scanning and push protection.
4. Require pull requests to main.
5. Use least-privilege service accounts.
