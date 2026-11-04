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

for(const name of ['blank','vpc','bgp','evpn']){
 const created=api.template(name);
 assert.ok(created.nodes.length>=0,'valid template '+name);
 if(name!=='blank')assert.ok(created.nodes.length>=2);
 assert.equal(created.schema,'ai-topology-workspace-v1');
}
assert.throws(()=>api.template('not-a-template'),/Unknown topology template/);
assert.throws(()=>api.analysisEvidenceBatches(api.blank()),/at least one device/);
const edited=api.updateDevice(modified,'fw',{hostname:'FGT-1',vendor:'FortiGate',role:'hub'});
assert.equal(edited.nodes.find(x=>x.id==='fw').hostname,'FGT-1');
assert.equal(modified.nodes.find(x=>x.id==='fw').hostname,'Firewall','Device edits must not mutate source');
const moved=api.updateLink(edited,'uplink',{b:'b',bPort:'Eth1/48'});
assert.equal(moved.links.find(l=>l.id==='uplink').b,'b');
assert.equal(edited.links.find(l=>l.id==='uplink').b,'fw','Link updates must not mutate source');
assert.throws(()=>api.updateLink(edited,'uplink',{b:'unknown'}),/Invalid link/);
assert.equal(api.removeLink(moved,'uplink').links.some(x=>x.id==='uplink'),false);
const notes='hostname FGT-1\nsnmp-server community DemoSecret RO\nroute-map EXPORT permit 10\n set community 65000:1 additive\nusername admin secret HiddenPass\nshow ip bgp summary';
const withCapture=api.setConfiguration(modified,'fw',notes);
const batches=api.analysisEvidenceBatches(withCapture),evidence=batches.flat();
assert.ok(evidence.some(x=>x.id.startsWith('topology-')),'Topology facts are included');
assert.ok(evidence.some(x=>x.id.startsWith('config-')),'Device configuration is included');
const sent=JSON.stringify(evidence);
assert.ok(!sent.includes('DemoSecret')&&!sent.includes('HiddenPass'),'Mask credentials in review payload');
assert.ok(sent.includes('65000:1 additive'),'Routing community must remain observable');
assert.ok(sent.includes('L4:'),'Preserve original line number references');
assert.ok(!JSON.stringify(api.analysisManifest(withCapture)).includes('DemoSecret'),'Manifest remains configuration-free');
const big=Array.from({length:320},(_,i)=>'interface Ethernet'+i+'\n description uplink-'+i).join('\n');
const extended=api.setConfiguration(withCapture,'fw',big);
const many=api.analysisEvidenceBatches(extended).flat();
assert.ok(many.filter(x=>x.id.startsWith('config-')).length>1,'Split long configurations without truncating');
assert.ok(many.every(x=>x.text.length<=3000),'Every evidence item fits API limit');
assert.ok(api.analysisEvidenceBatches(extended).every(batch=>batch.length<=24),'Every batch stays bounded');
assert.throws(()=>api.analysisEvidenceBatches(api.setConfiguration(withCapture,'fw','x'.repeat(3100))),/too long/);

console.log('AI topology workspace contract tests passed');
