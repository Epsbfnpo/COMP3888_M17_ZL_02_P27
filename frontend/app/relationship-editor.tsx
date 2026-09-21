"use client";

import { useEffect, useId, useState } from 'react';
import { api } from './api';

export type OutgoingRelationship = { targetEntityId: number; type: string; reverseName?: string | null; description: string; targetName?: string };
type Target = { id: number; name: string; type: string };

export default function RelationshipEditor({ worldId, entityId, value, onChange, disabled = false, readOnly = false }: {
  worldId: number; entityId?: number; value?: OutgoingRelationship[];
  onChange: (rows: OutgoingRelationship[]) => void; disabled?: boolean; readOnly?: boolean;
}) {
  const prefix = useId();
  const [query, setQuery] = useState('');
  const [targets, setTargets] = useState<Target[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const selected = (value || []).map(r => r.targetEntityId).filter(id => id > 0).join(',');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api<{ entities: Target[] }>(`/api/worlds/${worldId}/relationship-targets?q=${encodeURIComponent(query)}&selected=${selected}`)
        .then(data => { if (active) { setTargets(data.entities); setError(''); setLoadedQuery(query); setActiveIndex(-1); } })
        .catch(e => { if (active) { setError(e instanceof Error ? e.message : 'Could not load targets'); setLoadedQuery(query); } });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query, worldId, selected]);
  const rows = value || [];
  const loading = loadedQuery !== query;
  const matches = loading || error ? [] : targets.filter(t => t.id !== entityId && t.name.toLowerCase().includes(query.trim().toLowerCase()));
  const expanded = open && !disabled && rows.length < 50;
  function chooseTarget(target: Target) {
    const emptyIndex = rows.findIndex(row => !row.targetEntityId);
    const index = emptyIndex >= 0 ? emptyIndex : rows.length;
    if (disabled || index >= 50) return;
    const next = [...rows];
    next[index] = { ...(next[index] || { type: '', description: '' }), targetEntityId: target.id, targetName: target.name };
    onChange(next); setOpen(false); setQuery(''); setActiveIndex(-1);
    setTimeout(() => document.getElementById(`${prefix}-type-${index}`)?.focus(), 0);
  }
  useEffect(() => {
    if (expanded && activeIndex >= 0) document.getElementById(`${prefix}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, expanded, prefix]);
  function update(index: number, change: Partial<OutgoingRelationship>) {
    onChange(rows.map((row, i) => i === index ? { ...row, ...change } : row));
  }
  if (readOnly) return <section className="relationship-readonly"><h3>Outgoing relationships</h3>
    {error && <p role="alert">{error}</p>}
    {!rows.length ? <p>{value === undefined ? 'No relationship changes specified.' : 'No outgoing relationships.'}</p> :
      <ul className="snapshot-relationships">{rows.map((row,index) => <li key={index}>
        <div className="snapshot-relation-path"><span className="snapshot-relation-label">{row.type}</span><span aria-hidden="true">→</span><strong>{row.targetName || targets.find(t=>t.id===row.targetEntityId)?.name || `Entity #${row.targetEntityId}`}</strong></div>
        {row.reverseName && <p className="relationship-reverse-note">Reverse: <strong>{row.reverseName}</strong> → this entity</p>}
        {row.description && <p className="snapshot-relation-note">{row.description}</p>}
      </li>)}</ul>}
  </section>;
  return <section className="management-card relationship-editor">
    <h3>Outgoing relationships</h3>
    <p>This entity manages the relationship. Names are custom labels; a reverse name enables a two-way relationship.</p>
    {value === undefined && <p>No relationship changes specified. Existing relationships will be kept.</p>}
    {!disabled && <>
      <label htmlFor={`${prefix}-search`}>Search relationship targets</label>
      <div className="relationship-search">
        <input id={`${prefix}-search`} type="search" role="combobox" autoComplete="off"
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${prefix}-results`}
          aria-activedescendant={expanded && activeIndex >= 0 && matches[activeIndex] ? `${prefix}-option-${activeIndex}` : undefined}
          aria-describedby={`${prefix}-help`} disabled={rows.length >= 50}
          placeholder="Type an entity name, then select a match..." maxLength={150} value={query}
          onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActiveIndex(-1); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIndex(-1); }}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setActiveIndex(-1); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault(); setOpen(true);
              if (matches.length) setActiveIndex(index => e.key === 'ArrowDown' ? (index + 1) % matches.length : (index <= 0 ? matches.length - 1 : index - 1));
            }
            if (e.key === 'Enter') { e.preventDefault(); if (expanded && matches[activeIndex]) chooseTarget(matches[activeIndex]); }
          }} />
        <div className="relationship-search-menu" hidden={!expanded}>
          <div className="relationship-search-caption">{query.trim() ? 'Matching entities' : 'Entities in this world'}</div>
          {loading && <p role="status">Searching...</p>}
          {!loading && !error && matches.length === 0 && <p role="status">No matching entities in this world.</p>}
          {error && <p role="alert">{error}</p>}
          <ul id={`${prefix}-results`} role="listbox" aria-label="Relationship targets">
            {matches.map((target, index) => <li id={`${prefix}-option-${index}`} key={target.id}
              role="option" aria-selected={index === activeIndex}
              className={index === activeIndex ? 'is-active' : ''}
              onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActiveIndex(index)}
              onClick={() => chooseTarget(target)} onKeyDown={e => { if (e.key === 'Enter') chooseTarget(target); }}>
              <span className="relationship-target-icon" aria-hidden="true">{target.name.slice(0, 1).toUpperCase()}</span>
              <span className="relationship-target-label"><strong>{target.name}</strong><small>{target.type.replaceAll('_', ' ')} · #{target.id}</small></span>
              <span className="relationship-target-add" aria-hidden="true">+</span>
            </li>)}
          </ul>
        </div>
      </div>
      <p id={`${prefix}-help`} className="relationship-search-help">Select a result to add a relationship. Use ↑ / ↓ and Enter to choose.</p>
    </>}
    {error && <p role="alert">{error}</p>}
    {rows.map((row, index) => <fieldset className="relationship-fields" key={index} disabled={disabled}>
      <legend>Relationship {index + 1}</legend>
      <div className="relationship-field"><label htmlFor={`${prefix}-type-${index}`}>Relationship name</label>
      <input id={`${prefix}-type-${index}`} required maxLength={100} value={row.type}
        onChange={e => update(index, { type: e.target.value })} placeholder="Enter a custom name" /></div>
      <div className="relationship-field"><label htmlFor={`${prefix}-direction-${index}`}>Direction</label>
      <select id={`${prefix}-direction-${index}`} value={row.reverseName == null ? 'one-way' : 'two-way'}
        onChange={e => update(index, { reverseName: e.target.value === 'one-way' ? null : row.type })}>
        <option value="one-way">One-way</option><option value="two-way">Two-way</option>
      </select></div>
      {row.reverseName != null && <div className="relationship-field"><label htmlFor={`${prefix}-reverse-${index}`}>Reverse relationship name</label>
        <input id={`${prefix}-reverse-${index}`} required maxLength={100} value={row.reverseName}
          onChange={e => update(index, { reverseName: e.target.value })} placeholder="Use the same name or a different one" /></div>}
      <div className="relationship-field"><label htmlFor={`${prefix}-target-${index}`}>Target entity</label>
      <select id={`${prefix}-target-${index}`} required value={row.targetEntityId || ''}
        onChange={e => update(index, { targetEntityId: Number(e.target.value), targetName: targets.find(t => t.id === Number(e.target.value))?.name })}>
        <option value="">Select an entity</option>
        {row.targetEntityId > 0 && !targets.some(t => t.id === row.targetEntityId) &&
          <option value={row.targetEntityId}>{row.targetName || `Entity #${row.targetEntityId}`} (not in available results)</option>}
        {targets.filter(t => t.id !== entityId).map(t => <option key={t.id} value={t.id}>{t.name} (#{t.id})</option>)}
      </select></div>
      <div className="relationship-field relationship-field-wide"><label htmlFor={`${prefix}-description-${index}`}>Relationship description</label>
      <textarea id={`${prefix}-description-${index}`} rows={3} maxLength={10000} value={row.description}
        onChange={e => update(index, { description: e.target.value })} /></div>
      <div className="relationship-preview"><strong>Preview</strong><p>This entity → {row.type || '(name)'} → {row.targetName || targets.find(t => t.id === row.targetEntityId)?.name || 'Target entity'}</p>
        {row.reverseName != null && <p>{row.targetName || targets.find(t => t.id === row.targetEntityId)?.name || 'Target entity'} → {row.reverseName || '(reverse name)'} → This entity</p>}</div>
      {!disabled && <button className="secondary-button" type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remove relationship {index + 1}</button>}
    </fieldset>)}
    {!disabled && <button type="button" disabled={rows.length >= 50} onClick={() => onChange([...rows, { targetEntityId: 0, type: '', description: '' }])}>Add relationship</button>}
    {value !== undefined && rows.length === 0 && <p>No outgoing relationships.</p>}
  </section>;
}
