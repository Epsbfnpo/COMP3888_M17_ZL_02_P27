# Editor API

Use `frontend/app/api.ts` for requests. Default API: `http://localhost:3001`; current local API: `http://localhost:3201` (frontend: port 3200).

Authenticate with `POST /login`. Send `credentials: 'include'` and JSON for writes. The server determines the author from the session.

## Endpoints

| Method | Path | Request / response |
|---|---|---|
| GET | /api/entities/:id/edit-context | Returns entityId, worldId, baseVersion, content, allowedActions |
| POST | /api/worlds/:worldId/proposals | Create draft: action, content, entityId/baseVersion for edit or delete |
| GET | /api/proposals/:id | Returns `{ proposal }` |
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

Pending proposals are locked. Withdraw returns to draft; saving a rejected proposal also returns it to draft. Only the author can save or submit; another Owner/Manager must review.

Every save and transition requires the latest revision and returns an incremented revision. Send the full content when saving. Serialize autosaves and wait for the final save before submitting.

On HTTP 409:
- Revision conflict: reload the proposal and merge local edits.
- Base-version conflict: reload edit-context, compare published content, and save resolved content with its baseVersion. Withdraw pending proposals first.

Drafts are private to their author. Managers can view submitted proposals. Removed members lose proposal access.

## Errors and integration

Errors use `{ "error": "message" }`: 400 invalid input, 401 sign-in required, 403 forbidden, 404 missing/inaccessible, 409 conflict, 413 oversized, 415 non-JSON.

Use allowedActions for UI controls; the server enforces permissions. Preserve unsaved text on errors. The replaceable editor page is `frontend/app/proposals/[id]/page.tsx`; it currently uses a plain Markdown textarea.
