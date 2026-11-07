import test from "node:test";
import assert from "node:assert/strict";
import {composeCases, TRAIN_ONLY_COMPOSITIONS} from "./compositional_scenarios.mjs";
import {SCENARIO_GROUPS} from "./module_scenarios.mjs";

const rows=composeCases();
const map=new Map(rows.map(x=>[x.id,x]));
const by=(group,i,field)=>map.get("compose-"+group+"-"+i+"-"+field);
function kv(completion){
 return Object.fromEntries(completion.split("\n").map(x=>x.split("=",2)));
}

test("all compositions are original synthetic, reproducible and train-only",()=>{
 assert.equal(TRAIN_ONLY_COMPOSITIONS.length,16);
 assert.equal(rows.length,16*12*5);
 assert.deepEqual(rows,composeCases());
 assert.equal(new Set(rows.map(x=>x.id)).size,rows.length);
 assert.equal(new Set(rows.map(x=>x.scenario_id)).size,16);
 assert.ok(rows.every(x=>x.split==="train"));
 assert.ok(rows.every(x=>x.provenance.live_verification===false));
 assert.ok(rows.every(x=>x.provenance.direct_candidate_verified_with_engine));
 assert.ok(rows.every(x=>x.provenance.alternate_candidate_verified_with_engine));
 assert.ok(rows.every(x=>x.completion.includes("LIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING")));
});
test("composition failure sets are distinct from all previous validation/test sets",()=>{
 const signature=g=>[...g.devices].sort().join(",")+"|"+[...g.links].sort().join(",");
 const reserved=new Set(SCENARIO_GROUPS.map(signature));
 const groupSignatures=TRAIN_ONLY_COMPOSITIONS.map(signature);
 assert.equal(new Set(groupSignatures).size,16);
 assert.ok(groupSignatures.every(x=>!reserved.has(x)));
 assert.equal(composeCases({variants:1}).length,16*5);
 assert.throws(()=>composeCases({variants:0}),/Invalid/);
 assert.throws(()=>composeCases({variants:33}),/Invalid/);
});
test("causal route dependencies detect compounded unavailable paths",()=>{
 const bothWan=kv(by("wan1-wan2",0,"dependency").completion);
 assert.equal(bothWan.CE1_DIRECT_WAN1,"UNAVAILABLE");
 assert.equal(bothWan.CE1_ALTERNATE_WAN2,"UNAVAILABLE");
 assert.equal(bothWan.CE1_EXIT,"NO_MODELED_PATH");
 const notDirect=kv(by("wan1-isp1",0,"dependency").completion);
 assert.equal(notDirect.CE1_DIRECT_WAN1,"UNAVAILABLE");
 assert.equal(notDirect.CE1_ALTERNATE_WAN2,"AVAILABLE");
 assert.equal(notDirect.CE1_EXIT,"ISP2");
 const noCe=kv(by("ce1-isp1",0,"dependency").completion);
 assert.equal(noCe.CE1_DIRECT_WAN1,"UNAVAILABLE");
 assert.equal(noCe.CE1_ALTERNATE_WAN2,"UNAVAILABLE");
 assert.equal(noCe.CE1_EXIT,"DEVICE_FAILED");
 assert.equal(kv(by("ce1-isp1",0,"CE1_EXIT").completion).RESULT,"DEVICE_FAILED");
});
test("CE-owned route and shared client LAN can have different simulated outcomes",()=>{
 const caseA=by("wan1-wan2",0,"CE1_PREFIX_INBOUND");
 const caseB=by("wan1-wan2",0,"SHARED_LAN_INBOUND");
 assert.ok(caseA&&caseB);
 assert.equal(kv(caseA.completion).RESULT,"NO_MODELED_PATH");
 assert.equal(kv(caseB.completion).RESULT,"NO_MODELED_PATH");
 const interconnectIsolated=by("interconnect-isp1",0,"CE1_PREFIX_INBOUND");
 const shared=by("interconnect-isp1",0,"SHARED_LAN_INBOUND");
 assert.equal(kv(interconnectIsolated.completion).RESULT,"NO_MODELED_PATH");
 assert.equal(kv(shared.completion).RESULT,"PATH_AVAILABLE");
});
