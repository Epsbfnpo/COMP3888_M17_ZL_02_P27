"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { api, ApiError } from "./api";
import { DRAFT_CHECK_EVENT, DRAFT_CHANGE_EVENT, type DraftSnapshot } from './draft-check-button';

type Context = { label: string; detail: string; state: "ready" | "loading" | "unavailable" };
type Message = { id: number; role: "user" | "assistant"; text: string };
type Selection = { kind: "none" | "world" | "entity" | "proposal"; id?: number; includeBody: boolean; includeRelationships: boolean;referenceIds:number[];includeRelated:boolean };
type Connection = {targetId:number;found:boolean;entityIds:number[];relationships:{sourceId:number;targetId:number;sourceName:string;targetName:string;type:string;reverseName?:string}[]};
type Reference = {id:number;name:string;version:number;description?:string;source?:string;connection?:Connection;intermediates?:{id:number;name:string;version:number}[]};
type ContextData = {kind:string;label:string;world?:{id:number;name:string;description?:string};entity?:{id:number;name:string;version:number};proposal?:{id:number;revision:number};draft?:{warning?:string;revisionWarning?:string};references?:Reference[];connectionPaths?:Connection[];truncated:string[]};
type Answer = { mode:"live";model:string;reply:string;context:ContextData;request:unknown };
const tasks = [{id:"general",label:"Ask a question"},{id:"expand",label:"Expand setting"},{id:"consistency",label:"Check consistency"},{id:"relationships",label:"Suggest relationships"}];
const prompts = ["Expand this setting", "Check consistency", "Suggest relationships"];
function contextDetail(data:ContextData) {
  if(data.draft)return `Unsaved editor snapshot · ${data.world?.name}`;
  return data.entity?`${data.world?.name} · Published v${data.entity.version}`:data.proposal?`Saved proposal #${data.proposal.id} · Revision ${data.proposal.revision}`:data.world?"World description included":"Conversation only";
}

function ReplyText({text}:{text:string}) {
  return <div className="ai-reply-text">{text.split(/\n\s*\n/).map((block,i)=>{
    const content=block.replace(/^#{1,6}\s+/gm,"").split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part,j)=>part.startsWith("**")?<strong key={j}>{part.slice(2,-2)}</strong>:part.startsWith("`")?<code key={j}>{part.slice(1,-1)}</code>:part);
    return <p key={i}>{content}</p>;
  })}</div>;
}

function Sparkles() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="m20 2 .7 2.3L23 5l-2.3.7L20 8l-.7-2.3L17 5l2.3-.7L20 2Z" fill="currentColor"/></svg>;
}

export default function AIAssistant() {
  const pathname = usePathname();
  return <SignedInAssistant key={pathname} pathname={pathname}/>;
}

