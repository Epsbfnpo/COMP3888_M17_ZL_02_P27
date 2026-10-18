# AI assistant

The floating assistant uses `/api/ai/chat` to call `gemini-3.8-flash` through the
backend. Keys stay on the server. Opening the panel loads context and configuration
status without calling Google. Sending a message shares selected context, an
explicitly supplied draft snapshot if present, and recent messages with Google;
the UI explains this. No world content is modified.

The launcher is hidden until `/auth/me` confirms a signed-in user. Guests never
see the widget, including on public world and entity pages. Navigation and tab
focus/visibility changes recheck the session; an assistant 401 hides and unmounts
the panel, clearing its page-memory conversation. Backend authentication remains
mandatory independently of widget visibility.

## Conversation templates

Tasks are `general`, `expand`, `consistency` and `relationships`. The backend owns
the shared templates in `backend/assistant-prompts.js`. Responses default to
English; another language is used only when explicitly requested. Existing entity
names are preserved. Explicit length limits and coherent forward/reverse labels
take precedence over unnecessary explanation. The templates also distinguish
absence from the supplied context from absence in the entire world.

The system and task instructions distinguish established facts from proposals
and new suggestions, treat retrieved text/history as untrusted data, and forbid
claims of publishing or editing. Prompt wording is not a security boundary.

## Context and submission

`POST /api/ai/context` accepts `{kind, id, includeBody, includeRelationships,
includeRelated, referenceIds}` and an optional `draft`.
Kinds are `none`, `world`, `entity` and `proposal`. All requests require a session.
World/entity contexts use the normal world-access checks; proposal context reuses
the proposal read guard, including draft privacy and former-member restrictions.
Signed-in users may request advice about content they can read; this grants no
editing or publication permission. Permissions are checked again on submission.

World context includes its name and description, displayed explicitly in Reference
scope. By default it also includes all non-deleted published entities in that world,
including isolated entities, and their valid published relationships. The world
entity inclusion switch can be turned off; relationship and body switches control
their corresponding fields independently. Existing reference text budgets still
apply, so inclusion does not certify a complete world consistency audit. Entity context
includes the saved entity/version and optionally its body and all direct relationships
whose endpoints remain in the same world and are not deleted. Proposal context
contains the saved proposal revision/status and selected content fields, not review
comments or membership/account details. Unpublished proposal relationships are
untrusted proposed values, not confirmed links. The current version is used even
when viewing a history page; selected historical versions are not submitted.

`includeRelated` defaults to true and adds all available direct neighbours, without
the former three-neighbour or five-total-reference cap. Users can search and select
up to five published reference entities. Search returns one shortest published
connection path from the current entity to each result, including intermediate
entity IDs, names and versions. Selecting a result automatically includes these
intermediate entities and the path relationships in the submitted context, even
when automatic neighbours are disabled. World pages and new-entity proposals have
no published starting entity, so no connection path is inferred there.

Paths traverse relationships in either direction but preserve original labels and
direction. Cycles are handled; connectivity does not establish a direct semantic
relationship. Path traversal is bounded to the first 5,000 valid world relationships,
with explicit incomplete-coverage warnings. Deleted and cross-world endpoints are
excluded. No-path results are not proof of disconnection, especially if truncated.

Reference descriptions are bounded to 800 characters and bodies to 1500, with a
combined 24,000-character reference text budget. Selected references get text first;
all included entity identities remain listed even when their text is shortened.
Each reference carries its ID,
name, version and selection source. The body checkbox also controls reference
bodies. Explicit references outside the world, deleted or no longer available fail
closed. Unavailable automatic neighbours are omitted.

`POST /api/ai/search` accepts `{context, q}`. It checks page/world/proposal access,
then performs a parameterised search of published entity names, descriptions,
bodies and tags in that world only. Queries are 2-120 characters; at most 10
matches are returned. There is no draft search, arbitrary SQL or model-driven
autonomous query loop.

