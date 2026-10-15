const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process'),{JSDOM,VirtualConsole}=require('jsdom');
const vendors=['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','Huawei iStack'],titles=['Topology & Platform','Peer & Control Plane','Leaf Connectivity','VLAN & Trunk Policy','STP & Convergence','Vendor Advanced Parameters','Configuration Output'];
const counts=['vpcLeafCount','swvLeafCount','arLeafCount','hwLeafCount','isLeafCount'],attributes=['vpcLeaf','swvLeaf','arLeaf','hwLeaf','istackLeaf'];
const wait=()=>new Promise(r=>setTimeout(r,45));
async function inspect(html,standard){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 html=html.replace(/\}\)\(\);\s*<\/script>\s*<\/body>/,'window.__audit={snapshot,applyProject,reportingDesign};})();</script></body>');
 const w=new JSDOM(html,{url:'https://test.invalid/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){for(const file of ['huawei-istack.js','engineering-locale.js','vpc-report.js','design-checks.js'])w.eval(fs.readFileSync(file,'utf8'));w.scrollTo=()=>{};w.fetch=async()=>({ok:true,json:async()=>({platforms:{}})});w.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:720,height:300});w.SVGElement.prototype.getComputedTextLength=()=>80;}}).window,d=w.document,results=[];
 const change=(id,value)=>{const input=d.getElementById(id);assert.ok(input,id);input.value=value;input.dispatchEvent(new w.Event('change',{bubbles:true}));};
 try{await wait();d.querySelector('.tech[data-tech="VPC"]').click();await wait();
 for(const [i,vendor]of vendors.entries()){
  change('platform',vendor);await wait();
  const fields=[...d.querySelectorAll('#params input[id],#params select[id],#topologyControls input[id],#topologyControls select[id]')].map(x=>x.id).sort();
  if(standard){const cards=[...d.querySelectorAll('#params > .vpc-v42-card')];assert.equal(cards.length,7,vendor);assert.deepEqual(cards.map(c=>c.querySelector('.vpc-v42-title').textContent),titles.map((t,j)=>`${j+1} · ${t}`));assert.ok(cards[2].querySelector('.vpc-leaf-table'));assert.ok(cards[2].querySelector('details summary').textContent.includes('Physical Interface'));assert.equal(cards[2].querySelector('details').open,false);assert.ok(cards[2].contains(d.getElementById('designUplinkSpeed')));}
  for(const n of [2,8]){change(counts[i],String(n));await wait();const r=w.__audit.reportingDesign();results.push({vendor,n,fields,configurations:JSON.parse(JSON.stringify(r.configurations))});
   if(standard){const cells=[...d.querySelectorAll('[data-vpc-section="3"] .vpc-leaf-cell')],visible=cells.filter(el=>!el.hidden&&el.style.display!=='none');assert.equal(visible.length,n*(vendor==='Arista EOS'?3:2),vendor+' visible leaf cells');assert.ok(cells.every(el=>Number(el.dataset[attributes[i]])<=n||el.hidden||el.style.display==='none'));}
  }
 }
 assert.deepEqual(errors,[]);return results;
 }finally{w.close();}
}
const hash=configurations=>require('crypto').createHash('sha256').update(JSON.stringify(configurations)).digest('hex');
(async()=>{
 const fixture='test_vpc_ui_baseline.json';
 if(process.env.UPDATE_VPC_UI_BASELINE==='1'){
  const baseline=await inspect(execFileSync('git',['show','HEAD:web.html'],{encoding:'utf8',maxBuffer:4e6}),false);
  fs.writeFileSync(fixture,JSON.stringify({version:'5.32.0',cases:baseline.map(({configurations,...row})=>({...row,configurationHash:hash(configurations)}))},null,2)+'\n');console.log('Saved native configuration baseline from 5.32.0');return;
 }
 const baseline=JSON.parse(fs.readFileSync(fixture,'utf8')).cases,current=await inspect(fs.readFileSync('web.html','utf8'),true);
 for(let i=0;i<baseline.length;i++){assert.equal(hash(current[i].configurations),baseline[i].configurationHash,`${current[i].vendor}/${current[i].n}: native configuration is unchanged`);assert.deepEqual(current[i].fields,baseline[i].fields.filter(id=>id!=='hwMlagId'),`${current[i].vendor}: functional controls retained`);}
 console.log('Unified seven-section layout, compact leaf tables, collapsed native port mapping, 2/8-leaf visibility and unchanged device configurations verified across five platforms');
})().catch(error=>{console.error(error);process.exitCode=1;});
