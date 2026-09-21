// Integration test against an isolated, temporary MySQL database, never the application database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname,'../.env') });

test('world access and proposal lifecycle', async () => {
  const name='wb_permissions_test_'+Date.now();
  const admin=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,port:+process.env.DB_PORT||3306,multipleStatements:true});
  let server,pool;let assertions=0;let created=false;
  try {
    await admin.query('CREATE DATABASE `'+name+'`');created=true;await admin.query('USE `'+name+'`');
    for(const filename of ['schema.sql','worldbuilding_schema.sql','permissions.sql']) {
      const sql=fs.readFileSync(path.join(__dirname,'../database',filename),'utf8').replace(/CREATE DATABASE IF NOT EXISTS worldbuilding;/g,'').replace(/USE worldbuilding;/g,'');
      await admin.query(sql);
    }
    process.env.DB_NAME=name;
    const app=require('../server');pool=require('../db');
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    async function request(user,method,url,body,status=200) {
      const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(user?.cookie?{Cookie:user.cookie}:{})},...(method==='GET'?{}:{body:JSON.stringify(body||{})})});
      const data=await r.json();assert.equal(r.status,status,`${method} ${url}: ${JSON.stringify(data)}`);assertions++;return {data,response:r};
    }
    async function account(label) {
      const email=label+'@example.com';const {data}=await request(null,'POST','/register',{username:label,email,password:'Test123!'},201);
      const login=await request(null,'POST','/login',{email,password:'Test123!'});
      assert.match(login.response.headers.get('set-cookie'),/HttpOnly/i);
      return {id:data.user.id,cookie:login.response.headers.get('set-cookie').split(';')[0]};
    }
    const owner=await account('owner'),manager=await account('manager'),author=await account('author'),reader=await account('reader'),outsider=await account('outsider');
    await request(null,'GET','/auth/me',null,401);
    await request(owner,'GET','/auth/me');
    await request(author,'GET',`/api/users/${owner.id}/worlds`,null,403);
    await request(author,'PUT',`/api/users/${owner.id}/profile`,{},403);
    assert.equal((await fetch(base+'/users')).status,404);assertions++;
    const w=(await request(owner,'POST','/api/worlds',{name:'Private fixture'},201)).data.world.id;
    for(const [u,role] of [[manager,'manager'],[author,'author'],[reader,'reader']]) await request(owner,'PUT',`/api/worlds/${w}/members/${u.id}`,{role});
    const searchPath=`/api/worlds/${w}/member-candidates?q=`;
    await request(null,'GET',searchPath+'rea',null,401);
    for(const user of [author,reader]) await request(user,'GET',searchPath+'rea',null,403);
    await request(outsider,'GET',searchPath+'rea',null,404);
    await request(owner,'GET',searchPath+'re',null,400);
    await request(owner,'GET',searchPath+'x'.repeat(101),null,400);
    const matches=(await request(owner,'GET',searchPath+'%20REA%20')).data.users;
    assert.deepEqual(matches,[{id:reader.id,username:'reader',email:'reader@example.com'}]);
    assert.deepEqual((await request(owner,'GET',searchPath+'owner')).data.users,[]);
    assert.deepEqual((await request(manager,'GET',searchPath+'manager')).data.users,[]);
    assert.deepEqual((await request(owner,'GET',searchPath+'missing')).data.users,[]);
    assert.deepEqual((await request(owner,'GET',searchPath+'%25%25%25')).data.users,[]);
    assert.deepEqual((await request(owner,'GET',searchPath+'rea_')).data.users,[]);
    await request(manager,'PUT',`/api/worlds/${w}/members/${matches[0].id}`,{role:'reader'});
    const candidate=(await request(manager,'GET',searchPath+'outsider%40example.com')).data.users[0];
    await request(manager,'PUT',`/api/worlds/${w}/members/${candidate.id}`,{role:'author'});
    assert.equal((await request(outsider,'GET',`/api/worlds/${w}`)).data.world.role,'author');
    await request(manager,'DELETE',`/api/worlds/${w}/members/${candidate.id}`);
    const [otherManager]=await admin.execute('INSERT INTO users (username,email,password_hash) VALUES (?,?,?)',['Other manager','manager2@example.com','unused-test-hash']);
    await request(owner,'PUT',`/api/worlds/${w}/members/${otherManager.insertId}`,{role:'manager'});
    assert.equal((await request(owner,'GET',searchPath+'manager')).data.users.length,2);
    assert.deepEqual((await request(manager,'GET',searchPath+'manager')).data.users,[]);
    for(let i=0;i<12;i++) await admin.execute('INSERT INTO users (username,email,password_hash) VALUES (?,?,?)',['Candidate',`candidate${String(i).padStart(2,'0')}@example.com`,'unused-test-hash']);
    const limited=(await request(owner,'GET',searchPath+'candidate')).data.users;
    assert.equal(limited.length,10);
    assert.deepEqual(limited.map(u=>u.email),Array.from({length:10},(_,i)=>`candidate${String(i).padStart(2,'0')}@example.com`));
    await request(null,'GET',`/api/worlds/${w}`,null,404);
    assert.equal((await request(outsider,'GET','/api/worlds')).data.worlds.length,0);
    await request(reader,'GET',`/api/worlds/${w}`);
    await request(manager,'PUT',`/api/worlds/${w}/members/${outsider.id}`,{role:'manager'},403);
    await request(manager,'PUT',`/api/worlds/${w}/members/${owner.id}`,{role:'reader'},403);
    await request(manager,'PATCH',`/api/worlds/${w}`,{visibility:'public'},403);
    await request(author,'GET',`/api/worlds/${w}/members`,null,403);
    const content={name:'Hidden person',entityType:'character',description:'A private entity',body:{format:'markdown',text:'Private markdown'}};
    const disposable=(await request(author,'POST',`/api/worlds/${w}/proposals`,{action:'create',content},201)).data.proposal;
    await request(null,'DELETE',`/api/proposals/${disposable.id}`,{revision:1},401);
    for(const user of [owner,manager,reader,outsider]) await request(user,'DELETE',`/api/proposals/${disposable.id}`,{revision:1},404);
    await request(author,'DELETE',`/api/proposals/${disposable.id}`,{revision:99},409);
    await request(owner,'DELETE',`/api/worlds/${w}/members/${author.id}`);
    await request(author,'DELETE',`/api/proposals/${disposable.id}`,{revision:1},404);
    await request(owner,'PUT',`/api/worlds/${w}/members/${author.id}`,{role:'author'});
    await request(author,'DELETE',`/api/proposals/${disposable.id}`,{revision:1});
    await request(author,'GET',`/api/proposals/${disposable.id}`,null,404);
    assert.equal((await request(author,'GET',`/api/worlds/${w}/proposals`)).data.proposals.length,0);
    const directContent={...content,name:'Owner direct entity'};
    assert.equal((await request(owner,'GET',`/api/worlds/${w}`)).data.world.allowedActions.manageEntities,true);
    for(const user of [manager,author,reader]) {
      assert.equal((await request(user,'GET',`/api/worlds/${w}`)).data.world.allowedActions.manageEntities,false);
      await request(user,'POST',`/api/worlds/${w}/entities`,{content:directContent},403);
    }
    await request(null,'POST',`/api/worlds/${w}/entities`,{content:directContent},401);
    await request(outsider,'POST',`/api/worlds/${w}/entities`,{content:directContent},404);
    await request(owner,'POST',`/api/worlds/${w}/entities`,{content:{...directContent,name:''}},400);
    const direct=(await request(owner,'POST',`/api/worlds/${w}/entities`,{content:directContent},201)).data.entity;
    assert.equal((await request(reader,'GET',`/api/entities/${direct.id}`)).data.entity.creator.id,owner.id);
    assert.equal((await request(owner,'GET',`/api/worlds/${w}/proposals`)).data.proposals.length,0);
    let stale=(await request(author,'POST',`/api/worlds/${w}/proposals`,{action:'edit',entityId:direct.id,baseVersion:1,content:directContent},201)).data.proposal;
    stale=(await request(author,'POST',`/api/proposals/${stale.id}/submit`,{revision:stale.revision})).data.proposal;
    await request(owner,'PATCH',`/api/entities/${direct.id}`,{baseVersion:1,content:{...directContent,name:'Owner revised entity'}});
    await request(owner,'PATCH',`/api/entities/${direct.id}`,{baseVersion:1,content:directContent},409);
    await request(manager,'POST',`/api/proposals/${stale.id}/review`,{revision:stale.revision,decision:'approve'},409);
    await request(author,'POST',`/api/proposals/${stale.id}/withdraw`,{revision:stale.revision});
    for(const user of [manager,author,reader]) await request(user,'DELETE',`/api/entities/${direct.id}`,{baseVersion:2},403);
    await request(null,'DELETE',`/api/entities/${direct.id}`,{baseVersion:2},401);
    await request(outsider,'DELETE',`/api/entities/${direct.id}`,{baseVersion:2},404);
    await request(owner,'DELETE',`/api/entities/${direct.id}`,{baseVersion:1},409);
    await request(owner,'DELETE',`/api/entities/${direct.id}`,{baseVersion:2});
    await request(owner,'GET',`/api/entities/${direct.id}`,null,404);
    await request(owner,'DELETE',`/api/entities/${direct.id}`,{baseVersion:3},404);
    assert.equal((await request(owner,'GET','/api/entities/search?q=Owner')).data.results.length,0);
    const history=(await request(owner,'GET',`/api/entities/${direct.id}/versions`)).data.versions;
    assert.deepEqual(history.map(v=>v.version),[3,2,1]);
    assert.ok(history.every(v=>v.proposal_id===null&&v.actor_id===owner.id));
    await request(reader,'POST',`/api/worlds/${w}/proposals`,{action:'create',content},403);
    let p=(await request(author,'POST',`/api/worlds/${w}/proposals`,{action:'create',content},201)).data.proposal;
    await request(owner,'GET',`/api/proposals/${p.id}`,null,404);
    assert.equal((await request(manager,'GET',`/api/worlds/${w}/proposals`)).data.proposals.length,0);
    await request(author,'PATCH',`/api/proposals/${p.id}`,{revision:999,content},409);
    p=(await request(author,'PATCH',`/api/proposals/${p.id}`,{revision:p.revision,content})).data.proposal;
    p=(await request(author,'POST',`/api/proposals/${p.id}/submit`,{revision:p.revision})).data.proposal;
    await request(author,'DELETE',`/api/proposals/${p.id}`,{revision:p.revision},409);
    await request(manager,'DELETE',`/api/proposals/${p.id}`,{revision:p.revision},403);
    await request(author,'PATCH',`/api/proposals/${p.id}`,{revision:p.revision,content},409);
    await request(reader,'GET',`/api/proposals/${p.id}`,null,404);
    await request(author,'POST',`/api/proposals/${p.id}/review`,{revision:p.revision,decision:'approve'},403);
    p=(await request(manager,'POST',`/api/proposals/${p.id}/review`,{revision:p.revision,decision:'approve'})).data.proposal;
    const eid=p.entityId;
    await request(author,'DELETE',`/api/proposals/${p.id}`,{revision:p.revision},409);
    await request(manager,'POST',`/api/proposals/${p.id}/review`,{revision:p.revision,decision:'approve'},409);
    assert.equal((await request(reader,'GET',`/api/entities/${eid}`)).data.entity.body.text,'Private markdown');
    await request(outsider,'GET',`/api/entities/${eid}`,null,404);
    await request(reader,'GET',`/api/entities/${eid}/edit-context`,null,403);
    assert.equal((await request(null,'GET','/api/entities/search?q=Hidden')).data.results.length,0);
    await admin.query("INSERT INTO tags (name) VALUES ('private-tag')");await admin.query('INSERT INTO entity_tags VALUES (?,LAST_INSERT_ID())',[eid]);
    assert.deepEqual((await request(null,'GET','/api/tags')).data.tags,[]);
    assert.deepEqual((await request(reader,'GET','/api/tags')).data.tags,['private-tag']);
    await request(owner,'PATCH',`/api/worlds/${w}`,{visibility:'public'});
    await request(outsider,'GET',searchPath+'rea',null,403);
    assert.equal((await request(null,'GET','/api/entities/search?q=Hidden')).data.results.length,1);
    await request(null,'GET',`/api/entities/${eid}`);
    await request(outsider,'POST',`/api/worlds/${w}/proposals`,{action:'create',content},403);
    await request(outsider,'GET',`/api/proposals/${p.id}`,null,404);
    await request(owner,'PATCH',`/api/worlds/${w}`,{visibility:'private'});
    await request(null,'GET',`/api/entities/${eid}`,null,404);
    let edit=(await request(author,'POST',`/api/worlds/${w}/proposals`,{action:'edit',entityId:eid,baseVersion:1,content},201)).data.proposal;
    edit=(await request(author,'POST',`/api/proposals/${edit.id}/submit`,{revision:edit.revision})).data.proposal;
    await request(author,'PATCH',`/api/entities/${eid}`,{baseVersion:1,content},403);
    await request(manager,'PATCH',`/api/entities/${eid}`,{baseVersion:1,content:{...content,name:'Updated by manager'}},403);
    await request(owner,'PATCH',`/api/entities/${eid}`,{baseVersion:1,content:{...content,name:'Updated by owner'}});
    await request(manager,'POST',`/api/proposals/${edit.id}/review`,{revision:edit.revision,decision:'approve'},409);
    edit=(await request(author,'POST',`/api/proposals/${edit.id}/withdraw`,{revision:edit.revision})).data.proposal;
    edit=(await request(author,'PATCH',`/api/proposals/${edit.id}`,{revision:edit.revision,baseVersion:2,content})).data.proposal;
    edit=(await request(author,'POST',`/api/proposals/${edit.id}/submit`,{revision:edit.revision})).data.proposal;
    edit=(await request(manager,'POST',`/api/proposals/${edit.id}/review`,{revision:edit.revision,decision:'reject',comment:'Needs detail'})).data.proposal;
    await request(author,'DELETE',`/api/proposals/${edit.id}`,{revision:edit.revision},409);
    edit=(await request(author,'PATCH',`/api/proposals/${edit.id}`,{revision:edit.revision,baseVersion:2,content})).data.proposal;
    edit=(await request(author,'POST',`/api/proposals/${edit.id}/submit`,{revision:edit.revision})).data.proposal;
    const concurrent=await Promise.all([fetch(base+`/api/proposals/${edit.id}/review`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:manager.cookie},body:JSON.stringify({revision:edit.revision,decision:'approve'})}),fetch(base+`/api/proposals/${edit.id}/review`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:owner.cookie},body:JSON.stringify({revision:edit.revision,decision:'approve'})})]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);assertions++;
    assert.equal((await request(reader,'GET',`/api/entities/${eid}`)).data.entity.version,3);
    const second=(await request(owner,'POST','/api/worlds',{name:'Other private'},201)).data.world.id;
    await request(owner,'POST',`/api/worlds/${second}/proposals`,{action:'edit',entityId:eid,baseVersion:3,content},404);
    const [secret]=await admin.query("INSERT INTO entities (world_id,name,entity_type,created_by) VALUES (?,'Secret target','character',?)",[second,owner.id]);
    await admin.query("INSERT INTO relationships (world_id,source_entity_id,target_entity_id,relationship_type) VALUES (?,?,?,'KNOWS')",[w,eid,secret.insertId]);
    assert.equal((await request(reader,'GET',`/api/entities/${eid}`)).data.entity.relationships.length,0);
    await request(owner,'PUT',`/api/worlds/${w}/members/${outsider.id}`,{role:'author',status:'pending'});
    await request(outsider,'GET',`/api/entities/${eid}`,null,404);
    let own=(await request(owner,'POST',`/api/worlds/${w}/proposals`,{action:'create',content},201)).data.proposal;
    own=(await request(owner,'POST',`/api/proposals/${own.id}/submit`,{revision:own.revision})).data.proposal;
    await request(owner,'POST',`/api/proposals/${own.id}/review`,{revision:own.revision,decision:'approve'},403);
    let deletion=(await request(author,'POST',`/api/worlds/${w}/proposals`,{action:'delete',entityId:eid,baseVersion:3},201)).data.proposal;
    deletion=(await request(author,'POST',`/api/proposals/${deletion.id}/submit`,{revision:deletion.revision})).data.proposal;
    await request(manager,'POST',`/api/proposals/${deletion.id}/review`,{revision:deletion.revision,decision:'approve'});
    await request(reader,'GET',`/api/entities/${eid}`,null,404);
    assert.equal((await request(manager,'GET',`/api/entities/${eid}/versions`)).data.versions.length,4);
    assert.equal((await request(reader,'GET','/api/entities/search?q=Hidden')).data.results.length,0);
    await request(author,'GET',`/api/proposals/${deletion.id}`);
    await request(owner,'PUT',`/api/worlds/${w}/members/${author.id}`,{role:'reader'});
    await request(author,'POST',`/api/worlds/${w}/proposals`,{action:'create',content},403);
    await request(owner,'DELETE',`/api/worlds/${w}/members/${author.id}`);
    await request(author,'GET',`/api/proposals/${edit.id}`,null,404);
    const badOrigin=await fetch(base+'/logout',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json',Cookie:reader.cookie},body:'{}'});assert.equal(badOrigin.status,403);assertions++;
    await request(reader,'POST','/logout');await request(reader,'GET','/auth/me',null,401);
    await request(manager,'DELETE',`/api/worlds/${w}`,{confirmName:'Private fixture'},403);
    await request(owner,'POST',`/api/worlds/${w}/transfer`,{userId:manager.id});
    await request(owner,'PATCH',`/api/worlds/${w}`,{visibility:'public'},403);
    await request(manager,'DELETE',`/api/worlds/${w}`,{confirmName:'Private fixture'});
    // History and rollback: roles are checked in the target world, not globally.
    const historyReader=await account('history-reader');
    const hw=(await request(owner,'POST','/api/worlds',{name:'History fixture'},201)).data.world.id;
    for(const [u,role] of [[manager,'manager'],[author,'author'],[historyReader,'reader']])
      await request(owner,'PUT',`/api/worlds/${hw}/members/${u.id}`,{role});
    const original={name:'Original harbour',entityType:'location',description:'Before changes',body:{format:'markdown',text:'Original text'}};
    const revised={name:'Revised watch',entityType:'organisation',description:'After changes',body:{format:'markdown',text:'Revised text'}};
    const he=(await request(owner,'POST',`/api/worlds/${hw}/entities`,{content:original},201)).data.entity.id;
    await request(owner,'PATCH',`/api/entities/${he}`,{baseVersion:1,content:revised});
    const related=(await request(owner,'POST',`/api/worlds/${hw}/entities`,{content:{...original,name:'Related location'}},201)).data.entity.id;
    await admin.execute("INSERT INTO relationships (world_id,source_entity_id,target_entity_id,relationship_type) VALUES (?,?,?,'LOCATED_IN')",[hw,he,related]);
    const [historyTag]=await admin.execute("INSERT INTO tags (name) VALUES ('history-fixture')");
    await admin.execute('INSERT INTO entity_tags (entity_id,tag_id) VALUES (?,?)',[he,historyTag.insertId]);
    // Simulate an older snapshot made before relationship versioning existed.
    await admin.execute("UPDATE entity_versions SET snapshot=JSON_REMOVE(snapshot,'$.outgoingRelationships') WHERE entity_id=? AND version=1",[he]);
    for(const user of [owner,manager,author]) {
      const h=(await request(user,'GET',`/api/entities/${he}/versions`)).data;
      assert.deepEqual(h.versions.map(v=>v.version),[2,1]);
      assert.equal(h.allowedActions.viewHistory,true);
      assert.equal(h.allowedActions.rollback,user!==author);
    }
    await request(null,'GET',`/api/entities/${he}/versions`,null,401);
    await request(historyReader,'GET',`/api/entities/${he}/versions`,null,403);
    await request(outsider,'GET',`/api/entities/${he}/versions`,null,404);
    for(const user of [author,historyReader])
      await request(user,'POST',`/api/entities/${he}/rollback`,{baseVersion:2,targetVersion:1},403);
    await request(null,'POST',`/api/entities/${he}/rollback`,{baseVersion:2,targetVersion:1},401);
    await request(outsider,'POST',`/api/entities/${he}/rollback`,{baseVersion:2,targetVersion:1},404);
    for(const payload of [{baseVersion:2,targetVersion:true},{baseVersion:'2',targetVersion:1},
      {baseVersion:2,targetVersion:0},{baseVersion:2,targetVersion:1.5},{baseVersion:2},
      {baseVersion:2,targetVersion:2},{baseVersion:2,targetVersion:99}])
      await request(manager,'POST',`/api/entities/${he}/rollback`,payload,400);
    await request(manager,'POST',`/api/entities/${he}/rollback`,{baseVersion:1,targetVersion:1},409);
    let pending=(await request(author,'POST',`/api/worlds/${hw}/proposals`,{action:'edit',entityId:he,baseVersion:2,content:revised},201)).data.proposal;
    pending=(await request(author,'POST',`/api/proposals/${pending.id}/submit`,{revision:pending.revision})).data.proposal;
    const beforeHistory=(await request(author,'GET',`/api/entities/${he}/versions`)).data.versions;
    const restored=(await request(manager,'POST',`/api/entities/${he}/rollback`,{baseVersion:2,targetVersion:1})).data.entity;
    assert.equal(restored.version,3);
    const restoredEntity=(await request(historyReader,'GET',`/api/entities/${he}`)).data.entity;
    assert.equal(restoredEntity.name,original.name);assert.equal(restoredEntity.type,original.entityType);
    assert.equal(restoredEntity.description,original.description);assert.deepEqual(restoredEntity.body,original.body);
    assert.deepEqual(restoredEntity.tags,['history-fixture']);assert.equal(restoredEntity.relationships[0].entity.id,related);
    let afterHistory=(await request(author,'GET',`/api/entities/${he}/versions`)).data.versions;
    assert.deepEqual(afterHistory.slice(1),beforeHistory);
    assert.equal(afterHistory[0].snapshot.rollback_of_version,1);
    assert.equal(afterHistory[0].actor_id,manager.id);
    await request(owner,'POST',`/api/proposals/${pending.id}/review`,{revision:pending.revision,decision:'approve'},409);
    const rollbackRace=await Promise.all([owner,manager].map(user=>fetch(base+`/api/entities/${he}/rollback`,{
      method:'POST',headers:{'Content-Type':'application/json',Cookie:user.cookie},body:JSON.stringify({baseVersion:3,targetVersion:2})})));
    assert.deepEqual(rollbackRace.map(r=>r.status).sort(),[200,409]);assertions++;
    assert.equal((await request(author,'GET',`/api/entities/${he}/versions`)).data.versions.length,4);
    await request(owner,'DELETE',`/api/entities/${he}`,{baseVersion:4});
    assert.equal((await request(author,'GET',`/api/entities/${he}/versions`)).data.entity.deleted,true);
    await request(owner,'POST',`/api/entities/${he}/rollback`,{baseVersion:5,targetVersion:1});
    assert.equal((await request(historyReader,'GET',`/api/entities/${he}`)).data.entity.version,6);
    await request(manager,'POST',`/api/entities/${he}/rollback`,{baseVersion:6,targetVersion:5},400);
    await request(owner,'PATCH',`/api/worlds/${hw}`,{visibility:'public'});
    await request(outsider,'GET',`/api/entities/${he}/versions`,null,403);
    await request(null,'GET',`/api/entities/${he}/versions`,null,401);
    await request(outsider,'POST',`/api/entities/${he}/rollback`,{baseVersion:6,targetVersion:1},403);
    await request(owner,'PUT',`/api/worlds/${hw}/members/${manager.id}`,{role:'reader'});
    await request(manager,'GET',`/api/entities/${he}/versions`,null,403);
    await request(manager,'POST',`/api/entities/${he}/rollback`,{baseVersion:6,targetVersion:1},403);
    await request(owner,'DELETE',`/api/worlds/${hw}/members/${author.id}`);
    await request(author,'GET',`/api/entities/${he}/versions`,null,403);
    // Manager in a different world is still an outsider here.
    const otherWorld=(await request(outsider,'POST','/api/worlds',{name:'Unrelated world'},201)).data.world.id;
    await request(outsider,'PUT',`/api/worlds/${otherWorld}/members/${manager.id}`,{role:'manager'});
    await request(manager,'POST',`/api/entities/${he}/rollback`,{baseVersion:6,targetVersion:1},403);
    afterHistory=(await request(owner,'GET',`/api/entities/${he}/versions`)).data.versions;
    assert.equal(afterHistory.length,6);
    await request(owner,'PUT',`/api/worlds/${hw}/members/${outsider.id}`,{role:'author',status:'pending'});
    await request(outsider,'GET',`/api/entities/${he}/versions`,null,403);
    // A missing snapshot must not fall back to another entity's same version.
    const [legacy]=await admin.execute("INSERT INTO entities (world_id,name,entity_type,created_by,version) VALUES (?,'Legacy entity','location',?,2)",[hw,owner.id]);
    await request(owner,'POST',`/api/entities/${legacy.insertId}/rollback`,{baseVersion:2,targetVersion:1},404);
    assert.equal((await request(owner,'GET',`/api/entities/${legacy.insertId}/versions`)).data.versions.length,0);
    assert.equal((await request(owner,'GET',`/api/entities/${legacy.insertId}`)).data.entity.version,2);
    // Relationships participate in content publishing, history and rollback.
    await request(owner,'PUT',`/api/worlds/${hw}/members/${manager.id}`,{role:'manager'});
    await request(owner,'PUT',`/api/worlds/${hw}/members/${author.id}`,{role:'author'});
    const peer=await account('peer-manager');
    await request(owner,'PUT',`/api/worlds/${hw}/members/${peer.id}`,{role:'manager'});
    const target=(await request(owner,'POST',`/api/worlds/${hw}/entities`,{content:{...original,name:'Relationship target'}},201)).data.entity.id;
    const rows=[{targetEntityId:target,type:'protects & supports',reverseName:'supported by',description:'Night patrols'}];
    const source=(await request(owner,'POST',`/api/worlds/${hw}/entities`,{content:{...original,name:'Watch',outgoingRelationships:rows}},201)).data.entity.id;
    let ctx=(await request(author,'GET',`/api/entities/${source}/edit-context`)).data;
    assert.equal(ctx.content.outgoingRelationships[0].type,'protects & supports');
    assert.equal(ctx.content.outgoingRelationships[0].reverseName,'supported by');
    assert.equal(ctx.content.outgoingRelationships[0].targetName,'Relationship target');
    assert.equal((await request(manager,'GET',`/api/entities/${source}`)).data.entity.allowedActions.edit,false);
    assert.equal((await request(historyReader,'GET',`/api/entities/${target}`)).data.entity.relationships[0].direction,'incoming');
    assert.equal((await request(historyReader,'GET',`/api/entities/${target}`)).data.entity.relationships[0].reverseName,'supported by');
    const choices=(await request(author,'GET',`/api/worlds/${hw}/relationship-targets?q=missing&selected=${target}`)).data.entities;
    assert.deepEqual(choices.map(e=>e.id),[target]);
    await request(historyReader,'GET',`/api/worlds/${hw}/relationship-targets`,null,403);
    await request(null,'GET',`/api/worlds/${hw}/relationship-targets`,null,401);
    await request(author,'GET',`/api/worlds/${hw}/relationship-targets?selected=true`,null,400);
    for(const bad of [null,[...rows,...rows],[{...rows[0],targetEntityId:source}],
      [{...rows[0],targetEntityId:true}],[{...rows[0],type:''}],[{...rows[0],type:'x'.repeat(101)}],
      [{...rows[0],reverseName:''}],[{...rows[0],reverseName:true}],[{...rows[0],reverseName:'x'.repeat(101)}]])
      await request(owner,'PATCH',`/api/entities/${source}`,{baseVersion:1,content:{...original,outgoingRelationships:bad}},400);
    await request(owner,'PATCH',`/api/entities/${source}`,{baseVersion:1,content:{...original,outgoingRelationships:[{...rows[0],targetEntityId:secret.insertId}]}},409);
    assert.equal((await request(author,'GET',`/api/entities/${source}/versions`)).data.versions.length,1);
    // Omitted relationships preserve existing rows; explicit [] removes them.
    await request(owner,'PATCH',`/api/entities/${source}`,{baseVersion:1,content:original});
    assert.equal((await request(author,'GET',`/api/entities/${source}/edit-context`)).data.content.outgoingRelationships.length,1);
    await request(owner,'PATCH',`/api/entities/${source}`,{baseVersion:2,content:{...original,outgoingRelationships:[]}});
    assert.equal((await request(historyReader,'GET',`/api/entities/${target}`)).data.entity.relationships.length,0);
    await request(manager,'POST',`/api/entities/${source}/rollback`,{baseVersion:3,targetVersion:1});
    assert.equal((await request(author,'GET',`/api/entities/${source}/edit-context`)).data.content.outgoingRelationships[0].reverseName,'supported by');
    assert.equal((await request(historyReader,'GET',`/api/entities/${target}`)).data.entity.relationships.length,1);
    // Incoming relationships must survive editing the target's outgoing list.
    await request(owner,'PATCH',`/api/entities/${target}`,{baseVersion:1,content:{...original,outgoingRelationships:[]}});
    assert.equal((await request(author,'GET',`/api/entities/${source}/edit-context`)).data.content.outgoingRelationships.length,1);
    let rp=(await request(author,'POST',`/api/worlds/${hw}/proposals`,{action:'edit',entityId:source,baseVersion:4,content:{...original,outgoingRelationships:[]}},201)).data.proposal;
    rp=(await request(author,'POST',`/api/proposals/${rp.id}/submit`,{revision:rp.revision})).data.proposal;
    assert.equal((await request(manager,'GET',`/api/proposals/${rp.id}`)).data.proposal.canReview,true);
    assert.equal((await request(historyReader,'GET',`/api/entities/${source}`)).data.entity.relationships.length,1);
    await request(manager,'POST',`/api/proposals/${rp.id}/review`,{revision:rp.revision,decision:'approve'});
    assert.equal((await request(historyReader,'GET',`/api/entities/${source}`)).data.entity.relationships.length,0);
    // Manager proposals require Owner approval, even after demotion.
    let mp=(await request(manager,'POST',`/api/worlds/${hw}/proposals`,{action:'create',content:{...original,outgoingRelationships:rows}},201)).data.proposal;
    mp=(await request(manager,'POST',`/api/proposals/${mp.id}/submit`,{revision:mp.revision})).data.proposal;
    assert.equal((await request(peer,'GET',`/api/proposals/${mp.id}`)).data.proposal.canReview,false);
    for(const user of [manager,peer]) await request(user,'POST',`/api/proposals/${mp.id}/review`,{revision:mp.revision,decision:'approve'},403);
    await request(owner,'PUT',`/api/worlds/${hw}/members/${manager.id}`,{role:'author'});
    await request(peer,'POST',`/api/proposals/${mp.id}/review`,{revision:mp.revision,decision:'reject'},403);
    await request(owner,'POST',`/api/proposals/${mp.id}/review`,{revision:mp.revision,decision:'approve'});
    await request(owner,'PUT',`/api/worlds/${hw}/members/${manager.id}`,{role:'manager'});
    // Targets can disappear while a draft is awaiting review. No partial publication.
    let staleRel=(await request(author,'POST',`/api/worlds/${hw}/proposals`,{action:'edit',entityId:source,baseVersion:5,content:{...revised,outgoingRelationships:rows}},201)).data.proposal;
    staleRel=(await request(author,'POST',`/api/proposals/${staleRel.id}/submit`,{revision:staleRel.revision})).data.proposal;
    await request(owner,'DELETE',`/api/entities/${target}`,{baseVersion:2});
    await request(manager,'POST',`/api/proposals/${staleRel.id}/review`,{revision:staleRel.revision,decision:'approve'},409);
    await request(author,'POST',`/api/worlds/${hw}/proposals`,{action:'create',content:{...original,outgoingRelationships:rows}},409);
    await request(manager,'POST',`/api/entities/${source}/rollback`,{baseVersion:5,targetVersion:1},409);
    assert.equal((await request(author,'GET',`/api/proposals/${staleRel.id}`)).data.proposal.status,'pending');
    ctx=(await request(author,'GET',`/api/entities/${source}/edit-context`)).data;
    assert.equal(ctx.baseVersion,5);assert.equal(ctx.content.name,original.name);assert.deepEqual(ctx.content.outgoingRelationships,[]);
    console.log(`${assertions} API assertions passed in isolated database ${name}`);
  } finally {
    if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(pool) await pool.end();
    // Name is generated above; never use the configured application DB for cleanup.
    if(!/^wb_permissions_test_\d+$/.test(name)) throw new Error('Unsafe cleanup target');
    try { if(created) await admin.query('DROP DATABASE IF EXISTS `'+name+'`'); } finally { await admin.end(); }
  }
});
