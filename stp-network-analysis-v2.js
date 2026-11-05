/* End-to-end STP correlation over N selected devices; no fixed device count, names, VLANs or link roles. */
(function(root){'use strict';
function analyze(workspace,selectedIds){
 const parse=root.NetworkSTPEngineeringV2?.parse;
 if(typeof parse!=='function')throw Error('STP configuration parser unavailable');
 const chosen=new Set(selectedIds||[]);
 const nodes=(workspace.nodes||[]).filter(n=>chosen.has(n.id));
 if(!nodes.length)throw Error('Select devices');
 const devices=nodes.map(n=>parse(n,(workspace.configs||[]).find(c=>c.deviceId===n.id)?.text||''));
 const byId=new Map(devices.map(d=>[d.id,d]));
 const links=(workspace.links||[]).filter(l=>chosen.has(l.a)&&chosen.has(l.b)&&l.logical!==true);
 const adjacency=new Map(devices.map(d=>[d.id,[]]));
 for(const l of links){adjacency.get(l.a).push({id:l.b,link:l});adjacency.get(l.b).push({id:l.a,link:l});}
 const comps=[],seen=new Set();
 for(const d of devices){if(seen.has(d.id))continue;const q=[d.id],ids=[];seen.add(d.id);
  for(let i=0;i<q.length;i++){const id=q[i];ids.push(id);
   for(const edge of adjacency.get(id)||[])if(!seen.has(edge.id)){seen.add(edge.id);q.push(edge.id);}}
  comps.push(ids);
 }
 const evidence=(d,x,port)=>x?(d.hostname+' config L'+x.line+(port?' ['+port+']':'')+': '+x.command):'';
 const port=(d,name)=>d.interfaces.find(p=>p.name.toLowerCase()===String(name||'').toLowerCase());
 const vlanSet=d=>{
  const v=new Set(d.vlans);
  for(const p of d.priorities)if(p.value.scope==='VLAN')v.add(p.value.instance);
  for(const r of d.rootMacros)for(const i of r.value.instances)v.add(i);
  for(const p of d.interfaces){
   if(!p.trunk||!p.allowed||!/^[\d,\s-]+$/.test(p.allowed.value))continue;
   for(const i of root.NetworkSTPEngineeringV2.vlanList(p.allowed.value))v.add(i);
  }
  return [...v].sort((a,b)=>a-b);
 };
 const vlanIndex=new Map(devices.map(d=>[d.id,vlanSet(d)]));
 const findings=[],comparisons=[],vlanDomains=[],resilience=[];
 const add=(scope,code,severity,message,proof=[],verification='')=>
  findings.push({scope,code,severity,message,evidence:proof.filter(Boolean),verification});
 const vlanList=root.NetworkSTPEngineeringV2.vlanList;
 const normalizedSet=value=>{
  if(!value)return null;
  if(value.value.toLowerCase()==='all')return null; // unknown effective VLAN set; don't report explicit mismatch
  if(!/^[\d,\s-]+$/.test(value.value))return null;
  return vlanList(value.value);
 };
 for(const l of links){
  const a=byId.get(l.a),b=byId.get(l.b),ap=port(a,l.aPort),bp=port(b,l.bPort);
  const rel={first:a.hostname,second:b.hostname,ports:[l.aPort||'?',l.bPort||'?'],
   identity:l.id,status:'DESIGN_LINK_ONLY',details:[],evidence:[]};
  if(!l.aPort||!l.bPort){
   rel.details.push('Modeled link has no explicit two-port mapping; actual interfaces and link STP roles are unverified.');
   comparisons.push(rel);continue;
  }
  if(!ap||!bp){
   rel.status='ENDPOINT_NOT_FOUND';
   rel.details.push('At least one mapped port is missing from captured configuration. No trunk-match assertion is possible.');
   comparisons.push(rel);continue;
  }
  rel.status='CONFIG_ENDPOINTS_MAPPED';
  const fa=x=>evidence(a,x,ap.name),fb=x=>evidence(b,x,bp.name);
  rel.evidence.push(...[ap.trunk,ap.native,ap.allowed,ap.rootGuard,ap.loopGuard,ap.portfast,ap.udld].map(fa).filter(Boolean),
   ...[bp.trunk,bp.native,bp.allowed,bp.rootGuard,bp.loopGuard,bp.portfast,bp.udld].map(fb).filter(Boolean));
  rel.details.push(ap.trunk&&bp.trunk?'Both ends explicitly configure trunk mode.':'Both ends not explicitly verified as trunks.');
  if(ap.native&&bp.native){
   const same=ap.native.value===bp.native.value;
   rel.details.push(same?'Native VLAN agrees: '+ap.native.value:'Native VLAN mismatch: '+ap.native.value+' versus '+bp.native.value);
   if(!same)add(a.hostname+' ↔ '+b.hostname,'TRUNK_NATIVE_MISMATCH','HIGH',
    'Mapped trunk interfaces have different native VLANs; review untagged traffic handling and STP consistency.',
    [fa(ap.native),fb(bp.native)],'show interfaces trunk; verify physical link');
  }else rel.details.push('Native VLAN cannot be compared without explicit values or platform defaults.');
  const aa=normalizedSet(ap.allowed),ba=normalizedSet(bp.allowed);
  if(aa&&ba){
   const missingA=ba.filter(x=>!aa.includes(x)),missingB=aa.filter(x=>!ba.includes(x));
   rel.details.push(missingA.length||missingB.length?
    'Allowed VLAN sets differ: only at '+b.hostname+' '+missingA.join(',')+'; only at '+a.hostname+' '+missingB.join(','):
    'Allowed VLAN sets agree: '+aa.join(','));
   if(missingA.length||missingB.length)add(a.hostname+' ↔ '+b.hostname,'TRUNK_ALLOWED_DIFFERENCE','REVIEW',
    'Mapped trunk allowed VLAN lists differ; verify required service VLANs before modifying pruning.',
    [fa(ap.allowed),fb(bp.allowed)],'show interfaces trunk; show vlan brief');
  }else rel.details.push('Allowed VLAN agreement not proved by both explicit statements.');
  const roles=[];
  for(const [device,p,peer,ev] of [[a,ap,b,fa],[b,bp,a,fb]]){
   if(p.rootGuard)roles.push(device.hostname+' has Root Guard toward '+peer.hostname+
    ': confirm a designated/downstream boundary; do not install on a port expected to receive superior BPDUs.');
   if(p.loopGuard)roles.push(device.hostname+' has Loop Guard toward '+peer.hostname+
    ': confirm expected root/alternate role per VLAN; verify lost-BPDU protection.');
   if(p.portfast){
    roles.push(device.hostname+' has PortFast on modeled inter-switch link: review because PortFast edge designation normally belongs to endpoints.');
    add(device.hostname,'EDGE_PORTFAST_ON_INTERSWITCH','REVIEW',
     'PortFast on mapped switch-to-switch '+p.name+' requires an explicit design exception and peer validation.',
     [ev(p.portfast)],'show spanning-tree interface detail; show cdp/lldp neighbors');
   }
  }
  rel.details.push(...roles);comparisons.push(rel);
 }
 for(const ids of comps){
  const group=ids.map(id=>byId.get(id)),groupName=group.map(d=>d.hostname).join(' / ');
  const candidates=new Set();
  for(const d of group)for(const v of vlanIndex.get(d.id))candidates.add(v);
  // A VLAN may be represented by MST instances; those require MST mapping evidence.
  for(const vlan of [...candidates].sort((a,b)=>a-b)){
   const participants=group.filter(d=>vlanIndex.get(d.id).includes(vlan));
   const known=participants.map(d=>({device:d,record:d.priorities.find(r=>r.value.scope==='VLAN'&&r.value.instance===vlan)}));
   const explicit=known.filter(x=>x.record);
   const other=known.filter(x=>!x.record);
   const min=explicit.length?Math.min(...explicit.map(x=>x.record.value.priority)):null;
   const tied=explicit.filter(x=>x.record.value.priority===min);
   const preferred=explicit.length&&tied.length===1?tied[0].device.hostname:null;
   const status=participants.length<2?'SINGLE_DEVICE_OBSERVED':explicit.length<2?'INCOMPLETE_COMPARISON':
    other.length?'RELATIVE_PREFERENCE_INCOMPLETE':tied.length>1?'PRIORITY_TIE':'RELATIVE_ROOT_CANDIDATE';
   let interpretation=preferred?
    preferred+' has the lowest explicitly captured priority among compared participants. Actual root election is NOT proven, and devices with unspecified/default priorities or outside scope can change the result.':
    'A unique configured root preference cannot be established from captured priorities; MAC/system-ID, defaults, and additional bridges may decide election.';
   if(participants.length<2)interpretation='Only one selected device has explicit evidence of this VLAN; do not infer that other devices carry or omit it.';
   const decision={component:groupName,vlan,participants:participants.map(d=>d.hostname),
    configured:known.map(x=>({hostname:x.device.hostname,priority:x.record?.value.priority??null,evidence:evidence(x.device,x.record)})),
    candidate:preferred,status,interpretation};
   vlanDomains.push(decision);
   if(tied.length>1)add(groupName,'ROOT_PRIORITY_TIE','DESIGN_REVIEW',
    'Multiple devices have the same lowest captured bridge priority for VLAN '+vlan+
    '. Root preference depends on remaining bridge ID and operational election.',
    tied.map(x=>evidence(x.device,x.record)),'show spanning-tree vlan '+vlan+' root');
  }
  // Calculate graph redundancy per modeled node, not per fixed core/access names.
  for(const removedId of ids){
   const remaining=ids.filter(x=>x!==removedId);
   if(!remaining.length)continue;
   const visited=new Set(),sub=[];
   for(const start of remaining){if(visited.has(start))continue;const stack=[start];visited.add(start);const part=[];
    while(stack.length){const id=stack.pop();part.push(id);
     for(const e of adjacency.get(id)||[])if(e.id!==removedId&&remaining.includes(e.id)&&!visited.has(e.id)){
      visited.add(e.id);stack.push(e.id);
     }}sub.push(part);}
   if(sub.length>1)resilience.push({scope:groupName,event:'DEVICE_REMOVED',device:byId.get(removedId).hostname,
    impact:'MODELED_GRAPH_PARTITION',affectedComponents:sub.map(p=>p.map(id=>byId.get(id).hostname)),
    assessment:'Removing this node partitions the user-supplied topology graph. This is a structural dependency, NOT proof of service outage; routing, unmodeled paths and STP state are unknown.'});
  }
  for(const l of links.filter(l=>ids.includes(l.a)&&ids.includes(l.b))){
   const queue=[l.a],visited=new Set(queue);
   while(queue.length){const id=queue.shift();
    for(const x of adjacency.get(id)||[])if(x.link.id!==l.id&&!visited.has(x.id)){visited.add(x.id);queue.push(x.id);}}
   if(!visited.has(l.b))resilience.push({scope:groupName,event:'LINK_REMOVED',link:l.id,
    devices:[byId.get(l.a).hostname,byId.get(l.b).hostname],impact:'MODELED_SINGLE_PATH_LINK',
    assessment:'Link is a bridge in the modeled graph; its removal disconnects the modeled endpoints. This does not prove traffic outage or convergence time.'});
  }
 }
 // Highlight cross-link STP hierarchy conflict only when the exact neighbor endpoints are mapped
 // and the peer has lower *explicitly configured* priority for the same VLAN.
 for(const rel of comparisons.filter(x=>x.status==='CONFIG_ENDPOINTS_MAPPED')){
  const link=links.find(l=>l.id===rel.identity),a=byId.get(link.a),b=byId.get(link.b);
  const pa=port(a,link.aPort),pb=port(b,link.bPort);
  for(const [local,p,remote]of [[a,pa,b],[b,pb,a]]){
   if(!p.rootGuard)continue;
   const localKeys=new Map(local.priorities.filter(x=>x.value.scope==='VLAN').map(x=>[x.value.instance,x]));
   const remoteKeys=new Map(remote.priorities.filter(x=>x.value.scope==='VLAN').map(x=>[x.value.instance,x]));
   const conflict=[];
   for(const [v,localPriority]of localKeys)if(remoteKeys.has(v)&&remoteKeys.get(v).value.priority<localPriority.value.priority)conflict.push(v);
   if(conflict.length)add(local.hostname+' → '+remote.hostname,'ROOT_GUARD_HIERARCHY_CHECK','REVIEW',
    'Root Guard on '+local.hostname+' '+p.name+' faces a peer with a lower configured bridge priority for VLAN(s) '+
    conflict.join(',')+'. If the peer is the intended root, superior BPDUs may place the port root-inconsistent. Verify intended downstream boundary, actual bridge IDs and root ports.',
    [evidence(local,p.rootGuard,p.name),...conflict.map(v=>evidence(remote,remoteKeys.get(v)))],
    'show spanning-tree root; show spanning-tree inconsistentports; show spanning-tree interface detail');
  }
 }
 const complete=devices.filter(d=>d.hasConfig).length;
 return {kind:'stp-network-correlation-v2',deviceCount:devices.length,capturedCount:complete,
  components:comps.map(ids=>ids.map(id=>byId.get(id).hostname)),modeledLinkCount:links.length,
  links:comparisons,vlans:vlanDomains,resilience,findings,
  scope:'Selected nodes and explicit user-modeled physical links only. Unmodeled cabling, operational STP states and port roles remain unknown.',
  coverage:{deviceConfigs:complete+'/'+devices.length,mappedLinks:comparisons.filter(x=>x.status==='CONFIG_ENDPOINTS_MAPPED').length+'/'+links.length},
  limitations:['No dynamic VLAN/root election is proven by running-config alone.','Bridge priority comparison is a relative hypothesis, not an operational root diagnosis.','Graph redundancy is topology intent, not measured failover.','Only explicitly mapped link endpoints can be compared for trunk/guard behavior.']};
}
root.NetworkSTPNetworkV2={analyze};
})(typeof window==='undefined'?globalThis:window);
