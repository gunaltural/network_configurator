import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const base=process.env.SMOKE_URL||'http://127.0.0.1:8125';
const errors=[];
page.on('dialog',dialog=>dialog.accept()); // Tests intentionally replace the previously built scratch network.
page.on('pageerror',error=>errors.push(error.message));
try{
 const response=await page.goto(base+'/ai-topology');
 assert.equal(response.status(),200);
 await page.locator('#chooseBuild').click();
 await page.locator('#aiNodeCount').fill('7');
 await page.locator('#aiTopologyPattern').selectOption('ring');
 await page.locator('#aiDefaultVendor').selectOption('Arista EOS');
 await page.locator('#aiDefaultRole').fill('fabric-node');
 await page.locator('#aiBuildTopology').click();
 assert.match(await page.locator('#overview').innerText(),/7 devices · 7 links · 0 configurations/);
 assert.ok((await page.locator('#devicesList').innerText()).includes('Arista EOS'));
 await page.locator('#assessStructure').click();
 assert.match(await page.locator('#structuralResult').innerText(),/Potential single-path links: none/);
 await page.locator('#legacyTemplates summary').click();
 await page.locator('#template').selectOption('vpc');
 await page.locator('#applyTemplate').click();
 assert.match(await page.locator('#overview').innerText(),/2 devices · 2 links/);
 await page.locator('#deviceId').fill('fw-1');
 await page.locator('#hostname').fill('FW-1');
 await page.locator('#vendor').fill('FortiGate');
 await page.locator('#role').fill('edge');
 await page.locator('#saveDevice').click();
 assert.match(await page.locator('#overview').innerText(),/3 devices/);
 await page.locator('#connectionEditor summary').click();
 await page.locator('#linkId').fill('fw-uplink');
 await page.locator('#linkKind').fill('Ethernet');
 await page.locator('#linkA').selectOption('n9k-a');
 await page.locator('#linkB').selectOption('fw-1');
 await page.locator('#saveLink').click();
 assert.match(await page.locator('#overview').innerText(),/3 links/);
 await page.locator('#configDevice').selectOption('fw-1');
 await page.locator('#configuration').fill('hostname FW-1\nsnmp-server community dont-send-me RO\nset community 65000:1 additive');
 await page.locator('#saveConfig').click();
 await page.setViewportSize({width:390,height:844});
 const mobileLayout=await page.evaluate(()=>({
  width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,
  offenders:[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&(el.getBoundingClientRect().right>window.innerWidth+2||el.scrollWidth>el.clientWidth+3&&getComputedStyle(el).overflowX==='visible')).slice(0,12).map(el=>({tag:el.tagName,id:el.id,cls:String(el.className).slice(0,55),right:Math.round(el.getBoundingClientRect().right),scroll:el.scrollWidth,client:el.clientWidth,overflow:getComputedStyle(el).overflowX})),
  focus:document.activeElement?.id,
  bodyScroll:document.body.scrollWidth,mainScroll:document.querySelector('main')?.scrollWidth
 }));
 assert.equal(mobileLayout.scrollWidth<=mobileLayout.width+2,true,'AI Analysis mobile editor must not overflow viewport: '+JSON.stringify(mobileLayout));
 await page.setViewportSize({width:1280,height:900});
 await page.locator('#preview').click();
 const review=await page.locator('#evidencePreview').innerText();
 assert.ok(review.includes('65000:1 additive'),'Routing community survives client redaction');
 assert.ok(!review.includes('dont-send-me'),'Credentials are not present in review payload');
 assert.equal(await page.locator('#analyze').isDisabled(),false);
 // Dynamic Design-style topology and scoped device selection must work in a real browser.
 await page.locator('#buildTechnology').selectOption('BGP');
 await page.locator('#buildVendor').selectOption('Cisco');
 await page.locator('#buildPlatform').selectOption('Cisco IOS-XE');
 await page.locator('#buildPrimaryCount').fill('3');
 await page.locator('#buildSecondaryCount').fill('2');
 await page.locator('#applyTechnologyTemplate').click();
 assert.match(await page.locator('#overview').innerText(),/5 devices · 6 links/);
 assert.equal(await page.locator('#topologyCanvas rect.node').count(),5,'Design-style device cards created');
 assert.equal(await page.locator('#deviceAnalysisChoices input:checked').count(),5,'all devices available for scoped analysis');
 await page.locator('#deviceAnalysisChoices input').nth(1).uncheck();
 assert.equal(await page.locator('#deviceAnalysisChoices input:checked').count(),4,'per-device scope can be narrowed');
 await page.locator('#deviceAnalysisChoices input').nth(1).check();

 assert.ok(!errors.length,'No browser JS errors: '+errors.join(','));

 // Real application-to-AI bridge: consume the existing current Design report,
 // not an artificial topology or prewritten simulator answer.
 const designPage=await browser.newPage({viewport:{width:1280,height:900}});
 try{
  await designPage.goto(base+'/?workspace=VPC',{waitUntil:'domcontentloaded'});
  const openReview=designPage.locator('#sendDesignToAI');
  await openReview.waitFor({timeout:18000});
  await designPage.waitForFunction(()=>window.__designWorkspaceOpened===true,{timeout:15000});
  await designPage.waitForFunction(()=>!!window.NetworkWorkspaceProject?.diagnosticDesign, {timeout:10000});
  await openReview.click();
  await designPage.waitForURL('**/ai-topology',{timeout:15000});
  await designPage.waitForLoadState('domcontentloaded');
  await designPage.waitForFunction(()=>document.getElementById('overview')?.textContent.includes('devices'),null,{timeout:15000});
  const importStatus=await designPage.locator('#status').innerText();
  const summary=await designPage.locator('#designReviewSummary').innerText();
  console.log('AI_REAL_DESIGN_IMPORT '+JSON.stringify({status:importStatus,summary,overview:await designPage.locator('#overview').innerText()}));
  assert.match(summary,/configuration proposals/,'Import actual generated configurations');
  assert.match(summary,/engineering parameters/,'Import selected Design parameters');
  assert.match(summary,/original input checks/,'Import existing Design Checks');
  assert.ok(!(await designPage.locator('#designReviewPanel').isHidden()),'Original checks shown separately from AI output');
  await designPage.locator('#preview').click();
  const evidence=await designPage.locator('#evidencePreview').innerText();
  assert.ok(evidence.includes('Command: proposed configuration'),'Generated configs clearly labeled as proposals');
  assert.ok(evidence.includes('Command: deterministic input checks'),'Deterministic controls are reused, not copied as AI findings');
  assert.ok(evidence.includes('Command: parameter choices'),'Design parameters feed AI review');
 }finally{await designPage.close();}

 // Regression: entering AI V0.1 from the actual BGP project MUST transfer
 // the current topology instead of silently opening a blank editor.
 const guidedPage=await browser.newPage({viewport:{width:1280,height:900}});
 try{
  await guidedPage.goto(base+'/',{waitUntil:'domcontentloaded'});
  await guidedPage.locator('#guidedNewProject').click();
  await guidedPage.locator('#guidedName').fill('BGP8888');
  await guidedPage.locator('#guidedModules input[value=BGP]').check();
  await guidedPage.locator('#guidedCreate').click();
  await guidedPage.waitForFunction(()=>window.ProjectWorkflow?.state()?.name==='BGP8888');
  const source=await guidedPage.evaluate(()=>{
   const report=window.NetworkWorkspaceProject.diagnosticDesign();
   return {count:report.devices.length,links:(report.links||[]).length+(report.specialLinks||[]).filter(l=>l.enabled!==false).length};
  });
  assert.ok(source.count>0,'Current BGP Design has devices before the handoff');
  await guidedPage.locator('#guidedAIAnalysis').click();
  await guidedPage.waitForURL('**/ai-topology',{timeout:15000});
  await guidedPage.waitForFunction(()=>document.getElementById('sourceLabel')?.textContent.includes('BGP8888'),null,{timeout:10000});
  const imported=await guidedPage.evaluate(()=>({label:document.getElementById('sourceLabel').textContent,overview:document.getElementById('overview').textContent,status:document.getElementById('status').textContent}));
  assert.match(imported.label,/BGP8888.*BGP/,'Source project identity remains visible');
  assert.ok(imported.overview.includes(source.count+' devices'),'Exact existing BGP device count imported, not demo template');
  assert.ok(imported.overview.includes(source.links+' links'),'Existing BGP link count imported');
  assert.match(imported.status,/Design aktarıldı/,'Import is unambiguously acknowledged');
 }finally{await guidedPage.close();}
 console.log('AI topology Chromium: templates, mixed-vendor edits, link, configuration, reviewed evidence and routes passed.');
}finally{await browser.close();}
