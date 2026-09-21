const router = require('express').Router();
const db = require('./db');
const { access, actions, writers, managers, id, fail, loginRequired, transaction } = require('./security');
const types=['character','location','nation','organisation','historical_event','item','other'];
const { normalizeRelationships, outgoing, validateTargets, replaceOutgoing } = require('./relationships');
function content(value) {
  if(!value || typeof value!=='object' || Array.isArray(value)) fail(400,'content is required');
  const { name, entityType, description='', body={format:'markdown',text:''} }=value;
  if(typeof name!=='string'||!name.trim()||name.length>150||!types.includes(entityType)||typeof description!=='string'||description.length>10000
    ||!body||body.format!=='markdown'||typeof body.text!=='string'||body.text.length>200000) fail(400,'Invalid entity content');
  return {name:name.trim(),entityType,description,body:{format:'markdown',text:body.text},
    ...(value.outgoingRelationships !== undefined ? {outgoingRelationships:normalizeRelationships(value.outgoingRelationships)} : {})};
}
const parse=value=>typeof value==='string'?JSON.parse(value):value;
function dto(p) {return {id:p.id,worldId:p.world_id,entityId:p.entity_id,authorId:p.contributor_id,action:p.action_type,
  content:parse(p.proposed_content),status:p.status,baseVersion:p.base_version,revision:p.revision,
  reviewComment:p.review_comment,reviewedBy:p.reviewed_by,createdAt:p.created_at,updatedAt:p.updated_at};}
