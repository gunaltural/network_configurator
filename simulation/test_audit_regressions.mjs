import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
require('./workspace-engine.js');
const E=globalThis.WorkspaceSimulationEngine;
const stp={module:'STP',settings:{preferredRoot:'r'},nodes:[{id:'r',tier:'upper'},{id:'s',tier:'upper'},{id:'a',tier:'lower'},{id:'b',tier:'lower'}],links:[{id:'rs',a:'r',b:'s'},{id:'ra',a:'r',b:'a'},{id:'rb',a:'r',b:'b'},{id:'sa',a:'s',b:'a'},{id:'sb',a:'s',b:'b'}]};
test('STP selects a root in each partition and restores the original tree',()=>{
 const state={links:['rs','ra','rb']},options={source:'a',target:'b'};
 const r=E.evaluate(stp,state,options);
 assert.equal(r.status,'reachable');assert.equal(r.root,'s');assert.deepEqual(new Set(r.roots),new Set(['r','s']));assert.deepEqual(r.path.nodes,['a','s','b']);assert.deepEqual(r.blockedLinks,[]);
 assert.equal(E.evaluate(stp,state,{source:'a',target:'r'}).status,'no-path');
 const restored=E.evaluate(stp,{},options);assert.equal(restored.root,'r');assert.deepEqual(restored.roots,['r']);assert.equal(restored.status,'reachable');
});
test('STP preserves component reachability for every link-failure combination',()=>{
 for(let mask=0;mask<2**stp.links.length;mask++){
  const links=stp.links.filter((l,i)=>mask&(1<<i)).map(l=>l.id);
  for(const a of stp.nodes)for(const b of stp.nodes){if(a.id===b.id)continue;
   const physical=E.shortest(stp,a.id,b.id,[],links),r=E.evaluate(stp,{links},{source:a.id,target:b.id});
   assert.equal(!!r.path,!!physical,JSON.stringify({links,source:a.id,target:b.id}));
   assert.ok((r.path?.links||[]).every(id=>!links.includes(id)&&!r.blockedLinks.includes(id)));
  }
 }
});
test('mixed scenario reports retain legacy fields and each record’s policies in both languages',()=>{
 const w=new JSDOM('',{runScripts:'outside-only'}).window;w.eval(fs.readFileSync('simulation-report.js','utf8'));
 try{
  const legacy={createdAt:'2026-10-17T12:00:00Z',direction:'inbound',clientPrefix:'10.77.0.0/24',internetEntry:'ISP-2',preferredGateway:'CE-1',activeGateway:'CE-2',backupGateway:'',baselinePath:'Client → CE-1',currentPath:'Client → CE-2',reachable:true,pathChanged:true,gatewayChanged:true,policies:[{connection:'LEGACY-POLICY',localPreference:9876,prependCount:3}]};
  const bgp={...legacy,module:'BGP',vendor:'Cisco NX-OS',modelStatus:'reachable',sourceDevice:'CE-1',targetDevice:'ISP-1',policies:Array.from({length:64},(_,i)=>({connection:'NEW-POLICY-'+i,localPreference:100+i,prependCount:i%11}))};
  const pair={...legacy,module:'VPC',technology:'vPC',modelStatus:'split-brain',roleStates:{'CORE-1':'PRIMARY (dual-active)'},failureSequence:['Peer-link DOWN'],policies:[]};
  for(const language of ['en','tr']){
   const doc=new w.DOMParser().parseFromString(w.SimulationReport.html([pair,legacy,bgp],language),'text/html'),sections=doc.querySelectorAll('.simulation-scenario');
   assert.equal(sections.length,3);assert.ok(![...sections[0].querySelectorAll('h4')].some(h=>/Applied synthetic policies|Uygulanan sentetik politikalar/.test(h.textContent)));
   for(const value of ['10.77.0.0/24','ISP-2','CE-1 / CE-2','LEGACY-POLICY','9876'])assert.ok(sections[1].textContent.includes(value),value);
   for(const policy of bgp.policies)assert.ok(sections[2].textContent.includes(policy.connection));
   assert.ok(sections[0].textContent.includes('split-brain'));assert.equal(JSON.stringify(legacy).includes('module'),false);
  }
 }finally{w.close();}
});

