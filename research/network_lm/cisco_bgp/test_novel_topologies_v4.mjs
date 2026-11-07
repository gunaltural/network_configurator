/* V4 is a frozen evaluation-only distribution shift, not training text. */
import test from "node:test";
import assert from "node:assert/strict";
import {holdoutCases} from "./novel_topologies_v4.mjs";
import {buildCases,SCENARIO_GROUPS} from "./module_scenarios.mjs";
import {composeCases} from "./compositional_scenarios.mjs";

const records=holdoutCases();
const training=[...buildCases(),...composeCases()].filter(x=>x.split==="train");
const labelOf=x=>x.completion.split("\n")[0].slice(7);
const by=(group,i,field)=>records.find(x=>
  x.id==="novel-"+group+"-"+String(i).padStart(2,"0")+"-"+field
);

test("V4 holds out six independent topology parameterizations per unseen group",()=>{
 assert.equal(records.length,144);
 assert.equal(new Set(records.map(x=>x.id)).size,144);
 assert.equal(new Set(records.map(x=>x.scenario_id)).size,6);
 assert.equal(holdoutCases().length,144);
 const reserved=new Set(training.map(x=>x.input));
 const trainingGroups=new Set(training.map(x=>x.scenario_id));
 for(const row of records){
   assert.equal(row.split,"test");
   assert.ok(!reserved.has(row.input));
   assert.ok(!trainingGroups.has(row.scenario_id));
   assert.equal(row.provenance.live_verification,false);
   assert.equal(row.provenance.kind,"evaluation-only-independent-topology-v4");
   assert.ok(row.provenance.ce_as>=65120);
   assert.match(row.provenance.owner_prefix,/^172\./);
   assert.match(row.completion,/LIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING/);
 }
 assert.equal(SCENARIO_GROUPS.filter(g=>g.split==="test").length,6);
});

test("V4 ground-truth holds up under counterfactual path failure sets",()=>{
 for(let i=0;i<6;i++){
  assert.equal(labelOf(by("wan1-interconnect",i,"CE1_EXIT")),"NO_MODELED_PATH");
  assert.equal(labelOf(by("wan2-interconnect",i,"CE1_EXIT")),"ISP1");
  assert.equal(labelOf(by("ce1-wan2",i,"CE1_EXIT")),"DEVICE_FAILED");
  assert.equal(labelOf(by("ce2-wan1",i,"CE1_EXIT")),"NO_MODELED_PATH");
  assert.equal(labelOf(by("both-isps",i,"CE1_EXIT")),"NO_MODELED_PATH");
  assert.equal(labelOf(by("both-ces",i,"CE1_EXIT")),"DEVICE_FAILED");
  assert.equal(labelOf(by("both-isps",i,"CE1_PREFIX_INBOUND")),"NO_MODELED_PATH");
  assert.equal(labelOf(by("both-ces",i,"CLIENT_OUTBOUND")),"NO_MODELED_GATEWAY");
 }
});

test("V4 tests materially new ASNs and subnet ownership, no Cisco live claims",()=>{
 const testAS=new Set(records.map(x=>x.provenance.ce_as));
 assert.equal(testAS.size,6);
 assert.equal(new Set(records.map(x=>x.provenance.owner_prefix)).size,6);
 for(const row of records){
   assert.match(row.input,/No physical network telemetry/);
   assert.ok(row.input.includes("CE1-AS"+row.provenance.ce_as));
   assert.equal(row.provenance.source,"synthetic-bgp.js");
 }
});
