"use client";
import type { EntityContent } from './entity-form';
import { useEffect } from 'react';

export type DraftSnapshot = {worldId:number;entityId?:number|null;proposalId?:number;baseVersion?:number|null;proposalRevision?:number;content:EntityContent};
export const DRAFT_CHECK_EVENT = 'worldbuilding:check-draft';
export const DRAFT_CHANGE_EVENT = 'worldbuilding:draft-change';

export default function DraftCheckButton({draft,disabled=false}:{draft:DraftSnapshot;disabled?:boolean}) {
  const snapshot = JSON.stringify(draft);
  useEffect(()=>{
    const current = JSON.parse(snapshot) as DraftSnapshot;
    window.dispatchEvent(new CustomEvent<DraftSnapshot>(DRAFT_CHANGE_EVENT,{detail:current}));
  },[snapshot]);
  useEffect(()=>()=>{window.dispatchEvent(new CustomEvent(DRAFT_CHANGE_EVENT,{detail:null}));},[]);
  return <div className="ai-draft-entry"><button type="button" className="secondary-button" disabled={disabled}
    onClick={()=>window.dispatchEvent(new CustomEvent<DraftSnapshot>(DRAFT_CHECK_EVENT,{detail:structuredClone(draft)}))}>Check consistency with AI</button>
    <span>Review a snapshot. Nothing is saved.</span></div>;
}
