const {execFileSync}=require('child_process');
const fs=require('fs'),assert=require('assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
let html=fs.readFileSync('web.html','utf8').replace(/\}\)\(\);\s*<\/script>\s*<\/body>/,'window.__bgpAudit={bgpEdges,reportingDesign};})();</script></body>');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html,{url:'https://test.invalid/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){for(const f of ['huawei-istack.js','engineering-locale.js','vpc-report.js','verification-plan.js','design-checks.js'])w.eval(fs.readFileSync(f,'utf8'));w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=async()=>({ok:true,json:async()=>({platforms:{}})});}});
const w=dom.window,d=w.document,pause=()=>new Promise(r=>setTimeout(r,70)),copy=x=>JSON.parse(JSON.stringify(x));
const change=(id,value)=>{const n=d.getElementById(id);if(n.type==='checkbox')n.checked=value;else n.value=value;n.dispatchEvent(new w.Event('change',{bubbles:true}));};
(async()=>{try{
 d.querySelector('.tech[data-tech="BGP"]').click();await pause();
 for(const platform of ['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','FortiGate']){
  change('platform',platform);await pause();change('bgpConnectivity','full');change('bgpCeCount','2');change('bgpIspCount','2');
  assert.equal(w.__bgpAudit.bgpEdges().length,4);assert.equal(d.getElementById('bgpAttachmentEditor').hidden,true);change('bgpConnectivity','cross');assert.deepEqual(copy(w.__bgpAudit.bgpEdges()),[[0,0],[1,1]]);
  change('bgpConnectivity','full');change('bgpLinkC1I2CeIp','172.16.20.1/30');change('bgpConnectivity','custom');assert.equal(d.getElementById('bgpAttachmentEditor').hidden,false);change('bgpAttachC1I2',false);change('bgpAttachC2I1',false);
  assert.deepEqual(copy(w.__bgpAudit.bgpEdges()),[[0,0],[1,1]]);assert.equal(d.getElementById('bgpLinkC1I2CeIp').value,'172.16.20.1/30');assert.equal(d.getElementById('bgpLinkC1I2CeIp').closest('.bgp-link-card').hidden,true);
  change('bgpIsp1Provider','Provider A');change('bgpIsp2Provider','Provider A');change('bgpIsp2As','64501');
  const report=w.__bgpAudit.reportingDesign();assert.equal(report.links.filter(x=>x.detail.startsWith('eBGP')).length,2);assert.equal(report.links.filter(x=>x.detail.startsWith('CE interconnect')).length,1);assert.equal(report.specialLinks.filter(x=>x.kind==='iBGP'||x.type==='iBGP').length||report.specialLinks.length,1);
  assert.ok(report.configurations.every(x=>!x.text.includes('172.16.20.2')),'Inactive eBGP peer must not be generated');assert.ok(report.parameters.some(x=>(x.impact||'').includes('Provider A')));const external=report.parameters.find(x=>(x.impact||'').includes('Provider A'));assert.match(w.NetworkLocale.localizeParameter(external,'tr').impact,/Provider A/);assert.match(w.NetworkLocale.localizeParameter(external,'tr').impact,/Fiziksel bağlantılar/);
  if(platform==='Cisco NX-OS')for(const language of ['en','tr']){
   const payload={...copy(report),name:'BGP connectivity acceptance',language};payload.parameters=payload.parameters.map(p=>w.NetworkLocale.localizeParameter(p,language));
   const result=execFileSync('python',['-c','import json,sys,io;from app import app;from fastapi.testclient import TestClient;from docx import Document;p=json.load(sys.stdin);r=TestClient(app).post("/api/reporting/word",json=p);assert r.status_code==200,r.text;d=Document(io.BytesIO(r.content));text="\\n".join(x.text for x in d.paragraphs);assert "Provider A" in text;assert "172.16.20.2" not in text;print("Word connectivity passed")'],{input:JSON.stringify(payload),encoding:'utf8'});assert.match(result,/passed/);
  }
  const saved=copy(w.NetworkWorkspaceProject.snapshot());w.NetworkWorkspaceProject.apply(saved);await pause();assert.deepEqual(copy(w.__bgpAudit.bgpEdges()),[[0,0],[1,1]]);assert.equal(d.getElementById('bgpIsp2Provider').value,'Provider A');
  d.querySelector('.tech[data-tech=OSPF]').click();await pause();d.querySelector('.tech[data-tech=BGP]').click();await pause();assert.deepEqual(copy(w.__bgpAudit.bgpEdges()),[[0,0],[1,1]],'Switching modules retains custom connectivity');
  change('bgpAttachC1I2',true);assert.equal(d.getElementById('bgpLinkC1I2CeIp').value,'172.16.20.1/30');assert.equal(w.__bgpAudit.reportingDesign().links.filter(x=>x.detail.startsWith('eBGP')).length,3);
  change('bgpConnectivity','single');assert.equal(d.getElementById('bgpAttachmentEditor').hidden,true);assert.equal(d.getElementById('bgpCeCount').value,'1');assert.equal(d.getElementById('bgpIspCount').value,'1');assert.deepEqual(copy(w.__bgpAudit.bgpEdges()),[[0,0]]);
  change('bgpConnectivity','dual');assert.equal(d.getElementById('bgpCeCount').value,'1');assert.equal(d.getElementById('bgpIspCount').value,'2');assert.equal(w.__bgpAudit.bgpEdges().length,2);
  change('bgpIsp1Name','UP-A');change('bgpIsp2Name','UP-B');change('bgpConnectivity','custom');assert.equal(d.getElementById('bgpAttachmentEditor').parentElement.id,'topologyControls');assert.equal(d.getElementById('bgpAttachC1I2').disabled,false);d.getElementById('bgpAttachC1I2').click();
  assert.ok(!d.getElementById('topologyArea').textContent.includes('UP-B'));assert.match(d.getElementById('topologyArea').textContent,/1 CE · 1 upstream router · 1 external link/);assert.equal(w.__bgpAudit.reportingDesign().devices.filter(x=>x.external).length,1);
  change('bgpAttachC1I2',true);change('bgpAttachC1I1',false);assert.ok(!d.getElementById('topologyArea').textContent.includes('UP-A'));assert.ok(d.getElementById('topologyArea').textContent.includes('UP-B'));const onlySecond=w.__bgpAudit.reportingDesign();assert.equal(onlySecond.devices.find(x=>x.external).hostname,'UP-B');assert.equal(onlySecond.devices.find(x=>x.external).provider,d.getElementById('bgpIsp2Provider').value);assert.ok(onlySecond.links.every(x=>onlySecond.devices.some(d=>d.id===x.a)&&onlySecond.devices.some(d=>d.id===x.b)));
  change('bgpAttachC1I1',true);assert.ok(d.getElementById('topologyArea').textContent.includes('UP-A'));assert.equal(d.getElementById('bgpIspCount').value,'2');

 }
 change('bgpConnectivity','full');change('bgpCeCount','2');change('bgpIspCount','2');assert.equal(d.querySelector('#bgpConnectivity option[value=primary-backup]'),null);
 change('bgpConnectivity','custom');for(const id of ['bgpAttachC1I1','bgpAttachC1I2','bgpAttachC2I1','bgpAttachC2I2'])change(id,false);assert.ok(w.NetworkDesignValidation.issues.some(x=>x.code==='bgp-no-links'));
 change('bgpConnectivity','full');change('bgpCeCount','3');assert.equal(w.__bgpAudit.bgpEdges().length,6);assert.ok(w.NetworkDesignValidation.issues.some(x=>x.code==='bgp-ibgp-transport'));
 assert.deepEqual(errors,[]);console.log('BGP connectivity: five vendors, explicit links, inactive config exclusion, provider separation, custom Save/Open, retained interface fields, preset counts, separated traffic policy and transport warnings passed.');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
