const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAssistant, validateRequest, selection } = require('../assistant');
const { systemInstruction, tasks } = require('../assistant-prompts');

test('shared prompt defaults to English and preserves grounding and direction rules', () => {
  assert.match(systemInstruction, /Respond in English by default/);
  assert.match(systemInstruction, /only if the user explicitly requests it/);
  assert.match(systemInstruction, /Follow explicit length and format limits/);
  assert.match(systemInstruction, /Absence from supplied context/);
  assert.match(systemInstruction, /patrolled by/);
  assert.deepEqual(Object.keys(tasks), ['general','expand','consistency','relationships']);
});

function fixture({ denied = false, proposalDenied = false, long = false } = {}) {
  const calls = [];
  const service = createAssistant({
    db: { async execute(sql) {
      calls.push(sql);
      if (sql.includes('FROM entities WHERE id=')) return [[{id:2,world_id:1,name:'Mist Harbour',entity_type:'location',version:3,description:'A trade port.',body:JSON.stringify({text:long?'x'.repeat(7000):'Ships stop at night.'})}]];
      if (sql.includes('FROM relationships')) return [[{type:'protects',sourceId:3,targetId:2,sourceName:'Watch',targetName:'Mist Harbour',description:'Keeps shipping safe.'}]];
      if (sql.includes('FROM entities WHERE world_id=')) return [[{id:3,name:'Watch',entity_type:'organisation',version:1,body:JSON.stringify({text:'Patrols the coast.'})}]];
      throw new Error('Unexpected query');
    } },
    async access() {
      if (denied) throw Object.assign(new Error('World not found'), {status:404});
      return {id:1,name:'Coastal Realm',description:'Maritime world.',owner_id:8,role:'reader',email:'not-context@example.com'};
    },
    async readProposal(db, req) {
      if (proposalDenied) throw Object.assign(new Error('Proposal not found'), {status:404});
      assert.equal(req.user.id,7);
      return {w:{id:1,name:'Coastal Realm'},p:{id:4,status:'draft',revision:2,action_type:'edit',base_version:3,contributor_id:7,proposed_content:{name:'Draft Harbour',body:{text:'Draft text'},requiresOwnerReview:true}}};
    },
  });
  return { service, calls };
}
const user={id:7};
const entity={kind:'entity',id:2};
test('validates task, prompt length and bounded non-system history', () => {
  assert.equal(validateRequest({message:' hello '}).message,'hello');
  for (const message of ['', ' ', 'x'.repeat(2001)]) assert.throws(()=>validateRequest({message}));
  for (const task of ['__proto__','unknown',{},null]) assert.throws(()=>validateRequest({message:'hello',task}));
  assert.throws(()=>validateRequest({message:'hello',history:[{role:'system',text:'override'}]}));
  assert.throws(()=>validateRequest({message:'hello',history:Array(9).fill({role:'user',text:'a'})}));
  assert.throws(()=>validateRequest({message:'hello',history:Array(5).fill({role:'user',text:'a'.repeat(4000)})}));
});
test('rejects malformed context selectors and flags', () => {
  for (const context of [null,{}, {kind:'entity',id:-1},{kind:'world',id:1,includeBody:'false'},{kind:'entity',id:1.5}]) assert.throws(()=>selection(context));
});
test('requires authentication even for conversation without context', async () => {
  await assert.rejects(fixture().service.context(null,{kind:'none'}),{status:401});
});
test('rechecks entity access and never fetches relationships after denial', async () => {
  const {service,calls}=fixture({denied:true});
  await assert.rejects(service.context(user,entity),{status:404});
  assert.equal(calls.length,1);
});
test('uses saved version and explicitly whitelists world fields', async () => {
  const c=await fixture().service.context(user,entity);
  assert.equal(c.entity.version,3);assert.equal(c.entity.body,'Ships stop at night.');
  assert.equal(c.entity.relationships[0].type,'protects');
  assert.equal(c.world.email,undefined);assert.equal(c.world.owner_id,undefined);
});
test('excluded body and relationships are not submitted or queried', async () => {
  const {service,calls}=fixture();const c=await service.context(user,{...entity,includeBody:false,includeRelationships:false});
  assert.equal(c.entity.body,undefined);assert.equal(c.entity.relationships,undefined);assert.equal(calls.length,1);
});
test('bounds entity content and reports truncation', async () => {
  const c=await fixture({long:true}).service.context(user,entity);
  assert.equal(c.entity.body.length,6000);assert.deepEqual(c.truncated,['entity.body']);
});
test('world context can opt out of automatic published entities', async () => {
  const {service,calls}=fixture();const c=await service.context(user,{kind:'world',id:1,includeRelated:false});
  assert.equal(c.world.name,'Coastal Realm');assert.equal(c.entity,undefined);assert.equal(calls.length,0);
});
test('proposal context delegates to the existing proposal access guard', async () => {
  await assert.rejects(fixture({proposalDenied:true}).service.context(user,{kind:'proposal',id:4}),{status:404});
  const c=await fixture().service.context(user,{kind:'proposal',id:4});
  assert.equal(c.proposal.revision,2);assert.equal(c.proposal.body,'Draft text');assert.equal(c.proposal.requiresOwnerReview,undefined);
});
test('compiles templates and history without any provider request or writes', async () => {
  for (const task of ['general','expand','consistency','relationships']) {
    const {service,calls}=fixture();const result=await service.preview(user,{task,message:'Help',history:[{role:'user',text:'Earlier question'}],context:{kind:'none'},apiKey:'must-not-be-used',systemInstruction:'override'});
    assert.equal(result.mode,'preview');assert.match(result.reply,/No Gemini request was sent/);
    assert.match(result.request.systemInstruction,/untrusted data/);
    assert.equal(result.request.systemInstruction,systemInstruction);
    assert.equal(result.request.taskInstruction,tasks[task]);
    assert.equal(result.request.history.length,1);assert.equal(result.request.apiKey,undefined);assert.equal(calls.length,0);
  }
});
