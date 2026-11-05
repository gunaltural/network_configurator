/* AI Analysis topology workspace model. Isolated from the existing Design/Inventory/Simulation flow. */
(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const identifier=x=>String(x??'').trim();
function fromDesign(report){
 if(!report||!Array.isArray(report.devices))throw Error('A design with devices is required.');
 const nodes=report.devices.filter(d=>!d.inventoryOnly).map(d=>({id:identifier(d.id),hostname:identifier(d.hostname||d.id),vendor:identifier(d.vendor||report.vendor),role:identifier(d.tier||d.role),source:'design'}));
 // The editable graph follows the same hierarchical network tiers as Design,
 // instead of using a generic circular layout. The imported SVG remains exact.
 const upper=nodes.filter(n=>n.role==='upper'),lower=nodes.filter(n=>n.role==='lower');
 const distribute=(members,y)=>members.forEach((n,i)=>{n.position={x:Math.round(400+(i-(members.length-1)/2)*Math.min(235,620/Math.max(1,members.length-1))),y};});
 if(upper.length||lower.length){distribute(upper,105);distribute(lower,265);}
 const links=[...(report.links||[]),...(report.specialLinks||[])].filter(l=>l.enabled!==false).map((l,i)=>({id:identifier(l.id||'link-'+i),a:identifier(l.a),b:identifier(l.b),aPort:identifier(l.aPort||l.upperPort),bPort:identifier(l.bPort||l.lowerPort),kind:identifier(l.kind||'Connection'),logical:l.logical===true}));
 const ids=new Set(nodes.map(n=>n.id));
 const configs=(report.configurations||[]).filter(c=>ids.has(identifier(c.deviceId))&&typeof c.text==='string').map(c=>({
  deviceId:identifier(c.deviceId),source:'design',text:redactPrivateKeyBlocks(String(c.text).replace(/\r\n?/g,'\n').split('\n')).map(safeLine).join('\n')
 }));
 const designReview={
  origin:'original-design-snapshot',edited:false,
  parameters:(report.parameters||[]).map(p=>({
   label:safeLine(identifier(p.label).replace(/[\r\n]/g,' ')).slice(0,300),
   value:safeLine(identifier(p.value).replace(/[\r\n]/g,' ')).slice(0,1500),
   impact:safeLine(identifier(p.impact).replace(/[\r\n]/g,' ')).slice(0,1500)
  })),
  checks:report.designChecks||null
 };
 return validate({schema:'ai-topology-workspace-v1',sourceModule:identifier(report.source?.module),nodes,links,configs,designReview,originalDesignSvg:typeof report.topologySvg==='string'&&report.topologySvg.length<=120000&&/^<svg[\s>]/i.test(report.topologySvg.trim())?report.topologySvg:null});
}
function validate(workspace){
 const model=clone(workspace),ids=new Set(),linkIds=new Set();
 if(!Array.isArray(model.showTech))model.showTech=[];
 if(model.schema!=='ai-topology-workspace-v1'||!Array.isArray(model.nodes)||!Array.isArray(model.links)||!Array.isArray(model.configs))throw Error('Invalid workspace schema.');
 if(model.designReview&&(!Array.isArray(model.designReview.parameters)||typeof model.designReview.edited!=='boolean'))throw Error('Invalid Design review context.');
 if(model.originalDesignSvg!=null&&(typeof model.originalDesignSvg!=='string'||model.originalDesignSvg.length>120000||!/^<svg[\s>]/i.test(model.originalDesignSvg.trim())))throw Error('Invalid original Design image.');
 for(const n of model.nodes){if(!identifier(n.id)||ids.has(n.id))throw Error('Duplicate or empty device id.');if(n.position&&(!Number.isFinite(n.position.x)||!Number.isFinite(n.position.y)||n.position.x<45||n.position.x>755||n.position.y<45||n.position.y>315))throw Error('Invalid device layout coordinates.');ids.add(n.id);}
 for(const l of model.links){if(!identifier(l.id)||linkIds.has(l.id)||!ids.has(l.a)||!ids.has(l.b)||l.a===l.b)throw Error('Invalid link or endpoint.');linkIds.add(l.id);}
 const configuredDevices=new Set();
 const technicalCaptures=new Set();
 for(const capture of model.showTech){
  if(!ids.has(capture.deviceId)||typeof capture.text!=='string'||capture.text.length>8000000||typeof capture.filename!=='string'||capture.filename.length>255)throw Error('Invalid show tech capture.');
  if(!identifier(capture.filename)||technicalCaptures.has(capture.deviceId+'::'+capture.filename))throw Error('Duplicate or empty show tech capture filename for device.');
  technicalCaptures.add(capture.deviceId+'::'+capture.filename);
 }
 for(const c of model.configs){
  if(!ids.has(c.deviceId)||typeof c.text!=='string')throw Error('Configuration has no matching device.');
  if(configuredDevices.has(c.deviceId))throw Error('Duplicate configuration for device.');
  configuredDevices.add(c.deviceId);
 }
 return model;
}
function edited(next){if(next.designReview)next.designReview.edited=true;return next;}
function addDevice(workspace,device){
 const next=validate(workspace);next.nodes.push({id:identifier(device.id),hostname:identifier(device.hostname||device.id),vendor:identifier(device.vendor),role:identifier(device.role),source:'user'});return validate(edited(next));
}
// Coordinates describe only the engineer's drawing layout, never operational topology.
function moveDevice(workspace,id,x,y){
 const next=validate(workspace),node=next.nodes.find(n=>n.id===id);
 if(!node)throw Error('Unknown device.');
 if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid topology coordinates.');
 node.position={x:Math.round(Math.max(45,Math.min(755,x))),y:Math.round(Math.max(45,Math.min(315,y)))};
 return validate(next);
}
function addLink(workspace,link){
 const next=validate(workspace);next.links.push({id:identifier(link.id),a:identifier(link.a),b:identifier(link.b),aPort:identifier(link.aPort),bPort:identifier(link.bPort),kind:identifier(link.kind||'Connection'),logical:link.logical===true});return validate(edited(next));
}
function removeDevice(workspace,id){
 const next=validate(workspace);next.nodes=next.nodes.filter(n=>n.id!==id);next.links=next.links.filter(l=>l.a!==id&&l.b!==id);next.configs=next.configs.filter(c=>c.deviceId!==id);next.showTech=next.showTech.filter(c=>c.deviceId!==id);return validate(edited(next));
}
function setConfiguration(workspace,deviceId,text){
 const next=validate(workspace);if(!next.nodes.some(n=>n.id===deviceId))throw Error('Unknown device.');
 if(typeof text!=='string')throw Error('Configuration must be text.');
 next.configs=next.configs.filter(c=>c.deviceId!==deviceId);
 next.configs.push({deviceId,text,source:'user'});return validate(edited(next));
}
function setShowTech(workspace,deviceId,text,filename){
 const next=validate(workspace);
 if(!next.nodes.some(n=>n.id===deviceId))throw Error('Unknown device.');
 if(typeof text!=='string'||text.length>8000000)throw Error('Show tech capture is invalid or exceeds 8 MB.');
 next.showTech=next.showTech.filter(c=>c.deviceId!==deviceId);
 if(text.trim())next.showTech.push({deviceId,text,filename:String(filename||'show-tech.txt').slice(0,255)});
 return validate(next);
}
function addShowTech(workspace,deviceId,text,filename,synthetic=false){
 const next=validate(workspace);
 if(!next.nodes.some(n=>n.id===deviceId))throw Error('Unknown device.');
 if(typeof text!=='string'||text.length>8000000||!text.trim())throw Error('Show tech text missing or exceeds 8 MB.');
 filename=String(filename||'verification.txt').trim().slice(0,255);
 next.showTech=next.showTech.filter(c=>!(c.deviceId===deviceId&&(c.filename===filename||(!synthetic&&c.synthetic))));
 next.showTech.push({deviceId,text,filename,synthetic:synthetic===true});
 return validate(next);
}
function removeShowTech(workspace,deviceId,filename){
 const next=validate(workspace);next.showTech=next.showTech.filter(c=>!(c.deviceId===deviceId&&c.filename===filename));
 return validate(next);
}
function structuralAssessment(workspace){
 const model=validate(workspace),physical=model.links.filter(l=>!l.logical);
 const adjacency=new Map(model.nodes.map(n=>[n.id,[]]));
 for(const l of physical){adjacency.get(l.a).push([l.b,l.id]);adjacency.get(l.b).push([l.a,l.id]);}
 const visited=new Set(),disc=new Map(),low=new Map(),parents=new Map(),articulation=new Set(),bridges=[],components=[];
 let tick=0;
 function visit(u,component,parentEdge=null){
  visited.add(u);disc.set(u,++tick);low.set(u,disc.get(u));component.push(u);
  let children=0;
  for(const [v,edge]of adjacency.get(u)){
   if(!visited.has(v)){
    parents.set(v,u);children++;visit(v,component,edge);
    low.set(u,Math.min(low.get(u),low.get(v)));
    if(parents.has(u)&&low.get(v)>=disc.get(u))articulation.add(u);
    if(low.get(v)>disc.get(u))bridges.push(edge);
   }else if(edge!==parentEdge)low.set(u,Math.min(low.get(u),disc.get(v)));
  }
  if(!parents.has(u)&&children>1)articulation.add(u);
 }
 for(const node of model.nodes){
  if(visited.has(node.id))continue;
  const component=[];visit(node.id,component);components.push(component);
 }
 return {
  evidenceType:'planned-graph-structure-not-operational',
  devices:model.nodes.length,physicalLinks:physical.length,
  logicalLinks:model.links.length-physical.length,components,
  isolatedDevices:model.nodes.filter(n=>adjacency.get(n.id).length===0).map(n=>n.id),
  potentialTransitDependencies:[...articulation].sort(),
  potentialSinglePathLinks:[...new Set(bridges)].sort(),
  configurationMissing:model.nodes.filter(n=>!model.configs.some(c=>c.deviceId===n.id&&typeof c.text==='string'&&!!c.text.trim())).map(n=>n.id),
  caveat:'Graph dependencies are conditional. Missing links/configurations may be outside the modeled scope; no failure, outage, traffic path or vendor compliance is proven.'
 };
}
function analysisManifest(workspace){
 const model=validate(workspace);
 // Never include raw configuration in a manifest destined for the AI provider.
 return {schema:model.schema,sourceModule:model.sourceModule,nodes:model.nodes,links:model.links,
  configurationCoverage:model.nodes.map(n=>{
   const config=model.configs.find(c=>c.deviceId===n.id);
   return {deviceId:n.id,present:!!(config&&typeof config.text==='string'&&config.text.trim()),
    source:config?.source==='design'?'design':config?'user-or-saved':'missing',
    realVerificationCaptures:model.showTech.filter(c=>c.deviceId===n.id&&!c.synthetic).length,
    syntheticCaptures:model.showTech.filter(c=>c.deviceId===n.id&&c.synthetic).length};
  })};
}

function blank(){return validate({schema:'ai-topology-workspace-v1',sourceModule:'',nodes:[],links:[],configs:[]});}
function template(kind){
 if(kind==='blank')return blank();
 const definitions={
  vpc:{sourceModule:'VPC',nodes:[
   {id:'n9k-a',hostname:'N9K-A',vendor:'Cisco NX-OS',role:'peer'},
   {id:'n9k-b',hostname:'N9K-B',vendor:'Cisco NX-OS',role:'peer'}],
   links:[{id:'peer-link',a:'n9k-a',b:'n9k-b',kind:'peer-link',aPort:'Eth1/1',bPort:'Eth1/1'},
          {id:'keepalive',a:'n9k-a',b:'n9k-b',kind:'keepalive',logical:true}]},
  bgp:{sourceModule:'BGP',nodes:[
   {id:'ce-1',hostname:'CE-1',vendor:'Cisco IOS-XE',role:'customer-edge'},
   {id:'isp-1',hostname:'ISP-1',vendor:'Other',role:'external'}],
   links:[{id:'ebgp',a:'ce-1',b:'isp-1',kind:'eBGP',aPort:'Gi0/0',bPort:'Gi0/0'}]},
  evpn:{sourceModule:'EVPN',nodes:[
   {id:'leaf-1',hostname:'LEAF-1',vendor:'Arista EOS',role:'leaf'},
   {id:'spine-1',hostname:'SPINE-1',vendor:'Arista EOS',role:'spine'},
   {id:'leaf-2',hostname:'LEAF-2',vendor:'Arista EOS',role:'leaf'}],
   links:[{id:'underlay-1',a:'leaf-1',b:'spine-1',kind:'underlay'},
          {id:'underlay-2',a:'spine-1',b:'leaf-2',kind:'underlay'}]}
 };
 const definition=definitions[kind];if(!definition)throw Error('Unknown topology template.');
 return validate({...blank(),...clone(definition),nodes:definition.nodes.map(n=>({...n,source:'template'}))});
}
// Topology-only presets reflecting Design module node families. These DO NOT
// generate configuration or infer protocol reachability. The engineer supplies
// actual CLI/configuration evidence per node after building the graph.
const TECHNOLOGIES={
 BASIC:{label:'System & Management',platforms:['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','FortiGate'],primary:'managed device',secondary:'',primaryCount:1,secondaryCount:0},
 BGP:{label:'BGP',platforms:['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','FortiGate'],primary:'CE router',secondary:'ISP router',primaryCount:2,secondaryCount:2},
 OSPF:{label:'OSPF',platforms:['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','FortiGate'],primary:'router',secondary:'router',primaryCount:1,secondaryCount:1},
 STP:{label:'STP',platforms:['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW'],primary:'core switch',secondary:'access switch',primaryCount:2,secondaryCount:2},
 VPC:{label:'vPC / MLAG',platforms:['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','Huawei iStack'],primary:'peer switch',secondary:'access switch',primaryCount:2,secondaryCount:2},
 EVPN:{label:'EVPN / VXLAN',platforms:['Cisco NX-OS','Arista EOS','Huawei_CE_SW'],primary:'spine',secondary:'leaf',primaryCount:2,secondaryCount:2},
 SDWAN:{label:'SD-WAN',platforms:['Cisco IOS-XE'],primary:'edge router',secondary:'external transport',primaryCount:2,secondaryCount:2},
 QOS:{label:'QoS',platforms:['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW'],primary:'device',secondary:'device',primaryCount:1,secondaryCount:1}
};
function technologyCatalog(){return clone(TECHNOLOGIES);}
function buildTechnologyTopology(module,platform,primaryCount,secondaryCount){
 const key=identifier(module).toUpperCase(),def=TECHNOLOGIES[key];
 if(!def)throw Error('Unknown Design technology.');
 if(!def.platforms.includes(platform))throw Error('Platform is unavailable for this technology.');
 const p=Number(primaryCount),q=Number(secondaryCount);
 if(!Number.isInteger(p)||!Number.isInteger(q)||p<1||p>8||q<0||q>12||(!def.secondary&&q!==0))throw Error('Invalid device counts for the selected technology.');
 if(['VPC','STP'].includes(key)&&p!==2)throw Error('This Design baseline requires two core/peer switches.');
 if(['OSPF','QOS'].includes(key)&&(p!==1||q!==1))throw Error('The current Design baseline is a two-device adjacency.');
 const nodes=[],links=[];const add=(prefix,i,role,level,vendor=platform)=>{
  const id=prefix+'-'+i;
  const spacing=level==='upper'?Math.min(155,650/Math.max(1,p-1)):Math.min(150,650/Math.max(1,q-1));
  const x=Math.max(45,Math.min(755,Math.round(400+(i-1-( (level==='upper'?p:q)-1)/2)*spacing)));
  nodes.push({id,hostname:prefix.toUpperCase()+'-'+String(i).padStart(2,'0'),vendor,role,source:'template',position:{x,y:level==='upper'?95:265}});
  return id;
 };
 const a=Array.from({length:p},(_,i)=>add(key==='BGP'?'ce':key==='EVPN'?'spine':key==='SDWAN'?'edge':key==='BASIC'?'mgmt':key==='OSPF'?'rtr-a':key==='QOS'?'qos-a':'core',i+1,def.primary,'upper'));
 const b=Array.from({length:q},(_,i)=>add(key==='BGP'?'isp':key==='EVPN'?'leaf':key==='SDWAN'?'transport':key==='OSPF'?'rtr-b':key==='QOS'?'qos-b':'access',i+1,def.secondary,'lower',key==='BGP'?'External (ISP)':key==='SDWAN'?'External (transport)':platform));
 const link=(x,y,kind,logical=false)=>{const id='link-'+(links.length+1);links.push({id,a:x,b:y,kind,logical,aPort:'',bPort:''});};
 if(key==='VPC'){
  link(a[0],a[1],platform==='Huawei iStack'?'stack interconnect':'peer-link');
  if(platform!=='Huawei iStack')link(a[0],a[1],'peer-keepalive',true);
 }
 if(key==='STP')link(a[0],a[1],'core interconnect');
 if(key==='BGP')for(const ce of a)for(const isp of b)link(ce,isp,'eBGP candidate');
 else if(key==='SDWAN')for(const edge of a)for(const wan of b)link(edge,wan,'transport candidate');
 else if(key==='EVPN')for(const spine of a)for(const leaf of b)link(spine,leaf,'underlay candidate');
 else if(key==='VPC'||key==='STP')for(const core of a)for(const acc of b)link(core,acc,'access uplink candidate');
 else if(key==='OSPF'||key==='QOS')link(a[0],b[0],key==='OSPF'?'OSPF adjacency candidate':'QoS path');
 // A template is a planning graph, not a claim that peering or physical links exist.
 return validate({...blank(),sourceModule:key,nodes,links,templateInfo:{module:key,platform,primaryCount:p,secondaryCount:q,intentOnly:true}});
}
function buildFreeTopology(options={}){
 const count=Number(options.deviceCount);
 if(!Number.isInteger(count)||count<1||count>32)throw Error('Device count must be between 1 and 32.');
 const layout=identifier(options.layout||'none');
 if(!['none','chain','ring','star','dual-hub','mesh'].includes(layout))throw Error('Unknown topology pattern.');
 if(layout==='mesh'&&count>16)throw Error('Full mesh is limited to 16 devices (120 links).');
 const vendor=identifier(options.vendor||'Other'),role=identifier(options.role||'network-node');
 if(!vendor||!role||vendor.length>80||role.length>80)throw Error('Vendor and role must be provided (max 80 characters).');
 const nodes=Array.from({length:count},(_,i)=>{
  const name='NODE-'+String(i+1).padStart(2,'0');
  return {id:'node-'+String(i+1),hostname:name,vendor,role,source:'user'};
 });
 const links=[],pairs=new Set();
 function connect(i,j){
  if(i===j)return;
  const a=Math.min(i,j),b=Math.max(i,j),key=a+':'+b;
  if(pairs.has(key))return;
  pairs.add(key);
  links.push({id:'link-'+(links.length+1),a:nodes[a].id,b:nodes[b].id,
   kind:'physical connection (planned)',aPort:'',bPort:'',logical:false});
 }
 if(layout==='chain')for(let i=1;i<count;i++)connect(i-1,i);
 if(layout==='ring'&&count>1)for(let i=0;i<count;i++)connect(i,(i+1)%count);
 if(layout==='star')for(let i=1;i<count;i++)connect(0,i);
 if(layout==='dual-hub'&&count>1){
  connect(0,1);
  for(let i=2;i<count;i++){connect(0,i);connect(1,i);}
 }
 if(layout==='mesh')for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)connect(i,j);
 return validate({...blank(),nodes,links,configs:[]});
}
function updateDevice(workspace,id,changes){
 const next=validate(workspace),device=next.nodes.find(n=>n.id===id);
 if(!device)throw Error('Unknown device.');
 for(const key of ['hostname','vendor','role'])if(Object.prototype.hasOwnProperty.call(changes,key))device[key]=identifier(changes[key]);
 return validate(edited(next));
}
function updateLink(workspace,id,changes){
 const next=validate(workspace),link=next.links.find(l=>l.id===id);
 if(!link)throw Error('Unknown link.');
 for(const key of ['a','b','aPort','bPort','kind'])if(Object.prototype.hasOwnProperty.call(changes,key))link[key]=identifier(changes[key]);
 if(Object.prototype.hasOwnProperty.call(changes,'logical'))link.logical=changes.logical===true;
 return validate(edited(next));
}
function removeLink(workspace,id){
 const next=validate(workspace);next.links=next.links.filter(l=>l.id!==id);return validate(edited(next));
}
const sensitive=/(?:password|passwd|secret|snmp[-\s]?server\s+community|snmp\s+community|community-string|private.?key|api.?key|authorization|set\s+psksecret|set\s+enc-password|crypto\s+isakmp\s+key|pre-shared-key|shared-secret|BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9_-]+)/i;
function safeLine(line){return sensitive.test(line)?'[REDACTED]':line.replace(/[\r\n\t]/g,' ');}
function redactPrivateKeyBlocks(lines){
 let inKey=false;
 return lines.map(line=>{
  const begins=/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i.test(line);
  const ends=/-----END [A-Z0-9 ]*PRIVATE KEY-----/i.test(line);
  const hide=inKey||begins;
  if(begins)inKey=true;
  if(ends)inKey=false;
  return hide?'[REDACTED]':line;
 });
}

