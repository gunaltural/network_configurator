'use strict';
const assert=require('node:assert/strict');
require('./network-evidence-correlation-v1.js');
require('./ai-engineering-assessment-v1.js');
require('./ai-hypothesis-review-v1.js');
const C=global.NetworkEvidenceCorrelationV1,M=global.NetworkAIEngineeringAssessmentV1,H=global.NetworkAIHypothesisReviewV1;
const workspace={
 nodes:[
  {id:'a',hostname:'CE-01',vendor:'Cisco IOS-XE'},
  {id:'b',hostname:'EOS-01',vendor:'Arista EOS'},
  {id:'f',hostname:'FGT-01',vendor:'FortiGate FortiOS 7.4.8'}],
 configs:[
  {deviceId:'a',source:'user',text:'router bgp 65001\nneighbor 10.0.0.2 remote-as 65099'},
  {deviceId:'b',source:'user',text:'router bgp 65100\nip address 10.0.0.2/32'},
  {deviceId:'f',source:'user',text:'config router bgp\nset as 65010\nend'}],
 links:[],showTech:[
  {deviceId:'a',filename:'bgp-a.txt',text:'CE-01#show ip bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n10.0.0.2 4 65100 0 0 0 0 0 never Active'},
  {deviceId:'a',filename:'ospf-a.txt',text:'CE-01#show ip ospf neighbor\nNeighbor ID Pri State Dead Time Address Interface\n2.2.2.2 1 FULL/DR 00:00:35 10.10.10.2 Gi0/0'},
  {deviceId:'f',filename:'bgp-f.txt',text:'FGT-01# get router info bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n198.51.100.2 4 65002 0 0 0 0 0 never Active'},
  {deviceId:'f',filename:'sdwan-f.txt',text:'FGT-01# diagnose sys sdwan health-check\nHealth Check(dc-sla):\nSeq(1 R150): state(dead), packet-loss(100.000%)'}]};
const ids=workspace.nodes.map(x=>x.id),modules=['BGP','OSPF','SDWAN'];
const correlation=C.assess({workspace,deviceIds:ids,modules});
const assessment=M.evaluate({workspace,deviceIds:ids,modules,correlation,language:'en'});
assert.equal(assessment.rejectedUnboundFindings,0,'Original CLI evidence is valid');
const review=H.review({assessment,language:'en'});
assert.equal(review.schema,'ai-hypothesis-review-v1');
assert.ok(review.items.length>=4,'BGP, SDWAN and explicit ASN mismatch produce investigations');
assert.ok(review.items.every(x=>x.status==='INVESTIGATION_ONLY'&&!x.rootCauseVerified));
assert.ok(review.items.every(x=>x.possibleExplanations.length>=2&&x.nextChecks.length));
assert.ok(review.items.every(x=>x.sourceEvidence.every(y=>y.device&&y.line>0&&y.source)));
assert.ok(review.counts.withCrossTechnologySignals>0,'BGP and SD-WAN on same FortiGate are independently observable');
assert.ok(review.items.some(x=>x.crossTechnology.some(y=>y.relationship==='SAME_DEVICE_ONLY_NOT_CAUSAL')));
assert.ok(review.counts.withExplicitMultiDeviceEvidence>0,'Only explicit addressed peer + ASN mismatch counts as cross-device evidence');
const configConflict=review.items.find(x=>x.contraryEvidence.some(y=>y.kind==='CONFIG_NOT_RUNNING_STATE'));
assert.ok(configConflict,'Configured peer ASN mismatch does not establish live BGP failure');
assert.equal(configConflict.multiDevice,true);
assert.equal(configConflict.evidenceCoverage,'CONFIGURATION_INTENT_ONLY');
assert.ok(configConflict.sourceEvidence.every(x=>!x.source.startsWith('show: ')));
const fgt=review.items.find(x=>x.deviceIds.includes('f')&&x.technology==='BGP'&&x.crossTechnology.some(y=>y.technology==='SDWAN'));
assert.ok(fgt);
assert.ok(fgt.crossTechnology.every(x=>x.evidence.every(y=>y.deviceId==='f')),'Unrelated devices cannot become causal evidence');
assert.doesNotMatch(JSON.stringify(review),/rootCauseVerified":true|definite root cause|confirmed outage/i);
const translated=H.review({assessment,language:'tr'});
assert.ok(translated.items.some(x=>x.possibleExplanations.some(q=>q.includes('BGP'))));
assert.match(translated.items[0].uncertainty,/Kök neden|kök neden/);
const changed={...workspace,showTech:workspace.showTech.concat([{
 deviceId:'a',filename:'bgp-a-later.txt',text:'CE-01#show ip bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n10.0.0.2 4 65100 10 10 1 0 0 00:01 5'}])};
const conflict=C.assess({workspace:changed,deviceIds:ids,modules});
const conflictReview=H.review({assessment:M.evaluate({workspace:changed,deviceIds:ids,modules,correlation:conflict})});
assert.ok(conflictReview.items.some(x=>x.contraryEvidence.some(y=>y.kind==='OBSERVATIONS_DIFFER_ACROSS_CAPTURES')));
const forged={...correlation.findings[0],id:'FAKE',evidence:[{...correlation.findings[0].evidence[0],excerpt:'fabricated upstate'}]};
const safe=M.evaluate({workspace,deviceIds:ids,modules,correlation:{findings:[...correlation.findings,forged]}});
assert.equal(safe.rejectedUnboundFindings,1);
assert.equal(H.review({assessment:safe}).items.some(x=>x.id==='H-FAKE'),false);
const noEvidence={...workspace,showTech:[]};
const empty=H.review({assessment:M.evaluate({workspace:noEvidence,deviceIds:['f'],modules:['BGP','SDWAN'],
 correlation:C.assess({workspace:noEvidence,deviceIds:['f'],modules:['BGP','SDWAN']})})});
assert.equal(empty.items.length,0,'No proof means no invented symptoms');
console.log('PASS hypothesis review: independent candidates, verified CLI, cross-device config, BGP+SD-WAN noncausality, capture timing and falsified-proof rejection');
