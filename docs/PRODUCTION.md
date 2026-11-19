# Independent deployment setup

This submission snapshot is not connected to the live deployment. Do not add the production application's secrets or reuse its database. The supplied default configuration targets a disposable local database only.

## Local backend

```sh
npm ci
npm run build
npm run db:local
npm run dev:cloudflare
```

Cloud-saving configuration is deliberately incomplete. Guest practice continues to work. The API and admin routes fail closed until their identity settings and database are configured.

## Your own Cloudflare deployment

Create separate Pages projects and D1 databases under your own account for staging and production. Use their actual returned names and IDs. Do not point a project at the original author's domain or resources.

```sh
node scripts/configure-cloudflare.mjs --environment staging --pages-name YOUR_STAGING_PROJECT --database-id YOUR_STAGING_DATABASE_UUID --origin https://YOUR_STAGING_PROJECT.pages.dev
node scripts/configure-cloudflare.mjs --environment production --pages-name YOUR_PRODUCTION_PROJECT --database-id YOUR_PRODUCTION_DATABASE_UUID --origin https://YOUR_OWN_DOMAIN
```

The generator writes ignored environment-specific configuration files. It requires an explicit HTTPS origin for both environments and never copies credentials. Apply migrations to your own selected database before deploying. The scheduled retention Worker uses the same environment's database and has no public endpoint.

## Identity and permissions

Configure a Google OAuth Web application client for each environment. Register its exact callback URL as `YOUR_ORIGIN/api/auth/callback` and use only `openid email` scopes. Real sign-in requires HTTPS.

Set these through your Pages project's encrypted-secret controls:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: your environment's Google client.
- `SECURITY_SECRET`: at least 32 independently generated random bytes.
- `ACCESS_TEAM_DOMAIN`: your `team.cloudflareaccess.com` hostname.
- `ACCESS_AUD`: your admin Access application's audience.
- `ADMIN_EMAILS`: your intended administrator allowlist.

Protect `/admin`, its descendants, and `/api/admin/*` using Cloudflare Access. Backend JWT and email checks remain required, including on alternate deployment hostnames. Keep staging and production databases and credentials separate. Never commit live configuration, tokens or private data to this repository.

## Tests before collecting data

Verify Google sign-in with two accounts, ownership denial, sign-out cache cleanup, explicit guest copying, offline retry, concurrent-save conflicts, research opt-in and withdrawal, deletion and scheduled expiry. Tests included in this repository cover local fixtures; they do not prove another deployment's identity configuration works.

Research permission is per session and off by default. Admin exports contain pseudonymous client-reported responses. Keep export files private and out of source control. Downloaded copies and released models cannot automatically be recalled after withdrawal. Cloud rounds expire 365 days after server receipt.

Use `ml/train.py` for offline training. Review participant-separated evaluation and data quality before running `scripts/release-model.mjs ... --reviewed`. No real participant data or model weights are supplied. Model preparation does not deploy anything automatically.

For backup recovery, preserve the current private deletion ledger before any database restore. `scripts/deletion-recovery.mjs` generates reviewable SQL to reapply user/session deletion targets. Reapply deletions and retention before allowing restored data to serve requests. Prefer code rollback without a database restore.

Review recruitment, privacy notices, accessibility, research governance, and any applicable regulatory requirements with qualified collaborators before a real pilot. This prototype makes no clinical performance claim.
