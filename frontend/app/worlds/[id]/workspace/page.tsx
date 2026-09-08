"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, apiFetch, API_URL } from "../../../api";
import EntityForm from "../../../entity-form";

type World = {
  id: number;
  name: string;
  description?: string | null;
  visibility: string;
  role: string | null;
  allowedActions: {
    propose: boolean;
    review: boolean;
    manageMembers: boolean;
    manageWorld: boolean;
    manageEntities: boolean;
  };
};

type Entity = {
  id: number;
  name: string;
  type: string;
  description: string | null;
  world: {
    id: number;
    name: string;
  };
};

type Proposal = {
  id: number;
  revision: number;
  action: string;
  status: string;
  content: { name?: string };
};

type Member = {
  user_id: number;
  username: string;
  role: string;
  status: string;
};

type Candidate = { id: number; username: string; email: string };

export default function WorldWorkspace() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from");
  const entityId = searchParams.get("entityId");

  const [world, setWorld] = useState<World | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatingEntity, setCreatingEntity] = useState(false);

  const [emailQuery, setEmailQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<(Candidate & { worldId: string }) | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);
  const [memberMessage, setMemberMessage] = useState("");
  const [role, setRole] = useState("reader");
  const [memberStatus, setMemberStatus] = useState("approved");
  const [draftMessage, setDraftMessage] = useState("");
  // The API only exposes draft proposals to their author.
  const drafts = proposals.filter(p => p.status === 'draft');
  const submittedProposals = proposals.filter(p => p.status !== 'draft');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState(-1);
  const emailInput = useRef<HTMLInputElement>(null);
  const showCandidates = searchOpen && !selectedUser && candidates.length > 0;

  function selectCandidate(candidate: Candidate) {
    setSelectedUser({ ...candidate, worldId: String(id) });
    setEmailQuery(candidate.email); setCandidates([]); setSearchOpen(false); setActiveCandidate(-1);
    setSearching(false); setSearchError(''); setMemberMessage('');
    const member = members.find(m => m.user_id === candidate.id);
    setRole(member?.role || 'reader'); setMemberStatus(member?.status || 'approved');
  }

  useEffect(() => {
    if (showCandidates && activeCandidate >= 0) {
      document.getElementById(`member-option-${activeCandidate}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeCandidate, showCandidates]);

  useEffect(() => {
    if (!world?.allowedActions.manageMembers || String(world.id) !== String(id) || selectedUser || emailQuery.trim().length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await apiFetch(`${API_URL}/api/worlds/${id}/member-candidates?q=${encodeURIComponent(emailQuery.trim())}`, { signal: controller.signal });
        const data = await response.json() as { users?: Candidate[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Could not search users');
        if (!controller.signal.aborted) { setCandidates(data.users || []); setSearched(true); }
      } catch (e) {
        if (!controller.signal.aborted) setSearchError(e instanceof Error ? e.message : 'Could not search users');
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [emailQuery, selectedUser, id, world]);

  useEffect(() => {
    async function load() {
      setError("");

      try {
        const { world: w } = await api<{ world: World }>(`/api/worlds/${id}`);
        setWorld(w);

        const entityResult = await api<{ results: Entity[] }>(
          `/api/entities/search?q=${encodeURIComponent(w.name)}`
        );

        const worldEntities = entityResult.results.filter(
          entity => Number(entity.world.id) === Number(w.id)
        );

        setEntities(worldEntities);

        if (w.role) {
          try {
            const result = await api<{ proposals: Proposal[] }>(
              `/api/worlds/${id}/proposals`
            );
            setProposals(result.proposals);
          } catch (e) {
            console.error("Could not load proposals:", e);
            setProposals([]);
          }
        }

        if (w.allowedActions.manageMembers) {
          try {
            const result = await api<{ members: Member[] }>(
              `/api/worlds/${id}/members`
            );
            setMembers(result.members);
          } catch (e) {
            console.error("Could not load members:", e);
            setMembers([]);
          }
        }

        setError("");
      } catch (e) {
        setWorld(null);
        setEntities([]);
        setError(e instanceof Error ? e.message : "Could not load world");
      }
    }

    void load();
  }, [id]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");

    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="search-page">
      <section className="search-content">
        
        {from === "entity" && entityId ? (
        <Link href={`/entities/${entityId}`}>
            ← Back to entity
        </Link>
        ) : (
        <Link href={`/worlds/${id}`}>
            ← Back to world
        </Link>
        )}

        {error && <p role="alert" className="message error">{error}</p>}

        {!world ? (
          <p>Loading world…</p>
        ) : (
<>
            <section className="world-overview">
                <p className="step-label">Workspace</p>
                <h1>{world.name} Workspace</h1>
                <p>
                Manage content, proposals, members and world settings.
                </p>
            </section>

            {/* World management */}
            <section className="world-management">
              <p className="step-label">Administration</p>
              <h2>World management</h2>

              {world.allowedActions.manageWorld && (
                <div className="status-panel">
                  <label htmlFor="visibility">World visibility</label>
                  <select
                    id="visibility"
                    disabled={busy}
                    value={world.visibility}
                    onChange={e => void run(async () => {
                      const visibility = e.target.value;

                      await api(`/api/worlds/${id}`, "PATCH", { visibility });
                      setWorld({ ...world, visibility });
                    })}
                  >
                    <option value="private">Private — approved members only</option>
                    <option value="public">Public — anyone can read</option>
                  </select>
                </div>
              )}

              {world.allowedActions.manageEntities && (
                <section className="management-card">
                  <h2>Entities</h2>
                  {entities.map(entity => <p key={entity.id}>
                    <Link href={`/entities/${entity.id}?from=world`}>{entity.name}</Link>
                  </p>)}
                  {creatingEntity ? <EntityForm
                    initial={{ name: '', entityType: 'other', description: '', body: { format: 'markdown', text: '' } }}
                    onCancel={() => setCreatingEntity(false)}
                    onSave={async content => {
                      const result = await api<{ entity: { id: number } }>(`/api/worlds/${id}/entities`, 'POST', { content });
                      setCreatingEntity(false);
                      router.push(`/entities/${result.entity.id}?from=world`);
                    }}
                  /> : <button onClick={() => setCreatingEntity(true)}>New entity</button>}
                </section>
              )}

              {!world.allowedActions.manageEntities && world.allowedActions.propose && (
                <div className="management-actions">
                  <button
                    disabled={busy}
                    onClick={() => void run(async () => {
                      const result = await api<{ proposal: { id: number } }>(
                        `/api/worlds/${id}/proposals`,
                        "POST",
                        {
                          action: "create",
                          content: {
                            name: "Untitled entity",
                            entityType: "other",
                            description: "",
                            body: {
                              format: "markdown",
                              text: "",
                            },
                          },
                        }
                      );

                      router.push(`/proposals/${result.proposal.id}`);
                    })}
                  >
                    New entity proposal
                  </button>
                </div>
              )}

              {/* Proposals */}
              {world.role && (
                <>
                <section className="management-card">
                  <h2>
                    {world.allowedActions.review
                      ? "Proposals"
                      : "Your proposals"}
                  </h2>

                  {submittedProposals.length === 0 ? (
                    <p>No proposals yet.</p>
                  ) : (
                    submittedProposals.map(p => (
                      <p key={p.id}>
                        <Link href={`/proposals/${p.id}`}>
                          {p.content.name || `Proposal #${p.id}`}
                          {" · "}{p.action}{" · "}{p.status}
                        </Link>
                      </p>
                    ))
                  )}
                </section>
                <section className="management-card">
                  <h2>Your drafts</h2>
                  <p>Private drafts you have not submitted. Deleting a draft cannot be undone.</p>
                  {drafts.length === 0 ? <p>No drafts yet.</p> : drafts.map(p => (
                    <div className="workspace-draft-row" key={p.id}>
                      <Link href={`/proposals/${p.id}`}>
                        {p.content.name || `Draft #${p.id}`} · {p.action}
                      </Link>
                      <button type="button" className="workspace-draft-delete" disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Delete draft “${p.content.name || `#${p.id}`}”? This cannot be undone.`)) return;
                          setDraftMessage('');
                          void run(async () => {
                            await api(`/api/proposals/${p.id}`, 'DELETE', { revision: p.revision });
                            setProposals(current => current.filter(item => item.id !== p.id));
                            setDraftMessage('Draft deleted.');
                          });
                        }}>Delete draft</button>
                    </div>
                  ))}
                  {draftMessage && <p role="status">{draftMessage}</p>}
                </section>
                </>
              )}

              {/* Members */}
              {world.allowedActions.manageMembers && (
                <section className="management-card">
                  <h2>Members</h2>

                  <p>
                    Search by email and select a registered user to add or update membership.
                    The owner is managed separately.
                  </p>

                  {members.map(m => (
                    <p key={m.user_id}>
                      #{m.user_id} {m.username} · {m.role} · {m.status}
                    </p>
                  ))}

                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      if (busy || !selectedUser || selectedUser.worldId !== String(id)) return;
                      setMemberMessage("");
                      void run(async () => {
                        await api(
                          `/api/worlds/${id}/members/${selectedUser.id}`,
                          "PUT",
                          { role, status: memberStatus }
                        );

                        const result = await api<{ members: Member[] }>(
                          `/api/worlds/${id}/members`
                        );

                        setMembers(result.members);
                        setMemberMessage(`Membership saved for ${selectedUser.email}.`);
                      });
                    }}
                  >
                    <label htmlFor="member-email">User email</label>
                    <div className="member-search">
                    <input
                      ref={emailInput}
                      id="member-email"
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={showCandidates}
                      aria-controls="member-candidates"
                      aria-activedescendant={showCandidates && activeCandidate >= 0 ? `member-option-${activeCandidate}` : undefined}
                      onFocus={() => setSearchOpen(true)}
                      onBlur={() => { setSearchOpen(false); setActiveCandidate(-1); }}
                      onKeyDown={event => {
                        if (event.key === 'Escape') { event.preventDefault(); setSearchOpen(false); setActiveCandidate(-1); }
                        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !selectedUser && candidates.length) {
                          event.preventDefault(); setSearchOpen(true);
                          setActiveCandidate(current => event.key === 'ArrowDown'
                            ? (current + 1) % candidates.length
                            : (current <= 0 ? candidates.length - 1 : current - 1));
                        }
                        if (event.key === 'Enter' && !selectedUser) {
                          event.preventDefault();
                          if (showCandidates && activeCandidate >= 0) selectCandidate(candidates[activeCandidate]);
                        }
                      }}
                      autoComplete="off"
                      maxLength={100}
                      disabled={busy}
                      placeholder="Enter at least 3 characters of an email"
                      aria-describedby="member-search-help"
                      required
                      value={emailQuery}
                      onChange={e => {
                        setEmailQuery(e.target.value); setSelectedUser(null); setCandidates([]);
                        setSearchError(''); setSearched(false); setSearching(false); setMemberMessage('');
                        setSearchOpen(true); setActiveCandidate(-1);
                      }}
                    />
                    <ul id="member-candidates" role="listbox" aria-label="Matching users" className="member-search-results" hidden={!showCandidates}>
                      {candidates.map((candidate, index) => <li
                        id={`member-option-${index}`} key={candidate.id} role="option"
                        aria-selected={activeCandidate === index}
                        className="member-search-option"
                        onMouseDown={event => event.preventDefault()}
                        onKeyDown={event => {
                          if (!busy && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault(); selectCandidate(candidate);
                          }
                        }}
                        onClick={() => { if (!busy) selectCandidate(candidate); }}
                      >
                        <span className="member-search-avatar" aria-hidden="true">{candidate.username.charAt(0).toUpperCase()}</span>
                        <span className="member-search-identity"><strong>{candidate.email}</strong><span>{candidate.username}</span></span>
                      </li>)}
                    </ul>
                    </div>
                    <p id="member-search-help" className="member-search-hint">Enter at least 3 characters, then select a matching email.</p>
                    {searching && <p role="status" className="member-search-hint">Searching users…</p>}
                    {searchError && <p role="alert" className="message error">{searchError}</p>}
                    {!selectedUser && searched && !searching && candidates.length === 0 && <p role="status">No matching users available to manage.</p>}
                    {selectedUser && selectedUser.worldId === String(id) && <div className="member-search-selected">
                      <span role="status" className="member-search-identity"><span>Selected user</span><strong>{selectedUser.email}</strong><span>{selectedUser.username}</span></span>
                      <button type="button" className="member-search-change" disabled={busy} onClick={() => {
                        setSelectedUser(null); setEmailQuery(''); setCandidates([]); setSearched(false);
                        setSearchError(''); setMemberMessage(''); setActiveCandidate(-1);
                        emailInput.current?.focus();
                      }}>Change</button>
                    </div>}

                    <label htmlFor="member-role">Role</label>
                    <select
                      id="member-role"
                      disabled={busy}
                      value={role}
                      onChange={e => setRole(e.target.value)}
                    >
                      <option value="reader">Reader</option>
                      <option value="author">Author</option>
                      {world.allowedActions.manageWorld && (
                        <option value="manager">Manager</option>
                      )}
                    </select>

                    <label htmlFor="member-status">Status</label>
                    <select
                      id="member-status"
                      disabled={busy}
                      value={memberStatus}
                      onChange={e => setMemberStatus(e.target.value)}
                    >
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="rejected">Rejected</option>
                    </select>

                    <button disabled={busy || !selectedUser || selectedUser.worldId !== String(id)}>Save membership</button>
                    {memberMessage && <p role="status">{memberMessage}</p>}
                  </form>
                </section>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
