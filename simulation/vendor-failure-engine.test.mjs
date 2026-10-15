import test from "node:test";
import assert from "node:assert/strict";
import {changeFailures,analyzeMlagFailure,analyzeBgpConnectivity,vendorProfiles} from "./vendor-failure-engine.mjs";
test("multi-select partial restore clears restored boxes",()=>{
 let s=changeFailures({selectedDevices:["A","B"]},"fail","devices",["A","B"]);
 s=changeFailures(s,"restore","devices",["A"]);
 assert.deepEqual(s.devices,["B"]);assert.deepEqual(s.selectedDevices,["B"]);
 assert.deepEqual(changeFailures(s,"reset","links").devices,[]);
});
test("all supported vendors have distinct modeled dual-link scenarios",()=>{
 for(const vendor of Object.keys(vendorProfiles)){
  const r=analyzeMlagFailure({vendor,failed:["peerLink","keepalive"]});
  assert.equal(r.findings[0].code,"DUAL_LINK_FAILURE");
  assert.equal(r.findings[0].severity,"critical");
 }
 assert.notEqual(vendorProfiles["Cisco NX-OS"].peer,vendorProfiles["Arista EOS"].peer);
});
test("simultaneous device and link failure cuts physical graph",()=>{
 const r=analyzeBgpConnectivity({nodes:["A","B","C"].map(id=>({id})),
  links:[{id:"ab",from:"A",to:"B"},{id:"ac",from:"A",to:"C"}],
  source:"A",failures:{devices:["B"],links:["ac"]}});
 assert.deepEqual(r.reachable,["A"]);assert.deepEqual(r.unreachable,["B","C"]);
});
test("does not claim actual BGP forwarding behavior",()=>{
 const r=analyzeBgpConnectivity({nodes:[{id:"A"}],source:"A"});
 assert.match(r.limitation,/not a BGP best-path/);
});

test("one failed peer link member only degrades redundancy",()=>{
 const r=analyzeMlagFailure({vendor:"Cisco NX-OS",failed:["peerLink1"]});
 assert.ok(r.findings.some(f=>f.code==="PEER_LINK_REDUNDANCY_LOST"));
 assert.ok(!r.findings.some(f=>f.code==="PEER_LINK_FAILURE"));
});
test("node failure plus both liveness links does not assert dual active",()=>{
 const r=analyzeMlagFailure({vendor:"Arista EOS",failed:["nodeA","peerLink","keepalive"]});
 assert.ok(!r.findings.some(f=>f.code==="DUAL_LINK_FAILURE"));
 assert.ok(r.findings.some(f=>f.code==="LINK_FAILED_WITH_NODE_DOWN"));
});
test("two failed physical peer members alone require derived logical failure",()=>{
 const r=analyzeMlagFailure({vendor:"Huawei CloudEngine",failed:["peerLink1","peerLink2","peerLink"]});
 assert.ok(r.findings.some(f=>f.code==="PEER_LINK_FAILURE"));
});
