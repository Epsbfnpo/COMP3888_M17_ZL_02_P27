# AI-Assisted Collaborative Worldbuilding

Project repository: `COMP3888_M17_ZL_02_P27`.

A web application for creating shared fictional worlds, organising connected
entities and reviewing community contributions. Gemini assists authors with
questions, consistency checks and suggested body revisions. Authors preview and
apply suggestions to their drafts before saving or submitting them for review.

## Features

- Public and private worlds with Owner, Manager, Author and Reader roles.
- Entity pages, keyword/tag search and custom relationships with optional reverse names.
- Private drafts, proposals, reviewer approval and conflict recovery.
- Published version history, comparisons and authorised restoration.
- A signed-in AI assistant with permission-checked world/entity references.
- AI body-edit previews with explicit Apply and Save actions and outdated-suggestion protection.

The current setup instructions cover local operation. Remote deployment requires
configuration and verification in the client's target environment.

## Requirements

- Node.js **22.13 or later** and npm. The latest local verification used Node.js 24.
- MySQL **8.4** and a running MySQL server.
- Git and a modern browser.
- A Gemini API key with access to the configured model if AI features are needed.
  The backend currently requests `gemini-3.8-flash`.

The frontend uses React, vinext and Vite. The backend uses Express and mysql2.
Install dependencies using the committed lockfiles.

## 1. Clone and install

```powershell
git clone https://github.com/Epsbfnpo/COMP3888_M17_ZL_02_P27.git
cd COMP3888_M17_ZL_02_P27
git rev-parse HEAD
```

Record the commit hash when identifying a delivered or tested version.

Install the backend dependencies:

```powershell
cd backend
npm ci
cd ..
```

Install the frontend dependencies:

```powershell
cd frontend
npm ci
cd ..
```

## 2. Initialise a new database

Start MySQL first. From the repository root, open its command-line client using
an account permitted to create the database and tables:

```powershell
mysql -u root -p
```

If `mysql` is not on PATH, use the MySQL installation's client executable or run
the same scripts through MySQL Workbench. In the MySQL client, execute these in order:

```sql
SOURCE backend/database/schema.sql;
SOURCE backend/database/worldbuilding_schema.sql;
SOURCE backend/database/permissions.sql;
```

These scripts initialise the `worldbuilding` database. Keep `DB_NAME` consistent
with that name unless you deliberately adapt the database scripts.

For an application account, a MySQL administrator can run the following after
replacing the sample password:

```sql
CREATE USER 'worldbuilding_app'@'localhost' IDENTIFIED BY 'replace_with_a_local_password';
GRANT ALL PRIVILEGES ON worldbuilding.* TO 'worldbuilding_app'@'localhost';
```

Use this account in the backend configuration. Exit the MySQL client with `exit`.

### Existing databases

Back up an existing database and check which schema changes it already has.
`permissions.sql` contains one-time schema changes and must not be rerun against
an already migrated database. New installations already include
`relationships.reverse_name` in `worldbuilding_schema.sql`.
Run `relationship_names.sql` only once for an older database missing that column.
Do not rerun all setup scripts to upgrade an existing installation.

## 3. Configure the application

From the repository root, create local configuration files if they do not exist:

```powershell
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
```

Edit `backend/.env` with your local settings:

```dotenv
DB_HOST=localhost
DB_USER=worldbuilding_app
DB_PASSWORD=your_local_password
DB_NAME=worldbuilding
DB_PORT=3306
PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
GEMINI_API_KEY=
```

Edit `frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:3001
```

`GEMINI_API_KEY` is optional for the core collaboration features. Without a key,
AI requests are unavailable. With a key, submitted messages and selected context
are sent to Google. Keep the key on the backend and out of frontend variables.

Real `.env` files are ignored by Git and are not supplied by cloning or pulling.
Keep existing local values when updating the repository. Restart the relevant
process after changing configuration; rebuild the frontend if its API URL changes
for a production build. See [credential management](docs/CREDENTIALS.md).

## 4. Run locally

In one terminal:

```powershell
cd backend
npm start
```

In a second terminal, starting from the repository root:

```powershell
cd frontend
npm run dev -- --port 3000
```

Open **http://localhost:3000**. The backend health endpoint is
**http://localhost:3001/health** and should return `{"status":"ok"}`.
Check the backend terminal for a successful MySQL connection as well; the health
endpoint alone does not verify database access. Stop each process with `Ctrl+C`.

### Alternative ports

If ports 3000/3001 are unavailable, set backend `PORT=3201` and
`FRONTEND_ORIGIN=http://localhost:3200`, set frontend
`VITE_API_URL=http://localhost:3201`, then start the frontend with:

