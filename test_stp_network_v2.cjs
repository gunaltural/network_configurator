'use strict';
const assert=require('node:assert/strict');
require('./stp-engineering-v2.js');
require('./stp-network-analysis-v2.js');
const E=global.NetworkSTPEngineeringV2,N=global.NetworkSTPNetworkV2;
const config=(host,prioA,prioB,vlanA,vlanB,port,guard='root')=>
 'hostname '+host+'\nvtp mode off\nvlan '+vlanA+'\nvlan '+vlanB+
 '\nspanning-tree mode rapid-pvst\nspanning-tree vlan '+vlanA+' priority '+prioA+
 '\nspanning-tree vlan '+vlanB+' priority '+prioB+
 '\ninterface '+port+'\n switchport mode trunk\n switchport trunk native vlan 998\n switchport trunk allowed vlan '+vlanA+','+vlanB+
 '\n switchport nonegotiate\n spanning-tree guard '+guard+'\n udld port aggressive';
const core01=[
'hostname CORE-01','vtp mode off','vlan 10','vlan 20','vlan 999','spanning-tree mode rapid-pvst',
'spanning-tree vlan 10,20 priority 4096',
...['TenGigabitEthernet1/0/48','TenGigabitEthernet1/0/1','TenGigabitEthernet1/0/2','TenGigabitEthernet1/0/3','TenGigabitEthernet1/0/4']
 .flatMap((p,i)=>['interface '+p,' switchport mode trunk',' switchport trunk native vlan 999',
 ' switchport trunk allowed vlan 10,20',' switchport nonegotiate',
 ' spanning-tree guard '+(i===0?'loop':'root'),' udld port aggressive'])
].join('\n');
const node=(id,host,role)=>({id,hostname:host,vendor:'Cisco IOS-XE',role});
const userCase={nodes:[node('a','CORE-01','upper')],links:[],configs:[{deviceId:'a',text:core01}]};
const real=E.assess(userCase,['a']);
assert.equal(real.devices[0].summary.trunkCount,5);
assert.equal(real.devices[0].summary.rootGuardCount,4);
assert.equal(real.devices[0].summary.loopGuardCount,1);
assert.equal(real.devices[0].summary.udldCount,5);
assert.deepEqual(real.devices[0].summary.vlans,[10,20,999]);
assert.match(real.devices[0].summary.rootPriority,/4096/);
assert.match(real.devices[0].controls.find(x=>x.id==='STP-008').analysis,/NOT a fault/);
assert.match(real.devices[0].controls.find(x=>x.id==='STP-009').analysis,/NOT a fault/);
assert.ok(real.devices[0].ports.some(x=>x.name==='TenGigabitEthernet1/0/48'&&x.guard==='loop'));
assert.ok(!real.findings.some(x=>x.id==='STP-008'||x.id==='STP-009'),'No false Core portfast/bpdu findings');
const vlanA=137,vlanB=583;
const nodes=[node('c1','C-ALPHA','upper'),node('c2','C-BETA','upper'),node('a1','ACCESS-OMEGA','lower')];
const configs=[
 {deviceId:'c1',text:config('C-ALPHA',4096,8192,vlanA,vlanB,'Ethernet1/1','root')},
 {deviceId:'c2',text:config('C-BETA',8192,4096,vlanA,vlanB,'Ethernet1/1','loop')},
 {deviceId:'a1',text:'hostname ACCESS-OMEGA\nspanning-tree mode rapid-pvst\nvlan '+vlanA+'\nvlan '+vlanB+
  '\ninterface Ethernet1/1\n switchport mode trunk\n switchport trunk native vlan 998\n switchport trunk allowed vlan '+vlanA+','+vlanB+
  '\ninterface Ethernet1/2\n switchport mode trunk\n switchport trunk native vlan 998\n switchport trunk allowed vlan '+vlanA+','+vlanB}
];
const graph={nodes,configs,links:[
 {id:'c1-access',a:'c1',b:'a1',aPort:'Ethernet1/1',bPort:'Ethernet1/1'},
 {id:'c2-access',a:'c2',b:'a1',aPort:'Ethernet1/1',bPort:'Ethernet1/2'}
]};
const n=N.analyze(graph,nodes.map(x=>x.id));
assert.equal(n.deviceCount,3);
assert.equal(n.capturedCount,3);
assert.equal(n.components.length,1);
assert.equal(n.links.length,2);
assert.ok(n.links.every(x=>x.status==='CONFIG_ENDPOINTS_MAPPED'));
const decision=(v)=>n.vlans.find(x=>x.vlan===v);
assert.equal(decision(vlanA).candidate,'C-ALPHA');
assert.equal(decision(vlanB).candidate,'C-BETA');
assert.equal(decision(vlanA).status,'RELATIVE_PREFERENCE_INCOMPLETE');
assert.ok(n.resilience.some(x=>x.event==='DEVICE_REMOVED'&&x.device==='ACCESS-OMEGA'),
 'Graph-only articulation alerts on access hub without claiming outage');
// Peer mode and native VLAN mismatches are derived from matching endpoints, not device-name heuristics.
const broken=JSON.parse(JSON.stringify(graph));
broken.configs[2].text=broken.configs[2].text.replace('switchport trunk native vlan 998','switchport trunk native vlan 901');
const diff=N.analyze(broken,nodes.map(x=>x.id));
assert.ok(diff.findings.some(x=>x.code==='TRUNK_NATIVE_MISMATCH'));
const noMapping=JSON.parse(JSON.stringify(graph));for(const l of noMapping.links){delete l.aPort;delete l.bPort;}
assert.ok(N.analyze(noMapping,nodes.map(x=>x.id)).links.every(x=>x.status==='DESIGN_LINK_ONLY'));
const n10=10,large={nodes:[],configs:[],links:[]};
for(let i=0;i<n10;i++){
 const id='node-'+i,host='SW-'+(i+11);
 large.nodes.push(node(id,host,i<2?'upper':'lower'));
 large.configs.push({deviceId:id,text:config(host,4096+i*4096,8192+i*4096,71,122,'Eth1/1',i%2?'loop':'root')});
 if(i>0)large.links.push({id:'link-'+i,a:'node-'+(i-1),b:id,aPort:'Eth1/1',bPort:'Eth1/1'});
}
const full=N.analyze(large,large.nodes.map(x=>x.id));
assert.equal(full.deviceCount,n10);
assert.equal(full.capturedCount,n10);
assert.equal(full.components.length,1);
assert.equal(full.links.length,n10-1);
assert.ok(full.vlans.some(x=>x.vlan===71));
assert.ok(!full.vlans.some(x=>x.vlan===10||x.vlan===20));
const partial=N.analyze(large,['node-3','node-4','node-5']);
assert.equal(partial.deviceCount,3);
assert.deepEqual(partial.components,[['SW-14','SW-15','SW-16']]);
const missing=JSON.parse(JSON.stringify(large));missing.configs=missing.configs.filter(c=>c.deviceId!=='node-8');
const incomplete=N.analyze(missing,large.nodes.map(x=>x.id));
assert.equal(incomplete.capturedCount,n10-1);
console.log('STP network V2: real config, N-device VLAN root, topology adjacency, guard role and scenario regression PASS');
