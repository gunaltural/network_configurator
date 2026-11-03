/* Generate read-only, vendor-specific scenario reference facts from the EXISTING
 * simulation engine. This is not a new rule system and never evaluates live CLI.
 * JSON output is derived from the same model used by the Workspace simulator.
 */
'use strict';
const Engine=require('../simulation/workspace-engine.js')||global.WorkspaceSimulationEngine;
const E=global.WorkspaceSimulationEngine||Engine;
if(!E?.normalize||!E?.evaluate)throw Error('WorkspaceSimulationEngine is unavailable');
const vendors=['Cisco NX-OS','Arista EOS','Huawei_CE_SW','Cisco IOS-XE','Huawei iStack'];
function design(vendor){
 const peerKind=vendor==='Cisco IOS-XE'?'SVL members':vendor==='Huawei iStack'?'Stack interconnect':'Peer-link';
 const aliveKind=vendor==='Cisco IOS-XE'?'DAD':vendor==='Huawei iStack'?'Direct MAD':vendor==='Huawei_CE_SW'?'DAD / DFS':vendor==='Arista EOS'?'MLAG peer control':'vPC keepalive';
 return E.normalize({report:{source:{module:'VPC'},vendor,technology:'Redundant pair',
  devices:[{id:'upper-1',hostname:'PAIR-A',tier:'upper'},{id:'upper-2',hostname:'PAIR-B',tier:'upper'},
           {id:'lower-1',hostname:'ACCESS-1',tier:'lower'}],
  links:[{id:'access-1',a:'lower-1',b:'upper-1'},{id:'access-2',a:'lower-1',b:'upper-2'}],
  specialLinks:[{kind:peerKind,a:'upper-1',b:'upper-2'},
                {kind:peerKind,a:'upper-1',b:'upper-2'},
                {kind:aliveKind,a:'upper-1',b:'upper-2',logical:true}]} ,
  settings:{vpc:{initialPrimary:'upper-1',autoRecovery:true,autoDelay:240,delayRestore:90,gracefulConsistency:true},
  redundancy:{initialPrimary:'upper-1',madWinner:'upper-1',heartbeatConfigured:false,dualPrimaryAction:false}}});
}
const event=links=>({devices:[],links});
const peer=['special-0','special-1'],detect=['special-2'],both=[...peer,...detect];
const conditions=[
 ['healthy-baseline',{}],
 ['single-physical-interconnect-member-down',{links:['special-0']}],
 ['complete-interconnect-loss',{links:peer}],
 ['independent-detection-loss',{links:detect}],
 ['simultaneous-interconnect-and-detection-loss',{devices:[],links:both,events:[event(both)]}],
 ['interconnect-first-then-detection',{devices:[],links:both,events:[event(peer),event(both)]}],
 ['detection-first-then-interconnect',{devices:[],links:both,events:[event(detect),event(both)]}],
 ['primary-chassis-down',{devices:['upper-1'],links:[]}],
 ['both-chassis-down',{devices:['upper-1','upper-2'],links:[]}],
 ['mandatory-consistency-mismatch',{conditions:{type1:true}}]
];
const entries=[];
for(const vendor of vendors){
 const model=design(vendor);
 for(const [scenario,state] of conditions){
  const result=E.evaluate(model,state,{source:'lower-1',target:'upper-1'});
  entries.push({vendor,scenario,assumptions:{source:'lower-1',target:'upper-1',peerMembers:2,independentDetection:vendor!=='Arista EOS'},
   modeledOutcome:{status:result.status,peerLinkUp:result.vpc?.peerLinkUp??null,
    dualActive:result.vpc?.dualActive??null,primary:result.vpc?.primary??null,
    suspended:result.vpc?.suspended??null,recoveryWait:result.vpc?.recoveryWait??null,
    paths:result.paths?.length??null,
    findings:(result.findings||[]).slice(0,3).map(x=>({code:x.code,description:x.description}))}});
 }
}
process.stdout.write(JSON.stringify({schema:'network-configurator-simulator-reference-v1',
  provenance:{engine:'simulation/workspace-engine.js',acceptanceTest:'simulation/test_pair_behavior.cjs',
    research:'simulation/PAIR_FAILURE_RESEARCH.md',type:'SYNTHETIC_MODELED_REFERENCE_NOT_LIVE_EVIDENCE'},
  entries},null,2)+'\n');
