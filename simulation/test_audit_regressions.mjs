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
