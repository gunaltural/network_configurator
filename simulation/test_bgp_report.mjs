import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),engine=require('../synthetic-bgp.js');
const model={module:'BGP',vendor:'Cisco NX-OS',settings:{},nodes:[{id:'ce1',hostname:'CE-1',asn:65001,prefix:'10.10.0.0/16'},{id:'ce2',hostname:'CE-2',asn:65001,prefix:'10.20.0.0/16'},{id:'isp1',hostname:'ISP-1',asn:64501,prefix:'198.18.255.1/32'},{id:'isp2',hostname:'ISP-2',asn:64502,prefix:'198.18.255.1/32'}],links:[{id:'wan1',a:'ce1',b:'isp1',aPort:'Ethernet1/1',bPort:'Ethernet0/1',aIp:'172.16.16.1/30',bIp:'172.16.16.2/30',localPreference:250,prependCount:0},{id:'wan2',a:'ce2',b:'isp2',aPort:'Ethernet1/1',bPort:'Ethernet0/2',aIp:'172.16.20.1/30',bIp:'172.16.20.2/30',localPreference:100,prependCount:3},{id:'wan3',a:'ce2',b:'isp1',aPort:'Ethernet1/2',bPort:'Ethernet0/3',aIp:'172.16.24.1/30',bIp:'172.16.24.2/30',localPreference:100,prependCount:3},{id:'wan4',a:'ce1',b:'isp2',aPort:'Ethernet1/3',bPort:'Ethernet0/4',aIp:'172.16.28.1/30',bIp:'172.16.28.2/30',localPreference:100,prependCount:3},{id:'interconnect',a:'ce1',b:'ce2',aPort:'Ethernet1/47',bPort:'Ethernet1/47',aIp:'10.255.254.1/30',bIp:'10.255.254.2/30',localPreference:100}]};
function scenario(devices=[],links=[],direction='outbound',policies={},vendor='Cisco NX-OS'){
 const w=new JSDOM('',{runScripts:'outside-only'}).window;w.eval(fs.readFileSync('simulation-report.js','utf8'));
 const m={...structuredClone(model),vendor};m.bgp=m;const effective={...m,links:m.links.map(l=>({...l,...policies[l.id]}))};delete effective.bgp;
 const evaluate=(dn,dl)=>{const all=engine.evaluate(effective,dn,dl,{clientPrefix:'10.10.0.0/16'}),route=direction==='inbound'?all.internetInbound:all.clientOutbound;return {...route,path:route.selected,gateway:all.gateway,status:route.state};};
 const initial=engine.evaluate(model,[],[],{clientPrefix:'10.10.0.0/16'}),initialRoute=direction==='inbound'?initial.internetInbound:initial.clientOutbound;
 const current=evaluate(devices,links),baseline={...initialRoute,path:initialRoute.selected,gateway:initial.gateway};
 const s={id:'sample',createdAt:'2026-10-19T07:00:00Z',direction,clientPrefix:'10.10.0.0/16',vendor,preferredGateway:'CE-1',activeGateway:current.gateway.active,failedDevices:devices,failedLinks:links,baselinePath:baseline.path?.nodes.join(' → ')||'',currentPath:current.path?.nodes.join(' → ')||'',reachable:!!current.path,pathChanged:JSON.stringify(current.path)!==JSON.stringify(baseline.path),gatewayChanged:current.gateway.active!==baseline.gateway.active,policies:[],evidenceVersion:1};
 const report=w.SimulationAssessment.enrich(s,{model:m,result:current,baselineResult:baseline,state:{devices,links},policies,bgpDestination:direction==='inbound'?'10.10.0.0/16':'198.18.255.1/32',bgpObserver:current.gateway.active||'ce1',bgpEvaluate:evaluate});
 return {w,report,current,baseline};
}
const metric=(s,name)=>s.metrics.find(x=>x.metric===name);
test('the supplied double-failure scenario has four-to-one candidates and three verified remaining cut points',()=>{
 const {w,report:r}=scenario(['ce1','isp1']);try{
  assert.deepEqual([metric(r,'Eligible BGP paths').baseline,metric(r,'Eligible BGP paths').current],['4','1']);assert.equal(metric(r,'Available eBGP adjacencies').current,'1');assert.equal(metric(r,'Available iBGP adjacencies').current,'0');assert.equal(metric(r,'Unavailable connections').current,'4');
  const outputs=r.syntheticOutputs.en;assert.equal(outputs.length,3);assert.ok(outputs[0].title.includes('CE-2'));assert.equal(outputs[0].rows.length,3);
  const text=JSON.stringify(outputs);for(const address of ['172.16.20.1/30','172.16.20.2/30','172.16.24.2/30','10.255.254.1/30'])assert.ok(text.includes(address),address);
  const impact=r.assessment.en.sections.find(s=>s.title==='Service impact and residual risk').paragraphs.join(' ');for(const name of ['CE-2','ISP-2','wan2'])assert.ok(impact.includes(name));assert.match(impact,/additional individual failure/);
  const html=w.SimulationReport.html([r],'en');assert.ok(html.includes('Synthetic BGP outputs'));assert.ok(!html.includes('Verification command plan'));assert.ok(!html.includes('No packet-loss percentage'));assert.ok(!html.includes('Not measured'));assert.ok(!html.includes('Design and scenario parameters'));
  assert.ok(w.SimulationReport.html([r],'tr').includes('Uygun BGP yolları'));
 }finally{w.close();}
});
test('candidate count and ISP diversity stay distinct, and gateway failover is included in the extra-failure check',()=>{
 for(const [dn,dl,count,exits]of [[[],[],4,2],[['isp1'],[],2,1],[[],['interconnect'],2,2],[[],['wan1','wan4','interconnect'],0,0]]){
  const {w,report:r}=scenario(dn,dl);try{assert.equal(+metric(r,'Eligible BGP paths').current,count);assert.equal(+metric(r,'Usable upstream exits').current,exits);const impact=r.assessment.en.sections.find(s=>s.title==='Service impact and residual risk').paragraphs.join(' ');if(!dn.length&&!dl.length)assert.ok(!impact.includes('additional individual failure of any'));if(dn.includes('isp1')){assert.match(impact,/ISP-2/);assert.ok(!impact.includes('CE-1;'));}if(!count)assert.match(r.assessment.en.sections.find(s=>s.title==='Technical interpretation').paragraphs.join(' '),/gateway remains CE-1/);}finally{w.close();}
 }
});
test('inbound uses the ISP-side next hop and customer AS path, with unchanged snapshots across vendors',()=>{
 for(const vendor of ['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','FortiGate']){
  const {w,report:r}=scenario(['ce1','isp1'],[],'inbound',{},vendor);try{const outputs=r.syntheticOutputs.en;assert.match(outputs[0].title,/ISP-2/);const forward=outputs[2].rows;assert.equal(forward[0][2],'10.10.0.0/16');assert.match(forward.find(x=>x[0]==='Selected next hop / interface')[2],/172.16.20.1/);assert.equal(forward.find(x=>x[0]==='Selected AS path')[2],'65001 65001 65001 65001');const saved=JSON.stringify(r);w.SimulationReport.html([r],'tr');assert.equal(JSON.stringify(r),saved);}finally{w.close();}
 }
});
test('historical records are not given invented neighbor evidence, and repeated measurement disclaimers are hidden',()=>{
 const {w}=scenario();try{const old={id:'old',createdAt:'2026-10-18',direction:'outbound',policies:[],assessment:{en:{summary:'Captured historical result.',sections:[{title:'Service impact and residual risk',paragraphs:['No packet-loss percentage, outage duration or convergence time is reported because this scenario contains no measured traffic evidence.']}],commands:[{command:'show bgp summary',purpose:'check',execution:'Not executed'}]}}};const saved=JSON.stringify(old),html=w.SimulationReport.html([old]);assert.ok(!html.includes('No packet-loss percentage'));assert.ok(!html.includes('Verification command plan'));assert.ok(!html.includes('Synthetic BGP outputs'));assert.equal(JSON.stringify(old),saved);}finally{w.close();}
});
