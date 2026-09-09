"use client";

import { useState } from "react";

export type EntityContent = {
  name: string;
  entityType: string;
  description: string;
  body: { format: "markdown"; text: string };
};

export default function EntityForm({ initial, onSave, onCancel }: {
  initial: EntityContent;
  onSave: (content: EntityContent) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try { await onSave(value); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save entity"); }
    finally { setBusy(false); }
  }}>
    <label htmlFor="entity-name">Name</label>
    <input id="entity-name" required maxLength={150} disabled={busy} value={value.name}
      onChange={e => setValue({ ...value, name: e.target.value })} />
    <label htmlFor="entity-type">Entity type</label>
    <select id="entity-type" disabled={busy} value={value.entityType}
      onChange={e => setValue({ ...value, entityType: e.target.value })}>
      {['character', 'location', 'nation', 'organisation', 'historical_event', 'item', 'other'].map(type =>
        <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
    </select>
    <label htmlFor="entity-description">Short description</label>
    <textarea id="entity-description" rows={3} maxLength={10000} disabled={busy} value={value.description}
      onChange={e => setValue({ ...value, description: e.target.value })} />
    <label htmlFor="entity-body">Body (Markdown)</label>
    <textarea id="entity-body" rows={12} maxLength={200000} disabled={busy} value={value.body.text}
      onChange={e => setValue({ ...value, body: { format: 'markdown', text: e.target.value } })} />
    {error && <p className="message error" role="alert">{error}</p>}
    <div className="edit-profile-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button disabled={busy}>{busy ? 'Saving…' : 'Save and publish'}</button>
    </div>
  </form>;
}
