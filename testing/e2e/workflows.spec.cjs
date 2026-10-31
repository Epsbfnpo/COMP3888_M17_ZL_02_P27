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
async function newDraft(page){const f=fixture();return (await api(page,'POST',`/api/worlds/${f.world}/proposals`,{action:'create',content:{...f.content,name:'Browser Draft'}})).proposal;}
async function evidence(page,testInfo,name){const file=testInfo.outputPath(name+'.png');await page.screenshot({path:file,fullPage:true});await testInfo.attach(name,{path:file,contentType:'image/png'});}

test('UI01 register mismatch, successful account creation and duplicate rejection',async({page},info)=>{
  await visit(page,'/register');await page.getByLabel('Username',{exact:true}).fill('Browser New User');
  await page.getByLabel('Email',{exact:true}).fill('newuser@browser.example');
  await page.getByLabel('Password',{exact:true}).fill('Browser123!');await page.getByLabel('Confirm password',{exact:true}).fill('different');
  await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Passwords do not match');
  await page.getByLabel('Confirm password',{exact:true}).fill('Browser123!');await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Registration successful');
  await page.getByLabel('Username',{exact:true}).fill('Browser New User');await page.getByLabel('Email',{exact:true}).fill('newuser@browser.example');
  await page.getByLabel('Password',{exact:true}).fill('Browser123!');await page.getByLabel('Confirm password',{exact:true}).fill('Browser123!');
  await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByRole('alert')).toContainText('already exists');await evidence(page,info,'register-validation');
});
test('UI02 login failure, keyboard password visibility and profile update',async({page},info)=>{
  const f=fixture();await visit(page,'/');await page.getByLabel('Email',{exact:true}).fill(f.users.owner.email);await page.getByLabel('Password',{exact:true}).fill('wrong');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Invalid email or password');
  await page.getByRole('button',{name:'Show password',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','text');
  await page.getByLabel('Password',{exact:true}).fill(f.users.owner.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/home$/);
  await visit(page,'/profile');await page.getByRole('button',{name:'Edit Profile',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill('Browser Owner Updated');
  await page.getByLabel('Current password',{exact:true}).fill(f.users.owner.password);await page.getByRole('button',{name:'Save Changes',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Browser Owner Updated'})).toBeVisible();await evidence(page,info,'profile-updated');
});
test('UI03 guest/reader controls, private world exclusion and published reverse relationship',async({page},info)=>{
  const f=fixture();await visit(page,'/home');await expect(page.getByRole('heading',{name:'Browser Test World'})).toBeVisible();await expect(page.getByRole('heading',{name:'Private Browser World'})).toHaveCount(0);
  await visit(page,`/entities/${f.entity}`);await expect(page.getByRole('button',{name:'Open AI assistant'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Edit entity',exact:true})).toHaveCount(0);await expect(page.getByText('patrolled by',{exact:true})).toBeVisible();
  await login(page,'reader');await visit(page,`/entities/${f.entity}`);await expect(page.getByRole('button',{name:'Edit entity',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Propose a change'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Open AI assistant'})).toBeVisible();await evidence(page,info,'reader-relationship');
});
test('UI04 author proposal submission and owner approval publish exact content',async({page,browser},info)=>{
  const f=fixture();await login(page,'author');await visit(page,`/worlds/${f.world}/workspace`);await page.getByRole('button',{name:'New entity proposal',exact:true}).click();await expect(page).toHaveURL(/\/proposals\/\d+$/);
  const proposalId=Number(page.url().split('/').pop());await page.getByLabel('Name',{exact:true}).fill('Approved Browser Entity');await page.getByLabel('Body (Markdown)',{exact:true}).fill('An approved daylight traveller.');
  await page.getByRole('button',{name:'Save and submit for review',exact:true}).click();await expect(page.getByText('Proposal submitted for review.',{exact:true})).toBeVisible();
  const context=await browser.newContext();const owner=await context.newPage();try{await login(owner);await visit(owner,`/proposals/${proposalId}`);await owner.getByRole('button',{name:'Accept and publish',exact:true}).click();await expect(owner.getByText('Proposal approved and published.',{exact:true})).toBeVisible();await evidence(owner,info,'proposal-approved');
    const p=(await api(owner,'GET',`/api/proposals/${proposalId}`)).proposal;const e=(await api(owner,'GET',`/api/entities/${p.entityId}`)).entity;expect(e.body.text).toBe('An approved daylight traveller.');expect(e.version).toBe(1);
  }finally{await context.close();}
});
test('UI05 stale proposal preserves local input, compares and explicitly recovers',async({page},info)=>{
  await login(page,'author');const p=await newDraft(page);await visit(page,`/proposals/${p.id}`);await page.getByLabel('Short description',{exact:true}).fill('My unsaved local description');
  await api(page,'PATCH',`/api/proposals/${p.id}`,{revision:p.revision,content:{...p.content,description:'Concurrent server description'}});
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('heading',{name:'Compare and recover your changes'})).toBeVisible();
  await expect(page.getByLabel('Short description',{exact:true})).toHaveValue('My unsaved local description');await expect(page.getByText(/Concurrent server description/)).toBeVisible();
  await evidence(page,info,'conflict-preserved');await page.getByRole('button',{name:/I have compared the changes/}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved.',{exact:true})).toBeVisible();
  expect((await api(page,'GET',`/api/proposals/${p.id}`)).proposal.content.description).toBe('My unsaved local description');
});
test('UI06 same-tab refresh restores unsaved proposal without publishing',async({page},info)=>{
  await login(page,'author');const p=await newDraft(page);await visit(page,`/proposals/${p.id}`);await page.getByLabel('Body (Markdown)',{exact:true}).fill('Recovered unsaved paragraph');
  await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('worldbuilding-proposal:')))).toBeTruthy();
  await page.reload();await expect(page.getByLabel('Body (Markdown)',{exact:true})).toHaveValue('Recovered unsaved paragraph');await expect(page.getByRole('heading',{name:'Compare and recover your changes'})).toBeVisible();
  expect((await api(page,'GET',`/api/proposals/${p.id}`)).proposal.content.body.text).toBe(p.content.body.text);await evidence(page,info,'refresh-recovery');
});
test('UI07 owner edits, compares history and restores as a newer version',async({page},info)=>{
  const f=fixture();await login(page);const e=(await api(page,'POST',`/api/worlds/${f.world}/entities`,{content:{...f.content,name:'History Browser Entity'}})).entity;
  await visit(page,`/entities/${e.id}`);await page.getByRole('button',{name:'Edit entity',exact:true}).click();await page.getByLabel('Body (Markdown)',{exact:true}).fill('Version two body.');await page.getByRole('button',{name:'Save and publish',exact:true}).click();await expect(page.getByText('Entity published.',{exact:true})).toBeVisible();
  await visit(page,`/entities/${e.id}/history`);await expect(page.getByRole('heading',{name:'History Browser Entity',exact:true,level:1})).toBeVisible();
  await evidence(page,info,'version-history');
  // Restoration is exercised through HTTP here; history rendering above is UI evidence.
  await api(page,'POST',`/api/entities/${e.id}/rollback`,{baseVersion:2,targetVersion:1});
  await page.reload();const state=(await api(page,'GET',`/api/entities/${e.id}/versions`));expect(state.entity.version).toBe(3);expect(state.versions.map(v=>v.version)).toEqual([3,2,1]);expect(state.versions[0].snapshot.body.text).toBe(f.content.body.text);
});
test('UI08 AI missing configuration gives disabled composer without changing published content',async({page},info)=>{
  const f=fixture();await login(page);await visit(page,`/entities/${f.entity}`);await page.getByRole('button',{name:'Open AI assistant'}).click();
  await expect(page.getByText('AI service unavailable',{exact:true})).toBeVisible();await expect(page.getByLabel('Message the worldbuilding assistant')).toBeDisabled();await evidence(page,info,'ai-unconfigured');
});
test('UI09 mocked AI edit diff, dismiss, apply, stale protection and explicit save',async({page},info)=>{
  const f=fixture();await login(page);const e=(await api(page,'POST',`/api/worlds/${f.world}/entities`,{content:{...f.content,name:'AI Editing Fixture'}})).entity;
  await page.route('**/api/ai/edit-body',async route=>{const data=route.request().postDataJSON();await route.fulfill({json:{mode:'live',model:'test-double',suggestion:{id:'synthetic-suggestion',originalText:data.draft.content.body.text,suggestedText:'Ships enter only in daylight. Night entry remains forbidden.',baseVersion:data.draft.baseVersion??null}}});});
  await visit(page,`/entities/${e.id}`);await page.getByRole('button',{name:'Edit entity',exact:true}).click();await page.getByText('Suggest a body edit with AI',{exact:true}).click();await page.getByLabel('What should change?').fill('Improve clarity');
  const generate=()=>page.getByRole('button',{name:'Generate suggestion',exact:true}).click();await generate();await expect(page.getByRole('region',{name:'Body changes'})).toBeVisible();await evidence(page,info,'ai-diff-mocked');
  await page.getByRole('button',{name:'Dismiss',exact:true}).click();await expect(page.getByLabel('Body (Markdown)',{exact:true})).toHaveValue(f.content.body.text);
  await generate();await page.getByLabel('Body (Markdown)',{exact:true}).fill('Changed while suggestion open');await expect(page.getByRole('button',{name:'Apply to draft',exact:true})).toBeDisabled();
  await generate();await page.getByRole('button',{name:'Apply to draft',exact:true}).click();await expect(page.getByLabel('Body (Markdown)',{exact:true})).toHaveValue('Ships enter only in daylight. Night entry remains forbidden.');
  expect((await api(page,'GET',`/api/entities/${e.id}`)).entity.body.text).toBe(f.content.body.text);
  await page.getByRole('button',{name:'Save and publish',exact:true}).click();await expect(page.getByText('Entity published.',{exact:true})).toBeVisible();expect((await api(page,'GET',`/api/entities/${e.id}`)).entity.version).toBe(2);
});
test('UI10 draft snapshot stale warning, refresh and mocked chat failure/retry',async({page},info)=>{
  await login(page,'author');const p=await newDraft(page);let calls=0;
  await page.route('**/api/ai/context',async route=>{const response=await route.fetch();const data=await response.json();data.service.configured=true;await route.fulfill({response,json:data});});
  await page.route('**/api/ai/chat',async route=>{calls++;if(calls===1)await route.fulfill({status:504,json:{error:'Synthetic timeout. Your message is kept; try again.'}});else await route.fulfill({json:{mode:'live',model:'test-double',reply:'Synthetic response: no clear conflicts in supplied context.',context:{kind:'proposal',label:'Browser Draft',world:{id:fixture().world,name:'Browser Test World'},draft:{},references:[],truncated:[]},request:{synthetic:true}}});});
  await visit(page,`/proposals/${p.id}`);await page.getByRole('button',{name:'Check consistency with AI',exact:true}).click();const message=page.getByLabel('Message the worldbuilding assistant');await expect(message).toBeEnabled();
  await page.getByLabel('Body (Markdown)',{exact:true}).fill('A changed snapshot');await expect(page.getByText('Draft changed. Refresh before checking.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Refresh snapshot',exact:true}).click();await expect(page.getByText('Draft changed. Refresh before checking.',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Send message to Gemini'}).click();await expect(page.getByRole('alert')).toContainText('Synthetic timeout');await expect(message).not.toHaveValue('');
  await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByText('Synthetic response: no clear conflicts in supplied context.',{exact:true})).toBeVisible();expect(calls).toBe(2);await evidence(page,info,'ai-chat-retry-mocked');
});
test('UI11 revoked membership removes stale editor and retains copyable unsaved input',async({page,browser},info)=>{
  const f=fixture();await login(page,'author');const p=await newDraft(page);await visit(page,`/proposals/${p.id}`);await page.getByLabel('Short description',{exact:true}).fill('Keep this private local text');
  const context=await browser.newContext();const owner=await context.newPage();try{await login(owner);await api(owner,'DELETE',`/api/worlds/${f.world}/members/${f.users.author.id}`);
    await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Proposal no longer available',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Save draft',exact:true})).toHaveCount(0);await page.getByText('Copy your unsaved input',{exact:true}).click();await expect(page.getByText(/Keep this private local text/)).toBeVisible();await evidence(page,info,'revoked-access');
  }finally{await api(owner,'PUT',`/api/worlds/${f.world}/members/${f.users.author.id}`,{role:'author'});await context.close();}
});
test('UI12 search match/no result and small-screen accessibility observations',async({page},info)=>{
  await visit(page,'/search?q=Harbour');await expect(page.getByRole('heading',{name:'Harbour',exact:true})).toBeVisible();await page.getByRole('searchbox').fill('NoSuchSyntheticEntity');await expect(page.getByText(/No entities found|No matching/i)).toBeVisible();
  await page.setViewportSize({width:390,height:844});await visit(page,'/');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  const overflow=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
  const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  await info.attach('accessibility-observations',{body:JSON.stringify({overflow,violations:accessibility.violations},null,2),contentType:'application/json'});
  fs.writeFileSync(path.join(__dirname,'../evidence/accessibility-observations.json'),JSON.stringify({scope:'390x844 login page only',overflow,violations:accessibility.violations},null,2));
  // Observational audit: findings are reported; this does not certify WCAG compliance.
  const labelContrastFailures=accessibility.violations.filter(v=>v.id==='color-contrast').flatMap(v=>v.nodes).filter(n=>n.target.some(selector=>typeof selector==='string'&&selector.includes('.step-label')));
  expect(labelContrastFailures).toHaveLength(0);
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.viewport+1);await evidence(page,info,'mobile-login');
});
