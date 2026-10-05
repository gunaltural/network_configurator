const fs=require('fs'),assert=require('assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('web.html','utf8').replace('</head>','<style>'+fs.readFileSync('corporate-theme.css','utf8')+'</style></head>');
const dom=new JSDOM(html,{url:'https://test.invalid',runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(w){w.scrollTo=()=>{};w.eval(fs.readFileSync('engineering-locale.js','utf8'));w.fetch=async()=>({ok:true,json:async()=>({platforms:{}})});}});
const w=dom.window,d=w.document;
const luminance=hex=>{const a=hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2];};
let pairs=0,labels=0;
try{
 for(const key of ['BASIC','BGP','OSPF','STP','VPC','EVPN','QOS','SDWAN']){
  d.querySelector('.tech[data-tech="'+key+'"]').click();
  for(const opt of [...d.getElementById('platform').options]){
   const field=d.getElementById('platform');field.value=opt.value;field.dispatchEvent(new w.Event('change',{bubbles:true}));
   const area=d.getElementById('topologyArea');
   assert.ok(area.textContent.trim(),key+' topology');
   for(const t of area.querySelectorAll('.vpc-device-name')){
    const color=w.getComputedStyle(t).fill;
    assert.ok(['#173f5d','#eaf5fb','rgb(23, 63, 93)','rgb(234, 245, 251)'].includes(color),key+'/'+opt.value+': hostname paint '+color);
    if(color==='#173f5d'){const ratio=(luminance('#dcecf5')+.05)/(luminance(color)+.05);assert.ok(ratio>=4.5);}
    assert.ok(t.textContent.trim(),key+': missing device label');labels++;
   }
   if(['OSPF','STP','QOS'].includes(key)){
    const host=d.getElementById('d1host');host.value='ENGINEERING-RTR-01';host.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.ok(area.textContent.includes('ENGINEERING-RTR-01'),key+': hostname edit must update topology');
   }
   for(const shape of area.querySelectorAll('.vpc-device,.vpc-leaf'))assert.ok(['#dcecf5','rgb(220, 236, 245)'].includes(w.getComputedStyle(shape).fill),key+': solid device paint');
   pairs++;
  }
 }
 console.log(`${pairs} module/platform topologies: ${labels} readable device labels, solid node paints and dynamic hostname edits passed`);
}finally{w.close();}
