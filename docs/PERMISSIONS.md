# Permissions

Worlds are `public` or `private` (default). Public content is readable by anyone; private content requires approved membership. Entities and relationships inherit world access; there is no entity-level ACL.

Owner comes from `worlds.owner_id`. Other roles use `world_members`; only approved memberships grant access.

| Operation | Owner | Manager | Author | Reader |
|---|---|---|---|---|
| Read accessible content | Yes | Yes | Yes | Yes |
| Save drafts and submit proposals | Yes | Yes | Yes | No |
| Review others' proposals / directly update entities | Yes | Yes | No | No |
| Directly create or delete entities | Yes | No | No | No |
| Manage Readers and Authors | Yes | Yes | No | No |
| Assign Managers / change visibility / transfer or delete world | Yes | No | No | No |

Drafts are author-only. Submitted proposals are visible to their author and world managers. Self-review is forbidden. Managers cannot change themselves, other Managers, or the Owner.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | /auth/me | Current session user |
| POST | /logout | Revoke session; send `{}` |
| GET / POST | /api/worlds | List accessible worlds / create |
| GET / PATCH / DELETE | /api/worlds/:id | Read / update / delete |
| POST | /api/worlds/:id/transfer | Transfer to approved member: `{ userId }` |
| GET | /api/worlds/:id/members | List members for managers |
| GET | /api/worlds/:id/member-candidates?q= | Owner/Manager email-prefix search, 3–100 characters, up to 10 users |
| PUT / DELETE | /api/worlds/:id/members/:userId | Update / remove membership |
| GET | /api/users/:id/worlds | Own memberships only |
| PATCH | /api/entities/:id | Direct update: `{ baseVersion, content }` |
| POST | /api/worlds/:worldId/entities | Owner creates and publishes immediately: `{ content }` |
| DELETE | /api/entities/:id | Owner soft-deletes immediately: `{ baseVersion }` |
| GET | /api/entities/:id/versions | Version history for managers |

Membership updates use `{ role, status }`; status is pending, approved, or rejected. World deletion requires `{ confirmName }`. Transfer makes the previous Owner a Manager.

The membership form searches registered users by email, then uses the selected user's ID with the existing membership endpoint. Search excludes the Owner and current user; Managers also cannot search other Managers in that world. Existing manageable members remain searchable for updates. Email matching treats wildcard characters literally. Unregistered emails do not create accounts or send invitations.

Sessions use MySQL-backed, seven-day HttpOnly cookies. Writes require JSON and validate Origin. Search, tags, entity details, and relationships enforce world access. Entity deletion is soft; publishing checks versions in a transaction.

Proposal contracts: [EDITOR_API.md](EDITOR_API.md).

## Setup

For a new database, run `schema.sql`, `worldbuilding_schema.sql`, then `permissions.sql` from `backend/database/`. Existing databases need only the last migration, once, after backup.

The local database was migrated on 2026-09-05. Existing worlds became private; contributors became authors. Sign in again to obtain a session.

Current local startup uses ports 3200/3201 because Windows reserves 3000/3001:

```powershell
# In backend/
$env:PORT='3201'
$env:FRONTEND_ORIGIN='http://localhost:3200'
npm.cmd start
```

```powershell
# In frontend/
$env:VITE_API_URL='http://localhost:3201'
npm.cmd run dev -- --port 3200
```

FRONTEND_ORIGIN must match the browser origin. VITE_API_URL is a build-time setting.

## Checks and limits

Backend: `npm test` requires a MySQL account permitted to create and drop temporary test databases. Frontend: `npm run lint`, `npm exec tsc -- --noEmit`, `npm run build`.

Owners can create entities in the world workspace and edit or delete them on the entity detail page without proposals. Direct writes retain version history and reject stale baseVersion values. The API exposes this owner capability as allowedActions.manageEntities; existing Manager direct-edit API permission remains unchanged.

Rich-text editing, realtime collaboration, relationship proposals, attachments, automatic merging, and rollback UI are out of scope. World transfer, world deletion, and member removal currently have API support without full UI.
