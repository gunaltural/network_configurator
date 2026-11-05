'use strict';
const assert=require('node:assert/strict');
require('./network-evidence-correlation-v1.js');
const C=global.NetworkEvidenceCorrelationV1;
const workspace={schema:'ai-topology-workspace-v1',nodes:[
 {id:'a',hostname:'CE-A',vendor:'Cisco IOS-XE'},
 {id:'b',hostname:'CE-B',vendor:'Arista EOS'},
 {id:'f',hostname:'FGT-A',vendor:'FortiGate 7.4.8'},
 {id:'n',hostname:'N9K-A',vendor:'Cisco NX-OS'}
],links:[],configs:[
 {deviceId:'a',source:'design',text:'hostname CE-A\nrouter bgp 65001\n neighbor 10.0.0.2 remote-as 65200\nip address 10.0.0.1/32'},
 {deviceId:'b',source:'design',text:'hostname CE-B\nrouter bgp 65100\nip address 10.0.0.2/32'},
 {deviceId:'f',source:'design',text:'config router bgp\n set as 65010\nend\nset psksecret VerySensitiveKey'},
 {deviceId:'n',source:'design',text:'feature vpc\nvpc domain 100'}
],showTech:[
 {deviceId:'a',filename:'show-bgp-summary.txt',text:'CE-A#show ip bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n10.0.0.2 4 65100 0 0 1 0 0 never Idle'},
 {deviceId:'b',filename:'show-bgp-summary.txt',text:'CE-B#show ip bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n10.0.0.1 4 65001 88 72 19 0 0 1d03h 50'},
 {deviceId:'f',filename:'bgp.out',text:'FGT-A# get router info bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n198.51.100.2 4 65002 0 0 1 0 0 never Active'},
 {deviceId:'f',filename:'sdwan.out',text:'FGT-A# diagnose sys sdwan health-check\nHealth Check(ping):\nSeq(1 R150): state(dead), packet-loss(100.000%)'},
 {deviceId:'n',filename:'vpc.out',text:'N9K-A#show vpc\nPeer status : peer adjacency formed ok\nPeer Gateway : Enabled'},
 {deviceId:'n',filename:'evpn.out',text:'N9K-A#show bgp l2vpn evpn\nRoute Type: 2\nRoute Type: 5'},
 {deviceId:'a',filename:'ospf.out',text:'CE-A#show ip ospf neighbor\nNeighbor ID Pri State Dead Time Address Interface\n2.2.2.2 1 FULL/DR 00:00:35 10.10.10.2 Gi0/0'}
]};
const result=C.assess({workspace,deviceIds:['a','b','f','n'],modules:['BGP','OSPF','EVPN','VPC','SDWAN']});
assert.equal(result.coverage.configured,4);
assert.equal(result.coverage.realCaptures,7);
assert.equal(result.coverage.syntheticCaptures,0);
assert.equal(result.scope.modules.length,5);
const f=(tech,fragment)=>result.findings.find(x=>x.technology===tech&&x.observed.includes(fragment));
assert.equal(f('BGP','10.0.0.2 reports Idle').status,'REVIEW');
assert.equal(f('BGP','10.0.0.1 reports Established').status,'OBSERVED');
assert.ok(result.findings.some(x=>x.technology==='BGP'&&x.confidence==='CONFIG_IP_AND_AS_EXPLICIT'));
assert.ok(result.findings.some(x=>x.confidence==='CROSS_DOMAIN_HYPOTHESIS_NOT_CAUSAL'));
assert.equal(f('OSPF','FULL/DR').status,'OBSERVED');
assert.equal(f('EVPN','2, 5').status,'OBSERVED');
assert.equal(f('VPC','Peer Gateway: Enabled').status,'OBSERVED');
assert.equal(f('SDWAN','state(dead)').status,'REVIEW');
assert.ok(f('SDWAN','state(dead)').explanation.includes('not the same as SLA compliance'));
assert.equal(result.findings.some(x=>/peer-gateway.*disabled|missing peer-gateway/i.test(x.title+' '+x.explanation)),false);
for(const finding of result.findings){
 assert.ok(['OBSERVED','REVIEW','CONFLICT'].includes(finding.status),'No invented compliance PASS or FAIL');
 assert.ok(finding.evidence.length>0,'Every specific finding has source evidence');
 for(const proof of finding.evidence){
  assert.ok(proof.device&&proof.source&&proof.line>0,'Device/command/line evidence present');
  assert.ok(!proof.excerpt.includes('VerySensitiveKey'));
 }
}
const onlyConfig={...workspace,showTech:[]};
const noShow=C.assess({workspace:onlyConfig,deviceIds:['a','b','f','n'],modules:['BGP','OSPF','EVPN','VPC','SDWAN']});
assert.equal(noShow.counts.OBSERVED,0);
assert.equal(noShow.findings.filter(x=>x.confidence==='OPERATIONAL_SINGLE_DEVICE').length,0);
assert.ok(noShow.findings.every(x=>x.confidence==='CONFIG_IP_AND_AS_EXPLICIT'),'Only explicit cross-device config discrepancy is possible');
const onlyLab={...workspace,showTech:[{deviceId:'a',synthetic:true,filename:'synthetic',text:workspace.showTech[0].text}]};
assert.equal(C.assess({workspace:onlyLab,deviceIds:['a'],modules:['BGP']}).findings.length,0,'Synthetic lab is not real operational evidence');
const falsePositive={...workspace,showTech:[{deviceId:'a',filename:'notes.txt',text:'Neighbor 10.0.0.2 was Idle yesterday, ignore this paragraph'}]};
assert.equal(C.assess({workspace:falsePositive,deviceIds:['a'],modules:['BGP']}).findings.length,0,'Arbitrary commentary is not parsed as show output');
const conflict={...workspace,showTech:workspace.showTech.concat([{
 deviceId:'a',filename:'show-bgp-later.txt',text:'CE-A#show ip bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n10.0.0.2 4 65100 88 60 10 0 0 1d01h 14'
}])};
assert.equal(C.assess({workspace:conflict,deviceIds:['a'],modules:['BGP']}).findings[0].status,'CONFLICT');
assert.equal(C.assess({workspace:conflict,deviceIds:['a'],modules:['BGP']}).findings[0].confidence,'CAPTURE_TIMING_UNVERIFIED');
assert.throws(()=>C.assess({workspace,deviceIds:['missing'],modules:['BGP']}),/valid device/);
console.log('Cross-domain vendor-scoped evidence contracts, counterevidence and no-false-PASS passed');
