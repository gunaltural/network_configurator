/* STP Engineering V2 — configuration-driven, auditable, deterministic. No LLM claims. */
(function(root){
'use strict';
const SOURCES={
 stp:{title:'Cisco IOS XE STP Configuration Guide',url:'https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/stp/stp-configuration-guide/m-stp.html'},
 root:{title:'Cisco — Enhance STP with Root Guard',url:'https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/10588-74.html'},
 loop:{title:'Cisco — STP Loop Guard and UDLD',url:'https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol-stp-8021d/218321-configure-stp-with-loop-guard-and-bpdu-s.html'},
 trunk:{title:'IEEE 802.1Q Bridged Networks',url:'https://www.ieee802.org/1/pages/802.1Q.html'}
};
function vlanList(spec){
 const out=new Set();
 for(const part of String(spec||'').replace(/\s/g,'').split(',')){
  const m=part.match(/^(\d+)(?:-(\d+))?$/);if(!m)continue;
  const lo=+m[1],hi=m[2]?+m[2]:lo;
  if(lo<1||hi>4094||hi<lo)continue;
  for(let v=lo;v<=hi;v++)out.add(v);
 }
 return [...out].sort((a,b)=>a-b);
}
function parse(node,input){
 const lines=String(input||'').replace(/\r\n?/g,'\n').split('\n');
 const result={id:node.id,hostname:node.hostname,platform:node.vendor||'Unknown',hasConfig:!!String(input||'').trim(),
  mode:null,vtp:null,vlans:[],priorities:[],rootMacros:[],interfaces:[],global:[],hasOperational:false};
 let current=null,mst=false;
 const record=(value,line,command)=>({value,line,command});
 lines.forEach((original,i)=>{
  const cmd=original.trim(),line=i+1;
  if(!cmd)return;
  let m=cmd.match(/^interface\s+(\S+)/i);
  if(m){current={name:m[1],line,description:null,trunk:false,access:false,native:null,allowed:null,
   nonegotiate:false,portfast:null,bpduGuard:null,rootGuard:null,loopGuard:null,udld:null,channelGroup:null,shutdown:null,commands:[]};
   result.interfaces.push(current);mst=false;return;}
  if(/^spanning-tree mst configuration$/i.test(cmd)){current=null;mst=true;return;}
  if(/^(?:!|end|exit)$/i.test(cmd)){current=null;mst=false;return;}
  // A new top-level directive also ends an interface; indentation on IOS-style captures
  // is authoritative when present, otherwise recognized top-level statements are bounded.
  if(current&&!/^\s/.test(original)&&/^(?:hostname|vtp|vlan|spanning-tree mode|spanning-tree vlan|ip |router |line |snmp-server )/i.test(cmd))current=null;
  if(current){
   current.commands.push({line,command:cmd});
   if((m=cmd.match(/^description\s+(.+)$/i)))current.description=record(m[1],line,cmd);
   else if(/^switchport mode trunk$/i.test(cmd))current.trunk=record(true,line,cmd);
   else if(/^switchport mode access$/i.test(cmd))current.access=record(true,line,cmd);
   else if((m=cmd.match(/^switchport trunk native vlan\s+(\d+)$/i)))current.native=record(+m[1],line,cmd);
   else if((m=cmd.match(/^switchport trunk allowed vlan\s+(.+)$/i)))current.allowed=record(m[1].trim(),line,cmd);
   else if(/^switchport nonegotiate$/i.test(cmd))current.nonegotiate=record(true,line,cmd);
   else if(/^spanning-tree portfast(?:\s|$)/i.test(cmd))current.portfast=record(true,line,cmd);
   else if(/^(?:spanning-tree bpduguard enable|spanning-tree portfast(?: edge)? bpduguard (?:enable|default))$/i.test(cmd))current.bpduGuard=record(true,line,cmd);
   else if(/^spanning-tree guard root$/i.test(cmd))current.rootGuard=record(true,line,cmd);
   else if(/^spanning-tree (?:guard loop|loopguard enable)$/i.test(cmd))current.loopGuard=record(true,line,cmd);
   else if((m=cmd.match(/^udld port\s+(aggressive|enable)$/i)))current.udld=record(m[1].toLowerCase(),line,cmd);
   else if((m=cmd.match(/^channel-group\s+(\d+)\s+mode\s+(\S+)/i)))current.channelGroup=record(m[1]+'/'+m[2],line,cmd);
   else if(/^(?:no )?shutdown$/i.test(cmd))current.shutdown=record(cmd==='shutdown',line,cmd);
   return;
  }
  if((m=cmd.match(/^hostname\s+(\S+)/i))){result.configHostname=record(m[1],line,cmd);continue;}
  if((m=cmd.match(/^vtp mode\s+(off|transparent|server|client)/i))){result.vtp=record(m[1].toLowerCase(),line,cmd);continue;}
  if((m=cmd.match(/^vlan\s+([\d,\s-]+)$/i))){result.vlans.push(...vlanList(m[1]));continue;}
  if((m=cmd.match(/^spanning-tree mode\s+([\w-]+)/i))){result.mode=record(m[1].toLowerCase(),line,cmd);continue;}
  if((m=cmd.match(/^spanning-tree (vlan|mst)\s+([\d,\s-]+)\s+priority\s+(\d+)$/i))){
   for(const v of vlanList(m[2]))result.priorities.push(record({scope:m[1].toUpperCase(),instance:v,priority:+m[3]},line,cmd));continue;
  }
  if((m=cmd.match(/^spanning-tree vlan\s+([\d,\s-]+)\s+root\s+(primary|secondary)/i))){
   result.rootMacros.push(record({instances:vlanList(m[1]),role:m[2].toLowerCase()},line,cmd));continue;
  }
  if(/^(?:spanning-tree portfast(?: edge)? default|spanning-tree portfast(?: edge)? bpduguard default|spanning-tree loopguard default|udld aggressive|udld enable)$/i.test(cmd))result.global.push(record(cmd,line,cmd));
 });
 result.vlans=[...new Set(result.vlans)].sort((a,b)=>a-b);
 return result;
}
function assess(workspace,ids){
 const chosen=new Set(ids||[]),nodes=(workspace.nodes||[]).filter(n=>chosen.has(n.id));
 if(!nodes.length)throw Error('Select at least one STP device.');
 const parsed=nodes.map(n=>parse(n,(workspace.configs||[]).find(c=>c.deviceId===n.id)?.text||''));
 const ref=(d,r,port)=>r?(d.hostname+' config L'+r.line+(port?' ('+port+')':'')+': '+r.command):'';
 const join=items=>items.length?items.join(', '):'none observed';
 const reports=[],findings=[];
 function finding(device,id,severity,reason,evidence,action){
  findings.push({device,id,severity,reason,evidence,action});
 }
 for(const d of parsed){
  const trunks=d.interfaces.filter(p=>p.trunk);
  const roots=d.interfaces.filter(p=>p.rootGuard),loops=d.interfaces.filter(p=>p.loopGuard);
  const udlds=d.interfaces.filter(p=>p.udld),edge=d.interfaces.filter(p=>p.portfast);
  const bpdus=d.interfaces.filter(p=>p.bpduGuard);
  const globalPortfast=d.global.filter(x=>/^spanning-tree portfast(?: edge)? default$/i.test(x.command));
  const globalBpdu=d.global.filter(x=>/^spanning-tree portfast(?: edge)? bpduguard default$/i.test(x.command));
  const explicitInstances=[...new Set(d.priorities.filter(x=>x.value.scope==='VLAN').map(x=>x.value.instance).concat(...d.rootMacros.map(x=>x.value.instances)))].sort((a,b)=>a-b);
  const instanceVerification=explicitInstances.length&&explicitInstances.length<=32?'show spanning-tree vlan '+explicitInstances.join(','):'show spanning-tree root; show spanning-tree detail';
  const nativeMap=new Map(),allowMap=new Map();
  for(const p of trunks){
   const native=p.native?String(p.native.value):'?';
   const allowed=p.allowed?p.allowed.value:'?';
   if(!nativeMap.has(native))nativeMap.set(native,[]);
   nativeMap.get(native).push(p.name);
   if(!allowMap.has(allowed))allowMap.set(allowed,[]);
   allowMap.get(allowed).push(p.name);
  }
  const priGroup=new Map();
  for(const x of d.priorities){
   const key=x.value.scope+' '+x.value.priority;
   if(!priGroup.has(key))priGroup.set(key,[]);
   priGroup.get(key).push(x.value.instance);
  }
  const ports=d.interfaces.map(p=>{
   const controls=[p.rootGuard?'Root Guard':null,p.loopGuard?'Loop Guard':null,
    p.udld?'UDLD '+p.udld.value:null,p.portfast?'PortFast':null,p.bpduGuard?'BPDU Guard':null].filter(Boolean);
   let interpretation='';
   if(p.rootGuard&&p.loopGuard){
    interpretation='CONFLICT: Root Guard and Loop Guard both appear on this interface; not valid as a combined protection design. Verify effective running state.';
    finding(d.hostname,'STP-010/011','HIGH','Conflicting Root Guard / Loop Guard on '+p.name,[ref(d,p.rootGuard,p.name),ref(d,p.loopGuard,p.name)],'Remove the incorrect safeguard only after confirming the STP port role.');
   }else if(p.rootGuard)interpretation='Root Guard protects a designated/downstream boundary against superior BPDUs. Verify this port is not a root/alternate uplink; otherwise it can become root-inconsistent.';
   else if(p.loopGuard)interpretation='Loop Guard protects root/alternate/non-designated behavior against lost BPDUs. Verify port roles per VLAN; use with UDLD where appropriate.';
   else if(p.trunk)interpretation='Trunk configuration observed. Neither PortFast nor BPDU Guard is universally required on network-facing trunks; confirm peer role.';
   else interpretation='Interface role is not proven by configuration; do not infer mandatory STP edge controls.';
   if(p.portfast&&p.trunk){
    finding(d.hostname,'STP-008','REVIEW','PortFast on trunk '+p.name+' requires confirmation of a single endpoint rather than switch-to-switch adjacency.',[ref(d,p.portfast,p.name)],'Verify LLDP/CDP peer and physical attachment; do not disable blindly on an ESXi or other edge trunk.');
   }
   const evidence=[p.trunk,p.native,p.allowed,p.nonegotiate,p.rootGuard,p.loopGuard,p.udld,p.portfast,p.bpduGuard]
    .filter(Boolean).map(x=>ref(d,x,p.name));
   return {name:p.name,description:p.description?.value||'',mode:p.trunk?'trunk':p.access?'access':'unknown',
    native:p.native?.value??null,allowed:p.allowed?.value??null,dtp:p.nonegotiate?'nonegotiate':'not explicitly stated',
    guard:p.rootGuard?'root':p.loopGuard?'loop':'not explicit',udld:p.udld?.value||'not explicit',
    portfast:!!p.portfast,bpduGuard:!!p.bpduGuard,controls,interpretation,evidence};
  });
  function c(id,label,status,observed,analysis,verify,evidence,source){
   if(!d.hasConfig)return {id,label,status:'NO_DATA',observed:'No configuration attached',analysis:'No configuration assessment possible. Attach the device capture.',verify,evidence:[],source:source||SOURCES.stp};
   return {id,label,status,observed,analysis,verify,evidence:evidence.filter(Boolean),source:source||SOURCES.stp};
  }
  const controls=[];
  const haveConfig=d.hasConfig;
  const priEvidence=d.priorities.map(x=>ref(d,x));
  const priSummary=[...priGroup].map(([key,vlans])=>key.replace('VLAN ','VLAN priority ')+': '+vlans.map(v=>'VLAN '+v).join(', ')).join(' / ');
  controls.push(c('STP-001','Platform / software version','VERIFY','Workspace: '+d.platform,'Exact model and OS version were not supplied by running-config. Vendor-default assumptions are not validated.','show version',[]));
  controls.push(c('STP-002','Device and interface role','ROLE_DEPENDENT',trunks.length+' trunk(s) configured; topology describes design intent only.','Core / distribution / access role and each trunk peer must be verified from topology and LLDP/CDP before declaring safeguards wrong.','show cdp neighbors detail; show lldp neighbors detail',trunks.map(p=>ref(d,p.trunk,p.name))));
  controls.push(c('STP-003','STP protocol mode',d.mode?'OBSERVED':'VERIFY',d.mode?.value||'not explicitly stated',d.mode?.value==='rapid-pvst'?'Rapid-PVST configured; this alone does not measure convergence time.':'Verify protocol interoperability against adjacent switches.','show spanning-tree summary',[ref(d,d.mode)]));
  controls.push(c('STP-004','Root placement',d.priorities.length||d.rootMacros.length?'DESIGN_REVIEW':'VERIFY',priSummary||'No explicit priority observed','Configured lower bridge priority makes this device a preferred root candidate relative to higher-priority peers, not a proven operational root. Compare every relevant bridge per VLAN.','show spanning-tree root; '+instanceVerification,[...priEvidence,...d.rootMacros.map(x=>ref(d,x))],SOURCES.root));
  controls.push(c('STP-005','Bridge ID / priority',d.priorities.length?'OBSERVED':'VERIFY',priSummary||'not explicitly stated','Bridge ID also includes system-ID extension/MAC address; root election cannot be proven by priority alone.','show spanning-tree detail',priEvidence,SOURCES.root));
  controls.push(c('STP-006','Root redundancy','VERIFY',d.priorities.length?'Root candidate configured; backup role unproven':'No configured candidate captured','Assess root takeover against all peers and redundant topology; no measured failover duration inferred.','show spanning-tree root; show spanning-tree detail',priEvidence));
  controls.push(c('STP-007','MST region',d.mode&&d.mode.value!=='mst'&&d.mode.value!=='mstp'?'NOT_APPLICABLE':'VERIFY',
   d.mode&&d.mode.value!=='mst'&&d.mode.value!=='mstp'?'Not applicable to configured '+d.mode.value:'MST region not evaluated',
   d.mode&&d.mode.value!=='mst'&&d.mode.value!=='mstp'?'Do not report missing MST settings as a defect under Rapid-PVST.':'Compare region name, revision and VLAN-to-instance mapping against peers.','show spanning-tree mst configuration',[ref(d,d.mode)],SOURCES.trunk));
  controls.push(c('STP-008','PortFast / edge port','ROLE_DEPENDENT',edge.length+' explicit PortFast interface(s); '+trunks.length+' trunk(s) seen; '+globalPortfast.length+' global edge default(s)',
   edge.length?'Check that each PortFast trunk terminates at a true endpoint; a server-facing trunk can be legitimate.':globalPortfast.length?'Global PortFast default is configured. Verify which interfaces qualify as operational edge; do not infer forwarding state from the global command.':
   'No explicit PortFast on captured trunks. This is NOT a fault by itself; network-facing trunks normally do not need PortFast. Confirm any actual endpoint edge ports separately.',
   'show spanning-tree interface detail; show lldp neighbors detail',[...edge.map(p=>ref(d,p.portfast,p.name)),...globalPortfast.map(x=>ref(d,x))]));
  controls.push(c('STP-009','BPDU Guard','ROLE_DEPENDENT',bpdus.length+' explicit BPDU Guard interface(s); '+globalBpdu.length+' global edge default(s)',
   bpdus.length?'Assess BPDU Guard only on confirmed edge-facing interfaces.':globalBpdu.length?'Global BPDU Guard default is configured. Verify which ports operate as PortFast edge; this is not proof the feature is active on every trunk.':
   'No explicit BPDU Guard on captured trunks. This is NOT a fault by itself; BPDU Guard belongs to the edge-port protection policy, not every Core trunk.',
   'show spanning-tree summary; show running-config | include bpduguard',[...bpdus.map(p=>ref(d,p.bpduGuard,p.name)),...globalBpdu.map(x=>ref(d,x))]));
  controls.push(c('STP-010','Root Guard',roots.length?'DESIGN_REVIEW':'ROLE_DEPENDENT',roots.length+' interface(s): '+join(roots.map(p=>p.name)),
   roots.length?'Protection is configured. Root Guard is intended for designated/downstream-facing boundaries; verify VLAN-specific roles and prevent incorrect placement on root ports.':
   'No explicit Root Guard; assess only interfaces where superior BPDUs must be excluded.',
   instanceVerification+' detail; show spanning-tree inconsistentports',roots.map(p=>ref(d,p.rootGuard,p.name)),SOURCES.root));
  controls.push(c('STP-011','Loop Guard',loops.length?'DESIGN_REVIEW':'ROLE_DEPENDENT',loops.length+' interface(s): '+join(loops.map(p=>p.name)),
   loops.length?'Loop Guard is configured. It protects eligible root/alternate (non-designated) ports from loss of expected BPDUs; validate role per VLAN.':
   'Absence alone cannot establish a defect without STP role and redundancy context.',
   'show spanning-tree vlan 10,20 detail; show spanning-tree inconsistentports',loops.map(p=>ref(d,p.loopGuard,p.name)),SOURCES.loop));
  controls.push(c('STP-012','UDLD aggressive',udlds.length?'OBSERVED':'ROLE_DEPENDENT',udlds.length+' interface(s): '+join(udlds.map(p=>p.name+' ('+p.udld.value+')')),
   udlds.length?'Per-port UDLD is configured. Aggressive mode can help detect certain unidirectional failures; effectiveness depends on link media, peer support and operational state.':
   'UDLD is conditional on physical link and platform support. No missing-control claim from configuration alone.',
   'show udld interface; show interfaces status',udlds.map(p=>ref(d,p.udld,p.name)),SOURCES.loop));
  controls.push(c('STP-013','EtherChannel / LACP',d.interfaces.some(p=>p.channelGroup)?'DESIGN_REVIEW':'ROLE_DEPENDENT',
   d.interfaces.filter(p=>p.channelGroup).map(p=>p.name+' '+p.channelGroup.value).join(', ')||'No channel-group explicitly configured',
   'Independent STP trunks need not use LACP. If a port-channel is intended, validate member consistency and logical peer termination.',
   'show etherchannel summary',d.interfaces.filter(p=>p.channelGroup).map(p=>ref(d,p.channelGroup,p.name))));
  const nativeText=[...nativeMap].map(([v,pp])=>'native '+v+' on '+pp.length+' port(s)').join('; ');
  const allowText=[...allowMap].map(([v,pp])=>'allowed '+v+' on '+pp.length+' port(s)').join('; ');
  controls.push(c('STP-014','Trunk native / allowed VLAN',trunks.length?'DESIGN_REVIEW':'VERIFY',
   trunks.length+' trunk(s); '+nativeText+'; '+allowText,
   nativeMap.size===1&&allowMap.size===1?'Captured trunk settings are internally consistent. Confirm corresponding peer ports, service VLAN requirements and operational trunk state.':
   'Compare each port and peer: native/allowed lists differ or are missing in the captured configuration. Do not assume mismatch without mapped endpoints.',
   'show interfaces trunk; show vlan brief',trunks.flatMap(p=>[ref(d,p.native,p.name),ref(d,p.allowed,p.name)]),SOURCES.trunk));
  controls.push(c('STP-015','Topology change / TCN','VERIFY','No operational topology-change counters in running-config','Review topology-change frequency per VLAN over time; do not infer instability from config.','show spanning-tree detail; inspect logs',[]));
  controls.push(c('STP-016','Core / uplink failure impact','VERIFY',roots.length+' Root Guard port(s), '+loops.length+' Loop Guard port(s)',
   'Validate neighbor, per-VLAN state, blocked alternate paths, and failure-domain behavior before describing recovery outcomes.',
   'show spanning-tree root; show spanning-tree detail; verify uplink peers',[...roots.map(p=>ref(d,p.rootGuard,p.name)),...loops.map(p=>ref(d,p.loopGuard,p.name))]));
  controls.push(c('STP-017','vPC / MLAG / Stack context','VERIFY','Chassis grouping not established by STP running-config',
   'Standalone Cores, StackWise Virtual and multi-chassis LAG have different forwarding and STP semantics; select verified architecture.',
   'show switch virtual; show vpc / show mlag where supported',[]));
  controls.push(c('STP-018','Vendor reference / software applicability','VERIFY','Vendor metadata: '+d.platform,
   'Apply documented feature semantics only after matching exact platform and release; Cisco references are conditional.',
   'show version; platform feature matrix',[]));
  if(d.configHostname&&d.configHostname.value!==d.hostname)
   finding(d.hostname,'STP-001','REVIEW','Workspace hostname '+d.hostname+' differs from captured '+d.configHostname.value,[ref(d,d.configHostname)],'Match configuration to device identity before using report for production.');
  if(!haveConfig)finding(d.hostname,'DATA-001','BLOCKED','No device configuration supplied',[],'Attach a configuration before interpreting any control.');
  for(const x of d.priorities)if(x.value.priority>61440||x.value.priority%4096!==0)
   finding(d.hostname,'STP-005','HIGH','Nonstandard bridge priority '+x.value.priority+' for '+x.value.scope+' '+x.value.instance,[ref(d,x)],'Verify bridge priority platform constraints.');
  if(nativeMap.size>1)
   finding(d.hostname,'STP-014','REVIEW','Trunk native VLANs differ inside '+d.hostname, trunks.map(p=>ref(d,p.native,p.name)).filter(Boolean),'Determine if VLAN differences reflect intentional network segmentation.');
  reports.push({hostname:d.hostname,id:d.id,platform:d.platform,configHostname:d.configHostname?.value||null,hasConfig:haveConfig,
   summary:{mode:d.mode?.value||null,vtp:d.vtp?.value||null,vlans:d.vlans,rootPriority:priSummary,globalPortfast:globalPortfast.length,globalBpduGuard:globalBpdu.length,
    trunkCount:trunks.length,rootGuardCount:roots.length,loopGuardCount:loops.length,udldCount:udlds.length,
    nativeSummary:nativeText,allowedSummary:allowText},
   facts:{mode:ref(d,d.mode),vtp:ref(d,d.vtp),priorities:priEvidence},
   ports,controls});
 }
 // Peer comparisons require explicit captured configs and topology endpoints.
 for(const link of workspace.links||[]){
  const a=parsed.find(d=>d.id===link.a),b=parsed.find(d=>d.id===link.b);
  if(!a||!b||!a.hasConfig||!b.hasConfig||!link.aPort||!link.bPort)continue;
  const pa=a.interfaces.find(p=>p.name.toLowerCase()===String(link.aPort).toLowerCase());
  const pb=b.interfaces.find(p=>p.name.toLowerCase()===String(link.bPort).toLowerCase());
  if(!pa||!pb)continue;
  if(pa.native&&pb.native&&pa.native.value!==pb.native.value)
   finding(a.hostname+' ↔ '+b.hostname,'STP-014','HIGH','Mapped trunk native VLAN mismatch: '+pa.name+' ('+pa.native.value+') ↔ '+pb.name+' ('+pb.native.value+')',[ref(a,pa.native,pa.name),ref(b,pb.native,pb.name)],'Verify physical mapping and align native VLAN intent.');
  if(pa.allowed&&pb.allowed&&pa.allowed.value!==pb.allowed.value)
   finding(a.hostname+' ↔ '+b.hostname,'STP-014','REVIEW','Mapped allowed VLAN lists differ: '+pa.allowed.value+' ↔ '+pb.allowed.value,[ref(a,pa.allowed,pa.name),ref(b,pb.allowed,pb.name)],'Compare required traffic VLANs before changing allowed lists.');
 }
 for(let i=0;i<parsed.length;i++)for(let j=i+1;j<parsed.length;j++){
  const a=parsed[i],b=parsed[j];if(!a.hasConfig||!b.hasConfig)continue;
  if(a.mode&&b.mode&&a.mode.value!==b.mode.value)
   finding(a.hostname+' ↔ '+b.hostname,'STP-003','REVIEW','STP protocol mode mismatch '+a.mode.value+' vs '+b.mode.value,[ref(a,a.mode),ref(b,b.mode)],'Confirm actual adjacency and interoperability / boundary behavior.');
  for(const pri of a.priorities){
   const partner=b.priorities.find(p=>p.value.scope===pri.value.scope&&p.value.instance===pri.value.instance);
   if(!partner)continue;
   const decision=pri.value.priority===partner.value.priority?'Equal configured priority; root selection depends on remaining bridge ID fields.':
    (pri.value.priority<partner.value.priority?a.hostname:b.hostname)+' is preferred over the compared peer by configured priority, but is not proven root.';
   for(const n of [a,b]){const r=reports.find(x=>x.id===n.id),row=r?.controls.find(x=>x.id==='STP-004');
    if(row){row.analysis+=' '+pri.value.scope+' '+pri.value.instance+': '+decision;row.evidence.push(ref(a,pri),ref(b,partner));}}
  }
 }
 return {kind:'stp-engineering-v2-deterministic-not-ai',devices:reports,findings,sources:SOURCES,
  limitations:['Only captured configuration and explicitly modeled topology were used.','Configuration presence is evidence of intent, not operational health, compliance or failover timing.','Root/alternate/designated port roles require per-VLAN operational output.','Exact Cisco OS/platform release is required before applying platform-specific defaults.']};
}
root.NetworkSTPEngineeringV2={parse,assess,vlanList,sources:SOURCES};
})(typeof window==='undefined'?globalThis:window);
