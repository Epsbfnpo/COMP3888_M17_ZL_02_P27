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
    await request(null,'GET',`/api/worlds/${w}`,null,404);
    assert.equal((await request(outsider,'GET','/api/worlds')).data.worlds.length,0);
    await request(reader,'GET',`/api/worlds/${w}`);
    await request(manager,'PUT',`/api/worlds/${w}/members/${outsider.id}`,{role:'manager'},403);
    await request(manager,'PUT',`/api/worlds/${w}/members/${owner.id}`,{role:'reader'},403);
    await request(manager,'PATCH',`/api/worlds/${w}`,{visibility:'public'},403);
    await request(author,'GET',`/api/worlds/${w}/members`,null,403);
    const content={name:'Hidden person',entityType:'character',description:'A private entity',body:{format:'markdown',text:'Private markdown'}};
    await request(reader,'POST',`/api/worlds/${w}/proposals`,{action:'create',content},403);
    let p=(await request(author,'POST',`/api/worlds/${w}/proposals`,{action:'create',content},201)).data.proposal;
    await request(owner,'GET',`/api/proposals/${p.id}`,null,404);
    assert.equal((await request(manager,'GET',`/api/worlds/${w}/proposals`)).data.proposals.length,0);
    await request(author,'PATCH',`/api/proposals/${p.id}`,{revision:999,content},409);
    p=(await request(author,'PATCH',`/api/proposals/${p.id}`,{revision:p.revision,content})).data.proposal;
    p=(await request(author,'POST',`/api/proposals/${p.id}/submit`,{revision:p.revision})).data.proposal;
    await request(author,'PATCH',`/api/proposals/${p.id}`,{revision:p.revision,content},409);
    await request(reader,'GET',`/api/proposals/${p.id}`,null,404);
    await request(author,'POST',`/api/proposals/${p.id}/review`,{revision:p.revision,decision:'approve'},403);
    p=(await request(manager,'POST',`/api/proposals/${p.id}/review`,{revision:p.revision,decision:'approve'})).data.proposal;
    const eid=p.entityId;
    await request(manager,'POST',`/api/proposals/${p.id}/review`,{revision:p.revision,decision:'approve'},409);
    assert.equal((await request(reader,'GET',`/api/entities/${eid}`)).data.entity.body.text,'Private markdown');
    await request(outsider,'GET',`/api/entities/${eid}`,null,404);
    await request(reader,'GET',`/api/entities/${eid}/edit-context`,null,403);
    assert.equal((await request(null,'GET','/api/entities/search?q=Hidden')).data.results.length,0);
    await admin.query("INSERT INTO tags (name) VALUES ('private-tag')");await admin.query('INSERT INTO entity_tags VALUES (?,LAST_INSERT_ID())',[eid]);
    assert.deepEqual((await request(null,'GET','/api/tags')).data.tags,[]);
    assert.deepEqual((await request(reader,'GET','/api/tags')).data.tags,['private-tag']);
    await request(owner,'PATCH',`/api/worlds/${w}`,{visibility:'public'});
    assert.equal((await request(null,'GET','/api/entities/search?q=Hidden')).data.results.length,1);
    await request(null,'GET',`/api/entities/${eid}`);
    await request(outsider,'POST',`/api/worlds/${w}/proposals`,{action:'create',content},403);
    await request(outsider,'GET',`/api/proposals/${p.id}`,null,404);
    await request(owner,'PATCH',`/api/worlds/${w}`,{visibility:'private'});
    await request(null,'GET',`/api/entities/${eid}`,null,404);
    let edit=(await request(author,'POST',`/api/worlds/${w}/proposals`,{action:'edit',entityId:eid,baseVersion:1,content},201)).data.proposal;
    edit=(await request(author,'POST',`/api/proposals/${edit.id}/submit`,{revision:edit.revision})).data.proposal;
    await request(author,'PATCH',`/api/entities/${eid}`,{baseVersion:1,content},403);
    await request(manager,'PATCH',`/api/entities/${eid}`,{baseVersion:1,content:{...content,name:'Updated by manager'}});
    await request(manager,'POST',`/api/proposals/${edit.id}/review`,{revision:edit.revision,decision:'approve'},409);
    edit=(await request(author,'POST',`/api/proposals/${edit.id}/withdraw`,{revision:edit.revision})).data.proposal;
    edit=(await request(author,'PATCH',`/api/proposals/${edit.id}`,{revision:edit.revision,baseVersion:2,content})).data.proposal;
    edit=(await request(author,'POST',`/api/proposals/${edit.id}/submit`,{revision:edit.revision})).data.proposal;
    edit=(await request(manager,'POST',`/api/proposals/${edit.id}/review`,{revision:edit.revision,decision:'reject',comment:'Needs detail'})).data.proposal;
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
    console.log(`${assertions} API assertions passed in isolated database ${name}`);
  } finally {
    if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(pool) await pool.end();
    // Name is generated above; never use the configured application DB for cleanup.
    if(!/^wb_permissions_test_\d+$/.test(name)) throw new Error('Unsafe cleanup target');
    try { if(created) await admin.query('DROP DATABASE IF EXISTS `'+name+'`'); } finally { await admin.end(); }
  }
});
