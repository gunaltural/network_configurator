const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
require('./design-checks.js');const C=global.NetworkDesignChecks;
const issues=(module,fields,platform='Cisco NX-OS')=>C.evaluate({module,platform,fields}).issues;
const contains=(module,fields,code,platform)=>issues(module,fields,platform).some(x=>x.code===code);
assert.equal(C.ipv4('999.1.1.1'),null);assert.equal(C.prefix('255.0.255.0'),null);assert.equal(C.prefix('255.255.255.254'),31);assert.equal(C.asn('1.10'),65546);
const ospf={d1host:'R1',d2host:'R2',d1rid:'1.1.1.1',d2rid:'2.2.2.2',d1ip:'192.0.2.0/31',d2ip:'192.0.2.1/31',d1if:'Gi0/1',d2if:'Gi0/1',ospfCost:'10',ospfArea:'0',ospfNet:'point-to-point'};
assert.equal(issues('OSPF',ospf).length,0,'Same interface name on different devices and /31 links are valid');
assert.ok(contains('OSPF',{...ospf,d2rid:'1.1.1.1'},'duplicate-router-id'));assert.ok(contains('OSPF',{...ospf,d2ip:'192.0.2.3/31'},'link-subnet'));assert.ok(contains('OSPF',{...ospf,ospfNet:'broadcast'},'ospf-broadcast'));
assert.ok(contains('BGP',{bgpCustomerAs:'0'},'asn'));assert.ok(contains('BGP',{bgpCustomerAs:'1.10',bgpIsp1As:'65546'},'ebgp-as'));
assert.ok(contains('QOS',{qosWred:true,qosWredMin:'120',qosWredMax:'40'},'wred-threshold'));assert.ok(contains('QOS',{qosWred:false,qosWredMin:'120',qosWredMax:'40'},'wred-threshold')===false,'Disabled features are excluded');
assert.ok(contains('EVPN',{evFabricModel:'single-dc',evVrfCount:'1',evVni10:'10010',evVni20:'10020',evL3Vni:'10010'},'vni-collision'));
assert.ok(contains('EVPN',{evVni10:'16777215'},'integer','Cisco NX-OS'));assert.ok(!contains('EVPN',{evVni10:'16777215'},'integer','Arista EOS'),'EOS and NX-OS have different VNI upper bounds');
assert.ok(contains('STP',{stpRootPri:'1234'},'stp-priority'));
assert.deepEqual(C.ports('Ethernet1/1 - 3'),['ethernet1/1','ethernet1/2','ethernet1/3']);assert.equal(C.port('Gi1/0/1'),C.port('GigabitEthernet1/0/1'));
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync('web.html','utf8'),{url:'https://test.invalid/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
 for(const file of ['huawei-istack.js','engineering-locale.js','vpc-report.js','design-checks.js'])w.eval(fs.readFileSync(file,'utf8'));w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=async()=>({ok:true,json:async()=>({platforms:{}})});
}}),w=dom.window,d=w.document,pause=()=>new Promise(r=>setTimeout(r,80));
function change(id,value){const el=d.getElementById(id);assert.ok(el,id);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));}
(async()=>{try{
 await pause();let count=0;
 for(const module of ['BASIC','BGP','OSPF','STP','VPC','EVPN','QOS','SDWAN']){
  d.querySelector('.tech[data-tech="'+module+'"]').click();await pause();const platforms=[...d.getElementById('platform').options].map(o=>o.value);
  for(const platform of platforms){change('platform',platform);await pause();assert.ok(w.NetworkDesignValidation,module+'/'+platform);assert.equal(w.NetworkDesignValidation.module,module);assert.equal(w.NetworkDesignValidation.errors,0,module+'/'+platform+': '+JSON.stringify(w.NetworkDesignValidation.issues));count++;}
 }
 assert.equal(count,32);
 d.querySelector('.tech[data-tech=BASIC]').click();await pause();change('d1oobip','192.0.2.1');change('gw','192.0.2.2');
 for(const platform of ['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','FortiGate']){change('platform',platform);await pause();change('d1oobip','192.0.2.1');change('gw','192.0.2.2');for(const mask of ['255.255.255.252','/30','30']){change('d1mask',mask);assert.equal(w.NetworkDesignValidation.errors,0);const config=d.getElementById('output').textContent;assert.ok(config.includes(platform==='Cisco NX-OS'||platform==='Arista EOS'?'192.0.2.1/30':'192.0.2.1 255.255.255.252'),platform+'/'+mask);}}

 d.querySelector('.tech[data-tech=OSPF]').click();await pause();change('d2ip','10.1.0.2/30');assert.ok(w.NetworkDesignValidation.errors);assert.equal(d.getElementById('d2ip').getAttribute('aria-invalid'),'true');
 d.querySelector('#designChecks button').click();assert.ok(['d1ip','d2ip'].includes(d.activeElement.id));change('d2ip','10.0.0.2/30');assert.equal(w.NetworkDesignValidation.errors,0);assert.equal(d.getElementById('d2ip').hasAttribute('aria-invalid'),false);assert.ok(!d.getElementById('output').textContent.includes('CONFIGURATOR ERROR'));
 d.querySelector('.tech[data-tech=BGP]').click();await pause();change('bgpConnectivity','full');await pause();change('bgpLinkC1I2CeIf','Eth1/1');assert.ok(w.NetworkDesignValidation.issues.some(x=>x.code==='port-conflict'));change('bgpLinkC1I2CeIf','Ethernet1/2');assert.equal(w.NetworkDesignValidation.errors,0);
 d.querySelector('.tech[data-tech=VPC]').click();await pause();change('platform','Cisco NX-OS');await pause();change('vpcKaIf1','Ethernet1/49');assert.ok(w.NetworkDesignValidation.issues.some(x=>x.code==='port-conflict'));change('vpcKaIf1','Ethernet1/48');assert.equal(w.NetworkDesignValidation.errors,0);
 change('platform','Huawei iStack');await pause();change('isMad1','XGigabitEthernet0/0/27');assert.ok(w.NetworkDesignValidation.issues.some(x=>x.code==='port-conflict'));change('isMad1','GigabitEthernet0/0/24');assert.equal(w.NetworkDesignValidation.errors,0);
 assert.deepEqual(errors,[]);console.log('Design consistency: 32 module/platform defaults, IPv4/subnets, /31, ASN, router IDs, VLAN/VNI, STP, QoS, vendor bounds, physical-port ownership, dynamic UI feedback and correction passed');
 }finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
