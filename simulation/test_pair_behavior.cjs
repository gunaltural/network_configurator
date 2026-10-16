const assert=require('node:assert/strict');require('./workspace-engine.js');const E=global.WorkspaceSimulationEngine;
function model(vendor){return E.normalize({report:{source:{module:'VPC'},vendor,technology:'test pair',devices:[{id:'upper-1',tier:'upper',hostname:'SPINE-1'},{id:'upper-2',tier:'upper',hostname:'SPINE-2'},{id:'lower-1',tier:'lower',hostname:'LEAF-1'},{id:'lower-2',tier:'lower',hostname:'LEAF-2'}],links:[{id:'a',a:'upper-1',b:'lower-1'},{id:'b',a:'upper-2',b:'lower-1'},{id:'c',a:'upper-1',b:'lower-2'},{id:'d',a:'upper-2',b:'lower-2'}],specialLinks:[{kind:vendor==='Huawei iStack'?'Stack interconnect':vendor==='Cisco IOS-XE'?'SVL members':'Peer-link',a:'upper-1',b:'upper-2'},{kind:vendor==='Huawei iStack'?'Stack interconnect':vendor==='Cisco IOS-XE'?'SVL members':'Peer-link',a:'upper-1',b:'upper-2'},{kind:vendor==='Arista EOS'?'MLAG peer control':vendor==='Huawei iStack'?'Direct MAD':vendor==='Cisco IOS-XE'?'DAD':vendor==='Huawei_CE_SW'?'DAD / DFS':'vPC keepalive',a:'upper-1',b:'upper-2',logical:true}]},settings:{vpc:{initialPrimary:'upper-1',autoRecovery:true,autoDelay:240,delayRestore:90,gracefulConsistency:true},redundancy:{initialPrimary:'upper-1',madWinner:'upper-1',heartbeatConfigured:false,dualPrimaryAction:false}}});}
const options={source:'lower-1',target:'upper-1'};let count=0;
for(const vendor of ['Cisco NX-OS','Arista EOS','Huawei_CE_SW','Cisco IOS-XE','Huawei iStack']){
 const m=model(vendor);assert.equal(E.evaluate(m,{},options).paths.length,2);
 assert.deepEqual(E.evaluate(m,{links:['a']},options).path.nodes,['lower-1','upper-2']);assert.equal(E.evaluate(m,{links:['a','b']},options).path,null);assert.equal(E.evaluate(m,{devices:['lower-1']},options).path,null);
 let r=E.evaluate(m,{devices:['upper-1'],links:[]},options);assert.deepEqual(r.path.nodes,['lower-1','upper-2'],vendor+' must fail over instead of marking target chassis as destination');
 r=E.evaluate(m,{devices:[],links:['special-0']},options);assert.equal(r.vpc.peerLinkUp,true);assert.equal(r.paths.length,2,'one of two members is not complete peer-link failure');
 r=E.evaluate(m,{devices:[],links:['special-0','special-1']},options);
 if(vendor==='Arista EOS'){assert.equal(r.status,'dual-active-risk');assert.equal(r.blockedLinks.length,0,'No invented Cisco secondary suspension on EOS');}
 else if(vendor==='Cisco IOS-XE'){assert.equal(r.vpc.primary,'upper-2');assert.equal(r.vpc.roles['upper-1'],'RECOVERY');assert.ok(r.blockedLinks.includes('a'));assert.ok(!r.blockedLinks.includes('b'));}
 else {assert.ok(r.blockedLinks.includes('b'));assert.equal(r.paths.length,1);}
 if(vendor!=='Arista EOS'){r=E.evaluate(m,{devices:[],links:['special-2']},options);assert.equal(r.paths.length,2);}
 for(let mask=0;mask<32;mask++){const devices=['upper-1','upper-2'].filter((_,i)=>mask&(1<<i)),links=['special-0','special-1','special-2'].filter((_,i)=>mask&(1<<(i+2))),result=E.evaluate(m,{devices,links},options);for(const p of result.paths){assert.ok(p.nodes.every(id=>!devices.includes(id)));assert.ok(p.links.every(id=>!links.includes(id)&&!result.blockedLinks.includes(id)));}if(devices.length===2)assert.equal(result.path,null);count++;}
}
const m=model('Cisco NX-OS');let s={devices:[],links:['special-0','special-1','special-2'],events:[{devices:[],links:['special-2']},{devices:[],links:['special-0','special-1','special-2']}]};assert.equal(E.evaluate(m,s,options).vpc.dualActive,true);
// Simultaneous loss must identify split-brain, including the actual one-event batch.
for(const events of [undefined,[{devices:[],links:s.links}]]){const result=E.evaluate(m,{devices:[],links:s.links,events},options);assert.equal(result.status,'split-brain');assert.equal(result.vpc.dualActive,true);assert.equal(result.vpc.uncertain,false);assert.equal(result.vpc.suspended,null);assert.equal(result.paths.length,2);assert.deepEqual(Object.values(result.vpc.roles),['PRIMARY (dual-active)','PRIMARY (dual-active)']);assert.ok(result.findings.some(f=>f.code==='DUAL_ACTIVE'&&f.description.includes('simultaneously')));}
assert.equal(E.evaluate(m,s,options).status,'split-brain');
s.events=[{devices:[],links:['special-0','special-1']},{devices:[],links:s.links}];let r=E.evaluate(m,s,options);assert.equal(r.vpc.dualActive,false);assert.equal(r.vpc.suspended,'upper-2');
s.events.push({devices:[],links:s.links,recoveryElapsed:true});assert.equal(E.evaluate(m,s,options).status,'split-brain','auto-recovery can reactivate the secondary after peer-first loss');
m.settings.vpc.autoRecovery=false;assert.equal(E.evaluate(m,s,options).vpc.suspended,'upper-2');m.settings.vpc.autoRecovery=true;
// Detection restoration protects again; interconnect restoration leaves dual-active.
for(const links of [['special-0','special-1'],[]]){const recovered=E.evaluate(m,{devices:[],links,events:[{devices:[],links:s.links},{devices:[],links}]},options);assert.equal(recovered.vpc.dualActive,false);assert.notEqual(recovered.status,'split-brain');}
const isolated=E.evaluate(m,{devices:[],links:[...s.links,'a','b']},options);assert.equal(isolated.status,'split-brain','domain split-brain is not hidden by source access failure');assert.equal(isolated.path,null);
s={devices:[],links:[],events:[{devices:['upper-1'],links:[]},{devices:[],links:[]}]};r=E.evaluate(m,s,options);assert.equal(r.vpc.primary,'upper-2','Nexus roles are non-preemptive');assert.equal(r.vpc.recoveryWait,true);s.events.push({devices:[],links:[],recoveryElapsed:true});assert.equal(E.evaluate(m,s,options).paths.length,2);
s={devices:['upper-2'],links:[],events:[{devices:['upper-1','upper-2'],links:[]},{devices:['upper-2'],links:[]}]};r=E.evaluate(m,s,options);assert.equal(r.vpc.recoveryWait,true);assert.equal(r.path,null);s.events.push({devices:['upper-2'],links:[],recoveryElapsed:true});assert.equal(E.evaluate(m,s,options).paths.length,1);
r=E.evaluate(m,{links:['a','special-0','special-1']},options);assert.equal(r.path,null,'Cannot detour across unrelated LEAF-2 to evade secondary suspension');
r=E.evaluate(m,{conditions:{type1:true}},options);assert.equal(r.paths.length,1);m.settings.vpc.gracefulConsistency=false;assert.equal(E.evaluate(m,{conditions:{type1:true}},options).path,null);
assert.equal(E.evaluate(m,{conditions:{vlanMismatch:true}},options).path,null);
console.log(count+' exhaustive vendor component fault combinations plus role/order/recovery/protection assertions passed.');

