const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepareEdit,parseEdit}=require('../assistant-edit');
const draft={baseVersion:2,proposalRevision:3,content:{body:{text:'Original'}}};
test('body edit rejects stale baseline, stale proposal and oversized input before generation',async()=>{
  const assistant={prepare:async()=>({context:{draft:{},entity:{version:2},proposal:{revision:3}}})};
  assert.equal((await prepareEdit(assistant,{id:1},{draft})).editMode,true);
  await assert.rejects(prepareEdit(assistant,{id:1},{draft:{...draft,baseVersion:1}}),{status:409});
  await assert.rejects(prepareEdit(assistant,{id:1},{draft:{...draft,proposalRevision:2}}),{status:409});
  await assert.rejects(prepareEdit(assistant,{id:1},{draft:{...draft,content:{body:{text:'x'.repeat(6001)}}}}),{status:400});
});
test('model cannot supply original text or version and malformed replacements are rejected',()=>{
  const answer={reply:JSON.stringify({originalText:'Wrong',baseVersion:999,suggestedText:'Replacement'})};
  const suggestion=parseEdit(answer,draft);
  assert.equal(suggestion.originalText,'Original');assert.equal(suggestion.baseVersion,2);assert.equal(suggestion.proposalRevision,3);
  for(const reply of ['{}','null','[]','not json',JSON.stringify({suggestedText:'x'.repeat(12001)}),JSON.stringify({suggestedText:'  '})])assert.throws(()=>parseEdit({reply},draft),{status:502});
});
