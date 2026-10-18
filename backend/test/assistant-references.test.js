const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAssistant,selection}=require('../assistant');
const user={id:7};
function fixture({role='author',denied=false,foreignProposal=false,status='draft',edges,referenceRows}={}) {
  const queries=[];
  const world={id:1,name:'Coast',role,description:'No vessels may enter at night.'};
  const entity={id:2,world_id:1,name:'Port',entity_type:'location',version:4,description:'A port',body:{text:'Published body'}};
  const refs=referenceRows??[{id:3,name:'Watch',entity_type:'organisation',version:2,description:'Coastal patrol',body:{text:'Patrols during the day.'}},{id:4,name:'Beacon',entity_type:'location',version:1,description:'Entry marker',body:{text:'Marks the entrance.'}}];
  const service=createAssistant({db:{async execute(sql,params){
    queries.push({sql,params});
    if(sql.startsWith('SELECT id FROM entities WHERE world_id='))return [refs.map(r=>({id:r.id}))];
    if(sql.includes('FROM entities WHERE id='))return [[entity]];
    if(sql.includes('FROM relationships')){
      const graph=edges??[{sourceId:3,targetId:2,type:'patrols',description:''}];
      return [params.length===3?graph:graph.filter(e=>e.sourceId===2||e.targetId===2)];
    }
    if(sql.includes('FROM entities WHERE world_id='))return [refs.filter(r=>params.slice(1).includes(r.id))];
    if(sql.includes('FROM entities e'))return [[{id:3,name:'Watch',type:'organisation',version:2,description:'Coastal patrol'}]];
    throw new Error('Unexpected SQL');
  }},access:async()=>{if(denied)throw Object.assign(new Error('World not found'),{status:404});return world;},
  readProposal:async()=>({w:world,p:{id:5,entity_id:2,contributor_id:foreignProposal?8:7,status,revision:3,base_version:4,action_type:'edit',proposed_content:{name:'Saved draft',body:{text:'Server draft'}}}})});
  return {service,queries};
}
const content={name:'Port revision',entityType:'location',description:'Draft description',body:{format:'markdown',text:'Unsaved claim'},outgoingRelationships:[]};
const draft={worldId:1,entityId:2,baseVersion:3,content};
const entityContext={kind:'entity',id:2};
test('validates reference IDs and bounds their number',()=>{
  for(const referenceIds of [[0],['3'],[1,2,3,4,5,6],{}])assert.throws(()=>selection({...entityContext,referenceIds}));
  assert.throws(()=>selection({kind:'none',referenceIds:[3]}));
});

test('world context includes its description, published entities and their relationships by default',async()=>{
  const {service,queries}=fixture();
  const c=await service.context(user,{kind:'world',id:1});
  assert.equal(c.world.description,'No vessels may enter at night.');
  assert.deepEqual(c.references.map(r=>r.id),[3,4]);
  assert.ok(c.references.every(r=>r.source==='world entity'));
  assert.equal(c.world.relationships[0].type,'patrols');
  assert.equal(c.checkedScope.wholeWorldChecked,false);
  const entityQuery=queries.find(q=>q.sql.startsWith('SELECT id FROM'));
  assert.deepEqual(entityQuery.params,[1]);assert.match(entityQuery.sql,/deleted_at IS NULL/);
  const relQuery=queries.find(q=>q.sql.includes('FROM relationships'));
  assert.deepEqual(relQuery.params,[1,1,1]);assert.match(relQuery.sql,/s.deleted_at IS NULL AND t.deleted_at IS NULL/);
});

test('world entity and relationship options are independent and manual references survive opt-out',async()=>{
  const {service}=fixture();
  const noLinks=await service.context(user,{kind:'world',id:1,includeRelationships:false,includeBody:false});
  assert.equal(noLinks.references.length,2);assert.equal(noLinks.world.relationships,undefined);
  assert.ok(noLinks.references.every(r=>r.body===undefined));
  const manual=await service.context(user,{kind:'world',id:1,includeRelated:false,referenceIds:[4]});
  assert.deepEqual(manual.references.map(r=>r.id),[4]);assert.equal(manual.world.relationships,undefined);
  const summary=await service.context(user,{kind:'world',id:1,includeRelated:false});
  assert.deepEqual(summary.references,[]);assert.ok(summary.world.description);
});

