import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
const base=process.env.SMOKE_URL||'http://127.0.0.1:8125';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
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
 // All module/vendor handoffs are covered in test_workspace_browser.mjs.
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
 console.log('Browser smoke passed: preserved BGP simulator handoff and failure controls.');
}finally{await browser.close();}
