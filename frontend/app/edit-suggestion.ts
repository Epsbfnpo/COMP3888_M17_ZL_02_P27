export type EditSuggestion = {
  id: string;
  originalText: string;
  suggestedText: string;
  baseVersion?: number | null;
  proposalRevision?: number;
};

export function suggestionIsStale(suggestion: EditSuggestion, current: {text:string; baseVersion?:number|null; proposalRevision?:number}) {
  return suggestion.originalText !== current.text ||
    (suggestion.baseVersion ?? null) !== (current.baseVersion ?? null) ||
    suggestion.proposalRevision !== current.proposalRevision;
}

export function lineChanges(original: string, suggested: string): {kind:'same'|'removed'|'added';text:string}[] {
  const a=original.split('\n'), b=suggested.split('\n');
  if(a.length*b.length>100000)return [...a.map(text=>({kind:'removed' as const,text})),...b.map(text=>({kind:'added' as const,text}))];
  const lengths=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)
    lengths[i][j]=a[i]===b[j]?1+lengths[i+1][j+1]:Math.max(lengths[i+1][j],lengths[i][j+1]);
  const result: {kind:'same'|'removed'|'added';text:string}[]=[];
  let i=0,j=0;
  while(i<a.length||j<b.length){
    if(i<a.length&&j<b.length&&a[i]===b[j]){result.push({kind:'same',text:a[i++]});j++;}
    else if(i<a.length&&(j===b.length||lengths[i+1][j]>=lengths[i][j+1]))result.push({kind:'removed',text:a[i++]});
    else result.push({kind:'added',text:b[j++]});
  }
  return result;
}