## Unsaved draft consistency checks

Entity creation/editing and editable proposals offer **Check consistency with AI**.
This copies the current editor value into page memory, opens the assistant and
prepares the consistency task. It does not save or immediately call Google. Users
can select references before sending. Subsequent edits are not silently included:
click the editor button again for a new snapshot. Removing the snapshot returns to
ordinary saved-page context and clears the conversation.

The context card defaults to a compact summary with its reference count. Expand it
to search references; inclusion switches and request diagnostics are secondary
disclosures. Its collapse control stays outside the scrolling content. Context
changes ask for confirmation when a conversation exists. Draft replacement also
confirms while a request is active. Editor changes or closing the editor mark the
snapshot as out of date; Refresh snapshot takes a new copy of the open editor,
without saving or calling the provider. Replies offer Copy with a fallback message
if clipboard access fails. Failed chat requests retain the input and offer Retry;
retrying is an explicit new provider attempt, not an automatic retry.

The optional `draft` contains `worldId`, optional `entityId`, `proposalId`,
`baseVersion`, `proposalRevision`, and `content` in the editor's normal entity
format. The backend validates scope and contribution permission. Proposal snapshots
require the current user's own editable, non-delete proposal. Another member's
private draft is never included. Saved proposal content, current published entity
baseline and the unsaved candidate remain separate. Stale base versions/revisions
produce explicit warnings; checking never resolves conflicts or publishes content.

Findings should identify the draft passage, cited entity/version and supplied
evidence, distinguish clear/possible conflicts and missing information, and offer
a minimal repair. Differences from the entity's own old published version alone
are not contradictions. Replies report the checked scope, not whole-world approval.

World and entity/proposal/draft descriptions are limited to 2000 characters each, body
text to 6000 and relationship descriptions to 250. Truncation is reported. This is
bounded context assembly, not semantic retrieval or a whole-world consistency check.

`POST /api/ai/preview` accepts:

```json
{
  "task": "consistency",
  "message": "Does the night sailing ban conflict with the port's role?",
  "history": [],
  "context": {
    "kind": "entity",
    "id": 16,
    "includeBody": true,
    "includeRelationships": true
  }
}
```

The preview endpoint remains available for diagnostics without a model request.
The live endpoint accepts the same request structure. The backend reconstructs
context and rechecks access before returning an answer. It returns `mode: "live"`,
the model, reply, context and submitted content for inspection, without system
instructions or keys. Only explicitly whitelisted content fields
are included. Responses use `Cache-Control: no-store` and are not logged or saved.
Messages are limited to 2000 characters; history is limited to 8 user/assistant
messages, 4000 characters each and 16000 combined. The client retains recent turns
only, clears history when changing context, keeps failed input and supports a
50-second client timeout. Provider calls time out after 35 seconds. Chats remain
in page memory and reset on navigation or reload. Long replies are bounded for
subsequent history requests, with an explicit shortening notice. Basic bold/code
formatting is rendered as React text, never injected HTML.

## Usage limits and verification

Each signed-in user is limited to one active request and six attempts per minute.
Failed attempts count. These are in-memory limits for one backend process, not
durable/distributed quotas. There are no automatic provider retries. Navigation or
New chat aborts the local request; provider work already started may incur usage.
Errors are mapped to safe messages without provider details or credentials.

Before remote deployment, add shared usage accounting and global cost controls,
review provider data-handling settings and verify the browser workflow. Accepted
suggestions must later use the existing editor/proposal/version-check workflow.

Run `npm run test:assistant` in `backend` for fixture-based HTTP, context, provider
and usage-limit tests without MySQL or external requests. `AI_LIVE_SMOKE=1` opts in
to a paid real-provider HTTP smoke test using synthetic context. Full `npm test`
also needs a MySQL account able to create/drop an isolated temporary database.
Do not expand the application account's privileges just to run those tests.
