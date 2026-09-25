"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import RelationshipEditor from '../../relationship-editor';
import ProposalStatus from '../../proposal-status';
import type { EntityContent } from '../../entity-form';

type Content = EntityContent;

type Proposal = {
  id: number;
  worldId: number;
  entityId: number | null;
  authorId: number;
  action: string;
  status: string;
  revision: number;
  baseVersion: number | null;
  content: Content;
  reviewComment: string | null;
  canReview?: boolean;
};

export default function ProposalWorkspace() {
  const { id } = useParams();

  return <ProposalDetail key={String(id)} />;
}

function ProposalDetail() {
  const { id } = useParams();

  const [p, setP] = useState<Proposal | null>(null);
  const [userId, setUserId] = useState(0);

  const [canWrite, setCanWrite] = useState(false);
  const [canReview, setCanReview] = useState(false);

  const [value, setValue] = useState<Content | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState('');

  const [published, setPublished] = useState<{
    content: Content;
    version: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  /**
   * Reload the latest proposal state from the server.
   *
   * This is used both when the page first opens and after
   * proposal workflow actions such as submit, withdraw,
   * approve and reject.
   */
  const loadProposal = useCallback(async () => {
    setLoading(true);

    try {
      const { user } = await api<{
        user: {
          id: number;
        };
      }>('/auth/me');

      const { proposal } = await api<{
        proposal: Proposal;
      }>(`/api/proposals/${id}`);

      const { world } = await api<{
        world: {
          allowedActions: {
            propose: boolean;
            review: boolean;
          };
        };
      }>(`/api/worlds/${proposal.worldId}`);

      let latestPublished: {
        content: Content;
        version: number;
      } | null = null;

      /*
       * Reload the latest published entity as well.
       *
       * This is important after approval because publishing
       * may update the entity content and version.
       */
      if (proposal.entityId) {
        if (
          !['approved', 'rejected'].includes(proposal.status) ||
          proposal.action !== 'delete'
        ) {
          const context = await api<{
            content: Content;
            baseVersion: number;
          }>(`/api/entities/${proposal.entityId}/edit-context`);

          latestPublished = {
            version: context.baseVersion,
            content: context.content,
          };
        }
      }

      setUserId(user.id);

      setP(proposal);
      setValue(proposal.content);

      setCanWrite(world.allowedActions.propose);
      setCanReview(proposal.canReview === true);

      setPublished(latestPublished);

      setUnavailable(false);
      setError('');

      return true;
    } catch (e) {
      /*
       * A reviewer may receive 404 after the author withdraws
       * the proposal because reviewers cannot access drafts.
       *
       * Remove the old proposal state so stale review controls
       * are no longer displayed.
       */
      if (e instanceof ApiError && e.status === 404) {
        setP(null);
        setValue(null);
        setPublished(null);

        setCanWrite(false);
        setCanReview(false);

        setUnavailable(true);
        setError('');

        return false;
      }

      setError(
        e instanceof Error
          ? e.message
          : 'Could not load proposal'
      );

      return false;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadProposal();
  }, [loadProposal]);

  const editable =
    !!p &&
    canWrite &&
    p.authorId === userId &&
    ['draft', 'rejected'].includes(p.status);

  async function change(action: string) {
    if (!p) return;

    setBusy(true);
    setError('');
    setSaved('');

    try {
      let current = p;

      /*
       * Save the current proposal content first when either
       * saving normally or submitting for review.
       */
      if (action === 'save' || action === 'submit') {
        const result = await api<{
          proposal: Proposal;
        }>(
          `/api/proposals/${id}`,
          'PATCH',
          {
            revision: p.revision,
            baseVersion: p.baseVersion,
            content: value,
          }
        );

        current = result.proposal;

        setP(current);
        setValue(current.content);

        /*
         * Saving a draft does not change the proposal workflow
         * status, so no full reload is required here.
         *
         * This also avoids overwriting local input during a
         * draft revision conflict.
         */
        if (action === 'save') {
          setSaved('Draft saved.');
          return;
        }
      }

      const path =
        ['approve', 'reject'].includes(action)
          ? 'review'
          : action;

      await api<{
        proposal: Proposal;
      }>(
        `/api/proposals/${id}/${path}`,
        'POST',
        {
          revision: current.revision,
          decision: action,
          comment,
        }
      );

      /*
       * Do not rely only on the response returned by the
       * workflow action.
       *
       * Reload the proposal, permissions and published entity
       * from the server so the page always displays the latest
       * server state.
       */
      const refreshed = await loadProposal();

      if (refreshed) {
        if (action === 'submit') {
          setSaved('Proposal submitted for review.');
        } else if (action === 'withdraw') {
          setSaved('Proposal withdrawn.');
        } else if (action === 'approve') {
          setSaved('Proposal approved and published.');
        } else if (action === 'reject') {
          setSaved('Proposal rejected.');
        }
      }
    } catch (e) {
      /*
       * 404 can happen when another user has already changed
       * the proposal state.
       *
       * For example:
       * Author withdraws -> Manager's old review page becomes
       * inaccessible.
       */
      if (e instanceof ApiError && e.status === 404) {
        await loadProposal();
        return;
      }

      /*
       * Workflow state conflicts should reload the latest
       * server state.
       *
       * This removes stale buttons such as Approve / Reject
       * after another user has already changed the proposal.
       */
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        ['submit', 'withdraw', 'approve', 'reject'].includes(action)
      ) {
        const refreshed = await loadProposal();

        if (refreshed) {
          setError(
            'The proposal changed while this page was open. The latest status has been loaded.'
          );
        }

        return;
      }

      /*
       * Do not automatically reload normal draft-save conflicts.
       *
       * Reloading here could replace the user's unsaved input,
       * which belongs to the separate conflict-recovery flow.
       */
      setError(
        e instanceof Error
          ? e.message
          : 'Request failed'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="search-page">
      <section className="search-content workflow-page">

        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p>Loading proposal…</p>
        ) : unavailable ? (
          <div className="workflow-notice">
            <strong>Proposal no longer available</strong>

            <p>
              This proposal may have been withdrawn or changed
              while this page was open.
            </p>
          </div>
        ) : !p || !value ? (
          <p>Could not load proposal.</p>
        ) : (
          <>
            <nav
              className="workflow-nav"
              aria-label="Proposal navigation"
            >
              <Link href={`/worlds/${p.worldId}/workspace`}>
                ← World workspace
              </Link>

              {p.entityId && (
                <Link href={`/entities/${p.entityId}`}>
                  View published entity ↗
                </Link>
              )}
            </nav>

            <header className="workflow-heading">
              <p className="workflow-eyebrow">
                Content review
              </p>

              <h1>
                Proposal #{p.id}
              </h1>

              <p className="workflow-subtitle">
                {value.name || 'Entity deletion'}
              </p>

              <div className="workflow-badges">
                <ProposalStatus status={p.status} />

                <span className="workflow-badge">
                  {p.action} proposal
                </span>

                <span className="workflow-badge">
                  Revision {p.revision}
                </span>

                {p.baseVersion !== null && (
                  <span className="workflow-badge">
                    Based on v{p.baseVersion}
                  </span>
                )}
              </div>
            </header>

            {p.reviewComment && (
              <div className="workflow-notice">
                <strong>
                  Reviewer feedback
                </strong>

                <p>
                  {p.reviewComment}
                </p>
              </div>
            )}

            {published && (
              <details className="workflow-comparison">
                <summary>
                  <span>
                    Compare with published content
                  </span>

                  <span className="workflow-badge">
                    Version {published.version}
                  </span>
                </summary>

                <div className="workflow-comparison-body">
                  <h3>
                    {published.content.name}
                  </h3>

                  <p>
                    {published.content.description}
                  </p>

                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {published.content.body.text}
                  </pre>

                  <RelationshipEditor
                    worldId={p.worldId}
                    entityId={p.entityId ?? undefined}
                    value={
                      published.content.outgoingRelationships
                    }
                    readOnly
                    onChange={() => {}}
                  />
                </div>
              </details>
            )}

            {editable &&
              published &&
              published.version !== p.baseVersion && (
                <div className="status-panel">
                  <p>
                    The published content has changed.
                    Compare it above and resolve differences
                    in your draft before saving.
                  </p>

                  <button
                    disabled={busy}
                    onClick={() =>
                      setP({
                        ...p,
                        baseVersion: published.version,
                      })
                    }
                  >
                    Use version {published.version} as base,
                    keeping my draft
                  </button>
                </div>
              )}

            {p.action !== 'delete' &&
              !editable && (
                <article className="proposal-readonly">
                  <div className="workspace-section-heading">
                    <h2>
                      Proposed content
                    </h2>

                    <span className="workflow-badge">
                      {value.entityType.replaceAll(
                        '_',
                        ' '
                      )}
                    </span>
                  </div>

                  <h3 className="proposal-entity-name">
                    {value.name}
                  </h3>

                  <section className="snapshot-text-section">
                    <h3>
                      Description
                    </h3>

                    <p>
                      {value.description ||
                        'No description.'}
                    </p>
                  </section>

                  <section className="snapshot-text-section">
                    <h3>
                      Content
                    </h3>

                    <p>
                      {value.body?.text ||
                        'No content.'}
                    </p>
                  </section>

                  <RelationshipEditor
                    worldId={p.worldId}
                    entityId={p.entityId ?? undefined}
                    value={
                      value.outgoingRelationships
                    }
                    readOnly
                    onChange={() => {}}
                  />
                </article>
              )}

            {p.action !== 'delete' &&
              editable && (
                <form
                  className="proposal-content-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void change('save');
                  }}
                >
                  <h2>
                    {editable
                      ? 'Edit your proposal'
                      : 'Proposed content'}
                  </h2>

                  <label htmlFor="name">
                    Name
                  </label>

                  <input
                    id="name"
                    maxLength={150}
                    required
                    disabled={!editable || busy}
                    value={value.name}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        name: e.target.value,
                      })
                    }
                  />

                  <label htmlFor="type">
                    Entity type
                  </label>

                  <select
                    id="type"
                    disabled={!editable || busy}
                    value={value.entityType}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        entityType: e.target.value,
                      })
                    }
                  >
                    {[
                      'character',
                      'location',
                      'nation',
                      'organisation',
                      'historical_event',
                      'item',
                      'other',
                    ].map((t) => (
                      <option key={t}>
                        {t}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="description">
                    Short description
                  </label>

                  <textarea
                    id="description"
                    maxLength={10000}
                    disabled={!editable || busy}
                    value={value.description}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        description: e.target.value,
                      })
                    }
                  />

                  <label htmlFor="body">
                    Body (Markdown)
                  </label>

                  <textarea
                    id="body"
                    rows={editable ? 10 : 5}
                    maxLength={200000}
                    disabled={!editable || busy}
                    value={value.body?.text || ''}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        body: {
                          format: 'markdown',
                          text: e.target.value,
                        },
                      })
                    }
                  />

                  <RelationshipEditor
                    worldId={p.worldId}
                    entityId={p.entityId ?? undefined}
                    value={
                      value.outgoingRelationships
                    }
                    disabled={!editable || busy}
                    onChange={(
                      outgoingRelationships
                    ) =>
                      setValue({
                        ...value,
                        outgoingRelationships,
                      })
                    }
                  />

                  {editable && (
                    <button disabled={busy}>
                      Save draft
                    </button>
                  )}
                </form>
              )}

            {saved && (
              <p
                className="workflow-notice success"
                role="status"
              >
                {saved}
              </p>
            )}

            {editable && (
              <button
                disabled={busy}
                onClick={() =>
                  void change('submit')
                }
              >
                Save and submit for review
              </button>
            )}

            {p.status === 'pending' &&
              p.authorId === userId &&
              canWrite && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void change('withdraw')
                  }
                >
                  Withdraw to edit
                </button>
              )}

            {p.status === 'pending' &&
              p.authorId !== userId &&
              canReview && (
                <section className="proposal-review">
                  <p className="workflow-eyebrow">
                    Review decision
                  </p>

                  <h2>
                    Ready to publish?
                  </h2>

                  <p>
                    Accept to publish this proposal,
                    or reject it so the author can
                    revise and resubmit.
                  </p>

                  <label htmlFor="comment">
                    Review comment
                  </label>

                  <textarea
                    id="comment"
                    rows={3}
                    placeholder="Add context for your decision (optional)"
                    value={comment}
                    onChange={(e) =>
                      setComment(e.target.value)
                    }
                  />

                  <div className="workflow-actions">
                    <button
                      className="review-accept"
                      disabled={busy}
                      onClick={() =>
                        void change('approve')
                      }
                    >
                      <span aria-hidden="true">
                        ✓
                      </span>
                      {' '}
                      Accept and publish
                    </button>

                    <button
                      className="review-reject"
                      disabled={busy}
                      onClick={() =>
                        void change('reject')
                      }
                    >
                      <span aria-hidden="true">
                        ✕
                      </span>
                      {' '}
                      Reject / request changes
                    </button>
                  </div>
                </section>
              )}
          </>
        )}
      </section>
    </main>
  );
}