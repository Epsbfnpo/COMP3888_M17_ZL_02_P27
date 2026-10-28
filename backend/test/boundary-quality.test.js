const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateRequest,selection}=require('../assistant');
const {prepareEdit,parseEdit}=require('../assistant-edit');
test('B01 AI prompt length boundaries 0, 1, 1999, 2000, 2001',()=>{
  for(const n of [1,1999,2000])assert.equal(validateRequest({message:'x'.repeat(n)}).message.length,n);
  for(const n of [0,2001])assert.throws(()=>validateRequest({message:'x'.repeat(n)}),{status:400});
});
test('B02 explicit references boundary 4, 5, 6 and deduplication',()=>{
  for(const n of [4,5])assert.equal(selection({kind:'world',id:1,referenceIds:Array.from({length:n},(_,i)=>i+1)}).referenceIds.length,n);
  assert.throws(()=>selection({kind:'world',id:1,referenceIds:[1,2,3,4,5,6]}),{status:400});
  assert.deepEqual(selection({kind:'world',id:1,referenceIds:[1,1]}).referenceIds,[1]);
});
test('B03 history 7/8/9 messages, 3999/4000/4001 characters and total budget',()=>{
  for(const n of [7,8])assert.equal(validateRequest({message:'x',history:Array.from({length:n},()=>({role:'user',text:'x'}))}).history.length,n);
  assert.throws(()=>validateRequest({message:'x',history:Array.from({length:9},()=>({role:'user',text:'x'}))}),{status:400});
  for(const n of [3999,4000])validateRequest({message:'x',history:[{role:'assistant',text:'x'.repeat(n)}]});
  assert.throws(()=>validateRequest({message:'x',history:[{role:'assistant',text:'x'.repeat(4001)}]}),{status:400});
  const history=Array.from({length:4},()=>({role:'user',text:'x'.repeat(4000)}));validateRequest({message:'x',history});
  assert.throws(()=>validateRequest({message:'x',history:[...history,{role:'user',text:'x'}]}),{status:400});
});
test('B04 body edit input 5999/6000/6001 and replacement 11999/12000/12001',async()=>{
  const assistant={prepare:async()=>({context:{draft:{}}})};
  for(const n of [5999,6000])await prepareEdit(assistant,{id:1},{draft:{content:{body:{text:'x'.repeat(n)}}}});
  await assert.rejects(prepareEdit(assistant,{id:1},{draft:{content:{body:{text:'x'.repeat(6001)}}}}),{status:400});
  const draft={content:{body:{text:'Original'}}};
  for(const n of [11999,12000])assert.equal(parseEdit({reply:JSON.stringify({suggestedText:'x'.repeat(n)})},draft).suggestedText.length,n);
  assert.throws(()=>parseEdit({reply:JSON.stringify({suggestedText:'x'.repeat(12001)})},draft),{status:502});
});
