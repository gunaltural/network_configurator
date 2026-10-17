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
 // Native interconnect/control drawings must select every represented physical link.
 for(const selector of ['.vpc-peer-line[data-lab-links]','.vpc-ka-line[data-lab-links]']){
  await run('baseline');const line=page.locator('#labMap '+selector).first();
  if(!await line.count())continue;
  const ids=JSON.parse(await line.getAttribute('data-lab-links'));if(!ids.length)continue;
  await page.locator('#wbCloseInspector').click();await line.click({force:true});
  assert.deepEqual(await page.locator('#syntheticLink').evaluate(el=>[...el.selectedOptions].map(o=>o.value)),ids,vendor+' native bundle click selects represented members');
  await page.locator('#pairFail').click();const failed=await record();
  assert.equal(await page.locator('#labMap '+selector).first().getAttribute('data-visual-link-state'),'down',vendor+' selected native line visibly down');
  assert.ok(failed.failedLinks.length>=ids.length,vendor+' applied bundle fault recorded');
  assert.match(failed.topologySvg,/data-visual-link-state="down"/,vendor+' saved topology retains fault');
  await page.locator('#pairRestore').click();assert.notEqual(await page.locator('#labMap '+selector).first().getAttribute('data-visual-link-state'),'down');
 }
 if(vendor==='Cisco NX-OS'){
  await run('member');const partial=JSON.parse(await page.locator('#labEvidence').textContent());
  assert.equal(partial.vpc.peerLinkUp,true,'One physical member loss keeps port-channel up');
  assert.equal(await page.locator('#labMap [data-device-state="protected"]').count(),0,'Partial peer-link loss does not suspend secondary');
  assert.equal(await page.locator('#labMap .vpc-peer-line[data-visual-link-state="down"]').count(),1,'Only the failed physical member is red');
 }
 await run('upper-1');let s=await record();assert.ok(s.currentPath.includes(peerNames[1]),vendor+' peer failure must retain service via surviving peer');assert.ok(!s.currentPath.includes(peerNames[0]));assert.equal(s.modelStatus,'degraded');
 await run('peer');s=await record();assert.ok(await page.locator('#labMap .vpc-peer-line[data-visual-link-state=\"down\"]').count()>0,vendor+' interconnect scenario changes native topology');
 if(vendor==='Cisco NX-OS'){assert.match(await page.locator('#pairState').innerText(),/SECONDARY/);assert.ok(s.findings.some(f=>f.includes('suspends')));assert.ok(!s.currentPath.includes(peerNames[1]));await page.locator('#wbInspectorBody').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/tmp/cisco-vpc-peer-link-down.png'});}
 if(vendor==='Cisco IOS-XE'){assert.match(await page.locator('#pairState').innerText(),/RECOVERY/);assert.ok(s.currentPath.includes(peerNames[1]));assert.ok(!s.currentPath.includes(peerNames[0]));}
 if(vendor==='Arista EOS'){assert.equal(s.modelStatus,'dual-active-risk');assert.ok(s.findings.some(f=>f.includes('no independent heartbeat')));}
 await run('detect-peer');s=await record();if(vendor!=='Arista EOS')assert.equal(s.modelStatus,vendor==='Cisco NX-OS'?'split-brain':'dual-active-risk');assert.ok(s.failureSequence.length>=2);
 if(vendor==='Cisco NX-OS'){
  await run('baseline');const domain=page.locator('#syntheticLinkChoices>.pair-choice input');await domain.nth(0).check();await domain.nth(1).check();await page.locator('#pairFail').click();s=await record();
  assert.equal(s.modelStatus,'split-brain');assert.deepEqual(Object.values(s.roleStates),['PRIMARY (dual-active)','PRIMARY (dual-active)']);assert.equal(s.failureSequence.length,1);assert.ok(s.findings.some(f=>f.includes('simultaneously')));assert.match(await page.locator('#syntheticStatus').innerText(),/SPLIT-BRAIN/);assert.match(await page.locator('#pairState').innerText(),/SPLIT-BRAIN/);assert.match(await page.locator('#workspaceScope').innerText(),/SPLIT-BRAIN/);assert.equal(await page.locator('#workspaceScope').getAttribute('data-severity'),'critical');assert.equal(await page.locator('#labMap .synthetic-flow').count(),0);assert.equal(await page.locator('#labMap [data-device-state="independent-active"]').count(),2);assert.equal(await page.locator('#labMap [data-visual-link-state="unverified"]').count(),design.report.links.length);assert.match(s.topologySvg,/SPLIT-BRAIN/);assert.match(s.topologySvg,/independent-active/);
  await page.locator('#wbInspectorBody').evaluate(el=>el.scrollTop=0);await page.locator('#wbCloseInspector').click();await page.locator('#wbFit').click();await page.screenshot({path:'/tmp/cisco-vpc-split-brain.png'});await page.locator('#wbFailures').click();
  await run('simultaneous');s=await record();assert.equal(s.modelStatus,'split-brain');assert.equal(s.failureSequence.length,1);
  await run('peer-detect');s=await record();assert.ok(s.roleStates[peerNames[1]].includes('SECONDARY'));await page.locator('#pairRecovery').click();s=await record();assert.equal(s.modelStatus,'split-brain');
 }
 // Each catalogue case must produce the platform's expected roles and forwarding.
 for(const id of ['simultaneous','peer-detect','repair-detection','repair-peer','repair-both','access-upper-1','access-upper-2','access-device-upper-1','access-device-upper-2','leaf-device','peer-return','pair-restart','protected-survivor-fails']){
  await run(id);s=await record();
  if(id==='protected-survivor-fails'){if(vendor==='Arista EOS')assert.equal(s.modelStatus,'degraded');else assert.equal(s.modelStatus,'no-path');if(vendor==='Cisco NX-OS'){await page.locator('#pairRecovery').click();assert.equal((await record()).modelStatus,'degraded');}if(vendor==='Cisco IOS-XE'||vendor==='Huawei iStack')assert.equal(await page.locator('#pairRecovery').isDisabled(),true);}
  if(id==='simultaneous'){assert.equal(await page.locator('#labMap [data-device-state="independent-active"]').count(),2);assert.equal(await page.locator('#labMap .synthetic-flow').count(),0);}
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
 await run('baseline');assert.equal(await page.locator('#labMap [data-device-state="independent-active"]').count(),0);await run('both');s=await record();assert.equal(s.modelStatus,'no-path');assert.equal(await page.locator('#labMap [data-device-state="down"]').count(),2);assert.match(s.topologySvg,/DEVICE DOWN/);
 await run('primary-return');s=await record();assert.ok(s.roleStates);if(vendor==='Cisco NX-OS'){assert.match(s.roleStates[peerNames[1]],/PRIMARY/);assert.ok(await page.locator('#pairRecovery').isVisible());await page.locator('#pairRecovery').click();}
 await run('baseline');const component=page.locator('#syntheticLinkChoices>.pair-choice input').first();await component.check();await page.locator('#pairFail').click();await page.locator('#pairRestore').click();assert.equal(await component.isChecked(),false);
 // Every documented scenario carries its state, failed nodes and protection onto the topology.
 const catalogue=await page.locator('#pairScenario option').evaluateAll(options=>options.map(o=>o.value));
 for(const id of catalogue){await run(id);const evidence=await page.locator('#labEvidence').textContent().then(JSON.parse);assert.equal(await page.locator('#labMap [data-topology-state]').count(),1);assert.equal(await page.locator('#labMap [data-visual-link-state="down"].synthetic-flow,#labMap [data-visual-link-state="blocked"].synthetic-flow,#labMap [data-visual-link-state="unverified"].synthetic-flow').count(),0,vendor+' '+id+' unavailable members never animate as forwarding');assert.equal(await page.locator('#labMap [data-device-state="down"]').count(),evidence.failures.devices.length,vendor+' '+id+' failed device marks');if(id==='type1'){assert.match(await page.locator('#labMap [data-topology-state]').textContent(),/PROTECTION ACTIVE/);assert.equal(await page.locator('#labMap [data-device-state="protected"]').count(),1);}
 if(evidence.vpc.suspended&&!evidence.failures.devices.includes(evidence.vpc.suspended))assert.ok(await page.locator('#labMap [data-device-state="protected"]').count()>=1,vendor+' '+id+' protective blocking');if(evidence.vpc.dualActive)assert.equal(await page.locator('#labMap .synthetic-flow').count(),0,vendor+' '+id+' no healthy animation in an unsynchronized domain');}
 console.log('PASS full visual catalogue',vendor,catalogue.length+' scenarios');
 await run('baseline');await page.locator('#syntheticRecord').click();await page.evaluate(()=>document.getElementById('simulationWord').onclick());assert.equal(await page.locator('#simulationExportStatus').textContent(),'Word report downloaded.');
 console.log('PASS protocol behavior and UI',vendor);
}
assert.deepEqual(errors,[]);console.log('All five vendor-specific browser scenario, role, recovery, partial restore and Word action tests passed.');
}finally{await browser.close();}
