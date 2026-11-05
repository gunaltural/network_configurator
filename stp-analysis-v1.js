/* STP V1: deterministic preflight, not a model diagnosis. */
(function(root){
'use strict';
const vlans=s=>{const a=new Set();for(const part of String(s).replace(/\s/g,'').split(',')){const m=part.match(/^(\d+)(?:-(\d+))?$/);if(!m)continue;const x=+m[1],y=m[2]?+m[2]:x;if(x<1||y>4094||y<x)continue;for(let n=x;n<=y;n++)a.add(n);}return [...a].sort((a,b)=>a-b);};
function parse(node,text){
 const st={id:node.id,name:node.hostname,mode:null,modeLine:0,region:{name:null,revision:null,map:new Map()},priorities:new Map(),macros:[],interfaces:[],hasConfig:!!String(text||'').trim()};
 let section='',iface='';
 String(text||'').replace(/\r\n?/g,'\n').split('\n').forEach((line,i)=>{
  const t=line.trim(),n=i+1;
  if(/^interface\s+\S+/i.test(t)){section='interface';iface=t.replace(/^interface\s+/i,'');}
  else if(/^spanning-tree mst configuration$/i.test(t)){section='mst';iface='';}
  else if(/^(?:!|exit|end)$/.test(t)){section='';iface='';}
  let m=t.match(/^spanning-tree mode\s+([\w-]+)/i);
  if(m){st.mode=m[1].toLowerCase();st.modeLine=n;}
  m=t.match(/^spanning-tree vlan\s+([\d,\s-]+)\s+priority\s+(\d+)$/i);
  if(m)for(const v of vlans(m[1]))st.priorities.set('VLAN '+v,{value:+m[2],line:n});
  m=t.match(/^spanning-tree vlan\s+([\d,\s-]+)\s+root\s+(primary|secondary)/i);
  if(m)st.macros.push({vlans:vlans(m[1]),kind:m[2].toLowerCase(),line:n});
  m=t.match(/^spanning-tree mst\s+([\d,\s-]+)\s+priority\s+(\d+)$/i);
  if(m)for(const v of vlans(m[1]))st.priorities.set('MST '+v,{value:+m[2],line:n});
  if(section==='mst'){
   m=t.match(/^name\s+(.+)$/i);if(m)st.region.name={value:m[1],line:n};
   m=t.match(/^revision\s+(\d+)$/i);if(m)st.region.revision={value:+m[1],line:n};
   m=t.match(/^instance\s+(\d+)\s+vlan\s+(.+)$/i);if(m)st.region.map.set(+m[1],{vlans:vlans(m[2]),line:n});
  }
  if(section==='interface'&&/^(switchport|channel-group|spanning-tree)\b/i.test(t))st.interfaces.push({iface,line:n,text:t});
 });
 return st;
}
const cite=(s,line)=>s.name+(line?' config L'+line:' (config evidence missing)');
function assess(workspace,ids){
 const chosen=new Set(ids),nodes=workspace.nodes.filter(n=>chosen.has(n.id));
 if(!nodes.length)throw Error('Select STP devices');
 const states=nodes.map(n=>parse(n,workspace.configs.find(c=>c.deviceId===n.id)?.text));
 const findings=[],missing=[],add=(level,code,claim,refs)=>findings.push({level,code,claim,refs});
 for(const s of states){
  if(!s.hasConfig)missing.push(s.name+': attach configuration');
  else if(!s.mode)missing.push(s.name+': explicit STP mode absent; do not infer vendor default');
  for(const [key,p] of s.priorities)if(p.value%4096!==0||p.value>61440)add('warning','INVALID_BRIDGE_PRIORITY',s.name+' '+key+' priority '+p.value+' does not use 4096 increments or exceeds 61440',[cite(s,p.line)]);
  if(s.mode==='mst'&&(!s.region.name||!s.region.map.size))missing.push(s.name+': complete MST region context not supplied');
 }
 for(let i=0;i<states.length;i++)for(let j=i+1;j<states.length;j++){
  const a=states[i],b=states[j];if(!a.hasConfig||!b.hasConfig)continue;
  if(a.mode&&b.mode&&a.mode!==b.mode)add('warning','STP_MODE_MISMATCH',a.name+' uses '+a.mode+'; '+b.name+' uses '+b.mode,[cite(a,a.modeLine),cite(b,b.modeLine)]);
  if(a.mode==='mst'&&b.mode==='mst'){
   for(const field of ['name','revision']){const x=a.region[field],y=b.region[field];if(x&&y&&String(x.value)!==String(y.value))add('warning','MST_'+field.toUpperCase()+'_MISMATCH','MST region '+field+' differs',[cite(a,x.line),cite(b,y.line)]);}
   for(const [instance,x]of a.region.map){const y=b.region.map.get(instance);if(y&&JSON.stringify(x.vlans)!==JSON.stringify(y.vlans))add('warning','MST_VLAN_MAP_MISMATCH','MST instance '+instance+' VLAN mapping differs',[cite(a,x.line),cite(b,y.line)]);}
  }
  for(const [key,x]of a.priorities){const y=b.priorities.get(key);if(!y)continue;add(x.value===y.value?'review':'info',x.value===y.value?'EQUAL_BRIDGE_PRIORITY':'BRIDGE_PRIORITY_COMPARISON',key+': '+a.name+' '+x.value+' vs '+b.name+' '+y.value+'. Root election is not confirmed without operational bridge IDs and root status.',[cite(a,x.line),cite(b,y.line)]);}
  for(const x of a.macros)for(const y of b.macros)if(x.kind===y.kind&&x.vlans.some(v=>y.vlans.includes(v)))add('review','ROOT_MACRO_OVERLAP',a.name+' and '+b.name+' both declare root '+x.kind+' for overlapping VLANs',[cite(a,x.line),cite(b,y.line)]);
 }
 if(states.length<2)missing.push('Choose 2+ nodes for cross-node comparisons');
 missing.push('Operational proof: show spanning-tree root/detail, bridge IDs, interface roles and state on each node');
 missing.push('Check actual trunk VLAN membership and EtherChannel/MLAG/vPC operational state');
 if(!findings.length)add('info','INSUFFICIENT_COMPARABLE_EVIDENCE','No explicit cross-node contradiction found; this does not establish STP correctness',states.map(s=>cite(s,s.modeLine)));
 return {kind:'deterministic-not-ai',devices:nodes.map(n=>n.hostname),findings,missing};
}
function format(r){return ['STP V1 | Deterministic configuration preflight — NOT AI diagnosis','Devices: '+r.devices.join(', '),...r.findings.map(f=>'['+f.level+'] '+f.code+': '+f.claim+' | Evidence: '+f.refs.join(' ; ')),'Missing operational evidence:',...r.missing.map(s=>'• '+s)].join('\n');}
function evidence(r){return ['STP V1 deterministic checks; verify independently, these are NOT a root-cause answer',...r.findings.map(f=>f.code+': '+f.claim+' | '+f.refs.join(' ; ')),...r.missing.map(s=>'Missing: '+s)];}
root.NetworkSTPV1={assess,parse,format,evidence,vlans};
})(typeof window==='undefined'?globalThis:window);