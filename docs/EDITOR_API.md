# Editor API

Use `frontend/app/api.ts` for requests. Default API: `http://localhost:3001`; current local API: `http://localhost:3201` (frontend: port 3200).

Authenticate with `POST /login`. Send `credentials: 'include'` and JSON for writes. The server determines the author from the session.

## Endpoints

| Method | Path | Request / response |
|---|---|---|
| GET | /api/entities/:id/edit-context | Returns entityId, worldId, baseVersion, content, allowedActions |
| POST | /api/worlds/:worldId/proposals | Create draft: action, content, entityId/baseVersion for edit or delete |
| GET | /api/proposals/:id | Returns `{ proposal }` |
| DELETE | /api/proposals/:id | Permanently delete your own draft: `{ revision }`; returns `{ message }` |
| PATCH | /api/proposals/:id | Save draft: revision, full content, baseVersion |
| POST | /api/proposals/:id/submit | `{ revision }` |
| POST | /api/proposals/:id/withdraw | `{ revision }` |
| POST | /api/proposals/:id/review | `{ revision, decision: "approve" or "reject", comment }` |
| GET | /api/worlds/:worldId/proposals | Returns `{ proposals: [...] }`, filtered by role |

Create returns HTTP 201; other successful proposal operations return HTTP 200. Single-proposal responses use `{ proposal }`.

## Payload

Example: create an edit proposal.

```json
{
  "action": "edit",
  "entityId": 42,
  "baseVersion": 7,
  "content": {
    "name": "Mara Venn",
    "entityType": "character",
    "description": "A courier",
    "body": { "format": "markdown", "text": "## Background\nStory content" }
  }
}
```

- Actions: `create | edit | delete`. Create omits entityId/baseVersion; delete omits content.
- Entity types: `character | location | nation | organisation | historical_event | item | other`.
- Limits: name required, 150 characters; description 10,000; body.text 200,000; request 1 MB.
- Proposal fields: id, worldId, entityId, authorId, action, content, status, revision, baseVersion, reviewComment, reviewedBy, createdAt, updatedAt.
- New drafts have `status: "draft"` and `revision: 1`; create proposals have `baseVersion: null`.

## Lifecycle and saving

`draft -> pending -> approved / rejected`

Pending proposals are locked. Withdraw returns to draft; saving a rejected proposal also returns it to draft. Only the author can save or submit. Managers may review current Authors' proposals; Manager proposals require the Owner. Self-review is always forbidden. GET proposal returns a server-computed `canReview` flag; use it for review controls rather than the world's general review capability.

Every save and transition requires the latest revision and returns an incremented revision. Send the full content when saving. Serialize autosaves and wait for the final save before submitting.

On HTTP 409:
- Revision conflict: reload the proposal and merge local edits.
- Base-version conflict: reload edit-context, compare published content, and save resolved content with its baseVersion. Withdraw pending proposals first.

Drafts are private to their author. Managers can view submitted proposals. Removed members lose proposal access.
Only the author with current world membership can delete a draft, using its latest revision. Pending, approved and rejected proposals cannot be deleted. Withdraw a pending proposal before deleting it. The workspace separates submitted proposals from your private drafts.

## Version history and rollback

- `GET /api/entities/:id/versions`: Owner/Manager/Author only. Returns `{ entity: { id, name, worldId, version, deleted }, allowedActions, versions }`. Versions are newest first, with parsed `snapshot`, `actor_id`, `actor_name`, `proposal_id` and `created_at`. Old entities may have no snapshots until their first versioned write.
- `POST /api/entities/:id/rollback`: Owner/Manager only. Send `{ baseVersion, targetVersion }` as positive JSON integers. Returns `{ entity: { id, version, restoredFromVersion } }`.
- Rollback copies the selected earlier snapshot's name, type, description, body and recorded outgoing relationships into a new version. Tags and incoming relationships are unchanged. Legacy snapshots without `outgoingRelationships` preserve current relations. A deleted entity can be restored from a non-deleted snapshot; deletion snapshots cannot be restored. Unavailable relationship targets cause 409 with no partial changes.
- History is immutable. The new snapshot includes `rollback_of_version`; `actor_id` identifies who restored it. No database migration is needed.
- Stale `baseVersion` returns 409 without writing. Reload history and confirm the target again. Pending proposals are not rebased automatically and still face version checks when reviewed.
- UI flags: `allowedActions.viewHistory` and `allowedActions.rollback`. Public visibility alone grants neither capability.

## Relationships

Entity content optionally includes `outgoingRelationships: [{ targetEntityId, type, reverseName, description }]`. `type` is a custom display name (legacy field name), not an enum. A null/omitted `reverseName` means one-way; a custom reverse name means two-way. Use identical names for a symmetric relationship. Edit-context includes existing outgoing relationships and target names. Owner direct writes and proposal publishing share the same validation and transaction.

- Omitted field: preserve relationships. On a draft save, preserve the draft's existing relationship changes. Explicit `[]`: remove all outgoing relationships on publication.
- Maximum 50 rows; positive integer target ID; names 1-100 characters, trimmed and NFC-normalized with repeated spaces collapsed. Case and punctuation are preserved; control characters are rejected. Description up to 10,000 characters.
- One database row owns both directions. Only the source entity's workflow edits/deletes/restores it; the target shows the reverse label, not a separately editable copy. Old snapshots without a reverse name restore a one-way relationship.
- Existing installations: run `backend/database/relationship_names.sql` once before starting the updated backend. Fresh installations use the updated schema. Existing names and snapshots are not rewritten.
- Same-world, non-deleted targets only. No self-links or duplicate target/type pairs. Targets are checked on draft save, submit, publish and rollback.
- `GET /api/worlds/:worldId/relationship-targets?q=...&selected=1,2`: Owner/Manager/Author only; searches entity names in that world. Optional selected IDs stay in the results, up to 50 IDs; at most 100 results total. Returns `{ entities: [{ id, name, type }] }`.
- New snapshots include outgoing relationships and captured target names. Names are for display; target IDs define the relationship. All relationship changes increment the source entity's version, not the target's.
- `content.requiresOwnerReview` is server-managed proposal metadata, not an editor input. Clients cannot clear the requirement.

## Errors and integration

Errors use `{ "error": "message" }`: 400 invalid input, 401 sign-in required, 403 forbidden, 404 missing/inaccessible, 409 conflict, 413 oversized, 415 non-JSON.

Use allowedActions for UI controls; the server enforces permissions. Preserve unsaved text on errors. The replaceable editor page is `frontend/app/proposals/[id]/page.tsx`; it currently uses a plain Markdown textarea.
