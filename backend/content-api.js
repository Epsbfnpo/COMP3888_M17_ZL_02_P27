const router = require('express').Router();
const db = require('./db');
const { access, visible, id, loginRequired, actions, managers, fail, transaction } = require('./security');
const uid = req => req.user?.id || 0;

async function listWorlds(req, mine) {
  const [worlds] = await db.execute(`SELECT w.*, u.username AS owner_username,
    CASE WHEN w.owner_id=? THEN 'owner' ELSE wm.role END AS access_role,
    (SELECT COUNT(*) FROM entities e WHERE e.world_id=w.id AND e.deleted_at IS NULL) AS entity_count
    FROM worlds w JOIN users u ON u.id=w.owner_id
    LEFT JOIN world_members wm ON wm.world_id=w.id AND wm.user_id=? AND wm.status='approved'
    WHERE ${mine ? '(w.owner_id=? OR wm.user_id=?)' : visible()} ORDER BY w.updated_at DESC`,
  [uid(req), uid(req), uid(req), uid(req)]);
  return worlds.map(w => ({ ...w, allowedActions: actions(w.access_role) }));
}
router.get('/api/worlds', async (req,res) => res.json({ worlds: await listWorlds(req,false) }));
router.get('/api/users/:id/worlds', async (req,res) => {
  loginRequired(req);
  if (id(req.params.id)!==req.user.id) fail(403,'Only your own membership list is available');
  res.json({ worlds: await listWorlds(req,true) });
});
router.get('/api/worlds/:id', async (req,res) => {
  const world = await access(db,req.params.id,req.user);
  res.json({ world: { ...world, allowedActions: actions(world.role) } });
});
router.post('/api/worlds', async (req,res) => {
  loginRequired(req);
  const { name, description = '', visibility = 'private' } = req.body;
  if (typeof name!=='string' || !name.trim() || name.length>150 || typeof description!=='string' || !['public','private'].includes(visibility)) fail(400,'Invalid world');
  const [result] = await db.execute('INSERT INTO worlds (name,description,visibility,owner_id) VALUES (?,?,?,?)',[name.trim(),description,visibility,req.user.id]);
  res.status(201).json({ world: { id: result.insertId, name: name.trim(), description, visibility, owner_id: req.user.id } });
});
router.patch('/api/worlds/:id', async (req,res) => {
  loginRequired(req);
  await transaction(async c => {
    const w=await access(c,req.params.id,req.user,['owner'],true);
    const { name=w.name, description=w.description ?? '', visibility=w.visibility }=req.body;
    if(typeof name!=='string'||!name.trim()||name.length>150||typeof description!=='string'||!['public','private'].includes(visibility)) fail(400,'Invalid world');
    await c.execute('UPDATE worlds SET name=?,description=?,visibility=? WHERE id=?',[name.trim(),description,visibility,w.id]);
  });
  res.json({ message:'World updated' });
});
router.delete('/api/worlds/:id', async (req,res) => {
  loginRequired(req);
  await transaction(async c=>{ const w=await access(c,req.params.id,req.user,['owner'],true);
    if(req.body.confirmName!==w.name) fail(400,'Confirm the exact world name');
    await c.execute('DELETE FROM worlds WHERE id=?',[w.id]); });
  res.json({ message:'World deleted' });
});
router.post('/api/worlds/:id/transfer', async (req,res) => {
  loginRequired(req);
  await transaction(async c=>{
    const w=await access(c,req.params.id,req.user,['owner'],true); const target=id(req.body.userId);
    const [[m]]=await c.execute("SELECT user_id FROM world_members WHERE world_id=? AND user_id=? AND status='approved'",[w.id,target]);
    if(!m) fail(400,'New owner must be an approved member');
    await c.execute('UPDATE worlds SET owner_id=? WHERE id=?',[target,w.id]);
    await c.execute('DELETE FROM world_members WHERE world_id=? AND user_id=?',[w.id,target]);
    await c.execute("INSERT INTO world_members (world_id,user_id,role,status) VALUES (?,?,'manager','approved') ON DUPLICATE KEY UPDATE role='manager',status='approved'",[w.id,req.user.id]);
  }); res.json({message:'Ownership transferred'});
});
router.get('/api/worlds/:id/members',async(req,res)=>{
  await access(db,req.params.id,req.user,managers);
  const [members]=await db.execute('SELECT wm.*,u.username FROM world_members wm JOIN users u ON u.id=wm.user_id WHERE world_id=?',[id(req.params.id)]);
  res.json({members});
});
router.put('/api/worlds/:id/members/:userId',async(req,res)=>{
  loginRequired(req);
  await transaction(async c=>{
    const w=await access(c,req.params.id,req.user,managers,true); const target=id(req.params.userId);
    const {role,status='approved'}=req.body;
    if(!['manager','author','reader'].includes(role)||!['pending','approved','rejected'].includes(status)) fail(400,'Invalid membership');
    const [[old]]=await c.execute('SELECT role FROM world_members WHERE world_id=? AND user_id=?',[w.id,target]);
    if(target===w.owner_id||target===req.user.id|| (w.role!=='owner'&&(role==='manager'||old?.role==='manager'))) fail(403,'Cannot change this membership');
    const [[user]]=await c.execute('SELECT id FROM users WHERE id=?',[target]); if(!user) fail(404,'User not found');
    await c.execute('INSERT INTO world_members (world_id,user_id,role,status) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role),status=VALUES(status)',[w.id,target,role,status]);
  }); res.json({message:'Membership updated'});
});
router.delete('/api/worlds/:id/members/:userId',async(req,res)=>{
  loginRequired(req);
  await transaction(async c=>{
    const w=await access(c,req.params.id,req.user,managers,true);const target=id(req.params.userId);
    const [[m]]=await c.execute('SELECT role FROM world_members WHERE world_id=? AND user_id=?',[w.id,target]);
    if(target===w.owner_id||target===req.user.id||(w.role!=='owner'&&m?.role==='manager')) fail(403,'Cannot remove this member');
    await c.execute('DELETE FROM world_members WHERE world_id=? AND user_id=?',[w.id,target]);
  });res.json({message:'Membership removed'});
});
router.get('/api/tags',async(req,res)=>{
  const [tags]=await db.execute(`SELECT DISTINCT t.name FROM tags t JOIN entity_tags et ON et.tag_id=t.id
    JOIN entities e ON e.id=et.entity_id JOIN worlds w ON w.id=e.world_id
    WHERE e.deleted_at IS NULL AND ${visible()} ORDER BY t.name`,[uid(req),uid(req)]);
  res.json({tags:tags.map(t=>t.name)});
});
router.get('/api/entities/search',async(req,res)=>{
  const q=typeof req.query.q==='string'?req.query.q.trim():''; const tag=typeof req.query.tag==='string'?req.query.tag.trim():'';
  const [rows]=await db.execute(`SELECT e.id,e.name,e.entity_type AS type,e.description,w.id AS world_id,w.name AS world_name,
    GROUP_CONCAT(DISTINCT t.name ORDER BY t.name) AS tag_names
    FROM entities e JOIN worlds w ON w.id=e.world_id LEFT JOIN entity_tags et ON et.entity_id=e.id LEFT JOIN tags t ON t.id=et.tag_id
    WHERE e.deleted_at IS NULL AND ${visible()} AND
    (?='' OR e.name LIKE ? OR e.description LIKE ? OR e.entity_type LIKE ? OR w.name LIKE ? OR t.name LIKE ?)
    AND (?='' OR EXISTS (SELECT 1 FROM entity_tags xt JOIN tags tt ON tt.id=xt.tag_id WHERE xt.entity_id=e.id AND tt.name LIKE ?))
    GROUP BY e.id,w.id ORDER BY e.updated_at DESC`,[uid(req),uid(req),q,...Array(5).fill('%'+q+'%'),tag,'%'+tag+'%']);
  res.json({results:rows.map(e=>({...e,tags:e.tag_names?e.tag_names.split(','):[],world:{id:e.world_id,name:e.world_name}}))});
});
router.get('/api/entities/:id',async(req,res)=>{
  const [[e]]=await db.execute('SELECT e.*,u.username AS creator_username FROM entities e LEFT JOIN users u ON u.id=e.created_by WHERE e.id=? AND e.deleted_at IS NULL',[id(req.params.id)]);
  if(!e) fail(404,'Entity not found');const w=await access(db,e.world_id,req.user);
  const [tags]=await db.execute('SELECT t.name FROM tags t JOIN entity_tags et ON et.tag_id=t.id WHERE et.entity_id=?',[e.id]);
  const [rels]=await db.execute(`SELECT r.*,s.name AS source_name,s.entity_type AS source_type,t.name AS target_name,t.entity_type AS target_type
    FROM relationships r JOIN entities s ON s.id=r.source_entity_id JOIN entities t ON t.id=r.target_entity_id
    WHERE (r.source_entity_id=? OR r.target_entity_id=?) AND r.world_id=? AND s.world_id=? AND t.world_id=? AND s.deleted_at IS NULL AND t.deleted_at IS NULL`,[e.id,e.id,w.id,w.id,w.id]);
  res.json({entity:{...e,type:e.entity_type,world:{id:w.id,name:w.name},creator:e.created_by?{id:e.created_by,username:e.creator_username}:null,
    tags:tags.map(t=>t.name),allowedActions:actions(w.role),relationships:rels.map(r=>{const out=r.source_entity_id===e.id;return {id:r.id,type:r.relationship_type,description:r.description,direction:out?'outgoing':'incoming',entity:{id:out?r.target_entity_id:r.source_entity_id,name:out?r.target_name:r.source_name,type:out?r.target_type:r.source_type}};})}});
});
module.exports=router;
