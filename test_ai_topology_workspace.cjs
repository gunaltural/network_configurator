/* Isolated AI topology workspace contract tests. No DOM, network or production project writes. */
'use strict';
const assert=require('node:assert/strict');
require('./ai-topology-workspace.js');
const api=global.NetworkAITopology;
assert.ok(api,'Topology model must be exported');
const design={
 source:{module:'VPC'},vendor:'Cisco NX-OS',
 devices:[{id:'a',hostname:'N9K-A',tier:'upper'},{id:'b',hostname:'N9K-B',tier:'upper'}],
 links:[{id:'peer',a:'a',b:'b',kind:'peer-link',upperPort:'Eth1/1',lowerPort:'Eth1/1'}],
 specialLinks:[{id:'keepalive',a:'a',b:'b',kind:'keepalive',logical:true}]
};
const initial=api.fromDesign(design);
assert.equal(initial.nodes.length,2);
assert.equal(initial.links.length,2);
assert.equal(initial.links.find(l=>l.id==='keepalive').logical,true);
assert.equal(initial.links.find(l=>l.id==='peer').aPort,'Eth1/1');
assert.equal(design.devices[0].source,undefined,'Design source must not be mutated');
let modified=api.addDevice(initial,{id:'fw',hostname:'Firewall',vendor:'Fortinet',role:'security'});
modified=api.addLink(modified,{id:'uplink',a:'a',b:'fw',aPort:'Eth1/10',bPort:'port1'});
modified=api.setConfiguration(modified,'fw','config system interface\nedit port1\nnext\nend');
assert.equal(modified.nodes.length,3);
assert.equal(modified.configs.length,1);
const manifest=api.analysisManifest(modified);
assert.equal(manifest.configurationCoverage.find(x=>x.deviceId==='fw').present,true);
assert.equal(JSON.stringify(manifest).includes('config system interface'),false,'Raw configs must not leak to manifest');
assert.equal(initial.nodes.length,2,'Edits must not mutate original');
assert.throws(()=>api.addDevice(modified,{id:'a'}),/Duplicate/);
assert.throws(()=>api.addLink(modified,{id:'broken',a:'a',b:'unknown'}),/Invalid/);
assert.throws(()=>api.setConfiguration(modified,'missing','text'),/Unknown/);
const removed=api.removeDevice(modified,'fw');
assert.equal(removed.nodes.length,2);
assert.equal(removed.links.length,2);
assert.equal(removed.configs.length,0);
console.log('AI topology workspace contract tests passed');
