import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {buildCases,emitJsonl,SCENARIO_GROUPS} from './module_scenarios.mjs';

const dir=dirname(fileURLToPath(import.meta.url));
const cases=buildCases();
const fields=text=>Object.fromEntries(text.split('\n').map(line=>line.split(/=(.*)/s).slice(0,2)));
const byGroup=(id,i=0)=>cases.find(x=>x.id==='sim-'+id+'-'+String(i).padStart(2,'0'));

test('generated original scenarios are reproducible and confined to research',()=>{
 assert.equal(cases.length,226);
 assert.equal(cases.filter(x=>x.split==='train').length,192);
 assert.equal(cases.filter(x=>x.split==='val').length,10);
 assert.equal(cases.filter(x=>x.split==='test').length,24);
 assert.equal(new Set(cases.map(x=>x.id)).size,226);
 assert.equal(emitJsonl(),emitJsonl());
 const groups=new Map(SCENARIO_GROUPS.map(x=>[x.id,x.split]));
 assert.equal(groups.size,14);
 for(const item of cases){
  assert.equal(item.split,groups.get(item.scenario_id.replace('failgroup-','')));
  assert.match(item.input,/No physical network telemetry/);
  assert.match(item.completion,/LIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING/);
  assert.equal(item.provenance.live_verification,false);
  assert.equal(item.provenance.source,'synthetic-bgp.js');
  assert.equal(item.provenance.engine,'Synthetic BGP design model v4');
 }
});

test('never train on withheld failure groups',()=>{
 const trainGroups=new Set(cases.filter(x=>x.split==='train').map(x=>x.scenario_id));
 const valGroups=new Set(cases.filter(x=>x.split==='val').map(x=>x.scenario_id));
 const testGroups=new Set(cases.filter(x=>x.split==='test').map(x=>x.scenario_id));
 assert.equal(trainGroups.size,6);
 assert.equal(valGroups.size,2);
 assert.equal(testGroups.size,6);
 assert.equal([...trainGroups].filter(x=>testGroups.has(x)||valGroups.has(x)).length,0);
 assert.equal([...testGroups].filter(x=>valGroups.has(x)).length,0);
 assert.equal(new Set(cases.map(x=>x.input)).size,226);
});

test('matches original simulation nuanced failure semantics',()=>{
 const wanAndInterconnect=fields(byGroup('wan1-interconnect').completion);
 assert.equal(wanAndInterconnect.CE1_EXIT,'NO_MODELED_PATH');
 assert.equal(wanAndInterconnect.CE1_PREFIX_INBOUND,'NO_MODELED_PATH');
 assert.equal(wanAndInterconnect.SHARED_LAN_INBOUND,'PATH_AVAILABLE');
 const ce1Failure=fields(byGroup('ce1').completion);
 assert.equal(ce1Failure.CE1_EXIT,'DEVICE_FAILED');
 assert.equal(ce1Failure.CE1_PREFIX_INBOUND,'NO_MODELED_PATH');
 assert.equal(ce1Failure.SHARED_LAN_INBOUND,'PATH_AVAILABLE');
 const internetDown=fields(byGroup('both-isps').completion);
 assert.equal(internetDown.SHARED_LAN_INBOUND,'NO_MODELED_PATH');
 assert.equal(internetDown.CLIENT_OUTBOUND,'NO_MODELED_PATH');
 const clientsDown=fields(byGroup('both-ces').completion);
 assert.equal(clientsDown.CLIENT_OUTBOUND,'NO_MODELED_GATEWAY');
 assert.equal(clientsDown.SHARED_LAN_INBOUND,'NO_MODELED_PATH');
});

test('knowledge references and simulation source hash are auditable',()=>{
 const knowledge=JSON.parse(readFileSync(resolve(dir,'internal_module_knowledge.json'),'utf8'));
 assert.ok(knowledge.facts.length>=14);
 assert.equal(new Set(knowledge.facts.map(x=>x.id)).size,knowledge.facts.length);
 assert.ok(knowledge.facts.some(x=>x.id==='DESIGN-LOCALPREF'));
 assert.ok(knowledge.facts.some(x=>x.id==='POLICY-DIRECTION'));
 const sha=createHash('sha256')
  .update(readFileSync(resolve(dir,'../../../synthetic-bgp.js')))
  .digest('hex');
 for(const scenario of cases)assert.equal(scenario.provenance.source_sha256,sha);
});