/* Evidence retrieval across the whole capture. This is bounded selection, not
 * full-file model inference. Original line identifiers must survive sampling. */
const CAPTURE_TOPICS={
 BGP:/\bbgp\b|^\s*Neighbor\s+V\s+AS\b|^\s*(?:neighbor\s+(?:\d{1,3}\.){3}\d{1,3}\s+(?:remote-as|activate)|peer\s+(?:\d{1,3}\.){3}\d{1,3}\s+as-number)|local.pref|route.map|state\/pfx|tcp.179|route policy/i,
 OSPF:/\bospf\b|adjacency|\blsdb\b|exstart|exchange|router.id|area [0-9]/i,
 EVPN:/\bevpn\b|\bvxlan\b|\bvni\b|\bnve\b|route.target|type.[235]|mac.ip|vtep/i,
 VPC:/\bvpc\b|\bmlag\b|peer.link|keep.alive|peer.gateway|port.channel|consistency/i,
 STP:/spanning.tree|\bstp\b|\brstp\b|\bmst\b|bpdu|root.bridge|root.guard/i,
 SDWAN:/sd.wan|sdwan|health.check|\bsla\b|service4|packet.loss|tunnel|ipsec/i,
 SYSTEM:/aaa|ssh|ntp|snmp|logging|username|access.class|tacacs/i,
 DCI:/\bdci\b|\bevpn\b|\bvlan\b|\bvni\b|border|underlay|overlay/i
};
function selectCaptureExcerpt(lines,modules){
 const MAX_LINES=220,MAX_CHARS=24000,SCAN_MAX=100000,first=Math.min(36,lines.length);
 const terms=(modules||[]).map(x=>CAPTURE_TOPICS[String(x).toUpperCase()]).filter(Boolean);
 const universal=/^\s*(?:\S+[#>]\s*)?(?:show|display|diagnose|get)\s+|^Neighbor\s+V\s+AS\s+MsgRcvd|^Health Check\(|^interface\b|^\s*ip route\b|^\s*route\b/i;
 const scores=new Map(),scanned=Math.min(lines.length,SCAN_MAX);
 function score(i,value){if(i>=0&&i<scanned)scores.set(i,Math.max(scores.get(i)||0,value));}
 for(let i=0;i<scanned;i++){
  const text=lines[i],specific=terms.some(re=>re.test(text));
  if(!specific&&!universal.test(text))continue;
  const importance=specific?12:6;
  score(i,importance);
  for(let offset=-2;offset<=3;offset++)if(offset!==0)score(i+offset,importance-3);
 }
 const selected=new Set();let size=0;
 const take=index=>{
  if(selected.has(index)||selected.size>=MAX_LINES)return;
  const added=String(lines[index]).length+('L'+(index+1)+': ').length+1;
  if(size+added>MAX_CHARS)return;
  selected.add(index);size+=added;
 };
 for(let i=0;i<first;i++)take(i);
 for(const [index] of [...scores].sort((a,b)=>b[1]-a[1]||a[0]-b[0]))take(index);
 // Exact original line numbers are preserved even for noncontiguous extracts.
 const chosen=[...selected].sort((a,b)=>a-b);
 return {chosen,scanned,total:lines.length,
  lines:chosen.map(i=>lines[i]),originalNumbers:chosen.map(i=>i+1),
  clipped:chosen.length<lines.length||scanned<lines.length};
}
function analysisEvidenceBatches(workspace,selectedDeviceIds,selectedModules){
 const model=validate(workspace),items=[];
 const allIds=new Set(model.nodes.map(n=>n.id));
 const chosen=selectedDeviceIds==null?allIds:new Set(selectedDeviceIds);
 if(!model.nodes.length)throw Error('Add at least one device before analysis.');
 if(!chosen.size||[...chosen].some(id=>!allIds.has(id)))throw Error('Select one or more valid devices before analysis.');
 // Every topology and configuration fact is line-addressed. No fabricated CLI
 // commands, and no rule-derived conclusion is passed off as an observation.
 const topology=['Workspace topology: user-edited (not verified operational state)'];
 topology.push('Selected devices: '+[...chosen].join(', '));
 for(const n of model.nodes.filter(n=>chosen.has(n.id)))topology.push('Device '+n.id+' hostname='+n.hostname+' vendor='+n.vendor+' role='+n.role);
 for(const l of model.links.filter(l=>chosen.has(l.a)&&chosen.has(l.b)))topology.push('Link '+l.id+' '+l.a+'['+l.aPort+'] to '+l.b+'['+l.bPort+'] kind='+l.kind+' logical='+!!l.logical);
 const addChunks=(idPrefix,header,lines,originalNumbers)=>{
  let chunk=[],size=header.length+15,part=0;
  function flush(){if(!chunk.length)return;items.push({id:idPrefix+'-'+part++,text:header+'\n'+chunk.join('\n')});chunk=[];size=header.length+15;}
  for(let i=0;i<lines.length;i++){
   const line='L'+(originalNumbers?.[i]||i+1)+': '+safeLine(lines[i]);
   if(line.length+header.length>2850)throw Error('A line is too long for AI evidence; split it before analysis.');
   if(chunk.length&&(size+line.length>2800)){flush();}
   chunk.push(line);size+=line.length+1;
  }
  flush();
 };
 addChunks('topology','Device: WORKSPACE\nCommand: user topology manifest (design intent, not operational proof)',topology);
 if(model.designReview){
  const source=model.designReview.edited?'Original Design parameters (workspace has since been edited)':'Original Design parameters (intent; not operational proof)';
  const params=['Source: '+source,'Scope: these parameters describe the complete original Design, not just the selected devices',...model.designReview.parameters.map(p=>
   'Parameter '+p.label+' | selected='+p.value+' | engineering rationale='+p.impact
  )];
  addChunks('design-intent','Device: ORIGINAL-DESIGN\nCommand: parameter choices and engineering rationale',params);
  const checks=model.designReview.checks;
  if(checks){
   const observations=['Source: existing Design consistency checker; this is not AI reasoning or deployed configuration verification','Scope: whole original Design; checker issues are not automatically attributed to selected devices',
    'Evaluated '+checks.evaluated+' inputs; '+checks.errors+' errors; '+checks.warnings+' warnings',
    'Original Design status: '+(model.designReview.edited?'STALE AFTER WORKSPACE EDITS':'snapshot at import')];
   for(const issue of checks.issues||[])observations.push(safeLine('Design check '+issue.code+' '+issue.severity+': '+issue.message));
   addChunks('design-check','Device: ORIGINAL-DESIGN\nCommand: deterministic input checks',observations);
  }
 }
 for(const [index,c]of model.configs.entries()){
  const node=model.nodes.find(n=>n.id===c.deviceId);
  if(!node||!chosen.has(c.deviceId))continue;
  if(c.text.length>150000)throw Error('Device configuration exceeds 150 KB. Use CLI Analysis for large captures.');
  addChunks('config-'+index,'Device: '+identifier(node.hostname).replace(/[\r\n]/g,' ')+'\nVendor: '+identifier(node.vendor).replace(/[\r\n]/g,' ')+'\nCommand: proposed configuration (generated Design or manually attached; NOT deployed)',redactPrivateKeyBlocks(c.text.replace(/\r\n?/g,'\n').split('\n')));
 }
 for(const [index,c]of model.showTech.entries()){
  const node=model.nodes.find(n=>n.id===c.deviceId);
  if(!node||!chosen.has(c.deviceId))continue;
  const lines=redactPrivateKeyBlocks(c.text.replace(/\r\n?/g,'\n').split('\n'));
  const selection=selectCaptureExcerpt(lines,selectedModules);
  items.push({id:'capture-coverage-'+index,text:'Device: '+identifier(node.hostname)+
   '\nCommand: capture coverage and provenance, NOT an operational finding'+
   '\nL1: File '+safeLine(c.filename)+
   '\nL2: Source '+(c.synthetic?'SYNTHETIC LAB':'user-attached operational capture')+
   '; capture timestamp UNKNOWN and device authenticity NOT VERIFIED'+
   '\nL3: Total lines '+lines.length+'; included excerpt lines '+selection.chosen.length+
   '; scanned '+selection.scanned+' lines using bounded, technology-aware retrieval; full capture retained locally; omitted lines NOT evidence of absence.'});
  addChunks('show-tech-'+index,'Device: '+identifier(node.hostname).replace(/[\r\n]/g,' ')+
   '\nVendor: '+identifier(node.vendor).replace(/[\r\n]/g,' ')+
   '\nCommand: '+(c.synthetic?'SYNTHETIC LAB verification output — NOT real device evidence':
    'observed verification CLI capture (separate from Design configuration)')+
   '\nFile: '+safeLine(c.filename),selection.lines,selection.originalNumbers);
 }
 if(!items.length)throw Error('A device or link is required.');
 const batches=[];let batch=[],size=0;
 for(const item of items){
  const weight=JSON.stringify(item).length;
  if(batch.length&&(batch.length>=24||size+weight>27500)){batches.push(batch);batch=[];size=0;}
  batch.push(item);size+=weight;
 }
 if(batch.length)batches.push(batch);
 return batches;
}

root.NetworkAITopology={fromDesign,blank,template,technologyCatalog,buildTechnologyTopology,buildFreeTopology,structuralAssessment,validate,addDevice,moveDevice,updateDevice,addLink,updateLink,removeLink,removeDevice,setConfiguration,setShowTech,addShowTech,removeShowTech,analysisManifest,analysisEvidenceBatches};
})(typeof window==='undefined'?globalThis:window);
