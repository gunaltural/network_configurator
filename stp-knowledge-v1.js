/* Engineering Knowledge Catalog V1: curated, version-scoped Cisco campus L2 references.
   Deterministic configuration observations are not an LLM diagnosis or live RAG. */
(function(root){
'use strict';
const SOURCES={
 vtp:{title:'Cisco Catalyst 9300 IOS XE 17.17 — Configuring VTP',url:'https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-17/configuration_guide/vlan/b_1717_vlan_9300_cg/configuring_vtp.html'},
 trunk:{title:'Cisco Catalyst 9300 IOS XE 17.15 — Configuring VLAN Trunks',url:'https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-15/configuration_guide/vlan/b_1715_vlan_9300_cg/configuring_vlan_trunks.html'},
 stp:{title:'Cisco Catalyst 9300 IOS XE 17.1 — Optional STP Features',url:'https://www.cisco.com/c/dam/en/us/td/docs/switches/lan/catalyst9300/software/release/17-1/configuration_guide/lyr2/configuring_optional_spanning_tree_features.html'}
};
const PARAMETERS=[
 {id:'vtpMode',label:'VTP VLAN database',design:'campusVtp',source:'vtp'},
 {id:'vtpVersion',label:'VTP version',design:'campusVtp',source:'vtp'},
 {id:'vtpDomain',label:'VTP domain',design:'campusVtpDomain',source:'vtp'},
 {id:'vtpPassword',label:'VTP authentication',design:'campusVtp',source:'vtp'},
 {id:'nativeVlan',label:'Native VLAN',design:'campusNativeVlan',source:'trunk'},
 {id:'allowedVlans',label:'Trunk allowed VLANs',design:'campusVlans',source:'trunk'},
 {id:'dtp',label:'Dynamic Trunking Protocol',design:'campusNoDtp',source:'trunk'},
 {id:'stpMode',label:'STP mode',design:'stpMode',source:'stp'},
 {id:'bridgePriority',label:'Bridge/root priority',design:'stpRoot',source:'stp'},
 {id:'bpduGuard',label:'BPDU Guard',design:'bpduguard',source:'stp'},
 {id:'rootGuard',label:'Root Guard',design:'rootguard',source:'stp'},
 {id:'portfast',label:'PortFast / edge ports',design:'portfast',source:'stp'},
 {id:'loopGuard',label:'Loop Guard',design:'swvLoop',source:'stp'},
 {id:'mstRegion',label:'MST region / instance mapping',design:'stpMode',source:'stp'}
];
function parse(node,raw){
 const text=String(raw||''),rows=text.replace(/\r\n?/g,'\n').split('\n');
 const observed={vtpMode:[],vtpVersion:[],vtpDomain:[],vtpPassword:[],nativeVlan:[],allowedVlans:[],dtp:[],stpMode:[],bridgePriority:[],bpduGuard:[],rootGuard:[],portfast:[],loopGuard:[],mstRegion:[]};
 let iface=null,mst=false;
 rows.forEach((line,i)=>{
  const t=line.trim(),number=i+1;
  if(/^interface\s+\S+/i.test(t)){iface=t.replace(/^interface\s+/i,'');mst=false;}
  else if(/^spanning-tree mst configuration$/i.test(t)){mst=true;iface=null;}
  else if(/^(?:!|end|exit)$/.test(t)){iface=null;mst=false;}
  const hit=(key,re,val)=>{const m=t.match(re);if(m)observed[key].push({value:val?val(m):m[1],line:number,iface,command:t});};
  hit('vtpMode',/^vtp mode\s+(server|client|transparent|off)/i,m=>m[1].toLowerCase());
  hit('vtpVersion',/^vtp version\s+([123])/i,m=>m[1]);
  hit('vtpDomain',/^vtp domain\s+(.+)$/i,m=>m[1].trim());
  // Only the existence of a secret is observed; never expose or copy it into findings.
  hit('vtpPassword',/^vtp password\s+(.+)$/i,()=>'<configured — value withheld>');
  hit('nativeVlan',/^switchport trunk native vlan\s+(\d+)/i,m=>m[1]);
  hit('allowedVlans',/^switchport trunk allowed vlan\s+(.+)$/i,m=>m[1].trim());
  if(iface&&/^(?:switchport nonegotiate|switchport mode dynamic (?:auto|desirable)|switchport mode trunk|switchport mode access)$/i.test(t)){
   observed.dtp.push({value:t.toLowerCase(),line:number,iface,command:t});
  }
  hit('stpMode',/^spanning-tree mode\s+([\w-]+)/i,m=>m[1].toLowerCase());
  hit('bridgePriority',/^spanning-tree (?:vlan|mst)\s+([\d,\s-]+)\s+(?:priority\s+\d+|root\s+(?:primary|secondary))/i,()=>t);
  hit('bpduGuard',/^spanning-tree (?:portfast (?:edge )?bpduguard|bpduguard)/i,()=>t);
  hit('rootGuard',/^spanning-tree guard root/i,()=>t);
  hit('portfast',/^spanning-tree portfast(?:\s|$)/i,()=>t);
  hit('loopGuard',/^spanning-tree (?:loopguard|guard loop)/i,()=>t);
  if(mst&&/^(?:name|revision|instance)\s+/i.test(t))observed.mstRegion.push({value:t,line:number,iface:null,command:t});
 });
 return {id:node.id,hostname:node.hostname,vendor:node.vendor,platform:String(node.vendor||''),hasCapture:!!text.trim(),observed};
}
const ref=(d,o)=>d.hostname+' config L'+o.line+(o.iface?' ('+o.iface+')':'');
function review(workspace,ids){
 const selected=new Set(ids||[]),devices=workspace.nodes.filter(n=>selected.has(n.id));
 if(!devices.length)throw Error('Choose at least one device for the knowledge review.');
 const configs=workspace.configs||[];
 const parsed=devices.map(n=>parse(n,configs.find(c=>c.deviceId===n.id)?.text));
 const entries=[],add=(parameter,severity,title,impact,evidence,source,limitation='')=>
  entries.push({parameter,severity,title,impact,evidence,source:SOURCES[source],limitation});
 for(const d of parsed){
  if(!d.hasCapture){add('capture','missing',d.hostname+': configuration not attached','Configuration cannot be assessed without a capture.',[], 'stp');continue;}
  const o=d.observed;
  for(const v of o.vtpMode){
   const val=v.value;
   if(val==='transparent')add('vtpMode','info',d.hostname+': VTP transparent','VLAN database changes remain local; VTPv2/v3 advertisements can still transit trunks. Central VLAN changes will not synchronize this device.',[ref(d,v)],'vtp','VTP version and trunk connectivity must be verified for forwarding behavior.');
   if(val==='off')add('vtpMode','info',d.hostname+': VTP off','Local VLAN management without forwarding VTP advertisements; reduces VTP propagation but introduces manual VLAN lifecycle work.',[ref(d,v)],'vtp');
   if(val==='server'||val==='client')add('vtpMode','review',d.hostname+': VTP '+val,'A shared VTP domain can synchronize VLAN changes across trunks. Validate authorized primary/servers, domain/version, change control and revision before onboarding devices.',[ref(d,v)],'vtp','The running configuration alone does not prove operational primary status or authentication.');
  }
  for(const v of o.vtpVersion)if(v.value==='3')
   add('vtpVersion','info',d.hostname+': VTPv3','VTPv3 supports a primary-server takeover workflow and enhanced authentication; it is not a blanket vulnerability. A mistaken authorized takeover or poor credential/change management can still propagate unintended VLAN changes.',[ref(d,v)],'vtp','Primary-server state, domain, password state and revision require show vtp status.');
  const modes=o.vtpMode.map(x=>x.value);
  if(modes.some(x=>x==='server'||x==='client')&&!o.vtpDomain.length)
   add('vtpDomain','review',d.hostname+': VTP domain not observed','Verify intended domain and operational state; missing config lines alone cannot prove the domain is absent.',o.vtpMode.map(v=>ref(d,v)),'vtp');
  if(modes.some(x=>x==='server'||x==='client')&&!o.vtpPassword.length)
   add('vtpPassword','review',d.hostname+': VTP password not observed','Review VTP authentication controls and primary takeover privileges; running configuration may omit or protect credentials.',o.vtpMode.map(v=>ref(d,v)),'vtp');
  for(const v of o.nativeVlan)if(v.value==='1')add('nativeVlan','review',d.hostname+': native VLAN 1 on '+v.iface,'Using VLAN 1 as native can enlarge exposure to unintended untagged traffic and, under particular access/trunk/tagging conditions, double-tagging VLAN hopping. Do not claim an exploitable attack from this line alone.',[ref(d,v)],'trunk','Check peer native VLAN, user VLAN membership, trunk allowed list and native tagging.');
  for(const v of o.allowedVlans)if(/^(?:all|1-4094)$/i.test(v.value))
   add('allowedVlans','review',d.hostname+': broad allowed VLAN set on '+v.iface,'Broad trunk VLAN scope can extend unnecessary broadcast/unknown-unicast flooding and failure domains. Prune according to actual downstream VLAN requirements.',[ref(d,v)],'trunk','Allowed-list changes must preserve required control and service VLANs.');
  for(const v of o.dtp)if(/dynamic (auto|desirable)/.test(v.value))
   add('dtp','review',d.hostname+': dynamic trunk negotiation on '+v.iface,'Dynamic DTP negotiation allows trunk state to depend on the neighbor and may expand unintended trunk exposure. Use explicit port mode where the topology demands it.',[ref(d,v)],'trunk','DTP negotiation delay is not proven from configuration alone.');
  for(const v of o.portfast)if(v.iface){
   const trunk=o.dtp.some(x=>x.iface===v.iface&&x.value==='switchport mode trunk');
   if(trunk)add('portfast','review',d.hostname+': PortFast configured on trunk '+v.iface,'PortFast on a trunk may be appropriate for a single endpoint such as a server, but is unsafe for a switch-to-switch link unless topology and loop safety are verified.',[ref(d,v)],'stp');
  }
  for(const g of o.rootGuard){const collision=o.loopGuard.find(x=>x.iface&&x.iface===g.iface);if(collision)
   add('rootGuard','warning',d.hostname+': root guard and loop guard on '+g.iface,'The two safeguards are not intended simultaneously on the same interface; check vendor support and correct port role.',[ref(d,g),ref(d,collision)],'stp');}
 }
 // Compare per-endpoint native VLAN only when exact link port names are present.
 for(const link of workspace.links||[]){
  const a=parsed.find(d=>d.id===link.a),b=parsed.find(d=>d.id===link.b);
  if(!a||!b||!link.aPort||!link.bPort)continue;
  const av=a.observed.nativeVlan.find(v=>v.iface===link.aPort),bv=b.observed.nativeVlan.find(v=>v.iface===link.bPort);
  if(av&&bv&&av.value!==bv.value)add('nativeVlan','warning',a.hostname+' ↔ '+b.hostname+': native VLAN mismatch','The explicitly mapped trunk endpoints have different native VLANs; this may cause untagged traffic misclassification and STP inconsistency. Verify trunk operational status before predicting impact.',[ref(a,av),ref(b,bv)],'trunk','Link endpoint mapping is user-provided topology intent, not observed cabling.');
 }
 if(!entries.length)add('scope','info','No explicit catalog findings','No relevant configuration contradiction was detected in the subset of known commands; this is not evidence of compliance.',[],'stp','Vendor defaults and operational state remain unknown.');
 const coverage=PARAMETERS.map(p=>({id:p.id,label:p.label,design:p.design,source:SOURCES[p.source],devices:parsed.map(d=>({hostname:d.hostname,seen:d.observed[p.id].length>0,refs:d.observed[p.id].map(o=>ref(d,o))}))}));
 return {kind:'source-curated-knowledge-catalog-v1-not-live-rag',devices:parsed.map(d=>d.hostname),entries,coverage,sourceScope:'Cisco Catalyst IOS XE references; adapt semantics to exact vendor/platform before adopting recommendations',furtherEvidence:['show vtp status','show interfaces trunk','show interfaces switchport','show spanning-tree root','show spanning-tree detail','show etherchannel summary']};
}
function format(r){
 const out=['STP Engineering Knowledge Catalog V1 — configuration review; NOT live RAG / confirmed AI diagnosis',
  'Selected: '+r.devices.join(', '),'Documentation scope: '+r.sourceScope,''];
 for(const e of r.entries){
  out.push('['+e.severity.toUpperCase()+'] '+e.title,'  Behavior / trade-offs: '+e.impact,'  Config evidence: '+(e.evidence.join(' ; ')||'Not established'),'  Cisco source: '+e.source.title+' | '+e.source.url);
  if(e.limitation)out.push('  Evidence limitation: '+e.limitation);
  out.push('');
 }
 out.push('PARAMETER COVERAGE (absence is unknown, not disabled)');
 for(const p of r.coverage)out.push(p.label+': '+p.devices.map(d=>d.hostname+'='+ (d.seen?'observed':'not observed')).join('; '));
 out.push('Read-only validation: '+r.furtherEvidence.join(' | '));
 return out.join('\n');
}
function context(r){
 return ['Catalog type: curated Cisco documentation, not online retrieval; findings need independent reasoning.',
 ...r.entries.slice(0,8).map(e=>e.title+': '+e.impact+' [source '+e.source.url+'] Evidence '+e.evidence.join(', ')+' Limit '+e.limitation)].map(s=>s.slice(0,260));
}
root.NetworkSTPKnowledgeV1={sources:SOURCES,parameters:PARAMETERS,parse,review,format,context};
})(typeof window==='undefined'?globalThis:window);