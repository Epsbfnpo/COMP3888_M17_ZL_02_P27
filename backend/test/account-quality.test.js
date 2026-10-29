// Real HTTP/database checks. Never connect the application pool to the normal DB.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const mysql=require('mysql2/promise');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});

test('QAPI isolated account, search and recovery acceptance checks',async t=>{
  const name='wb_quality_test_'+Date.now();
  const admin=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,port:+process.env.DB_PORT||3306,multipleStatements:true});
  let server,pool,created=false;
  try{
    await admin.query('CREATE DATABASE `'+name+'`');created=true;await admin.query('USE `'+name+'`');
    for(const file of ['schema.sql','worldbuilding_schema.sql','permissions.sql'])await admin.query(fs.readFileSync(path.join(__dirname,'../database',file),'utf8').replace(/CREATE DATABASE IF NOT EXISTS worldbuilding;/g,'').replace(/USE worldbuilding;/g,''));
    process.env.DB_NAME=name;
    const app=require('../server');pool=require('../db');
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port;
    async function request(method,url,body,cookie='',status=200,headers={}){
      const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',Cookie:cookie,...headers},...(method==='GET'?{}:{body:JSON.stringify(body??{})})});
      const data=await response.json();assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(data)}`);
      assert.equal(Object.hasOwn(data.user||{},'password_hash'),false);
      return {data,cookie:response.headers.get('set-cookie')?.split(';')[0],response};
    }
    const password='Test123!';let owner,other,cookie,world,entity;
    const content={name:'Quality Harbour',entityType:'location',description:'Ships arrive in daylight.',body:{format:'markdown',text:'Night entry is forbidden.'},outgoingRelationships:[]};
    await t.test('Q01 registration required fields and 50/51 username boundary',async()=>{
      for(const body of [{},{username:'A',email:'a@example.com'},{username:123,email:'a@example.com',password}])await request('POST','/register',body,'',400);
      await request('POST','/register',{username:'x'.repeat(51),email:'limit@example.com',password},'',400);
      owner=(await request('POST','/register',{username:'x'.repeat(50),email:'QUALITY@example.com',password},'',201)).data.user;
      assert.equal(owner.email,'quality@example.com');
    });
    await t.test('Q02 registration duplicate email and 100/101 email boundary',async()=>{
      await request('POST','/register',{username:'Duplicate',email:' QUALITY@example.com ',password},'',409);
      const email='a'.repeat(88)+'@example.com';assert.equal(email.length,100);
      await request('POST','/register',{username:'Boundary',email,password},'',201);
      await request('POST','/register',{username:'Boundary',email:'a'+email,password},'',400);
      other=(await request('POST','/register',{username:'Other',email:'other@example.com',password},'',201)).data.user;
    });
    await t.test('Q03 login rejects missing, unknown and incorrect credentials',async()=>{
      await request('POST','/login',{},'',400);
      await request('POST','/login',{email:'absent@example.com',password},'',401);
      await request('POST','/login',{email:owner.email,password:'wrong'},'',401);
    });
    await t.test('Q04 successful login uses HttpOnly cookie and server session',async()=>{
      const login=await request('POST','/login',{email:' QUALITY@example.com ',password});cookie=login.cookie;
      assert.match(login.response.headers.get('set-cookie'),/HttpOnly/i);
      assert.match(login.response.headers.get('set-cookie'),/SameSite=Lax/i);
      assert.equal((await request('GET','/auth/me',undefined,cookie)).data.user.id,owner.id);
    });
    await t.test('Q05 profile denies guests, other accounts and invalid fields',async()=>{
      const url=`/api/users/${owner.id}/profile`;
      await request('PUT',url,{},'',401);
      await request('PUT',`/api/users/${other.id}/profile`,{},cookie,403);
      for(const input of [{},{username:'New',email:'bad',password},{username:'x'.repeat(51),email:owner.email,password},{username:'New',email:owner.email,password:'wrong'}])await request('PUT',url,input,cookie,input.password==='wrong'?401:400);
    });
    await t.test('Q06 profile rejects duplicates and saves own profile with current password',async()=>{
      await request('PUT',`/api/users/${owner.id}/profile`,{username:'New',email:other.email,password},cookie,409);
      const result=await request('PUT',`/api/users/${owner.id}/profile`,{username:'Quality Owner',email:'changed@example.com',password},cookie);
      assert.equal(result.data.user.username,'Quality Owner');
      assert.equal((await request('GET','/auth/me',undefined,cookie)).data.user.email,'changed@example.com');
      await request('POST','/login',{email:owner.email,password},'',401);
    });
    await t.test('Q07 session rotation revokes old token; expired token is rejected',async()=>{
      const next=await request('POST','/login',{email:'changed@example.com',password},cookie);
      await request('GET','/auth/me',undefined,cookie,401);cookie=next.cookie;
      const token=cookie.split('=')[1];const hash=crypto.createHash('sha256').update(token).digest('hex');
      await admin.execute('UPDATE sessions SET expires_at=DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE token_hash=?',[hash]);
      await request('GET','/auth/me',undefined,cookie,401);
      cookie=(await request('POST','/login',{email:'changed@example.com',password})).cookie;
    });
    await t.test('Q08 malformed JSON, non-JSON, untrusted Origin and oversized request',async()=>{
      for(const [body,headers,status] of [['{',{'Content-Type':'application/json'},400],['{}',{'Content-Type':'text/plain'},415],['{}',{'Content-Type':'application/json',Origin:'https://untrusted.example'},403],[JSON.stringify({text:'x'.repeat(1048600)}),{'Content-Type':'application/json'},413]]){
        const response=await fetch(base+'/logout',{method:'POST',headers:{...headers,Cookie:cookie},body});assert.equal(response.status,status);
      }
      await request('GET','/auth/me',undefined,cookie);
    });
    await t.test('Q09 world creation defaults private; invalid visibility and blank name rejected',async()=>{
      await request('POST','/api/worlds',{name:' '},cookie,400);
      await request('POST','/api/worlds',{name:'World',visibility:'invalid'},cookie,400);
      world=(await request('POST','/api/worlds',{name:'Quality World'},cookie,201)).data.world;
      assert.equal(world.visibility,'private');
      entity=(await request('POST',`/api/worlds/${world.id}/entities`,{content},cookie,201)).data.entity;
    });
    await t.test('Q10 keyword/tag search respects visibility, no-result and literal SQL-like input',async()=>{
      await admin.execute('INSERT INTO tags (name) VALUES (?)',['nautical']);
      const [[tag]]=await admin.execute('SELECT id FROM tags WHERE name=?',['nautical']);
      await admin.execute('INSERT INTO entity_tags (entity_id,tag_id) VALUES (?,?)',[entity.id,tag.id]);
      assert.equal((await request('GET','/api/entities/search?q=Harbour',undefined,cookie)).data.results.length,1);
      assert.equal((await request('GET','/api/entities/search?tag=nautical',undefined,cookie)).data.results[0].id,entity.id);
      for(const q of ['nonexistent',"\u0027 OR 1=1 --"]){assert.equal((await request('GET','/api/entities/search?q='+encodeURIComponent(q),undefined,cookie)).data.results.length,0);}
      assert.equal((await request('GET','/api/entities/search?q=Harbour')).data.results.length,0);
      await request('PATCH',`/api/worlds/${world.id}`,{visibility:'public'},cookie);
      assert.equal((await request('GET','/api/entities/search?tag=nautical')).data.results.length,1);
    });
    await t.test('Q11 entity name 150/151 boundary and stale writes preserve state',async()=>{
      await request('PATCH',`/api/entities/${entity.id}`,{baseVersion:1,content:{...content,name:'x'.repeat(151)}},cookie,400);
      await request('PATCH',`/api/entities/${entity.id}`,{baseVersion:1,content:{...content,name:'x'.repeat(150)}},cookie);
      await request('PATCH',`/api/entities/${entity.id}`,{baseVersion:1,content},cookie,409);
      const saved=(await request('GET',`/api/entities/${entity.id}`,undefined,cookie)).data.entity;
      assert.equal(saved.version,2);assert.equal(saved.name.length,150);
    });
    await t.test('Q12 transaction rollback leaves no entity on invalid relationship target',async()=>{
      const [[before]]=await admin.query('SELECT COUNT(*) AS n FROM entities');
      await request('POST',`/api/worlds/${world.id}/entities`,{content:{...content,outgoingRelationships:[{targetEntityId:999999,type:'visits',description:''}]}},cookie,409);
      const [[after]]=await admin.query('SELECT COUNT(*) AS n FROM entities');assert.equal(after.n,before.n);
    });
    await t.test('Q13 logout invalidates token and malformed session is anonymous',async()=>{
      await request('GET','/auth/me',undefined,'wb_session=malformed',401);
      await request('POST','/logout',{},cookie);
      await request('GET','/auth/me',undefined,cookie,401);
    });
    await t.test('Q14 registration API rejects a malformed email address',async()=>{
      // Expected contract follows the UI email field and profile email validation.
      // Keep a failure visible if backend registration does not enforce it.
      await request('POST','/register',{username:'Invalid Email',email:'not-an-email',password},'',400);
    });
  }finally{
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    if(pool)await pool.end();
    assert.match(name,/^wb_quality_test_\d+$/);
    try{if(created)await admin.query('DROP DATABASE IF EXISTS `'+name+'`');}finally{await admin.end();}
  }
});
