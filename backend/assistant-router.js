const { createGemini, createUsageGuard, model } = require('./gemini');
const { getGeminiApiKey } = require('./ai-config');

function createAssistantRouter({ assistant, generate = createGemini(), begin = createUsageGuard(), getKey = getGeminiApiKey }) {
  const router = require('express').Router();
  router.post('/api/ai/context', async (req,res) => {
    res.set('Cache-Control','no-store');
    const context = await assistant.context(req.user,req.body,req.body.draft);
    let configured=false;
    try { getKey(); configured=true; } catch { /* Return presence only. */ }
    res.json({context,service:{model,configured}});
  });
  router.post('/api/ai/search', async(req,res)=>{
    res.set('Cache-Control','no-store');
    res.json(await assistant.search(req.user,req.body));
  });
  router.post('/api/ai/preview', async (req,res) => {
    res.set('Cache-Control','no-store');
    res.json(await assistant.preview(req.user,req.body));
  });
  router.post('/api/ai/chat', async (req,res,next) => {
    res.set('Cache-Control','no-store');
    const controller=new AbortController();
    let release;
    const cancel=()=>{if(!res.writableEnded)controller.abort();};
    res.on('close',cancel);
    try {
      if(!req.user)throw Object.assign(new Error('Sign in required'),{status:401});
      release=begin(req.user.id);
      const compiled=await assistant.prepare(req.user,req.body);
      const answer=await generate(compiled,controller.signal);
      await assistant.context(req.user,req.body.context,req.body.draft);
      if(!controller.signal.aborted)res.json({mode:'live',...answer,context:compiled.context,
        request:{task:req.body.task||'general',message:compiled.message,history:compiled.history,context:compiled.context}});
    } catch(error) {
      if(!controller.signal.aborted){
        if(error.status&&error.status!==499)res.status(error.status).json({error:error.message});
        else next(error);
      }
    } finally {release?.();res.off('close',cancel);}
  });
  return router;
}
module.exports={createAssistantRouter};
