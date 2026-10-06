const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const vendors=['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','Huawei iStack','FortiGate'];
(async()=>{
 for(const vendor of vendors){
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const source={schema:'network-configurator-report-v1',language:'en',name:'Synthetic maintenance',vendor,technology:vendor==='Huawei iStack'?'Huawei iStack':'BGP',architecture:'module',techPlacement:'upper',upperCount:1,lowerCount:0,links:[],configurations:[],parameters:[],source:{module:'BASIC',projectId:'audit'},inventoryRevision:2,inventoryDeviceIds:['inventory-audit'],manualVisibleIds:['inventory-audit'],sshVisibleIds:[],devices:[{id:'inventory-audit',tier:'inventory',index:1,inventoryOnly:true,inventoryRecord:true,inventoryChannel:'manual',vendor,hostname:'AUDIT-DEVICE',model:'SYNTHETIC-MODEL',serial:'SYNTHETIC-SERIAL',softwareVersion:'TEST-1',modelSource:'manual',serialSource:'manual'}]};
  const dom=new JSDOM(fs.readFileSync('reporting.html','utf8'),{url:'https://test.invalid/reporting',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
   for(const file of ['engineering-locale.js','vpc-report.js','verification-plan.js'])w.eval(fs.readFileSync(file,'utf8'));
   w.sessionStorage.setItem('networkConfigurator.report.import',JSON.stringify(source));
  }});
  try{
   const w=dom.window,d=w.document;d.querySelector('[data-view="lifecycle"]').click();
   const portal=d.querySelector('#maintenanceArea a');assert.match(portal.href,/^https:\/\/(www\.cisco\.com|www\.arista\.com|info\.support\.huawei\.com|docs\.fortinet\.com)\//);
   const input=d.querySelector('[data-maint="recommendedVersion"]');input.value='TEST-2';input.dispatchEvent(new w.Event('input'));
   d.querySelector('[data-view="upgrade"]').click();
   [...d.querySelectorAll('#maintenanceArea button')].find(b=>b.textContent==='Generate planning checklist').click();
   const plan=w.NetworkReportProject.snapshot().devices.find(x=>x.id==='inventory-audit').maintenance;
   assert.equal(plan.recommendedVersion,'TEST-2');assert.ok(plan.prechecks);assert.ok(!plan.prechecks.includes('undefined'),vendor);
   if(vendor==='Huawei iStack'){assert.ok(plan.prechecks.includes('display stack'));assert.ok(plan.prechecks.includes('display mad'));}
   assert.ok(d.getElementById('reportPreview').textContent.includes('Upgrade plan'));
   const saved=w.NetworkReportProject.snapshot();w.NetworkReportProject.apply(saved);assert.equal(w.NetworkReportProject.snapshot().devices[0].maintenance.prechecks,plan.prechecks);
   d.getElementById('reportLanguage').value='tr';d.getElementById('reportLanguage').dispatchEvent(new w.Event('change'));
   assert.ok(d.getElementById('reportPreview').textContent.includes('Sonuçları kaydedin'));assert.ok(!d.getElementById('reportPreview').textContent.includes('Record baseline peers'));
   assert.deepEqual(errors,[]);
  }finally{dom.window.close();}
 }
 console.log('Maintenance: official portals, six-platform upgrade checklists, engineer data, persistence and TR/EN report defaults passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
