import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('reporting.html','utf8');
const logic=html.slice(html.indexOf('  let inventoryMode='),html.indexOf('  let maintenanceView='));
const devices=[{id:'one',hostname:'SW1',model:'Keep model',vendor:'Cisco NX-OS'},{id:'two',hostname:'SW2',serial:'Keep serial',vendor:'Arista EOS'}];
const elements=new Map();
const $=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:'',hidden:false});return elements.get(id);};
const rows=devices.map(d=>{const inputs={'target':{value:d.id+'.example.test'},sshPort:{value:'22'},sshUsername:{value:'test'},password:{value:''},secret:{value:''}};return {dataset:{batch:d.id},inputs,status:{textContent:''},querySelector(selector){if(selector==='[data-select]')return {checked:true};if(selector==='[data-result]')return this.status;return inputs[/data-key="(.*?)"/.exec(selector)[1]];}};});
$('batchRows').querySelectorAll=()=>rows;
$('batchPassword').value='test-password';
let calls=0;
const context={$,val:id=>$(id).value,state:{devices,vendor:'Cisco NX-OS'},document:{querySelectorAll:()=>[]},deviceName:d=>d.hostname,esc:x=>String(x),vendorLabel:x=>x,renderReport(){},renderEditor(){},fetch:async(url,request)=>{const p=JSON.parse(request.body);assert.equal(p.password,'test-password');assert.equal(p.platform,devices[calls].vendor);calls++;return calls===1?{ok:false,json:async()=>({detail:'Test failure'})}:{ok:true,json:async()=>({hostname:'OBSERVED-SW2',model:'DCS-7050',serial:'',software_version:'4.32.1F',observed_at:'now',warnings:['serial unavailable']})};}};
vm.createContext(context);vm.runInContext(logic,context);
await $('runInventoryBatch').onclick();
assert.equal(calls,2,'failure must not stop the next device');
assert.equal(devices[0].model,'Keep model');
assert.equal(devices[1].serial,'Keep serial','missing collected fields retain previous values');
assert.equal(devices[1].softwareVersion,'4.32.1F');
assert.equal(devices[1].observedHostname,'OBSERVED-SW2');
assert.equal($('batchPassword').value,'');
assert.match($('batchSummary').textContent,/1 collected · 1 failed/);
assert.equal(JSON.stringify(devices).includes('test-password'),false);
console.log('Multi-device failure isolation, vendor routing, partial collection and credential exclusion passed.');
context.fetch=async()=>({ok:true,json:async()=>({rows:[
  {row:'2',id:'one',hostname:'OBSERVED-SW1',serial:'00012',softwareVersion:'',model:''},
  {row:'3',hostname:'SW2',serial:'SN2',softwareVersion:'',model:''},
  {row:'4',id:'one',hostname:'Duplicate',serial:'Wrong',softwareVersion:'',model:''},
  {row:'5',id:'unknown',hostname:'Unknown',serial:'Wrong',softwareVersion:'',model:''}
]})});
await $('inventoryExcel').onchange({target:{files:[{name:'inventory.xlsx',size:100}],value:''}});
assert.equal(devices[0].serial,undefined,'preview must not mutate inventory');
assert.match($('excelPreview').innerHTML,/2 matched of 4/);
$('applyExcel').onclick();
assert.equal(devices[0].serial,'00012');
assert.equal(devices[0].hostname,'SW1','planned topology hostname is preserved');
assert.equal(devices[0].observedHostname,'OBSERVED-SW1');
assert.equal(devices[0].model,'Keep model','blank cells must retain existing values');
assert.equal(devices[1].serial,'SN2');
assert.equal(devices[1].softwareVersion,'4.32.1F');
console.log('Excel preview, ID/hostname matching, duplicate exclusion and blank retention passed.');
