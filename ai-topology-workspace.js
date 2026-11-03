/* AI Analysis topology workspace model. Isolated from the existing Design/Inventory/Simulation flow. */
(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const identifier=x=>String(x??'').trim();
function fromDesign(report){
 if(!report||!Array.isArray(report.devices))throw Error('A design with devices is required.');
 const nodes=report.devices.filter(d=>!d.inventoryOnly).map(d=>({id:identifier(d.id),hostname:identifier(d.hostname||d.id),vendor:identifier(d.vendor||report.vendor),role:identifier(d.tier||d.role),source:'design'}));
 const links=[...(report.links||[]),...(report.specialLinks||[])].filter(l=>l.enabled!==false).map((l,i)=>({id:identifier(l.id||'link-'+i),a:identifier(l.a),b:identifier(l.b),aPort:identifier(l.aPort||l.upperPort),bPort:identifier(l.bPort||l.lowerPort),kind:identifier(l.kind||'Connection'),logical:l.logical===true}));
 return validate({schema:'ai-topology-workspace-v1',sourceModule:identifier(report.source?.module),nodes,links,configs:[]});
}
function validate(workspace){
 const model=clone(workspace),ids=new Set(),linkIds=new Set();
 if(model.schema!=='ai-topology-workspace-v1'||!Array.isArray(model.nodes)||!Array.isArray(model.links)||!Array.isArray(model.configs))throw Error('Invalid workspace schema.');
 for(const n of model.nodes){if(!identifier(n.id)||ids.has(n.id))throw Error('Duplicate or empty device id.');ids.add(n.id);}
 for(const l of model.links){if(!identifier(l.id)||linkIds.has(l.id)||!ids.has(l.a)||!ids.has(l.b)||l.a===l.b)throw Error('Invalid link or endpoint.');linkIds.add(l.id);}
 for(const c of model.configs){if(!ids.has(c.deviceId)||typeof c.text!=='string')throw Error('Configuration has no matching device.');}
 return model;
}
function addDevice(workspace,device){
 const next=validate(workspace);next.nodes.push({id:identifier(device.id),hostname:identifier(device.hostname||device.id),vendor:identifier(device.vendor),role:identifier(device.role),source:'user'});return validate(next);
}
function addLink(workspace,link){
 const next=validate(workspace);next.links.push({id:identifier(link.id),a:identifier(link.a),b:identifier(link.b),aPort:identifier(link.aPort),bPort:identifier(link.bPort),kind:identifier(link.kind||'Connection'),logical:link.logical===true});return validate(next);
}
function removeDevice(workspace,id){
 const next=validate(workspace);next.nodes=next.nodes.filter(n=>n.id!==id);next.links=next.links.filter(l=>l.a!==id&&l.b!==id);next.configs=next.configs.filter(c=>c.deviceId!==id);return validate(next);
}
function setConfiguration(workspace,deviceId,text){
 const next=validate(workspace);if(!next.nodes.some(n=>n.id===deviceId))throw Error('Unknown device.');
 if(typeof text!=='string')throw Error('Configuration must be text.');
 next.configs=next.configs.filter(c=>c.deviceId!==deviceId);
 next.configs.push({deviceId,text});return validate(next);
}
function analysisManifest(workspace){
 const model=validate(workspace);
 // Never include raw configuration in a manifest destined for the AI provider.
 return {schema:model.schema,sourceModule:model.sourceModule,nodes:model.nodes,links:model.links,configurationCoverage:model.nodes.map(n=>({deviceId:n.id,present:model.configs.some(c=>c.deviceId===n.id)}))};
}
root.NetworkAITopology={fromDesign,validate,addDevice,addLink,removeDevice,setConfiguration,analysisManifest};
})(typeof window==='undefined'?globalThis:window);