async function entity(c,entityId,worldId) {
  const [[e]]=await c.execute('SELECT * FROM entities WHERE id=? AND world_id=? AND deleted_at IS NULL',[id(entityId),worldId]);
  if(!e) fail(404,'Entity not found in this world');return e;
}
function checkRevision(req,p) {if(id(req.body.revision)!==p.revision) fail(409,'Draft changed; reload the latest revision');}
async function proposal(c,req,lock=false) {
  loginRequired(req);
  const [[initial]]=await c.execute('SELECT world_id FROM contributions WHERE id=?',[id(req.params.id)]);
  if(!initial) fail(404,'Proposal not found');
  const w=await access(c,initial.world_id,req.user,undefined,lock);
  const [[p]]=await c.execute('SELECT * FROM contributions WHERE id=?'+(lock?' FOR UPDATE':''),[id(req.params.id)]);
  if(!p) fail(404,'Proposal not found');
  // Former members cannot access proposals, even when the world is public.
  if(!w.role || (p.contributor_id!==req.user.id && (p.status==='draft'||!managers.includes(w.role)))) fail(404,'Proposal not found');
  return {p,w};
}
async function snapshot(c,e,actor,proposalId=null) {
  const relationships=await outgoing(c,e.id,e.world_id);
  await c.execute('INSERT IGNORE INTO entity_versions (entity_id,version,snapshot,actor_id,proposal_id) VALUES (?,?,?,?,?)',
    [e.id,e.version,JSON.stringify({...e,outgoingRelationships:relationships}),actor,proposalId]);
}
async function canReview(c,p,w,userId) {
  if(p.contributor_id===userId) return false;
  if(w.role==='owner') return true;
  if(w.role!=='manager'||parse(p.proposed_content)?.requiresOwnerReview||p.contributor_id===w.owner_id) return false;
  const [[author]]=await c.execute("SELECT role FROM world_members WHERE world_id=? AND user_id=? AND status='approved'",[w.id,p.contributor_id]);
  return author?.role==='author';
}
async function publish(c,p,actor) {
  let entityId=p.entity_id;
  const proposed=parse(p.proposed_content);
  if(p.action_type!=='delete') await validateTargets(c,content(proposed).outgoingRelationships,p.world_id,entityId);
  if(p.action_type==='create') {
    const v=content(proposed);
    const [r]=await c.execute('INSERT INTO entities (world_id,entity_type,name,description,body,created_by) VALUES (?,?,?,?,?,?)',
      [p.world_id,v.entityType,v.name,v.description,JSON.stringify(v.body),p.contributor_id]);entityId=r.insertId;
  } else {
    const e=await entity(c,entityId,p.world_id);
    if(e.version!==p.base_version) fail(409,'Published entity changed; reload the latest content and resolve your changes');
    await snapshot(c,e,actor);
    if(p.action_type==='delete') {
      await c.execute('UPDATE entities SET deleted_at=NOW(),version=version+1 WHERE id=?',[e.id]);
    } else {
      const v=content(proposed);
      await c.execute('UPDATE entities SET name=?,entity_type=?,description=?,body=?,version=version+1 WHERE id=?',
        [v.name,v.entityType,v.description,JSON.stringify(v.body),e.id]);
    }
  }
  if(p.action_type!=='delete') await replaceOutgoing(c,content(proposed).outgoingRelationships,p.world_id,entityId);
  const [[updated]]=await c.execute('SELECT * FROM entities WHERE id=?',[entityId]);
  await snapshot(c,updated,actor,p.id||null);
  await c.execute('UPDATE worlds SET updated_at=CURRENT_TIMESTAMP WHERE id=?',[p.world_id]);
  return entityId;
}
router.get('/api/entities/:id/edit-context',async(req,res)=>{
  loginRequired(req);
  const [[e]]=await db.execute('SELECT * FROM entities WHERE id=? AND deleted_at IS NULL',[id(req.params.id)]);
  if(!e) fail(404,'Entity not found');const w=await access(db,e.world_id,req.user,writers);
  res.json({entityId:e.id,worldId:w.id,baseVersion:e.version,content:{name:e.name,entityType:e.entity_type,description:e.description||'',body:parse(e.body)||{format:'markdown',text:''},outgoingRelationships:await outgoing(db,e.id,w.id)},allowedActions:actions(w.role)});
});
router.get('/api/worlds/:worldId/relationship-targets',async(req,res)=>{
  loginRequired(req);const w=await access(db,req.params.worldId,req.user,writers);
  const q=req.query.q??'';
  if(typeof q!=='string'||q.length>150) fail(400,'Invalid search');
  const selected=String(req.query.selected||'').split(',').filter(Boolean).map(Number);
  if(selected.length>50||selected.some(n=>!Number.isSafeInteger(n)||n<1)) fail(400,'Invalid selected targets');
  const list=selected.length?selected:[0];
  const placeholders=list.map(()=>'?').join(',');
  const [entities]=await db.execute(`SELECT id,name,entity_type AS type FROM entities
    WHERE world_id=? AND deleted_at IS NULL AND (LOCATE(?,name)>0 OR id IN (${placeholders}))
    ORDER BY (id IN (${placeholders})) DESC,name,id LIMIT 100`,[w.id,q.trim(),...list,...list]);
  res.json({entities});
});
router.post('/api/worlds/:worldId/proposals',async(req,res)=>{
  loginRequired(req);
  const result=await transaction(async c=>{
    const w=await access(c,req.params.worldId,req.user,writers,true);
    const {action,entityId,baseVersion}=req.body;
    if(!['create','edit','delete'].includes(action)) fail(400,'Invalid action');
    let target=null,base=null;
    if(action==='create') {if(entityId!=null||baseVersion!=null) fail(400,'Create has no entityId or baseVersion');}
    else {target=id(entityId);base=id(baseVersion);const e=await entity(c,target,w.id);if(e.version!==base) fail(409,'Entity version changed');}
    const v=action==='delete'?{}:content(req.body.content);
    await validateTargets(c,v.outgoingRelationships,w.id,target);
    if(w.role==='manager') v.requiresOwnerReview=true;
    const [r]=await c.execute("INSERT INTO contributions (world_id,entity_id,contributor_id,action_type,proposed_content,status,base_version) VALUES (?,?,?,?,?,'draft',?)",
      [w.id,target,req.user.id,action,JSON.stringify(v),base]);
    const [[p]]=await c.execute('SELECT * FROM contributions WHERE id=?',[r.insertId]);return dto(p);
  });res.status(201).json({proposal:result});
});
router.get('/api/worlds/:worldId/proposals',async(req,res)=>{
  loginRequired(req);const w=await access(db,req.params.worldId,req.user);
  if(!w.role) fail(403,'Membership required');
  const [rows]=await db.execute(`SELECT * FROM contributions WHERE world_id=? AND
    (contributor_id=? OR (?=1 AND status<>'draft')) ORDER BY updated_at DESC`,[w.id,req.user.id,managers.includes(w.role)?1:0]);
  res.json({proposals:rows.map(dto)});
});
router.get('/api/proposals/:id',async(req,res)=>{
  const {p,w}=await proposal(db,req);
  res.json({proposal:{...dto(p),canReview:await canReview(db,p,w,req.user.id)}});
});
router.delete('/api/proposals/:id',async(req,res)=>{
  await transaction(async c=>{
    const {p}=await proposal(c,req,true);
    if(p.contributor_id!==req.user.id) fail(403,'Only the author can delete this draft');
    if(p.status!=='draft') fail(409,'Only drafts can be deleted; withdraw pending proposals first');
    checkRevision(req,p);
    await c.execute('DELETE FROM contributions WHERE id=?',[p.id]);
  });res.json({message:'Draft deleted'});
});
router.patch('/api/proposals/:id',async(req,res)=>{
  const result=await transaction(async c=>{
    const {p,w}=await proposal(c,req,true);
    if(p.contributor_id!==req.user.id||!writers.includes(w.role)) fail(403,'Only the author can save this draft');
    if(!['draft','rejected'].includes(p.status)) fail(409,'Withdraw before editing');checkRevision(req,p);
    const v=p.action_type==='delete'?{}:content(req.body.content);
    if(v.outgoingRelationships===undefined && parse(p.proposed_content)?.outgoingRelationships!==undefined)
      v.outgoingRelationships=parse(p.proposed_content).outgoingRelationships;
    await validateTargets(c,v.outgoingRelationships,w.id,p.entity_id);
    if(w.role==='manager'||parse(p.proposed_content)?.requiresOwnerReview) v.requiresOwnerReview=true;
    let base=p.base_version;
    if(p.action_type!=='create') {
      base=id(req.body.baseVersion??base);const e=await entity(c,p.entity_id,w.id);
      if(e.version!==base) fail(409,'Reload edit-context and resolve changes before saving');
    }
    await c.execute("UPDATE contributions SET proposed_content=?,base_version=?,status='draft',revision=revision+1 WHERE id=?",[JSON.stringify(v),base,p.id]);
    const [[updated]]=await c.execute('SELECT * FROM contributions WHERE id=?',[p.id]);return dto(updated);
  });res.json({proposal:result});
});
for(const transition of ['submit','withdraw']) router.post('/api/proposals/:id/'+transition,async(req,res)=>{
  const result=await transaction(async c=>{
    const {p,w}=await proposal(c,req,true);
    if(p.contributor_id!==req.user.id||!writers.includes(w.role)) fail(403,'Only the author can change this proposal');
    checkRevision(req,p);
    if(transition==='submit') {
      if(p.status!=='draft') fail(409,'Only drafts can be submitted');
      if(p.action_type!=='create') {const e=await entity(c,p.entity_id,w.id);if(e.version!==p.base_version) fail(409,'Entity version changed');}
      await validateTargets(c,parse(p.proposed_content)?.outgoingRelationships,w.id,p.entity_id);
      if(w.role==='manager') await c.execute('UPDATE contributions SET proposed_content=? WHERE id=?',
        [JSON.stringify({...parse(p.proposed_content),requiresOwnerReview:true}),p.id]);
    } else if(p.status!=='pending') fail(409,'Only pending proposals can be withdrawn');
    await c.execute('UPDATE contributions SET status=?,revision=revision+1 WHERE id=?',[transition==='submit'?'pending':'draft',p.id]);
    const [[updated]]=await c.execute('SELECT * FROM contributions WHERE id=?',[p.id]);return dto(updated);
  });res.json({proposal:result});
});
router.post('/api/proposals/:id/review',async(req,res)=>{
  const result=await transaction(async c=>{
    const {p,w}=await proposal(c,req,true);
    if(!await canReview(c,p,w,req.user.id)) fail(403,'Only the Owner can review Manager proposals; self-review is forbidden');
    if(p.status!=='pending') fail(409,'Only pending proposals can be reviewed');checkRevision(req,p);
    const {decision,comment=''}=req.body;
    if(!['approve','reject'].includes(decision)||typeof comment!=='string'||comment.length>10000) fail(400,'Invalid review');
    const target=decision==='approve'?await publish(c,p,req.user.id):p.entity_id;
    await c.execute('UPDATE contributions SET entity_id=?,status=?,reviewed_by=?,review_comment=?,reviewed_at=NOW(),revision=revision+1 WHERE id=?',
      [target,decision==='approve'?'approved':'rejected',req.user.id,comment,p.id]);
    const [[updated]]=await c.execute('SELECT * FROM contributions WHERE id=?',[p.id]);return dto(updated);
  });res.json({proposal:result});
});
router.post('/api/worlds/:worldId/entities',async(req,res)=>{
  loginRequired(req);
  const result=await transaction(async c=>{
    const w=await access(c,req.params.worldId,req.user,['owner'],true);
    const entityId=await publish(c,{world_id:w.id,action_type:'create',
      contributor_id:req.user.id,proposed_content:content(req.body.content)},req.user.id);
    return {id:entityId,version:1};
  });res.status(201).json({entity:result});
});
router.delete('/api/entities/:id',async(req,res)=>{
  loginRequired(req);
  await transaction(async c=>{
    const [[e]]=await c.execute('SELECT world_id FROM entities WHERE id=? AND deleted_at IS NULL',[id(req.params.id)]);
    if(!e) fail(404,'Entity not found');
    await access(c,e.world_id,req.user,['owner'],true);
    await publish(c,{world_id:e.world_id,entity_id:id(req.params.id),
      base_version:id(req.body.baseVersion),action_type:'delete',proposed_content:{}},req.user.id);
  });res.json({message:'Entity deleted'});
});
router.patch('/api/entities/:id',async(req,res)=>{
  loginRequired(req);
  const result=await transaction(async c=>{
    const [[e]]=await c.execute('SELECT world_id FROM entities WHERE id=? AND deleted_at IS NULL',[id(req.params.id)]);
    if(!e) fail(404,'Entity not found');await access(c,e.world_id,req.user,['owner'],true);
    await publish(c,{world_id:e.world_id,entity_id:id(req.params.id),base_version:id(req.body.baseVersion),action_type:'edit',proposed_content:content(req.body.content)},req.user.id);
    const [[updated]]=await c.execute('SELECT id,version FROM entities WHERE id=?',[id(req.params.id)]);return updated;
  });res.json({entity:result});
});
router.get('/api/entities/:id/versions',async(req,res)=>{
  loginRequired(req);
  const [[e]]=await db.execute('SELECT id,world_id,name,version,deleted_at FROM entities WHERE id=?',[id(req.params.id)]);
  if(!e) fail(404,'Entity not found');const w=await access(db,e.world_id,req.user,writers);
  const [versions]=await db.execute(`SELECT v.*,u.username AS actor_name FROM entity_versions v
    JOIN users u ON u.id=v.actor_id WHERE v.entity_id=? ORDER BY v.version DESC`,[e.id]);
  res.json({entity:{id:e.id,name:e.name,worldId:w.id,version:e.version,deleted:!!e.deleted_at},
    allowedActions:actions(w.role),versions:versions.map(v=>({...v,snapshot:parse(v.snapshot)}))});
});
router.post('/api/entities/:id/rollback',async(req,res)=>{
  loginRequired(req);
  const result=await transaction(async c=>{
    const entityId=id(req.params.id);
    const [[initial]]=await c.execute('SELECT world_id FROM entities WHERE id=?',[entityId]);
    if(!initial) fail(404,'Entity not found');
    await access(c,initial.world_id,req.user,managers,true);
    const {baseVersion,targetVersion}=req.body;
    if(!Number.isSafeInteger(baseVersion)||baseVersion<1||!Number.isSafeInteger(targetVersion)||targetVersion<1)
      fail(400,'baseVersion and targetVersion must be positive integers');
    const [[e]]=await c.execute('SELECT * FROM entities WHERE id=? FOR UPDATE',[entityId]);
    if(e.version!==baseVersion) fail(409,'Entity changed; reload history before rolling back');
    if(targetVersion>=e.version) fail(400,'Choose an earlier version');
    const [[record]]=await c.execute('SELECT snapshot FROM entity_versions WHERE entity_id=? AND version=?',[e.id,targetVersion]);
    if(!record) fail(404,'Version not found for this entity');
    const old=parse(record.snapshot);
    if(old.deleted_at) fail(400,'Cannot restore a deleted snapshot; choose a version before deletion');
    const v=content({name:old.name,entityType:old.entity_type,description:old.description||'',
      body:parse(old.body)||{format:'markdown',text:''},outgoingRelationships:old.outgoingRelationships});
    await validateTargets(c,v.outgoingRelationships,e.world_id,e.id);
    await snapshot(c,e,req.user.id);
    await c.execute('UPDATE entities SET name=?,entity_type=?,description=?,body=?,deleted_at=NULL,version=version+1 WHERE id=?',
      [v.name,v.entityType,v.description,JSON.stringify(v.body),e.id]);
    await replaceOutgoing(c,v.outgoingRelationships,e.world_id,e.id);
    const [[updated]]=await c.execute('SELECT * FROM entities WHERE id=?',[e.id]);
    await snapshot(c,{...updated,rollback_of_version:targetVersion},req.user.id);
    await c.execute('UPDATE worlds SET updated_at=CURRENT_TIMESTAMP WHERE id=?',[e.world_id]);
    return {id:e.id,version:updated.version,restoredFromVersion:targetVersion};
  });
  res.json({entity:result});
});
module.exports=router;