// Document-backed expected behavior across all pair technologies and repair orders.
for(const vendor of ['Cisco NX-OS','Arista EOS','Huawei_CE_SW','Cisco IOS-XE','Huawei iStack']){
 const m=model(vendor),peer=['special-0','special-1'],detect=['special-2'],both=[...peer,...detect];
 const evaluate=events=>E.evaluate(m,{...events.at(-1),events},options);
 const event=links=>({devices:[],links});
 let r=evaluate([event(both)]);assert.equal(r.vpc.dualActive,true,vendor+' simultaneous paths lost');assert.equal(r.vpc.suspended,null);assert.equal(r.blockedLinks.length,0);
 r=evaluate([event(detect),event(both)]);assert.equal(r.vpc.dualActive,true,vendor+' detection first');
 r=evaluate([event(peer),event(both)]);assert.equal(r.vpc.dualActive,vendor==='Arista EOS',vendor+' protection already established');
 if(vendor!=='Arista EOS')assert.equal(r.vpc.suspended,vendor==='Cisco IOS-XE'?'upper-1':'upper-2');
 r=evaluate([event(both),event(peer)]);assert.equal(r.vpc.dualActive,vendor==='Arista EOS',vendor+' detection restored first');if(vendor!=='Arista EOS')assert.equal(r.paths.length,1);
 r=evaluate([event(both),event(detect)]);assert.equal(r.vpc.dualActive,vendor==='Arista EOS',vendor+' physical interconnect alone does not restore failed EOS control SVI');
 r=evaluate([event(both),event([])]);assert.equal(r.vpc.dualActive,false);assert.equal(r.paths.length,2);
 r=evaluate([event(peer),event([])]);if(vendor!=='Arista EOS'){assert.equal(r.vpc.recoveryWait,true);assert.equal(r.paths.length,1);r=evaluate([event(peer),event([]),{...event([]),recoveryElapsed:true}]);assert.equal(r.paths.length,2);}
 for(const [link,peerId,remaining]of [['a','upper-2','upper-1'],['b','upper-1','upper-2']]){
  r=E.evaluate(m,{links:[link]},options);assert.deepEqual(r.path.nodes,['lower-1',peerId]);
  r=evaluate([{devices:[],links:[link]},{devices:[peerId],links:[link]}]);assert.equal(r.path,null,vendor+' local member loss then opposite chassis loss has no valid service path');
 }
 r=evaluate([{devices:['upper-1'],links:[]},{devices:[],links:[]}]);assert.equal(r.vpc.primary,vendor==='Huawei_CE_SW'?'upper-1':'upper-2',vendor+' documented role after original primary returns');
 if(vendor==='Arista EOS'){assert.equal(r.vpc.recoveryWait,true);assert.equal(r.paths.length,1);assert.deepEqual(r.path.nodes,['lower-1','upper-2']);}
 if(vendor==='Cisco NX-OS'){r=evaluate([event(peer),{devices:['upper-1'],links:peer}]);assert.equal(r.path,null,'suspended secondary must await configured auto-recovery');assert.equal(r.vpc.recoveryWait,true);r=evaluate([event(peer),{devices:['upper-1'],links:peer,recoveryElapsed:true}]);assert.deepEqual(r.path.nodes,['lower-1','upper-2']);}
 if(vendor==='Cisco IOS-XE'||vendor==='Huawei iStack'){
  const serving=vendor==='Cisco IOS-XE'?'upper-2':'upper-1';r=evaluate([event(peer),{devices:[serving],links:peer}]);assert.equal(r.path,null);assert.equal(r.vpc.manualRecoveryRequired,true);r=evaluate([event(peer),{devices:[serving],links:peer,recoveryElapsed:true}]);assert.equal(r.path,null,'timer cannot release a Recovery-only isolated fragment');
 }
}
const tied=model('Huawei iStack');tied.settings.redundancy.madWinner=null;let tie=E.evaluate(tied,{links:['special-0','special-1']},options);assert.ok(tie.findings.some(f=>f.code==='MAD_ELECTION_UNCONFIRMED'));assert.equal(tie.vpc.suspended,null);
const chain=model('Huawei iStack');chain.settings.redundancy.stackTopology='chain';chain.links=chain.links.filter(l=>l.id!=='special-1');assert.equal(E.evaluate(chain,{links:['special-0']},options).vpc.peerLinkUp,false);assert.equal(E.evaluate(chain,{links:['special-0']},options).vpc.roles['upper-2'],'RECOVERY');
const eos=model('Arista EOS');eos.settings.redundancy.heartbeatConfigured=true;eos.settings.redundancy.dualPrimaryAction=true;eos.links.push({id:'hb',a:'upper-1',b:'upper-2',kind:'Independent keepalive',logical:true});
assert.equal(E.evaluate(eos,{links:['special-0','special-1']},options).vpc.roles['upper-2'],'ERRDISABLED');
assert.equal(E.evaluate(eos,{links:['special-0','special-1','hb']},options).vpc.dualActive,true);
console.log('All five vendor order, repair, access isolation, role return, protected-fragment and configuration-dependent protection cases passed.');
