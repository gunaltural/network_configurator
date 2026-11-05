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
assert.equal(manifest.configurationCoverage.find(x=>x.deviceId==='fw').source,'user-or-saved','Attached configs are distinct from Design-generated CLI');
const emptyConfig=api.setConfiguration(initial,'a','  ');
assert.equal(api.analysisManifest(emptyConfig).configurationCoverage.find(x=>x.deviceId==='a').present,false,'Blank CLI must never count as configured');
assert.ok(api.structuralAssessment(emptyConfig).configurationMissing.includes('a'),'Structural report uses nonempty CLI coverage');
const withOperational=api.addShowTech(modified,'fw','show ip bgp summary\nEstablished','show-bgp.out',false);
assert.equal(api.analysisManifest(withOperational).configurationCoverage.find(x=>x.deviceId==='fw').realVerificationCaptures,1);
assert.equal(api.analysisManifest(withOperational).configurationCoverage.find(x=>x.deviceId==='fw').syntheticCaptures,0);
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
const fullShow=Array.from({length:250},(_,i)=>'route '+i).concat(['LAST-LINE-OMITTED']).join('\n');
const boundedShow=api.addShowTech(withCapture,'fw',fullShow,'captured-bgp.out');
const captureItems=api.analysisEvidenceBatches(boundedShow,['fw']).flat();
const scopeItem=captureItems.find(x=>x.id.startsWith('capture-coverage-'));
assert.ok(scopeItem,'Every real capture has an explicit provenance and coverage entry');
assert.match(scopeItem.text,/capture timestamp UNKNOWN/);
assert.match(scopeItem.text,/Total lines 251; included excerpt lines 220/);
assert.match(scopeItem.text,/omitted lines NOT evidence of absence/);
assert.ok(!JSON.stringify(captureItems).includes('LAST-LINE-OMITTED'),'Model must not receive unseen sections disguised as analyzed');

assert.throws(()=>api.analysisEvidenceBatches(api.setConfiguration(withCapture,'fw','x'.repeat(3100))),/too long/);

console.log('AI topology workspace contract tests passed');
