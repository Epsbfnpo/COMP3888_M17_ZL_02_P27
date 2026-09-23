"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "../../../api";
//import type { OutgoingRelationship } from '../../../relationship-editor';

type SnapshotRelationship = {
  targetEntityId: number;
  targetName?: string;
  relationshipType: string;
  description?: string | null;
  reverseName?: string | null;
};

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
    outgoingRelationships?: SnapshotRelationship[];
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
  const [compareFrom, setCompareFrom] = useState<number | null>(null);
  const [compareTo, setCompareTo] = useState<number | null>(null);
  const [comparedFrom, setComparedFrom] = useState<number | null>(null);
  const [comparedTo, setComparedTo] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api<History>(`/api/entities/${id}/versions`).then(data => {
      if (active) {
        setHistory(data);
        setSelected(data.versions[0]?.version ?? null);

        setCompareTo(data.versions[0]?.version ?? null);
        setCompareFrom(data.versions[1]?.version ?? null);
        setComparedFrom(null);
        setComparedTo(null);
      }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load history"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function reload() {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await api<History>(`/api/entities/${id}/versions`);

      setHistory(data);
      setSelected(data.versions[0]?.version ?? null);

      setCompareTo(data.versions[0]?.version ?? null);
      setCompareFrom(data.versions[1]?.version ?? null);
      setComparedFrom(null);
      setComparedTo(null);
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
      setHistory(data);
      setSelected(result.entity.version);

      setCompareTo(data.versions[0]?.version ?? null);
      setCompareFrom(data.versions[1]?.version ?? null);

      setComparedFrom(null);
      setComparedTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore version");
    } finally { setBusy(false); }
  }

  const version = history?.versions.find(v => v.version === selected);
  const fromVersion = history?.versions.find(v => v.version === comparedFrom);
  const toVersion = history?.versions.find(v => v.version === comparedTo);
  const fromRelationships = fromVersion?.snapshot.outgoingRelationships;
  const toRelationships = toVersion?.snapshot.outgoingRelationships;
  const canCompareRelationships =
    fromRelationships !== undefined &&
    toRelationships !== undefined;
  const relationshipKey = (relationship: SnapshotRelationship) =>
  `${relationship.relationshipType}:${relationship.targetEntityId}`;
  const addedRelationships =
  canCompareRelationships
    ? toRelationships.filter(
        toRelationship =>
          !fromRelationships.some(
            fromRelationship =>
              relationshipKey(fromRelationship) === relationshipKey(toRelationship)
          )
      )
    : [];

  const removedRelationships =
    canCompareRelationships
      ? fromRelationships.filter(
          fromRelationship =>
            !toRelationships.some(
              toRelationship =>
                relationshipKey(fromRelationship) === relationshipKey(toRelationship)
            )
        )
      : [];

const modifiedRelationships =
  canCompareRelationships
    ? toRelationships.filter(toRelationship => {
        const fromRelationship = fromRelationships.find(
          fromRelationship =>
            relationshipKey(fromRelationship) === relationshipKey(toRelationship)
        );

        return (
          fromRelationship !== undefined &&
          (fromRelationship.description ?? "") !==
            (toRelationship.description ?? "")
        );
      })
    : [];

