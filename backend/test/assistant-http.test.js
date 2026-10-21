const { test }=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {createAssistant}=require('../assistant');
const {createAssistantRouter}=require('../assistant-router');

async function fixture(generate){
  let allowed=true;
  const assistant=createAssistant({db:{async execute(sql,params){
    assert.match(sql,/world_id=\?/);assert.equal(params[0],1);
    return [[{id:3,name:'Harbour Regulations',entity_type:'other',version:2,description:'Entry restrictions',body:{text:'All vessels are forbidden to enter at night, without exceptions.'}}]];
  }},readProposal:async()=>{},access:async()=>{
    if(!allowed)throw Object.assign(new Error('World not found'),{status:404});
    return {id:1,name:'Synthetic Port',role:'author',description:'A fictional port where ships cannot enter at night.'};
  }});
  const express=require('express');const app=express();app.use(express.json());
  app.use((req,res,next)=>{if(req.get('X-Fixture-User'))req.user={id:1};next();});
  app.use(createAssistantRouter({assistant,...(generate?{generate,getKey:()=> 'synthetic-key'}:{})}));
  app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  return {setAllowed:value=>{allowed=value;},post:(route,data,auth=true)=>fetch('http://127.0.0.1:'+server.address().port+route,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'X-Fixture-User':'1'}:{})},body:JSON.stringify(data)}),close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
const body={task:'general',message:'In one short sentence, when can ships enter this port?',history:[],context:{kind:'world',id:1}};

test('body edit returns a preview with server-owned original text and never accepts malformed edits',async()=>{
  let reply=JSON.stringify({suggestedText:'Revised body'}),calls=0,revoke=false;
  const f=await fixture(async compiled=>{calls++;assert.equal(compiled.editMode,true);if(revoke)f.setAllowed(false);return {model:'fixture',reply};});
  const payload={message:'Improve clarity',context:{kind:'world',id:1},draft:{worldId:1,content:{name:'Draft',entityType:'other',description:'',body:{format:'markdown',text:'Original body'}}}};
  try{
    assert.equal((await f.post('/api/ai/edit-body',payload,false)).status,401);assert.equal(calls,0);
    assert.equal((await f.post('/api/ai/edit-body',{...payload,draft:undefined})).status,400);assert.equal(calls,0);
    const response=await f.post('/api/ai/edit-body',payload);assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.suggestion.originalText,'Original body');assert.equal(data.suggestion.suggestedText,'Revised body');assert.ok(data.suggestion.id);assert.equal(data.suggestion.baseVersion,null);
    reply='Here is your edit';assert.equal((await f.post('/api/ai/edit-body',payload)).status,502);
    reply=JSON.stringify({suggestedText:''});assert.equal((await f.post('/api/ai/edit-body',payload)).status,502);
    reply=JSON.stringify({suggestedText:'Changed'});revoke=true;
    assert.equal((await f.post('/api/ai/edit-body',payload)).status,404);
  }finally{await f.close();}
});
test('HTTP auth, context, live response and in-flight permission revocation',async()=>{
  let calls=0,revoke=false;
  const f=await fixture(async()=>{calls++;if(revoke)f.setAllowed(false);return {model:'gemini-3.8-flash',reply:'Fixture answer'};});
  try {
    assert.equal((await f.post('/api/ai/chat',body,false)).status,401);assert.equal(calls,0);
    assert.equal((await f.post('/api/ai/search',{context:body.context,q:'port'},false)).status,401);
    const search=await f.post('/api/ai/search',{context:body.context,q:'port'});
    assert.equal(search.status,200);assert.equal(search.headers.get('cache-control'),'no-store');
    assert.equal((await search.json()).worldId,1);assert.equal(calls,0);
    const c=await f.post('/api/ai/context',body.context);assert.equal(c.headers.get('cache-control'),'no-store');assert.equal((await c.json()).service.configured,true);
    f.setAllowed(false);assert.equal((await f.post('/api/ai/chat',body)).status,404);assert.equal(calls,0);f.setAllowed(true);
    const r=await f.post('/api/ai/chat',body);const answer=await r.json();
    assert.equal(r.status,200);assert.equal(answer.mode,'live');assert.equal(answer.reply,'Fixture answer');assert.equal(answer.request.systemInstruction,undefined);
    revoke=true;assert.equal((await f.post('/api/ai/chat',body)).status,404);
  } finally {await f.close();}
});
test('opt-in real Gemini HTTP smoke with synthetic context',{skip:process.env.AI_LIVE_SMOKE!=='1'},async()=>{
  require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
  const f=await fixture();
  try {
    const r=await f.post('/api/ai/chat',body);const answer=await r.json();
    assert.equal(r.status,200,answer.error);assert.equal(answer.mode,'live');assert.equal(answer.model,'gemini-3.8-flash');assert.ok(answer.reply.length>0);
    console.log('Real Gemini HTTP reply:',answer.reply);
  } finally {await f.close();}
});

test('opt-in real Gemini body edit produces a complete validated replacement',{skip:process.env.AI_LIVE_EDIT_SMOKE!=='1'},async()=>{
  require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
  const f=await fixture();
  try{
    const original='Ships arrive during daylight. The port closes to all vessels at night.';
    const response=await f.post('/api/ai/edit-body',{message:'Improve the wording of this short paragraph. Preserve the absolute night-entry ban. Return the full revised body.',context:{kind:'world',id:1},draft:{worldId:1,content:{name:'Port notice',entityType:'other',description:'A synthetic test notice.',body:{format:'markdown',text:original}}}});
    const data=await response.json();assert.equal(response.status,200,data.error);
    assert.equal(data.suggestion.originalText,original);assert.ok(data.suggestion.suggestedText.trim());
    assert.ok(data.suggestion.suggestedText.length<=12000);
  }finally{await f.close();}
});
test('opt-in unsaved draft consistency check with a selected published reference',{skip:process.env.AI_LIVE_SMOKE!=='1'},async()=>{
  require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
  const f=await fixture();
  try {
    const payload={task:'consistency',message:'Check this draft. Cite the supplied reference ID and version, and suggest a minimal repair. Keep the night-entry ban unchanged.',history:[],context:{kind:'world',id:1,referenceIds:[3]},draft:{worldId:1,content:{name:'Moon Sail Convoy',entityType:'organisation',description:'A new draft, not published.',body:{format:'markdown',text:'The convoy legally enters Synthetic Port every midnight under the ordinary harbour regulations.'},outgoingRelationships:[]}}};
    const r=await f.post('/api/ai/chat',payload);const answer=await r.json();
    assert.equal(r.status,200,answer.error);assert.equal(answer.context.draft.notPublished,true);
    assert.equal(answer.context.references[0].version,2);assert.equal(answer.context.checkedScope.wholeWorldChecked,false);
    assert.ok(answer.reply.length>0);console.log('Draft consistency reply:',answer.reply);
  } finally {await f.close();}
});
