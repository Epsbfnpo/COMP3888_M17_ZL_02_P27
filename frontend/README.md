# Worldbuilding frontend

The React/vinext frontend provides account forms, world and entity pages,
relationship navigation, proposals, version history and AI-assisted drafting.

Follow the [root setup guide](../README.md) to initialise MySQL and start the
backend before using the application.

## Local development

From this directory:

```powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev -- --port 3000
```

Open **http://localhost:3000**. The default backend is
**http://localhost:3001**, configured by `VITE_API_URL` in `.env`.
The backend's `FRONTEND_ORIGIN` must match the browser origin.
Restart after changing local configuration. API URLs are embedded at build time
for production builds.

## Checks

```powershell
node --test app/edit-suggestion.test.ts
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

The integrated browser suite is in [`../testing`](../testing). Gemini API keys
belong only in the backend environment; never put them in `VITE_` variables.
