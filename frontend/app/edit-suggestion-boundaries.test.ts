import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node runs TypeScript sources directly for this test.
import {lineChanges,suggestionIsStale} from './edit-suggestion.ts';

const rebuild=(lines:{kind:string;text:string}[])=>({
  original:lines.filter(l=>l.kind!=='added').map(l=>l.text).join('\n'),
  suggested:lines.filter(l=>l.kind!=='removed').map(l=>l.text).join('\n'),
});

test('FE01 diff reconstructs both bodies for empty, identical, whitespace and trailing-newline edits',()=>{
  const pairs=[['',''],['','Added'],['Removed',''],['Same\nText','Same\nText'],['Line one','Line one '],['Ends\n','Ends'],['A\nB\nC','C\nB\nA']];
  for(const [original,suggested] of pairs){
    const lines=lineChanges(original,suggested);
    assert.deepEqual(rebuild(lines),{original,suggested},JSON.stringify([original,suggested]));
  }
  assert.ok(lineChanges('Same\nText','Same\nText').every(l=>l.kind==='same'));
  assert.deepEqual(lineChanges('Line one','Line one ').map(l=>l.kind),['removed','added']);
});

test('FE02 line diff switches to a whole-body comparison above 100,000 line pairs',()=>{
  const body=(n:number,last:string)=>Array.from({length:n},(_,i)=>i===n-1?last:'Line '+i).join('\n');
  // 316 x 316 = 99,856 pairs: unchanged lines are matched.
  const within=lineChanges(body(316,'Old end'),body(316,'New end'));
  assert.equal(within.filter(l=>l.kind==='same').length,315);
  // 317 x 317 = 100,489 pairs: every line is shown as removed then added, still reconstructable.
  const above=lineChanges(body(317,'Old end'),body(317,'New end'));
  assert.equal(above.filter(l=>l.kind==='same').length,0);
  assert.deepEqual(rebuild(above),{original:body(317,'Old end'),suggested:body(317,'New end')});
});

test('FE03 stale check treats missing and null base versions alike but any revision change as stale',()=>{
  const suggestion={id:'s',originalText:'Body',suggestedText:'New body'};
  assert.equal(suggestionIsStale({...suggestion,baseVersion:null},{text:'Body'}),false);
  assert.equal(suggestionIsStale(suggestion,{text:'Body',baseVersion:null}),false);
  assert.equal(suggestionIsStale(suggestion,{text:'Body',proposalRevision:1}),true);
  assert.equal(suggestionIsStale({...suggestion,proposalRevision:1},{text:'Body'}),true);
  assert.equal(suggestionIsStale(suggestion,{text:'Body '}),true);
});
