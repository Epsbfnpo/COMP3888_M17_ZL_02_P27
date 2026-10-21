const {randomUUID}=require('node:crypto');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};

async function prepareEdit(assistant,user,body){
  if(!body.draft)fail(400,'Open an editable draft to request a suggestion.');
  const text=body.draft.content?.body?.text;
  if(typeof text!=='string'||text.length>6000)fail(400,'Body suggestions support up to 6,000 characters. Shorten the body before requesting an edit.');
  const compiled=await assistant.prepare(user,{...body,task:'general',history:[]});
  if(!compiled.context.draft)fail(403,'An editable draft is required.');
  if(compiled.context.entity&&body.draft.baseVersion!==compiled.context.entity.version)fail(409,'The published version changed. Refresh the editor before requesting a suggestion.');
  if(compiled.context.proposal&&body.draft.proposalRevision!==compiled.context.proposal.revision)fail(409,'The proposal revision changed. Refresh the editor before requesting a suggestion.');
  compiled.editMode=true;
  compiled.taskInstruction='Rewrite the complete unsaved draft body according to the user request. Preserve unrelated passages, facts and Markdown formatting. Return ONLY a JSON object with one string field: suggestedText. Its value must be the full replacement body, not a patch or explanation. Do not include code fences. Do not claim to save or publish. Keep the replacement within 12,000 characters. If no change is needed return the original body. The unsaved draft body is the edit target; other context is reference material.';
  return compiled;
}

function parseEdit(answer,draft){
  let value;
  try{value=JSON.parse(answer.reply);}catch{fail(502,'The AI returned an invalid edit. Try again; your draft is unchanged.');}
  if(!value||typeof value.suggestedText!=='string'||!value.suggestedText.trim()||value.suggestedText.length>12000)
    fail(502,'The AI returned an empty or oversized edit. Your draft is unchanged.');
  return {id:randomUUID(),originalText:draft.content.body.text,suggestedText:value.suggestedText,
    baseVersion:draft.baseVersion??null,...(draft.proposalRevision!==undefined?{proposalRevision:draft.proposalRevision}:{})};
}
module.exports={prepareEdit,parseEdit};