const unchangedRelationships =
  canCompareRelationships
    ? toRelationships.filter(toRelationship => {
        const fromRelationship = fromRelationships.find(
          fromRelationship =>
            relationshipKey(fromRelationship) === relationshipKey(toRelationship)
        );

        return (
          fromRelationship !== undefined &&
          (fromRelationship.description ?? "") ===
            (toRelationship.description ?? "")
        );
      })
    : [];

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
        <div className="management-card version-compare">
          <h2>Compare versions</h2>

          <p>
            Select two recorded versions to review what changed between them.
          </p>

          <div className="version-compare-controls">
            <div className="version-compare-field">
              <label htmlFor="compare-from">From version</label>

              <select
                id="compare-from"
                value={compareFrom ?? ""}
                disabled={busy}
                onChange={e => setCompareFrom(Number(e.target.value))}
              >
                {history.versions.map(v => (
                  <option key={v.id} value={v.version}>
                    v{v.version} - {v.actor_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="version-compare-field">
              <label htmlFor="compare-to">To version</label>

              <select
                id="compare-to"
                value={compareTo ?? ""}
                disabled={busy}
                onChange={e => setCompareTo(Number(e.target.value))}
              >
                {history.versions.map(v => (
                  <option key={v.id} value={v.version}>
                    v{v.version} - {v.actor_name}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="version-compare-button"
              type="button"
              disabled={
                busy ||
                compareFrom === null ||
                compareTo === null ||
                compareFrom === compareTo
              }
              onClick={() => {
                setComparedFrom(compareFrom);
                setComparedTo(compareTo);
              }}
            >
              Compare versions
            </button>
          </div>

          {compareFrom === compareTo && compareFrom !== null && (
            <p>Select two different versions to compare.</p>
          )}
          {fromVersion && toVersion && (
            <div className="version-diff">
              <h3 className="version-diff-title">
                Changes from v{fromVersion.version} → v{toVersion.version}
              </h3>

            <div className="version-diff-section">
              <h4>Name</h4>

              {fromVersion.snapshot.name === toVersion.snapshot.name ? (
                <p>No changes.</p>
              ) : (
              <div className="text-diff">
                <div className="text-diff-before">
                  <strong>Before</strong>
                  <p>{fromVersion.snapshot.name}</p>
                </div>

                <div className="text-diff-after">
                  <strong>After</strong>
                  <p>{toVersion.snapshot.name}</p>
                </div>
              </div>
              )}
            </div>

            <div className="version-diff-section">
              <h4>Description</h4>

              {fromVersion.snapshot.description === toVersion.snapshot.description ? (
                <p>No changes.</p>
              ) : (
              <div className="text-diff">
                <div className="text-diff-before">
                  <strong>Before</strong>
                  <p>{fromVersion.snapshot.description || "No description."}</p>
                </div>

                <div className="text-diff-after">
                  <strong>After</strong>
                  <p>{toVersion.snapshot.description || "No description."}</p>
                </div>
              </div>
              )}
            </div>

            <div className="version-diff-section">
              <h4>Content</h4>

              {fromVersion.snapshot.body?.text === toVersion.snapshot.body?.text ? (
                <p>No changes.</p>
              ) : (
              <div className="text-diff">
                <div className="text-diff-before">
                  <strong>Before</strong>
                  <p>{fromVersion.snapshot.body?.text || "No content."}</p>
                </div>

                <div className="text-diff-after">
                  <strong>After</strong>
                  <p>{toVersion.snapshot.body?.text || "No content."}</p>
                </div>
              </div>
              )}
            </div>
            <div className="version-diff-section">
              <h4>Relationships</h4>

              {!canCompareRelationships ? (
                <p>
                  Relationship comparison is unavailable because one of these versions
                  did not record relationship history.
                </p>
              ) : (
                <>
                  {unchangedRelationships.length > 0 && (
                    <div className="relationship-diff relationship-diff-unchanged">
                      <h5>Unchanged</h5>
                      <ul>
                        {unchangedRelationships.map(relationship => (
                          <li key={relationshipKey(relationship)}>
                            {relationship.relationshipType} →{" "}
                            {relationship.targetName ||
                              `Entity #${relationship.targetEntityId}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {modifiedRelationships.length > 0 && (
                    <div className="relationship-diff relationship-diff-modified">
                      <h5>Modified</h5>

                      <ul>
                        {modifiedRelationships.map(relationship => {
                          const beforeRelationship = fromRelationships?.find(
                            fromRelationship =>
                              relationshipKey(fromRelationship) === relationshipKey(relationship)
                          );

                          return (
                            <li key={relationshipKey(relationship)}>
                              <strong>
                                {relationship.relationshipType} →{" "}
                                {relationship.targetName ||
                                  `Entity #${relationship.targetEntityId}`}
                              </strong>

                              <p>
                                <strong>Before:</strong>{" "}
                                {beforeRelationship?.description || "No description."}
                              </p>

                              <p>
                                <strong>After:</strong>{" "}
                                {relationship.description || "No description."}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {removedRelationships.length > 0 && (
                    <div className="relationship-diff relationship-diff-removed">
                      <h5>Removed</h5>

                      <ul>
                        {removedRelationships.map(relationship => (
                          <li key={relationshipKey(relationship)}>
                            − {relationship.relationshipType} →{" "}
                            {relationship.targetName ||
                              `Entity #${relationship.targetEntityId}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {addedRelationships.length > 0 && (
                    <div className="relationship-diff relationship-diff-added">
                      <h5>Added</h5>

                      <ul>
                        {addedRelationships.map(relationship => (
                          <li key={relationshipKey(relationship)}>
                            + {relationship.relationshipType} →{" "}
                            {relationship.targetName ||
                              `Entity #${relationship.targetEntityId}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {addedRelationships.length === 0 &&
                    removedRelationships.length === 0 &&
                    modifiedRelationships.length === 0 && (
                      <p>No relationship changes.</p>
                    )}
                </>
              )}
            </div>
          </div>
        )}
        </div>        
        <div className="history-selector">
          <label htmlFor="history-version">Select a version</label>
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
                <div className="snapshot-relation-path"><strong>{version.snapshot.name}</strong><span className="snapshot-relation-label">→ {r.relationshipType} →</span><strong>{r.targetName || `Entity #${r.targetEntityId}`}</strong></div>
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
