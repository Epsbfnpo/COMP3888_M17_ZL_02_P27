// Supplementary browser checks added 31 October: UI restore, role-dependent controls, AI panel safety
// and an accessibility scan of the main pages. Uses the same isolated fixture as workflows.spec.cjs.
const {test,expect}=require('@playwright/test');
const fs=require('node:fs');const path=require('node:path');
const AxeBuilder=require('@axe-core/playwright').default;
const fixture=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/browser-fixture.json'),'utf8'));
const apiURL='http://localhost:3391';
test.beforeEach(async({page})=>{page.on('dialog',dialog=>dialog.accept());});
async function visit(page,url){await page.goto(url);await page.waitForFunction(()=>[...document.querySelectorAll('input,button,a')].some(el=>Object.keys(el).some(k=>k.startsWith('__reactProps$'))));}
async function login(page,role='owner'){
  const user=fixture().users[role];await visit(page,'/');
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill(user.password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/home$/);
}
async function api(page,method,url,data){const response=await page.request.fetch(apiURL+url,{method,...(method!=='GET'?{data:data??{}}: {})});expect(response.ok(),await response.text()).toBeTruthy();return response.json();}
async function evidence(page,testInfo,name){const file=testInfo.outputPath(name+'.png');await page.screenshot({path:file,fullPage:true});await testInfo.attach(name,{path:file,contentType:'image/png'});}
async function twoVersionEntity(page,name){
  const f=fixture();const e=(await api(page,'POST',`/api/worlds/${f.world}/entities`,{content:{...f.content,name}})).entity;
  await api(page,'PATCH',`/api/entities/${e.id}`,{baseVersion:1,content:{...f.content,name,body:{format:'markdown',text:'Version two body.'}}});
  return e.id;
}
async function configuredAssistant(page){
  await page.route('**/api/ai/context',async route=>{const response=await route.fetch();const data=await response.json();data.service.configured=true;await route.fulfill({response,json:data});});
}

test('UI13 manager restores an earlier version from the history page as a new version',async({page},info)=>{
  await login(page);const id=await twoVersionEntity(page,'Restore Browser Entity');
  await login(page,'manager');await visit(page,`/entities/${id}/history`);
  await page.getByLabel('Select a version',{exact:true}).selectOption('1');
  await page.getByRole('button',{name:'Restore version 1',exact:true}).click();
  await expect(page.getByText('Version 1 restored as version 3.',{exact:true})).toBeVisible();await evidence(page,info,'ui-restore');
  const state=await api(page,'GET',`/api/entities/${id}/versions`);
  expect(state.entity.version).toBe(3);expect(state.versions.map(v=>v.version)).toEqual([3,2,1]);
  expect(state.versions[0].snapshot.body.text).toBe(fixture().content.body.text);expect(state.versions[0].snapshot.rollback_of_version).toBe(1);
});

test('UI14 entity and history controls match each role',async({page},info)=>{
  await login(page);const id=await twoVersionEntity(page,'Role Controls Entity');
  await page.context().clearCookies();
  // Expected controls per role, from docs/PERMISSIONS.md. The backend remains authoritative.
  const expected={
    guest:{edit:0,delete:0,propose:0,history:0,restore:0},
    reader:{edit:0,delete:0,propose:0,history:0,restore:0},
    author:{edit:0,delete:0,propose:1,history:1,restore:0},
    manager:{edit:0,delete:0,propose:1,history:1,restore:1},
    owner:{edit:1,delete:1,propose:0,history:1,restore:1},
  };
  const observed={};
  for(const role of Object.keys(expected)){
    await page.context().clearCookies();if(role!=='guest')await login(page,role);
    await visit(page,`/entities/${id}`);await expect(page.getByRole('heading',{name:'Role Controls Entity',level:1})).toBeVisible();
    const seen={
      edit:await page.getByRole('button',{name:'Edit entity',exact:true}).count(),
      delete:await page.getByRole('button',{name:'Delete entity',exact:true}).count(),
      propose:await page.getByRole('button',{name:'Propose a change',exact:true}).count(),
      history:await page.getByRole('link',{name:/View version history/}).count(),
    };
    await visit(page,`/entities/${id}/history`);
    if(seen.history)await expect(page.getByLabel('Select a version',{exact:true})).toBeVisible();
    else await expect(page.getByLabel('Select a version',{exact:true})).toHaveCount(0);
    seen.restore=await page.getByRole('button',{name:/^Restore version \d+$/}).count();
    observed[role]=seen;
    await evidence(page,info,`controls-${role}`);
  }
  await info.attach('role-controls',{body:JSON.stringify({expected,observed},null,2),contentType:'application/json'});
  expect(observed).toEqual(expected);
});

