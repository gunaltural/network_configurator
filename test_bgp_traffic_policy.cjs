const fs = require('fs'), assert = require('assert/strict'), {JSDOM, VirtualConsole} = require('jsdom');
const P = require('./bgp-traffic-policy.js'), {evaluate} = require('./synthetic-bgp.js');
assert.throws(() => P.read('{'), /could not be read/);
assert.throws(() => P.read('[null]'), /Invalid/);
assert.throws(() => P.read(JSON.stringify([{direction:'import',localPreference:100,prefixes:'203.0.113.1/24'}])), /network address/);
assert.throws(() => P.read(JSON.stringify([{direction:'export',localPreference:100}])), /imported/);
assert.throws(() => P.read(JSON.stringify([{direction:'export',prependCount:11}])), /between/);
assert.throws(() => P.read(JSON.stringify([{direction:'export',communities:'65536:1'}])), /communities/);
const errors=[], vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
let html=fs.readFileSync('web.html','utf8').replace(/\}\)\(\);\s*<\/script>\s*<\/body>/,'window.__teAudit={bgpGenerate,bgpTrafficRules,bgpLabDesign,reportingDesign};})();</script></body>');
const dom=new JSDOM(html,{url:'https://test.invalid/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){for(const f of ['bgp-traffic-policy.js','synthetic-bgp.js','huawei-istack.js','engineering-locale.js','vpc-report.js','verification-plan.js','design-checks.js'])w.eval(fs.readFileSync(f,'utf8'));w.confirm=()=>true;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=async()=>({ok:true,json:async()=>({platforms:{}})});}});
const w=dom.window,d=w.document,pause=()=>new Promise(r=>setTimeout(r,90));
const change=(id,value)=>{const el=d.getElementById(id);assert.ok(el,id);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
(async()=>{try{
 d.querySelector('.tech[data-tech="BGP"]').click();await pause();
 assert.equal(d.getElementById('bgpMaxPrefix').checked,false);
 assert.equal(d.getElementById('bgpMaxPrefixValue').disabled,true);
 const links=d.querySelectorAll('[data-bgp-connection]').length;d.getElementById('bgpAddUpstream').click();await pause();
 assert.ok(d.querySelector('[data-bgp-device="isp3"][data-bgp-connected="false"]'));
 assert.equal(d.querySelectorAll('[data-bgp-connection]').length,links,'Adding a router must not invent circuits');
 assert.match(d.querySelector('[data-bgp-device="isp3"]').textContent,/No connection/);
 for(const vendor of ['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','FortiGate']){
  change('platform',vendor);await pause();change('bgpOutputDevice','all');change('bgpMaxPrefix',false);change('bgpTeLocalPref',false);
  const rows=[{enabled:true,connection:'1',direction:'import',prefixes:'198.18.255.1/32',localPreference:'300',med:'0',communities:'65001:11,65001:12'},
   {enabled:true,connection:'2',direction:'import',prefixes:'198.18.255.1/32',localPreference:'400'},
   {enabled:true,connection:'1',direction:'export',prefixes:d.getElementById('bgpCe1Prefix').value,prependCount:'2',med:'40',communities:'65001:21,65001:22'},
   {enabled:true,connection:'2',direction:'export',prefixes:d.getElementById('bgpCe2Prefix').value,prependCount:'5',med:'80',communities:'65001:31'}];
  change('bgpTrafficPoliciesData',JSON.stringify(rows));
  const config=w.__teAudit.bgpGenerate('config');assert.ok(!config.includes('NaN'));assert.match(config,/(?:local-preference|set-local-preference) 300/);assert.match(config,/(?:local-preference|set-local-preference) 400/);
  assert.match(config,/(?:set metric|apply cost|set set-metric) 0/);assert.ok(config.includes('65001:21'));assert.ok(config.includes('65001:22'));
  assert.match(config,/65000/,'Unmatched routes retain a permit fallback');assert.ok(!/maximum-prefix|maximum-routes|route-limit/.test(config));
  assert.ok(config.includes('198.18.255.1'));
  if(vendor==='Huawei_CE_SW')assert.match(config,/peer .*route-policy .*IMPORT import/);else assert.match(config,/route-map.*IN|route-map-in/);
  change('bgpMaxPrefixValue','15000');change('bgpMaxPrefix',true);assert.equal(d.getElementById('bgpMaxPrefixValue').disabled,false);assert.match(w.__teAudit.bgpGenerate('config'),/(?:maximum-prefix|maximum-routes|route-limit) 15000/);
  change('bgpMaxPrefix',false);change('bgpMaxPrefixValue','');assert.ok(!/maximum-prefix|maximum-routes|route-limit/.test(w.__teAudit.bgpGenerate('config')));
  assert.match(w.__teAudit.bgpGenerate('notes'),/Local Preference 300/);assert.match(JSON.stringify(w.__teAudit.reportingDesign()),/Traffic policy rules/);
  const saved=JSON.parse(JSON.stringify(w.NetworkWorkspaceProject.snapshot()));w.NetworkWorkspaceProject.apply(saved);await pause();assert.equal(w.__teAudit.bgpTrafficRules().length,4);
  assert.equal(d.querySelectorAll('[data-traffic-policy]').length,4);
  const control=d.querySelector('[data-traffic-policy="0"] [data-policy-field="localPreference"]');control.focus();control.value='333';control.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(control.isConnected,true);assert.equal(w.__teAudit.bgpTrafficRules()[0].localPreference,333);
  change('bgpOutputDevice','0');const displayed=d.getElementById('output').textContent;assert.equal(w.NetworkWorkspaceProject.prepareCompare(),true);assert.equal(JSON.parse(w.sessionStorage.getItem('networkConfigurator.compare.baseline')).text,displayed);
 }
 const rule=P.read(JSON.stringify([{direction:'import',localPreference:500,prefixes:'198.18.0.0/24'}]))[0];
 const model={nodes:[{id:'ce1',asn:65001,prefix:'10.0.0.0/24'},{id:'ce2',asn:65001,prefix:'10.1.0.0/24'},{id:'isp1',asn:64501,prefix:'198.18.0.0/24'},{id:'isp2',asn:64502,prefix:'198.18.0.0/24'}],links:[{id:'wan1',a:'ce1',b:'isp1',localPreference:250},{id:'wan2',a:'ce2',b:'isp2',localPreference:100,trafficPolicies:[rule]},{id:'interconnect',a:'ce1',b:'ce2',localPreference:100}]};
 assert.equal(evaluate(model).routes[0].selected.externalLink,'wan2');
 model.links[1].trafficPolicies[0].prefixes=['203.0.113.0/24'];assert.equal(evaluate(model).routes[0].selected.externalLink,'wan1');
 assert.deepEqual(errors,[]);console.log('BGP traffic rules: five vendors, independent attributes, optional maximum-prefix, matching/fallback, persistence, live editing, simulation, disconnected routers and exact selected-device comparison passed.');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
