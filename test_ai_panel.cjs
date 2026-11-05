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
$('aiDraft').value='Edited by engineer';
assert.equal($('aiInsert'),null,'AI drafts must not have a Project Report insertion control');
assert.equal(state.projectDetails.executiveSummary,'Existing authored text','Independent AI analysis cannot modify project report');
assert.match(d.querySelector('dialog').textContent,/not appended to Module Report or Final Project Report/);
await open();await $('aiRun').onclick();state.devices[0].hostname='CE2';
assert.equal(state.projectDetails.executiveSummary,'Existing authored text','Changes to Design cannot indirectly append an AI draft');
w.fetch=async()=>({ok:true,json:async()=>({available:false})});await open();assert.ok($('aiRun').disabled);
let externalCalls=0;w.confirm=()=>false;w.fetch=async url=>{externalCalls++;return {ok:true,json:async()=>url.endsWith('status')?{available:true,provider:'groq'}:{text:'must-not-run'}};};await open();await $('aiRun').onclick();assert.equal(externalCalls,1,'No external request without explicit confirmation');assert.match($('aiStatus').textContent,/cancelled/);
// New Project and Quick Design share the same optional AI entry action.
const workflow=fs.readFileSync('project-workflow.js','utf8');
assert.match(workflow,/Analyze '\+m\.key\+' Design with AI \(optional\)/,'Guided New Project displays module-scoped AI action');
assert.match(workflow,/nc-ai-import-design/,'Guided AI action dispatches the shared handoff event');
assert.match(fs.readFileSync('engineering-ai.js','utf8'),/addEventListener\('nc-ai-import-design'/,'AI importer listens for dynamically created project action');
dom.window.close();console.log('AI panel: independent reports, external consent, disabled state, New Project and Quick Design AI entry contract passed');
})().catch(e=>{console.error(e);process.exitCode=1});
