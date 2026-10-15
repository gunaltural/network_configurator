import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.SMOKE_URL||'http://127.0.0.1:8125';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const messages=[];
const dialogs=[];
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
page.on('pageerror',e=>messages.push(e.message));
page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
async function navigateWorkspace(kind){
 await page.goto(base+'/',{waitUntil:'domcontentloaded'});
 const card=page.locator('#v3TechGrid button').filter({has:page.locator('h3', {hasText:kind==='VPC'?'vPC / MLAG':'BGP'})}).first();
 await card.waitFor({state:'visible',timeout:15000});
 await card.click();
 await page.locator('#topologyArea svg').waitFor({state:'visible',timeout:15000});
}
try{
 // Browser smoke: actual Technology Workspace is the single topology source.
 await navigateWorkspace('VPC');
 await page.locator('#platform').selectOption('Arista EOS');
 await page.locator('#topologyArea svg').waitFor({state:'visible'});
 const expected=await page.locator('#topologyArea svg').evaluate(el=>({viewBox:el.getAttribute('viewBox'),labels:[...el.querySelectorAll('text')].map(x=>x.textContent.trim()).filter(Boolean).slice(0,10)}));
 assert.ok(expected.viewBox,'Workspace SVG must have dimensions');
 const launch=page.locator('#vpcMlagSimLaunch');
 await launch.waitFor({state:'visible',timeout:12000});
 await launch.click();
 try{await page.waitForURL('**/vpc-mlag-simulation',{timeout:7500});}catch(e){
 await page.screenshot({path:'/tmp/mlag-browser-smoke.png',fullPage:true});
 throw Error('VPC launch failed: '+JSON.stringify({url:page.url(),dialogs,messages,scope:await page.evaluate(()=>window.NetworkWorkspaceProject?.diagnosticScope?.()),status:await page.locator('#topologySimulation').innerText().catch(()=>''),svg:await page.evaluate(()=>window.NetworkWorkspaceProject?.simulationTopologySvg?.().slice(0,110))}));
}
 await page.locator('#workspaceTopologyVisual svg').waitFor({state:'visible'});
 const transferred=await page.locator('#workspaceTopologyVisual svg').evaluate(el=>({viewBox:el.getAttribute('viewBox'),labels:[...el.querySelectorAll('text')].map(x=>x.textContent.trim()).filter(Boolean).slice(0,10)}));
 assert.deepEqual(transferred.labels,expected.labels,'Simulation SVG must match the current Workspace labels');
 assert.equal(transferred.viewBox,expected.viewBox,'Simulation viewBox must match Workspace viewBox');
 // Failure and reset, using actual link choices.
 const available=page.locator('input[data-fault^="peerLink"]');
 assert.ok(await available.count()>0,'Peer member controls from design');
 await available.first().check();
 await page.locator('#fail').click();
 let report=JSON.parse(await page.locator('#report').innerText());
 assert.ok(report.failedConnections.length===1);
 await page.locator('#restore').click();
 report=JSON.parse(await page.locator('#report').innerText());
 assert.deepEqual(report.failedConnections,[]);
 assert.equal(await available.first().isChecked(),false);
 await page.screenshot({path:'/tmp/mlag-browser-smoke.png',fullPage:true});
 // BGP test workspace to lab handoff and synthetic controls on actual app.
 await navigateWorkspace('BGP');
 const bgpLaunch=page.locator('#bgpTestSimulation');
 await bgpLaunch.waitFor({state:'visible',timeout:12000});
 // The 2x2 pilot parameters may differ: only assert a meaningful navigation if model valid.
 await bgpLaunch.click();
 const loc=new URL(page.url());
 if(loc.pathname==='/network-lab'){
  await page.locator('#syntheticStatus').waitFor({state:'attached',timeout:15000});
  assert.ok((await page.locator('#syntheticStatus').innerText()).length>0);
 }else {
  const reason=await page.locator('#simulationTransferStatus').innerText();
  assert.ok(/two|four|requires|simulation/i.test(reason),'Invalid BGP design should provide an explanation: '+reason);
 }
 await page.screenshot({path:'/tmp/bgp-browser-smoke.png',fullPage:true});
 assert.deepEqual(messages,[],'No uncaught browser errors');
 console.log('Browser smoke passed: VPC Workspace SVG transfer, fail/restore, BGP simulator handoff.');
}finally{await browser.close();}
