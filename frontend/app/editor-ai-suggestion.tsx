"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {api} from './api';
import type {DraftSnapshot} from './draft-check-button';
import {suggestionIsStale,type EditSuggestion} from './edit-suggestion';
import EditSuggestionPreview from './edit-suggestion-preview';

export default function EditorAISuggestion({draft,disabled=false,onApply}:{draft:DraftSnapshot;disabled?:boolean;onApply:(suggestion:EditSuggestion)=>void}){
  const id=useId();
  const [instruction,setInstruction]=useState('');
  const [suggestion,setSuggestion]=useState<EditSuggestion|null>(null);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const [notice,setNotice]=useState('');
  const [snapshotKey,setSnapshotKey]=useState('');
  const request=useRef<AbortController|null>(null);
  const currentKey=JSON.stringify(draft);
  const stale=!!suggestion&&(snapshotKey!==currentKey||suggestionIsStale(suggestion,{text:draft.content.body.text,baseVersion:draft.baseVersion,proposalRevision:draft.proposalRevision}));
  useEffect(()=>()=>request.current?.abort(),[]);
  async function generate(){
    if(disabled||pending||!instruction.trim()||request.current)return;
    const snapshot=structuredClone(draft);
    const controller=new AbortController();request.current=controller;
    const timeout=setTimeout(()=>controller.abort(),50000);
    setPending(true);setError('');setNotice('');setSuggestion(null);
    try{
      const response=await api<{suggestion:EditSuggestion}>('/api/ai/edit-body','POST',{
        message:instruction.trim(),draft:snapshot,
        context:{kind:snapshot.proposalId?'proposal':snapshot.entityId?'entity':'world',id:snapshot.proposalId??snapshot.entityId??snapshot.worldId,includeBody:true,includeRelationships:true,includeRelated:true}
      },controller.signal);
      if(controller.signal.aborted)return;
      if(response.suggestion.originalText!==snapshot.content.body.text)throw new Error('The suggestion does not match this draft. Please try again.');
      setSuggestion(response.suggestion);setSnapshotKey(JSON.stringify(snapshot));
    }catch(e){if(request.current===controller)setError(controller.signal.aborted?'Request cancelled or timed out. Your draft is unchanged.':e instanceof Error?e.message:'Could not prepare an edit.');}
    finally{clearTimeout(timeout);if(request.current===controller){request.current=null;setPending(false);}}
  }
  return <div className="editor-ai-suggestion">
    <details><summary>Suggest a body edit with AI</summary>
      <label htmlFor={id}>What should change?</label>
      <textarea id={id} rows={2} maxLength={2000} value={instruction} disabled={disabled||pending} placeholder="Improve clarity while preserving all established facts." onChange={e=>setInstruction(e.target.value)}/>
      <p>Sending shares this draft and accessible world context with Google. Nothing is saved.</p>
      <button type="button" disabled={disabled||pending||!instruction.trim()||draft.content.body.text.length>6000} onClick={()=>void generate()}>{pending?'Generating…':error?'Retry suggestion':'Generate suggestion'}</button>
      {draft.content.body.text.length>6000&&<p>Body editing supports up to 6,000 characters.</p>}
      {pending&&<button type="button" className="secondary-button" onClick={()=>request.current?.abort()}>Cancel request</button>}
    </details>
    {(suggestion||pending||error)&&<EditSuggestionPreview suggestion={suggestion} loading={pending} error={error} stale={stale} disabled={disabled} onDismiss={()=>{setSuggestion(null);setError('');setNotice('Suggestion dismissed. Your draft is unchanged.');}} onApply={next=>{
      if(disabled||pending||stale)return;
      onApply(next);setSuggestion(null);setNotice('Applied to the unsaved body. Review it, then save or submit when ready.');
    }}/>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}
