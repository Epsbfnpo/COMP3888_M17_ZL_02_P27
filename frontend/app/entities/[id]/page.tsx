"use client";

import { apiFetch, api, API_URL } from "../../api";
import EntityForm, { type EntityContent } from "../../entity-form";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";


type Entity = {
  id: number;
  name: string;
  type: string;
  description: string;
  body?: { format: string; text: string };
  allowedActions: { propose: boolean; edit: boolean; manageEntities: boolean; viewHistory: boolean };
  version: number;
  created_at: string;
  updated_at: string;

  world: {
    id: number;
    name: string;
  };

  creator: {
    id: number;
    username: string;
  } | null;

  tags: string[];

  relationships: {
    id: number;
    type: string;
    description: string;
    direction: "incoming" | "outgoing";
    reverseName?: string | null;

    entity: {
        id: number;
        name: string;
        type: string;
    };
  }[];

};

function getRelationshipLabel(type: string, direction: "incoming" | "outgoing", reverseName?: string | null) {
  return direction === 'outgoing' ? type : reverseName || `${type} → this entity`;
}

export default function EntityPage() {
  const params = useParams();
  return <EntityDetail key={String(params.id)} />;
}

function EntityDetail() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const [creating, setCreating] = useState(false);
  const [proposalError, setProposalError] = useState("");
  async function propose() {
    setCreating(true);
    try {
      const context = await api<{ worldId: number; baseVersion: number; content: unknown }>(`/api/entities/${id}/edit-context`);
      const result = await api<{ proposal: { id: number } }>(`/api/worlds/${context.worldId}/proposals`, "POST", { action: "edit", entityId: Number(id), baseVersion: context.baseVersion, content: context.content });
      router.push(`/proposals/${result.proposal.id}`);
    } catch (e) { setProposalError(e instanceof Error ? e.message : "Could not create draft"); }
    finally { setCreating(false); }
  }
  const id = params.id;

  const [entity, setEntity] = useState<Entity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [saved, setSaved] = useState("");
  const [editContent, setEditContent] = useState<EntityContent | null>(null);

  async function startEditing() {
    setActionError(''); setSaved('');
    try {
      const context = await api<{content: EntityContent; baseVersion: number}>(`/api/entities/${id}/edit-context`);
      setEditContent(context.content);
      setEntity(current => current ? {...current, version: context.baseVersion} : current);
      setEditing(true);
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Could not load edit context'); }
  }

  async function saveEntity(content: EntityContent) {
    if (!entity) return;
    await api<{ entity: { version: number } }>(`/api/entities/${entity.id}`, "PATCH", {
      baseVersion: entity.version, content,
    });
    setEditing(false);
    setSaved("Entity published.");
    const result = await api<{entity: Entity}>(`/api/entities/${entity.id}`);
    setEntity(result.entity);
  }

  async function deleteEntity() {
    if (!entity || deleting || !window.confirm(`Delete entity “${entity.name}”? It will be removed from this world.`)) return;
    setDeleting(true);
    setActionError("");
    try {
      await api(`/api/entities/${entity.id}`, "DELETE", { baseVersion: entity.version });
      router.push(`/worlds/${entity.world.id}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not delete entity");
      setDeleting(false);
    }
  }

  useEffect(() => {
    async function loadEntity() {
      try {
        const response = await apiFetch(`${API_URL}/api/entities/${id}`);

        const data = (await response.json()) as {
          entity?: Entity;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Could not load entity");
        }

        setEntity(data.entity || null);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load entity"
        );
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      void loadEntity();
    }
  }, [id]);

  if (isLoading) {
    return (
      <main className="search-page">
        <p className="status-panel">Loading entity…</p>
      </main>
    );
  }

  if (error || !entity) {
    return (
      <main className="search-page">
        <p className="status-panel error">
          {error || "Entity not found"}
        </p>

        <Link href="/search">Back to search</Link>
        <p><Link className="ui-action-link" href={`/entities/${id}/history`}>Check version history (members only)</Link></p>
      </main>
    );
  }

  return (
    <main className="search-page">
      <header className="search-header">
        <Link href="/home" className="brand-link">
          <strong>Worldbuilding</strong>
          <span>Collaborative world atlas</span>
        </Link>

        <Link href="/search">Search</Link>
      </header>

      <section className="search-content">
      {from === "world" ? (
        <Link
          href={`/worlds/${entity.world.id}`}
          className="entity-back-link"
        >
          ← Back to {entity.world.name}
        </Link>
      ) : (
        <Link href="/search" className="entity-back-link">
          ← Back to search
        </Link>
      )}

        <div className="entity-title-block">
            <p className="eyebrow">
                {entity.type.replaceAll("_", " ")}
            </p>

            <h1>{entity.name}</h1>
        </div>

        <p className="search-intro">
          {entity.description || "No description has been added yet."}
        </p>

        {entity.allowedActions.viewHistory && <div className="entity-history-entry"><div><strong>Version history</strong><span>Current version: v{entity.version} · Browse earlier content and recorded relationships.</span></div><Link className="ui-action-link history-entry-button" href={`/entities/${entity.id}/history`}><span aria-hidden="true">↶</span> View version history</Link></div>}
        {entity.body?.text && <p style={{ whiteSpace: "pre-wrap" }}>{entity.body.text}</p>}
        <section className="entity-actions-panel" aria-label="Entity actions">
          <div className="entity-actions-heading"><div><p className="workflow-eyebrow">Workspace tools</p><h2>Entity actions</h2></div><Link className="ui-action-link" href={`/worlds/${entity.world.id}/workspace?from=entity&entityId=${entity.id}`}>World workspace <span aria-hidden="true">→</span></Link></div>
        {entity.allowedActions.manageEntities && (
          <div className="entity-edit-controls">
            {editing && editContent ? <EntityForm
              worldId={entity.world.id} entityId={entity.id}
              initial={editContent}
              onSave={saveEntity}
              onCancel={() => setEditing(false)}
            /> : <div className="entity-action-buttons">
              <button disabled={deleting} onClick={() => void startEditing()}>Edit entity</button>
              <button className="danger-outline-button" disabled={deleting} onClick={() => void deleteEntity()}>{deleting ? 'Deleting…' : 'Delete entity'}</button>
            </div>}
            {actionError && <p role="alert" className="message error">{actionError}</p>}
            {saved && <p role="status">{saved}</p>}
          </div>
        )}
        {!entity.allowedActions.manageEntities && entity.allowedActions.propose && <button disabled={creating} onClick={propose}>Propose a change</button>}
        {proposalError && <p role="alert">{proposalError}</p>}
        </section>
        <div className="entity-card">
            <div className="entity-meta">
                <span>World</span>
                <span>{entity.world.name}</span>
            </div>

            {entity.creator && (
                <p>
                Created by <strong>{entity.creator.username}</strong>
                {" · "}
                {new Date(entity.created_at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                })}
                </p>
            )}

            {entity.tags.length > 0 && (
                <div className="entity-tags">
                {entity.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                ))}
                </div>
            )}

            {entity.relationships.length > 0 && (
                <section className="entity-relationships">
                <p className="eyebrow">Relationships</p>

                <div className="relationship-list">
                    {entity.relationships.map((relationship) => {
                    const relationshipLabel = getRelationshipLabel(
                        relationship.type,
                        relationship.direction,
                        relationship.reverseName
                    );

                    return (
                        <Link
                        href={`/entities/${relationship.entity.id}?from=${from || "search"}`}
                        className="relationship-card"
                        key={relationship.id}
                        >
                        <div>
                            <span className="relationship-type">
                            {relationshipLabel}
                            </span>

                            <h3>{relationship.entity.name}</h3>
                            <p>{relationship.reverseName ? 'Two-way relationship' : 'One-way relationship'}{relationship.direction === 'incoming' ? ` · Managed from ${relationship.entity.name}` : ''}</p>
                            {relationship.description && <p>{relationship.description}</p>}

                            <span className="relationship-entity-type">
                            {relationship.entity.type.replaceAll("_", " ")}
                            </span>
                        </div>

                        <span className="relationship-arrow">→</span>
                        </Link>
                    );
                    })}
                </div>
                </section>
            )}
            </div>
    </section>
    </main>
  );
}
