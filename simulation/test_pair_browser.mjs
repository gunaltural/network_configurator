import {createRequire} from 'node:module';import assert from 'node:assert/strict';const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:1500,height:1050}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const base=process.env.SMOKE_URL||'http://127.0.0.1:8125';
async function run(id){await page.locator('#pairScenario').selectOption(id);await page.locator('#pairRunScenario').click();}
async function record(){await page.locator('#syntheticRecord').click();return page.evaluate(()=>window.NetworkLab.scenarioRecords().at(-1));}
try{
for(const vendor of ['Cisco NX-OS','Arista EOS','Huawei_CE_SW','Cisco IOS-XE','Huawei iStack']){
 await page.goto(base+'/');await page.locator('#v3TechGrid button').filter({has:page.locator('h3',{hasText:'vPC / MLAG'})}).click();await page.locator('#platform').selectOption(vendor);await page.waitForTimeout(100);
 const design=await page.evaluate(()=>window.NetworkWorkspaceProject.prepareWorkspaceSimulation());const peerNames=design.report.devices.filter(n=>n.tier==='upper').slice(0,2).map(n=>n.hostname);
 await page.locator('#topologySimulation button').click();await page.waitForURL('**/network-lab?workspace=1');await page.locator('#wbFailures').click();
 assert.equal(await page.locator('#wbPolicies').isVisible(),false,'No empty generic parameters panel');
 assert.equal(await page.locator('.pair-choice:visible').count(),4,'Four key domain components at the front, not leaf list');
 await run('upper-1');let s=await record();assert.ok(s.currentPath.includes(peerNames[1]),vendor+' peer failure must retain service via surviving peer');assert.ok(!s.currentPath.includes(peerNames[0]));assert.equal(s.modelStatus,'degraded');
 await run('peer');s=await record();
 if(vendor==='Cisco NX-OS'){assert.match(await page.locator('#pairState').innerText(),/SECONDARY/);assert.ok(s.findings.some(f=>f.includes('suspends')));assert.ok(!s.currentPath.includes(peerNames[1]));await page.locator('#wbInspectorBody').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/tmp/cisco-vpc-peer-link-down.png'});}
 if(vendor==='Cisco IOS-XE'){assert.match(await page.locator('#pairState').innerText(),/RECOVERY/);assert.ok(s.currentPath.includes(peerNames[1]));assert.ok(!s.currentPath.includes(peerNames[0]));}
 if(vendor==='Arista EOS'){assert.equal(s.modelStatus,'dual-active-risk');assert.ok(s.findings.some(f=>f.includes('no independent heartbeat')));}
 await run('detect-peer');s=await record();if(vendor!=='Arista EOS')assert.equal(s.modelStatus,vendor==='Cisco NX-OS'?'split-brain':'dual-active-risk');assert.ok(s.failureSequence.length>=2);
 if(vendor==='Cisco NX-OS'){
  await run('baseline');const domain=page.locator('#syntheticLinkChoices>.pair-choice input');await domain.nth(0).check();await domain.nth(1).check();await page.locator('#pairFail').click();s=await record();
  assert.equal(s.modelStatus,'split-brain');assert.deepEqual(Object.values(s.roleStates),['PRIMARY (dual-active)','PRIMARY (dual-active)']);assert.equal(s.failureSequence.length,1);assert.ok(s.findings.some(f=>f.includes('simultaneously')));assert.match(await page.locator('#syntheticStatus').innerText(),/SPLIT-BRAIN/);assert.match(await page.locator('#pairState').innerText(),/SPLIT-BRAIN/);assert.match(await page.locator('#workspaceScope').innerText(),/SPLIT-BRAIN/);assert.equal(await page.locator('#workspaceScope').getAttribute('data-severity'),'critical');assert.equal(await page.locator('#labMap .synthetic-flow').count(),0);
  await page.locator('#wbInspectorBody').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/tmp/cisco-vpc-split-brain.png'});
  await run('simultaneous');s=await record();assert.equal(s.modelStatus,'split-brain');assert.equal(s.failureSequence.length,1);
  await run('peer-detect');s=await record();assert.ok(s.roleStates[peerNames[1]].includes('SECONDARY'));await page.locator('#pairRecovery').click();s=await record();assert.equal(s.modelStatus,'split-brain');
 }
 // Each catalogue case must produce the platform's expected roles and forwarding.
 for(const id of ['simultaneous','peer-detect','repair-detection','repair-peer','repair-both','access-upper-1','access-upper-2','access-device-upper-1','access-device-upper-2','leaf-device','peer-return','pair-restart','protected-survivor-fails']){
  await run(id);s=await record();
  if(id==='protected-survivor-fails'){if(vendor==='Arista EOS')assert.equal(s.modelStatus,'degraded');else assert.equal(s.modelStatus,'no-path');if(vendor==='Cisco NX-OS'){await page.locator('#pairRecovery').click();assert.equal((await record()).modelStatus,'degraded');}if(vendor==='Cisco IOS-XE'||vendor==='Huawei iStack')assert.equal(await page.locator('#pairRecovery').isDisabled(),true);}
  if(id==='simultaneous')assert.equal(s.modelStatus,vendor==='Cisco NX-OS'?'split-brain':'dual-active-risk');
  if(id==='peer-detect')assert.equal(s.modelStatus,vendor==='Arista EOS'?'dual-active-risk':'degraded');
  if(id==='repair-detection')assert.equal(s.modelStatus,vendor==='Arista EOS'?'dual-active-risk':'degraded');
  if(id==='repair-peer')assert.equal(s.modelStatus,vendor==='Arista EOS'?'dual-active-risk':'degraded');
  if(id==='repair-both')assert.equal(s.modelStatus,'reachable');
  if(id==='access-upper-1'){assert.ok(s.currentPath.includes(peerNames[1]));assert.ok(!s.currentPath.includes(peerNames[0]));}
  if(id==='access-upper-2'){assert.ok(s.currentPath.includes(peerNames[0]));assert.ok(!s.currentPath.includes(peerNames[1]));}
  if(id.startsWith('access-device-')||id==='leaf-device')assert.equal(s.modelStatus,'no-path');
  if(id==='peer-return'&&vendor!=='Arista EOS'){assert.ok(await page.locator('#pairRecovery').isVisible());await page.locator('#pairRecovery').click();assert.equal((await record()).modelStatus,'reachable');}
  if(id==='pair-restart'&&vendor==='Arista EOS'){assert.equal(s.modelStatus,'no-path');await page.locator('#pairRecovery').click();assert.equal((await record()).modelStatus,'reachable');}
 }
 await run('baseline');await run('both');s=await record();assert.equal(s.modelStatus,'no-path');
 await run('primary-return');s=await record();assert.ok(s.roleStates);if(vendor==='Cisco NX-OS'){assert.match(s.roleStates[peerNames[1]],/PRIMARY/);assert.ok(await page.locator('#pairRecovery').isVisible());await page.locator('#pairRecovery').click();}
 await run('baseline');const component=page.locator('#syntheticLinkChoices>.pair-choice input').first();await component.check();await page.locator('#pairFail').click();await page.locator('#pairRestore').click();assert.equal(await component.isChecked(),false);
 await run('baseline');await page.locator('#syntheticRecord').click();await page.evaluate(()=>document.getElementById('simulationWord').onclick());assert.equal(await page.locator('#simulationExportStatus').textContent(),'Word report downloaded.');
 console.log('PASS protocol behavior and UI',vendor);
}
assert.deepEqual(errors,[]);console.log('All five vendor-specific browser scenario, role, recovery, partial restore and Word action tests passed.');
}finally{await browser.close();}
