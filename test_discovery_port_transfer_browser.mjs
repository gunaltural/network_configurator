import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const base=process.env.SMOKE_URL||'http://127.0.0.1:8161';
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/port-mapping');await page.waitForFunction(()=>window.PortMapping);
 await page.evaluate(async()=>{
  await window.PortMapping.restore({schema:'mac-port-mapping-v2',sources:[{device:'CORE',platform:'Cisco IOS-XE',kind:'mac',importedAt:'2026-10-25T08:00:00Z',raw:'120 0011.2233.4455 DYNAMIC Gi1/0/1'},{device:'ACCESS',platform:'Cisco IOS-XE',kind:'mac',importedAt:'2026-10-25T08:00:00Z',raw:'120 0011.2233.4455 DYNAMIC Gi1/0/18'}],annotations:{'Default|120|001122334455':{hostname:'Retained endpoint',notes:'Engineer annotation'}}});
  sessionStorage.setItem('networkConfigurator.workflow.design',JSON.stringify({schema:'network-configurator-v3',project:{id:'preserve-project',name:'Existing design'},moduleStates:{BGP:{fields:{bgpCustomerAs:'65123'}}}}));
 });
 const before=await page.evaluate(()=>sessionStorage.getItem('networkConfigurator.workflow.design'));
 await page.goto(base+'/network-discovery');await page.waitForFunction(()=>window.NetworkDiscovery);
 await page.locator('[data-discovery-view=cli]').click();await page.locator('#discoveryLocalName').fill('CORE');await page.locator('#discoveryImportProtocol').selectOption('lldp');
 await page.locator('#discoveryImportOutput').fill('Local Intf: Gi1/0/1\nChassis id: aabb.ccdd.eeff\nPort id: Gi1/0/48\nSystem Name: ACCESS\nSystem Description: Cisco switch\n');
 await page.locator('#discoveryParse').click();await page.waitForFunction(()=>window.NetworkDiscovery.snapshot().graph.links.length===1);
 const discoveryBefore=await page.evaluate(()=>window.NetworkDiscovery.snapshot());
 await page.locator('#discoveryPortAnalysis').click();await page.waitForURL('**/port-mapping?from=discovery');await page.waitForFunction(()=>window.PortMapping?.model().links.length===1);
 const data=await page.evaluate(()=>({sources:PortMapping.sources(),model:PortMapping.model(),trace:PortMappingCore.trace(PortMapping.model(),PortMapping.model().endpoints[0]),pending:sessionStorage.getItem('networkConfigurator.portMapping.discovery'),saved:JSON.parse(localStorage.getItem('networkConfigurator.portMapping.v2'))}));
 assert.equal(data.sources.filter(s=>s.kind==='mac').length,2);assert.equal(data.model.endpoints.length,1);assert.equal(data.model.endpoints[0].hostname,'Retained endpoint');
 assert.equal(data.model.endpoints[0].locations.length,1);const edge=data.model.groups.find(g=>g.id===data.model.endpoints[0].locations[0]);assert.equal(edge.device,'ACCESS');assert.match(edge.port,/18$/);assert.equal(data.trace.length,1);assert.equal(data.pending,null);
 await page.locator('#pmUseDiscovery').click();await page.waitForFunction(()=>document.getElementById('pmStatus').textContent.startsWith('0 Discovery'));assert.equal(await page.evaluate(()=>PortMapping.sources().length),data.sources.length);
 const design=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('networkConfigurator.workflow.design')));assert.equal(design.moduleStates.BGP.fields.bgpCustomerAs,'65123');assert.deepEqual(design.networkDiscovery,discoveryBefore);
 // A rejected handoff must leave the valid mapping evidence intact.
 await page.evaluate(async()=>{try{await PortMapping.importDiscovery({discovery:{schema:'invalid',sources:[]}});throw Error('Expected rejection');}catch(e){if(e.message==='Expected rejection')throw e;}});assert.equal(await page.evaluate(()=>PortMapping.sources().length),data.sources.length);
 assert.deepEqual(errors,[]);console.log('Discovery → port analysis: topology reuse, MAC/annotation preservation, final access port, trace, deduplication and Design isolation passed');
}finally{await browser.close();}
