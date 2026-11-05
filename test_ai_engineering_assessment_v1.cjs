'use strict';
const assert=require('node:assert/strict');
require('./network-evidence-correlation-v1.js');
require('./ai-engineering-assessment-v1.js');
const C=global.NetworkEvidenceCorrelationV1,M=global.NetworkAIEngineeringAssessmentV1;
const nodes=[
 {id:'ios',hostname:'CE-01',vendor:'Cisco IOS-XE'},
 {id:'nx',hostname:'N9K-01',vendor:'Cisco NX-OS'},
 {id:'eos',hostname:'EOS-01',vendor:'Arista EOS'},
 {id:'hw',hostname:'CE6865-01',vendor:'Huawei CloudEngine VRP8'},
 {id:'fgt',hostname:'FGT-01',vendor:'FortiGate FortiOS 7.4.8'}
];
const configs=[
 {deviceId:'ios',source:'design',text:'hostname CE-01\nrouter bgp 65001\nneighbor 192.0.2.2 remote-as 65002'},
 {deviceId:'nx',source:'design',text:'feature vpc\nvpc domain 100'},
 {deviceId:'eos',source:'user',text:'router bgp 65100\nneighbor 192.0.2.4 remote-as 65002'},
 {deviceId:'hw',source:'user',text:'sysname CE6865-01\nbgp 64512\npeer 192.0.2.2 as-number 64513'},
 {deviceId:'fgt',source:'user',text:'config router bgp\nset as 65010\nend'}
];
const real=[
 {deviceId:'ios',filename:'ios-bgp',text:'CE-01#show ip bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n192.0.2.2 4 65002 0 0 1 0 0 never Active'},
 {deviceId:'nx',filename:'nx-vpc',text:'N9K-01#show vpc\nPeer status : peer adjacency formed ok\nPeer Gateway : Enabled'},
 {deviceId:'nx',filename:'nx-evpn',text:'N9K-01#show bgp l2vpn evpn\nRoute Type: 2'},
 {deviceId:'eos',filename:'eos-bgp',text:'EOS-01#show ip bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n192.0.2.4 4 65002 10 10 1 0 0 2h12m 5'},
 {deviceId:'hw',filename:'hw-bgp',text:'<CE6865-01> display bgp peer\nPeer V AS MsgRcvd MsgSent OutQ Up/Down State PrefRcv\n192.0.2.2 4 64513 88 72 0 12h10m Connect 0'},
 {deviceId:'fgt',filename:'forti-sdwan',text:'FGT-01# diagnose sys sdwan health-check\nHealth Check(ping):\nSeq(1 R150): state(dead), packet-loss(100.000%)'}
];
const workspace={nodes,configs,showTech:real,links:[]};
const technologies=['BGP','OSPF','EVPN','VPC','SDWAN','STP','SYSTEM','DCI'];
const correlated=C.assess({workspace,deviceIds:nodes.map(x=>x.id),modules:technologies});
const result=M.evaluate({workspace,deviceIds:nodes.map(x=>x.id),modules:technologies,correlation:correlated,language:'en'});
assert.equal(result.schema,'ai-engineering-assessment-matrix-v1');

assert.equal(result.rejectedUnboundFindings,0,'All real correlator findings match their original supplied CLI lines');
const original=correlated.findings.find(f=>f.evidence?.length&&f.evidence[0].source.startsWith('show: '));
assert.ok(original,'Test requires an observed line-bearing finding');
for(const forged of [
 {line:9999},
 {device:'NONEXISTENT-HOSTNAME'},
 {excerpt:'fabricated state: Established'},
 {source:'show: other-file.txt'},
 {deviceId:'another-device'}
]){
 const fake={...original,id:'FORGED-PROOF',evidence:[{...original.evidence[0],...forged}]};
 const output=M.evaluate({workspace,deviceIds:nodes.map(x=>x.id),modules:technologies,
  correlation:{findings:[...correlated.findings,fake]}});
 assert.equal(output.rejectedUnboundFindings,1,'Forged evidence must not enter assessment matrix');
 assert.equal(output.findings.some(f=>f.id==='FORGED-PROOF'),false);
}
const staleCapture={...workspace,showTech:real.filter(x=>x.filename!=='ios-bgp')};
const stale=M.evaluate({workspace:staleCapture,deviceIds:nodes.map(x=>x.id),modules:technologies,correlation:correlated});
assert.ok(stale.rejectedUnboundFindings>=1,'Report must reject findings when source CLI is deleted after correlation');

