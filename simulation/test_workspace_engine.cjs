const assert=require('node:assert/strict');require('./workspace-engine.js');
const E=global.WorkspaceSimulationEngine;
function model(module,vendor='Cisco NX-OS'){return E.normalize({report:{source:{module},vendor,technology:module,devices:[{id:'upper-1',hostname:'Core-1',tier:'upper'},{id:'upper-2',hostname:'Core-2',tier:'upper'},{id:'lower-1',hostname:'Leaf-1',tier:'lower'}],links:[{id:'a',a:'lower-1',b:'upper-1',cost:10},{id:'b',a:'lower-1',b:'upper-2',cost:20}],specialLinks:[{kind:'Peer-link',a:'upper-1',b:'upper-2'}]},settings:{preferredRoot:'upper-1',shapeRate:800,policeRate:500}});}
for(const module of E.modules)for(const vendor of ['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','Huawei iStack','FortiGate']){
 const m=model(module,vendor),options={source:'lower-1',target:'upper-1'};
 assert.ok(E.evaluate(m,{},options).path,module+' baseline');
 assert.equal(E.evaluate(m,{devices:['upper-1','upper-2'],links:['a']},options).path,null);
 assert.ok(E.evaluate(m,{},options).path,'restore baseline');
}
let m=model('OSPF');assert.equal(E.evaluate(m,{}, {source:'lower-1',target:'upper-1'}).path.cost,10);assert.deepEqual(E.evaluate(m,{links:['a']},{source:'lower-1',target:'upper-1'}).path.nodes,['lower-1','upper-2','upper-1']);
assert.equal(E.evaluate(model('QOS'),{},{source:'lower-1',target:'upper-1',offeredRate:1000}).qos.admittedMbps,500);
assert.equal(E.evaluate(model('VPC'),{links:['special-0']},{source:'lower-1',target:'upper-1'}).status,'conditional');
assert.equal(E.evaluate(model('STP'),{devices:['upper-1']},{source:'lower-1',target:'upper-2'}).root,'upper-2');
m=model('BGP');m.bgp={nodes:[{id:'ce1'},{id:'ce2'},{id:'ce3'},{id:'isp1'}],links:[{id:'wan1',a:'ce1',b:'isp1',localPreference:100},{id:'wan2',a:'ce2',b:'isp1',localPreference:250},{id:'internal',a:'ce1',b:'ce2'}]};
assert.deepEqual(E.evaluate(m,{}, {bgpSource:'ce1'}).path.nodes,['ce1','ce2','isp1']);
assert.deepEqual(E.evaluate(m,{links:['internal']},{bgpSource:'ce1'}).path.nodes,['ce1','isp1']);
assert.equal(E.evaluate(m,{}, {bgpSource:'ce3'}).path,null,'No invented internal transport');
assert.equal(E.evaluate(m,{devices:['ce1']},{direction:'inbound',bgpTarget:'ce1'}).path,null);
assert.throws(()=>E.normalize({report:{source:{module:'MPLS'},devices:[]}}));
console.log('48 module/vendor engine cases plus protocol, concurrent failure and restore assertions passed.');