```powershell
npm run dev -- --port 3200
```

Use the same hostname consistently. The frontend browser origin must match
`FRONTEND_ORIGIN`, and `VITE_API_URL` must point to the running backend.

## First use

1. Register an account and sign in. A new database contains no demo accounts or worlds.
2. Create a world. Its creator becomes the Owner; worlds are private by default.
3. Create entities and connect them using custom relationship names.
4. Have collaborators register, then add them through world member management.
5. Authors create drafts and submit proposals. Eligible reviewers inspect and
   approve or reject them. Submitted proposals do not change published content
   until approval.
6. Authors, Managers and Owners can view entity history. Managers and Owners can
   restore earlier content as a new version.
7. Signed-in users can open the AI assistant for accessible context. When editing
   a draft, preview a suggested body revision before applying it. Save and submit
   explicitly when ready.

For role boundaries and review restrictions, see [permissions](docs/PERMISSIONS.md).

## Tests and reports

### Backend

From `backend`:

```powershell
npm test
```

The complete suite creates and drops isolated databases named
`wb_quality_test_<timestamp>` and `wb_permissions_test_<timestamp>`.
Use a **separate local test account** permitted to create/drop those schemas.
An application account restricted to `worldbuilding.*` cannot run these
integration tests. Set `DB_HOST`, `DB_PORT`, `DB_USER` and `DB_PASSWORD` in the
test process environment to select the test server/account without editing the
application's `.env`. Tests load `.env` only for values not already supplied.

The targeted registration regression uses a database substitute and needs no
running MySQL server:

```powershell
node --test test/registration.test.js
```

Actual-provider smoke tests are skipped by default. To opt in from `backend`
with a configured key, run the following in PowerShell:

```powershell
$env:AI_LIVE_SMOKE='1'
$env:AI_LIVE_EDIT_SMOKE='1'
node --test test/assistant-http.test.js
Remove-Item Env:AI_LIVE_SMOKE
Remove-Item Env:AI_LIVE_EDIT_SMOKE
```

These calls use synthetic context and consume provider quota. Passing smoke
tests verify the exercised integration, not general AI answer quality.

### Browser, coverage and frontend checks

From `testing`, with the test database connection configured as above:

```powershell
npm ci
npx playwright install chromium
node scripts/run-backend.cjs
node scripts/frontend-checks.cjs
npm run test:browser
node scripts/verify-cleanup.cjs
```

Run each command separately so a failure remains visible. The browser runner
starts the actual application on ports **3390/3391** with synthetic data in a
`wb_browser_test_<timestamp>` database. Named AI browser scenarios use controlled
replies; separate live smoke tests contact Gemini. Check the cleanup result after
execution, particularly if the browser runner was interrupted.

Generated results include:

- `testing/coverage/index.html`: backend coverage by file and line.
- `testing/playwright-report/index.html`: browser outcomes and attachments.
- `testing/evidence/`: local logs, JUnit results and observations.
- `testing/reports/`: dated English reports and case results retained in the repository.

Dated reports describe their recorded source version. Rerunning tests does not
update the historical report narrative automatically. See the
[test plan](testing/test-plan/TEST_PLAN.md) for scope and acceptance themes.

## Documentation and repository layout

| Location | Contents |
|---|---|
| `backend/` | Express API, sessions, permissions and Gemini integration |
| `backend/database/` | Database schema and one-time migrations |
| `frontend/` | React/vinext interface |
| `testing/` | Browser tests, coverage runner, test plan and dated reports |
| `Meeting_minutes/` | Team and client meeting records |
| [Permissions](docs/PERMISSIONS.md) | Role rules and access boundaries |
| [Editor API](docs/EDITOR_API.md) | Draft, review, entity and version API contracts |
| [AI assistant](docs/AI_ASSISTANT.md) | Context, task templates, limits and suggestion behaviour |
| [Credentials](docs/CREDENTIALS.md) | Configuration, custody and rotation |

## Troubleshooting

- **MySQL connection fails:** start the server and check host, port, credentials,
  database name and grants. Application startup does not initialise the schema.
- **Missing table/column:** check the schema and migration state before applying
  the relevant script. Do not repeat one-time migrations blindly.
- **Sign-in or API requests fail:** confirm both servers are running and the
  browser origin, backend origin setting and frontend API URL agree.
- **AI is unavailable:** check backend key configuration, provider access and
  network connectivity. `npm run check:credentials` in `backend` checks presence
  only and does not send a provider request.
- **Integration tests cannot create databases:** configure a test account/server
  with isolated-schema permissions rather than using the restricted application account.
