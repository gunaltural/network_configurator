import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const base=process.env.SMOKE_URL||'http://127.0.0.1:8161';
try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/');await p.waitForFunction(()=>window.NetworkWorkspaceProject);
 for(const key of ['BGP','OSPF','STP','VPC','EVPN','SDWAN','QOS','BASIC']){
  await p.evaluate(k=>NetworkWorkspaceProject.activateModule(k),key);
  const source=await p.evaluate(()=>NetworkWorkspaceProject.snapshot());
  await p.evaluate(async saved=>{await NetworkWorkspaceProject.activateModule(saved.workspace.technology==='BGP'?'OSPF':'BGP');NetworkWorkspaceProject.apply(saved);await window.__workspaceRestoreReady;},source);
  for(const tab of ['config','deploy','verify','trouble']){
   await p.locator('[data-nc-group="operations"] summary').evaluate(e=>e.parentElement.open=true);
   await p.locator('[data-nc-tab="'+tab+'"]').click();
   assert.equal(await p.locator('.tab.active').getAttribute('data-tab'),tab);
   const result=await p.evaluate(()=>NetworkWorkspaceProject.snapshot());
   assert.equal(result.workspace.technology,key);
   assert.equal(result.workspace.platform,source.workspace.platform);
   assert.deepEqual(result.moduleStates[key].fields,source.moduleStates[key].fields);
  }
 }
 // Open a saved project through the same Project Library entry point used by users.
 await p.evaluate(()=>NetworkWorkspaceProject.activateModule('BGP','Cisco NX-OS'));
 const savedDesign=await p.evaluate(()=>NetworkWorkspaceProject.snapshot());savedDesign.project.name='Saved BGP verification';savedDesign.project.id='saved-bgp-verification';
 const bundle={schema:'network-configurator-project-v1',name:'Saved BGP verification',design:savedDesign,reporting:null};
 await p.route('**/api/projects/saved-bgp',route=>route.fulfill({json:{id:'saved-bgp',name:bundle.name,version:1,document:bundle}}));
 await p.evaluate(()=>NetworkWorkspaceProject.activateModule('OSPF'));
 await p.evaluate(async()=>{await NetworkProjects.openSaved('saved-bgp','design');});
 await p.locator('[data-nc-group="operations"] summary').evaluate(e=>e.parentElement.open=true);
 await p.locator('[data-nc-tab="verify"]').click();
 assert.equal(await p.evaluate(()=>NetworkWorkspaceProject.diagnosticScope().module),'BGP');
 assert.equal(await p.evaluate(()=>NetworkWorkspaceProject.diagnosticScope().platform),'Cisco NX-OS');
 assert.match(await p.locator('#operationsSource').textContent(),/Saved BGP verification/);
 for(const origin of ['/reporting?view=design','/network-discovery','/port-mapping']){
  for(const tab of ['config','deploy','verify','trouble']){
   await p.goto(base+origin);
   await p.locator('[data-nc-group="operations"] summary').evaluate(e=>e.parentElement.open=true);
   await p.locator('[data-nc-tab="'+tab+'"]').click();
   await p.waitForURL('**/?resume=1&tab='+tab);
   await p.waitForFunction(t=>window.NetworkWorkspaceProject?.diagnosticScope().module==='BGP'&&document.querySelector('.tab.active')?.dataset.tab===t,tab);
   const restored=await p.evaluate(()=>NetworkWorkspaceProject.snapshot());
   assert.equal(restored.project.id,savedDesign.project.id);
   assert.equal(restored.workspace.platform,'Cisco NX-OS');
   assert.deepEqual(restored.moduleStates.BGP.fields,savedDesign.moduleStates.BGP.fields);
  }
 }
 await p.goto(base+'/port-mapping');await p.waitForFunction(()=>window.PortMapping);
 await p.locator('#pmExample').click();await p.waitForFunction(()=>PortMapping.model().endpoints.length>0);
 assert.equal(await p.locator('#pmMapDetails').evaluate(e=>e.open),false);
 assert.ok(await p.locator('#pmClientRows').isVisible());
 await p.reload();await p.waitForFunction(()=>document.getElementById('pmTransferTitle').textContent==='Saved workspace');
 assert.equal(await p.locator('#pmMapDetails').evaluate(e=>e.open),false);
 await p.locator('#pmTransferTopology').click();assert.equal(await p.locator('#pmMapDetails').evaluate(e=>e.open),true);
 p.once('dialog',d=>d.accept());await p.locator('#pmClear').click();assert.equal(await p.evaluate(()=>PortMapping.sources().length),0);assert.equal(await p.locator('#pmTransferNotice').isVisible(),false);await p.reload();await p.waitForFunction(()=>window.PortMapping);assert.equal(await p.evaluate(()=>PortMapping.model().devices.length),0);
 assert.deepEqual(errors,[]);
 console.log('Implementation: existing design parameters retained across configuration/deployment/verification/troubleshooting; endpoint-first mapping and saved-workspace notice passed');
}finally{await b.close();}
