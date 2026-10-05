const fs=require('fs'),assert=require('assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const shell=fs.readFileSync('corporate-shell.js','utf8');
const options=url=>({url,runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};for(const f of ['engineering-locale.js','vpc-report.js','verification-plan.js'])w.eval(fs.readFileSync(f,'utf8'));w.fetch=async()=>({ok:true,json:async()=>({platforms:{}})});}});
(async()=>{
 const main=new JSDOM(fs.readFileSync('web.html','utf8'),options('https://test.invalid/'));const w=main.window,d=w.document;w.eval(shell);
 try{
 assert.equal(d.querySelectorAll('.nc-sidebar').length,1);assert.equal(d.querySelectorAll('[data-nc-module]').length,8);assert.equal(d.querySelector('[data-nc-home]').getAttribute('aria-current'),'page');
 for(const key of ['BASIC','BGP','OSPF','STP','VPC','EVPN','SDWAN','QOS']){d.querySelector('[data-nc-module="'+key+'"]').click();await new Promise(r=>setTimeout(r,2));assert.equal(d.getElementById('v3Dashboard').classList.contains('show'),false);assert.equal(d.querySelector('.tech.active').dataset.tech,key);assert.equal(d.querySelector('[data-nc-module="'+key+'"]').getAttribute('aria-current'),'page');assert.ok(!d.getElementById('output').textContent.includes('CONFIGURATOR ERROR'));}
 d.querySelector('[data-nc-home]').click();assert.equal(d.getElementById('v3Dashboard').classList.contains('show'),true);
 d.querySelector('.nc-menu-toggle').click();assert.equal(d.body.classList.contains('nc-menu-collapsed'),true);d.querySelector('.nc-menu-toggle').click();assert.equal(d.body.classList.contains('nc-menu-collapsed'),false);
 Object.defineProperty(w,'innerWidth',{value:600,writable:true});d.querySelector('.nc-menu-toggle').click();assert.equal(d.body.classList.contains('nc-menu-open'),true);d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(d.body.classList.contains('nc-menu-open'),false);
 }finally{w.close();}
 const report=new JSDOM(fs.readFileSync('reporting.html','utf8'),options('https://test.invalid/reporting'));report.window.eval(shell);
 try{const d=report.window.document;for(const view of ['inventory','design','lifecycle','upgrade']){d.querySelector('[data-nc-view="'+view+'"]').click();assert.equal(d.querySelector('[data-view="'+view+'"]').getAttribute('aria-selected'),'true');assert.equal(d.querySelector('[data-nc-view="'+view+'"]').getAttribute('aria-current'),'page');}assert.equal(d.querySelector('[data-nc-module="BGP"]').getAttribute('href'),'/?workspace=BGP');}finally{report.window.close();}
 const deep=new JSDOM(fs.readFileSync('web.html','utf8'),options('https://test.invalid/?workspace=BGP'));deep.window.eval(shell);assert.equal(deep.window.document.querySelector('.tech.active').dataset.tech,'BGP');deep.window.close();
 assert.deepEqual(errors,[]);console.log('Corporate navigation: eight modules, reporting views, mobile toggle, dashboard and deep links passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
