import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node runs TypeScript sources directly for this test.
import {lineChanges,suggestionIsStale} from './edit-suggestion.ts';

test('diff preserves unchanged text and reconstructs both body versions',()=>{
  const original='First\nOld\nLast',suggested='First\nNew\nLast';
  const lines=lineChanges(original,suggested);
  assert.equal(lines.filter(l=>l.kind!=='added').map(l=>l.text).join('\n'),original);
  assert.equal(lines.filter(l=>l.kind!=='removed').map(l=>l.text).join('\n'),suggested);
  assert.equal(lines.filter(l=>l.kind==='same').length,2);
});
test('old suggestions cannot replace changed text, versions or proposal revisions',()=>{
  const suggestion={id:'one',originalText:'Original',suggestedText:'Replacement',baseVersion:3,proposalRevision:2};
  assert.equal(suggestionIsStale(suggestion,{text:'Original',baseVersion:3,proposalRevision:2}),false);
  for(const current of [{text:'Edited',baseVersion:3,proposalRevision:2},{text:'Original',baseVersion:4,proposalRevision:2},{text:'Original',baseVersion:3,proposalRevision:3}])assert.equal(suggestionIsStale(suggestion,current),true);
});
