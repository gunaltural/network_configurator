const assert=require('node:assert/strict');require('./ai-evidence.js');
let count=0;
for(const module of ['BGP','OSPF','STP','VPC','SDWAN','QOS','EVPN','BASIC'])for(const vendor of ['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','FortiGate']){
 const report={source:{module},vendor,devices:[{id:'a',hostname:'A',password:'PRIVATE'}],configurations:[{text:'RAW_CONFIG'}],parameters:[{label:'Password',value:'PRIVATE'},{label:'Local Preference',value:'200'}],specialLinks:[{kind:'peer-link',a:'a',b:'b'}],simulationScenarios:[{module,vendor,scenarioName:'MATCH',currentPath:'A → B'},{module:'OTHER',vendor,scenarioName:'OTHER_MODULE'},{module,vendor:'OTHER',scenarioName:'OTHER_VENDOR'}]};
 const before=JSON.stringify(report),result=JSON.stringify(NetworkAIEvidence.build(report));
 for(const value of ['PRIVATE','RAW_CONFIG','OTHER_MODULE','OTHER_VENDOR'])assert.ok(!result.includes(value));
 for(const value of ['MATCH','peer-link','200'])assert.ok(result.includes(value));
 assert.equal(JSON.stringify(report),before);count+=8;
}
assert.throws(()=>NetworkAIEvidence.build({source:{module:'COMBINED'},vendor:'Cisco'}));
assert.throws(()=>NetworkAIEvidence.build({source:{module:'BGP'},vendor:'Cisco',devices:Array.from({length:31},(_,id)=>({id}))}));
console.log(`${count+2} AI evidence assertions passed`);
