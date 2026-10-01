const fs=require('node:fs');const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');const {JSDOM,VirtualConsole}=require('jsdom');
const source=JSON.parse(fs.readFileSync(process.env.AUDIT_PAYLOAD_PATH||'/tmp/network-configurator-audit-payload.json','utf8'));
source.inventoryAssignments={'legacy-device':'legacy-inventory'};source.name='Reporting end-to-end audit';source.inventoryRevision=2;source.inventoryDeviceIds=['inventory-12345678-1234-1234-1234-123456789012'];source.manualVisibleIds=[...source.inventoryDeviceIds];source.sshVisibleIds=[];
source.devices.push({id:source.inventoryDeviceIds[0],tier:'inventory',inventoryOnly:true,inventoryRecord:true,inventoryChannel:'manual',observedHostname:'ACTUAL-AUDIT-SW',hostname:'ACTUAL-AUDIT-SW',model:'AUDIT-MODEL',serial:'AUDIT-SERIAL',softwareVersion:'1.0',modelSource:'manual',serialSource:'manual',vendor:'Cisco NX-OS'});
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...x)=>errors.push(x.join(' ')));let wordPayload;
const dom=new JSDOM(fs.readFileSync('reporting.html','utf8'),{url:'https://test.invalid/reporting',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.eval(fs.readFileSync("engineering-locale.js","utf8"));w.eval(fs.readFileSync("vpc-report.js","utf8"));w.sessionStorage.setItem('networkConfigurator.report.import',JSON.stringify(source));w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};w.fetch=async(url,options)=>{assert.equal(url,'/api/reporting/word');wordPayload=JSON.parse(options.body);return {ok:true,blob:async()=>new w.Blob(['TEST'])};};}});
const w=dom.window,d=w.document,pause=()=>new Promise(r=>setTimeout(r,10));
(async()=>{try{
 await pause();assert.equal(d.getElementById("inventoryMappingPanel"),null);assert.ok(!JSON.parse(w.sessionStorage.getItem("networkConfigurator.report.current")).inventoryAssignments);assert.equal(d.getElementById('reportInventoryRows').textContent.includes('ACTUAL-AUDIT-SW'),true);assert.equal(d.getElementById('reportPreview').textContent.includes('AUDIT-SERIAL'),true);
 d.getElementById('useProjectExample').click();
 for(const language of ['en','tr']){
  const select=d.getElementById('reportLanguage');select.value=language;select.dispatchEvent(new w.Event('change',{bubbles:true}));
  const text=d.getElementById('reportPreview').textContent;
  assert.ok(text.includes(language==='tr'?'Güç, rack':'Validate power'));
  assert.ok(!text.includes(language==='tr'?'Validate power':'Güç, rack'));
  assert.equal(d.querySelectorAll('.project-identity-table tbody tr').length,8);assert.ok(!/ÖRNEK|EXAMPLE/.test(text));
  d.getElementById('downloadWord').click();await pause();assert.ok(wordPayload);
  assert.ok(wordPayload.devices.find(x=>x.id===source.inventoryDeviceIds[0]).tier==='upper');
  assert.equal(wordPayload.moduleReports.length,3);
  const result=execFileSync('python',['-c','import sys,json,io;from docx import Document;from app import app;from fastapi.testclient import TestClient;r=TestClient(app).post("/api/reporting/word",json=json.load(sys.stdin));print(r.status_code);print(r.text[:500] if r.status_code!=200 else json.dumps([[c.text for c in row.cells] for row in Document(io.BytesIO(r.content)).tables[0].rows],ensure_ascii=False))'],{input:JSON.stringify(wordPayload),encoding:'utf8'});
  assert.ok(result.startsWith('200'),result);const identityRows=JSON.parse(result.split('\n')[1]);assert.equal(identityRows.length,9);assert.equal(identityRows[0][0],language==='tr'?'Alan':'Field');assert.equal(identityRows[1][0],language==='tr'?'Müşteri / kuruluş':'Customer / organization');assert.equal(identityRows[1][1],language==='tr'?'Müşteri kuruluş adı':'Customer organization');
 }
 d.querySelector('[data-view="inventory"]').click();d.getElementById('selectManualAll').click();d.getElementById('removeInventoryDevice').click();
 assert.equal(d.getElementById('manualRows').children.length,0);assert.ok(!d.getElementById('reportPreview').textContent.includes('AUDIT-SERIAL'));
 assert.ok(d.getElementById('reportPreview').textContent.includes('Henüz envanter kaydı yok; model ve seri numarası doğrulanmamıştır'));
 assert.ok(!d.getElementById('reportPreview').textContent.includes('Tüm cihaz modelleri ve seri numaraları doldurulmuştur'));
 assert.deepEqual(errors,[]);console.log('Combined reporting DOM, transferred inventory, both-language Word requests and immediate removal passed.');
 }finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