test('native bundle distinguishes partial member loss, protocol blocking and restored state',()=>{
 const nodes=[{id:'p',hostname:'CORE-A',tier:'upper'},{id:'q',hostname:'CORE-B',tier:'upper'},{id:'a',hostname:'ACCESS',tier:'lower'}];
 const links=[{id:'p1',a:'p',b:'q',kind:'peer-link'},{id:'p2',a:'p',b:'q',kind:'peer-link'},{id:'ka',a:'p',b:'q',kind:'keepalive'},{id:'ap',a:'a',b:'p',kind:'vPC member'},{id:'aq',a:'a',b:'q',kind:'vPC member'}];
 const topologySvg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 950 450">'+nodes.map((n,i)=>'<g><rect x="'+(50+i*250)+'" y="150" width="100" height="60"/><text data-lab-device="'+n.id+'" x="'+(100+i*250)+'" y="180">'+n.hostname+'</text></g>').join('')+'<line x1="100" y1="150" x2="350" y2="150" data-lab-links="[&quot;p1&quot;,&quot;p2&quot;]"/>'+links.slice(2).map((l,i)=>'<line x1="100" y1="'+(220+i*30)+'" x2="350" y2="'+(220+i*30)+'" data-lab-link="'+l.id+'"/>').join('')+'</svg>';
 const data={schema:'network-configurator-workspace-simulation-v1',projectId:'bundle-test',settings:{vpc:{initialPrimary:'p'}},topologySvg,report:{source:{module:'VPC'},vendor:'Cisco NX-OS',technology:'vPC',devices:nodes,links}};
 const w=new JSDOM(fs.readFileSync('network-lab.html','utf8'),{url:'https://test.invalid/network-lab?workspace=1',runScripts:'outside-only'}).window;
 try{
  w.sessionStorage.setItem('networkConfigurator.lab.workspace',JSON.stringify(data));
  for(const file of ['simulation-report.js','simulation/workspace-engine.js','simulation/workspace-controller.js'])w.eval(fs.readFileSync(file,'utf8').replace("if(model.module==='VPC')import(","if(false)import("));
  const d=w.document,bundle=()=>d.querySelector('#labMap [data-lab-links]'),select=d.getElementById('syntheticLink');
  const fail=ids=>{for(const option of select.options)option.selected=ids.includes(option.value);d.getElementById('syntheticLinkDown').click();};
  fail(['p1']);assert.equal(bundle().dataset.visualLinkState,'partial');assert.match(bundle().getAttribute('aria-label'),/1 of 2 represented members/);assert.equal(JSON.parse(d.getElementById('labEvidence').textContent).vpc.peerLinkUp,true);
  fail(['p2']);assert.equal(bundle().dataset.visualLinkState,'down');const member=d.querySelector('#labMap [data-lab-link="aq"]');assert.equal(member.dataset.visualLinkState,'blocked');assert.match(member.dataset.stateReason,/suspends/);assert.ok(!member.classList.contains('synthetic-flow'));
  d.getElementById('syntheticRecord').click();const saved=w.NetworkLab.scenarioRecords().at(-1);assert.match(saved.topologySvg,/data-state-legend/);assert.match(saved.topologySvg,/data-state-reason/);assert.ok(!saved.baselineTopologySvg.includes('MEMBERS SUSPENDED'));
  d.getElementById('syntheticReset').click();assert.equal(bundle().dataset.visualLinkState,'available');assert.equal(d.querySelectorAll('#labMap [data-visual-link-state="blocked"]').length,0);assert.equal(d.querySelectorAll('#labMap [data-role-changed="true"]').length,0);
 }finally{w.close();}
});
