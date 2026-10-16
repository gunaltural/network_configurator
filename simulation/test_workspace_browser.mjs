import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:1500,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
const base=process.env.SMOKE_URL||'http://127.0.0.1:8125';
let count=0;
try{
 for(const module of ['BASIC','BGP','OSPF','STP','VPC','EVPN','QOS','SDWAN']){
  await page.goto(base+'/');await page.locator('#v3TechGrid button').filter({has:page.locator('h3',{hasText:module==='BASIC'?'System and Management':module==='VPC'?'vPC / MLAG':module})}).click();
  await page.locator('#topologySimulation button').waitFor({state:'visible'});
  const vendors=await page.locator('#platform option').evaluateAll(os=>os.filter(o=>!o.disabled&&!o.hidden).map(o=>o.value));
  for(const vendor of vendors){
   await page.locator('#platform').selectOption(vendor);await page.waitForTimeout(80);
   const data=await page.evaluate(()=>window.NetworkWorkspaceProject.prepareWorkspaceSimulation());
   assert.equal(data.report.source.module,module);assert.equal(data.report.vendor,vendor);
   if(module==='BGP')await page.goto(base+'/network-lab?workspace=1');
   else await Promise.all([page.waitForURL('**/network-lab?workspace=1'),page.locator('#topologySimulation button').click()]);
   await page.locator('#syntheticDeviceChoices input').first().waitFor({state:'attached'});
   assert.equal(await page.locator('#syntheticDeviceChoices input').count(),data.report.devices.length,module+' '+vendor+' devices');
   await page.locator('#wbFailures').click();
   const devices=page.locator('#syntheticDeviceChoices input');await devices.first().check();if(await devices.count()>1)await devices.nth(1).check();await page.locator(module==='VPC'?'#pairFail':'#syntheticNodeDown').click();
   assert.ok((await page.locator('#syntheticStatus').innerText()).includes('2 device')||await devices.count()===1);
   await page.locator(module==='VPC'?'#pairRestore':'#syntheticNodeUp').click();assert.equal(await devices.first().isChecked(),false);
   const links=page.locator('#syntheticLinkChoices input');if(await links.count()){await links.first().check();await page.locator(module==='VPC'?'#pairFail':'#syntheticLinkDown').click();await page.locator(module==='VPC'?'#pairRestore':'#syntheticLinkUp').click();assert.equal(await links.first().isChecked(),false);}
   await page.locator('#syntheticRecord').click();
   await page.locator('#wbResults').click();await page.locator('#labSendEvidence').click();
   const report=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('networkConfigurator.report.current')));assert.equal(report.source.module,module);assert.ok(report.simulationScenarios.length);
   assert.equal(await page.locator('#labMap').getAttribute('data-source'),'design');
   if(vendor===vendors[0]){
    await page.evaluate(()=>document.getElementById('simulationWord').onclick());
    assert.equal(await page.locator('#simulationExportStatus').textContent(),'Word report downloaded.',module+' actual Word action');
    const payload=await page.evaluate(async()=>({name:'Workspace simulation',language:'en',scenarios:await window.SimulationReport.prepare(window.NetworkLab.scenarioRecords())}));
    const response=await context.request.post(base+'/api/network-lab/simulation-word',{data:payload});assert.equal(response.status(),200,module+' Word export: '+await response.text().then(x=>x.slice(0,60)));assert.ok((await response.body()).byteLength>1000);
   }
   count++;console.log('PASS',module,vendor);
   if(module==='VPC'&&vendor==='Arista EOS')await page.screenshot({path:'/tmp/shared-vpc-simulation.png'});
   await page.goto(base+'/?resume=1');await page.evaluate(()=>window.__workspaceRestoreReady);await page.locator('#topologySimulation button').waitFor();
  }
 }
 assert.deepEqual(errors,[]);console.log(count+' module/vendor browser combinations passed');
}finally{await browser.close();}
