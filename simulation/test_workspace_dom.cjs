const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/navigation/.test(e.message))errors.push(e.message);});
const scripts=['huawei-istack.js','vpc-report.js','design-checks.js','engineering-report.js','engineering-locale.js'];
const dom=new JSDOM(fs.readFileSync('web.html','utf8'),{url:'https://test.invalid/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){for(const s of scripts)w.eval(fs.readFileSync(s,'utf8'));w.scrollTo=()=>{};w.fetch=async()=>({ok:true,json:async()=>({})});w.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:950,height:450});Object.defineProperty(w.SVGElement.prototype,'viewBox',{get(){const a=(this.getAttribute('viewBox')||'0 0 950 450').split(/\s+/).map(Number);return {baseVal:{x:a[0],y:a[1],width:a[2],height:a[3]}};}});w.SVGElement.prototype.getComputedTextLength=()=>80;}});
const w=dom.window,d=w.document,pause=()=>new Promise(r=>setTimeout(r,55));let cases=0;
function lab(data){const lab=new JSDOM(fs.readFileSync('network-lab.html','utf8'),{url:'https://test.invalid/network-lab?workspace=1',runScripts:'outside-only',virtualConsole:vc}),v=lab.window;v.sessionStorage.setItem('networkConfigurator.lab.workspace',JSON.stringify(data));v.eval(fs.readFileSync('simulation-report.js','utf8'));v.eval(fs.readFileSync('simulation/workspace-engine.js','utf8'));v.eval(fs.readFileSync('simulation/workspace-controller.js','utf8').replace("if(model.module==='VPC')import(","if(false)import("));v.eval(fs.readFileSync('simulation-workbench.js','utf8'));return v;}
(async()=>{try{await pause();
for(const module of ['BASIC','BGP','OSPF','STP','VPC','EVPN','QOS','SDWAN']){
 d.querySelector('.tech[data-tech="'+module+'"]').click();await pause();const vendors=[...d.getElementById('platform').options].map(o=>o.value);
 for(const vendor of vendors){const p=d.getElementById('platform');p.value=vendor;p.dispatchEvent(new w.Event('change',{bubbles:true}));await pause();
 const data=w.NetworkWorkspaceProject.prepareWorkspaceSimulation();assert.equal(data.report.source.module,module);const v=lab(data),doc=v.document;
 const devices=[...doc.querySelectorAll('#syntheticDeviceChoices input')];assert.equal(devices.length,data.report.devices.length,module+' '+vendor);
 for(const box of devices.slice(0,2)){box.checked=true;box.dispatchEvent(new v.Event('change'));}doc.getElementById('syntheticNodeDown').click();assert.match(doc.getElementById('syntheticStatus').textContent,/device \/ 0 connection/);
 doc.getElementById('syntheticNodeUp').click();assert.ok([...doc.querySelectorAll('#syntheticDeviceChoices input')].every(b=>!b.checked));
 const links=[...doc.querySelectorAll('#syntheticLinkChoices input')];for(const box of links.slice(0,2)){box.checked=true;box.dispatchEvent(new v.Event('change'));}doc.getElementById('syntheticLinkDown').click();doc.getElementById('syntheticLinkUp').click();assert.ok([...doc.querySelectorAll('#syntheticLinkChoices input')].every(b=>!b.checked));
 doc.getElementById('syntheticRecord').click();doc.getElementById('labSendEvidence').click();const report=JSON.parse(v.sessionStorage.getItem('networkConfigurator.report.current'));assert.equal(report.source.module,module);assert.equal(report.simulationScenarios.length,1);const html=v.SimulationReport.html(report.simulationScenarios,'en');assert.ok(html.includes(data.report.technology));if(module!=='BGP')assert.ok(!html.includes('Both CEs'));
 assert.equal(doc.getElementById('labMap').getAttribute('data-source'),'design');v.close();cases++;console.log('PASS',module,vendor);
 }
}
assert.deepEqual(errors,[]);console.log(cases+' actual workspace/vendor transfers and shared controller failure/restore/report cases passed.');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
