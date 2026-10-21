"use client";
import { useId } from 'react';
import { lineChanges, type EditSuggestion } from './edit-suggestion';
import styles from './edit-suggestion-preview.module.css';

export default function EditSuggestionPreview({suggestion,loading=false,error='',stale=false,disabled=false,onApply,onDismiss}:{
  suggestion:EditSuggestion|null; loading?:boolean; error?:string; stale?:boolean; disabled?:boolean;
  onApply:(suggestion:EditSuggestion)=>void; onDismiss:()=>void;
}){
  const heading=useId();
  return <section className={styles.card} aria-labelledby={heading} aria-busy={loading}>
    <div className={styles.heading}><h3 id={heading}>Suggested body edit</h3><span>Preview only</span></div>
    {loading&&<p role="status">Preparing a suggestion… You can keep editing.</p>}
    {error&&<p className={styles.warning} role="alert">{error}</p>}
    {!loading&&!error&&!suggestion&&<p>No suggestion yet.</p>}
    {suggestion&&<>
      {stale&&<p className={styles.warning} role="status">The draft or version has changed. Generate a new suggestion before applying.</p>}
      {suggestion.originalText===suggestion.suggestedText?<p>No changes suggested.</p>:<>
        <p className={styles.legend}>− Removed · + Added · Unmarked lines are unchanged</p>
        <div className={styles.diff} role="region" aria-label="Body changes">{lineChanges(suggestion.originalText,suggestion.suggestedText).map((line,i)=><div key={i} className={styles[line.kind]}><span aria-hidden="true">{line.kind==='removed'?'−':line.kind==='added'?'+':' '}</span><span>{line.text||' '}</span></div>)}</div>
      </>}
      <div className={styles.actions}><button type="button" disabled={disabled||loading||stale||!suggestion.suggestedText.trim()||suggestion.originalText===suggestion.suggestedText} onClick={()=>onApply(suggestion)}>Apply to draft</button><button type="button" className="secondary-button" disabled={loading} onClick={onDismiss}>Dismiss</button></div>
      <p className={styles.note}>Replaces the unsaved body only. Save or submit separately.</p>
    </>}
  </section>;
}
