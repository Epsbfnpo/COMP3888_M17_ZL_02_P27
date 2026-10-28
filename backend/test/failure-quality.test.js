const {test}=require('node:test');
const assert=require('node:assert/strict');
// Controlled failures: import the real app with a DB substitute before db.js loads.
const dbPath=require.resolve('../db');
let failQuery=false,duplicate=false,events=[];
const fake={
  async execute(){if(duplicate)throw Object.assign(new Error('synthetic duplicate'),{code:'ER_DUP_ENTRY'});if(failQuery)throw new Error('synthetic query failure');return [[]];},
  async getConnection(){return {async beginTransaction(){events.push('begin');},async commit(){events.push('commit');},async rollback(){events.push('rollback');},release(){events.push('release');}};}
};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:fake};
const app=require('../server');
const {transaction}=require('../security');
test('QFAIL safe errors and transaction resource lifecycle',async t=>{
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  async function post(url,body){return fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
  try{
    await t.test('F01 registration database failure returns safe 500',async()=>{
      failQuery=true;const r=await post('/register',{username:'Synthetic',email:'synthetic@example.com',password:'Test123!'});
      assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:'Registration failed'});
    });
    await t.test('F02 login database failure returns safe 500',async()=>{
      const r=await post('/login',{email:'synthetic@example.com',password:'Test123!'});assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:'Login failed'});
    });
    await t.test('F03 content query failure returns generic error',async()=>{
      const r=await fetch(base+'/api/worlds');assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:'Internal server error'});
    });
    await t.test('F04 concurrent duplicate registration error maps to 409',async()=>{
      failQuery=false;duplicate=true;const r=await post('/register',{username:'Synthetic',email:'synthetic@example.com',password:'Test123!'});
      assert.equal(r.status,409);assert.match((await r.json()).error,/already exists/);duplicate=false;
    });
    await t.test('F05 failed transaction rolls back and releases connection',async()=>{
      events=[];await assert.rejects(transaction(async()=>{events.push('work');throw new Error('controlled abort');}),/controlled abort/);
      assert.deepEqual(events,['begin','work','rollback','release']);
    });
    await t.test('F06 successful transaction commits and releases connection',async()=>{
      events=[];assert.equal(await transaction(async()=>42),42);assert.deepEqual(events,['begin','commit','release']);
    });
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