function SignedInAssistant({pathname}:{pathname:string}) {
  const [open, setOpen] = useState(false);
  const [session,setSession] = useState<{pathname:string;userId:number}|null>(null);
  const [draft,setDraft] = useState<DraftSnapshot|null>(null);
  const [draftSequence,setDraftSequence] = useState(0);
  const [liveDraft,setLiveDraft] = useState<DraftSnapshot|null>(null);
  const chatActive = useRef(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const hidden = pathname === "/" || pathname === "/register";
  useEffect(()=>{
    function receive(event:Event){
      const next=(event as CustomEvent<DraftSnapshot>).detail;
      if(!next||!Number.isSafeInteger(next.worldId))return;
      if(chatActive.current&&!window.confirm("Use a new draft snapshot and start a new chat?"))return;
      chatActive.current=false;
      setLiveDraft(next);
      setDraft(next);setDraftSequence(n=>n+1);setOpen(true);
    }
    window.addEventListener(DRAFT_CHECK_EVENT,receive);
    function changed(event:Event){setLiveDraft((event as CustomEvent<DraftSnapshot|null>).detail);}
    window.addEventListener(DRAFT_CHANGE_EVENT,changed);
    return()=>{window.removeEventListener(DRAFT_CHECK_EVENT,receive);window.removeEventListener(DRAFT_CHANGE_EVENT,changed);};
  },[]);
  useEffect(()=>{
    if(hidden)return;
    let controller:AbortController|null=null;
    let disposed=false;
    async function checkSession(){
      controller?.abort();controller=new AbortController();
      const current=controller;
      try {
        const {user}=await api<{user:{id:number}}>("/auth/me","GET",undefined,current.signal);
        if(!disposed&&!current.signal.aborted)setSession({pathname,userId:user.id});
      } catch {
        if(!disposed&&!current.signal.aborted){setSession(null);setOpen(false);}
      }
    }
    function checkVisible(){if(document.visibilityState==="visible")void checkSession();}
    function checkFocus(){void checkSession();}
    void checkSession();
    window.addEventListener("focus",checkFocus);
    document.addEventListener("visibilitychange",checkVisible);
    return ()=>{disposed=true;controller?.abort();window.removeEventListener("focus",checkFocus);document.removeEventListener("visibilitychange",checkVisible);};
  },[pathname,hidden]);
  function close() { setOpen(false); launcher.current?.focus(); }
  if (hidden || session?.pathname!==pathname) return null;
  return <aside className="ai-widget" aria-label="Worldbuilding assistant">
    <AssistantPanel key={`${pathname}:${session.userId}:${draftSequence}`} pathname={pathname} open={open} draft={draft} liveDraft={liveDraft} onChatActive={active=>{chatActive.current=active;}} onRemoveDraft={()=>{setDraft(null);setDraftSequence(n=>n+1);chatActive.current=false;}} onClose={close} onSignedOut={()=>{setDraft(null);setSession(null);setOpen(false);}}/>
    <button ref={launcher} type="button" className={`ai-launcher${open ? " is-open" : ""}`}
      aria-label={open ? "Close AI assistant" : "Open AI assistant"} aria-expanded={open}
      aria-controls="ai-assistant-panel" onClick={() => open ? close() : setOpen(true)}>
      <span className="ai-launcher-symbol"><Sparkles/></span><span>AI assistant</span>
      <span className="ai-launcher-preview">Gemini</span>
    </button>
  </aside>;
}

function AssistantPanel({ pathname, open, onClose, onSignedOut, draft, liveDraft, onChatActive, onRemoveDraft }: { pathname:string; open:boolean; onClose:()=>void; onSignedOut:()=>void;draft:DraftSnapshot|null;liveDraft:DraftSnapshot|null;onChatActive:(active:boolean)=>void;onRemoveDraft:()=>void }) {
  const [context, setContext] = useState<Context>({ label:"Your workspace", detail:"Choose a world or entity for context", state:"ready" });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(draft?"Check this unsaved draft against the supplied published context. Cite entity IDs and versions, distinguish conflicts from missing information, and suggest minimal repairs.":"");
  const [pending, setPending] = useState(false);
  const [task,setTask] = useState(draft?"consistency":"general");
  const [references,setReferences] = useState<Reference[]>([]);
  const [includeRelated,setIncludeRelated] = useState(true);
  const [query,setQuery] = useState("");
  const [searchResults,setSearchResults] = useState<Reference[]>([]);
  const [searching,setSearching] = useState(false);
  const [graphLimited,setGraphLimited] = useState(false);
  const searchController=useRef<AbortController|null>(null);
  const [useContext,setUseContext] = useState(true);
  const [includeBody,setIncludeBody] = useState(true);
  const [includeRelationships,setIncludeRelationships] = useState(true);
  const [contextData,setContextData] = useState<ContextData|null>(null);
  const [submitted,setSubmitted] = useState<unknown>(null);
  const [error,setError] = useState("");
  const [configured,setConfigured] = useState(false);
  const [contextExpanded,setContextExpanded] = useState(false);
  const [copied,setCopied] = useState<number|null>(null);
  const [copyError,setCopyError] = useState("");
  const [canRetry,setCanRetry] = useState(false);
  const [model,setModel] = useState("gemini-3.8-flash");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const requestController = useRef<AbortController|null>(null);
  const sequence = useRef(0);
  const draftStale=!!draft&&(!liveDraft||JSON.stringify(draft)!==JSON.stringify(liveDraft));
  useEffect(()=>{onChatActive(messages.length>0||pending);},[messages.length,pending,onChatActive]);
  function changeContext(change:()=>void){
    if(pending)return;
    if(messages.length&&!window.confirm("Changing context starts a new chat. Continue?"))return;
    searchController.current?.abort();setSearching(false);
    change();setMessages([]);setSubmitted(null);setError("");setCanRetry(false);
  }
  async function copyReply(message:Message){
    try{await navigator.clipboard.writeText(message.text);setCopied(message.id);setCopyError("");}
    catch{setCopyError("Copy unavailable. Select the reply text to copy it.");}
  }
  function selected(): Selection {
    const options={includeBody,includeRelationships,referenceIds:references.map(r=>r.id),includeRelated};
    if(draft)return {...options,kind:draft.proposalId?"proposal":draft.entityId?"entity":"world",id:draft.proposalId??draft.entityId??draft.worldId};
    const match=pathname.match(/^\/(entities|worlds|proposals)\/(\d+)(?:\/|$)/);
    const kind=match?.[1]==="entities"?"entity":match?.[1]==="worlds"?"world":"proposal";
    return {kind:useContext&&match?kind:"none",...(useContext&&match?{id:Number(match[2])}:{}),...options};
  }
  async function searchReferences(){
    if(query.trim().length<2||query.length>120||pending||searching)return;
    const controller=new AbortController();searchController.current?.abort();searchController.current=controller;
    const timeout=setTimeout(()=>controller.abort(),10000);setSearching(true);setError("");
    try {
      const data=await api<{results:Reference[];graphLimited:boolean}>("/api/ai/search","POST",{context:selected(),q:query.trim()},controller.signal);
      if(!controller.signal.aborted){setSearchResults(data.results);setGraphLimited(data.graphLimited);}
    } catch(e){if(searchController.current===controller)setError(controller.signal.aborted?"Reference search timed out. Try again.":e instanceof Error?e.message:"Search failed");}
    finally{clearTimeout(timeout);if(searchController.current===controller)setSearching(false);}
  }
  function toggleReference(ref:Reference){
    changeContext(()=>{
    setReferences(current=>current.some(r=>r.id===ref.id)?current.filter(r=>r.id!==ref.id):current.length<5?[...current,ref]:current);
    });
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function loadContext() {
      setContext({label:"Loading page context…",detail:"Checking accessible content",state:"loading"});
      setContextData(null);setSubmitted(null);
      try {
        const {context:data,service}=await api<{context:ContextData;service:{model:string;configured:boolean}}>("/api/ai/context","POST",{...selected(),...(draft?{draft}:{})},controller.signal);
        const detail=contextDetail(data);
        if (!controller.signal.aborted) {setConfigured(service.configured);setModel(service.model);setContextData(data);setContext({label:data.label,detail,state:"ready"});}
      } catch (e) {
        if (controller.signal.aborted) return;
        if(e instanceof ApiError && e.status===401){onSignedOut();return;}
        setMessages([]);
        setContext({label:"Page context unavailable",detail:e instanceof ApiError && [401,403,404].includes(e.status) ? "This content is not accessible" : "Reopen the assistant to retry",state:"unavailable"});
      }
    }
    void loadContext();
    return () => controller.abort();
  // Context is refreshed when the panel opens or the selection changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open,pathname,useContext,includeBody,includeRelationships,includeRelated,references,draft]);
  useEffect(() => () => { requestController.current?.abort();searchController.current?.abort(); },[]);
  useEffect(() => {
    if (open && !pending && context.state === "ready") inputRef.current?.focus();
  },[open,pending,context.state]);
  useEffect(() => {
    if (!open) return;
    const escape = (event:KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown",escape);
    return () => document.removeEventListener("keydown",escape);
  },[open,onClose]);
  useEffect(() => {
    if (open && logRef.current) logRef.current.scrollTop = messages.length || pending ? logRef.current.scrollHeight : 0;
  },[messages,pending,open]);

  function clearChat() {
    requestController.current?.abort();requestController.current=null;
    setMessages([]);setInput("");setPending(false);setSubmitted(null);setError("");setCanRetry(false);setCopyError("");setCopied(null);
    inputRef.current?.focus();
  }
  async function send() {
    const text = input.trim();
    if (!text || pending || !configured || context.state !== "ready" || requestController.current) return;
    const controller=new AbortController();requestController.current=controller;
    const timeout=setTimeout(()=>controller.abort(),50000);
    setPending(true);setError("");setCanRetry(false);
    try {
      let size=0;
      const history: {role:Message["role"];text:string}[]=[];
      for(const message of messages.slice(-8).reverse()) {
        if(size+message.text.length>16000)break;
        history.unshift({role:message.role,text:message.text});size+=message.text.length;
      }
      const result=await api<Answer>("/api/ai/chat","POST",{task,message:text,history,context:selected(),...(draft?{draft}:{})},controller.signal);
      if(controller.signal.aborted)return;
      setMessages(current=>[...current,{id:++sequence.current,role:"user",text},{id:++sequence.current,role:"assistant",text:result.reply}]);
      setInput("");setSubmitted(result.request);setContextData(result.context);setModel(result.model);
      setContext({label:result.context.label,detail:contextDetail(result.context),state:"ready"});
    } catch(e) {
      if(requestController.current!==controller)return;
      if(e instanceof ApiError && e.status===401){onSignedOut();return;}
      if(e instanceof ApiError && [401,403,404].includes(e.status)) {
        setMessages([]);setSubmitted(null);setContextData(null);
        setContext({label:"Page context unavailable",detail:"Reopen the assistant after checking your access",state:"unavailable"});
      }
      setError(controller.signal.aborted?"AI request timed out. Your message is kept; try again.":e instanceof Error?e.message:"Could not send request. Your message is kept.");
      setCanRetry(!(e instanceof ApiError&&[401,403,404].includes(e.status)));
    } finally {
      clearTimeout(timeout);
      if(requestController.current===controller){requestController.current=null;setPending(false);}
    }
  }

  return <section id="ai-assistant-panel" className="ai-panel" role="dialog" aria-modal="false"
    aria-labelledby="ai-assistant-title" hidden={!open}>
    <header className="ai-panel-header">
      <span className="ai-header-symbol"><Sparkles/></span>
      <div className="ai-panel-title"><h2 id="ai-assistant-title">Worldbuilding assistant</h2><p>{configured?"Gemini · Suggestions only":"AI service unavailable"}</p></div>
      <button type="button" className="ai-icon-button" onClick={onClose} aria-label="Minimize AI assistant">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 10h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
      </button>
    </header>
    <div className="ai-context">
      <button type="button" className="ai-context-toggle" aria-expanded={contextExpanded} aria-controls="ai-context-body" onClick={()=>setContextExpanded(expanded=>!expanded)}>
        <span className="ai-context-heading"><span className="ai-context-label">{draft?"DRAFT SNAPSHOT":"PAGE CONTEXT"}</span><strong>{context.label}</strong><span className="ai-context-detail">{context.state!=="ready"?context.detail:`${draft?"Unsaved draft":contextData?.entity?`Published v${contextData.entity.version}`:contextData?.proposal?`Proposal r${contextData.proposal.revision}`:contextData?.world?"World included":"Conversation only"} · ${contextData?.references?.length??0} entity references`}</span></span>
        <span className="ai-context-toggle-label">{contextExpanded?"Hide":"Show"}<span aria-hidden="true">{contextExpanded?" −":" +"}</span></span>
      </button>
      <div id="ai-context-body" className="ai-context-body" hidden={!contextExpanded}>
      {draft&&<div className="ai-draft-notice"><p>{draftStale?"The editor has changed or closed. This snapshot is out of date.":"Snapshot matches the current editor."}</p><button type="button" disabled={pending} onClick={()=>changeContext(onRemoveDraft)}>Use saved page instead</button></div>}
      {draft&&contextData?.entity&&<p className="ai-baseline-note">Published baseline: {contextData.entity.name} · #{contextData.entity.id} · v{contextData.entity.version}</p>}
      <details className="ai-context-options"><summary>Advanced options</summary>
        <label><input type="checkbox" checked={useContext} disabled={pending||!!draft} onChange={e=>changeContext(()=>{setUseContext(e.target.checked);setReferences([]);setSearchResults([]);})}/> Include current page</label>
        <label><input type="checkbox" checked={includeBody} disabled={pending||!useContext} onChange={e=>changeContext(()=>setIncludeBody(e.target.checked))}/> Include body text</label>
        <label><input type="checkbox" checked={includeRelationships} disabled={pending||!useContext} onChange={e=>changeContext(()=>setIncludeRelationships(e.target.checked))}/> Include relationships</label>
        <label><input type="checkbox" checked={includeRelated} disabled={pending||!useContext||(!includeRelationships&&selected().kind!=="world")} onChange={e=>changeContext(()=>setIncludeRelated(e.target.checked))}/> {selected().kind==="world"?"Include published world entities":"Include all direct neighbours"}</label>
        <p>Current saved versions only. Changing context starts a new chat.</p>
      </details>
        {contextData?.world&&<div className="ai-reference-picker">
          <label htmlFor="ai-reference-query">Add reference entities</label>
          <div className="ai-reference-search"><input id="ai-reference-query" maxLength={120} value={query} placeholder="Name, keyword or tag…" disabled={pending} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void searchReferences();}}}/><button type="button" disabled={pending||searching||query.trim().length<2} onClick={()=>void searchReferences()}>{searching?"Searching…":"Search"}</button></div>
          <p>{references.length}/5 selected · Connecting entities added automatically</p>
          {references.map(ref=><button type="button" key={ref.id} disabled={pending} onClick={()=>toggleReference(ref)}>Remove {ref.name} ×</button>)}
          {searchResults.map(ref=><label key={ref.id}><input type="checkbox" checked={references.some(r=>r.id===ref.id)} disabled={pending||references.length>=5&&!references.some(r=>r.id===ref.id)} onChange={()=>toggleReference(ref)}/><span>{ref.name} · #{ref.id} · v{ref.version}<small>{ref.description}</small>{ref.connection&&<small>{!ref.connection.found?"No published path found":ref.intermediates?.length?`Via ${ref.intermediates.map(r=>r.name).join(" → ")}`:ref.id===contextData?.entity?.id?"Current entity":"Directly connected"}</small>}</span></label>)}
          {graphLimited&&<p>Large graph: paths checked within the first 5,000 relationships.</p>}
        </div>}
        {contextData?.draft?.warning&&<p>{contextData.draft.warning}</p>}
        {contextData?.draft?.revisionWarning&&<p>{contextData.draft.revisionWarning}</p>}
        {contextData?.truncated.length? <p>Context shortened: {contextData.truncated.join(", ")}.</p>:null}
        {contextData&&<details className="ai-context-options"><summary>Technical details</summary><pre>{JSON.stringify(contextData,null,2)}</pre>{submitted!==null&&<><p>Last request</p><pre>{JSON.stringify(submitted,null,2)}</pre></>}</details>}
      {contextData?.world&&<details className="ai-reference-scope"><summary>Reference scope · World + {contextData.references?.length??0} entities</summary><p><strong>{contextData.world.name}</strong> · World #{contextData.world.id}</p><p>{contextData.world.description||"No saved world description."}</p>{contextData.references?.map(r=><p key={r.id}>{r.name} · #{r.id} · v{r.version} · {r.source}</p>)}<p>Published context only; long content may be shortened. Not a complete consistency audit.</p></details>}
      {!!contextData?.connectionPaths?.length&&<details className="ai-context-options"><summary>Connection paths</summary>{contextData.connectionPaths.map(path=><div key={path.targetId}>{path.found?path.relationships.map((r,i)=><p key={i}>{r.sourceName} → {r.type} → {r.targetName}</p>):<p>No published path found to entity #{path.targetId}.</p>}</div>)}</details>}
      </div>
    </div>
    {draftStale&&<div className="ai-snapshot-warning" role="status"><span>Draft changed. Refresh before checking.</span>{liveDraft&&<button type="button" disabled={pending} onClick={()=>window.dispatchEvent(new CustomEvent<DraftSnapshot>(DRAFT_CHECK_EVENT,{detail:structuredClone(liveDraft)}))}>Refresh snapshot</button>}</div>}
    <div className="ai-messages" ref={logRef} role="log" aria-label="Assistant conversation" aria-live="polite" aria-relevant="additions text">
      {messages.length === 0 ? <div className="ai-welcome">
        <h3>Explore your setting</h3>
        <div className="ai-starters">{prompts.map(prompt => <button key={prompt} type="button" disabled={pending || !configured || context.state !== "ready"}
          onClick={() => {setTask(prompt.includes("consistency")?"consistency":prompt.includes("relationships")?"relationships":"expand");setInput(prompt);inputRef.current?.focus();}}>{prompt}<span aria-hidden="true">↗</span></button>)}</div>
      </div> : messages.map(message => <article key={message.id} className={`ai-message ai-message-${message.role}`}>
        <span className="ai-message-author">{message.role === "user" ? "You" : "Assistant"}</span>{message.role==="assistant"?<><ReplyText text={message.text}/><button type="button" className="ai-copy-button" onClick={()=>void copyReply(message)}>{copied===message.id?"Copied":"Copy"}</button></>:<p>{message.text}</p>}
      </article>)}
      {pending && <div className="ai-pending" role="status"><span/><span/><span/><p>Thinking with Gemini…</p></div>}
    </div>
    <footer className="ai-panel-footer">
      <div className="ai-chat-tools"><span title={model}>English by default · No automatic edits</span><button type="button" onClick={()=>{if((messages.length||pending)&&!window.confirm("Clear this conversation and start again?"))return;clearChat();}} disabled={!messages.length && !input && !pending}>New chat</button></div>
      <label className="ai-task">Task <select value={task} disabled={pending} onChange={e=>setTask(e.target.value)}>{tasks.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      {error&&<div className="ai-request-error" role="alert">{error}{canRetry&&<button type="button" disabled={pending||!input.trim()||context.state!=="ready"} onClick={()=>void send()}>Retry</button>}</div>}
      {copyError&&<p className="ai-request-error" role="status">{copyError}</p>}
      <form className="ai-composer" onSubmit={e => {e.preventDefault();void send();}}>
        <label className="sr-only" htmlFor="ai-prompt">Message the worldbuilding assistant</label>
        <textarea ref={inputRef} id="ai-prompt" rows={2} maxLength={2000} placeholder="Ask about your setting…"
          value={input} disabled={pending || !configured || context.state !== "ready"} onChange={e => {setInput(e.target.value);setCanRetry(false);setError("");}}
          onKeyDown={e => {if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault();void send();}}}/>
        <button type="submit" className="ai-send" aria-label="Send message to Gemini" disabled={!input.trim() || pending || !configured || context.state !== "ready"}>
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 10 5-5 5 5M10 5v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </form>
      <p className="ai-footer-note">Send shares selected content and recent chat with Google. Chat resets on navigation.</p>
    </footer>
  </section>;
}
