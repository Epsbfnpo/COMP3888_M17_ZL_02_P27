"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { api, ApiError } from "./api";

type Context = { label: string; detail: string; state: "ready" | "loading" | "unavailable" };
type Message = { id: number; role: "user" | "assistant"; text: string };
const prompts = ["Expand this setting", "Check consistency", "Suggest relationships"];

function Sparkles() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="m20 2 .7 2.3L23 5l-2.3.7L20 8l-.7-2.3L17 5l2.3-.7L20 2Z" fill="currentColor"/></svg>;
}

function previewReply(prompt: string, context: Context) {
  const subject = context.label === "Your workspace" ? "your setting" : context.label;
  if (/consisten|conflict|contradict/i.test(prompt)) {
    return `For ${subject}, start with these consistency questions:\n\n• Does the timeline agree with related events?\n• Do locations, motivations and relationships support each other?\n• Which claims need a reference to an existing entity?\n\nA connected assistant will use selected world content to suggest specific checks. This example has not checked your world for contradictions.`;
  }
  if (/relationship|connect|link/i.test(prompt)) {
    return `A useful relationship should explain how two entities affect each other. For ${subject}, consider:\n\n• Who protects or depends on it?\n• Which organisation maintains or governs it?\n• Would a reverse name make the connection clearer?\n\nSelect existing entities before adding a relationship. Nothing has been created or saved.`;
  }
  return `To develop ${subject}, consider one concrete detail in each area:\n\n• Purpose: what makes it important to this world?\n• Tension: what problem or limitation shapes it?\n• Connection: which existing person, place or organisation is involved?\n\nThe next iteration will turn your request and selected context into editable suggestions. This is a sample response for the interface preview.`;
}

export default function AIAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const hidden = pathname === "/" || pathname === "/register";
  function close() { setOpen(false); launcher.current?.focus(); }
  if (hidden) return null;
  return <aside className="ai-widget" aria-label="Worldbuilding assistant">
    <AssistantPanel key={pathname} pathname={pathname} open={open} onClose={close}/>
    <button ref={launcher} type="button" className={`ai-launcher${open ? " is-open" : ""}`}
      aria-label={open ? "Close AI assistant" : "Open AI assistant"} aria-expanded={open}
      aria-controls="ai-assistant-panel" onClick={() => open ? close() : setOpen(true)}>
      <span className="ai-launcher-symbol"><Sparkles/></span><span>AI assistant</span>
      <span className="ai-launcher-preview">Preview</span>
    </button>
  </aside>;
}

