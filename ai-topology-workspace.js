/* AI Analysis topology workspace model. Isolated from the existing Design/Inventory/Simulation flow. */
(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const identifier=x=>String(x??'').trim();
function fromDesign(report){
 if(!report||!Array.isArray(report.devices))throw Error('A design with devices is required.');
 const nodes=report.devices.filter(d=>!d.inventoryOnly).map(d=>({id:identifier(d.id),hostname:identifier(d.hostname||d.id),vendor:identifier(d.vendor||report.vendor),role:identifier(d.tier||d.role),source:'design'}));
 const links=[...(report.links||[]),...(report.specialLinks||[])].filter(l=>l.enabled!==false).map((l,i)=>({id:identifier(l.id||'link-'+i),a:identifier(l.a),b:identifier(l.b),aPort:identifier(l.aPort||l.upperPort),bPort:identifier(l.bPort||l.lowerPort),kind:identifier(l.kind||'Connection'),logical:l.logical===true}));
 const ids=new Set(nodes.map(n=>n.id));
 const configs=(report.configurations||[]).filter(c=>ids.has(identifier(c.deviceId))&&typeof c.text==='string').map(c=>({
  deviceId:identifier(c.deviceId),text:String(c.text).replace(/\r\n?/g,'\n').split('\n').map(safeLine).join('\n')
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
 return validate({schema:'ai-topology-workspace-v1',sourceModule:identifier(report.source?.module),sourceProjectName:identifier(report.source?.projectName).slice(0,120),nodes,links,configs,designReview});
}
function validate(workspace){
 const model=clone(workspace),ids=new Set(),linkIds=new Set();
 if(model.schema!=='ai-topology-workspace-v1'||!Array.isArray(model.nodes)||!Array.isArray(model.links)||!Array.isArray(model.configs))throw Error('Invalid workspace schema.');
 if(model.designReview&&(!Array.isArray(model.designReview.parameters)||typeof model.designReview.edited!=='boolean'))throw Error('Invalid Design review context.');
 for(const n of model.nodes){if(!identifier(n.id)||ids.has(n.id))throw Error('Duplicate or empty device id.');ids.add(n.id);}
 for(const l of model.links){if(!identifier(l.id)||linkIds.has(l.id)||!ids.has(l.a)||!ids.has(l.b)||l.a===l.b)throw Error('Invalid link or endpoint.');linkIds.add(l.id);}
 const configuredDevices=new Set();
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
function addLink(workspace,link){
 const next=validate(workspace);next.links.push({id:identifier(link.id),a:identifier(link.a),b:identifier(link.b),aPort:identifier(link.aPort),bPort:identifier(link.bPort),kind:identifier(link.kind||'Connection'),logical:link.logical===true});return validate(edited(next));
}
function removeDevice(workspace,id){
 const next=validate(workspace);next.nodes=next.nodes.filter(n=>n.id!==id);next.links=next.links.filter(l=>l.a!==id&&l.b!==id);next.configs=next.configs.filter(c=>c.deviceId!==id);return validate(edited(next));
}
function setConfiguration(workspace,deviceId,text){
 const next=validate(workspace);if(!next.nodes.some(n=>n.id===deviceId))throw Error('Unknown device.');
 if(typeof text!=='string')throw Error('Configuration must be text.');
 next.configs=next.configs.filter(c=>c.deviceId!==deviceId);
 next.configs.push({deviceId,text});return validate(edited(next));
}
function analysisManifest(workspace){
 const model=validate(workspace);
 // Never include raw configuration in a manifest destined for the AI provider.
 return {schema:model.schema,sourceModule:model.sourceModule,nodes:model.nodes,links:model.links,configurationCoverage:model.nodes.map(n=>({deviceId:n.id,present:model.configs.some(c=>c.deviceId===n.id)}))};
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
// Technology-neutral builder: constructs only user-selected nodes and links.
// Never invents routing policies, configurations, device state or AI conclusions.
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
const sensitive=/(?:password|passwd|secret|snmp[-\s]?server\s+community|snmp\s+community|community-string|private.?key|api.?key|authorization|sk-[A-Za-z0-9_-]+)/i;
function safeLine(line){return sensitive.test(line)?'[REDACTED]':line.replace(/[\r\n\t]/g,' ');}
function analysisEvidenceBatches(workspace){
 const model=validate(workspace),items=[];
 if(!model.nodes.length)throw Error('Add at least one device before analysis.');
 // Every topology and configuration fact is line-addressed. No fabricated CLI
 // commands, and no rule-derived conclusion is passed off as an observation.
 const topology=['Workspace topology: user-edited (not verified operational state)'];
 for(const n of model.nodes)topology.push('Device '+n.id+' hostname='+n.hostname+' vendor='+n.vendor+' role='+n.role);
 for(const l of model.links)topology.push('Link '+l.id+' '+l.a+'['+l.aPort+'] to '+l.b+'['+l.bPort+'] kind='+l.kind+' logical='+!!l.logical);
 const addChunks=(idPrefix,header,lines)=>{
  let chunk=[],size=header.length+15,part=0;
  function flush(){if(!chunk.length)return;items.push({id:idPrefix+'-'+part++,text:header+'\n'+chunk.join('\n')});chunk=[];size=header.length+15;}
  for(let i=0;i<lines.length;i++){
   const line='L'+(i+1)+': '+safeLine(lines[i]);
   if(line.length+header.length>2850)throw Error('A line is too long for AI evidence; split it before analysis.');
   if(chunk.length&&(size+line.length>2800)){flush();}
   chunk.push(line);size+=line.length+1;
  }
  flush();
 };
 addChunks('topology','Device: WORKSPACE\nCommand: user topology manifest (design intent, not operational proof)',topology);
 if(model.designReview){
  const source=model.designReview.edited?'Original Design parameters (workspace has since been edited)':'Original Design parameters (intent; not operational proof)';
  const params=['Source: '+source,...model.designReview.parameters.map(p=>
   'Parameter '+p.label+' | selected='+p.value+' | engineering rationale='+p.impact
  )];
  addChunks('design-intent','Device: ORIGINAL-DESIGN\nCommand: parameter choices and engineering rationale',params);
  const checks=model.designReview.checks;
  if(checks){
   const observations=['Source: existing Design consistency checker; this is not AI reasoning or deployed configuration verification',
    'Evaluated '+checks.evaluated+' inputs; '+checks.errors+' errors; '+checks.warnings+' warnings',
    'Original Design status: '+(model.designReview.edited?'STALE AFTER WORKSPACE EDITS':'snapshot at import')];
   for(const issue of checks.issues||[])observations.push(safeLine('Design check '+issue.code+' '+issue.severity+': '+issue.message));
   addChunks('design-check','Device: ORIGINAL-DESIGN\nCommand: deterministic input checks',observations);
  }
 }
 for(const [index,c]of model.configs.entries()){
  const node=model.nodes.find(n=>n.id===c.deviceId);
  if(!node)continue;
  if(c.text.length>150000)throw Error('Device configuration exceeds 150 KB. Use CLI Analysis for large captures.');
  addChunks('config-'+index,'Device: '+identifier(node.hostname).replace(/[\r\n]/g,' ')+'\nVendor: '+identifier(node.vendor).replace(/[\r\n]/g,' ')+'\nCommand: proposed configuration (generated Design or manually attached; NOT deployed)',c.text.replace(/\r\n?/g,'\n').split('\n'));
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

root.NetworkAITopology={fromDesign,blank,template,buildFreeTopology,validate,addDevice,updateDevice,addLink,updateLink,removeLink,removeDevice,setConfiguration,analysisManifest,analysisEvidenceBatches};
})(typeof window==='undefined'?globalThis:window);
