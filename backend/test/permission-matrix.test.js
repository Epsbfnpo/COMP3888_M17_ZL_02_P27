// Table-driven role x operation matrix against an isolated, temporary MySQL database.
// Expected outcomes live in permission-matrix.expected.json, derived from docs/PERMISSIONS.md.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname,'../.env') });

const spec=require('./permission-matrix.expected.json');
const name='wb_permissions_test_'+Date.now();
const rows=[];
let admin,server,pool,base,created=false;
const users={};
const shared={};

async function request(user,method,url,body) {
  const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(user?.cookie?{Cookie:user.cookie}:{})},...(method==='GET'?{}:{body:JSON.stringify(body||{})})});
  let data={};try{data=await r.json();}catch{/* Empty body. */}
  return {status:r.status,data};
}
async function ok(user,method,url,body) {
  const r=await request(user,method,url,body);
  assert.ok(r.status>=200&&r.status<300,`fixture ${method} ${url}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
async function account(label) {
  const email=label+'@example.com';
  const {data}=await request(null,'POST','/register',{username:label,email,password:'Test123!'});
  const r=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Test123!'})});
  assert.equal(r.status,200);
  return {id:data.user.id,cookie:r.headers.get('set-cookie').split(';')[0]};
}
const content=(label)=>({name:label,entityType:'location',description:'Matrix fixture '+label,body:{format:'markdown',text:'Body of '+label}});
let counter=0;
const token=()=>'mx'+(++counter).toString().padStart(4,'0');

async function makeWorld(visibility) {
  const n='Matrix '+visibility+' '+token();
  const w=(await ok(users.owner,'POST','/api/worlds',{name:n,visibility})).world.id;
  for(const [u,role] of [['manager','manager'],['author','author'],['reader','reader'],['writer','author'],['lead','manager'],['former','author']])
    await ok(users.owner,'PUT',`/api/worlds/${w}/members/${users[u].id}`,{role});
  await ok(users.owner,'PUT',`/api/worlds/${w}/members/${users.pending.id}`,{role:'author',status:'pending'});
  await ok(users.owner,'DELETE',`/api/worlds/${w}/members/${users.former.id}`);
  return {id:w,name:n};
}
async function entity(w,versions=1) {
  const label='Entity '+token();
  const id=(await ok(users.owner,'POST',`/api/worlds/${w}/entities`,{content:content(label)})).entity.id;
  for(let v=1;v<versions;v++) await ok(users.owner,'PATCH',`/api/entities/${id}`,{baseVersion:v,content:content(label+' v'+(v+1))});
  return {id,label};
}
async function proposal(proposer,w,submit=true) {
  let p=(await ok(proposer,'POST',`/api/worlds/${w}/proposals`,{action:'create',content:content('Proposal '+token())})).proposal;
  if(submit) p=(await ok(proposer,'POST',`/api/proposals/${p.id}/submit`,{revision:p.revision})).proposal;
  return p;
}
const allowed=(rule)=>rule==='everyone'?spec.subjects:rule;

// Each operation returns {status, allowed}. `unchanged` checks that a refused write left no trace.
const operations={
  'M01-read-world':async(s,v)=>{const r=await request(s,'GET',`/api/worlds/${shared[v].world.id}`);return {status:r.status};},
  'M02-read-entity':async(s,v)=>{const r=await request(s,'GET',`/api/entities/${shared[v].entity.id}`);return {status:r.status};},
  'M03-search-entity':async(s,v)=>{
    const r=await request(s,'GET',`/api/entities/search?q=${encodeURIComponent(shared[v].entity.label)}`);
    const found=r.status===200&&(r.data.results||[]).some(e=>e.id===shared[v].entity.id);
    return {status:r.status,allowed:found};
  },
  'M04-view-history':async(s,v)=>{const r=await request(s,'GET',`/api/entities/${shared[v].entity.id}/versions`);return {status:r.status};},
  'M05-rollback':async(s,v)=>{
    const e=await entity(shared[v].world.id,2);
    const r=await request(s,'POST',`/api/entities/${e.id}/rollback`,{baseVersion:2,targetVersion:1});
    const version=(await ok(users.owner,'GET',`/api/entities/${e.id}`)).entity.version;
    return {status:r.status,unchanged:version===2};
  },
  'M06-create-entity':async(s,v)=>{
    const label='Created '+token();
    const r=await request(s,'POST',`/api/worlds/${shared[v].world.id}/entities`,{content:content(label)});
    const [found]=await admin.query('SELECT COUNT(*) n FROM `'+name+'`.entities WHERE name=?',[label]);
    return {status:r.status,unchanged:found[0].n===0};
  },
  'M07-update-entity':async(s,v)=>{
    const e=await entity(shared[v].world.id);
    const r=await request(s,'PATCH',`/api/entities/${e.id}`,{baseVersion:1,content:content(e.label+' edited')});
    const version=(await ok(users.owner,'GET',`/api/entities/${e.id}`)).entity.version;
    return {status:r.status,unchanged:version===1};
  },
  'M08-delete-entity':async(s,v)=>{
    const e=await entity(shared[v].world.id);
    const r=await request(s,'DELETE',`/api/entities/${e.id}`,{baseVersion:1});
    const still=(await request(users.owner,'GET',`/api/entities/${e.id}`)).status===200;
    return {status:r.status,unchanged:still};
  },
  'M09-submit-proposal':async(s,v)=>{
    const r=await request(s,'POST',`/api/worlds/${shared[v].world.id}/proposals`,{action:'create',content:content('Submitted '+token())});
    if(r.status!==201)return {status:r.status};
    const p=r.data.proposal;
    const submitted=await request(s,'POST',`/api/proposals/${p.id}/submit`,{revision:p.revision});
    return {status:submitted.status};
  },
  'M10-read-others-draft':async(s,v)=>{const r=await request(s,'GET',`/api/proposals/${shared[v].draft.id}`);return {status:r.status};},
  'M11-read-submitted-proposal':async(s,v)=>{const r=await request(s,'GET',`/api/proposals/${shared[v].submitted.id}`);return {status:r.status};},
  'M12-review-author-proposal':async(s,v)=>{
    const p=await proposal(users.writer,shared[v].world.id);
    const r=await request(s,'POST',`/api/proposals/${p.id}/review`,{revision:p.revision,decision:'approve'});
    const status=(await ok(users.writer,'GET',`/api/proposals/${p.id}`)).proposal.status;
    return {status:r.status,unchanged:status==='pending'};
  },
  'M13-review-manager-proposal':async(s,v)=>{
    const p=await proposal(users.lead,shared[v].world.id);
    const r=await request(s,'POST',`/api/proposals/${p.id}/review`,{revision:p.revision,decision:'approve'});
    const status=(await ok(users.lead,'GET',`/api/proposals/${p.id}`)).proposal.status;
    return {status:r.status,unchanged:status==='pending'};
  },
  'M14-review-own-proposal':async(s,v)=>{
    const p=await proposal(s,shared[v].world.id);
    const r=await request(s,'POST',`/api/proposals/${p.id}/review`,{revision:p.revision,decision:'approve'});
    const status=(await ok(s,'GET',`/api/proposals/${p.id}`)).proposal.status;
    return {status:r.status,unchanged:status==='pending'};
  },
  'M15-manage-reader-author':async(s,v)=>{
    const [u]=await admin.execute('INSERT INTO `'+name+'`.users (username,email,password_hash) VALUES (?,?,?)',['Invitee',token()+'@example.com','unused-test-hash']);
    const r=await request(s,'PUT',`/api/worlds/${shared[v].world.id}/members/${u.insertId}`,{role:'author'});
    const [m]=await admin.query('SELECT COUNT(*) n FROM `'+name+'`.world_members WHERE world_id=? AND user_id=?',[shared[v].world.id,u.insertId]);
    return {status:r.status,unchanged:m[0].n===0};
  },
  'M16-assign-manager':async(s,v)=>{
    const [u]=await admin.execute('INSERT INTO `'+name+'`.users (username,email,password_hash) VALUES (?,?,?)',['Invitee',token()+'@example.com','unused-test-hash']);
    const r=await request(s,'PUT',`/api/worlds/${shared[v].world.id}/members/${u.insertId}`,{role:'manager'});
    const [m]=await admin.query('SELECT COUNT(*) n FROM `'+name+'`.world_members WHERE world_id=? AND user_id=?',[shared[v].world.id,u.insertId]);
    return {status:r.status,unchanged:m[0].n===0};
  },
  'M17-change-visibility':async(s,v)=>{
    const w=await makeWorld(v);
    const r=await request(s,'PATCH',`/api/worlds/${w.id}`,{visibility:v==='public'?'private':'public'});
    const [row]=await admin.query('SELECT visibility FROM `'+name+'`.worlds WHERE id=?',[w.id]);
    return {status:r.status,unchanged:row[0].visibility===v};
  },
  'M18-transfer-world':async(s,v)=>{
    const w=await makeWorld(v);
    const r=await request(s,'POST',`/api/worlds/${w.id}/transfer`,{userId:users.writer.id});
    const [row]=await admin.query('SELECT owner_id FROM `'+name+'`.worlds WHERE id=?',[w.id]);
    return {status:r.status,unchanged:row[0].owner_id===users.owner.id};
  },
  'M19-delete-world':async(s,v)=>{
    const w=await makeWorld(v);
    const r=await request(s,'DELETE',`/api/worlds/${w.id}`,{confirmName:w.name});
    const still=(await request(users.owner,'GET',`/api/worlds/${w.id}`)).status===200;
    return {status:r.status,unchanged:still};
  },
  'M20-ai-context':async(s,v)=>{const r=await request(s,'POST','/api/ai/context',{kind:'world',id:shared[v].world.id});return {status:r.status};},
  'M21-ai-draft-check':async(s,v)=>{
    const e=shared[v].entity;
    const draft={worldId:shared[v].world.id,entityId:e.id,baseVersion:1,content:content(e.label+' draft')};
    const r=await request(s,'POST','/api/ai/context',{kind:'entity',id:e.id,includeBody:true,draft});
    return {status:r.status};
  },
};

before(async()=>{
  admin=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,port:+process.env.DB_PORT||3306,multipleStatements:true});
  await admin.query('CREATE DATABASE `'+name+'`');created=true;await admin.query('USE `'+name+'`');
  for(const filename of ['schema.sql','worldbuilding_schema.sql','permissions.sql']) {
    const sql=fs.readFileSync(path.join(__dirname,'../database',filename),'utf8').replace(/CREATE DATABASE IF NOT EXISTS worldbuilding;/g,'').replace(/USE worldbuilding;/g,'');
    await admin.query(sql);
  }
  process.env.DB_NAME=name;
  const app=require('../server');pool=require('../db');
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  base='http://127.0.0.1:'+server.address().port;
  for(const label of ['owner','manager','author','reader','outsider','pending','former','writer','lead']) users[label]=await account('matrix-'+label);
  users.guest=null;
  for(const v of ['private','public']) {
    const world=await makeWorld(v);
    shared[v]={world,entity:await entity(world.id),draft:await proposal(users.writer,world.id,false),submitted:await proposal(users.writer,world.id)};
  }
});

after(async()=>{
  try {
    const out=path.join(__dirname,'../../testing/evidence');fs.mkdirSync(out,{recursive:true});
    const csv=['case,operation,visibility,subject,expected,actual,status,state_unchanged_when_denied,result',...rows.map(r=>
      [r.id,`"${r.label}"`,r.visibility,r.subject,r.expected,r.actual,r.status,r.unchanged,r.result].join(','))];
    fs.writeFileSync(path.join(out,'permission-matrix.csv'),csv.join('\n')+'\n');
  } finally {
    if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(pool) await pool.end();
    // Name is generated above; never use the configured application DB for cleanup.
    if(!/^wb_permissions_test_\d+$/.test(name)) throw new Error('Unsafe cleanup target');
    try { if(created) await admin.query('DROP DATABASE IF EXISTS `'+name+'`'); } finally { await admin?.end(); }
  }
});

for(const [id,op] of Object.entries(spec.operations)) {
  for(const visibility of ['private','public']) {
    const permitted=allowed(op[visibility]);
    for(const subject of op.subjects||spec.subjects) {
      const expected=permitted.includes(subject)?'allow':'deny';
      test(`${id} ${visibility} ${subject} -> ${expected}`,async()=>{
        const result=await operations[id](users[subject],visibility);
        const actual=(result.allowed??(result.status>=200&&result.status<300))?'allow':'deny';
        const row={id,label:op.label,visibility,subject,expected,actual,status:result.status,unchanged:actual==='deny'?(result.unchanged??'n/a'):'n/a'};
        row.result=actual===expected&&row.unchanged!==false?'PASS':'FAIL';
        rows.push(row);
        assert.equal(actual,expected,`${op.label} as ${subject} in a ${visibility} world returned ${result.status}`);
        if(actual==='deny') {
          assert.ok([401,403,404].includes(result.status)||result.allowed===false,`unexpected refusal status ${result.status}`);
          assert.notEqual(result.unchanged,false,'a refused request changed stored content');
        }
      });
    }
  }
}
