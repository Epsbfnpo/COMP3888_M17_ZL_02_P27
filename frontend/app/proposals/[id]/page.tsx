"use client";
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../api';

type Content={name:string;entityType:string;description:string;body:{format:'markdown';text:string}};
type Proposal={id:number;worldId:number;entityId:number|null;authorId:number;action:string;status:string;revision:number;baseVersion:number|null;content:Content;reviewComment:string|null};
export default function ProposalWorkspace(){
  const {id}=useParams();const [p,setP]=useState<Proposal|null>(null);const [userId,setUserId]=useState(0);
  const [canWrite,setCanWrite]=useState(false);const [canReview,setCanReview]=useState(false);
  const [value,setValue]=useState<Content|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [comment,setComment]=useState('');const [saved,setSaved]=useState('');
  const [published,setPublished]=useState<{content:Content;version:number}|null>(null);
  useEffect(()=>{async function load(){try{
    const {user}=await api<{user:{id:number}}>('/auth/me');setUserId(user.id);
    const {proposal}=await api<{proposal:Proposal}>(`/api/proposals/${id}`);setP(proposal);setValue(proposal.content);
    const {world}=await api<{world:{allowedActions:{propose:boolean;review:boolean}}}>(`/api/worlds/${proposal.worldId}`);
    setCanWrite(world.allowedActions.propose);setCanReview(world.allowedActions.review);
    if(proposal.entityId){
      const response=await api<{entity:{name:string;type:string;description:string;body:Content['body']|null;version:number}}>(`/api/entities/${proposal.entityId}`);
      const e=response.entity;
      setPublished({version:e.version,content:{name:e.name,entityType:e.type,description:e.description||'',body:e.body||{format:'markdown',text:''}}});
    }
  }catch(e){setError(e instanceof Error?e.message:'Could not load proposal');}}void load();},[id]);
  const editable=!!p&&canWrite&&p.authorId===userId&&['draft','rejected'].includes(p.status);
  async function change(action:string){if(!p)return;setBusy(true);setError('');setSaved('');try{
    let current=p;
    if(action==='save'||action==='submit'){
      const result=await api<{proposal:Proposal}>(`/api/proposals/${id}`,'PATCH',{revision:p.revision,baseVersion:p.baseVersion,content:value});
      current=result.proposal;setP(current);setSaved('Draft saved.');
    }
    if(action!=='save'){
      const path=['approve','reject'].includes(action)?'review':action;
      const result=await api<{proposal:Proposal}>(`/api/proposals/${id}/${path}`,'POST',{revision:current.revision,decision:action,comment});
      setP(result.proposal);setValue(result.proposal.content);setSaved('Proposal updated.');
    }
  }catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
  return <main className="search-page"><section className="search-content">
    {error&&<p className="message error" role="alert">{error}</p>}
    {!p||!value?<p>Loading proposal…</p>:<>
      <Link href={`/worlds/${p.worldId}`}>Back to world workspace</Link><h1>Proposal #{p.id}</h1><p>{p.action} · {p.status} · revision {p.revision}</p>
      {p.entityId&&<Link href={`/entities/${p.entityId}`}>View current published entity</Link>}
      {p.reviewComment&&<p>Review: {p.reviewComment}</p>}
      {published&&<details><summary>Compare with published content (version {published.version})</summary>
        <h3>{published.content.name}</h3><p>{published.content.description}</p><pre style={{whiteSpace:'pre-wrap'}}>{published.content.body.text}</pre>
      </details>}
      {editable&&published&&published.version!==p.baseVersion&&<div className="status-panel">
        <p>The published content has changed. Compare it above and resolve differences in your draft before saving.</p>
        <button disabled={busy} onClick={()=>setP({...p,baseVersion:published.version})}>Use version {published.version} as base, keeping my draft</button>
      </div>}
      {p.action!=='delete'&&<form onSubmit={e=>{e.preventDefault();void change('save');}}>
        <label htmlFor="name">Name</label><input id="name" maxLength={150} required disabled={!editable||busy} value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/>
        <label htmlFor="type">Entity type</label><select id="type" disabled={!editable||busy} value={value.entityType} onChange={e=>setValue({...value,entityType:e.target.value})}>{['character','location','nation','organisation','historical_event','item','other'].map(t=><option key={t}>{t}</option>)}</select>
        <label htmlFor="description">Short description</label><textarea id="description" maxLength={10000} disabled={!editable||busy} value={value.description} onChange={e=>setValue({...value,description:e.target.value})}/>
        <label htmlFor="body">Body (Markdown)</label><textarea id="body" rows={14} maxLength={200000} disabled={!editable||busy} value={value.body?.text||''} onChange={e=>setValue({...value,body:{format:'markdown',text:e.target.value}})}/>
        {editable&&<button disabled={busy}>Save draft</button>}
      </form>}
      {saved&&<p role="status">{saved}</p>}
      {editable&&<button disabled={busy} onClick={()=>void change('submit')}>Save and submit for review</button>}
      {p.status==='pending'&&p.authorId===userId&&canWrite&&<button disabled={busy} onClick={()=>void change('withdraw')}>Withdraw to edit</button>}
      {p.status==='pending'&&p.authorId!==userId&&canReview&&<section><h2>Review</h2><label htmlFor="comment">Review comment</label><textarea id="comment" value={comment} onChange={e=>setComment(e.target.value)}/><button disabled={busy} onClick={()=>void change('approve')}>Approve and publish</button> <button disabled={busy} onClick={()=>void change('reject')}>Return for changes</button></section>}
    </>}
  </section></main>;
}
