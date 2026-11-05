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
const catalog=api.technologyCatalog();
assert.deepEqual(Object.keys(catalog),['BASIC','BGP','OSPF','STP','VPC','EVPN','SDWAN','QOS']);
for(const [module,definition] of Object.entries(catalog)){
 const generated=api.buildTechnologyTopology(module,definition.platforms[0],definition.primaryCount,definition.secondaryCount);
 assert.equal(generated.sourceModule,module,'Generated topology technology matches selection');
 assert.equal(generated.nodes.length,definition.primaryCount+definition.secondaryCount,'Dynamic count matches requested nodes for '+module);
 assert.equal(generated.nodes.every(n=>n.vendor===definition.platforms[0]||n.vendor.startsWith('External')) ,true,'Selected platform is assigned to managed nodes');
 assert.equal(generated.configs.length,0,'Template must never manufacture real device configurations');
 assert.equal(generated.templateInfo.intentOnly,true,'Template must be marked as design intent');
 assert.equal(generated.nodes.every(n=>n.position&&Number.isFinite(n.position.x)),true,'Generated devices have editable positions');
 assert.deepEqual(api.validate(JSON.parse(JSON.stringify(generated))),generated,'Saved workspace roundtrip retains topology');
}
const dynamicBgp=api.buildTechnologyTopology('BGP','Cisco IOS-XE',3,2);
assert.equal(dynamicBgp.nodes.filter(n=>n.role==='CE router').length,3,'Add CE count');
assert.equal(dynamicBgp.links.length,6,'eBGP candidate links connect selected CE and ISP endpoints');
const dynamicStp=api.buildTechnologyTopology('STP','Arista EOS',2,4);
assert.equal(dynamicStp.nodes.length,6,'Add access switches');
assert.equal(dynamicStp.links.length,9,'Two core switches and four dual uplinks form STP planning graph');
const dynamicEvpn=api.buildTechnologyTopology('EVPN','Huawei_CE_SW',2,5);
assert.equal(dynamicEvpn.nodes.filter(n=>n.role==='leaf').length,5,'Add leaf switches');
assert.equal(dynamicEvpn.links.length,10,'Leaf/spine underlay candidate graph');
const dynamicVpc=api.buildTechnologyTopology('VPC','Arista EOS',2,3);
assert.equal(dynamicVpc.links.some(l=>l.kind==='peer-keepalive'&&l.logical),true,'vPC/MLAG template preserves control-plane keepalive context');
assert.throws(()=>api.buildTechnologyTopology('EVPN','FortiGate',2,2),/Platform is unavailable/,'Incompatible technology/vendor is rejected');
assert.throws(()=>api.buildTechnologyTopology('STP','Cisco NX-OS',3,2),/requires two/,'Unsupported core topology is rejected');
assert.throws(()=>api.buildTechnologyTopology('BGP','Cisco IOS-XE',0,2),/Invalid device counts/,'Zero CE is rejected');
assert.throws(()=>api.template('not-a-template'),/Unknown topology template/);
for(const kind of ['none','chain','ring','star','dual-hub','mesh']){
 const count=kind==='mesh'?8:6;
 const model=api.buildFreeTopology({deviceCount:count,layout:kind,vendor:'Arista EOS',role:'leaf'});
 const expected={none:0,chain:5,ring:6,star:5,'dual-hub':9,mesh:28}[kind];
 assert.equal(model.nodes.length,count,kind);
 assert.equal(model.links.length,expected,kind);
 assert.ok(model.nodes.every(n=>n.vendor==='Arista EOS'&&n.role==='leaf'));
 assert.equal(model.configs.length,0,'Never fabricate generated configurations');
}
const independent=api.buildFreeTopology({deviceCount:4,layout:'dual-hub',vendor:'FortiGate',role:'edge'});
assert.equal(independent.links.length,5);
assert.equal(api.updateDevice(independent,'node-1',{vendor:'Cisco NX-OS'}).nodes[0].vendor,'Cisco NX-OS');
assert.equal(independent.nodes[0].vendor,'FortiGate','Vendor changes do not mutate original');
assert.equal(api.buildFreeTopology({deviceCount:1,layout:'ring'}).links.length,0);
assert.equal(api.buildFreeTopology({deviceCount:2,layout:'ring'}).links.length,1);
for(const count of [0,33,4.5,'invalid'])assert.throws(()=>api.buildFreeTopology({deviceCount:count}),/Device count/);
assert.throws(()=>api.buildFreeTopology({deviceCount:17,layout:'mesh'}),/16 devices/);
assert.throws(()=>api.buildFreeTopology({deviceCount:4,layout:'vpc'}),/Unknown topology pattern/);
const star=api.structuralAssessment(api.buildFreeTopology({deviceCount:5,layout:'star'}));
assert.deepEqual(star.potentialTransitDependencies,['node-1']);
assert.equal(star.potentialSinglePathLinks.length,4);
assert.equal(star.components.length,1);
const cycle=api.structuralAssessment(api.buildFreeTopology({deviceCount:5,layout:'ring'}));
assert.deepEqual(cycle.potentialTransitDependencies,[]);
assert.deepEqual(cycle.potentialSinglePathLinks,[]);
const dual=api.structuralAssessment(api.buildFreeTopology({deviceCount:5,layout:'dual-hub'}));
assert.deepEqual(dual.potentialTransitDependencies,[]);
assert.deepEqual(dual.potentialSinglePathLinks,[]);
const noLinks=api.structuralAssessment(api.buildFreeTopology({deviceCount:4,layout:'none'}));
assert.equal(noLinks.components.length,4);
assert.equal(noLinks.isolatedDevices.length,4);
assert.equal(noLinks.configurationMissing.length,4);
const oneConfig=api.structuralAssessment(api.setConfiguration(independent,'node-1','hostname node-1'));
assert.equal(oneConfig.configurationMissing.length,3);
assert.ok(JSON.stringify(star).includes('not-operational'));
const parallel=api.addLink(api.buildFreeTopology({deviceCount:2,layout:'chain'}),{id:'redundant-path',a:'node-1',b:'node-2',kind:'physical'});
assert.deepEqual(api.structuralAssessment(parallel).potentialSinglePathLinks,[],
 'Two parallel modeled physical paths must not be mistaken for a single bridge');
