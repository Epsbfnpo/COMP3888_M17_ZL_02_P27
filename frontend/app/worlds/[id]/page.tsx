"use client";
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../api';

type World = { id: number; name: string; visibility: string; role: string | null; allowedActions: { propose: boolean; review: boolean; manageMembers: boolean; manageWorld: boolean } };
type Proposal = { id: number; action: string; status: string; content: { name?: string } };
type Member = { user_id: number; username: string; role: string; status: string };

export default function WorldWorkspace() {
  const { id } = useParams(); const router = useRouter();
  const [world,setWorld]=useState<World|null>(null);
  const [proposals,setProposals]=useState<Proposal[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [userId,setUserId]=useState(''); const [role,setRole]=useState('reader');
  const [memberStatus,setMemberStatus]=useState('approved');
  useEffect(()=>{
    async function load() {
      try {
        const {world:w}=await api<{world:World}>(`/api/worlds/${id}`);setWorld(w);
        if(w.role) setProposals((await api<{proposals:Proposal[]}>(`/api/worlds/${id}/proposals`)).proposals);
        if(w.allowedActions.manageMembers) setMembers((await api<{members:Member[]}>(`/api/worlds/${id}/members`)).members);
      } catch(e) {setError(e instanceof Error?e.message:'Could not load workspace');}
    }
    void load();
  },[id]);
  async function run(work:()=>Promise<void>) {
    setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}
  }
  return <main className="search-page"><section className="search-content">
    <Link href="/home">Back to worlds</Link>
    {error&&<p role="alert" className="message error">{error}</p>}
    {!world?<p>Loading world…</p>:<>
      <h1>{world.name}</h1><p>{world.visibility} · {world.role||'visitor'}</p>
      <Link href={`/search?q=${encodeURIComponent(world.name)}`}>Browse entities</Link>
      {world.allowedActions.manageWorld&&<div className="status-panel">
        <label htmlFor="visibility">World visibility</label>
        <select id="visibility" disabled={busy} value={world.visibility} onChange={e=>void run(async()=>{
          const visibility=e.target.value;await api(`/api/worlds/${id}`,'PATCH',{visibility});setWorld({...world,visibility});
        })}><option value="private">Private — approved members only</option><option value="public">Public — anyone can read</option></select>
      </div>}
      {world.allowedActions.propose&&<button disabled={busy} onClick={()=>void run(async()=>{
        const result=await api<{proposal:{id:number}}>(`/api/worlds/${id}/proposals`,'POST',{action:'create',content:{name:'Untitled entity',entityType:'other',description:'',body:{format:'markdown',text:''}}});
        router.push(`/proposals/${result.proposal.id}`);
      })}>New entity proposal</button>}
      {world.role&&<section><h2>{world.allowedActions.review?'Proposals and your drafts':'Your proposals'}</h2>
        {proposals.length===0?<p>No proposals yet.</p>:proposals.map(p=><p key={p.id}><Link href={`/proposals/${p.id}`}>{p.content.name||`Proposal #${p.id}`} · {p.action} · {p.status}</Link></p>)}
      </section>}
      {world.allowedActions.manageMembers&&<section><h2>Members</h2>
        <p>The owner is managed separately. Enter an existing user ID to add or update membership.</p>
        {members.map(m=><p key={m.user_id}>#{m.user_id} {m.username} · {m.role} · {m.status}</p>)}
        <form onSubmit={e=>{e.preventDefault();void run(async()=>{
          await api(`/api/worlds/${id}/members/${userId}`,'PUT',{role,status:memberStatus});
          setMembers((await api<{members:Member[]}>(`/api/worlds/${id}/members`)).members);
        });}}>
          <label htmlFor="member-id">User ID</label><input id="member-id" type="number" min="1" required value={userId} onChange={e=>setUserId(e.target.value)}/>
          <label htmlFor="member-role">Role</label><select id="member-role" value={role} onChange={e=>setRole(e.target.value)}><option value="reader">Reader</option><option value="author">Author</option>{world.allowedActions.manageWorld&&<option value="manager">Manager</option>}</select>
          <label htmlFor="member-status">Status</label><select id="member-status" value={memberStatus} onChange={e=>setMemberStatus(e.target.value)}><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select>
          <button disabled={busy}>Save membership</button>
        </form>
      </section>}
    </>}
  </section></main>;
}
