'use strict';
const assert=require('node:assert/strict');
require('./stp-knowledge-v1.js');
const api=global.NetworkSTPKnowledgeV1;
const nodes=[{id:'a',hostname:'CORE-1',vendor:'Cisco IOS-XE'},{id:'b',hostname:'CORE-2',vendor:'Cisco IOS-XE'},{id:'c',hostname:'ACCESS-1',vendor:'Cisco IOS-XE'}];
const base={nodes,links:[{id:'core',a:'a',b:'b',aPort:'Port-channel10',bPort:'Port-channel10'}],configs:[
 {deviceId:'a',text:'vtp mode transparent\nvtp version 3\ninterface Port-channel10\n switchport mode trunk\n switchport trunk native vlan 1\n switchport trunk allowed vlan 1-4094\n switchport nonegotiate\n!\nspanning-tree mode rapid-pvst'},
 {deviceId:'b',text:'vtp mode server\nvtp version 3\ninterface Port-channel10\n switchport mode trunk\n switchport trunk native vlan 999\n switchport trunk allowed vlan 10,20'},
 {deviceId:'c',text:'vtp mode off\ninterface Ethernet1/1\n switchport mode access'}
]};
assert.equal(api.parameters.length,14,'Catalog covers initial 14 STP/L2 analysis parameter families');
assert.ok(api.parameters.some(p=>p.id==='vtpMode'&&p.design==='campusVtp'));
assert.ok(api.parameters.some(p=>p.id==='nativeVlan'&&p.design==='campusNativeVlan'));
assert.ok(api.parameters.some(p=>p.id==='bridgePriority'&&p.design==='stpRootPri'));
const report=api.review(base,['a','b']);
assert.deepEqual(report.devices,['CORE-1','CORE-2']);
assert.equal(report.coverage.length,api.parameters.length);
assert.ok(report.entries.some(x=>x.parameter==='vtpMode'&&x.title.includes('transparent')&&x.impact.includes('forward')));
assert.ok(report.entries.some(x=>x.parameter==='vtpVersion'&&x.impact.includes('primary-server')));
assert.ok(report.entries.some(x=>x.parameter==='nativeVlan'&&x.title.includes('native VLAN 1')));
const mismatch=report.entries.find(x=>x.title.includes('native VLAN mismatch'));
assert.ok(mismatch,'Explicit peer port mapping is required to flag mismatch');
assert.deepEqual(mismatch.evidence,['CORE-1 config L5 (Port-channel10)','CORE-2 config L5 (Port-channel10)']);
assert.ok(!JSON.stringify(report).includes('ACCESS-1'),'unselected device stays excluded');
assert.ok(report.entries.every(x=>x.source&&x.source.url.startsWith('https://www.cisco.com/')),'Each observation links official source');
assert.ok(api.format(report).includes('PARAMETER COVERAGE'));
assert.ok(api.format(report).includes('NOT live RAG'));
assert.ok(api.context(report).join(' ').includes('curated Cisco documentation'));
const noLink=api.review({...base,links:[]},['a','b']);
assert.ok(!noLink.entries.some(x=>x.title.includes('native VLAN mismatch')),'No cross-device port claims without mapped topology link');
const parsed=api.parse(nodes[0],'vtp password secret-without-reveal\nvtp mode client');
assert.equal(parsed.observed.vtpPassword[0].value,'<configured — value withheld>');
assert.ok(!JSON.stringify(parsed).includes('secret-without-reveal'),'Do not return plaintext secrets even from parser');
const noConfig=api.review({...base,configs:[]},['a','b']);
assert.ok(noConfig.entries.every(x=>x.severity==='missing'),'missing capture is not claimed to be a disabled feature');
assert.throws(()=>api.review(base,[]),/Choose at least one/);
console.log('STP Knowledge V1: coverage, VTP mode/version, native VLAN and mapped mismatch, source refs, scope, missing data, redaction PASS');
