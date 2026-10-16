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
 await run('detect-peer');s=await record();if(vendor!=='Arista EOS')assert.equal(s.modelStatus,'dual-active-risk');assert.ok(s.failureSequence.length>=2);
 await run('baseline');await run('both');s=await record();assert.equal(s.modelStatus,'no-path');
 await run('primary-return');s=await record();assert.ok(s.roleStates);if(vendor==='Cisco NX-OS'){assert.match(s.roleStates[peerNames[1]],/PRIMARY/);assert.ok(await page.locator('#pairRecovery').isVisible());await page.locator('#pairRecovery').click();}
 await run('baseline');const component=page.locator('#syntheticLinkChoices>.pair-choice input').first();await component.check();await page.locator('#pairFail').click();await page.locator('#pairRestore').click();assert.equal(await component.isChecked(),false);
 await run('baseline');await page.locator('#syntheticRecord').click();await page.evaluate(()=>document.getElementById('simulationWord').onclick());assert.equal(await page.locator('#simulationExportStatus').textContent(),'Word report downloaded.');
 console.log('PASS protocol behavior and UI',vendor);
}
assert.deepEqual(errors,[]);console.log('All five vendor-specific browser scenario, role, recovery, partial restore and Word action tests passed.');
}finally{await browser.close();}
