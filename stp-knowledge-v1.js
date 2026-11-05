/* Engineering Knowledge Catalog V1: curated, version-scoped Cisco campus L2 references.
   Deterministic configuration observations are not an LLM diagnosis or live RAG. */
(function(root){
'use strict';
const SOURCES={
 vtp:{title:'Cisco Catalyst 9300 IOS XE 17.17 — Configuring VTP',url:'https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-17/configuration_guide/vlan/b_1717_vlan_9300_cg/configuring_vtp.html'},
 trunk:{title:'Cisco Catalyst 9300 IOS XE 17.15 — Configuring VLAN Trunks',url:'https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-15/configuration_guide/vlan/b_1715_vlan_9300_cg/configuring_vlan_trunks.html'},
 stp:{title:'Cisco Catalyst 9300 IOS XE 17.1 — Optional STP Features',url:'https://www.cisco.com/c/dam/en/us/td/docs/switches/lan/catalyst9300/software/release/17-1/configuration_guide/lyr2/configuring_optional_spanning_tree_features.html'}
};
const STANDARDS={
 ieee8021d:{title:'IEEE 802.1D — MAC Bridges / original STP',url:'https://www.ieee802.org/1/pages/802.1D.html',role:'protocol',scope:'Classical 802.1D STP behavior, root bridge, port roles and legacy timer-based convergence; do not infer exact convergence time from config alone.'},
 ieee8021w:{title:'IEEE 802.1w — Rapid Reconfiguration (RSTP)',url:'https://www.ieee802.org/1/pages/802.1w.html',role:'protocol',scope:'Rapid topology reconvergence via alternate/backup ports and proposal/agreement; actual behavior depends on neighbor compatibility and operational port state. Incorporated into 802.1D-2004.'},
 ieee8021s:{title:'IEEE 802.1s — Multiple Spanning Trees (MSTP)',url:'https://www.ieee802.org/1/pages/802.1s.html',role:'protocol',scope:'VLANs can share MST instances and different spanning tree forwarding paths; meaningful load distribution requires planned root/instance mappings and consistent regions.'},
 ieee8021q:{title:'IEEE 802.1Q — Bridges and Bridged Networks',url:'https://www.ieee802.org/1/pages/802.1Q.html',role:'protocol',scope:'Consolidated VLAN bridging and MSTP standard; evaluate CIST/MSTI region name, revision and VLAN-to-instance consistency. Original 802.1s is an amendment, not a separate current RFC.'},
 rfc4188:{title:'RFC 4188 — Definitions of Managed Objects for Bridges',url:'https://www.rfc-editor.org/info/rfc4188',role:'management-mib',scope:'BRIDGE-MIB objects for bridge priority, designated root, root port, topology change counters and per-port state; an SNMP observable is not proven by a running config.'},
 rfc4318:{title:'RFC 4318 — Definitions of Managed Objects for Bridges with RSTP',url:'https://www.rfc-editor.org/info/rfc4318',role:'management-mib',scope:'RSTP-MIB objects such as dot1dStpVersion, dot1dStpTxHoldCount and port protocol migration; require SNMP/RSTP operational evidence and correct MIB support.'},
 rfc7727:{title:'RFC 7727 — STP Application of ICCP',url:'https://www.rfc-editor.org/info/rfc7727',role:'conditional-inter-chassis',scope:'ICCP STP application for redundant Provider Edge groups serving multihomed STP/VPLS networks; does NOT describe arbitrary Cisco vPC, Arista MLAG or Huawei M-LAG STP synchronization. Apply only with explicit ICCP/PE redundancy evidence.'}
};
const STANDARD_REFERENCES={
 stpMode:['ieee8021d','ieee8021w','ieee8021s','ieee8021q','rfc4188','rfc4318'],
 bridgePriority:['ieee8021d','ieee8021q','rfc4188'],
 mstRegion:['ieee8021s','ieee8021q'],
 portfast:['ieee8021w','ieee8021q'],
 bpduGuard:['ieee8021d','ieee8021w'],
 rootGuard:['ieee8021d','ieee8021q'],
 loopGuard:['ieee8021w','ieee8021q'],
 nativeVlan:['ieee8021q'],
 allowedVlans:['ieee8021q'],
 vtpMode:[],vtpVersion:[],vtpDomain:[],vtpPassword:[],dtp:[]
};
const PARAMETERS=[
 {id:'vtpMode',label:'VTP VLAN database',design:'campusVtp',source:'vtp'},
 {id:'vtpVersion',label:'VTP version',design:'campusVtp',source:'vtp'},
 {id:'vtpDomain',label:'VTP domain',design:'campusVtpDomain',source:'vtp'},
 {id:'vtpPassword',label:'VTP authentication',design:'campusVtp',source:'vtp'},
 {id:'nativeVlan',label:'Native VLAN',design:'campusNativeVlan',source:'trunk'},
 {id:'allowedVlans',label:'Trunk allowed VLANs',design:'stpVlans',source:'trunk'},
 {id:'dtp',label:'Dynamic Trunking Protocol',design:'campusNoDtp',source:'trunk'},
 {id:'stpMode',label:'STP mode',design:'stpMode',source:'stp'},
 {id:'bridgePriority',label:'Bridge/root priority',design:'stpRootPri',source:'stp'},
 {id:'bpduGuard',label:'BPDU Guard',design:'bpduguard',source:'stp'},
 {id:'rootGuard',label:'Root Guard',design:'rootguard',source:'stp'},
 {id:'portfast',label:'PortFast / edge ports',design:'portfast',source:'stp'},
 {id:'loopGuard',label:'Loop Guard',design:'loopguard',source:'stp'},
 {id:'mstRegion',label:'MST region / instance mapping',design:'campusMstName',source:'stp'}
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
  const hit=(key,re,val)=>{const m=t.match(re);if(m)observed[key].push({value:val?val(m):m[1],line:number,iface,command:key==='vtpPassword'?'vtp password [REDACTED]':t});};
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
  for(const value of o.stpMode){
   const mode=value.value;
   if(/^(?:rstp|rapid-pvst|rapid-pvst\+)$/.test(mode))
    add('stpMode','info',d.hostname+': rapid STP operating mode configured','RSTP uses rapid port role/state transitions and proposal/agreement on compatible point-to-point links. Convergence within a particular number of seconds cannot be inferred from mode alone; confirm observed port roles and neighbor compatibility.',[ref(d,value)],'stp','IEEE 802.1w (incorporated into 802.1D-2004); verify actual mode and operating state.');
   else if(/^(?:mst|mstp)$/.test(mode))
    add('stpMode','info',d.hostname+': MSTP configured','IEEE 802.1s / 802.1Q allows multiple VLANs to share CIST/MST instances; verify region name, revision and VLAN-to-instance mapping across peers. Instance-based load distribution requires deliberate root placement.',[ref(d,value)],'stp','IEEE 802.1Q MST region consistency depends on all relevant peer configurations.');
   else if(/^(?:stp|pvst|pvst\+)$/.test(mode))
    add('stpMode','review',d.hostname+': legacy STP mode configured','Classical IEEE 802.1D operation generally reconverges more slowly than rapid STP; do not assert measured convergence delay without BPDU/port-state observations.',[ref(d,value)],'stp','Vendor PVST extensions are not identical to the single-tree IEEE 802.1D standard.');
  }
  if(o.mstRegion.length){
   add('mstRegion','info',d.hostname+': MST region parameters observed','MST instances and VLAN mappings should match intended regional peers. Different names, revisions or mappings can create a region boundary and alter expected CIST/MST forwarding.',o.mstRegion.slice(0,6).map(x=>ref(d,x)),'stp','IEEE 802.1s/802.1Q defines MST relationships; configuration alone does not prove active root roles.');
  }
  // RFC 4188 / RFC 4318 describe SNMP management observables, not additional
  // device-running-configuration requirements or proof of operational state.
  for(const v of o.vtpMode){
   const val=v.value;
   if(val==='transparent')add('vtpMode','info',d.hostname+': VTP transparent','VLAN database changes remain local; VTPv2/v3 advertisements can still be forwarded across trunks. Central VLAN changes will not synchronize this device.',[ref(d,v)],'vtp','VTP version and trunk connectivity must be verified for forwarding behavior.');
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
  if(/\biccp\b/i.test((configs.find(c=>c.deviceId===d.id)?.text)||'')&&/(?:\bpe\b|\bvpls\b|redundancy[ -]?group)/i.test((configs.find(c=>c.deviceId===d.id)?.text)||''))
   add('iccp','review',d.hostname+': ICCP-related terminology detected','RFC 7727 defines STP synchronization TLVs and virtual-root behavior for an ICCP PE redundancy group. Determine whether this deployment implements the RFC 7727 STP application before applying its conditions; matching keywords are not sufficient proof.',[],'stp','RFC 7727 source is a conditional reference, not a vendor-agnostic MLAG rule.');
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
 const coverage=PARAMETERS.map(p=>({id:p.id,label:p.label,design:p.design,source:SOURCES[p.source],standards:(STANDARD_REFERENCES[p.id]||[]).map(id=>STANDARDS[id]),devices:parsed.map(d=>({hostname:d.hostname,seen:d.observed[p.id].length>0,refs:d.observed[p.id].map(o=>ref(d,o))}))}));
 return {kind:'source-curated-knowledge-catalog-v1-not-live-rag',devices:parsed.map(d=>d.hostname),entries,coverage,standards:STANDARDS,sourceScope:'Cisco Catalyst IOS XE references; adapt semantics to exact vendor/platform before adopting recommendations',furtherEvidence:['show vtp status','show interfaces trunk','show interfaces switchport','show spanning-tree root','show spanning-tree detail','show etherchannel summary']};
}
function format(r,language){
 const tr=String(language||'').toLowerCase().startsWith('tr');
 const labels=tr?{
  title:'STP MÜHENDİSLİK DEĞERLENDİRMESİ — KAYNAKLI KONFİGÜRASYON ANALİZİ',
  status:'YEREL DETERMINISTIK KONTROL • AI MODELİ ÇALIŞTIRILMADI',
  devices:'Kapsamdaki cihazlar',summary:'YÖNETİCİ ÖZETİ',findings:'ÖNCELİKLİ BULGULAR',
  observed:'Gözlem/kanıt',behavior:'Neden önemli?',action:'Önerilen aksiyon',limit:'Doğrulama sınırı',
  source:'Üretici kaynağı',checks:'DOĞRULAMA PLANI',standards:'İLGİLİ STANDARTLAR',
  absence:'Konfigürasyonda görülmeyen özellik, devre dışı kabul edilemez.',
  noFault:'Bu rapor canlı root bridge, port durumları veya gerçek bir kesinti tespit edildiğini iddia etmez.',
  noFindings:'Açık konfigürasyon çelişkisi saptanmadı; bu, ağın doğru veya risksiz olduğunu kanıtlamaz.',
  missing:'Cihazdan canlı show çıktılarıyla doğrulanmalı.',
  actions:{vtpMode:'show vtp status ve show vlan brief ile her iki Core üzerindeki VLAN yönetimini karşılaştırın.',
   vtpVersion:'show vtp status üzerinden primary-server rolünü, VTP sürümünü ve değişiklik yetkilerini doğrulayın.',
   vtpDomain:'VTP domain ve değişiklik prosedürünü inceleyin; eksik satırı tek başına güvenlik açığı saymayın.',
   vtpPassword:'Parolayı rapora yazmadan VTP kimlik doğrulaması ve yetkilerini doğrulayın.',
   nativeVlan:'Her iki uçta show interfaces trunk ile native VLAN değerlerini ve kullanılmayan VLAN izolasyonunu doğrulayın.',
   allowedVlans:'show interfaces trunk ile gerekli VLAN listesini doğrulayın; değişiklik öncesi servis bağımlılıklarını çıkarın.',
   dtp:'Trunk gerektiren portları belirleyin; komşu ve DTP davranışını show interfaces switchport ile doğrulayın.',
   stpMode:'show spanning-tree summary ve show spanning-tree root ile iki Core arasında mod ve root tutarlılığını inceleyin.',
   mstRegion:'MST name, revision ve VLAN-instance map değerlerini iki uçta karşılaştırın.',
   default:'İlgili portun görevini ve canlı STP durumunu doğrulamadan konfigürasyon değişikliği önermeyin.'}
 }:{
  title:'STP ENGINEERING ASSESSMENT — EVIDENCE-BASED CONFIGURATION REVIEW',
  status:'LOCAL DETERMINISTIC REVIEW • NO AI MODEL WAS RUN',
  devices:'Selected devices',summary:'EXECUTIVE SUMMARY',findings:'PRIORITIZED ENGINEERING FINDINGS',
  observed:'Configuration evidence',behavior:'Engineering implication',action:'Recommended action',limit:'Evidence limitation',
  source:'Vendor reference',checks:'READ-ONLY VERIFICATION PLAN',standards:'RELEVANT STANDARDS',
  absence:'A missing configuration statement is not proof that a feature is disabled.',
  noFault:'This report does not prove live root bridge, port states or operational outages.',
  noFindings:'No explicit configuration contradiction found; this is not assurance of correctness.',
  missing:'Requires corroboration from live show commands.',
  actions:{vtpMode:'Compare show vtp status and show vlan brief on both Cores to validate VLAN lifecycle.',
   vtpVersion:'Verify VTPv3 primary server status, version and authorization with show vtp status.',
   vtpDomain:'Check operational VTP domain and change-control process; omission is not proof of an issue.',
   vtpPassword:'Validate VTP authentication without exposing secret values in the report.',
   nativeVlan:'Verify native VLAN and peer trunk policy with show interfaces trunk on both ends.',
   allowedVlans:'Validate intended trunk VLAN scope before pruning live services.',
   dtp:'Confirm neighbor port purpose and DTP state using show interfaces switchport.',
   stpMode:'Compare show spanning-tree summary and show spanning-tree root between selected Cores.',
   mstRegion:'Compare MST name, revision and instance-to-VLAN maps on both peers.',
   default:'Validate actual interface roles and live STP state before suggesting a configuration change.'}
 };
 const sorted=[...r.entries].sort((a,b)=>({warning:0,review:1,missing:2,info:3}[a.severity]??4)-({warning:0,review:1,missing:2,info:3}[b.severity]??4));
 const counts={warning:sorted.filter(x=>x.severity==='warning').length,review:sorted.filter(x=>x.severity==='review').length,info:sorted.filter(x=>x.severity==='info').length};
 const out=['# '+labels.title,labels.status,'',labels.devices+': '+r.devices.join(' ↔ '),
  '', '## '+labels.summary,
  tr?'Konfigürasyondan '+counts.warning+' yüksek öncelikli, '+counts.review+' inceleme gerektiren bulgu ve '+counts.info+' bilgi notu çıkarıldı. Öncelik canlı kesinti kanıtı değildir.'
    :counts.warning+' high-priority, '+counts.review+' review-required and '+counts.info+' informational observations from supplied configuration; priority is not proof of impact.',
  labels.noFault,labels.absence,'','## '+labels.findings];
 if(!sorted.length)out.push(labels.noFindings);
 for(const [i,e] of sorted.entries()){
  out.push((i+1)+'. ['+e.severity.toUpperCase()+'] '+e.title,
   '   '+labels.observed+': '+(e.evidence.join(' | ')||labels.missing),
   '   '+labels.behavior+': '+e.impact,
   '   '+labels.action+': '+(labels.actions[e.parameter]||labels.actions.default),
   '   '+labels.limit+': '+(e.limitation||labels.missing),
   '   '+labels.source+': '+e.source.title+' — '+e.source.url,'');
 }
 out.push('## '+labels.checks);
 for(const line of r.furtherEvidence)out.push('- '+line);
 out.push('', '## '+labels.standards);
 const relevant=new Map();
 for(const item of r.coverage){
  if(item.devices.some(d=>d.seen))for(const standard of item.standards)
   relevant.set(standard.url,standard.title+' — '+standard.url);
 }
 for(const source of relevant.values())out.push('- '+source);
 out.push(tr?'RFC 4188/4318 MIB gözlem kaynaklarıdır; mevcut SNMP verisi olmadan operasyonel bulgu değildir.'
  :'RFC 4188/4318 specify SNMP observability; they are not operational findings absent measurements.');
 out.push(tr?'RFC 7727 yalnız ICCP Provider Edge bağlamı doğrulandığında uygulanır.'
  :'RFC 7727 applies only when an ICCP Provider Edge context is established.');
 return out.join('\n');
}
function context(r){
 return ['Catalog type: curated vendor documentation, IEEE protocol standards and IETF MIB/ICCP RFC descriptions, NOT live retrieval; treat all as engineering questions, NOT device observations.',
 'IEEE 802.1D / 802.1w / 802.1s as incorporated into 802.1Q: root election, RSTP transitions, MST CIST and region mapping; require operational verification.',
 'RFC 4188 BRIDGE-MIB and RFC 4318 RSTP-MIB provide SNMP management observables, not independent proof of an observed configuration.',
 'RFC 7727 applies ONLY when ICCP STP application for redundant PE / VPLS is evidenced; do not apply automatically to Cisco vPC, Arista MLAG or campus Core pair.',
 ...r.entries.slice(0,8).map(e=>e.title+': '+e.impact+' [source '+e.source.url+'] Evidence '+e.evidence.join(', ')+' Limit '+e.limitation)].map(s=>s.slice(0,260));
}
root.NetworkSTPKnowledgeV1={sources:SOURCES,standards:STANDARDS,parameterStandards:STANDARD_REFERENCES,parameters:PARAMETERS,parse,review,format,context};
})(typeof window==='undefined'?globalThis:window);