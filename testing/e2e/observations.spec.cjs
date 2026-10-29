const {test,expect}=require('@playwright/test');const fs=require('node:fs');const path=require('node:path');
test('N01 observe 60 local reads at concurrency five without claiming a production SLA',async({request},info)=>{
  const f=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/browser-fixture.json'),'utf8'));
  const urls=[`/api/worlds/${f.world}`,`/api/entities/${f.entity}`,'/api/entities/search?q=Harbour'];
  const rows=[];let next=0;const started=performance.now();
  await Promise.all(Array.from({length:5},async()=>{while(next<60){const index=next++,url=urls[index%urls.length],begin=performance.now();const r=await request.get('http://localhost:3391'+url);await r.body();rows.push({index,url,status:r.status(),ms:performance.now()-begin});}}));
  const elapsedMs=performance.now()-started;const times=rows.map(r=>r.ms).sort((a,b)=>a-b);
  const result={scope:'Synthetic public fixture with two entities; local backend only; warmed database; no AI; no SLA threshold',requests:rows.length,concurrency:5,elapsedMs,requestsPerSecond:rows.length/(elapsedMs/1000),p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1],maxMs:times.at(-1),errors:rows.filter(r=>r.status!==200).length,rows};
  fs.writeFileSync(path.join(__dirname,'../evidence/local-read-observations.json'),JSON.stringify(result,null,2));await info.attach('local-read-observations',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(rows).toHaveLength(60);expect(result.errors).toBe(0);
});
