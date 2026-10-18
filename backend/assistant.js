const { tasks, systemInstruction } = require('./assistant-prompts');
const { shortestConnections } = require('./assistant-connections');
function bad(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('Invalid assistant request');
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 2000) bad('Enter a message between 1 and 2000 characters');
  const task = body.task === undefined ? 'general' : body.task;
  if (typeof task !== 'string' || !Object.hasOwn(tasks, task)) bad('Unknown assistant task');
  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > 8) bad('At most 8 previous messages are allowed');
  let total = 0;
  for (const m of history) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.text !== 'string' || !m.text.trim() || m.text.length > 4000) bad('Invalid conversation history');
    total += m.text.length;
  }
  if (total > 16000) bad('Conversation history is too long; start a new chat');
  return { message, task, history: history.map(({ role, text }) => ({ role, text })) };
}
function selection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad('Select assistant context');
  const { kind, id, includeBody = true, includeRelationships = true, referenceIds = [], includeRelated = true } = value;
  if (!['none', 'world', 'entity', 'proposal'].includes(kind)) bad('Invalid context kind');
  if (typeof includeBody !== 'boolean' || typeof includeRelationships !== 'boolean') bad('Invalid context options');
  if (kind !== 'none' && (!Number.isSafeInteger(Number(id)) || Number(id) <= 0)) bad('Invalid context id');
  if (!Array.isArray(referenceIds) || referenceIds.length>5 || referenceIds.some(id=>!Number.isSafeInteger(id)||id<=0) || typeof includeRelated!=='boolean') bad('Select at most 5 valid reference entities');
  if(kind==='none'&&referenceIds.length)bad('Reference entities need a world context');
  return { kind, id: kind === 'none' ? null : Number(id), includeBody, includeRelationships, referenceIds:[...new Set(referenceIds)], includeRelated };
}
function createAssistant({ db, access, readProposal }) {
  async function connections(worldId,startId,targetIds) {
    if(!startId||!targetIds.length)return {paths:[],limited:false};
    const [rows]=await db.execute(`SELECT r.source_entity_id AS sourceId,r.target_entity_id AS targetId,r.relationship_type AS type,r.reverse_name AS reverseName,s.name AS sourceName,t.name AS targetName
      FROM relationships r JOIN entities s ON s.id=r.source_entity_id JOIN entities t ON t.id=r.target_entity_id
      WHERE r.world_id=? AND s.world_id=? AND t.world_id=? AND s.deleted_at IS NULL AND t.deleted_at IS NULL ORDER BY r.id LIMIT 5001`,[worldId,worldId,worldId]);
    return {paths:shortestConnections(rows.slice(0,5000),startId,targetIds),limited:rows.length>5000};
  }
  async function context(user, input, draft) {
    if (!user) bad('Sign in required', 401);
    const s = selection(input);
    const truncated = [];
    const clip = (value, limit, field) => {
      const text = typeof value === 'string' ? value : '';
      if (text.length > limit && !truncated.includes(field)) truncated.push(field);
      return text.slice(0, limit);
    };
    const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
    if (s.kind === 'none') {
      if(draft!==undefined)bad('Draft checks require a world context');
      return { kind: 'none', label: 'No page context', truncated };
    }
    let world, entity, proposal;
    if (s.kind === 'world') world = await access(db, s.id, user);
    if (s.kind === 'entity') {
      [[entity]] = await db.execute('SELECT id,world_id,name,entity_type,description,body,version FROM entities WHERE id=? AND deleted_at IS NULL', [s.id]);
      if (!entity) bad('Entity not found', 404);
      world = await access(db, entity.world_id, user);
    }
    if (s.kind === 'proposal') {
      const result = await readProposal(db, { user, params: { id: s.id } });
      world = result.w; proposal = result.p;
      if(proposal.entity_id) {
        [[entity]]=await db.execute('SELECT id,world_id,name,entity_type,description,body,version FROM entities WHERE id=? AND world_id=? AND deleted_at IS NULL',[proposal.entity_id,world.id]);
      }
    }
    const result = { kind: s.kind, label: world.name, world: { id: world.id, name: world.name, description: clip(world.description, 2000, 'world.description') }, truncated };
    if (entity) {
      result.label = entity.name;
      result.entity = { id: entity.id, name: entity.name, type: entity.entity_type, version: entity.version, description: clip(entity.description, 2000, 'entity.description') };
      if (s.includeBody) result.entity.body = clip(parse(entity.body)?.text, 6000, 'entity.body');
      if (s.includeRelationships) {
        const [rows] = await db.execute(`SELECT r.relationship_type AS type,r.reverse_name AS reverseName,r.description,r.source_entity_id AS sourceId,r.target_entity_id AS targetId,s.name AS sourceName,t.name AS targetName
          FROM relationships r JOIN entities s ON s.id=r.source_entity_id JOIN entities t ON t.id=r.target_entity_id
          WHERE (r.source_entity_id=? OR r.target_entity_id=?) AND r.world_id=? AND s.world_id=? AND t.world_id=? AND s.deleted_at IS NULL AND t.deleted_at IS NULL ORDER BY r.id`, [entity.id,entity.id,world.id,world.id,world.id]);
        result.entity.relationships = rows.map(r => ({...r,description:clip(r.description,250,'relationship.description')}));
      }
    }
    if (proposal) {
      const c = parse(proposal.proposed_content) || {};
      result.label = c.name || `Proposal #${proposal.id}`;
      result.proposal = { id:proposal.id, status:proposal.status, revision:proposal.revision, action:proposal.action_type, baseVersion:proposal.base_version,
        name:c.name || '', entityType:c.entityType || '', description:clip(c.description,2000,'proposal.description') };
      if (s.includeBody) result.proposal.body = clip(c.body?.text,6000,'proposal.body');
      if (s.includeRelationships) {
        const links = Array.isArray(c.outgoingRelationships) ? c.outgoingRelationships : [];
        result.proposal.relationships = links.map(r => ({targetEntityId:r.targetEntityId,type:clip(r.type,100,'relationship.type'),reverseName:clip(r.reverseName,100,'relationship.reverseName'),description:clip(r.description,250,'relationship.description')}));
      }
    }
    if(draft!==undefined) {
      if(!draft || typeof draft!=='object' || !['owner','manager','author'].includes(world.role))bad('Draft checks require contribution permission',403);
      if(draft.worldId!==world.id || (s.kind==='entity'&&draft.entityId!==entity?.id) || (s.kind==='proposal'&&draft.proposalId!==proposal?.id))bad('Draft context does not match this page');
      if(s.kind!=='proposal'&&draft.proposalId!=null)bad('Use the matching proposal context');
      if(draft.proposalRevision!==undefined&&(!Number.isSafeInteger(draft.proposalRevision)||draft.proposalRevision<1))bad('Invalid proposal revision');
      if(draft.entityId!=null && (!Number.isSafeInteger(draft.entityId)||draft.entityId<=0))bad('Invalid draft entity');
      if(proposal && (proposal.contributor_id!==user.id || !['draft','rejected'].includes(proposal.status) || proposal.action_type==='delete'))bad('Only your editable proposal can supply unsaved input',403);
      if(s.kind==='world'&&(draft.entityId!=null||draft.proposalId!=null))bad('Use the matching entity or proposal context');
      if(proposal && (draft.entityId??null)!==(proposal.entity_id??null))bad('Draft entity does not match proposal');
      const c=draft.content;
      if(!c || typeof c.name!=='string'||c.name.length>150 || typeof c.entityType!=='string'||c.entityType.length>40 || typeof c.description!=='string'||c.description.length>10000 || c.body?.format!=='markdown'||typeof c.body.text!=='string'||c.body.text.length>200000)bad('Invalid draft content');
      if(draft.baseVersion!=null&&(!Number.isSafeInteger(draft.baseVersion)||draft.baseVersion<1))bad('Invalid draft base version');
      result.draft={source:'unsaved editor snapshot',notPublished:true,name:c.name,entityType:c.entityType,description:clip(c.description,2000,'draft.description'),baseVersion:draft.baseVersion??null};
      if(s.includeBody)result.draft.body=clip(c.body.text,6000,'draft.body');
      if(s.includeRelationships) {
        const links=c.outgoingRelationships??[];
        if(!Array.isArray(links)||links.length>100)bad('Invalid draft relationships');
        result.draft.relationships=links.map(r=>{
          if(!r||!Number.isSafeInteger(r.targetEntityId)||r.targetEntityId<=0||typeof r.type!=='string'||r.type.length>100||r.description!=null&&typeof r.description!=='string'||r.reverseName!=null&&typeof r.reverseName!=='string')bad('Invalid draft relationship');
          return {targetEntityId:r.targetEntityId,type:r.type,description:clip(r.description,250,'draft.relationship.description'),reverseName:clip(r.reverseName,100,'draft.relationship.reverseName')};
        });
      }
      result.label=c.name||'Untitled draft';
      result.scopeNote='Check the unsaved snapshot as a candidate replacement, not published canon. The published entity is a baseline, not a separate simultaneous fact. Differences alone are not contradictions.';
      if(entity && draft.baseVersion!=null && draft.baseVersion!==entity.version)result.draft.warning=`Draft is based on v${draft.baseVersion}; current published baseline is v${entity.version}.`;
      if(proposal && draft.proposalRevision!==undefined && draft.proposalRevision!==proposal.revision)result.draft.revisionWarning='The saved proposal revision changed after this editor snapshot was taken.';
    }
    let worldEntityIds=[];
    if(s.kind==='world'&&s.includeRelated){
      const [rows]=await db.execute('SELECT id FROM entities WHERE world_id=? AND deleted_at IS NULL ORDER BY id',[world.id]);
      worldEntityIds=rows.map(r=>r.id);
      if(s.includeRelationships){
        const [relationships]=await db.execute(`SELECT r.relationship_type AS type,r.reverse_name AS reverseName,r.description,r.source_entity_id AS sourceId,r.target_entity_id AS targetId,s.name AS sourceName,t.name AS targetName
          FROM relationships r JOIN entities s ON s.id=r.source_entity_id JOIN entities t ON t.id=r.target_entity_id
          WHERE r.world_id=? AND s.world_id=? AND t.world_id=? AND s.deleted_at IS NULL AND t.deleted_at IS NULL ORDER BY r.id`,[world.id,world.id,world.id]);
        result.world.relationships=relationships.map(r=>({...r,description:clip(r.description,250,'relationship.description')}));
      }
    }
    const links=[...(result.entity?.relationships??[]),...(result.proposal?.relationships??[]),...(result.draft?.relationships??[])];
    const automatic=s.includeRelated?s.includeRelationships?[...new Set(links.flatMap(r=>[r.sourceId,r.targetId,r.targetEntityId]).filter(id=>Number.isSafeInteger(id)&&id>0&&id!==entity?.id))]:[]:[];
    const manual=s.referenceIds.filter(id=>id!==entity?.id);
    const graph=await connections(world.id,entity?.id,manual);
    if(graph.limited)truncated.push('connection graph: first 5000 relationships; paths may be incomplete');
    result.connectionPaths=graph.paths;
    const intermediate=[...new Set(graph.paths.flatMap(p=>p.entityIds.slice(1,-1)))];
    const ids=[...new Set([...manual,...worldEntityIds,...automatic,...intermediate])];
    result.references=[];
    let textRemaining=24000;
    function referenceText(value,limit,field){
      const text=clip(value,Math.min(limit,textRemaining),field);textRemaining-=text.length;return text;
    }
    if(ids.length) {
      const [rows]=await db.execute(`SELECT id,name,entity_type,description,body,version FROM entities WHERE world_id=? AND deleted_at IS NULL AND id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`,[world.id,...ids]);
      if(manual.some(id=>!rows.some(r=>r.id===id)))bad('A selected reference is unavailable in this world',404);
      const byId=new Map(rows.map(r=>[r.id,r]));
      result.references=ids.filter(id=>byId.has(id)).map(id=>{
        const r=byId.get(id);
        return {id:r.id,name:r.name,type:r.entity_type,version:r.version,source:manual.includes(r.id)?'selected':worldEntityIds.includes(r.id)?'world entity':automatic.includes(r.id)?'direct relationship':'connection path',description:referenceText(r.description,800,`reference.${r.id}.description`),...(s.includeBody?{body:referenceText(parse(r.body)?.text,1500,`reference.${r.id}.body`)}:{})};
      });
    }
    result.checkedScope={worldId:world.id,baselineEntityId:entity?.id??null,referenceIds:result.references.map(r=>r.id),wholeWorldChecked:false};
    return result;
  }
  async function search(user,input) {
    const q=typeof input?.q==='string'?input.q.trim():'';
    if(q.length<2||q.length>120)bad('Enter 2 to 120 search characters');
    const current=await context(user,{...input.context,referenceIds:[],includeBody:false,includeRelationships:false,includeRelated:false});
    if(!current.world)bad('Open a world, entity or proposal to search references');
    const [rows]=await db.execute(`SELECT e.id,e.name,e.entity_type AS type,e.version,LEFT(e.description,280) AS description FROM entities e
      WHERE e.world_id=? AND e.deleted_at IS NULL AND (LOCATE(?,e.name)>0 OR LOCATE(?,e.description)>0 OR LOCATE(?,e.body)>0 OR EXISTS
      (SELECT 1 FROM entity_tags et JOIN tags t ON t.id=et.tag_id WHERE et.entity_id=e.id AND LOCATE(?,t.name)>0)) ORDER BY e.name,e.id LIMIT 10`,[current.world.id,q,q,q,q]);
    const graph=await connections(current.world.id,current.entity?.id,rows.map(r=>r.id));
    const intermediateIds=[...new Set(graph.paths.flatMap(p=>p.entityIds.slice(1,-1)))];
    let intermediates=[];
    if(intermediateIds.length){
      [intermediates]=await db.execute(`SELECT id,name,entity_type,description,body,version FROM entities WHERE world_id=? AND deleted_at IS NULL AND id IN (${intermediateIds.map(()=>'?').join(',')}) ORDER BY id`,[current.world.id,...intermediateIds]);
    }
    const byId=new Map(intermediates.map(r=>[r.id,{id:r.id,name:r.name,version:r.version}]));
    return {worldId:current.world.id,graphLimited:graph.limited,results:rows.map(r=>({...r,connection:graph.paths.find(p=>p.targetId===r.id),intermediates:(graph.paths.find(p=>p.targetId===r.id)?.entityIds.slice(1,-1)??[]).map(id=>byId.get(id)).filter(Boolean)}))};
  }
  async function prepare(user, body) {
    const request = validateRequest(body);
    const current = await context(user, body.context, body.draft);
    return { systemInstruction, taskInstruction: tasks[request.task], context: current, history: request.history, message: request.message };
  }
  async function preview(user, body) {
    const compiled = await prepare(user, body);
    const current = compiled.context;
    const subject = current.label;
    const advice = {
      general: 'State the detail you want to develop and any constraints the suggestion should respect.',
      expand: 'A connected model will propose a concrete addition, explain its connection to existing facts, and identify it as a suggestion.',
      consistency: 'A connected model will compare the supplied statements, point to possible conflicts, and separate missing information from contradictions.',
      relationships: 'A connected model will propose a direction, relationship label and optional reverse label, with a reason for each connection.',
    };
    return { mode:'preview', context:current, request:compiled,
      reply:`Preview prepared for ${subject}.\n\n${advice[body.task || 'general']}\n\nNo model has analysed this content. No Gemini request was sent and no world content was changed.` };
  }
  return { context, prepare, preview, search };
}
module.exports = { createAssistant, validateRequest, selection, systemInstruction };
