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
  await page.locator('#topologySimulation button').waitFor({state:'attached'});
  if(module==='SDWAN'){await page.locator('#sdLoadExample').click();await page.waitForFunction(()=>document.getElementById('sdExcelStatus').textContent.includes('Example loaded'));}
  const vendors=await page.locator('#platform option').evaluateAll(os=>os.filter(o=>!o.disabled&&!o.hidden).map(o=>o.value));
  for(const vendor of vendors){
   await page.locator('#platform').selectOption(vendor);await page.waitForTimeout(80);
   const data=await page.evaluate(()=>window.NetworkWorkspaceProject.prepareWorkspaceSimulation());
   assert.equal(data.report.source.module,module);assert.equal(data.report.vendor,vendor);
   if(module==='BGP')await page.goto(base+'/network-lab?workspace=1');
   else await Promise.all([page.waitForURL('**/network-lab?workspace=1'),page.locator('#topologySimulation button').evaluate(button=>button.click())]);
   await page.locator('#syntheticDeviceChoices input').first().waitFor({state:'attached'});assert.equal(await page.locator('#labMap [data-topology-state]').count(),1,module+' state must appear on the topology');
   assert.equal(await page.locator('#syntheticDeviceChoices input').count(),data.report.devices.length,module+' '+vendor+' devices');
   await page.locator('#wbFailures').click();
   const devices=page.locator('#syntheticDeviceChoices input');await devices.first().check();if(await devices.count()>1)await devices.nth(1).check();await page.locator(module==='VPC'?'#pairFail':'#syntheticNodeDown').click();
   assert.ok((await page.locator('#syntheticStatus').innerText()).includes('2 device')||await devices.count()===1);
   assert.ok(await page.locator('#labMap [data-device-state="down"]').count()>=1,module+' failed device must be visible on the drawing');
   await page.locator('#syntheticRecord').click();const failedRecord=await page.evaluate(()=>window.NetworkLab.scenarioRecords().at(-1));assert.match(failedRecord.topologySvg,/DEVICE DOWN/);assert.match(failedRecord.topologySvg,/data-topology-state/);assert.match(failedRecord.baselineTopologySvg,/<svg/);assert.ok(!failedRecord.baselineTopologySvg.includes('DEVICE DOWN'));assert.ok(failedRecord.componentStates.some(x=>x.current==='DOWN'));assert.ok(failedRecord.assessment.en.summary);assert.ok(failedRecord.assessment.tr.summary);assert.ok(failedRecord.metrics.length>=3);
   await page.locator(module==='VPC'?'#pairRestore':'#syntheticNodeUp').click();assert.equal(await devices.first().isChecked(),false);
   assert.equal(await page.locator('#labMap [data-device-state="down"]').count(),0,module+' restore removes stale device failure marks');
   if(await devices.count()>1){await devices.first().check();await devices.nth(1).check();await page.locator(module==='VPC'?'#pairFail':'#syntheticNodeDown').click();await devices.first().uncheck();await page.locator(module==='VPC'?'#pairRestore':'#syntheticNodeUp').click();const pending=await page.locator('#labEvidence').textContent().then(JSON.parse);assert.equal(pending.failures.devices.length,1,module+' partial restore retains the other failure');await devices.first().check();await page.locator(module==='VPC'?'#pairRestore':'#syntheticNodeUp').click();}

   if(vendor===vendors[0]&&['BGP','STP','OSPF','QOS'].includes(module)){
    await page.locator('#wbPolicies').click();
    if(module==='STP'){const root=page.locator('#wbPoliciesPanel select').first(),values=await root.locator('option').evaluateAll(options=>options.map(o=>o.value)),old=await root.inputValue();await root.selectOption(values.find(value=>value!==old));assert.equal(await page.locator('#labMap [data-device-state="root"]').count(),1);assert.match(await page.locator('#labMap [data-topology-state]').textContent(),/ROOT:/);}
    else {const input=page.locator('#wbPoliciesPanel input[type="number"]').first();await input.fill(module==='BGP'?'350':module==='OSPF'?'37':'600');await input.dispatchEvent('change');if(module==='OSPF')assert.match(await page.locator('#labMap [data-path-decision="OSPF"]').textContent(),/37/);if(module==='QOS')assert.match(await page.locator('#labMap [data-topology-state]').textContent(),/Offered 600 Mbps/);if(module==='BGP'){await page.locator('#syntheticApplyOutbound').click();assert.match(await page.locator('#labMap [data-path-decision="BGP"]').textContent(),/350/);await page.locator('#syntheticInboundTab').click();await page.locator('#syntheticRecord').click();const inbound=await page.evaluate(()=>window.NetworkLab.scenarioRecords().at(-1));assert.ok(inbound.sourceDevice.startsWith('ISP'), 'inbound visual/report source is the upstream');assert.ok(inbound.targetDevice.startsWith('CE'),'inbound visual/report destination is the prefix owner');await page.locator('#syntheticOutboundTab').click();}}
    await page.screenshot({path:'/tmp/visual-policy-'+module.toLowerCase()+'.png'});if(module==='BGP')await page.locator('#syntheticDefaultOutbound').click();else await page.getByRole('button',{name:'Restore design parameters',exact:true}).click();await page.locator('#wbFailures').click();
   }
   if(vendor===vendors[0]&&['BGP','STP','OSPF','QOS','EVPN'].includes(module))await page.screenshot({path:'/tmp/visual-'+module.toLowerCase()+'.png'});
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
   await page.goto(base+'/?resume=1');await page.evaluate(()=>window.__workspaceRestoreReady);await page.locator('#topologySimulation button').waitFor({state:'attached'});
  }
 }
 assert.deepEqual(errors,[]);console.log(count+' module/vendor browser combinations passed');
}finally{await browser.close();}
