/* Observed operational STP CLI evidence, always separate from generated design configs. */
(function(root){'use strict';
function parse(text,source){
 const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');
 let section='',vlan=null,part='',version=null,model=null;
 const vlans=new Map(),commands=[],trunks=[],udld=[],interfaceMedia=[];
 const ref=i=>source+' L'+(i+1)+': '+lines[i].trim().slice(0,200);
 for(let i=0;i<lines.length;i++){
  const s=lines[i].trim();if(!s)continue;
  let m=s.match(/^(?:[-=#>* ]{2,}\s*)?(show\s+(?:version|spanning-tree(?:\s+\S+){0,5}|interfaces\s+(?:trunk|status)|udld(?:\s+\S+){0,2}|etherchannel\s+summary)|display\s+(?:version|stp(?:\s+\S+){0,4}))\s*[-=# ]*$/i);
  if(m){section=m[1].toLowerCase();commands.push({name:section,line:ref(i)});if(/spanning-tree|stp/.test(section)){vlan=null;part='';}continue;}
  m=s.match(/^(?:Cisco IOS XE Software|Cisco IOS Software(?:\s*\[[^\]]+\])?(?:,\s*[^,]+)?|Cisco NX-OS Software)[,\s]+Version\s+([^\s,]+)/i)
   ||s.match(/^(?:NXOS|system):\s*version\s+([^\s,]+)/i)||s.match(/^Software version\s*:\s*([^\s,]+)/i);
  if(m&&!version)version={value:m[1],line:ref(i)};
  m=s.match(/^Model\s+(?:Number|Name)\s*:\s*(\S+)/i)||
    s.match(/^cisco\s+([A-Z][A-Z0-9-]{3,})\s+\([^)]+\)\s+processor/i);
  if(m&&!model)model={value:m[1],line:ref(i)};
  m=s.match(/^(?:VLAN|MST)(\d{1,4})$/i);
  if(m&&(/spanning-tree|stp/.test(section)||!section)){
   vlan=Number(m[1]);if(!vlans.has(vlan))vlans.set(vlan,{vlan,root:null,bridge:null,ports:[],topologyChanges:null});
   part='';continue;
  }
  if(vlan!==null){
   const entry=vlans.get(vlan);
   if(/^Root ID\b/i.test(s)){part='root';continue;}
   if(/^Bridge ID\b/i.test(s)){part='bridge';continue;}
   m=s.match(/^Priority\s+(\d+)/i);
   if(m&&part){entry[part]={...(entry[part]||{}),priority:Number(m[1]),line:ref(i)};continue;}
   m=s.match(/^Address\s+([a-fA-F0-9.:-]{8,})/i);
   if(m&&part){entry[part]={...(entry[part]||{}),address:m[1].toLowerCase(),line:ref(i)};continue;}
   m=s.match(/^Number of topology changes\s+(\d+)/i);
   if(m){entry.topologyChanges=Number(m[1]);entry.topologyLine=ref(i);continue;}
   m=s.match(/^((?:Te|Gi|Fa|Eth|Ethernet|Po|Port-channel|TenGigabitEthernet|GigabitEthernet)\S+)\s+(Root|Desg|Altn|Back|Mstr|Disabled)\s+(FWD|BLK|LIS|LRN|DIS)\b/i);
   if(m){entry.ports.push({name:m[1],role:m[2],state:m[3],line:ref(i)});continue;}
  }
  m=s.match(/^((?:Te|Gi|Fa|Eth|Ethernet|Po|Port-channel|TenGigabitEthernet|GigabitEthernet)\S+)\s+802\.1q\s+trunking\s+(\d+)\b/i);
  if(m)trunks.push({name:m[1],native:Number(m[2]),line:ref(i)});
  m=s.match(/^((?:Te|Gi|Fa|Eth|Ethernet|Po|Port-channel|TenGigabitEthernet|GigabitEthernet)\S+)\s+(?:aggressive|enable)\s+(?:bidirectional|undetermined|up|down|disabled)/i);
  if(m)udld.push({name:m[1],line:ref(i),state:s});
  // 'show interfaces status' is used only to corroborate optical media,
  // not as evidence that an unobserved port is operationally protected.
  if(/show interfaces status/.test(section)){
   const port=s.match(/^((?:Te|Gi|Fa|Eth|Ethernet|Po|Port-channel|TenGigabitEthernet|GigabitEthernet)\S+)\s+connected\s+(?:trunk|\d+)\s+\S+\s+\S+\s+(.+)$/i);
   if(port)interfaceMedia.push({name:port[1],type:port[2],line:ref(i)});
  }
 }
 for(const v of vlans.values())v.isRoot=v.root?.address&&v.bridge?.address?v.root.address===v.bridge.address:null;
 return {source,version,model,vlans:[...vlans.values()],commands,trunks,udld,interfaceMedia};
}
function assess(workspace,deviceIds){
 const wanted=new Set(deviceIds||[]),devices=[];
 for(const node of (workspace.nodes||[]).filter(n=>wanted.has(n.id))){
  const capturesAll=(workspace.showTech||[]).filter(x=>x.deviceId===node.id);
  const liveCaptures=capturesAll.filter(x=>!x.synthetic);
  const captures=liveCaptures.length?liveCaptures:capturesAll;
  const parsed=captures.map(x=>({...parse(x.text,(x.synthetic?'SYNTHETIC LAB: ':'CAPTURE: ')+x.filename),
    filename:x.filename,synthetic:!!x.synthetic}));
  const vlans=new Map();
  for(const c of parsed)for(const v of c.vlans){
   const prev=vlans.get(v.vlan);
   if(!prev||(!prev.root&&v.root))vlans.set(v.vlan,{...v,synthetic:c.synthetic});
  }
  const version=parsed.find(x=>x.version)?.version||null;
  const model=parsed.find(x=>x.model)?.model||null;
  devices.push({deviceId:node.id,hostname:node.hostname,present:parsed.length>0,
   syntheticOnly:parsed.length>0&&parsed.every(x=>x.synthetic),
   captures:parsed.map(x=>({filename:x.filename,synthetic:x.synthetic,commands:x.commands.map(c=>c.name)})),
   parsed,version,model,vlans:[...vlans.values()]});
 }
 const byId=new Map(devices.map(x=>[x.deviceId,x])),relationships=[];
 for(const l of workspace.links||[]){
  if(!wanted.has(l.a)||!wanted.has(l.b))continue;
  const a=byId.get(l.a),b=byId.get(l.b);if(!a?.present||!b?.present)continue;
  const aV=new Map(a.vlans.map(x=>[x.vlan,x])),bV=new Map(b.vlans.map(x=>[x.vlan,x]));
  for(const [v,x] of aV){const y=bV.get(v);if(!x.root?.address||!y?.root?.address)continue;
   relationships.push({devices:[a.hostname,b.hostname],vlan:v,
    status:x.root.address===y.root.address?'ROOT_ID_MATCH':'CONFLICTING_ROOT_EVIDENCE',
    evidence:[x.root.line,y.root.line],synthetic:x.synthetic||y.synthetic});
  }
 }
 return {kind:'stp-operational-evidence-v1',devices,relationships};
}
function augment(engineering,operational){
 for(const d of engineering.devices){
  const o=operational.devices.find(x=>x.deviceId===d.id);if(!o)continue;d.operational=o;
  const row=id=>d.controls.find(x=>x.id===id);
  if(o.version||o.model){
   const c=row('STP-001');if(c){
    c.status=o.version&&o.model?'OBSERVED':'PARTIAL';
    c.observed=[d.platform,o.model?'model '+o.model.value:null,o.version?'version '+o.version.value:null].filter(Boolean).join(' · ');
    c.analysis='Hardware and software identity read from separately labelled '+(o.syntheticOnly?'synthetic LAB':'operational')+' evidence.';
    c.evidence=[o.model?.line,o.version?.line].filter(Boolean);
   }
  }
  const roots=o.vlans.filter(x=>x.root?.address);
  if(roots.length){
   const c=row('STP-004');if(c){
    c.status=o.syntheticOnly?'LAB_OBSERVED':'OPERATIONAL_EVIDENCE';
    c.observed=roots.map(x=>'VLAN '+x.vlan+': '+x.root.address+(x.isRoot===true?' (local root)':x.isRoot===false?' (remote root)':'')).join(' · ');
    c.analysis='Operational Root ID is read from the labelled CLI capture; timing and missing network members still require verification.';
    c.evidence=[...c.evidence,...roots.map(x=>x.root.line)].filter(Boolean);
   }
  }
  const ports=o.vlans.flatMap(x=>x.ports.map(p=>({...p,vlan:x.vlan})));
  if(ports.length){
   const c=row('STP-016');if(c){
    c.status=o.syntheticOnly?'LAB_OBSERVED':'OPERATIONAL_EVIDENCE';
    c.observed=ports.map(p=>'VLAN '+p.vlan+' '+p.name+' '+p.role+'/'+p.state).join(' · ');
    c.analysis='Per-VLAN port roles observed. Actual failover duration is unmeasured.';
    c.evidence=ports.map(p=>p.line);
   }
  }
  const tcn=o.vlans.filter(x=>x.topologyChanges!==null);
  if(tcn.length){
   const c=row('STP-015');if(c){
    c.status=o.syntheticOnly?'LAB_OBSERVED':'OPERATIONAL_EVIDENCE';
    c.observed=tcn.map(x=>'VLAN '+x.vlan+': '+x.topologyChanges+' TCN').join(' · ');
    c.analysis='Counters are observed; one capture cannot prove a topology-change rate or instability.';
    c.evidence=tcn.map(x=>x.topologyLine).filter(Boolean);
   }
  }
  const udld=o.parsed.flatMap(x=>x.udld);
  if(udld.length){const c=row('STP-012');if(c){
   c.status=o.syntheticOnly?'LAB_OBSERVED':'OPERATIONAL_EVIDENCE';
   c.observed=udld.map(x=>x.name+' '+x.state).join(' · ');
   c.evidence=[...c.evidence,...udld.map(x=>x.line)];
   c.analysis='UDLD interface state observed in CLI evidence; capture timestamp and linked peer remain relevant.';
  }}
 }
 return engineering;
}
root.NetworkSTPOperationalV1={parse,assess,augment};
})(typeof window==='undefined'?globalThis:window);
