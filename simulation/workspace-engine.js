/* Shared deterministic design engine. Never executes device commands. */
(function(root){'use strict';
const modules=['BASIC','BGP','OSPF','STP','VPC','EVPN','QOS','SDWAN'];
function normalize(context){
 const r=context.report,module=r?.source?.module;
 if(!modules.includes(module))throw Error('This workspace has no configured simulation model.');
 const nodes=(r.devices||[]).map(n=>({...n})),ids=new Set(nodes.map(n=>n.id));
 if(!nodes.length||ids.size!==nodes.length)throw Error('The design needs unique devices.');
 const links=[...(r.links||[]).map(l=>({...l,kind:l.kind||'Connection'})),...(r.specialLinks||[]).map((l,i)=>({...l,id:l.id||'special-'+i,logical:l.logical===true}))].filter(l=>l.enabled!==false);
 if(new Set(links.map(l=>l.id)).size!==links.length||links.some(l=>!ids.has(l.a)||!ids.has(l.b)))throw Error('The design contains invalid or duplicate connections.');
 return {module,vendor:r.vendor,technology:r.technology,nodes,links,settings:context.settings||{},bgp:context.bgp||null};
}
function shortest(model,source,target,downNodes=[],downLinks=[],costs={},allowed=()=>true){
 const failed=new Set(downNodes),disabled=new Set(downLinks),dist=new Map(),prev=new Map(),pending=new Set(model.nodes.map(n=>n.id).filter(id=>!failed.has(id)));
 if(!pending.has(source)||!pending.has(target))return null;
 dist.set(source,0);
 while(pending.size){const a=[...pending].sort((a,b)=>(dist.get(a)??Infinity)-(dist.get(b)??Infinity)||a.localeCompare(b))[0];if(!Number.isFinite(dist.get(a)))break;pending.delete(a);if(a===target)break;
  for(const l of model.links){if(disabled.has(l.id)||l.enabled===false||!allowed(l))continue;const b=l.a===a?l.b:l.b===a?l.a:null;if(!pending.has(b))continue;const weight=Number(costs[l.id]??l.cost??1);if(!Number.isFinite(weight)||weight<=0)throw Error('Link cost must be positive.');const d=dist.get(a)+weight;if(d<(dist.get(b)??Infinity)){dist.set(b,d);prev.set(b,{a,link:l.id});}}
 }
 if(!dist.has(target))return null;const nodes=[target],links=[];let p=target;while(p!==source){const v=prev.get(p);if(!v)return null;links.unshift(v.link);nodes.unshift(v.a);p=v.a;}return {nodes,links,cost:dist.get(target)};
}
function stpTree(model,downNodes,downLinks,preferredRoot){
 const healthy=model.nodes.filter(n=>!downNodes.includes(n.id)),rank=n=>n.id===preferredRoot?0:n.tier==='upper'?1:2,rootNode=healthy.sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id))[0],tree=new Set();
 if(rootNode)for(const n of healthy){const p=shortest(model,n.id,rootNode.id,downNodes,downLinks,{},l=>!l.logical);for(const id of p?.links||[])tree.add(id);}
 return {root:rootNode?.id||null,links:tree};
}
// Cisco vPC state transitions, based on Cisco Best Practices pp.32,126–128
// and Nexus 9000 10.5(x) vPC recovery/consistency guidance.
function evaluateCiscoVpc(model,state={},options={}){
 const peers=model.nodes.filter(n=>n.tier==='upper').slice(0,2),peerIds=peers.map(n=>n.id),cfg=model.settings.vpc||{};
 const preferred=peerIds.includes(cfg.initialPrimary)?cfg.initialPrimary:peerIds[0];
 const peerLinks=model.links.filter(l=>/peer-link/i.test(l.kind)),keep=model.links.filter(l=>/keepalive/i.test(l.kind));
 const other=id=>peerIds.find(p=>p!==id),name=id=>model.nodes.find(n=>n.id===id)?.hostname||id;
 const inspect=s=>{const down=new Set(s.devices||[]),links=new Set(s.links||[]),up=l=>!links.has(l.id)&&!down.has(l.a)&&!down.has(l.b);return {down,links,alive:peerIds.filter(p=>!down.has(p)),peer:peerLinks.some(up),keep:keep.length?keep.some(up):null,members:peerLinks.filter(up).length};};
 let dualCause="",recoveryCause="Pair power outage";
 let primary=preferred,suspended=null,dual=false,uncertain=false,previous=inspect({}),powerOutage=false,awaitRecovery=false,restoring=null;
 const history=[...(state.events||[])];const last=history.at(-1);if(!last||JSON.stringify(last.devices)!==JSON.stringify(state.devices||[])||JSON.stringify(last.links)!==JSON.stringify(state.links||[]))history.push({devices:state.devices||[],links:state.links||[]});
 for(const event of history){const now=inspect(event);
  if(!now.alive.length){powerOutage=true;awaitRecovery=true;primary=null;suspended=null;restoring=null;dual=false;uncertain=false;}
  else if(now.alive.length===1){const survivor=now.alive[0];if(suspended===survivor){awaitRecovery=true;recoveryCause='Previously suspended secondary lost its primary';}if(primary!==survivor)primary=survivor;suspended=null;dual=false;uncertain=false;if(powerOutage)awaitRecovery=cfg.autoRecovery!==true||event.recoveryElapsed!==true;}
  else {
   if(!primary)primary=preferred;
   if(now.peer){if(!previous.peer&&suspended&&cfg.delayRestore)restoring=suspended;if(previous.alive.length===1&&now.alive.length===2&&cfg.delayRestore)restoring=peerIds.find(id=>!previous.alive.includes(id));if(dual)primary=other(primary);suspended=null;dual=false;uncertain=false;awaitRecovery=false;powerOutage=false;}
   else if(now.keep===true){suspended=other(primary);dual=false;uncertain=false;}
   else if(previous.peer&&!now.peer){
    if(now.keep===false){dual=true;uncertain=false;suspended=null;dualCause=previous.keep===false?'Keepalive failed before peer-link':'Peer-link and peer-keepalive failed simultaneously';}
    else {uncertain=true;suspended=null;}
   }
   // Peer-link-first suspension is retained if keepalive subsequently disappears.
  }
  if(event.recoveryElapsed){if(cfg.autoRecovery&&now.alive.length===2&&!now.peer&&now.keep===false&&suspended){dual=true;uncertain=false;suspended=null;dualCause='Auto-recovery brought the isolated secondary members back up after keepalive timeouts while both peers remain alive';}if(cfg.autoRecovery&&now.alive.length===1){awaitRecovery=false;powerOutage=false;}restoring=null;}
  previous=now;
 }
 const now=inspect(state),roles=Object.fromEntries(peerIds.map(id=>[id,now.down.has(id)?'DOWN':dual?'PRIMARY (dual-active)':uncertain?'ROLE UNCONFIRMED':id===primary?'PRIMARY':'SECONDARY']));
 const blocked=new Set(),findings=[],add=(severity,code,description)=>findings.push({severity,code,description});
 if(suspended){for(const l of model.links)if(l.a===suspended||l.b===suspended)if(!/peer-link|keepalive/i.test(l.kind)&&!l.logical)blocked.add(l.id);add('warning','SECONDARY_SUSPENDED',name(suspended)+' suspends its vPC member ports; associated vPC VLAN SVIs are affected unless an explicit exclusion is configured. Traffic uses '+name(primary)+'.');}
 if(restoring){for(const l of model.links)if(!l.logical&&!/peer-link|keepalive/i.test(l.kind)&&[l.a,l.b].includes(restoring))blocked.add(l.id);add('warning','DELAY_RESTORE',name(restoring)+' is returning; vPC members await delay-restore ('+cfg.delayRestore+' s). Operational primary remains '+name(primary)+'.');}
 if(state.conditions?.type1){const affected=cfg.gracefulConsistency===false?peerIds:[other(primary)];for(const l of model.links)if(!/peer-link|keepalive/i.test(l.kind)&&affected.some(id=>id===l.a||id===l.b))blocked.add(l.id);add('warning','TYPE1_MISMATCH',cfg.gracefulConsistency===false?'Mandatory mismatch: both sides suspended because graceful consistency-check is disabled.':'Mandatory mismatch: secondary vPC members suspended under graceful consistency-check.');}
 if(state.conditions?.vlanMismatch)add('warning','VLAN_MISMATCH','Only selected service VLAN '+(model.settings.redundancy?.serviceVlan||'(design scope)')+' is unavailable; the vPC bundle and other consistent VLANs can remain operational.');
 if(dual)add('critical','DUAL_ACTIVE','SPLIT-BRAIN / DUAL-ACTIVE: '+dualCause+'. Both live peers act as operational primary and retain their available local vPC members. MAC/ARP and IGMP synchronization is lost; existing flows may continue, but new flows and duplicate forwarding can be affected. Available member links do not establish healthy end-to-end forwarding.');
 if(suspended&&!now.peer&&now.keep===false)add('warning','ISOLATED_SECONDARY',cfg.autoRecovery?'Peer-link failed first, so the secondary is initially suspended. Configured auto-recovery can reactivate it after keepalive timeouts and cause split-brain if the other chassis is still alive. Complete the simulated recovery interval to evaluate that transition.':'Peer-link failed first while keepalive was up, so the secondary remains suspended. No auto-recovery is configured; this ordered failure is distinct from simultaneous loss.');
 if(uncertain)add('critical','DUAL_FAILURE_ORDER_UNKNOWN','Both control paths failed together. Failure order and detection timers are not established; dual-active risk, not a verified healthy forwarding state.');
 if(now.peer&&now.keep===false)add('warning','KEEPALIVE_ONLY','Peer-keepalive loss alone does not suspend vPC members or change the traffic path while peer-link remains operational.');
 if(now.peer&&now.members<peerLinks.length)add('warning','PEER_MEMBER_LOSS','A peer-link member failed; '+now.members+' of '+peerLinks.length+' members remain. Logical peer-link stays up with reduced redundancy/capacity.');
 if(now.alive.length===1)add('warning','PEER_DEVICE_DOWN',name(now.alive[0])+' is the surviving operational primary; dual-homed member traffic uses its available local legs.');
 if(awaitRecovery)add('warning','RECOVERY_WAIT',cfg.autoRecovery?recoveryCause+': lone peer waits for '+(powerOutage?'configured auto-recovery reload-delay ('+(cfg.autoDelay||240)+' s)':'auto-recovery after three consecutive peer-keepalive timeouts')+'.':recoveryCause+': lone peer has no configured auto-recovery; service recovery requires peer adjacency or an explicit recovery procedure.');
 if(!now.alive.length)add('critical','PAIR_DOWN','Both vPC peers are down; all attached vPC service paths are unavailable.');
 const source=options.source&&model.nodes.some(n=>n.id===options.source&&n.tier==='lower')?options.source:model.nodes.find(n=>n.tier==='lower')?.id;
 const access=model.links.filter(l=>[l.a,l.b].includes(source)&&peerIds.some(id=>[l.a,l.b].includes(id))&&!l.logical&&!/peer-link|keepalive/i.test(l.kind));
 const paths=access.filter(l=>!now.down.has(source)&&!now.links.has(l.id)&&!blocked.has(l.id)&&!now.down.has(l.a)&&!now.down.has(l.b)&&!awaitRecovery&&!state.conditions?.vlanMismatch).map(l=>({nodes:[source,l.a===source?l.b:l.a],links:[l.id],cost:1}));
 paths.sort((a,b)=>(a.nodes[1]===primary?-1:0)-(b.nodes[1]===primary?-1:0)||a.nodes[1].localeCompare(b.nodes[1]));
 const baselinePaths=access.map(l=>({nodes:[source,l.a===source?l.b:l.a],links:[l.id],cost:1}));
 const status=dual?'split-brain':!paths.length?'no-path':uncertain?'dual-active-risk':paths.length<baselinePaths.length||now.keep===false||now.members<peerLinks.length||findings.length?'degraded':'reachable';
 const notes=['Steady-state vPC member forwarding model; healthy uplink, LACP and VLAN configuration assumed. No packet loss/convergence time measurement.',
 'Configured role priority initializes the baseline; operational roles are non-preemptive after peer recovery.',
 'Orphan ports, northbound L3 uplinks and specific SVI exceptions are not present in this imported dual-homed design and are not invented.'];
 if(cfg.delayRestore)notes.push('Returning peer members are shown after the configured delay-restore ('+cfg.delayRestore+' s); no real timer is measured.');
 return {module:'VPC',status,path:paths[0]||null,paths,baseline:baselinePaths[0]||null,baselinePaths,findings,notes,blockedLinks:[...blocked],affected:model.links.filter(l=>now.links.has(l.id)||now.down.has(l.a)||now.down.has(l.b)).map(l=>l.id),vpc:{primary,roles,recoveringPeers:awaitRecovery?now.alive:restoring?[restoring]:[],suspended,dualActive:dual,uncertain,peerLinkUp:now.peer,keepaliveUp:now.keep,availableMembers:now.members,totalMembers:peerLinks.length,recoveryWait:awaitRecovery||!!restoring||!!(suspended&&!now.peer&&now.keep===false&&cfg.autoRecovery),source,leaves:model.nodes.filter(n=>n.tier==='lower').map(leaf=>{const links=model.links.filter(l=>[l.a,l.b].includes(leaf.id)&&peerIds.some(id=>[l.a,l.b].includes(id))&&!l.logical&&!/peer-link|keepalive/i.test(l.kind));const available=links.filter(l=>!now.down.has(leaf.id)&&!now.down.has(l.a)&&!now.down.has(l.b)&&!now.links.has(l.id)&&!blocked.has(l.id)&&!awaitRecovery&&!state.conditions?.vlanMismatch);return {id:leaf.id,hostname:leaf.hostname,available:available.length,total:links.length};})}};
}
function evaluateVendorPair(model,state={},options={}){
 if(model.vendor==='Cisco NX-OS')return evaluateCiscoVpc(model,state,options);
 const profile=model.settings.redundancy||{},peers=model.nodes.filter(n=>n.tier==='upper').slice(0,2),ids=peers.map(n=>n.id),name=id=>model.nodes.find(n=>n.id===id)?.hostname||id;
 const stackwise=model.vendor==='Cisco IOS-XE',istack=model.vendor==='Huawei iStack',huawei=model.vendor==='Huawei_CE_SW',arista=model.vendor==='Arista EOS';
 const peerLinks=model.links.filter(l=>/peer-link|SVL|Stack interconnect/i.test(l.kind)),detection=model.links.filter(l=>/keepalive|DAD|DFS|MAD/i.test(l.kind)),controls=model.links.filter(l=>/peer control/i.test(l.kind));
 const inspect=s=>{const down=new Set(s.devices||[]),links=new Set(s.links||[]),up=l=>!links.has(l.id)&&!down.has(l.a)&&!down.has(l.b);return {down,links,alive:ids.filter(id=>!down.has(id)),peer:peerLinks.some(up),detection:detection.length?detection.some(up):null,control:controls.every(up),members:peerLinks.filter(up).length};};
 let primary=profile.initialPrimary||ids[0],isolated=null,risk=false,recoveryWait=false,reloading=[],prev=inspect({});
 const history=[...(state.events||[])];if(!history.length||JSON.stringify(history.at(-1).devices)!==JSON.stringify(state.devices||[])||JSON.stringify(history.at(-1).links)!==JSON.stringify(state.links||[]))history.push({devices:state.devices||[],links:state.links||[]});
 for(const event of history){const now=inspect(event);
  if(arista){const returned=now.alive.filter(id=>!prev.alive.includes(id));if(returned.length){reloading=[...new Set([...reloading,...returned])];recoveryWait=true;}}
  if(!now.alive.length){primary=null;isolated=null;risk=false;recoveryWait=false;reloading=[];}
  else if(now.alive.length===1){primary=now.alive[0];risk=false;if(isolated===primary)recoveryWait=true;}
  else {
   if(!primary)primary=profile.initialPrimary||ids[0];
   if(huawei&&prev.alive.length===1&&now.peer){primary=profile.initialPrimary||ids[0];isolated=now.alive.find(id=>!prev.alive.includes(id));recoveryWait=true;}
   if(now.peer&&now.control){if(!prev.peer&&isolated)recoveryWait=true;if(!recoveryWait)isolated=null;risk=false;}
   else if(!now.peer||!now.control){
    if(stackwise){if(prev.peer&&!now.peer){const original=primary;primary=ids.find(id=>id!==primary);if(now.detection===true)isolated=original;else risk=true;}else if(now.detection===true&&!isolated&&risk){isolated=ids.find(id=>id!==primary);risk=false;}}
    else if(istack){if(now.detection===true&&profile.madWinner){primary=profile.madWinner;isolated=ids.find(id=>id!==primary);risk=false;}else if(!isolated)risk=true;}
    else if(huawei){if(now.detection===true){isolated=ids.find(id=>id!==primary);risk=false;}else if(!isolated)risk=true;}
    else if(arista){if(profile.dualPrimaryAction&&profile.heartbeatConfigured&&now.detection===true){isolated=ids.find(id=>id!==primary);risk=false;}else risk=true;}
   }
   if(prev.alive.length===1&&now.alive.length===2&&arista)recoveryWait=true;
  }
  if(event.recoveryElapsed){recoveryWait=false;reloading=[];if(now.peer&&now.control)isolated=null;}
  prev=now;
 }
 const now=inspect(state),blocked=new Set(),findings=[],add=(severity,code,description)=>findings.push({severity,code,description});
 if(isolated){for(const l of model.links)if(!l.logical&&!/peer-link|SVL|Stack interconnect|DAD|DFS|MAD|keepalive/i.test(l.kind)&&[l.a,l.b].includes(isolated))blocked.add(l.id);
  add('warning','PROTECTED_PEER',stackwise?name(isolated)+' is the original active chassis in DAD recovery; the former standby '+name(primary)+' is now active.':istack?name(isolated)+' is in MAD Recovery; its service ports are shut. The surviving fragment forwards through '+name(primary)+'.':huawei?name(isolated)+' is the DFS backup in Error-Down protection. Imported M-LAG member interfaces on that peer do not forward.':name(isolated)+' is errdisabled by the explicitly configured dual-primary action.');}
 if(istack&&now.detection===true&&!now.peer&&!profile.madWinner&&!isolated)add('critical','MAD_ELECTION_UNCONFIRMED','MAD is available, but equal imported priorities and missing MAC addresses cannot establish the winning fragment. Both roles remain unconfirmed; do not invent a survivor.');
 if(risk)add('critical',arista?'MLAG_INDEPENDENT_PEERS':'DUAL_ACTIVE',arista?'MLAG association lost. Independent bridging/STP may occur; no independent heartbeat + errdisable action is configured in this design, so Cisco-style secondary suspension is not assumed.':'Interconnect lost without an effective independent detection path: both live fragments may be active; IP/MAC conflicts or split-brain cannot be treated as healthy forwarding.');
 if(now.peer&&now.detection===false)add('warning','DETECTION_PATH_DOWN','The independent '+(stackwise?'DAD':istack?'MAD':'DFS DAD')+' path is down; existing traffic paths remain while the interconnect is healthy.');
 if(now.peer&&now.members<peerLinks.length)add('warning','INTERCONNECT_MEMBER_DOWN',istack?(profile.stackTopology==='chain'?'A physical stack member is lost but an imported stack interconnect still survives.':'Stack ring degraded to chain; a surviving stack link maintains the logical stack.'):'A physical interconnect member failed; the surviving member maintains the logical interconnect.');
 if(now.alive.length===1)add('warning','PEER_DEVICE_DOWN','Service uses healthy local member links on '+name(now.alive[0])+'. No path is routed through an unrelated access switch.');
 if(recoveryWait)add('warning','RECOVERY_WAIT',arista?'Returning peer is in reload-delay; confirm recovery only after the configured/platform reload-delay.':huawei&&now.peer?'Peer-link is restored; DFS roles renegotiate and returning service members await recovery delay. Complete the modeled recovery interval only after synchronization.':'Protected fragment remains in recovery; interconnect repair/rejoin or the platform-specific manual recovery procedure is required.');
 if(huawei&&history.some(e=>inspect(e).peer===false)&&now.peer)add('info','RECOVERY_RENEGOTIATION','Peer-link recovery includes DFS renegotiation and M-LAG member recovery delay. The Huawei overview describes 240 seconds; exact platform/software configuration must be verified.');
 if(state.conditions?.vlanMismatch)add('warning','VLAN_INCONSISTENT','Selected service VLAN is inconsistent; available physical member links do not prove VLAN forwarding.');
 if(!now.alive.length)add('critical','PAIR_DOWN','Both peer devices are down; no imported service member can forward.');
 const source=options.source&&model.nodes.some(n=>n.id===options.source&&n.tier==='lower')?options.source:model.nodes.find(n=>n.tier==='lower')?.id;
 const access=model.links.filter(l=>!l.logical&&[l.a,l.b].includes(source)&&ids.some(id=>[l.a,l.b].includes(id))&&!/peer-link|SVL|Stack interconnect|DAD|DFS|MAD|keepalive/i.test(l.kind));
 const valid=l=>!now.down.has(l.a)&&!now.down.has(l.b)&&!now.links.has(l.id)&&!blocked.has(l.id)&&!state.conditions?.vlanMismatch&&!(recoveryWait&&(reloading.length?reloading.some(id=>[l.a,l.b].includes(id)):[l.a,l.b].includes(isolated||ids.find(id=>id!==primary))));
 const paths=access.filter(valid).map(l=>({nodes:[source,l.a===source?l.b:l.a],links:[l.id],cost:1})),baselinePaths=access.map(l=>({nodes:[source,l.a===source?l.b:l.a],links:[l.id],cost:1}));
 paths.sort((a,b)=>(a.nodes[1]===primary?-1:0)-(b.nodes[1]===primary?-1:0));
 const roleA=stackwise?'ACTIVE':istack||huawei?'MASTER':'PRIMARY',roleB=stackwise||istack?'STANDBY':huawei?'BACKUP':'SECONDARY';
 const roles=Object.fromEntries(ids.map(id=>[id,now.down.has(id)?'DOWN':id===isolated?(stackwise||istack?'RECOVERY':huawei?'ERROR-DOWN':'ERRDISABLED'):risk?'ACTIVE / UNCONFIRMED':id===primary?roleA:roleB]));
 const status=!paths.length?'no-path':risk?'dual-active-risk':findings.some(f=>f.severity!=='info')||paths.length<baselinePaths.length?'degraded':'reachable';
 const notes=[model.technology+' steady-state member forwarding model. Traffic endpoint is the logical redundant domain, not one physical chassis. No northbound uplink or orphan endpoint is invented.',arista?'Independent heartbeat is offered only if peer-address heartbeat is present in the imported configuration; the control SVI is not a second physical heartbeat link.':stackwise?'DAD isolates the original active after SVL loss; it does not apply the Cisco Nexus secondary-suspend rule.':istack?'One ring-link failure is not a split. All stack links lost requires MAD split handling and fragment recovery.':'DFS DAD distinguishes peer failure from peer-link failure; backup Error-Down applies only to modeled service interfaces.'];
 return {module:'VPC',status,path:paths[0]||null,paths,baseline:baselinePaths[0]||null,baselinePaths,notes,findings,blockedLinks:[...blocked],affected:model.links.filter(l=>now.links.has(l.id)||now.down.has(l.a)||now.down.has(l.b)).map(l=>l.id),vpc:{primary,roles,recoveringPeers:recoveryWait?(reloading.length?reloading:isolated?[isolated]:[ids.find(id=>id!==primary)]).filter(id=>now.alive.includes(id)):[],suspended:isolated,dualActive:risk,uncertain:risk,peerLinkUp:now.peer,keepaliveUp:now.detection,availableMembers:now.members,totalMembers:peerLinks.length,recoveryWait,manualRecoveryRequired:!!isolated&&now.alive.length===1&&!now.peer,source,leaves:model.nodes.filter(n=>n.tier==='lower').map(leaf=>{const links=model.links.filter(l=>!l.logical&&[l.a,l.b].includes(leaf.id)&&ids.some(id=>[l.a,l.b].includes(id)));return {id:leaf.id,hostname:leaf.hostname,total:links.length,available:links.filter(valid).length};})}};
}
function evaluate(model,state={},options={}){
 if(model.module==='VPC')return evaluateVendorPair(model,state,options);
 const dn=state.devices||[],dl=state.links||[],source=options.source||model.nodes[0].id,target=options.target||model.nodes.at(-1).id;
 const failed=new Set(dn),disabled=new Set(dl),notes=[],findings=[];
 let allowed=l=>!l.logical,path,baseline,rootState=null;
 if(model.module==='BASIC')allowed=()=>true;
 const active=l=>!failed.has(l.a)&&!failed.has(l.b)&&!disabled.has(l.id);
 if(model.module==='STP'){
  rootState=stpTree(model,dn,dl,options.preferredRoot||model.settings.preferredRoot);const initial=stpTree(model,[],[],model.settings.preferredRoot);
  allowed=l=>rootState.links.has(l.id);path=shortest(model,source,target,dn,dl,{},allowed);baseline=shortest(model,source,target,[],[],{},l=>initial.links.has(l.id));
  notes.push('Synthetic equal-cost spanning tree; preferred configured core wins while available. Equal bridge priorities use device ID as a deterministic tie-break, not a learned bridge MAC.');
 }else if(model.module==='EVPN'){
  allowed=l=>true;notes.push('Logical EVPN session connectivity only. Imported overlay sessions do not establish an operational physical underlay or VNI forwarding.');
 }else if(model.module==='OSPF')notes.push('Shortest path by modeled OSPF cost. Assumes compatible area, timers, authentication and MTU; no packet or convergence timer simulation.');
 else if(model.module==='QOS')notes.push('Policy arithmetic for the selected offered rate; queue scheduling, bursts and packet loss are not emulated.');
 else if(model.module==='BASIC')notes.push('Configured management endpoint reachability; server process health and authentication acceptance are separate.');
 else if(model.module==='SDWAN')notes.push('Configured local WAN transport availability. No remote-site tunnels or application SLA state are inferred.');
 if(model.module==='BGP'&&model.bgp){
  const b=model.bgp,ces=b.nodes.filter(n=>n.id.startsWith('ce')),isps=b.nodes.filter(n=>n.id.startsWith('isp')),internal={nodes:b.nodes,links:b.links.filter(l=>l.a.startsWith('ce')&&l.b.startsWith('ce'))};
  const start=options.bgpSource||ces[0]?.id,owner=options.bgpTarget||start;
  const candidates=[];
  for(const l of b.links){const ce=[l.a,l.b].find(id=>id.startsWith('ce')),isp=[l.a,l.b].find(id=>id.startsWith('isp'));if(!ce||!isp||dn.includes(isp)||dn.includes(ce)||dl.includes(l.id))continue;
   const route=shortest(internal,options.direction==='inbound'?owner:start,ce,dn,dl);if(!route)continue;
   const policy=options.policies?.[l.id]||l;
   candidates.push({nodes:options.direction==='inbound'?[isp,...route.nodes.slice().reverse()]:[...route.nodes,isp],links:options.direction==='inbound'?[l.id,...route.links.slice().reverse()]:[...route.links,l.id],localPreference:Number(policy.localPreference??l.localPreference),prependCount:Number(policy.prependCount??l.prependCount??0),externalLink:l.id});
  }
  candidates.sort((a,b)=>options.direction==='inbound'?a.prependCount-b.prependCount||a.externalLink.localeCompare(b.externalLink):b.localPreference-a.localPreference||a.links.length-b.links.length||a.externalLink.localeCompare(b.externalLink));
  path=candidates[0]||null;
  if(dn.length||dl.length||options.policies)baseline=evaluate(model,{}, {...options,policies:null}).path;else baseline=path;
  notes.push('BGP Local Preference / AS-path subset; internal transport must be explicitly configured. No internal link is invented for larger CE designs.');
  return {module:model.module,path,baseline,candidates,notes,findings,status:path?'reachable':'no-path'};
 }
 if(path===undefined)path=shortest(model,source,target,dn,dl,options.costs||{},allowed);
 if(baseline===undefined)baseline=shortest(model,source,target,[],[],{},allowed);
 const affected=model.links.filter(l=>!active(l)).map(l=>l.id);
 let status=path?'reachable':'no-path';if(source===target){status=failed.has(source)?'no-path':'same-device';notes.push('Select distinct source and destination devices to assess a traffic path.');}if(model.module==='VPC'&&findings.some(f=>f.severity==='critical')&&path)status='conditional';
 const rate=Math.max(0,Number(options.offeredRate??100)),limits=[model.settings.shapeRate,model.settings.policeRate].map(Number).filter(v=>v>0),limit=limits.length?Math.min(...limits):0;
 const qos=model.module==='QOS'?{offeredMbps:rate,limitMbps:limit||null,admittedMbps:path?limit?Math.min(rate,limit):rate:0,excessMbps:path&&limit?Math.max(0,rate-limit):0}:null;
 return {module:model.module,path,baseline,notes,findings,status,affected,root:rootState?.root||null,blockedLinks:rootState?model.links.filter(l=>!l.logical&&active(l)&&!rootState.links.has(l.id)).map(l=>l.id):[],qos};
}
root.WorkspaceSimulationEngine={normalize,shortest,evaluate,evaluateCiscoVpc,evaluateVendorPair,modules};
})(typeof window==='undefined'?globalThis:window);
