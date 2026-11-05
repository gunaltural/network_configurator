/* Common engineering finding contract, v1.
 * Technology-specific evidence extractors plug into this contract; rules never
 * turn config absence into a production outage claim or synthetic into live proof.
 */
(function(root){'use strict';
const REFS={
 vtp:{title:'Cisco IOS XE — Configure VTP',url:'https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/vlan/vlan-configuration-guide/configure-vtp.html'},
 root:{title:'Cisco — STP Root Guard',url:'https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/10588-74.html'},
 loop:{title:'Cisco — STP Loop Guard and UDLD',url:'https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol-stp-8021d/218321-configure-stp-with-loop-guard-and-bpdu-s.html'},
 base:{title:'Cisco — Optional Spanning-Tree Features',url:'https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9500/software/release/26-x/configuration_guide/lyr2/b_26x_lyr2_9500_cg/configuring_optional_spanning_tree_features.html'}
};
function run({workspace,deviceIds,technology='STP',engineering,network,operational}){
 const selected=new Set(deviceIds||[]),devices=(workspace.nodes||[]).filter(n=>selected.has(n.id));
 const configs=new Map((workspace.configs||[]).map(c=>[c.deviceId,c]));
 const parsed=new Map();
 if(technology==='STP'&&root.NetworkSTPEngineeringV2?.parse)
  for(const n of devices)parsed.set(n.id,root.NetworkSTPEngineeringV2.parse(n,configs.get(n.id)?.text||''));
 const results=[],counts={GOOD:0,RISK:0,VERIFY:0,NA:0};
 const names=ids=>[...new Set(ids)].map(id=>devices.find(n=>n.id===id)?.hostname||id);
 const add=entry=>{
  const status=entry.status;
  if(!['GOOD','RISK','VERIFY','NA'].includes(status))throw Error('Invalid evidence-based outcome '+status);
  const item={id:entry.id,technology:entry.technology||technology,title:entry.title,status,
   severity:entry.severity||(status==='RISK'?'MEDIUM':'NONE'),confidence:entry.confidence||'CONFIG_ONLY',
   devices:names(entry.deviceIds||[]),deviceIds:[...new Set(entry.deviceIds||[])],
   interfaces:[...new Set(entry.interfaces||[])],expected:entry.expected,
   observed:entry.observed,networkImpact:entry.networkImpact,explanation:entry.explanation,
   recommendation:entry.recommendation,verification:entry.verification||[],
   evidence:[...new Set(entry.evidence||[])].filter(Boolean),
   references:entry.references||[],limitations:entry.limitations||[],
   provenance:entry.provenance||'DESIGN_CONFIG'};
  counts[status]++;results.push(item);
 };
 if(!devices.length)return {kind:'network-engineering-findings-v1',technology,findings:[],counts,limitations:['No selected devices']};
 if(technology!=='STP'||!engineering)return {kind:'network-engineering-findings-v1',technology,findings:[],counts,limitations:['No supported deterministic assessor for this technology']};
 const relevant=devices.filter(n=>configs.has(n.id)&&configs.get(n.id).text.trim());
 const supported=n=>/^Cisco (?:IOS-XE|NX-OS)$/i.test(n.vendor||'');
 const supportedIds=new Set(relevant.filter(supported).map(n=>n.id));
 const idProof=(d,record)=>record?d.hostname+' config L'+record.line+': '+record.command:'';
 const portProof=(d,p)=>d.hostname+' config L'+p.line+': interface '+p.name;
 const complete=id=>configs.get(id)?.source==='design'||workspace.labMode===true;
 const actualMissing=(ids)=>ids.length>0&&ids.every(complete);
 const hint='No operational forwarding or convergence claim is made from proposed configuration alone.';
 function findingForConfigCoverage(){
  const missing=devices.filter(n=>!configs.get(n.id)?.text?.trim());
  if(missing.length)add({id:'DATA-CONFIG-COVERAGE',title:'Configuration evidence coverage',status:'VERIFY',
   deviceIds:missing.map(n=>n.id),expected:'Selected devices have a complete device configuration or a declared partial capture.',
   observed:missing.length+' device(s) have no supplied configuration.',networkImpact:'Multi-device conclusions may omit relevant forwarding or STP behavior.',
   explanation:'A missing configuration is a coverage gap, not an observed failure.',recommendation:'Attach the device configuration before making an overall network acceptance decision.',verification:['show running-config'],confidence:'MISSING_DATA'});
 }
 findingForConfigCoverage();
 if(!supportedIds.size){
  add({id:'STP-PARSER-COVERAGE',title:'Vendor parser coverage',status:'VERIFY',deviceIds:relevant.map(x=>x.id),
   expected:'Vendor-specific syntax must be understood before evaluating controls.',
   observed:'Cisco IOS-XE/NX-OS STP rules implemented; selected device platform is not supported for these rules.',
   explanation:'No cross-vendor compliance conclusion is asserted.',networkImpact:'Protection coverage cannot be verified.',
   recommendation:'Use a vendor-specific parser and show output before assigning compliance.',verification:['Vendor-specific STP and interface status'],confidence:'UNSUPPORTED_VENDOR'});
  return finalize();
 }
 function finalize(){
  const order={RISK:0,VERIFY:1,GOOD:2,NA:3};results.sort((a,b)=>order[a.status]-order[b.status]||
   ({CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3,NONE:4}[a.severity]??4)-({CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3,NONE:4}[b.severity]??4)||a.id.localeCompare(b.id));
  const limited=relevant.filter(n=>!supported(n));
  return {kind:'network-engineering-findings-v1',technology,devices:devices.length,findings:results,counts,
   limitations:[hint,...(limited.length?['Unverified vendor-specific syntax: '+names(limited.map(n=>n.id)).join(', ')]:[])]};
 }
 // VTP semantics: off does not forward advertisements, transparent can relay
 // advertisements in supported VTP versions; both avoid VLAN database sync.
 const modes=new Map();
 for(const n of relevant.filter(supported)){
  const d=parsed.get(n.id),k=d.vtp?.value||'unknown';if(!modes.has(k))modes.set(k,[]);modes.get(k).push(d);
 }
 for(const [mode,rows] of modes){
  const status=mode==='off'?'GOOD':mode==='transparent'||mode==='unknown'?'VERIFY':'VERIFY';
  const explanation=mode==='off'?
   'VTP off does not participate in VLAN synchronization and does not relay received VTP advertisements. This supports local VLAN control-plane isolation.':
   mode==='transparent'?
   'VTP transparent does not synchronize its local VLAN database; VTP version 2 advertisements can still be forwarded across trunks. It is not equivalent to off for advertisement containment.':
   mode==='server'||mode==='client'?
   'VTP '+mode+' participates in VLAN database distribution. That can be intentional; domain trust, change control and authentication must be reviewed.':
   'The VTP mode was not identified. Do not infer an operating mode from platform metadata alone.';
  add({id:'STP-VTP-'+mode.toUpperCase(),title:'VTP control-plane and VLAN governance',
   status,deviceIds:rows.map(x=>x.id),expected:'Local VLAN governance or explicitly approved VTP distribution policy.',
   observed:rows.length+' device(s) configured as '+mode+'.',explanation,
   networkImpact:mode==='off'?'Unexpected VTP advertisement propagation is prevented by this setting.':
    'VLAN database consistency and advertisement propagation depend on VTP role/version and peer configurations.',
   recommendation:mode==='off'?'Keep VTP off where centralized VTP propagation is not part of the design.':
    'Confirm approved VTP mode/version/domain and validate actual peer propagation.',
   verification:['show vtp status','show interfaces trunk'],evidence:rows.map(d=>idProof(d,d.vtp)),
   references:[REFS.vtp],confidence:mode==='unknown'?'MISSING_DATA':'CONFIG_ONLY'});
 }
 // The network cannot be accepted if adjacent STP modes differ; if the
 // unmapped component has multiple modes, call it a review, not a link failure.
 const modeGroups=new Map();
 for(const n of relevant.filter(supported)){
  const d=parsed.get(n.id),m=d.mode?.value||'unknown';if(!modeGroups.has(m))modeGroups.set(m,[]);
  modeGroups.get(m).push(d);
 }
 const modesKnown=[...modeGroups.keys()].filter(x=>x!=='unknown');
 add({id:'STP-MODE-CONSISTENCY',title:'STP protocol compatibility',status:modesKnown.length>1?'RISK':modeGroups.has('unknown')?'VERIFY':'GOOD',
  severity:modesKnown.length>1?'HIGH':'NONE',deviceIds:relevant.filter(supported).map(n=>n.id),
  expected:'Connected L2 devices use an interoperable STP design, with known protocol boundaries.',
  observed:[...modeGroups].map(([mode,d])=>mode+': '+d.map(x=>x.hostname).join(', ')).join(' · '),
  explanation:modesKnown.length>1?'Different configured STP modes require explicit boundary verification and may invalidate assumed root/forwarding behavior.':'Selected configurations have '+(modesKnown.length===1?'a common STP mode.':'incomplete mode evidence.'),
  networkImpact:'Unexpected STP boundary behavior may alter root selection and topology convergence.',
  recommendation:'Compare device mode against mapped neighbors and the expected VLAN/instance design.',
  evidence:relevant.filter(supported).map(n=>idProof(parsed.get(n.id),parsed.get(n.id).mode)),verification:['show spanning-tree summary','show spanning-tree root'],
  references:[REFS.base],confidence:'CONFIG_ONLY'});
 // Design topology can identify expected port roles; missing physical port
 // mapping is a VERIFY finding, never a silently inferred per-port failure.
 const links=(workspace.links||[]).filter(l=>selected.has(l.a)&&selected.has(l.b)&&l.logical!==true);
 const port=(d,interfaceName)=>d?.interfaces.find(p=>p.name.toLowerCase()===String(interfaceName||'').toLowerCase())||null;
 const roles=[];
 for(const l of links){
  const a=devices.find(x=>x.id===l.a),b=devices.find(x=>x.id===l.b);
  if(!a||!b)continue;
  const da=parsed.get(a.id),db=parsed.get(b.id);
  if(!da||!db||!supported(a)||!supported(b))continue;
  const pa=port(da,l.aPort),pb=port(db,l.bPort);
  const lower=x=>x.role==='lower'||/access|leaf/i.test(String(x.role||''));
  const upper=x=>x.role==='upper'||/core|distribution/i.test(String(x.role||''));
  const kind=upper(a)&&lower(b)?'CORE_TO_ACCESS':lower(a)&&upper(b)?'CORE_TO_ACCESS':
    upper(a)&&upper(b)?'CORE_INTERLINK':lower(a)&&lower(b)?'ACCESS_INTERLINK':'PEER_UNKNOWN';
  roles.push({l,a,b,da,db,pa,pb,kind,core:kind==='CORE_TO_ACCESS'?(upper(a)?{node:a,data:da,port:pa}:{node:b,data:db,port:pb}):null,
    access:kind==='CORE_TO_ACCESS'?(lower(a)?{node:a,data:da,port:pa}:{node:b,data:db,port:pb}):null});
 }
 const downward=roles.filter(r=>r.kind==='CORE_TO_ACCESS');
 const mappedDown=downward.filter(r=>r.core.port&&r.access.port);
 const unmappedDown=downward.filter(r=>!r.core.port||!r.access.port);
 if(mappedDown.length){
  const missing=mappedDown.filter(r=>!r.core.port.rootGuard),configured=mappedDown.filter(r=>r.core.port.rootGuard);
  const certainty=actualMissing(missing.map(r=>r.core.node.id));
  const risks=missing.length>0;
  add({id:'STP-ROOT-CONTAINMENT',title:'Root bridge containment at Core–Access boundary',
   status:risks?(certainty?'RISK':'VERIFY'):'GOOD',severity:risks&&certainty?'HIGH':'NONE',
   deviceIds:mappedDown.flatMap(r=>[r.core.node.id,r.access.node.id]),
   interfaces:missing.map(r=>r.core.node.hostname+' '+r.core.port.name),
   expected:'Where Cores are the intended root candidates, downstream designated Core ports should prevent an Access switch from advertising a superior root.',
   observed:configured.length+'/'+mappedDown.length+' mapped Core-to-Access ports configure Root Guard; missing: '+(missing.map(r=>r.core.node.hostname+' '+r.core.port.name).join(', ')||'none')+'.',
   explanation:risks?'The captured design lacks Root Guard on these mapped downstream Core ports. This is a root-containment exposure, not proof that Access has become root.':
    'Root Guard is configured on the mapped downstream Core ports. VLAN-specific operational designated roles remain unverified.',
   networkImpact:risks?'A downstream device sending superior BPDUs could change root placement, forwarding paths or place the network at instability risk.':'The configured root-containment boundary reduces unwanted root takeover exposure.',
   recommendation:risks?'Validate intended Core root placement and designated ports; apply Root Guard to the appropriate downstream Core interfaces after checking STP roles.':'Verify no root-inconsistent states, root identity and actual designated role for each VLAN.',
   verification:['show spanning-tree root','show spanning-tree interface detail','show spanning-tree inconsistentports'],
   evidence:mappedDown.map(r=>portProof(r.core.data,r.core.port)).concat(configured.map(r=>idProof(r.core.data,r.core.port.rootGuard))),
   references:[REFS.root],confidence:certainty?'DESIGN_TOPOLOGY_CONFIG':'PARTIAL_CONFIG',
   limitations:unmappedDown.length?['Other '+unmappedDown.length+' Core–Access links lack comparable exact interface mapping.']:[]});
 }else if(downward.length){
  add({id:'STP-ROOT-CONTAINMENT',title:'Root bridge containment at Core–Access boundary',
   status:'VERIFY',deviceIds:downward.flatMap(r=>[r.a.id,r.b.id]),
   expected:'Map Core-to-Access ports and assess designated/downstream Root Guard policy.',
   observed:downward.length+' modeled Core–Access links lack comparable two-ended config and port evidence.',
   explanation:'Counting Root Guard commands without mapped ports cannot establish coverage.',
   networkImpact:'Root boundary exposure is unknown, not proven healthy.',
   recommendation:'Supply per-link interface mapping or CDP/LLDP neighbors to associate protected ports.',
   verification:['show cdp neighbors detail','show lldp neighbors detail','show spanning-tree interface detail'],confidence:'TOPOLOGY_ONLY'});
 }
 // Dual-homed Access switches have potential root/alternate uplinks.
 const lowerGroups=new Map();
 for(const r of mappedDown){const id=r.access.node.id;if(!lowerGroups.has(id))lowerGroups.set(id,[]);lowerGroups.get(id).push(r);}
 const redundant=[...lowerGroups.values()].filter(arr=>new Set(arr.map(r=>r.core.node.id)).size>=2);
 if(redundant.length){
  const candidates=redundant.flatMap(arr=>arr.map(r=>r.access)),total=candidates.length;
  const guard=candidates.filter(x=>x.port.loopGuard).length;
  const missing=candidates.filter(x=>!x.port.loopGuard);
  const certainty=actualMissing(missing.map(x=>x.node.id));
  add({id:'STP-LOOP-RESILIENCE',title:'STP alternate/root-port BPDU-loss protection',
   status:missing.length?(certainty?'RISK':'VERIFY'):'GOOD',severity:missing.length&&certainty?'HIGH':'NONE',
   deviceIds:[...new Set(redundant.flatMap(arr=>arr.flatMap(r=>[r.access.node.id,r.core.node.id])))],
   interfaces:missing.map(x=>x.node.hostname+' '+x.port.name),
   expected:'Potential root/alternate uplinks in redundant Layer-2 topology need a documented protection policy against lost BPDUs.',
   observed:guard+'/'+total+' mapped redundant Access uplinks configure Loop Guard; missing: '+(missing.map(x=>x.node.hostname+' '+x.port.name).join(', ')||'none')+'.',
   explanation:missing.length?'The proposed design does not demonstrate Loop Guard on all candidate root/alternate uplinks. Exact effective role can differ by VLAN and failover scenario.':
    'Loop Guard is present on mapped candidate redundant uplinks; verify active roles and platform support.',
   networkImpact:missing.length?'An alternate/root port that stops receiving BPDUs could transition incorrectly to forwarding, potentially causing a Layer-2 loop.':
    'The configuration includes BPDU-loss protection on candidate ports.',
   recommendation:'Validate actual per-VLAN root/alternate states, physical media and any substitute protection before deploying missing controls.',
   verification:['show spanning-tree interface detail','show spanning-tree inconsistentports','show udld interface'],
   evidence:candidates.map(x=>portProof(parsed.get(x.node.id),x.port)).concat(candidates.filter(x=>x.port.loopGuard).map(x=>idProof(parsed.get(x.node.id),x.port.loopGuard))),
   references:[REFS.loop],confidence:certainty?'DESIGN_TOPOLOGY_CONFIG':'PARTIAL_CONFIG',
   limitations:['Loop Guard is not universally mandatory on every trunk and cannot be combined with Root Guard on a single port.']});
 }
 // Access endpoints are different from switch uplinks. Do not demand
 // PortFast or BPDU Guard on Core trunks merely because they are missing.
 const edgeCandidates=[];
 for(const n of relevant.filter(supported).filter(n=>n.role==='lower'||/access|leaf/i.test(String(n.role||'')))){
  const d=parsed.get(n.id);
  for(const p of d.interfaces.filter(p=>p.access&&!p.trunk))edgeCandidates.push({n,d,p});
 }
 if(edgeCandidates.length){
  const guarded=edgeCandidates.filter(x=>x.p.portfast&&x.p.bpduGuard);
  const missing=edgeCandidates.filter(x=>!x.p.portfast||!x.p.bpduGuard);
  const certainty=actualMissing(missing.map(x=>x.n.id));
  add({id:'STP-EDGE-SAFETY',title:'Edge-port forwarding and unexpected BPDU handling',
   status:missing.length?(certainty?'RISK':'VERIFY'):'GOOD',severity:missing.length&&certainty?'MEDIUM':'NONE',
   deviceIds:edgeCandidates.map(x=>x.n.id),interfaces:missing.map(x=>x.n.hostname+' '+x.p.name),
   expected:'Confirmed endpoint-facing access ports should have an explicit edge forwarding and unexpected-BPDU policy.',
   observed:guarded.length+'/'+edgeCandidates.length+' candidate access ports configure both PortFast and BPDU Guard. Missing: '+(missing.map(x=>x.n.hostname+' '+x.p.name).join(', ')||'none')+'.',
   explanation:missing.length?'Access-port configuration indicates an endpoint candidate but does not prove the connected peer; missing protections require design review.':
    'The configured access-port candidates include both edge and BPDU protection; confirm they are actual endpoints.',
   networkImpact:missing.length?'Slow endpoint forwarding and unauthorized STP participation may affect edge access or root behavior.':
    'The access-port policy reduces unintended BPDU participation if ports are genuine endpoints.',
   recommendation:'Confirm each peer is an endpoint, then enable the vendor-supported PortFast/edge and BPDU Guard policy where appropriate.',
   verification:['show spanning-tree interface detail','show cdp neighbors detail','show interfaces status'],
   evidence:edgeCandidates.map(x=>portProof(x.d,x.p)).concat(guarded.flatMap(x=>[idProof(x.d,x.p.portfast),idProof(x.d,x.p.bpduGuard)])),
   references:[REFS.base],confidence:certainty?'DESIGN_ROLE_CONFIG':'PARTIAL_CONFIG',
   limitations:['A switch-facing access port is not necessarily a PortFast edge; verify actual peer identity.']});
 }
 // Link-level consistency is evidence of network behavior, not simply one
 // local command. Existing topology correlator already checks mapped peers.
 if(network?.findings)for(const item of network.findings){
  if(!['TRUNK_NATIVE_MISMATCH','TRUNK_ALLOWED_DIFFERENCE','ROOT_GUARD_HIERARCHY_CHECK','EDGE_PORTFAST_ON_INTERSWITCH'].includes(item.code))continue;
  add({id:'STP-PEER-'+item.code,title:{
    TRUNK_NATIVE_MISMATCH:'Trunk native VLAN consistency',
    TRUNK_ALLOWED_DIFFERENCE:'Allowed VLAN consistency across mapped peers',
    ROOT_GUARD_HIERARCHY_CHECK:'Root Guard placement versus root priority',
    EDGE_PORTFAST_ON_INTERSWITCH:'Unexpected PortFast on inter-switch link'}[item.code],
   status:item.severity==='HIGH'?'RISK':'VERIFY',severity:item.severity==='HIGH'?'HIGH':'MEDIUM',
   deviceIds:devices.filter(n=>String(item.scope||'').includes(n.hostname)).map(n=>n.id),
   expected:'Mapped peer interfaces must have compatible forwarding and STP roles.',
   observed:item.message,explanation:'Detected by comparison of exact modeled link endpoints and supplied configuration.',
   networkImpact:'Potential mismatch can affect frame forwarding, STP behavior or expected root placement.',
   recommendation:'Review the two linked interface configurations before applying any remediation.',
   verification:[item.verification||'show interfaces trunk; show spanning-tree root'],
   evidence:item.evidence||[],confidence:'CONFIG_TOPOLOGY',references:[REFS.base]});
 }
 // UDLD applicability is media and platform dependent. Do not label
 // absence a proven failure when no fiber or policy evidence is available.
 const interSwitch=roles.filter(r=>r.pa&&r.pb);
 if(interSwitch.length){
  const endpoints=interSwitch.flatMap(r=>[{d:r.da,p:r.pa},{d:r.db,p:r.pb}]);
  const count=endpoints.filter(x=>x.p.udld?.value==='aggressive').length;
  add({id:'STP-UDLD-PHYSICAL',title:'Unidirectional-link detection on network uplinks',
   status:count?'VERIFY':'VERIFY',
   deviceIds:interSwitch.flatMap(r=>[r.a.id,r.b.id]),
   expected:'Physical links that require unidirectional-failure detection should have a platform/media-appropriate UDLD policy on both ends.',
   observed:count+'/'+endpoints.length+' mapped inter-switch endpoints explicitly configure UDLD aggressive.',
   explanation:'UDLD is media/platform dependent; absence alone is not a confirmed defect, and a configured command is not proof of operational bidirectional status.',
   networkImpact:'Unidirectional failures on redundant Layer-2 links may affect STP protection and forwarding safety.',
   recommendation:'Identify uplink media, check peer support and verify live UDLD status before assigning compliance.',
   verification:['show interfaces status','show udld interface','show lldp neighbors detail'],
   evidence:endpoints.map(x=>portProof(x.d,x.p)).concat(endpoints.filter(x=>x.p.udld).map(x=>idProof(x.d,x.p.udld))),
   confidence:'MEDIA_UNVERIFIED',references:[REFS.loop]});
 }
 // Never normalize operational samples and generated design config as the same provenance.
 if(operational?.devices?.some(x=>x.present)){
  const observed=operational.devices.filter(x=>selected.has(x.deviceId)&&x.present);
  add({id:'STP-OBSERVED-COVERAGE',title:'Operational verification evidence coverage',status:'VERIFY',
   deviceIds:observed.map(x=>x.deviceId),
   expected:'Root identity and STP port roles should be corroborated by current, correctly sourced CLI captures.',
   observed:observed.length+'/'+devices.length+' devices supplied observed/synthetic captures; '+observed.filter(x=>x.syntheticOnly).length+' synthetic LAB only.',
   explanation:'The existence of show-tech is not equivalent to verifying every STP control.',
   networkImpact:'Current state and convergence remain partially or wholly unverified.',
   recommendation:'Confirm capture timestamps; replace synthetic LAB with real device evidence before production acceptance.',
   verification:['show spanning-tree root','show spanning-tree interface detail','show version'],
   evidence:observed.flatMap(x=>x.captures.map(c=>(c.synthetic?'SYNTHETIC LAB: ':'CAPTURE: ')+x.hostname+' '+c.filename)),
   confidence:observed.some(x=>x.syntheticOnly)?'SYNTHETIC':'OPERATIONAL_PARTIAL',
   provenance:observed.some(x=>x.syntheticOnly)?'SYNTHETIC_LAB':'OBSERVED_CLI'});
 }
 return finalize();
}
root.NetworkEngineeringFindingsV1={run,version:'1.0.0',sources:REFS};
})(typeof window==='undefined'?globalThis:window);
