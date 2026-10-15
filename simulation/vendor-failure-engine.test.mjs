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
