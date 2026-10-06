// Source-based DOM regression tests. No SSH sessions or browser-user data are used.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {JSDOM,VirtualConsole}=require('jsdom');
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...x)=>errors.push(x.join(' ')));
const catalog=JSON.parse(execFileSync('python',['-c','import app,json;print(json.dumps(app.live_commands()))'],{encoding:'utf8'}));
let html=fs.readFileSync('web.html','utf8');
html=html.replace(/\}\)\(\);\s*<\/script>\s*<\/body>/,'window.__audit={snapshot,applyProject,reportingDesign,combineReports};})();</script></body>');
const dom=new JSDOM(html,{url:'https://test.invalid/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.eval(fs.readFileSync("huawei-istack.js","utf8"));w.eval(fs.readFileSync("engineering-locale.js","utf8"));w.scrollTo=()=>{};w.__showRequests=[];w.fetch=async(url,options)=>{if(url==="/api/device/show"){w.__showRequests.push(JSON.parse(options.body));return {ok:true,json:async()=>({output:"Synthetic verification output",results:[]})};}return {ok:true,json:async()=>catalog};};w.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:720,height:300});w.SVGElement.prototype.getComputedTextLength=()=>80;}});
const w=dom.window,d=w.document;
const pause=()=>new Promise(r=>setTimeout(r,80));
const click=selector=>{assert.ok(d.querySelector(selector),selector);d.querySelector(selector).click();};
const change=(id,value)=>{const el=d.getElementById(id);assert.ok(el,id);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
const reports=[];
(async()=>{
 try{
  await pause();d.getElementById('v3ProjectName').value='Synthetic save test';
  let saved=null,downloaded=null,downloads=0;
  w.URL.createObjectURL=()=>{downloads++;return 'blob:synthetic';};
  w.NetworkProjects={saveCurrent:async data=>{saved=data;return {version:4};},downloadCurrent:data=>{downloaded=data;}};
  d.getElementById('v3SaveBtn').click();await pause();
  assert.equal(saved.project.name,'Synthetic save test');assert.equal(downloads,0);assert.equal(downloaded,null);
  d.getElementById('v3DownloadBtn').click();assert.equal(downloaded.project.name,'Synthetic save test');
  assert.equal(d.getElementById('v3SaveBtn').disabled,false);assert.deepEqual(errors,[]);
  console.log('Main Save calls server storage without downloading; Download uses export separately');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
