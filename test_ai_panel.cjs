const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
const dom=new JSDOM('<div id="ncSidebar"></div><textarea data-project-detail="executiveSummary" maxlength="1200">Existing authored text</textarea>',{runScripts:'outside-only',url:'https://test.invalid'}),w=dom.window;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
let state={source:{module:'BGP'},vendor:'Cisco IOS-XE',devices:[{id:'ce1',hostname:'CE1'}],projectDetails:{executiveSummary:'Existing authored text'}};
w.NetworkReportProject={snapshot:()=>JSON.parse(JSON.stringify(state))};
w.document.querySelector('textarea').addEventListener('input',e=>{state.projectDetails.executiveSummary=e.target.value});
let calls=0;w.fetch=async url=>{calls++;return {ok:true,json:async()=>url.endsWith('status')?{available:true}:{text:'Reviewed path explanation'}}};
for(const file of ['ai-evidence.js','engineering-ai.js'])w.eval(fs.readFileSync(file,'utf8'));
const d=w.document,$=id=>d.getElementById(id),open=()=>d.querySelector('#ncSidebar button').onclick();
await open();assert.equal(calls,1);assert.equal(state.projectDetails.executiveSummary,'Existing authored text');
await $('aiRun').onclick();assert.equal(calls,2);assert.equal(state.projectDetails.executiveSummary,'Existing authored text');
$('aiDraft').value='Edited by engineer';$('aiInsert').onclick();assert.equal(state.projectDetails.executiveSummary,'Existing authored text\n\nEdited by engineer');assert.ok($('aiInsert').disabled);
await open();await $('aiRun').onclick();state.devices[0].hostname='CE2';$('aiInsert').onclick();assert.ok($('aiStatus').textContent.includes('report changed'));assert.ok(!state.projectDetails.executiveSummary.includes('Reviewed path'));
await open();await $('aiRun').onclick();$('aiDraft').value='X'.repeat(1300);$('aiInsert').onclick();assert.ok($('aiStatus').textContent.includes('section limit'));
w.fetch=async()=>({ok:true,json:async()=>({available:false})});await open();assert.ok($('aiRun').disabled);
dom.window.close();console.log('AI panel: explicit send, reviewed append, existing text, stale context, limits and disabled state passed');
})().catch(e=>{console.error(e);process.exitCode=1});
