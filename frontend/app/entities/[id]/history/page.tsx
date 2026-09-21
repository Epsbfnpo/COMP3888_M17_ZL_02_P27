"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "../../../api";
import type { OutgoingRelationship } from '../../../relationship-editor';

type Version = {
  id: number;
  version: number;
  actor_name: string;
  created_at: string;
  snapshot: {
    name: string;
    entity_type: string;
    description: string | null;
    body: { text: string } | null;
    deleted_at: string | null;
    rollback_of_version?: number;
    outgoingRelationships?: OutgoingRelationship[];
  };
};
type History = {
  entity: { id: number; name: string; worldId: number; version: number; deleted: boolean };
  allowedActions: { rollback: boolean };
  versions: Version[];
};

export default function HistoryPage() {
  const { id } = useParams();
  // Reset all selection and request state when navigating between entities.
  return <EntityHistory key={String(id)} id={String(id)} />;
}

function EntityHistory({ id }: { id: string }) {
  const [history, setHistory] = useState<History | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api<History>(`/api/entities/${id}/versions`).then(data => {
      if (active) { setHistory(data); setSelected(data.versions[0]?.version ?? null); }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load history"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function reload() {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await api<History>(`/api/entities/${id}/versions`);
      setHistory(data); setSelected(data.versions[0]?.version ?? null);
    } catch (e) {
      setHistory(null);
      setError(e instanceof Error ? e.message : "Could not load history");
    } finally { setBusy(false); }
  }

  async function restore() {
    if (!history || selected === null || busy) return;
    const recordsRelationships = history.versions.find(v => v.version === selected)?.snapshot.outgoingRelationships !== undefined;
    if (!window.confirm(`Restore version ${selected} as a new published version? Existing history will be kept. ${recordsRelationships ? 'Outgoing relationships will also be restored.' : 'This legacy version has no relationship record; current relationships will be kept.'} Tags and incoming relationships will not change.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ entity: { version: number } }>(`/api/entities/${id}/rollback`, "POST", {
        baseVersion: history.entity.version, targetVersion: selected,
      });
      // Never leave the old baseVersion available after a successful write.
      setHistory(null);
      setMessage(`Version ${selected} restored as version ${result.entity.version}.`);
      const data = await api<History>(`/api/entities/${id}/versions`);
      setHistory(data); setSelected(result.entity.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore version");
    } finally { setBusy(false); }
  }

  const version = history?.versions.find(v => v.version === selected);
  return <main className="search-page"><section className="search-content workflow-page">
    <nav className="workflow-nav" aria-label="History navigation"><Link href={`/entities/${id}`}>← Back to entity</Link>
      {history&&<Link href={`/worlds/${history.entity.worldId}`}>Back to world ↗</Link>}</nav>
    <header className="workflow-heading">
      <p className="workflow-eyebrow">Version history</p>
      <h1>{history ? history.entity.name : 'Entity history'}</h1>
      <p className="workflow-subtitle">Explore earlier versions and restore published content.</p>
    </header>
    {loading && <p role="status">Loading history...</p>}
    {error && <p role="alert" className="message error">{error}</p>}
    {message && <p className="workflow-notice success" role="status">{message}</p>}
    <div className="history-toolbar">
      {history&&<span className="workflow-badge">Current version · v{history.entity.version}{history.entity.deleted?' · Deleted':''}</span>}
      <button className="secondary-button" disabled={busy || loading} onClick={() => void reload()}>Reload history</button>
    </div>
    {history && <>
      <div className="workflow-notice"><strong>Restore without losing history</strong>
        <p>A restore creates a new version with earlier content and recorded outgoing relationships. Tags and incoming relationships stay unchanged.</p></div>
      {history.versions.length === 0 ? <p>No recorded versions yet.</p> : <>
        <div className="history-selector"><label htmlFor="history-version">Select a version</label>
          <select id="history-version" value={selected ?? ""} disabled={busy} onChange={e => setSelected(Number(e.target.value))}>
            {history.versions.map(v => <option key={v.id} value={v.version}>
              v{v.version} - {v.actor_name}{v.snapshot.deleted_at ? " (deleted)" : ""}{v.snapshot.rollback_of_version ? ` (restored from v${v.snapshot.rollback_of_version})` : ""}
            </option>)}
          </select></div>
        {version && <article className="management-card history-snapshot">
          <h2>{version.snapshot.name}</h2>
          <div className="workflow-badges"><span className="workflow-badge">Version {version.version}</span><span className="workflow-badge">{version.snapshot.entity_type.replaceAll('_',' ')}</span>{version.version===history.entity.version&&<span className="workflow-badge status-approved">Current version</span>}{version.snapshot.rollback_of_version&&<span className="workflow-badge">Restored from v{version.snapshot.rollback_of_version}</span>}</div>
          <p className="snapshot-byline">Recorded by {version.actor_name} · {new Date(version.created_at).toLocaleString()}</p>
          <div className="snapshot-text-section"><h3>Description</h3><p>{version.snapshot.description || "No description."}</p></div>
          <div className="snapshot-text-section"><h3>Content</h3><p>{version.snapshot.body?.text || "No content."}</p></div>
          <h3>Outgoing relationships</h3>
          {version.snapshot.outgoingRelationships === undefined ? <p>This legacy version did not record relationships. Restoring it will keep current relationships.</p> :
            version.snapshot.outgoingRelationships.length === 0 ? <p>No outgoing relationships.</p> :
              <ul className="snapshot-relationships">{version.snapshot.outgoingRelationships.map((r, index) => <li key={index}>
                <div className="snapshot-relation-path"><strong>{version.snapshot.name}</strong><span className="snapshot-relation-label">→ {r.type} →</span><strong>{r.targetName || `Entity #${r.targetEntityId}`}</strong></div>
                {r.reverseName && <div className="snapshot-relation-path"><strong>{r.targetName || `Entity #${r.targetEntityId}`}</strong><span className="snapshot-relation-label">→ {r.reverseName} →</span><strong>{version.snapshot.name}</strong></div>}
                {r.description && <p className="snapshot-relation-note">{r.description}</p>}
              </li>)}</ul>}
          {history.allowedActions.rollback && <div className="history-restore"><button
            disabled={busy || version.version >= history.entity.version || !!version.snapshot.deleted_at}
            onClick={() => void restore()}>{busy ? "Please wait..." : `Restore version ${version.version}`}</button>
            <span>{version.version === history.entity.version ? 'You are viewing the current version.' : 'Your confirmation is required before publishing.'}</span></div>}
          {version.snapshot.deleted_at && <p>This is a deletion record. Select a version before deletion to restore content.</p>}
        </article>}
      </>}
    </>}
  </section></main>;
}
