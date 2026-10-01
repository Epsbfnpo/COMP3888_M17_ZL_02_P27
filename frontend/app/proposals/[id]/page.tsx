"use client";
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import RelationshipEditor from '../../relationship-editor';
import ProposalStatus from '../../proposal-status';
import type { EntityContent } from '../../entity-form';

type Content=EntityContent;
type Proposal={id:number;worldId:number;entityId:number|null;authorId:number;action:string;status:string;revision:number;baseVersion:number|null;content:Content;reviewComment:string|null;canReview?:boolean};
export default function ProposalWorkspace(){
  const {id}=useParams();return <ProposalDetail key={String(id)} />;
}
function ProposalDetail(){
  const {id}=useParams();const [p,setP]=useState<Proposal|null>(null);const [userId,setUserId]=useState(0);
  const [canWrite,setCanWrite]=useState(false);const [canReview,setCanReview]=useState(false);
  const [value,setValue]=useState<Content|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [comment,setComment]=useState('');const [saved,setSaved]=useState('');
  const [published,setPublished]=useState<{content:Content;version:number}|null>(null);
  const [latest,setLatest]=useState<Proposal|null>(null);
  const [recoveryNeeded,setRecoveryNeeded]=useState(false);
  const [storageWarning,setStorageWarning]=useState('');
  const [ready,setReady]=useState(false);
  const storageKey=`worldbuilding-proposal:${userId}:${id}`;
  useEffect(()=>{async function load(){try{
    const {user}=await api<{user:{id:number}}>('/auth/me');setUserId(user.id);
    const {proposal}=await api<{proposal:Proposal}>(`/api/proposals/${id}`);setP(proposal);setValue(proposal.content);
    if(proposal.authorId===user.id){
      try {
        const raw=sessionStorage.getItem(`worldbuilding-proposal:${user.id}:${id}`);
        if(raw){
          const local=JSON.parse(raw);
          if(local.content && typeof local.content.name==='string' && typeof local.content.entityType==='string' && typeof local.content.description==='string' && local.content.body?.format==='markdown' && typeof local.content.body.text==='string'){
            setValue(local.content);
            setSaved('Recovered your unsaved input from this tab. Compare it with the latest server draft before saving.');
            setLatest(proposal);setRecoveryNeeded(true);
          }
        }
      }catch{setStorageWarning('Local recovery is unavailable. Keep this tab open or copy your input before refreshing.');}
    }
    setReady(true);
    const {world}=await api<{world:{allowedActions:{propose:boolean;review:boolean}}}>(`/api/worlds/${proposal.worldId}`);
    setCanWrite(world.allowedActions.propose);setCanReview(proposal.canReview===true);
    if(proposal.entityId){
      if(!['approved','rejected'].includes(proposal.status)||proposal.action!=='delete'){
        const context=await api<{content:Content;baseVersion:number}>(`/api/entities/${proposal.entityId}/edit-context`);
        setPublished({version:context.baseVersion,content:context.content});
      }
    }
  }catch(e){setError(e instanceof Error?e.message:'Could not load proposal');}}void load();},[id]);
  const editable=!!p&&canWrite&&p.authorId===userId&&['draft','rejected'].includes(p.status);
  const dirty=!!p&&!!value&&p.authorId===userId&&JSON.stringify(value)!==JSON.stringify(p.content);
  useEffect(()=>{
    if(!ready||!p||!value||p.authorId!==userId)return;
    try{
      if(dirty||recoveryNeeded)sessionStorage.setItem(storageKey,JSON.stringify({content:value}));
      else sessionStorage.removeItem(storageKey);
    }catch{queueMicrotask(()=>setStorageWarning('Could not back up your input in this tab. Copy it before refreshing.'));}
  },[ready,p,value,userId,dirty,recoveryNeeded,storageKey]);
  useEffect(()=>{
    if(!dirty&&!recoveryNeeded)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty,recoveryNeeded]);
  async function loadLatest(){
    // Fetch separately from editor state: never replace the user's input.
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),15000);
    try{
    const {proposal}=await api<{proposal:Proposal}>(`/api/proposals/${id}`,'GET',undefined,controller.signal);
    setLatest(proposal);
    setCanReview(proposal.canReview===true);
    if(proposal.entityId){
      const context=await api<{content:Content;baseVersion:number}>(`/api/entities/${proposal.entityId}/edit-context`,'GET',undefined,controller.signal);
      setPublished({version:context.baseVersion,content:context.content});
    }
    }catch(e){
      if(controller.signal.aborted)throw new Error('Loading the latest content timed out. Your input is preserved. Please retry.');
      throw e;
    }finally{window.clearTimeout(timeout);}
  }
  async function change(action:string){if(!p||busy||recoveryNeeded)return;setBusy(true);setError('');setSaved('');try{
    let current=p;
    if(action==='save'||action==='submit'){
      const result=await api<{proposal:Proposal}>(`/api/proposals/${id}`,'PATCH',{revision:p.revision,baseVersion:p.baseVersion,content:value});
      current=result.proposal;setP(current);setValue(current.content);setSaved('Draft saved.');
    }
    if(action!=='save'){
      const path=['approve','reject'].includes(action)?'review':action;
      const result=await api<{proposal:Proposal}>(`/api/proposals/${id}/${path}`,'POST',{revision:current.revision,decision:action,comment});
      setP(result.proposal);setValue(result.proposal.content);setSaved('Proposal updated.');
    }
  }catch(e){
    setError(e instanceof Error?e.message:'Request failed');
    if(e instanceof ApiError&&e.status===409){
      setRecoveryNeeded(true);setLatest(null);
      try{await loadLatest();}catch(loadError){setError(`Your input is preserved. Could not load the latest content: ${loadError instanceof Error?loadError.message:'Request failed'}`);}
    }
  }finally{setBusy(false);}}
  return <main className="search-page"><section className="search-content workflow-page">
    {error&&<p className="message error" role="alert">{error}</p>}
    {storageWarning&&<p className="message error" role="alert">{storageWarning}</p>}
    {!p||!value?<p>Loading proposal…</p>:<>
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