function AssistantPanel({ pathname, open, onClose }: { pathname:string; open:boolean; onClose:()=>void }) {
  const [context, setContext] = useState<Context>({ label:"Your workspace", detail:"Choose a world or entity for context", state:"ready" });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function loadContext() {
      const entityId = pathname.match(/^\/entities\/(\d+)(?:\/|$)/)?.[1];
      const worldId = pathname.match(/^\/worlds\/(\d+)(?:\/|$)/)?.[1];
      const proposalId = pathname.match(/^\/proposals\/(\d+)(?:\/|$)/)?.[1];
      if (!entityId && !worldId && !proposalId) return;
      setContext({label:"Loading page context…",detail:"Checking accessible content",state:"loading"});
      try {
        let next: Context;
        if (entityId) {
          const {entity} = await api<{entity:{name:string;version:number;world:{name:string}}}>(`/api/entities/${entityId}`,"GET",undefined,controller.signal);
          next = {label:entity.name,detail:`${entity.world.name} · Published v${entity.version}`,state:"ready"};
        } else if (worldId) {
          const {world} = await api<{world:{name:string;visibility:string}}>(`/api/worlds/${worldId}`,"GET",undefined,controller.signal);
          next = {label:world.name,detail:`${world.visibility === "private" ? "Private" : "Public"} world`,state:"ready"};
        } else {
          const {proposal} = await api<{proposal:{id:number;revision:number;content:{name?:string}|null}}>(`/api/proposals/${proposalId}`,"GET",undefined,controller.signal);
          next = {label:proposal.content?.name || `Proposal #${proposal.id}`,detail:`Proposal #${proposal.id} · Revision ${proposal.revision}`,state:"ready"};
        }
        if (!controller.signal.aborted) setContext(next);
      } catch (e) {
        if (controller.signal.aborted) return;
        setContext({label:"Page context unavailable",detail:e instanceof ApiError && [401,403,404].includes(e.status) ? "This content is not accessible" : "Reopen the assistant to retry",state:"unavailable"});
      }
    }
    void loadContext();
    return () => controller.abort();
  },[open,pathname]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); },[]);
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
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;setMessages([]);setInput("");setPending(false);
    inputRef.current?.focus();
  }
  function send() {
    const text = input.trim();
    if (!text || pending || context.state !== "ready") return;
    setMessages(current => [...current,{id:++sequence.current,role:"user",text}]);
    setInput("");setPending(true);
    timer.current = setTimeout(() => {
      setMessages(current => [...current,{id:++sequence.current,role:"assistant",text:previewReply(text,context)}]);
      setPending(false);timer.current = null;inputRef.current?.focus();
    },450);
  }

  return <section id="ai-assistant-panel" className="ai-panel" role="dialog" aria-modal="false"
    aria-labelledby="ai-assistant-title" hidden={!open}>
    <header className="ai-panel-header">
      <span className="ai-header-symbol"><Sparkles/></span>
      <div className="ai-panel-title"><h2 id="ai-assistant-title">Worldbuilding assistant</h2><p>A little help for your next idea</p></div>
      <button type="button" className="ai-icon-button" onClick={onClose} aria-label="Minimize AI assistant">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 10h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
      </button>
    </header>
    <div className="ai-preview-notice"><span className="ai-preview-dot"/>Interface preview<span>Model not connected</span></div>
    <div className="ai-context" aria-live="polite"><span className="ai-context-label">CURRENT CONTEXT</span><strong>{context.label}</strong><span>{context.detail}</span></div>
    <div className="ai-messages" ref={logRef} role="log" aria-label="Assistant conversation" aria-live="polite" aria-relevant="additions text">
      {messages.length === 0 ? <div className="ai-welcome">
        <span className="ai-welcome-symbol"><Sparkles/></span><h3>What would you like to explore?</h3>
        <p>Develop an idea, review a setting, or explore how your entities connect.</p>
        <div className="ai-starters">{prompts.map(prompt => <button key={prompt} type="button" disabled={context.state !== "ready"}
          onClick={() => {setInput(prompt);inputRef.current?.focus();}}>{prompt}<span aria-hidden="true">↗</span></button>)}</div>
        <p className="ai-welcome-note">Try the conversation flow with sample replies. No model requests are sent.</p>
      </div> : messages.map(message => <article key={message.id} className={`ai-message ai-message-${message.role}`}>
        <span className="ai-message-author">{message.role === "user" ? "You" : "Assistant · sample reply"}</span><p>{message.text}</p>
      </article>)}
      {pending && <div className="ai-pending" role="status"><span/><span/><span/><p>Preparing sample reply…</p></div>}
    </div>
    <footer className="ai-panel-footer">
      <div className="ai-chat-tools"><span>Suggestions stay separate from published content.</span><button type="button" onClick={clearChat} disabled={!messages.length && !input && !pending}>New chat</button></div>
      <form className="ai-composer" onSubmit={e => {e.preventDefault();send();}}>
        <label className="sr-only" htmlFor="ai-prompt">Message the worldbuilding assistant</label>
        <textarea ref={inputRef} id="ai-prompt" rows={2} maxLength={2000} placeholder="Ask about your setting…"
          value={input} disabled={pending || context.state !== "ready"} onChange={e => setInput(e.target.value)}
          onKeyDown={e => {if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault();send();}}}/>
        <button type="submit" className="ai-send" aria-label="Send preview message" disabled={!input.trim() || pending || context.state !== "ready"}>
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 10 5-5 5 5M10 5v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </form>
      <p className="ai-footer-note">Messages stay in this page. Your world is not changed.</p>
    </footer>
  </section>;
}
