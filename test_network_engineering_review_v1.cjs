'use strict';
const assert=require('node:assert/strict');
require('./ai-topology-workspace.js');
require('./stp-engineering-v2.js');
require('./stp-network-analysis-v2.js');
require('./stp-synthetic-lab-v1.js');
require('./network-engineering-findings-v1.js');
require('./engineering-knowledge-stp-v1.js');
require('./network-engineering-review-v1.js');
const lab=global.NetworkSTPLabV1.create();
const ids=lab.nodes.map(x=>x.id);
const K=global.NetworkEngineeringFindingsV1;
const M=global.NetworkEngineeringReviewV1;
function assess(w){
 return K.run({workspace:w,deviceIds:ids,technology:'STP',
  engineering:global.NetworkSTPEngineeringV2.assess(w,ids),
  network:global.NetworkSTPNetworkV2.analyze(w,ids)});
}
const normal=assess(lab);
const summary=M.build(normal);
assert.equal(summary.technology,'STP');
assert.equal(summary.totals.HIGH,0,'Working protected topology is not an invented high-risk incident');
assert.ok(summary.good.some(x=>x.title.includes('Root bridge containment')),'Configured root boundary is a positive assessment');
assert.ok(summary.unassessed.some(x=>x.title.includes('Unidirectional')),'Missing media evidence remains a review task');
const udld=normal.findings.find(x=>x.id==='STP-UDLD-PHYSICAL');
assert.match(udld.context.purpose,/unidirectional/i);
assert.match(udld.context.applicableWhen,/media/i);
assert.match(udld.context.absenceImpact,/traffic blackholes/i);
assert.ok(udld.deployment.configured.length>=2,'Structured CLI locations are available for the technology finding');
const location=M.evidenceLocations(udld)[0];
assert.ok(location.device&&location.interface&&location.command.startsWith('udld port'),'Per-device CLI evidence includes hostname, port, and command');
assert.ok(location.line>0,'CLI evidence has original configuration line number');
assert.equal(M.priority(udld),'REVIEW','Missing operational evidence is not automatically high priority');
const unprotected=structuredClone(lab);
unprotected.configs=unprotected.configs.map(c=>({...c,source:'design',
 text:c.text.replace(/^\s*spanning-tree guard root\n/gmi,'')}));
const result=assess(unprotected),root=result.findings.find(x=>x.id==='STP-ROOT-CONTAINMENT');
assert.equal(root.status,'RISK');
assert.equal(M.priority(root),'HIGH');
assert.ok(root.deployment.missing.length>=2,'Root Guard missing is assigned to exact mapped Core interfaces');
assert.ok(root.deployment.missing.every(x=>x.device&&x.interface&&x.line),'Missing applicable coverage traces to interface declaration');
const executive=M.build(result);
assert.ok(executive.actionable.some(x=>x.title.includes('Root bridge containment')&&x.priority==='HIGH'));
assert.equal(executive.actionable[0].priority,'HIGH','Material risk is ahead of incomplete verification');
const bgp={
 technology:'BGP',knowledgeVersion:'1.0.0',devices:2,registeredControls:2,limitations:[],
 findings:[
  {id:'BGP-PEER-FSM',technology:'BGP',title:'Neighbor session state',status:'VERIFY',severity:'NONE',
   devices:['EDGE-A','EDGE-B'],networkImpact:'Route exchange cannot be confirmed.',recommendation:'Collect show bgp summary.',
   evidence:['EDGE-A config L25: neighbor 192.0.2.2 remote-as 65002']},
  {id:'BGP-PREFIX-POLICY',technology:'BGP',title:'Outbound prefix filtering',status:'RISK',severity:'MEDIUM',
   devices:['EDGE-A'],networkImpact:'An unintended route could be advertised.',recommendation:'Validate and constrain permitted prefixes.',
   evidence:['EDGE-A config L31: neighbor 192.0.2.2 route-map RM-OUT out']}
 ]};
const bgpSummary=M.build(bgp);
assert.equal(bgpSummary.actionable[0].priority,'MEDIUM','BGP uses identical prioritization without a BGP branch in report code');
assert.equal(bgpSummary.actionable[1].priority,'REVIEW');
assert.equal(M.evidenceLocations(bgp.findings[0])[0].line,25,'Technology-neutral CLI evidence supports BGP');
console.log('Universal Design Review: STP semantics + mapped CLI + true gaps, BGP sample, honest priority matrix PASS');
