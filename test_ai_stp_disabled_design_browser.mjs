import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const base=process.env.SMOKE_URL||'http://127.0.0.1:8125';
async function scenario(disabled){
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.NetworkWorkspaceProject?.moduleReport,{timeout:15000});
  await page.evaluate(()=>window.NetworkWorkspaceProject.activateModule('STP','Cisco IOS-XE'));
  await page.waitForFunction(()=>document.getElementById('rootguard')?.checked===true,{timeout:15000});
  await page.locator('#stpLeafCount').selectOption('4');
  if(disabled){
   for(const id of ['rootguard','loopguard','udld','portfast','bpduguard'])await page.locator('#'+id).uncheck();
  }
  const actual=await page.evaluate(()=>window.NetworkWorkspaceProject.moduleReport('STP','Cisco IOS-XE'));
  const config=actual.configurations.map(c=>c.text).join('\n');
  assert.match(config,/CORE-01/);
  assert.match(config,/CORE-02/);
  assert.match(config,/ACCESS-01/);
  assert.match(config,/ACCESS-04/);
  assert.equal(actual.configurations.length,6,'Real Design generator provides two Cores and four Access devices');
  if(disabled){
   assert.doesNotMatch(config,/spanning-tree guard (?:loop|root)|udld port aggressive|spanning-tree bpduguard enable|spanning-tree portfast(?=\s|$)/im);
  }else assert.match(config,/spanning-tree guard root/);
  const expectedLinks=[...(actual.links||[]),...(actual.specialLinks||[])];
  console.log('STP_DESIGN_LINKS '+JSON.stringify(expectedLinks.slice(0,6)));
  await page.locator('#ncSidebar details[data-nc-group="design"]').evaluate(x=>{x.open=true;});
  const transfer=page.locator('#ncSidebar button').filter({hasText:'Analyze Design with AI (optional)'});
  await transfer.evaluate(x=>x.click());
  await page.waitForURL('**/ai-topology',{timeout:15000});
  await page.waitForFunction(()=>document.getElementById('workflowStep2')?.hidden===false,{timeout:15000});
  await page.locator('#wizardNext').click();
  assert.equal(await page.locator('#preview').isVisible(),false,'No old manual evidence review button');
  assert.equal(await page.locator('#evidenceDetails').isVisible(),false,'No raw internal evidence preview');
  await page.locator('#analyze').click();
  await page.waitForFunction(()=>!document.getElementById('viewSTPCTO').disabled,{timeout:15000});
  assert.equal(await page.locator('#stpCTOView').isVisible(),true,'HTML report is immediately visible after Analyze');
  assert.equal(await page.locator('#wizardNext').isVisible(),false,'No empty last-stage Continue button');
  const criteria=await page.locator('#stpCTOView details.stp-device-criteria').evaluateAll(all=>all.map(el=>({
   hostname:el.querySelector('summary')?.textContent,open:el.open,visible:el.getClientRects().length>0,
   rows:el.querySelectorAll('tr').length
  })));
  assert.equal(criteria.length,6,'Every selected device gets its own engineering criteria');
  assert.ok(criteria.every(x=>x.open&&x.visible&&x.rows>=18),
   'All six device analyses are displayed instead of five hidden accordion panels');
  assert.match(criteria[5].hostname,/ACCESS-04/);
  assert.ok(await page.locator('#stpCTOView .stp-device-criteria details:not([open])').count()>0,
   'Long CLI evidence stays collapsed within each visible device');
  if(!disabled){
   assert.equal(await page.locator('#downloadEngineeringPDF').isEnabled(),true,'PDF is available for a 6-device report');
   const pdfPromise=page.waitForEvent('download',{timeout:110000});
   await page.locator('#downloadEngineeringPDF').click();
   const pdf=await pdfPromise;
   const pdfData=await (await import('node:fs/promises')).readFile(await pdf.path());
   assert.equal(pdfData.subarray(0,4).toString(),'%PDF','Six-device PDF download has a valid header');
   assert.equal(await page.locator('#downloadEngineeringPDF').isEnabled(),true,'PDF button is reenabled for retry');
   const wordPromise=page.waitForEvent('download',{timeout:110000});
   await page.locator('#downloadEngineeringWord').click();
   const word=await wordPromise;
   const wordData=await (await import('node:fs/promises')).readFile(await word.path());
   assert.equal(wordData.subarray(0,2).toString(),'PK','Six-device Word download is a real docx');
  }
  const rows=await page.locator('.network-engineering-findings-v1 [data-finding-id]').evaluateAll(els=>els.map(x=>({id:x.dataset.findingId,status:x.dataset.findingStatus,text:x.textContent.slice(0,300)})));
  console.log((disabled?'DISABLED':'PROTECTED')+'_FINDINGS '+JSON.stringify(rows));
  assert.ok(rows.some(x=>x.id==='STP-VTP-OFF'&&x.status==='GOOD'),'VTP off is explained and positively assessed');
  if(disabled){
   assert.ok(rows.some(x=>x.id==='STP-ROOT-CONTAINMENT'&&x.status==='RISK'),'Design without Root Guard must expose mapped root-boundary risk');
   assert.ok(rows.some(x=>x.id==='STP-LOOP-RESILIENCE'&&x.status==='RISK'),'Design without Loop Guard on redundant Access uplinks must show risk');
   assert.ok(rows.some(x=>x.id==='STP-EDGE-SAFETY'&&x.status==='RISK'),'Unprotected modeled endpoint should show conditional edge-port risk');
  }else{
   assert.ok(!rows.some(x=>x.id==='STP-ROOT-CONTAINMENT'&&x.status==='RISK'),'Protected root design not a false risk');
   assert.ok(!rows.some(x=>x.id==='STP-LOOP-RESILIENCE'&&x.status==='RISK'),'Protected redundant links not a false risk');
  }
  assert.deepEqual(errors,[],'No browser JS errors');
 }finally{await page.close();}
}
try{await scenario(false);await scenario(true);console.log('Actual STP Design → AI four-stage handoff: protected/unprotected role-based engineering findings PASS');}
finally{await browser.close();}
