# Security Rotation Checklist

Use this checklist immediately after any secret exposure.

## Rotate now

1. JWT secret
2. Database credentials in DATABASE_URL
3. OAuth client secrets and API keys
4. Any third-party service tokens used by the app

## After rotation

1. Update Render environment variables.
2. Redeploy services.
3. Revoke old credentials.
4. Validate auth and database connectivity.

## Prevent recurrence

1. Keep .env files out of Git.
2. Commit only .env.example.
3. Enable GitHub secret scanning and push protection.
4. Protect main branch with pull request checks.