test('inaccessible worlds fail before loading entities or relationships',async()=>{
  const {service,queries}=fixture({denied:true});
  await assert.rejects(service.context(user,{kind:'world',id:1}),{status:404});
  assert.equal(queries.length,0);
});
test('loads direct neighbour summaries and prioritises selected references',async()=>{
  const c=await fixture().service.context(user,{...entityContext,referenceIds:[4]});
  assert.deepEqual(c.references.map(r=>r.id),[4,3]);
  assert.equal(c.references.find(r=>r.id===4).source,'selected');
  assert.equal(c.references.find(r=>r.id===3).source,'direct relationship');
  assert.equal(c.references.find(r=>r.id===3).version,2);assert.equal(c.checkedScope.wholeWorldChecked,false);
});
test('rejects unavailable, deleted or cross-world explicitly selected references',async()=>{
  const {service,queries}=fixture();await assert.rejects(service.context(user,{...entityContext,referenceIds:[999]}),{status:404});
  const query=queries.find(q=>q.sql.includes('FROM entities WHERE world_id='));
  assert.equal(query.params[0],1);assert.match(query.sql,/deleted_at IS NULL/);
});
test('respects neighbour opt-out and body exclusion',async()=>{
  const c=await fixture().service.context(user,{...entityContext,includeRelated:false,includeBody:false,referenceIds:[4]});
  assert.deepEqual(c.references.map(r=>r.id),[4]);assert.equal(c.references[0].body,undefined);
});
test('search is authenticated, world scoped, parameterised and excludes drafts',async()=>{
  const {service,queries}=fixture();
  await assert.rejects(service.search(null,{context:entityContext,q:'Watch'}),{status:401});
  await assert.rejects(fixture({denied:true}).service.search(user,{context:{kind:'world',id:1},q:'Watch'}),{status:404});
  const q="Watch' OR 1=1";const result=await service.search(user,{context:{kind:'world',id:1},q});
  assert.equal(result.worldId,1);const sql=queries.find(x=>x.sql.includes('FROM entities e'));
  assert.equal(sql.params[0],1);assert.equal(sql.params[1],q);assert.ok(!sql.sql.includes(q));
  assert.match(sql.sql,/entity_tags/);assert.match(sql.sql,/deleted_at IS NULL/);assert.doesNotMatch(sql.sql,/contributions/);
  assert.match(sql.sql,/LIMIT 10/);
});
test('unsaved content is separate from its current published baseline and marks stale base',async()=>{
  const {service}=fixture();const c=await service.context(user,entityContext,draft);
  assert.equal(c.entity.body,'Published body');assert.equal(c.entity.version,4);
  assert.equal(c.draft.body,'Unsaved claim');assert.equal(c.draft.notPublished,true);
  assert.match(c.draft.warning,/v3.*v4/);assert.match(c.scopeNote,/Differences alone/);
  const compiled=await service.prepare(user,{task:'consistency',message:'Check',context:entityContext,draft});
  assert.match(compiled.taskInstruction,/differences|Differences/);assert.match(compiled.taskInstruction,/entity name, ID, published version/);
});
test('readers and context mismatches cannot submit unsaved draft context',async()=>{
  await assert.rejects(fixture({role:'reader'}).service.context(user,entityContext,draft),{status:403});
  for(const d of [{...draft,worldId:8},{...draft,entityId:9},{...draft,content:{...content,body:{format:'html',text:'x'}}}])await assert.rejects(fixture().service.context(user,entityContext,d),{status:400});
  await assert.rejects(fixture().service.context(user,{kind:'none'},draft),{status:400});
});
test('proposal snapshot requires editable ownership, preserves baseline and reports revision changes',async()=>{
  const ctx={kind:'proposal',id:5};const d={...draft,proposalId:5,proposalRevision:2};
  for(const opts of [{foreignProposal:true},{status:'pending'}])await assert.rejects(fixture(opts).service.context(user,ctx,d),{status:403});
  const c=await fixture().service.context(user,ctx,d);
  assert.equal(c.proposal.body,'Server draft');assert.equal(c.entity.body,'Published body');assert.equal(c.draft.body,'Unsaved claim');assert.ok(c.draft.revisionWarning);
});
test('bounds long draft bodies and marks truncation rather than hiding it',async()=>{
  const c=await fixture().service.context(user,entityContext,{...draft,content:{...content,body:{format:'markdown',text:'x'.repeat(7000)}}});
  assert.equal(c.draft.body.length,6000);assert.ok(c.truncated.includes('draft.body'));
});

