'use strict';
const assert=require('node:assert/strict');
require('./stp-analysis-v1.js');
const stp=global.NetworkSTPV1;
const nodes=[
 {id:'core1',hostname:'CORE-1',vendor:'Cisco NX-OS'},
 {id:'core2',hostname:'CORE-2',vendor:'Cisco NX-OS'},
 {id:'access',hostname:'ACCESS-1',vendor:'Cisco IOS-XE'}
];
const make=(a,b,c='spanning-tree mode mst\nspanning-tree mst 1 priority 0')=>({
 nodes,configs:[{deviceId:'core1',text:a},{deviceId:'core2',text:b},{deviceId:'access',text:c}]
});
const c1='spanning-tree mode rapid-pvst\nspanning-tree vlan 10,20 priority 4096\ninterface Ethernet1/1\n spanning-tree guard root';
const c2='spanning-tree mode rapid-pvst\nspanning-tree vlan 10 priority 4096\nspanning-tree vlan 20 priority 8192';
const parsed=stp.parse(nodes[0],c1);
assert.equal(parsed.mode,'rapid-pvst');
assert.deepEqual([...parsed.priorities.keys()],['VLAN 10','VLAN 20']);
assert.equal(parsed.interfaces[0].iface,'Ethernet1/1');
assert.deepEqual(stp.vlans('10-12,20'),[10,11,12,20]);
const baseline=stp.assess(make(c1,c2),['core1','core2']);
assert.deepEqual(baseline.devices,['CORE-1','CORE-2']);
assert.ok(baseline.findings.some(f=>f.code==='EQUAL_BRIDGE_PRIORITY'&&f.refs.some(s=>s.includes('CORE-1 config L2'))));
assert.ok(baseline.findings.some(f=>f.code==='BRIDGE_PRIORITY_COMPARISON'));
assert.ok(!JSON.stringify(baseline).includes('ACCESS-1'),'Unselected device cannot leak into STP findings');
assert.match(stp.format(baseline),/NOT AI diagnosis/);
assert.match(stp.format(baseline),/show spanning-tree/);
const mismatch=stp.assess(make(c1,'spanning-tree mode mst\nspanning-tree mst 1 priority 4096'),['core1','core2']);
assert.ok(mismatch.findings.some(f=>f.code==='STP_MODE_MISMATCH'));
const regionA='spanning-tree mode mst\nspanning-tree mst configuration\n name FABRIC-A\n revision 1\n instance 1 vlan 10-20\n!';
const regionB='spanning-tree mode mst\nspanning-tree mst configuration\n name FABRIC-B\n revision 2\n instance 1 vlan 10-30\n!';
const mst=stp.assess(make(regionA,regionB),['core1','core2']);
for(const code of ['MST_NAME_MISMATCH','MST_REVISION_MISMATCH','MST_VLAN_MAP_MISMATCH'])
 assert.ok(mst.findings.some(f=>f.code===code),code);
const root=stp.assess(make('spanning-tree mode rapid-pvst\nspanning-tree vlan 10 root primary','spanning-tree mode rapid-pvst\nspanning-tree vlan 10 root primary'),['core1','core2']);
assert.ok(root.findings.some(f=>f.code==='ROOT_MACRO_OVERLAP'));
const invalid=stp.assess(make('spanning-tree vlan 10 priority 4200',c2),['core1']);
assert.ok(invalid.findings.some(f=>f.code==='INVALID_BRIDGE_PRIORITY'));
assert.ok(invalid.missing.some(x=>x.includes('2+ nodes')));
const missing=stp.assess({nodes,configs:[{deviceId:'core1',text:c1}]},['core1','core2']);
assert.ok(missing.missing.some(x=>x.includes('CORE-2')));
assert.ok(!missing.findings.some(f=>f.code==='STP_MODE_MISMATCH'));
assert.ok(stp.evidence(baseline).every(x=>typeof x==='string'));
console.log('STP V1: device scope, source lines, VLAN/RSTP/MST/root comparisons and missing evidence passed');
