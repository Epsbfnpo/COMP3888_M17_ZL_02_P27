"use client";
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import RelationshipEditor from '../../relationship-editor';
import ProposalStatus from '../../proposal-status';
import type { EntityContent } from '../../entity-form';

type Content = EntityContent;
type Proposal = {id:number;worldId:number;entityId:number|null;authorId:number;action:string;status:string;revision:number;baseVersion:number|null;content:Content;reviewComment:string|null;canReview?:boolean};
type Published = {content:Content;version:number};

async function proposalState(id: string, signal?: AbortSignal) {
  const {proposal} = await api<{proposal:Proposal}>(`/api/proposals/${id}`, 'GET', undefined, signal);
  const {world} = await api<{world:{allowedActions:{propose:boolean;review:boolean}}}>(`/api/worlds/${proposal.worldId}`, 'GET', undefined, signal);
  let published: Published | null = null;
  if (proposal.entityId && (proposal.action !== 'delete' || !['approved','rejected'].includes(proposal.status))) {
    try {
      const context = await api<{content:Content;baseVersion:number}>(`/api/entities/${proposal.entityId}/edit-context`, 'GET', undefined, signal);
      published = {content:context.content,version:context.baseVersion};
    } catch (e) {
      // A deleted entity does not make the proposal itself unavailable.
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
  }
  return {proposal,canWrite:world.allowedActions.propose,published};
}

function recoveredContent(value: unknown): value is Content {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Content>;
  return typeof candidate.name === 'string' && typeof candidate.entityType === 'string' &&
    typeof candidate.description === 'string' && candidate.body?.format === 'markdown' &&
    typeof candidate.body.text === 'string' &&
    (candidate.outgoingRelationships === undefined || Array.isArray(candidate.outgoingRelationships));
}

export default function ProposalWorkspace() {
  const {id} = useParams();
  return <ProposalDetail key={String(id)} id={String(id)} />;
}

function ProposalDetail({id}: {id:string}) {
  const [p,setP] = useState<Proposal|null>(null);
  const [userId,setUserId] = useState(0);
  const [canWrite,setCanWrite] = useState(false);
  const [canReview,setCanReview] = useState(false);
  const [value,setValue] = useState<Content|null>(null);
  const [published,setPublished] = useState<Published|null>(null);
  const [latest,setLatest] = useState<Proposal|null>(null);
  const [recoveryNeeded,setRecoveryNeeded] = useState(false);
  const [storageWarning,setStorageWarning] = useState('');
  const [ready,setReady] = useState(false);
  const [loading,setLoading] = useState(true);
  const [unavailable,setUnavailable] = useState(false);
  const [error,setError] = useState('');
  const [saved,setSaved] = useState('');
  const [busy,setBusy] = useState(false);
  const [comment,setComment] = useState('');
  const storageKey = `worldbuilding-proposal:${userId}:${id}`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const {user} = await api<{user:{id:number}}>('/auth/me','GET',undefined,controller.signal);
        const state = await proposalState(id,controller.signal);
        if (controller.signal.aborted) return;
        setUserId(user.id);setP(state.proposal);setValue(state.proposal.content);
        setCanWrite(state.canWrite);setCanReview(state.proposal.canReview === true);setPublished(state.published);
        if (state.proposal.authorId === user.id) {
          try {
            const raw = sessionStorage.getItem(`worldbuilding-proposal:${user.id}:${id}`);
            if (raw) {
              const local: unknown = JSON.parse(raw);
              if (local && typeof local === 'object' && 'content' in local && recoveredContent(local.content)) {
                setValue(local.content);setLatest(state.proposal);setRecoveryNeeded(true);
                setSaved('Recovered your unsaved input from this tab. Compare it with the latest server draft before saving.');
              }
            }
          } catch {
            setStorageWarning('Local recovery is unavailable. Keep this tab open or copy your input before refreshing.');
          }
        }
        setReady(true);
      } catch (e) {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && [403,404].includes(e.status)) setUnavailable(true);
        else setError(e instanceof Error ? e.message : 'Could not load proposal');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  },[id]);

  const editable = !!p && canWrite && p.authorId === userId && ['draft','rejected'].includes(p.status);
  const dirty = !!p && !!value && p.authorId === userId && JSON.stringify(value) !== JSON.stringify(p.content);
  useEffect(() => {
    if (!ready || !p || !value || p.authorId !== userId) return;
    try {
      if (dirty || recoveryNeeded) sessionStorage.setItem(storageKey,JSON.stringify({content:value}));
      else sessionStorage.removeItem(storageKey);
    } catch {
      queueMicrotask(() => setStorageWarning('Could not back up your input in this tab. Copy it before refreshing.'));
    }
  },[ready,p,value,userId,dirty,recoveryNeeded,storageKey]);
  useEffect(() => {
    if (!dirty && !recoveryNeeded) return;
    const warn = (event:BeforeUnloadEvent) => {event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  },[dirty,recoveryNeeded]);

  async function loadLatest(keepInput = true) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(),15000);
    try {
      const state = await proposalState(id,controller.signal);
      setCanWrite(state.canWrite);setCanReview(state.proposal.canReview === true);setPublished(state.published);
      setUnavailable(false);
      if (keepInput && p?.authorId === userId) {
        setLatest(state.proposal);setRecoveryNeeded(true);
      } else {
        setP(state.proposal);setValue(state.proposal.content);setLatest(null);setRecoveryNeeded(false);
      }
      return true;
    } catch (e) {
      if (e instanceof ApiError && [403,404].includes(e.status)) {
        setCanWrite(false);setCanReview(false);setUnavailable(true);setError('');
        return false;
      }
      if (controller.signal.aborted) throw new Error('Loading the latest content timed out. Your input is preserved. Please retry.');
      throw e;
    } finally {window.clearTimeout(timeout);}
  }

  async function change(action:string) {
    if (!p || busy || recoveryNeeded) return;
    setBusy(true);setError('');setSaved('');
    try {
      let current = p;
      if (action === 'save' || action === 'submit') {
        const result = await api<{proposal:Proposal}>(`/api/proposals/${id}`,'PATCH',{revision:p.revision,baseVersion:p.baseVersion,content:value});
        current = result.proposal;setP(current);setValue(current.content);
        if (action === 'save') {setSaved('Draft saved.');return;}
      }
      const path = ['approve','reject'].includes(action) ? 'review' : action;
      const result = await api<{proposal:Proposal}>(`/api/proposals/${id}/${path}`,'POST',{revision:current.revision,decision:action,comment});
      setP(result.proposal);setValue(result.proposal.content);
      if (await loadLatest(false)) {
        setSaved(action === 'submit' ? 'Proposal submitted for review.' : action === 'withdraw' ? 'Proposal withdrawn.' :
          action === 'approve' ? 'Proposal approved and published.' : 'Proposal rejected.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      if (e instanceof ApiError && [403,404].includes(e.status)) {
        setUnavailable(true);setCanWrite(false);setCanReview(false);setError('');
      } else if (e instanceof ApiError && e.status === 409) {
        const preserve = p.authorId === userId;
        if (preserve) {setRecoveryNeeded(true);setLatest(null);}
        try {
          if (await loadLatest(preserve) && !preserve) setError('The proposal changed while this page was open. The latest status has been loaded.');
        } catch (loadError) {
          setError(`Your input is preserved. Could not load the latest content: ${loadError instanceof Error ? loadError.message : 'Request failed'}`);
        }
      }
    } finally {setBusy(false);}
  }
  return <main className="search-page"><section className="search-content workflow-page">
    {error&&<p className="message error" role="alert">{error}</p>}
    {storageWarning&&<p className="message error" role="alert">{storageWarning}</p>}
    {loading?<p role="status">Loading proposal…</p>:unavailable?<section className="workflow-notice">
      <strong>Proposal no longer available</strong>
      <p>This proposal may have been withdrawn or your access may have changed while this page was open.</p>
      {p&&<Link className="secondary-button" href={`/worlds/${p.worldId}/workspace`}>Back to world workspace</Link>}
      {value&&dirty&&<details><summary>Copy your unsaved input</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(value,null,2)}</pre></details>}
    </section>:!p||!value?<p>Could not load proposal.</p>:<>
      <nav className="workflow-nav" aria-label="Proposal navigation"><Link href={`/worlds/${p.worldId}/workspace`}>← World workspace</Link>
        {p.entityId&&<Link href={`/entities/${p.entityId}`}>View published entity ↗</Link>}</nav>
      <header className="workflow-heading">
        <p className="workflow-eyebrow">Content review</p>
        <h1>Proposal #{p.id}</h1>
        <p className="workflow-subtitle">{value.name || 'Entity deletion'}</p>
        <div className="workflow-badges"><ProposalStatus status={p.status}/>
          <span className="workflow-badge">{p.action} proposal</span><span className="workflow-badge">Revision {p.revision}</span>
          {p.baseVersion!==null&&<span className="workflow-badge">Based on v{p.baseVersion}</span>}</div>
      </header>
      <div className="workflow-actions"><button type="button" className="secondary-button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await loadLatest(dirty||recoveryNeeded);}catch(e){setError(e instanceof Error?e.message:'Could not reload proposal');}finally{setBusy(false);}}}>Reload proposal, keeping unsaved input</button></div>
      {p.reviewComment&&<div className="workflow-notice"><strong>Reviewer feedback</strong><p>{p.reviewComment}</p></div>}
      {recoveryNeeded&&<section className="workflow-notice" aria-label="Conflict recovery">
        <h2>Compare and recover your changes</h2>
        <p>Your input is preserved below. Review the latest server draft and published content, adjust your input, then continue with the latest revision. Nothing is merged or saved automatically.</p>
        <button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await loadLatest();setError('');}catch(e){setError(e instanceof Error?e.message:'Could not load latest draft');}finally{setBusy(false);}}}>{busy?'Loading latest content…':'Reload latest content, keeping my input'}</button>
        {latest&&<>
          <h3>Latest server draft — revision {latest.revision} ({latest.status})</h3>
          <p><strong>Name:</strong> {latest.content.name || 'Entity deletion'}</p>
          <p><strong>Type:</strong> {latest.content.entityType}</p>
          <p><strong>Description:</strong> {latest.content.description}</p>
          <pre style={{whiteSpace:'pre-wrap'}}>{latest.content.body?.text}</pre>
          <RelationshipEditor worldId={latest.worldId} entityId={latest.entityId??undefined} value={latest.content.outgoingRelationships} readOnly onChange={()=>{}} />
          {latest.authorId===userId&&canWrite&&['draft','rejected'].includes(latest.status)?
            <button type="button" disabled={busy} onClick={()=>{setP(latest);setRecoveryNeeded(false);setLatest(null);setError('');setSaved('Latest draft revision selected. Your input is unchanged; review it and save when ready.');}}>I have compared the changes — keep my input and use revision {latest.revision}</button>:
            <p>This proposal is currently {latest.status}. Saving is unavailable. Keep a copy of your input; pending proposals must be withdrawn before editing.</p>}
          {latest.status==='pending'&&latest.authorId===userId&&canWrite&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{const result=await api<{proposal:Proposal}>(`/api/proposals/${id}/withdraw`,'POST',{revision:latest.revision});setLatest(result.proposal);setError('');}catch(e){setError(e instanceof Error?e.message:'Could not withdraw');}finally{setBusy(false);}}}>Withdraw latest proposal, keeping my input</button>}
        </>}
        <details><summary>Copy of your local input</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(value,null,2)}</pre></details>
      </section>}
      {published&&<details className="workflow-comparison"><summary><span>Compare with published content</span><span className="workflow-badge">Version {published.version}</span></summary>
        <div className="workflow-comparison-body">
        <h3>{published.content.name}</h3><p>{published.content.description}</p><pre style={{whiteSpace:'pre-wrap'}}>{published.content.body.text}</pre>
        <RelationshipEditor worldId={p.worldId} entityId={p.entityId??undefined} value={published.content.outgoingRelationships} readOnly onChange={()=>{}} />
        </div>
      </details>}
      {editable&&published&&published.version!==p.baseVersion&&<div className="status-panel">
        <p>The published content has changed. Compare it above and resolve differences in your draft before saving.</p>
        <button disabled={busy||recoveryNeeded} onClick={()=>setP({...p,baseVersion:published.version})}>Use version {published.version} as base, keeping my draft</button>
      </div>}
      {p.action!=='delete'&&!editable&&<article className="proposal-readonly">
        <div className="workspace-section-heading"><h2>Proposed content</h2><span className="workflow-badge">{value.entityType.replaceAll('_',' ')}</span></div>
        <h3 className="proposal-entity-name">{value.name}</h3>
        <section className="snapshot-text-section"><h3>Description</h3><p>{value.description || 'No description.'}</p></section>
        <section className="snapshot-text-section"><h3>Content</h3><p>{value.body?.text || 'No content.'}</p></section>
        <RelationshipEditor worldId={p.worldId} entityId={p.entityId??undefined} value={value.outgoingRelationships} readOnly onChange={()=>{}} />
      </article>}
      {p.action!=='delete'&&editable&&<form className="proposal-content-form" onSubmit={e=>{e.preventDefault();void change('save');}}>
        <h2>{editable?'Edit your proposal':'Proposed content'}</h2>
        <label htmlFor="name">Name</label><input id="name" maxLength={150} required disabled={!editable||busy} value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/>
        <label htmlFor="type">Entity type</label><select id="type" disabled={!editable||busy} value={value.entityType} onChange={e=>setValue({...value,entityType:e.target.value})}>{['character','location','nation','organisation','historical_event','item','other'].map(t=><option key={t}>{t}</option>)}</select>
        <label htmlFor="description">Short description</label><textarea id="description" maxLength={10000} disabled={!editable||busy} value={value.description} onChange={e=>setValue({...value,description:e.target.value})}/>
        <label htmlFor="body">Body (Markdown)</label><textarea id="body" rows={editable?10:5} maxLength={200000} disabled={!editable||busy} value={value.body?.text||''} onChange={e=>setValue({...value,body:{format:'markdown',text:e.target.value}})}/>
        <RelationshipEditor worldId={p.worldId} entityId={p.entityId??undefined} value={value.outgoingRelationships}
          disabled={!editable||busy} onChange={outgoingRelationships=>setValue({...value,outgoingRelationships})} />
        {editable&&<button disabled={busy||recoveryNeeded}>Save draft</button>}
      </form>}
      {saved&&<p className="workflow-notice success" role="status">{saved}</p>}
      {editable&&<button disabled={busy||recoveryNeeded} onClick={()=>void change('submit')}>Save and submit for review</button>}
      {p.status==='pending'&&p.authorId===userId&&canWrite&&<button disabled={busy||recoveryNeeded} onClick={()=>void change('withdraw')}>Withdraw to edit</button>}
      {p.status==='pending'&&p.authorId!==userId&&canReview&&<section className="proposal-review"><p className="workflow-eyebrow">Review decision</p><h2>Ready to publish?</h2><p>Accept to publish this proposal, or reject it so the author can revise and resubmit.</p><label htmlFor="comment">Review comment</label><textarea id="comment" rows={3} placeholder="Add context for your decision (optional)" value={comment} onChange={e=>setComment(e.target.value)}/><div className="workflow-actions"><button className="review-accept" disabled={busy} onClick={()=>void change('approve')}><span aria-hidden="true">✓</span> Accept and publish</button><button className="review-reject" disabled={busy} onClick={()=>void change('reject')}><span aria-hidden="true">✕</span> Reject / request changes</button></div></section>}
    </>}
  </section></main>;
}
