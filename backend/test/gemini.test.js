const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGemini, createUsageGuard, model } = require('../gemini');
const request = {systemInstruction:'System',taskInstruction:'Task',context:{label:'Fixture'},history:[{role:'assistant',text:'Earlier suggestion'}],message:'Help'};
const success = {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'hidden reasoning'},{text:'Useful answer'}]}}]})};
test('provider sends tested model and shared instructions without putting key in URL or body', async () => {
  const generate = createGemini({getKey:()=> 'synthetic-secret',fetchImpl:async(url,init)=>{
    assert.ok(url.includes(model));assert.ok(!url.includes('synthetic-secret'));
    assert.equal(init.headers['x-goog-api-key'],'synthetic-secret');
    const body=JSON.parse(init.body);assert.ok(!init.body.includes('synthetic-secret'));
    assert.match(body.systemInstruction.parts[0].text,/System/);
    assert.equal(body.contents[1].role,'model');return success;
  }});
  assert.deepEqual(await generate(request),{model,reply:'Useful answer'});
});
test('missing configuration and upstream errors return safe messages only', async () => {
  await assert.rejects(createGemini({getKey:()=>{throw new Error('private detail');}})(request),{status:503});
  for (const status of [400,401,403,404,429,500]) {
    const generate=createGemini({getKey:()=> 'synthetic-secret',fetchImpl:async()=>({ok:false,status,json:async()=>{throw new Error('must not inspect provider error');}})});
    await assert.rejects(generate(request),e=>e.status===(status===429?429:status===500?502:503)&&!e.message.includes('synthetic-secret'));
  }
});
test('network, malformed, empty and blocked responses are handled safely', async () => {
  for(const response of [{ok:true,json:async()=>{throw new Error('secret');}},{ok:true,json:async()=>({})},{ok:true,json:async()=>({candidates:[{finishReason:'SAFETY',content:{parts:[{text:'partial'}]}}]})}]) {
    await assert.rejects(createGemini({getKey:()=> 'fixture',fetchImpl:async()=>response})(request),{status:502});
  }
  await assert.rejects(createGemini({getKey:()=> 'fixture',fetchImpl:async()=>{throw new Error('secret');}})(request),{status:502});
});
test('supports cancellation and server timeout without automatic paid retries', async () => {
  const wait=async(url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)reject(new Error('aborted'));else signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});
  const controller=new AbortController();controller.abort();
  await assert.rejects(createGemini({getKey:()=> 'fixture',fetchImpl:wait})(request,controller.signal),{status:499});
  // Keep a handle alive while AbortSignal.timeout's unreferenced timer runs.
  const keepAlive=setTimeout(()=>{},1000);
  try {await assert.rejects(createGemini({getKey:()=> 'fixture',fetchImpl:wait,timeoutMs:5})(request),{status:504});}
  finally {clearTimeout(keepAlive);}
});
test('bounds replies so the next conversation turn remains valid', async () => {
  const answer=await createGemini({getKey:()=> 'fixture',fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'x'.repeat(5000)}]}}]})})})(request);
  assert.ok(answer.reply.length<=4000);assert.match(answer.reply,/Response shortened/);
});
test('usage guard enforces concurrent and per-minute limits, resets, and bounds memory', () => {
  let time=0;const begin=createUsageGuard({now:()=>time,limit:2,maxUsers:1});
  const release=begin(1);assert.throws(()=>begin(1),{status:429});assert.throws(()=>begin(2),{status:429});
  release();begin(1)();assert.throws(()=>begin(1),{status:429});
  time=60001;begin(2)();
});
