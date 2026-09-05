const router = require('express').Router();
const db = require('./db');
const { access, actions, writers, managers, id, fail, loginRequired, transaction } = require('./security');
const types=['character','location','nation','organisation','historical_event','item','other'];
function content(value) {
  if(!value || typeof value!=='object' || Array.isArray(value)) fail(400,'content is required');
  const { name, entityType, description='', body={format:'markdown',text:''} }=value;
  if(typeof name!=='string'||!name.trim()||name.length>150||!types.includes(entityType)||typeof description!=='string'||description.length>10000
    ||!body||body.format!=='markdown'||typeof body.text!=='string'||body.text.length>200000) fail(400,'Invalid entity content');
  return {name:name.trim(),entityType,description,body:{format:'markdown',text:body.text}};
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
  await c.execute('INSERT IGNORE INTO entity_versions (entity_id,version,snapshot,actor_id,proposal_id) VALUES (?,?,?,?,?)',
    [e.id,e.version,JSON.stringify(e),actor,proposalId]);
}
async function publish(c,p,actor) {
  let entityId=p.entity_id;
  const proposed=parse(p.proposed_content);
  if(p.action_type==='create') {
    const v=content(proposed);
    const [r]=await c.execute('INSERT INTO entities (world_id,entity_type,name,description,body,created_by) VALUES (?,?,?,?,?,?)',
      [p.world_id,v.entityType,v.name,v.description,JSON.stringify(v.body),p.contributor_id]);entityId=r.insertId;
  } else {
    const e=await entity(c,entityId,p.world_id);
    if(e.version!==p.base_version) fail(409,'Published entity changed; withdraw and rebase the proposal');
    await snapshot(c,e,actor);
    if(p.action_type==='delete') {
      await c.execute('UPDATE entities SET deleted_at=NOW(),version=version+1 WHERE id=?',[e.id]);
    } else {
      const v=content(proposed);
      await c.execute('UPDATE entities SET name=?,entity_type=?,description=?,body=?,version=version+1 WHERE id=?',
        [v.name,v.entityType,v.description,JSON.stringify(v.body),e.id]);
    }
  }
  const [[updated]]=await c.execute('SELECT * FROM entities WHERE id=?',[entityId]);
  await snapshot(c,updated,actor,p.id||null);
  await c.execute('UPDATE worlds SET updated_at=CURRENT_TIMESTAMP WHERE id=?',[p.world_id]);
  return entityId;
}
router.get('/api/entities/:id/edit-context',async(req,res)=>{
  loginRequired(req);
  const [[e]]=await db.execute('SELECT * FROM entities WHERE id=? AND deleted_at IS NULL',[id(req.params.id)]);
  if(!e) fail(404,'Entity not found');const w=await access(db,e.world_id,req.user,writers);
  res.json({entityId:e.id,worldId:w.id,baseVersion:e.version,content:{name:e.name,entityType:e.entity_type,description:e.description||'',body:parse(e.body)||{format:'markdown',text:''}},allowedActions:actions(w.role)});
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
router.get('/api/proposals/:id',async(req,res)=>res.json({proposal:dto((await proposal(db,req)).p)}));
router.patch('/api/proposals/:id',async(req,res)=>{
  const result=await transaction(async c=>{
    const {p,w}=await proposal(c,req,true);
    if(p.contributor_id!==req.user.id||!writers.includes(w.role)) fail(403,'Only the author can save this draft');
    if(!['draft','rejected'].includes(p.status)) fail(409,'Withdraw before editing');checkRevision(req,p);
    const v=p.action_type==='delete'?{}:content(req.body.content);
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
    } else if(p.status!=='pending') fail(409,'Only pending proposals can be withdrawn');
    await c.execute('UPDATE contributions SET status=?,revision=revision+1 WHERE id=?',[transition==='submit'?'pending':'draft',p.id]);
    const [[updated]]=await c.execute('SELECT * FROM contributions WHERE id=?',[p.id]);return dto(updated);
  });res.json({proposal:result});
});
router.post('/api/proposals/:id/review',async(req,res)=>{
  const result=await transaction(async c=>{
    const {p,w}=await proposal(c,req,true);
    if(!managers.includes(w.role)||p.contributor_id===req.user.id) fail(403,'A different manager or owner must review');
    if(p.status!=='pending') fail(409,'Only pending proposals can be reviewed');checkRevision(req,p);
    const {decision,comment=''}=req.body;
    if(!['approve','reject'].includes(decision)||typeof comment!=='string'||comment.length>10000) fail(400,'Invalid review');
    const target=decision==='approve'?await publish(c,p,req.user.id):p.entity_id;
    await c.execute('UPDATE contributions SET entity_id=?,status=?,reviewed_by=?,review_comment=?,reviewed_at=NOW(),revision=revision+1 WHERE id=?',
      [target,decision==='approve'?'approved':'rejected',req.user.id,comment,p.id]);
    const [[updated]]=await c.execute('SELECT * FROM contributions WHERE id=?',[p.id]);return dto(updated);
  });res.json({proposal:result});
});
router.patch('/api/entities/:id',async(req,res)=>{
  loginRequired(req);
  const result=await transaction(async c=>{
    const [[e]]=await c.execute('SELECT world_id FROM entities WHERE id=? AND deleted_at IS NULL',[id(req.params.id)]);
    if(!e) fail(404,'Entity not found');await access(c,e.world_id,req.user,managers,true);
    await publish(c,{world_id:e.world_id,entity_id:id(req.params.id),base_version:id(req.body.baseVersion),action_type:'edit',proposed_content:content(req.body.content)},req.user.id);
    const [[updated]]=await c.execute('SELECT id,version FROM entities WHERE id=?',[id(req.params.id)]);return updated;
  });res.json({entity:result});
});
router.get('/api/entities/:id/versions',async(req,res)=>{
  const [[e]]=await db.execute('SELECT world_id FROM entities WHERE id=?',[id(req.params.id)]);
  if(!e) fail(404,'Entity not found');await access(db,e.world_id,req.user,managers);
  const [versions]=await db.execute('SELECT * FROM entity_versions WHERE entity_id=? ORDER BY version DESC',[id(req.params.id)]);res.json({versions});
});
module.exports=router;
