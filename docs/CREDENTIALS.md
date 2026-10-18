# Credential management

## Ownership and access

Shuhao Pei is the initial custodian for the shared demo and deployment Gemini key.
The custodian manages creation, access restrictions, rotation, revocation and usage
monitoring. Confirm a backup administrator before handing over or deploying the
shared service. Do not share the Google account password.

Developers should use separate development keys where possible. Share a key only
with people who need it, using an approved password manager or another secure
sharing channel. Do not send keys through Git, group chat, meeting notes, reports,
screenshots or demonstration packages. Record each key's purpose, environment,
owner and rotation date in the password manager without copying its value into
project documentation.

## Local setup

Keep existing database settings in `backend/.env` and fill in this variable locally:

```dotenv
GEMINI_API_KEY=
```

The real value belongs only in the ignored local file or the backend process
environment. `.env` is plaintext, not encrypted storage. The committed
`backend/.env.example` contains variable names and empty/sample values only.
Do not overwrite an existing `.env` when updating the example.

From `backend`, run:

```sh
npm run check:credentials
npm run test:credentials
```

The check reports presence only. It never prints the key or sends a request to
Google, so success does not verify validity, API access, billing or quota. Missing
configuration returns exit code 1. The existing application can still run without
a Gemini key while AI integration is pending.

Backend Gemini calls use `getGeminiApiKey()` from `ai-config.js`
after the existing backend environment loader has run. Missing credentials produce
`AI_NOT_CONFIGURED`; map this to a safe service-unavailable response rather than
returning provider errors or configuration values. The conversation UI now uses
the backend live endpoint; the configuration check itself still makes no API call.

## Application and deployment boundaries

- Only the backend may hold and use the key. Never use `VITE_` or `NEXT_PUBLIC_`
  variables, frontend source files, browser storage or API responses for secrets.
- Requests must pass authentication, world-access checks and usage controls before
  calling Gemini. A hidden key alone does not prevent abuse of our own API.
- Use different development and production keys. Restrict API access where
  supported and monitor usage; configure request limits before shared deployment.
- Store production credentials in the hosting platform's secret store and inject
  them into the backend environment. Do not put `.env` into deployment images,
  source archives or client material. Restart/redeploy after changing injected
  credentials or an already-loaded local `.env` file.
- Never log the key, complete environment, authentication headers or provider URLs
  containing credentials. Verify ignore rules with `git check-ignore backend/.env`.

## Rotation and incidents

For planned rotation, create a replacement, update the backend secret, restart,
verify a controlled request, then revoke the old key. If a key may have leaked,
revoke it promptly, issue a replacement and review usage. Removing it from a file
or Git history is not sufficient. Coordinate any history cleanup with the team.

Provider reference: https://ai.google.dev/gemini-api/docs/api-key
