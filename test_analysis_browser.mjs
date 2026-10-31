import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
const base=process.env.SMOKE_URL||'http://127.0.0.1:8125';
try {
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let fail=true,requests=0;
  await page.route('**/api/ai/analyze',async route=>{requests++;const payload=route.request().postDataJSON();assert.equal(payload.module,'CLI_ANALYSIS');assert.equal(payload.evidence.length,1);await route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{detail:'Model unavailable'}:{text:'Browser test draft — not real model inference.'})});});
  await page.goto(base+'/analysis');
  assert.equal(await page.locator('#guide').getAttribute('open'),null);
  assert.equal(await page.locator('#evidencePanel').isVisible(),false);
  assert.equal(await page.locator('#resultPanel').isVisible(),false);
  await page.locator('#example').click();await page.locator('#parse').click();
  assert.equal(await page.locator('#evidencePanel').isVisible(),true);
  const summaries=page.locator('#blocks summary');for(let i=0;i<await summaries.count();i++)await summaries.nth(i).click({position:{x:160,y:10}});
  const checks=page.locator('[data-block]');for(let i=0;i<await checks.count();i++)await checks.nth(i).uncheck();
  assert.equal(await page.locator('#analyze').isDisabled(),true);await checks.first().check();
  await page.locator('#analyze').click();await page.waitForFunction(()=>document.getElementById('status').textContent==='Model unavailable');
  assert.equal(await page.locator('#resultPanel').isVisible(),false);fail=false;
  await page.locator('#analyze').click();await page.locator('#resultPanel').waitFor({state:'visible'});
  await page.locator('#result').fill('Reviewed test draft');assert.equal(await page.locator('#download').isEnabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal page overflow');
  assert.equal(requests,2);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Analysis Chromium: desktop/mobile, selection, error/retry, editable mocked result, no overflow passed');
}finally{await browser.close();}
