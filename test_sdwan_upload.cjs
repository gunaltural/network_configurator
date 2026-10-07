// Source-based DOM regression tests. No SSH sessions or browser-user data are used.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {JSDOM,VirtualConsole}=require('jsdom');
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...x)=>errors.push(x.join(' ')));
const catalog=JSON.parse(execFileSync('python',['-c','import app,json;print(json.dumps(app.live_commands()))'],{encoding:'utf8'}));
let html=fs.readFileSync('web.html','utf8');
html=html.replace(/\}\)\(\);\s*<\/script>\s*<\/body>/,'window.__audit={snapshot,applyProject,reportingDesign,combineReports};})();</script></body>');
const dom=new JSDOM(html,{url:'https://test.invalid/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.eval(fs.readFileSync("huawei-istack.js","utf8"));w.eval(fs.readFileSync("design-checks.js","utf8"));w.eval(fs.readFileSync("engineering-report.js","utf8"));w.eval(fs.readFileSync("engineering-locale.js","utf8"));w.scrollTo=()=>{};w.__showRequests=[];w.fetch=async(url,options)=>{if(url==="/api/device/show"){w.__showRequests.push(JSON.parse(options.body));return {ok:true,json:async()=>({output:"Synthetic verification output",results:[]})};}if(url==="/api/sdwan/excel")return {ok:true,json:async()=>({sheet:"IP Adres Planlaması",rows:JSON.parse(execFileSync("python",["-c",'from test_sdwan_excel import workbook;from sdwan_excel import parse_sdwan_excel;import json;print(json.dumps(parse_sdwan_excel(workbook())["rows"]))'],{encoding:"utf8"}))})};return {ok:true,json:async()=>catalog};};w.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:720,height:300});w.SVGElement.prototype.getComputedTextLength=()=>80;}});
const w=dom.window,d=w.document;
const pause=()=>new Promise(r=>setTimeout(r,80));
const click=selector=>{assert.ok(d.querySelector(selector),selector);d.querySelector(selector).click();};
const change=(id,value)=>{const el=d.getElementById(id);assert.ok(el,id);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};

(async()=>{try{
 await pause();click('.tech[data-tech="SDWAN"]');await pause();
 assert.equal(w.XLSX,undefined,'Excel must work without a CDN reader');
 const file=d.getElementById('sdExcelFile');
 Object.defineProperty(file,'files',{value:[{name:'planning.xlsx',size:1000,arrayBuffer:async()=>new ArrayBuffer(20)}]});
 file.dispatchEvent(new w.Event('change',{bubbles:true}));await pause();
 assert.match(d.getElementById('sdExcelStatus').textContent,/2 router/);
 change('sdSiteSelect','Ankara');change('sdRouterSelect','0');await pause();
 assert.equal(d.getElementById('sdHostname').value,'ANK-CE-1');
 assert.equal(d.getElementById('sdSiteId').value,'100');
 click('.tab[data-tab="config"]');await pause();assert.match(d.getElementById('output').textContent,/hostname ANK-CE-1/);
 const report=w.__audit.reportingDesign();assert.ok(report.configurations.some(c=>c.text.includes('ANK-CE-1')));
 change('sdRouterSelect','1');await pause();assert.equal(d.getElementById('sdHostname').value,'ANK-CE-2');
 assert.match(d.getElementById('output').textContent,/hostname ANK-CE-2/);
 const saved=w.__audit.snapshot();click('.tech[data-tech="BGP"]');await pause();w.__audit.applyProject(saved);await pause();
 assert.equal(d.getElementById('sdHostname').value,'ANK-CE-2');assert.match(d.getElementById('output').textContent,/hostname ANK-CE-2/);
 assert.deepEqual(errors,[]);console.log('SD-WAN Excel → site/router → configuration → reporting → project restore passed without browser XLSX/CDN.');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
