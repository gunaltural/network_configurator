'use strict';
const assert=require('node:assert/strict');
require('./network-engineering-findings-v1.js');
require('./engineering-knowledge-stp-v1.js');
const knowledge=global.NetworkEngineeringFindingsV1;
const stp=knowledge.describe('STP');
assert.equal(stp.technology,'STP');
assert.equal(stp.version,'1.1.0');
assert.equal(stp.status,'IMPLEMENTED_BASELINE');
assert.ok(stp.controls.length>=8);
assert.ok(stp.vendors.includes('Cisco IOS-XE'));
assert.ok(stp.controls.find(x=>x.id==='STP-ROOT-CONTAINMENT').sources.includes('TOPOLOGY'));
assert.ok(knowledge.list().some(x=>x.technology==='EVPN'&&x.status==='NOT_IMPLEMENTED'));
const workspace={nodes:[{id:'core',hostname:'CORE-1',vendor:'Cisco IOS-XE'}],configs:[],links:[]};
const missing=knowledge.run({workspace,deviceIds:['core'],technology:'BGP'});
assert.equal(missing.counts.GOOD,0);
assert.equal(missing.counts.VERIFY,1);
assert.equal(missing.moduleStatus,'NOT_IMPLEMENTED');
assert.equal(missing.findings[0].verificationTask.owner,'Network Engineering');
assert.match(missing.findings[0].verificationTask.action,/Implement and test/);
assert.match(missing.findings[0].explanation,/not prove/);
assert.throws(()=>knowledge.register({technology:'STP',knowledgeVersion:'1.0.0',vendors:['Cisco IOS-XE'],controls:[{id:'TEST-A',family:'x',sources:['CONFIG']}],evaluate:()=>({findings:[]})}),/Duplicate/);
const pack={technology:'BGP',knowledgeVersion:'0.1.0',vendors:['Cisco IOS-XE','Arista EOS'],status:'EXPERIMENTAL',
 controls:[{id:'BGP-FSM',family:'BGP session',sources:['CONFIG','OPERATIONAL'],verification:['show ip bgp summary']}],
 evaluate:()=>({devices:1,findings:[{
 id:'BGP-FSM-CORE',title:'BGP peer FSM evidence',status:'VERIFY',severity:'NONE',confidence:'CONFIG_ONLY',
 devices:['CORE-1'],deviceIds:['core'],interfaces:[],expected:'Established BGP peer',
 observed:'BGP state not supplied',explanation:'FSM cannot be inferred from neighbor configuration alone.',
 networkImpact:'Route exchange state unverified',recommendation:'Collect show ip bgp summary',
 evidence:[],verification:['show ip bgp summary'],references:[],limitations:[],provenance:'MISSING_OPERATIONAL'
 }]})};
knowledge.register(pack);
const bgpEvaluation=knowledge.run({workspace,deviceIds:['core'],technology:'BGP'});
assert.equal(bgpEvaluation.counts.VERIFY,1,'New technology can be added without modifying the common engine');
assert.equal(bgpEvaluation.findings[0].verificationTask.owner,'Network Operations');
assert.equal(bgpEvaluation.findings[0].verificationTask.reviewer,'Network Engineering');
assert.deepEqual(bgpEvaluation.findings[0].verificationTask.commands,['show ip bgp summary']);
assert.equal(knowledge.describe('BGP').controls[0].id,'BGP-FSM');
assert.throws(()=>knowledge.register({...pack,technology:'OSPF',controls:[...pack.controls,...pack.controls]}),/Duplicate\/invalid control/);
knowledge.register({...pack,technology:'OSPF',controls:[{id:'OSPF-ADJ',family:'OSPF adjacency',sources:['OPERATIONAL']}],
 evaluate:()=>({findings:[{
 id:'OSPF-FAULTY-PASS',title:'Unverified OSPF state',status:'GOOD',
 expected:'Full adjacency',observed:'No OSPF CLI',explanation:'Unknown',recommendation:'Verify',evidence:[]
 }]})});
assert.throws(()=>knowledge.run({workspace,deviceIds:['core'],technology:'OSPF'}),/GOOD outcome has no positive evidence/);
console.log('Technology package registry: STP imported unchanged, BGP dynamically added, unsupported fail-safe, invalid package and ungrounded GOOD guarded PASS');
