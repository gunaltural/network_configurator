/* Explicit discovery-to-inventory import. Never alters design links or configurations. */
(function(){
'use strict';
function apply(report, payload){
 if(!report||report.schema!=='network-configurator-report-v1'||payload?.schema!=='network-discovery-inventory-v1')throw Error('Invalid discovery inventory transfer.');
 const targetProject=report.source?.projectId;
 if(targetProject&&payload.projectId&&targetProject!==payload.projectId)throw Error('Discovery belongs to another project. Open the matching project before importing.');
 const platforms=['Cisco IOS-XE','Cisco NX-OS','Arista EOS','Huawei_CE_SW','Huawei iStack','FortiGate'];
 if(!Array.isArray(payload.devices)||payload.devices.length>500||new Set(payload.devices.map(d=>d?.id)).size!==payload.devices.length)throw Error('Invalid or duplicate discovery devices.');
 const pending=[];for(const d of payload.devices||[]){if(!d||!d.id||!d.hostname)throw Error('A discovery device is missing its identity.');const previous=report.devices.find(x=>x.discoveryId===d.id);if(previous){pending.push({device:previous,existing:true});continue;}
 // Identical names/addresses are presented for explicit reconciliation, not silently overwritten.
 const conflict=report.devices.find(x=>!x.discoveryId&&((x.target&&d.managementAddresses?.includes(x.target))||(x.observedHostname&&x.observedHostname.toLowerCase()===d.hostname.toLowerCase())));
 if(conflict)throw Error('Inventory already contains '+d.hostname+'. Resolve the duplicate before importing this device. Existing records are unchanged.');
 const observed=d.identitySource==='SSH inventory / neighbors';
 const device={id:'inv-'+d.id,discoveryId:d.id,inventoryOnly:true,inventoryRecord:true,inventoryChannel:'manual',collectionMethod:'manual',tier:'upper',index:1,hostname:d.hostname,observedHostname:d.hostname,target:d.managementAddresses?.[0]||'',vendor:platforms.includes(d.vendor)?d.vendor:report.vendor,model:observed?d.model||'':'',serial:observed?d.serial||'':'',softwareVersion:observed?d.softwareVersion||'':'',modelSource:observed&&d.model?'device':'',serialSource:observed&&d.serial?'device':'',softwareSource:observed&&d.softwareVersion?'device':'',observedAt:d.observedAt||'',sshPort:22,sshUsername:'',discoveryIdentitySource:d.identitySource||'Neighbor advertisement',maintenance:{}};
 pending.push({device,existing:false});}
 let added=0;report.inventoryRevision=2;
 if(!Array.isArray(report.inventoryDeviceIds))report.inventoryDeviceIds=report.devices.filter(x=>x.inventoryRecord||x.inventoryOnly).map(x=>x.id);
 if(!Array.isArray(report.manualVisibleIds))report.manualVisibleIds=report.devices.filter(x=>(x.inventoryChannel||x.collectionMethod)!=='automatic'&&(x.inventoryRecord||x.inventoryOnly)).map(x=>x.id);
 for(const {device,existing} of pending){if(!existing){report.devices.push(device);added++;}if(!report.inventoryDeviceIds.includes(device.id))report.inventoryDeviceIds.push(device.id);if(!report.manualVisibleIds.includes(device.id))report.manualVisibleIds.push(device.id);}
 return {added,retained:pending.length-added};
}
window.NetworkDiscoveryInventory={apply};
})();