test('UI15 assistant panel: keyboard access, safe rendering of HTML replies and the request limit',async({page},info)=>{
  const f=fixture();await login(page);await configuredAssistant(page);
  let mode='html';
  await page.route('**/api/ai/chat',async route=>{
    if(mode==='limit')return route.fulfill({status:429,json:{error:'You have reached the AI request limit. Try again in a minute.'}});
    await route.fulfill({json:{mode:'live',model:'test-double',reply:'**Daylight only.** <img src=x onerror="window.__aiInjected=1"> <script>window.__aiInjected=2</script>',
      context:{kind:'entity',label:'Harbour',world:{id:f.world,name:'Browser Test World'},references:[],truncated:[]},request:{synthetic:true}}});
  });
  await visit(page,`/entities/${f.entity}`);
  const launcher=page.getByRole('button',{name:'Open AI assistant'});
  await launcher.focus();await page.keyboard.press('Enter');
  const panel=page.getByRole('dialog',{name:'Worldbuilding assistant'});await expect(panel).toBeVisible();
  const message=page.getByLabel('Message the worldbuilding assistant');await expect(message).toBeEnabled();
  await message.fill('When can ships enter?');await page.keyboard.press('Enter');
  const conversation=page.getByLabel('Assistant conversation');
  await expect(conversation.getByText(/<img src=x onerror=/)).toBeVisible();
  await expect(conversation.locator('strong',{hasText:'Daylight only.'})).toBeVisible();
  expect(await conversation.locator('img,script').count()).toBe(0);
  expect(await page.evaluate(()=>window.__aiInjected)).toBeUndefined();
  await evidence(page,info,'ai-html-as-text');
  mode='limit';await message.fill('One more question');await page.getByRole('button',{name:'Send message to Gemini'}).click();
  await expect(panel.getByRole('alert')).toContainText('request limit');await expect(message).toHaveValue('One more question');
  await evidence(page,info,'ai-limit');
  await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Open AI assistant'})).toBeVisible();
});

test('A11Y01 accessibility scan of the main pages (observational, WCAG 2.1 AA rules)',async({page},info)=>{
  test.setTimeout(120000);
  const f=fixture();await login(page);
  const proposal=(await api(page,'POST',`/api/worlds/${f.world}/proposals`,{action:'create',content:{...f.content,name:'Accessibility Draft'}})).proposal;
  const pages=[['Home','/home'],['World','/worlds/'+f.world],['Workspace',`/worlds/${f.world}/workspace`],['Entity','/entities/'+f.entity],
    ['History',`/entities/${f.entity}/history`],['Proposal editor','/proposals/'+proposal.id],['Search','/search?q=Harbour'],['Profile','/profile']];
  const results=[];
  for(const [name,url] of pages){await visit(page,url);results.push({name,url,signedIn:true,violations:(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations});}
  await page.context().clearCookies();
  for(const [name,url] of [['Sign in','/'],['Register','/register']]){await visit(page,url);results.push({name,url,signedIn:false,violations:(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations});}
  const summary=results.map(r=>({page:r.name,url:r.url,violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,help:v.help,targets:v.nodes.map(n=>({target:n.target.join(' '),detail:n.any[0]?.message??n.failureSummary}))}))}));
  fs.writeFileSync(path.join(__dirname,'../evidence/accessibility-full-scan.json'),JSON.stringify({scanned:new Date().toISOString(),tool:'axe-core 4.10.2 via @axe-core/playwright',tags:['wcag2a','wcag2aa','wcag21aa'],viewport:'1440x1000',pages:summary},null,2));
  await info.attach('accessibility-full-scan',{body:JSON.stringify(summary,null,2),contentType:'application/json'});
  expect(results).toHaveLength(10);
  // Automated rules cover part of WCAG only. Serious and critical findings fail the check.
  const blocking=summary.flatMap(p=>p.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>`${p.page}: ${v.id} (${v.nodes})`));
  expect(blocking).toEqual([]);
});
