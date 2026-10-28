const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
require(path.join(root,'backend/node_modules/dotenv')).config({path:path.join(root,'backend/.env'),quiet:true});
const mysql=require(path.join(root,'backend/node_modules/mysql2/promise'));
const name='wb_browser_test_'+Date.now();let admin,pool,server,frontend,stopping=false;
async function stop(){if(stopping)return;stopping=true;
  if(frontend){frontend.kill('SIGTERM');await Promise.race([new Promise(r=>frontend.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);}
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(pool)await pool.end();
  if(admin){if(!/^wb_browser_test_\d+$/.test(name))throw new Error('Unsafe cleanup');await admin.query('DROP DATABASE IF EXISTS `'+name+'`');await admin.end();}
  fs.writeFileSync(path.join(root,'testing/evidence/browser-cleanup.json'),JSON.stringify({database:name,dropped:true,finished:new Date().toISOString()},null,2));
}
process.on('SIGTERM',()=>stop().then(()=>process.exit()));process.on('SIGINT',()=>stop().then(()=>process.exit()));
(async()=>{
  admin=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,port:+process.env.DB_PORT||3306,multipleStatements:true});
  const [[version]]=await admin.query('SELECT VERSION() AS version, @@version_comment AS comment');
  await admin.query('CREATE DATABASE `'+name+'`');await admin.query('USE `'+name+'`');
  for(const file of ['schema.sql','worldbuilding_schema.sql','permissions.sql'])await admin.query(fs.readFileSync(path.join(root,'backend/database',file),'utf8').replace(/CREATE DATABASE IF NOT EXISTS worldbuilding;/g,'').replace(/USE worldbuilding;/g,''));
  process.env.DB_NAME=name;process.env.FRONTEND_ORIGIN='http://localhost:3390';delete process.env.GEMINI_API_KEY;
  server=require(path.join(root,'backend/server')).listen(3391,'127.0.0.1');pool=require(path.join(root,'backend/db'));
  await new Promise(r=>server.once('listening',r));
  async function api(method,url,body,cookie){const r=await fetch('http://127.0.0.1:3391'+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(method==='GET'?{}:{body:JSON.stringify(body||{})})});const data=await r.json();if(!r.ok)throw new Error(url+': '+JSON.stringify(data));return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  const users={};for(const role of ['owner','manager','author','reader']){const email=role+'@browser.example';const password='Browser123!';const {data}=await api('POST','/register',{username:'Browser '+role,email,password});const login=await api('POST','/login',{email,password});users[role]={...data.user,email,password,cookie:login.cookie};}
  const owner=users.owner.cookie;
  const world=(await api('POST','/api/worlds',{name:'Browser Test World',description:'A synthetic world. Night entry is forbidden.',visibility:'public'},owner)).data.world;
  const privateWorld=(await api('POST','/api/worlds',{name:'Private Browser World'},owner)).data.world;
  for(const role of ['manager','author','reader'])await api('PUT',`/api/worlds/${world.id}/members/${users[role].id}`,{role},owner);
  const content={name:'Harbour',entityType:'location',description:'A daylight harbour',body:{format:'markdown',text:'Ships arrive in daylight. Night entry is forbidden.'},outgoingRelationships:[]};
  const entity=(await api('POST',`/api/worlds/${world.id}/entities`,{content},owner)).data.entity;
  const target=(await api('POST',`/api/worlds/${world.id}/entities`,{content:{...content,name:'Harbour Watch',entityType:'organisation',outgoingRelationships:[{targetEntityId:entity.id,type:'patrols',reverseName:'patrolled by',description:'A daily patrol.'}]}},owner)).data.entity;
  const fixture={database:name,databaseVersion:version,world:world.id,privateWorld:privateWorld.id,entity:entity.id,target:target.id,users,content};
  fs.writeFileSync(path.join(root,'testing/evidence/browser-fixture.json'),JSON.stringify(fixture,null,2));
  fs.writeFileSync(path.join(root,'testing/evidence/browser-environment.json'),JSON.stringify({database:name,databaseVersion:version,node:process.version,started:new Date().toISOString(),frontend:'http://localhost:3390',backend:'http://localhost:3391',provider:'disabled; UI mocks only'},null,2));
  frontend=spawn(process.execPath,[path.join(root,'frontend/node_modules/vinext/dist/cli.js'),'dev','--host','127.0.0.1','--port','3390'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_URL:'http://localhost:3391',WRANGLER_LOG_PATH:'.wrangler/testing.log'},stdio:['ignore','pipe','pipe']});
  const log=fs.createWriteStream(path.join(root,'testing/evidence/browser-server.log'));frontend.stdout.pipe(log);frontend.stderr.pipe(log);
  frontend.on('exit',code=>{if(!stopping){console.error('Frontend exited',code);stop().then(()=>process.exit(1));}});
  console.log('Isolated browser backend ready; starting frontend.');
})().catch(e=>{console.error(e);stop().finally(()=>process.exit(1));});
