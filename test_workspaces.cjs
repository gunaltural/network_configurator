// Source-based DOM regression tests. No SSH sessions or browser-user data are used.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {JSDOM,VirtualConsole}=require('jsdom');
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...x)=>errors.push(x.join(' ')));
const catalog=JSON.parse(execFileSync('python',['-c','import app,json;print(json.dumps(app.live_commands()))'],{encoding:'utf8'}));
let html=fs.readFileSync('web.html','utf8');
html=html.replace(/\}\)\(\);\s*<\/script>\s*<\/body>/,'window.__audit={snapshot,applyProject,reportingDesign,combineReports};})();</script></body>');
const dom=new JSDOM(html,{url:'https://test.invalid/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.eval(fs.readFileSync("huawei-istack.js","utf8"));w.eval(fs.readFileSync("engineering-locale.js","utf8"));w.scrollTo=()=>{};w.fetch=async()=>({ok:true,json:async()=>catalog});w.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:720,height:300});w.SVGElement.prototype.getComputedTextLength=()=>80;}});
const w=dom.window,d=w.document;
const pause=()=>new Promise(r=>setTimeout(r,80));
const click=selector=>{assert.ok(d.querySelector(selector),selector);d.querySelector(selector).click();};
const change=(id,value)=>{const el=d.getElementById(id);assert.ok(el,id);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
const reports=[];
(async()=>{
 try{
 await pause();let pairs=0;
 for(const key of ['BASIC','BGP','OSPF','STP','VPC','EVPN','QOS','SDWAN']){
  click(`.tech[data-tech="${key}"]`);await pause();const options=[...d.getElementById('platform').options];
  if(key==='EVPN')assert.deepEqual(options.map(x=>x.value),['Cisco NX-OS','Arista EOS','Huawei_CE_SW']);
  if(key==='SDWAN')assert.equal(options.length,1);
  for(const option of options){
   change('platform',option.value);await pause();click('.tab[data-tab="config"]');await pause();
   assert.equal(d.getElementById('designNotesLanguageControl').style.display,'none');const config=d.getElementById('output').textContent;assert.ok(config.length>100);assert.ok(!config.includes('CONFIGURATOR ERROR'));
   click('.tab[data-tab="notes"]');await pause();assert.ok(!d.getElementById('output').textContent.includes('CONFIGURATOR ERROR'));
   const report=w.__audit.reportingDesign();assert.ok(report,`${key}/${option.value}: report`);
   if(key==='SDWAN'&&!d.getElementById('sdHostname').value){assert.equal(report.configurations.length,0);assert.ok(report.parameters.some(p=>p.label==='Configuration pending'));}
   else assert.equal(report.configurations.length,report.devices.filter(x=>!x.external).length,`${key}/${option.value}: per-device configurations`);
   reports.push({...report,moduleKey:key,moduleTitle:report.technology});
   for(const parameter of report.parameters||[])if(parameter.impact)assert.notEqual(w.NetworkLocale.localizeParameter(parameter,'tr').impact,parameter.impact,`${key}/${option.value}: untranslated ${parameter.label}`);
   change('designNotesLanguage','tr');await pause();assert.ok(d.getElementById('output').textContent.includes('Tasarım kararları ve mühendislik notları'));assert.ok(!d.getElementById('output').textContent.includes('Selected design:'));
   change('designNotesLanguage','en');await pause();assert.ok(d.getElementById('output').textContent.includes('Design decisions and engineering notes'));
   if(key==='EVPN'){
    for(const model of ['single-dc','dual-dc-rr']){
     change('evFabricModel',model);await pause();click('.tab[data-tab="config"]');await pause();
     assert.equal(d.getElementById('v3DeviceCount').textContent,model==='single-dc'?'4':'6');const fabric=w.__audit.reportingDesign();assert.equal(fabric.devices.length,model==='single-dc'?4:6);assert.equal(fabric.configurations.length,fabric.devices.length);
     assert.equal(fabric.specialLinks.length,model==='single-dc'?6:8);
     for(const config of fabric.configurations.slice(0,4)){
      assert.ok(!config.text.includes('65002'),'shared overlay must not use hidden DC-2 ASN');
      const peers=option.value==='Huawei_CE_SW'?(config.text.match(/^ peer .* as-number /gm)||[]):option.value==='Cisco NX-OS'?(config.text.match(/^  neighbor /gm)||[]):(config.text.match(/^   neighbor .* remote-as /gm)||[]);
      assert.equal(peers.length,model==='single-dc'?3:2,`${option.value}/${model}`);
     }
     if(model==='dual-dc-rr')for(const rr of fabric.configurations.slice(4)){assert.match(rr.text,/reflect-client|route-reflector-client/);assert.ok(!/interface [Nn]ve|interface Vxlan/.test(rr.text));}
    }
    change('evFabricModel','dual-dc');await pause();
   }

   click('.tab[data-tab="verify"]');await pause();assert.ok(d.querySelectorAll('#verifyGroups .verify-command').length>5);
   click('#verifyClearAll');assert.equal(d.getElementById('verifyRun').disabled,true);assert.equal(d.querySelectorAll('#verifyGroups .verify-select:checked').length,0);
   const custom=d.querySelector('[aria-label="User-defined verification command"]');custom.value=option.value==='Huawei_CE_SW'?'display version':'show version';custom.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.getElementById('verifyRun').disabled,false);
   click('.tab[data-tab="trouble"]');await pause();assert.ok(d.querySelectorAll('#troubleCommandGroups .verify-command').length>1);
   click('#troubleClearAll');assert.equal(d.querySelectorAll('#troubleCommandGroups .verify-select:checked').length,0);
   click('.tab[data-tab="verify"]');await pause();click('.tab[data-tab="trouble"]');await pause();assert.equal(d.querySelectorAll('#troubleCommandGroups .verify-select:checked').length,0,'cleared diagnostics must remain cleared after switching tabs');
   pairs++;
  }
 }
 assert.equal(pairs,32);
 const combined=w.__audit.combineReports(reports.filter(r=>r.vendor==='Cisco NX-OS'&&['BASIC','BGP','VPC'].includes(r.moduleKey)));
 assert.ok(combined.technology.length>32);assert.equal(combined.moduleReports.length,3);
 fs.writeFileSync(process.env.AUDIT_PAYLOAD_PATH||'/tmp/network-configurator-audit-payload.json',JSON.stringify(combined));
 click('.tech[data-tech="BGP"]');await pause();change('platform','Cisco NX-OS');change('bgpCeCount','4');await pause();
 change('bgpCe4Name','CUSTOM-CE-4');
 click('.tech[data-tech="VPC"]');await pause();change('platform','Arista EOS');await pause();change('arH1','CUSTOM-CORE-1');
 d.getElementById('verifyPassword').value='SYNTHETIC_TEST_SECRET';d.getElementById('troubleSecret').value='SYNTHETIC_TEST_SECRET';
 const saved=w.__audit.snapshot();assert.ok(!JSON.stringify(saved).includes('SYNTHETIC_TEST_SECRET'));
 click('.tech[data-tech="BASIC"]');await pause();
 w.__audit.applyProject(JSON.parse(JSON.stringify(saved)));await pause();assert.equal(d.getElementById('arH1').value,'CUSTOM-CORE-1');
 click('.tech[data-tech="BGP"]');await pause();assert.equal(d.getElementById('bgpCeCount').value,'4');assert.equal(d.getElementById('bgpCe4Name').value,'CUSTOM-CE-4');
 assert.equal(d.getElementById('v3DeviceCount').textContent,'6');
 // An old project must not restore embedded SSH credentials.
 const legacy={...saved,fields:{...saved.fields,verifyPassword:'LEGACY_TEST_SECRET',troubleSecret:'LEGACY_TEST_SECRET'}};
 w.__audit.applyProject(legacy);await pause();assert.equal(d.getElementById('verifyPassword').value,'');assert.equal(d.getElementById('troubleSecret').value,'');
 assert.deepEqual(errors,[]);
 console.log(`${pairs} module/platform pairs: configuration, notes, reporting, verification and troubleshooting passed; multi-module Save/Open and credential exclusion passed.`);
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