test('includes all direct neighbours beyond the previous three, five and twenty limits',async()=>{
  const refs=Array.from({length:25},(_,i)=>({id:i+10,name:`Neighbour ${i}`,version:1,description:'x'.repeat(800),body:{text:'y'.repeat(1500)}}));
  const edges=refs.map(r=>({sourceId:2,targetId:r.id,type:'connects',description:''}));
  const {service,queries}=fixture({edges,referenceRows:refs});
  const c=await service.context(user,entityContext);
  assert.equal(c.entity.relationships.length,25);assert.equal(c.references.length,25);
  assert.equal(c.references.reduce((n,r)=>n+r.description.length+r.body.length,0),24000);
  assert.ok(c.truncated.length>0);
  assert.ok(c.references.every(r=>r.id&&r.name&&r.version));
  assert.doesNotMatch(queries.find(q=>q.sql.includes('FROM relationships')).sql,/LIMIT 21/);
});

test('search returns intermediate entities and selection submits the same published chain',async()=>{
  const edges=[{sourceId:4,targetId:2,type:'leads to',sourceName:'Beacon',targetName:'Port'},
    {sourceId:4,targetId:6,type:'marks',sourceName:'Beacon',targetName:'Channel'},
    {sourceId:3,targetId:6,type:'patrols',sourceName:'Watch',targetName:'Channel'}];
  const referenceRows=[{id:3,name:'Watch',version:2},{id:4,name:'Beacon',version:1},{id:6,name:'Channel',version:3}];
  const {service,queries}=fixture({edges,referenceRows});
  const search=await service.search(user,{context:entityContext,q:'Watch'});
  assert.deepEqual(search.results[0].intermediates.map(r=>r.id),[4,6]);
  assert.deepEqual(search.results[0].connection.entityIds,[2,4,6,3]);
  const c=await service.context(user,{...entityContext,referenceIds:[3]});
  assert.deepEqual(c.references.map(r=>r.id),[3,4,6]);
  assert.equal(c.references.find(r=>r.id===6).source,'connection path');
  assert.deepEqual(c.connectionPaths[0].relationships,edges);
  const graphQuery=queries.find(q=>q.sql.includes('LIMIT 5001'));
  assert.deepEqual(graphQuery.params,[1,1,1]);assert.match(graphQuery.sql,/s.deleted_at IS NULL AND t.deleted_at IS NULL/);
});

test('shortest paths handle reverse traversal, cycles, self and disconnected entities',()=>{
  const {shortestConnections}=require('../assistant-connections');
  const edges=[{sourceId:2,targetId:3},{sourceId:3,targetId:4},{sourceId:4,targetId:2},{sourceId:8,targetId:9}];
  const paths=shortestConnections(edges,2,[4,9,2]);
  assert.deepEqual(paths[0].entityIds,[2,4]);assert.equal(paths[0].relationships[0].sourceId,4);
  assert.equal(paths[1].found,false);assert.deepEqual(paths[2].entityIds,[2]);
});

test('large graphs report incomplete path coverage and do not assert disconnection',async()=>{
  const edges=Array.from({length:5001},()=>({sourceId:2,targetId:3,type:'connects'}));
  const c=await fixture({edges}).service.context(user,{...entityContext,referenceIds:[4]});
  assert.equal(c.connectionPaths[0].found,false);
  assert.ok(c.truncated.some(t=>t.includes('connection graph')));
});