const onePhysicalOneLogical=api.addLink(api.buildFreeTopology({deviceCount:2,layout:'chain'}),{id:'logical-peer',a:'node-1',b:'node-2',kind:'control',logical:true});
assert.equal(api.structuralAssessment(onePhysicalOneLogical).potentialSinglePathLinks.length,1,
 'Logical adjacency is not a second physical cable');
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
const bothConfigured=api.setConfiguration(withCapture,'a','hostname N9K-A\\nfeature vpc');
const scopedToCore=api.analysisEvidenceBatches(bothConfigured,['a']).flat();
const scopedEvidence=JSON.stringify(scopedToCore);
assert.ok(scopedEvidence.includes('hostname N9K-A'),'Selected core configuration is included');
assert.ok(!scopedEvidence.includes('hostname FGT-1'),'Unselected firewall configuration is excluded');
assert.ok(!scopedEvidence.includes('Link uplink'),'Links to unselected endpoints do not leak into scope');
assert.ok(scopedEvidence.includes('Selected devices: a'),'Selected device IDs appear explicitly');
assert.throws(()=>api.analysisEvidenceBatches(bothConfigured,[]),/Select one or more valid devices/);
assert.throws(()=>api.analysisEvidenceBatches(bothConfigured,['missing']),/Select one or more valid devices/);
assert.equal(withCapture.configs.some(c=>c.deviceId==='a'),false,'Original workspace is not changed by adding test configuration to its copy');

const big=Array.from({length:320},(_,i)=>'interface Ethernet'+i+'\n description uplink-'+i).join('\n');
const extended=api.setConfiguration(withCapture,'fw',big);
const many=api.analysisEvidenceBatches(extended).flat();
assert.ok(many.filter(x=>x.id.startsWith('config-')).length>1,'Split long configurations without truncating');
assert.ok(many.every(x=>x.text.length<=3000),'Every evidence item fits API limit');
assert.ok(api.analysisEvidenceBatches(extended).every(batch=>batch.length<=24),'Every batch stays bounded');
assert.throws(()=>api.analysisEvidenceBatches(api.setConfiguration(withCapture,'fw','x'.repeat(3100))),/too long/);

console.log('AI topology workspace contract tests passed');