assert.equal(result.controls.length,8,'Every chosen technology has a consistent assessment methodology');
assert.ok(result.controls.every(x=>x.purpose&&x.audit&&x.acceptance&&x.conditionalRisk));
assert.equal(result.controls.find(x=>x.technology==='STP').state,'NOT_VERIFIED','No automatic control PASS from unsupported operational evidence');
assert.equal(result.controls.find(x=>x.technology==='SYSTEM').state,'NOT_VERIFIED');
assert.equal(result.counts.NOT_VERIFIED,4);
assert.ok(result.findings.length>=5);
assert.equal(result.evidenceCoverage.realCaptureFiles,6);
for(const finding of result.findings){
 assert.ok(['OBSERVED','REVIEW','CONFLICT'].includes(finding.status));
 assert.ok(finding.purpose&&finding.expected&&finding.hypothesis&&finding.counterevidence);
 assert.ok(finding.conditionalImpact&&finding.acceptance&&finding.remediation);
 assert.ok(finding.evidence.length>0);
 assert.ok(finding.evidence.every(x=>x.device&&x.line>0&&x.source));
 assert.doesNotMatch(JSON.stringify(finding),/suspended ports confirmed|root cause proven|compliance pass/i);
}
assert.ok(result.findings.find(x=>x.technology==='BGP'&&x.deviceIds[0]==='hw').audit.includes('display bgp peer'));
assert.ok(result.findings.find(x=>x.technology==='BGP'&&x.deviceIds[0]==='eos').audit.includes('show ip bgp neighbors <peer>'));
assert.ok(result.findings.find(x=>x.technology==='BGP'&&x.deviceIds[0]==='ios').audit.includes('show ip bgp neighbors <peer>'));
assert.ok(!result.findings.find(x=>x.technology==='BGP'&&x.deviceIds[0]==='hw').audit.some(x=>x.startsWith('show bgp')));
assert.ok(result.findings.find(x=>x.technology==='SDWAN').audit.includes('diagnose sys sdwan neighbor'));
const tr=M.evaluate({workspace,deviceIds:['hw'],modules:['BGP'],correlation:C.assess({workspace,deviceIds:['hw'],modules:['BGP']}),language:'tr'});
assert.match(tr.controls[0].purpose,/prefix/);
assert.match(tr.findings[0].acceptance,/doğrulanır/);
const missing=M.evaluate({workspace:{...workspace,showTech:[]},deviceIds:['ios'],modules:['BGP','STP'],
 correlation:C.assess({workspace:{...workspace,showTech:[]},deviceIds:['ios'],modules:['BGP','STP']})});
assert.equal(missing.findings.length,0,'Config only is not proof of operational control');
assert.equal(missing.counts.NOT_VERIFIED,2);
const synthetic=M.evaluate({workspace:{...workspace,showTech:real.map(x=>({...x,synthetic:true}))},
 deviceIds:['hw'],modules:['BGP'],correlation:C.assess({workspace:{...workspace,showTech:real.map(x=>({...x,synthetic:true}))},deviceIds:['hw'],modules:['BGP']})});
assert.equal(synthetic.findings.length,0,'Synthetic captures cannot be certified as real facts');
assert.equal(synthetic.evidenceCoverage.realCaptureFiles,0);
assert.equal(M.evaluate({workspace,deviceIds:['ios'],modules:['UNKNOWN']}).controls[0].applicability,'UNSUPPORTED_TECHNOLOGY');
console.log('PASS AI Engineering Matrix: eight technology contexts; vendor-specific syntax; missing, synthetic and cited evidence; Turkish/English; no assumed pass/fail');
