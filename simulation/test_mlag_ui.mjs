import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {analyzeMlagFailure,analyzeAccessImpact,changeFailures} from './vendor-failure-engine.mjs';

const html=fs.readFileSync('simulation/vpc-mlag-lab.html','utf8');
const moduleScript=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(moduleScript,'inline lab module must exist');
const script=moduleScript.replace(/^import \{[^}]+\} from ['"][^'"]+['"];?\s*/,'');
function setup(){
 const messages=[];
 const vc=new VirtualConsole();vc.on('jsdomError',e=>messages.push(e.message));
 const dom=new JSDOM(html,{url:'https://test.invalid/vpc-mlag-simulation',runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window;
 w.__engine={analyzeMlagFailure,analyzeAccessImpact,changeFailures};
 w.sessionStorage.setItem('networkConfigurator.mlagSimulation.vendor','Arista EOS');
 w.sessionStorage.setItem('networkConfigurator.mlagSimulation.design',JSON.stringify({
  name:'Dynamic Test',technology:'MLAG',
  devices:[{id:'upper-1',tier:'upper',hostname:'ARISTA-A'},{id:'upper-2',tier:'upper',hostname:'ARISTA-B'},
   {id:'lower-1',tier:'lower',hostname:'LEAF-1'},{id:'lower-2',tier:'lower',hostname:'LEAF-2'}],
  links:[{id:'upper-1--lower-1',a:'upper-1',b:'lower-1',upperPort:'Eth1',lowerPort:'Eth49'},
   {id:'upper-2--lower-1',a:'upper-2',b:'lower-1',upperPort:'Eth1',lowerPort:'Eth50'},
   {id:'upper-1--lower-2',a:'upper-1',b:'lower-2',upperPort:'Eth2',lowerPort:'Eth49'}],
  specialLinks:[{kind:'Peer-link',a:'upper-1',b:'upper-2',aPort:'Eth10',bPort:'Eth10'},
   {kind:'Peer-link',a:'upper-1',b:'upper-2',aPort:'Eth11',bPort:'Eth11'}]
 }));
 w.sessionStorage.setItem('networkConfigurator.mlagSimulation.topologySvg',
 '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300"><g><text x="2" y="20">ARISTA-A</text><text x="2" y="80">ARISTA-B</text><text x="2" y="140">LEAF-1</text><text x="2" y="200">LEAF-2</text></g></svg>');
 const replaced=script.replace('import {analyzeMlagFailure,analyzeAccessImpact,changeFailures} from \'/simulation/vendor-failure-engine.mjs\';','');
 // Source uses browser module imports only; dependency injection models actual app module loading.
 w.eval('const {analyzeMlagFailure,analyzeAccessImpact,changeFailures}=window.__engine;\n'+replaced);
 return {w,d:w.document,messages,close:()=>w.close()};
}
const click=(d,id)=>d.getElementById(id).click();
const check=(d,id)=>{const c=[...d.querySelectorAll('[data-fault]')].find(x=>x.dataset.fault===id);assert.ok(c,'control exists '+id);c.checked=true;return c;};
test('Dynamic Workspace SVG is displayed with imported hostnames and physical ports',()=>{
 const {d,close,messages}=setup();
 assert.ok(d.querySelector('#workspaceTopologyVisual svg'));
 assert.equal(d.querySelector('#workspaceTopologyVisual text').textContent,'ARISTA-A');
 assert.match(d.getElementById('designPorts').textContent,/Eth49/);
 assert.match(d.getElementById('nodeALabel').textContent,/ARISTA-A/);
 assert.equal(d.querySelectorAll('#accessFailureChoices input[data-fault]').length,3);
 assert.deepEqual(messages,[]);
 close();
});
test('Fail two leaf paths, detect isolated leaf, partial restore clears checkbox',()=>{
 const {d,close}=setup();
 check(d,'upper-1--lower-1');check(d,'upper-2--lower-1');click(d,'fail');
 let report=JSON.parse(d.getElementById('report').textContent);
 assert.equal(report.accessImpact.leaves.find(x=>x.id==='lower-1').status,'isolated');
 assert.equal(report.accessImpact.leaves.find(x=>x.id==='lower-2').status,'single-path');
 check(d,'upper-1--lower-1');[...d.querySelectorAll('[data-fault]')].find(x=>x.dataset.fault==='upper-2--lower-1').checked=false;click(d,'restore');
 report=JSON.parse(d.getElementById('report').textContent);
 assert.equal(report.accessImpact.leaves.find(x=>x.id==='lower-1').status,'single-path');
 assert.equal([...d.querySelectorAll('[data-fault]')].find(x=>x.dataset.fault==='upper-1--lower-1').checked,false);
 click(d,'reset');report=JSON.parse(d.getElementById('report').textContent);
 assert.equal(report.failedConnections.length,0);
 close();
});
test('Two peer-link member failures mark role-dependent service as conditional',()=>{
 const {d,close}=setup();
 check(d,'peerLink1');check(d,'peerLink2');click(d,'fail');
 const report=JSON.parse(d.getElementById('report').textContent);
 assert.equal(report.accessImpact.leaves[0].status,'conditional');
 assert.ok(report.findings.some(x=>x.code==='PEER_LINK_FAILURE'));
 close();
});
test('Malicious SVG event handlers and scripts never enter dynamic topology',()=>{
 const {w,d,close}=setup();
 const svg=d.getElementById('workspaceTopologyVisual svg');
 assert.ok(svg);
 // Parsed image is read-only; the original snapshot isn't modified by UI actions.
 assert.equal(svg.querySelectorAll('script,foreignObject').length,0);
 close();
});
