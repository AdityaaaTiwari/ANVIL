# ANVIL GitHub App

## Website installation flow

1. Open the [ANVIL website](https://github.com/AdityaaaTiwari/ANVIL) and select **Get App**.
2. GitHub opens the ANVIL App installation page. Choose your personal account or organization.
3. Choose **All repositories** or **Only select repositories**, then confirm **Install**.
4. GitHub returns to the ANVIL setup page. The installation webhook records the installation metadata.
5. The website presents **Get App** as the installation entry point.

## What works after installation

The current release establishes the GitHub App installation and webhook verification foundation.

For project inspection and engineering workflows, use the local ANVIL CLI/dashboard:

```bash
npm install --global anvil-engineering-workbench
anvil init ./my-project
anvil inspect ./my-project
anvil dashboard ./my-project
```

Open the local URL printed by `anvil dashboard`. The dashboard operates on the workspace path you provide. GitHub App installation is a separate connection step and does not automatically upload or scan that local workspace.

## Server endpoints

- `GET /api/github/health` reports whether required server environment variables are present.
- `GET /api/github/install` redirects to the configured GitHub App installation page.
- `GET /api/github/login` starts GitHub App user authorization using one-time state and PKCE.
- `GET /api/github/callback` exchanges the authorization code, verifies the GitHub user, and records only installations that GitHub confirms the user can access.
- `GET /api/github/setup?installation_id=...` checks the signed-in user's installation access before completing setup.
- `GET /api/github/me` returns the signed-in user's public login and verified installation metadata only.
- `POST /api/github/logout` revokes the local server-side session.
- `POST /api/github/webhook` verifies GitHub's `X-Hub-Signature-256` header and persists installation metadata.

## Vercel environment variables

Configure these in Vercel Project Settings → Environment Variables. Never commit or share their values:

- `GITHUB_APP_SLUG`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL`
- `KV_REST_API_URL` (or `UPSTASH_REDIS_REST_URL`)
- `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_TOKEN`)

The Redis token must have write access. The read-only token is not sufficient.

## GitHub App settings

- Homepage: `https://github.com/AdityaaaTiwari/ANVIL`
- Webhook: `https://anvil-virid-sigma.vercel.app/api/github/webhook`
- User authorization callback URL: `https://anvil-virid-sigma.vercel.app/api/github/callback`
- Setup URL: `https://anvil-virid-sigma.vercel.app/api/github/setup`
- Subscribe to `installation` and `installation_repositories` webhook events.
- Keep permissions least-privilege: repository Metadata read-only and Contents read-only.
