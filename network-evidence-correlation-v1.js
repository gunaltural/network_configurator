/* Read-only, source-scoped engineering evidence correlation.
 * Explicit output capture is evidence; Design CLI is intent, never proof of deployment.
 * No compliance PASS/FAIL or automatically validated AI root cause is claimed.
 */
(function(root){'use strict';
const VERSION='1.0.0';
const SOURCES={
 BGP:{title:'Cisco BGP troubleshooting',url:'https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/218027-troubleshoot-border-gateway-protocol-bas.html',scope:'Cisco IOS/IOS-XE; validate syntax and device release'},
 ARISTA_BGP:{title:'Arista EOS BGP reference',url:'https://www.arista.com/en/um-eos/eos-border-gateway-protocol-bgp',scope:'Arista EOS online guide; confirm installed release'},
 ARISTA_MLAG:{title:'Arista EOS MLAG verification',url:'https://www.arista.com/ko/um-eos/eos-multi-chassis-link-aggregation',scope:'Arista EOS online guide; confirm installed release'},
 OSPF:{title:'Cisco OSPF troubleshooting',url:'https://www.cisco.com/c/en/us/support/docs/ip/open-shortest-path-first-ospf/13699-29.html',scope:'Cisco IOS/IOS-XE; validate device release'},
 EVPN:{title:'Cisco NX-OS VXLAN EVPN verification',url:'https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus9000/sw/7-x/vxlan/configuration/guide/b_Cisco_Nexus_9000_Series_NX-OS_VXLAN_Configuration_Guide_7x/b_Cisco_Nexus_9000_Series_NX-OS_VXLAN_Configuration_Guide_7x_chapter_0100.html',scope:'NX-OS 7.x; validate exact platform and release'},
 VPC:{title:'Cisco Nexus vPC guide',url:'https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/102x/configuration/interfaces/cisco-nexus-9000-nx-os-interfaces-configuration-guide-102x.pdf',scope:'NX-OS 10.2(x); not equivalent to Arista MLAG'},
 SDWAN:{title:'Fortinet SD-WAN diagnostics',url:'https://docs.fortinet.com/document/fortigate/7.4.8/administration-guide/818746/sd-wan-related-diagnose-commands',scope:'FortiOS 7.4.8; command changes by patch release'}
};
const lines=x=>String(x||'').replace(/\r\n?/g,'\n').split('\n');
const ok=x=>typeof x==='string'&&!!x.trim();
const ip=/^(?:\d{1,3}\.){3}\d{1,3}$/;
const secret=/(?:\bpassword\b|\bpasswd\b|\bsecret\b|snmp[-\s]?server\s+community|snmp\s+community|community-string|private.?key|api.?key|\bauthorization\b|set psksecret|pre-shared-key|BEGIN [A-Z ]*PRIVATE KEY)/i;
function platform(node){
 const x=String(node.vendor||'');
 if(/Cisco|NX-OS|IOS-XE/i.test(x))return 'cisco';
 if(/Arista|EOS/i.test(x))return 'arista';
 if(/Huawei|VRP|CloudEngine/i.test(x))return 'huawei';
 if(/FortiGate|FortiOS|Fortinet/i.test(x))return 'fortinet';
 return 'unknown';
}
function proof(node,kind,index,text){
 return {deviceId:node.id,device:node.hostname,source:kind,line:index+1,
 excerpt:secret.test(text)?'[REDACTED]':String(text).trim().slice(0,220)};
}
function assess(args){
 const workspace=args&&args.workspace,chosen=args&&args.deviceIds,modules=args&&args.modules;
 if(!workspace||!Array.isArray(workspace.nodes)||!Array.isArray(workspace.configs))throw Error('Analysis workspace missing');
 const ids=new Set(chosen||workspace.nodes.map(n=>n.id)),selected=workspace.nodes.filter(n=>ids.has(n.id));
 if(!ids.size||ids.size!==selected.length)throw Error('Select valid device IDs');
 const scope=new Set((modules||[]).map(x=>String(x).toUpperCase())),parsed=new Map(),findings=[];
 const coverage={deviceCount:selected.length,configured:0,realCaptures:0,syntheticCaptures:0,devices:[]};
 function add(item){
  findings.push(Object.assign({id:'XC-'+(findings.length+1),status:'REVIEW',confidence:'SOURCE_SCOPED',
   severity:'NONE',networkImpact:'No production service impact proven.',evidence:[],
   source:(()=>{
    const platforms=[...new Set((item.deviceIds||[]).map(id=>parsed.get(id)?.vendor).filter(Boolean))];
    if(platforms.length!==1)return [];
    const key=platforms[0]==='arista'&&item.technology==='BGP'?'ARISTA_BGP':
     platforms[0]==='arista'&&item.technology==='VPC'?'ARISTA_MLAG':
     platforms[0]==='cisco'&&item.technology!=='SDWAN'?item.technology:
     platforms[0]==='fortinet'&&item.technology==='SDWAN'?'SDWAN':null;
    return key&&SOURCES[key]?[SOURCES[key]]:[];
   })()},item));
 }
 for(const node of selected){
  const vendor=platform(node),config=workspace.configs.find(c=>c.deviceId===node.id&&ok(c.text));
  const captured=(workspace.showTech||[]).filter(c=>c.deviceId===node.id);
  const real=captured.filter(c=>!c.synthetic),synthetic=captured.filter(c=>c.synthetic);
  const configLines=lines(config?.text),bgp={asn:null,asnProof:null,peers:new Map(),ips:new Map(),states:new Map()};
  const ospf=[],evpn=[],vpc=[],sdwan=[];
  if(config)coverage.configured++;
  coverage.realCaptures+=real.length;coverage.syntheticCaptures+=synthetic.length;
  coverage.devices.push({deviceId:node.id,hostname:node.hostname,vendor:node.vendor||'Unknown',
   platform:vendor,configPresent:!!config,configSource:config?.source||'missing',
   realCaptures:real.length,syntheticCaptures:synthetic.length});
  for(const [i,line] of configLines.entries()){
   let m=line.match(/^\s*(?:router\s+bgp|bgp)\s+(\d+)\b/i);
   if(m){bgp.asn=m[1];bgp.asnProof=proof(node,'Design/attached config',i,line);}
   m=vendor==='fortinet'?line.match(/^\s*set\s+as\s+(\d+)\b/i):null;
   if(m){bgp.asn=m[1];bgp.asnProof=proof(node,'Design/attached config',i,line);}
   m=line.match(/^\s*(?:neighbor\s+(\d{1,3}(?:\.\d{1,3}){3})\s+remote-as|peer\s+(\d{1,3}(?:\.\d{1,3}){3})\s+as-number)\s+(\d+)\b/i);
   if(m)bgp.peers.set(m[1]||m[2],{remoteAs:m[3],proof:proof(node,'Design/attached config',i,line)});
   m=line.match(/^\s*ip address\s+((?:\d{1,3}\.){3}\d{1,3})(?:\/\d+|\s+)/i);
   if(!m&&vendor==='fortinet')m=line.match(/^\s*set ip\s+((?:\d{1,3}\.){3}\d{1,3})\s+/i);
   if(m)bgp.ips.set(m[1],proof(node,'Design/attached config',i,line));
  }
  for(const capture of real){
   const raw=lines(capture.text),context=raw.slice(0,60).join('\n')+' '+capture.filename;
   const hasBGP=/\b(?:show\s+(?:ip\s+|ipv6\s+)?bgp\s+(?:all\s+)?summary|show bgp summary|get router info bgp summary)\b/i.test(context)||
    raw.some(x=>/^\s*Neighbor\s+V\s+AS\s+MsgRcvd.*State\/PfxRcd/i.test(x));
   const hasOSPF=/\b(?:show (?:ip )?ospf neighbor(?:s)?|display ospf peer)\b/i.test(context);
   const hasEVPN=/\b(?:show bgp l2vpn evpn|display bgp evpn routing-table|show evpn route)\b/i.test(context);
   const hasVPC=/\b(?:show vpc(?: brief)?|show mlag(?: detail)?|display dfs-group)\b/i.test(context);
   const hasSDWAN=vendor==='fortinet'&&(/\b(?:diagnose sys sdwan health-check|diagnose sys virtual-wan-link health-check)\b/i.test(context)||
     raw.some(x=>/^\s*Health Check\([^)]+\):/i.test(x)));
   if(scope.has('BGP')&&hasBGP){
    let table=false;
    raw.forEach((line,i)=>{
     if(/^\s*Neighbor\s+V\s+AS\s+MsgRcvd.*State\/PfxRcd/i.test(line)){table=true;return;}
     if(!table)return;
     const p=line.trim().split(/\s+/);
     if(p.length<10||!ip.test(p[0])||p[1]!=='4'||!/^\d+$/.test(p[2]))return;
     const last=p[p.length-1],state=/^\d+$/.test(last)?'Established':last;
     if(!/^(?:Idle|Active|Connect|OpenSent|OpenConfirm|Established|Shutdown)$/i.test(state))return;
     if(!bgp.states.has(p[0]))bgp.states.set(p[0],[]);
     bgp.states.get(p[0]).push({state,prefixCount:/^\d+$/.test(last)?Number(last):null,
      proof:proof(node,'show: '+capture.filename,i,line)});
    });
   }
   if(scope.has('OSPF')&&hasOSPF)raw.forEach((line,i)=>{
    const m=line.match(/^\s*((?:\d{1,3}\.){3}\d{1,3})\s+\d+\s+(FULL\/\S+|(?:INIT|DOWN|EXSTART|EXCHANGE|LOADING|2WAY)\/\S+)/i);
    if(m)ospf.push({neighbor:m[1],state:m[2],proof:proof(node,'show: '+capture.filename,i,line)});
   });
   if(scope.has('EVPN')&&hasEVPN)raw.forEach((line,i)=>{
    const m=line.match(/(?:Route[ -]?Type|route type|type)\s*[:= -]?\s*([235])\b/i);
    if(m&&evpn.length<30)evpn.push({type:Number(m[1]),proof:proof(node,'show: '+capture.filename,i,line)});
   });
   if(scope.has('VPC')&&hasVPC)raw.forEach((line,i)=>{
    const m=line.match(/^\s*(Peer status|Peer keepalive status|Peer Gateway|peer-link status|MLAG Status)\s*[:=]\s*(.+)\s*$/i);
    if(m)vpc.push({field:m[1],value:m[2].trim(),proof:proof(node,'show: '+capture.filename,i,line)});
   });
   if(scope.has('SDWAN')&&hasSDWAN){
    let check='';
    raw.forEach((line,i)=>{
     const h=line.match(/^\s*Health Check\(([^)]+)\):/i);
     if(h){check=h[1];return;}
     const m=line.match(/\bSeq\((\d+)[^)]*\).*?\bstate\((alive|dead)\)/i);
     if(check&&m)sdwan.push({check,member:m[1],state:m[2].toLowerCase(),proof:proof(node,'show: '+capture.filename,i,line)});
    });
   }
  }
  parsed.set(node.id,{node,vendor,bgp,ospf,evpn,vpc,sdwan});
 }
 if(scope.has('BGP')){
  for(const [id,data] of parsed)for(const [peer,states] of data.bgp.states){
   const observed=states[states.length-1],configured=data.bgp.peers.get(peer);
   const changed=states.some(x=>x.state!==observed.state);
   const down=/^(Idle|Active|Connect|OpenSent|OpenConfirm|Shutdown)/i.test(observed.state);
   add({technology:'BGP',deviceIds:[id],devices:[data.node.hostname],
    title:changed?'BGP states differ across captures':'Observed BGP neighbor FSM',
    titleTr:changed?'BGP durumları çıktılar arasında farklı':'Gözlenen BGP komşuluk FSM durumu',
    status:changed?'CONFLICT':down?'REVIEW':'OBSERVED',
    confidence:changed?'CAPTURE_TIMING_UNVERIFIED':'OPERATIONAL_SINGLE_DEVICE',
    observed:data.node.hostname+' neighbor '+peer+' reports '+observed.state+
      (observed.prefixCount!==null?' ('+observed.prefixCount+' prefixes)':'')+'.',
    explanation:changed?'Different states occur in the supplied files; capture times and transitions are unknown.':
      down?'Session was not Established in this capture; transport, authentication, AFI/SAFI and policy require investigation.':
      'Session state is observed, but received prefixes do not prove expected reachability or best path.',
    networkImpact:'Conditional route-exchange exposure; no service impact established.',
    verification:['show bgp summary','show bgp neighbors <peer>','show ip route <peer>'],
    evidence:[observed.proof].concat(configured?[configured.proof]:[],changed?states.slice(0,-1).map(x=>x.proof):[])});
  }
  // Pair only when a neighbor IP equals an explicitly configured interface IP
  // on the other selected device. Otherwise topology cannot prove identity.
  for(const [id,a] of parsed)for(const [peer,p] of a.bgp.peers)for(const [otherId,b] of parsed){
   if(otherId===id||!b.bgp.ips.has(peer)||!b.bgp.asn||p.remoteAs===b.bgp.asn)continue;
   add({technology:'BGP',status:'CONFLICT',confidence:'CONFIG_IP_AND_AS_EXPLICIT',
    deviceIds:[id,otherId],devices:[a.node.hostname,b.node.hostname],
    title:'Configured BGP remote-AS and addressed peer ASN differ',
    titleTr:'BGP remote-AS ile IP eşleşen karşı cihaz ASN değeri farklı',
    observed:a.node.hostname+' configures remote-as '+p.remoteAs+' toward '+peer+
     ', while '+b.node.hostname+' has that address and local ASN '+b.bgp.asn+'.',
    explanation:'Configuration contradiction is directly evidenced; VRF and effective neighbor context still need confirmation.',
    networkImpact:'Possible session incompatibility if the references are active in the same VRF.',
    verification:['Confirm peer IP, VRF and address family','Inspect active BGP neighbor state on both devices'],
    evidence:[p.proof,b.bgp.ips.get(peer),b.bgp.asnProof]});
  }
 }
 if(scope.has('OSPF'))for(const [id,d] of parsed)for(const n of d.ospf)
  add({technology:'OSPF',status:/^FULL\//i.test(n.state)?'OBSERVED':'REVIEW',
   confidence:'OPERATIONAL_SINGLE_DEVICE',deviceIds:[id],devices:[d.node.hostname],
   title:'Observed OSPF adjacency state',titleTr:'Gözlenen OSPF komşuluk durumu',
   observed:d.node.hostname+' neighbor '+n.neighbor+' state '+n.state+'.',
   explanation:/^FULL\//i.test(n.state)?'FULL was reported; LSDB, routes and forwarding are not established by this fact.':
    'A non-FULL state was reported; network type and expected adjacency must be checked before calling it a fault.',
   networkImpact:'Conditional route availability exposure.',verification:['show ip ospf neighbor detail','show ip ospf interface','show ip route ospf'],evidence:[n.proof]});
 if(scope.has('EVPN'))for(const [id,d] of parsed)if(d.evpn.length){
  const types=[...new Set(d.evpn.map(x=>x.type))].sort().join(', ');
  add({technology:'EVPN',status:'OBSERVED',confidence:'OPERATIONAL_PARTIAL',deviceIds:[id],devices:[d.node.hostname],
   title:'Observed EVPN route types',titleTr:'Gözlenen EVPN rota türleri',
   observed:d.node.hostname+' capture contains EVPN type(s) '+types+'.',
   explanation:'Presence is evidenced; missing route types, per-VRF reachability and VNI/RT correctness are not established.',
   networkImpact:'No outage inferred from route presence.',verification:['show bgp l2vpn evpn','show nve peers','show nve vni'],
   evidence:d.evpn.slice(0,8).map(x=>x.proof)});
 }
 if(scope.has('VPC'))for(const [id,d] of parsed)for(const x of d.vpc){
  const impaired=/(not formed|peer.*down|not alive|suspended|inactive|failed)/i.test(x.value);
  add({technology:'VPC',status:impaired?'REVIEW':'OBSERVED',confidence:'OPERATIONAL_SINGLE_DEVICE',
   deviceIds:[id],devices:[d.node.hostname],title:'Observed vPC / MLAG state',titleTr:'Gözlenen vPC / MLAG durumu',
   observed:d.node.hostname+' '+x.field+': '+x.value,
   explanation:'The observed command output is not overridden by assumptions about absent configuration lines; both peers are needed.',
   networkImpact:'Conditional forwarding exposure; actual fault domain is unverified.',
   verification:['show vpc brief / show mlag','show port-channel summary','Inspect matching peer capture'],evidence:[x.proof]});
 }
 if(scope.has('SDWAN'))for(const [id,d] of parsed)for(const x of d.sdwan)
  add({technology:'SDWAN',status:x.state==='dead'?'REVIEW':'OBSERVED',confidence:'OPERATIONAL_SINGLE_DEVICE',
   deviceIds:[id],devices:[d.node.hostname],title:'Observed SD-WAN SLA probe state',
   titleTr:'Gözlenen SD-WAN SLA sağlık kontrolü',
   observed:d.node.hostname+' check '+x.check+' member '+x.member+' state('+x.state+').',
   explanation:'Probe liveness is not the same as SLA compliance, service selection or end-user connectivity.',
   networkImpact:'Conditional path-selection exposure.',verification:['diagnose sys sdwan health-check',
    'diagnose sys sdwan service4 (FortiOS 7.4.4+)','get router info bgp summary'],evidence:[x.proof]});
 if(scope.has('BGP')&&scope.has('SDWAN'))for(const [id,d] of parsed){
  const b=findings.find(x=>x.technology==='BGP'&&x.status==='REVIEW'&&x.deviceIds.length===1&&x.deviceIds[0]===id);
  const s=findings.find(x=>x.technology==='SDWAN'&&x.status==='REVIEW'&&x.deviceIds.length===1&&x.deviceIds[0]===id);
  if(!b||!s)continue;
  add({technology:'BGP',status:'REVIEW',confidence:'CROSS_DOMAIN_HYPOTHESIS_NOT_CAUSAL',
   deviceIds:[id],devices:[d.node.hostname],
   title:'Joint BGP / SD-WAN investigation warranted',
   titleTr:'BGP ve SD-WAN birlikte incelenmeli',
   observed:'BGP non-Established and SD-WAN dead-probe observations both exist in supplied captures; times may differ.',
   explanation:'Neither event is proven to cause the other. Correlate capture timestamps, tunnel, routing, TCP/179 and selected service path.',
   networkImpact:'Potential routing dependency for investigation; impact unknown.',
   verification:['Match capture timestamps','Check selected SD-WAN service','Verify TCP/179 and BGP reset reason'],
   evidence:[b.evidence[0],s.evidence[0]]});
 }
 const counts={OBSERVED:0,REVIEW:0,CONFLICT:0};
 for(const item of findings)counts[item.status]++;
 return {schema:'network-evidence-correlation-v1',version:VERSION,
  scope:{deviceIds:[...ids],modules:[...scope]},coverage,counts,
  findings:findings.slice(0,150),limitations:[
   'Read-only evidence observations; not verified AI reasoning or a compliance PASS/FAIL.',
   'Design CLI is not running configuration and capture authenticity/timestamps remain unverified.',
   'No finding does not mean healthy or disabled. Vendor and release applicability must be reviewed.',
   'Incomplete or asynchronous captures must not support causal conclusions.'
  ]};
}
root.NetworkEvidenceCorrelationV1={assess,VERSION,SOURCES,platform};
})(typeof window==='undefined'?globalThis:window);
