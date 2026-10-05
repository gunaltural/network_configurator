const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const {execFileSync}=require('node:child_process');
const guide=require('./vpc-report.js');
assert.match(fs.readFileSync('Dockerfile','utf8'),/^COPY .*vpc-report\.js .*$/m,'the Render image must include the guide');
const device=(tier,i)=>({id:`${tier}-${i}`,tier,index:i,hostname:`${tier==='upper'?'SPINE':'LEAF'}-${i}`,model:'',serial:'',modelSource:'',serialSource:'',vendor:'Cisco NX-OS'});
const design={schema:'network-configurator-report-v1',language:'tr',name:'vPC Network Design',vendor:'Cisco NX-OS',technology:'vPC',architecture:'spine-leaf',upperCount:2,lowerCount:8,techPlacement:'upper',scope:'',devices:[device('upper',1),device('upper',2),...Array.from({length:8},(_,i)=>device('lower',i+1))],links:[],specialLinks:[],parameters:[],configurations:[],source:{module:'VPC',projectId:'guide-test'}};
for(let i=1;i<=8;i++)for(let j=1;j<=2;j++)design.links.push({a:`upper-${j}`,b:`lower-${i}`,enabled:true,upperPort:`Ethernet1/${i}`,lowerPort:`Ethernet1/${j}`,speed:'100G',detail:`vPC ${i}`});
design.specialLinks=[1,2].map(i=>({kind:'Peer-link',a:'upper-1',b:'upper-2',aPort:`Ethernet1/${40+i}`,bPort:`Ethernet1/${40+i}`,detail:'Po100',logical:false}));
design.specialLinks.push({kind:'vPC keepalive',a:'upper-1',b:'upper-2',aPort:'Ethernet1/48',bPort:'Ethernet1/48',detail:'Independent keepalive VRF',logical:true});
design.configurations=[1,2].map(i=>({deviceId:`upper-${i}`,source:'Technology Workspaces',text:`hostname SPINE-${i}\nvpc domain 10\n  peer-switch\n  peer-gateway\n  ip arp synchronize\n  auto-recovery reload-delay 240\n  delay restore 150\n`}));
const initial=JSON.stringify(design),tr=guide.build(design);
assert.match(tr.topology.join(' '),/2 adet Spine ve 8 adet Leaf/);assert.match(tr.topology.join(' '),/Her Leaf switch, iki Spine/);assert.match(tr.topology.join(' '),/100G/);assert.match(tr.topology.join(' '),/2 fiziksel peer-link üyesi ve 1 keepalive/);
assert.equal(JSON.stringify(design),initial,'guide must not change design inputs');
assert.match(tr.sections.find(s=>s.title==='Bu projede seçilen özellikler').paragraphs.join(' '),/240/);
const partial=structuredClone(design);partial.links[1].enabled=false;partial.links[2].speed='';partial.devices.push({id:'inv-extra',tier:'upper',inventoryOnly:true});partial.configurations[1].text='vpc domain 10\n';
assert.match(guide.build(partial).topology.join(' '),/7 Leaf switch, iki farklı Spine/);assert.ok(!/belirtilmemiş|100G/.test(guide.build(partial).topology.join(' ')));
const unknown=structuredClone(design);unknown.links.forEach(l=>l.speed='');assert.ok(!/unspecified|specified rate|belirtilmemiş|upper-tier/.test(guide.build({...unknown,language:'en'}).topology.join(' ')));
const core=guide.build({...design,architecture:'core-access',language:'en'});assert.match(core.topology[0],/both Core switches/);assert.match(guide.build(partial).sections.at(-2).paragraphs[0],/seçim farklı/);
for(const [vendor,technology] of [['Arista EOS','MLAG'],['Huawei_CE_SW','M-LAG'],['Cisco NX-OS','EVPN/VXLAN'],['Cisco IOS-XE','STP']])assert.equal(guide.build({...design,vendor,technology}),null);
const combined={...design,architecture:'module',technology:'Combined',moduleReports:[{vendor:'Arista EOS',technology:'MLAG'},{vendor:'Cisco NX-OS',technology:'vPC',design}]};
for(const vendor of ['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','FortiGate'])for(const technology of ['System and Management','BGP','OSPF','STP','MLAG','M-LAG','EVPN/VXLAN','QoS','SD-WAN']){
 const s={...design,vendor,technology,architecture:'module',roles:{upper:'CE router',lower:'ISP router'},language:'en'};
 const text=guide.topologyNarratives(s).map(x=>x.paragraphs.join(' ')).join(' ');
 assert.match(text,/CE routers/);assert.match(text,/ISP routers/);assert.ok(!/upper-tier|unspecified|specified rate/.test(text));assert.match(text,/100G/);
 const blank=guide.topologyNarratives({...s,links:s.links.map(l=>({...l,speed:''}))}).map(x=>x.paragraphs.join(' ')).join(' ');assert.ok(!/100G|link rates/.test(blank));
}
const mixed=guide.topologyNarratives({...design,moduleReports:[{title:'BGP',vendor:'Arista EOS',technology:'BGP',design:{...design,roles:{upper:'CE router',lower:'ISP router'}}},{title:'vPC',vendor:'Cisco NX-OS',technology:'vPC',design}]});assert.equal(mixed.length,1);assert.match(mixed[0].paragraphs.join(" "),/Arista EOS/);assert.match(mixed[0].paragraphs[0],/Spine/);
assert.match(guide.build(combined).topology[0],/2 adet Spine ve 8 adet Leaf/);
assert.equal(guide.build({...combined,moduleReports:[{vendor:'Cisco NX-OS',technology:'vPC'}]}).topology.length,0);
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
let payload;
const dom=new JSDOM(fs.readFileSync('reporting.html','utf8'),{url:'https://test.invalid/reporting',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.eval(fs.readFileSync('engineering-locale.js','utf8'));w.eval(fs.readFileSync('vpc-report.js','utf8'));w.sessionStorage.setItem('networkConfigurator.report.import',JSON.stringify(design));w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};w.fetch=async(url,options)=>{assert.equal(url,'/api/reporting/word');payload=JSON.parse(options.body);return {ok:true,blob:async()=>new w.Blob(['test'])};};}});
(async()=>{try{
 for(const language of ['tr','en']){
  const d=dom.window.document,select=d.getElementById('reportLanguage');select.value=language;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(d.querySelectorAll('.vpc-technology-guide h4').length,12);assert.equal(d.querySelectorAll('.vpc-technology-guide a').length,7);
  assert.match(d.querySelector('.vpc-topology-narrative').textContent,language==='tr'?/2 adet Spine ve 8 adet Leaf/:/2 Spine and 8 Leaf/);
  assert.ok(!d.querySelector('.vpc-technology-guide').textContent.includes(language==='tr'?'Executive summary':'Yönetici özeti'));
  d.getElementById('downloadWord').click();await new Promise(r=>setTimeout(r,10));assert.ok(payload.technologyGuide);
  fs.writeFileSync(`/tmp/vpc-guide-${language}-payload.json`,JSON.stringify(payload));
  const result=execFileSync('python',['-c','import json,sys,io;from docx import Document;from app import app;from fastapi.testclient import TestClient;p=json.load(sys.stdin);r=TestClient(app).post("/api/reporting/word",json=p);assert r.status_code==200,r.text;d=Document(io.BytesIO(r.content));text="\\n".join(x.text for x in d.paragraphs);assert all(x in text for x in p["technologyGuide"]["topology"]);assert all(x["title"] in text for x in p["technologyGuide"]["sections"]);assert sum("cisco.com" in rel.target_ref for rel in d.part.rels.values())==7;open("/tmp/vpc-guide-"+p["language"]+".docx","wb").write(r.content);print("Word narrative, chapters and references passed")'],{input:JSON.stringify(payload),encoding:'utf8'});
  assert.match(result,/passed/);
 }
 assert.deepEqual(errors,[]);console.log('vPC topology, partial links, inventory isolation, feature differences, vendor gating, combined reports, TR/EN DOM and Word exports passed.');
}finally{dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
