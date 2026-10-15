import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {evaluate}=require('../synthetic-bgp.js');
const base={
 nodes:[
 {id:'ce1',hostname:'CE-1',asn:65001,prefix:'10.20.0.0/24'},
 {id:'ce2',hostname:'CE-2',asn:65001,prefix:'10.30.0.0/24'},
 {id:'isp1',hostname:'ISP-1',asn:64501,prefix:'198.18.0.0/24'},
 {id:'isp2',hostname:'ISP-2',asn:64502,prefix:'198.18.0.0/24'}
 ],
 links:[
 {id:'wan1',a:'ce1',b:'isp1',localPreference:200,prependCount:0},
 {id:'wan2',a:'ce2',b:'isp2',localPreference:100,prependCount:0},
 {id:'interconnect',a:'ce1',b:'ce2',localPreference:100,prependCount:0}
 ]
};
test('BGP normal target reachable through direct ISP and alternate CE',()=>{
 const r=evaluate(base,[],[],{target:'ce1'});
 assert.equal(r.internetInbound.state,'reachable');
 assert.ok(r.internetInbound.candidates.some(c=>c.entry==='ce2'&&c.links.includes('interconnect')));
});
test('BGP target CE failure must remove false Internet inbound path',()=>{
 const r=evaluate(base,['ce1'],[],{target:'ce1'});
 assert.equal(r.internetInbound.state,'no-path');
 assert.equal(r.internetInbound.candidates.length,0);
});
test('BGP interconnect failure must remove alternate entry for target prefix',()=>{
 const r=evaluate(base,[],['interconnect'],{target:'ce1'});
 assert.equal(r.internetInbound.state,'reachable');
 assert.ok(r.internetInbound.candidates.every(c=>c.entry==='ce1'));
});
test('BGP target WAN + interconnect down isolates inbound prefix',()=>{
 const r=evaluate(base,[],['wan1','interconnect'],{target:'ce1'});
 assert.equal(r.internetInbound.state,'no-path');
});
test('BGP simultaneous ISP and CE failure retains consistent inbound status',()=>{
 const r=evaluate(base,['ce2','isp1'],[],{target:'ce1'});
 assert.equal(r.internetInbound.state,'no-path');
});
test('BGP restore scenario returns route selection',()=>{
 const down=evaluate(base,[],['wan1','interconnect'],{target:'ce1'});
 const restored=evaluate(base,[],[],{target:'ce1'});
 assert.equal(down.internetInbound.state,'no-path');
 assert.equal(restored.internetInbound.state,'reachable');
});
