'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('ai-topology.html','utf8'),{runScripts:'outside-only',url:'https://test.invalid/ai-topology'});
 const w=dom.window,d=w.document,$=id=>d.getElementById(id),submitted=[];
 w.confirm=()=>true;
 w.fetch=async(url,options)=>{
  if(url==='/api/projects/status')return {ok:true,json:async()=>({available:false,configured:false})};
  if(url==='/api/engineering-knowledge/stp'){const db=JSON.parse(fs.readFileSync('knowledge/stp_v1.json','utf8'));return {ok:true,json:async()=>({module:'STP',version:db.version,signature:'a'.repeat(64),records:db.records,sources:db.sources})};}
  if(url==='/api/ai/status')return {ok:true,json:async()=>({available:true,provider:'local'})};
  if(url==='/api/ai/analyze'){const body=JSON.parse(options.body);submitted.push(body);
   return {ok:true,json:async()=>({mode:'model-evidence-cited-draft',text:'STP comparison [config-0, L2]; verify root roles.'})};}
  throw Error('unexpected URL '+url);
 };
 const raw={schema:'ai-topology-workspace-v1',sourceModule:'STP',
  nodes:[{id:'core1',hostname:'CORE-1',vendor:'Cisco NX-OS',role:'upper'},
         {id:'core2',hostname:'CORE-2',vendor:'Cisco NX-OS',role:'upper'},
         {id:'access',hostname:'ACCESS-1',vendor:'Cisco NX-OS',role:'lower'}],
  links:[],
  configs:[{deviceId:'core1',text:'spanning-tree mode rapid-pvst\nspanning-tree vlan 10 priority 4096'},
           {deviceId:'core2',text:'spanning-tree mode rapid-pvst\nspanning-tree vlan 10 priority 8192'},
           {deviceId:'access',text:'spanning-tree mode mst\nspanning-tree mst 1 priority 0'}]};
 w.sessionStorage.setItem('networkConfigurator.aiTopology.pending',JSON.stringify(raw));
 w.eval(fs.readFileSync('ai-topology-workspace.js','utf8'));
 w.eval(fs.readFileSync('stp-analysis-v1.js','utf8'));
 w.eval(fs.readFileSync('stp-knowledge-v1.js','utf8'));
 w.eval(fs.readFileSync('stp-cto-report.js','utf8'));
 w.eval(fs.readFileSync('ai-topology-ui.js','utf8'));
 assert.equal($('stpV1Panel').hidden,false,'STP source activates preflight');
 const access=[...d.querySelectorAll('#deviceAnalysisChoices input')].find(x=>x.dataset.deviceId==='access');
 assert.ok(access);access.checked=false;access.dispatchEvent(new w.Event('change',{bubbles:true}));
 $('runSTPPreflight').click();
 assert.match($('stpPreflightResult').textContent,/BRIDGE_PRIORITY_COMPARISON/);
 $('runSTPKnowledge').click();
 assert.match($('stpKnowledgeResult').textContent,/PRIORITIZED ENGINEERING FINDINGS/,'Knowledge catalog is visible independently of model');
 assert.match($('stpKnowledgeResult').textContent,/PRIORITIZED ENGINEERING FINDINGS/,'Prioritized findings are visible even when no risk requires a source reference');

 await $('runSTPCTO').onclick();
 assert.match($('stpCTOView').textContent,/STP Engineering Assessment/);
 assert.match($('stpCTOView').textContent,/Design knowledge rules/);
 assert.match($('stpCTOView').textContent,/CORE-1/);
 assert.match($('stpCTOView').textContent,/CORE-2/);
 assert.doesNotMatch($('stpCTOView').textContent,/ACCESS-1/);
 assert.equal($('exportSTPCTO').disabled,false,'styled HTML executive report available');
 assert.match($('stpCTOView').textContent,/STP-018/,'18-control engineering matrix is rendered');
 assert.match($('stpCTOView').textContent,/CORE-1/,'matrix reports per selected device');
 assert.match($('stpCTOView').textContent,/NOT AUTOMATED/,'unsupported checks are explicitly identified');
 assert.match($('stpCTOView').textContent,/OBSERVED/,'observed configuration is not mislabeled compliance');
 assert.doesNotMatch($('stpPreflightResult').textContent,/ACCESS-1/);
 $('preview').click();
 assert.equal($('analyze').disabled,false);
 assert.match($('evidencePreview').textContent,/stp-v1-preflight/);
 assert.match($('evidencePreview').textContent,/CORE-2/);
 assert.doesNotMatch($('evidencePreview').textContent,/Device ACCESS-1 hostname/);
 await $('analyze').onclick();
 assert.ok(submitted.length>0);
 assert.equal(submitted[0].module,'STP_ANALYSIS','STP-only scope uses dedicated prompt');
 assert.match($('analysisResult').value,/engineer review required/i);
 assert.match($('analysisResult').value,/STP comparison/);
 // Altering device selection invalidates prior review and prevents stale submission.
 access.checked=true;access.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal($('analyze').disabled,true);
 assert.equal($('analysisResult').value,'');
 assert.equal($('exportSTPCTO').disabled,true,'stale executive report must not be exportable');
 // When Beta has no configured LLM, Analyze must produce an explicit non-AI STP
 // configuration report rather than leaving the result blank.
 access.checked=false;access.dispatchEvent(new w.Event('change',{bubbles:true}));
 const earlierCalls=submitted.length;
 w.fetch=async(url)=>{
  if(url==='/api/engineering-knowledge/stp'){const db=JSON.parse(fs.readFileSync('knowledge/stp_v1.json','utf8'));return {ok:true,json:async()=>({module:'STP',version:db.version,signature:'a'.repeat(64),records:db.records,sources:db.sources})};}
  if(url==='/api/ai/status')return {ok:true,json:async()=>({available:false,provider:'disabled'})};
  if(url==='/api/projects/status')return {ok:true,json:async()=>({configured:false,available:false})};
  throw Error('No model call is permitted for an unconfigured provider: '+url);
 };
 $('language').value='tr';
 $('preview').click();
 assert.equal($('analyze').disabled,false);
 await $('analyze').onclick();
 assert.equal(submitted.length,earlierCalls,'no provider request is sent when AI is disabled');
 assert.match($('analysisResult').value,/AI modeli ÇALIŞTIRILMADI/);
 assert.match($('analysisResult').value,/VLAN 10: CORE-1 4096 vs CORE-2 8192/,'Human-readable bridge-priority evidence is included');
 assert.match($('analysisResult').value,/ÖNCELİKLİ BULGULAR/);
 assert.doesNotMatch($('analysisResult').value,/ACCESS-1/);
 assert.equal($('downloadReport').disabled,false,'explicit offline report can be exported');
 assert.match($('status').textContent,/AI çalıştırılmadı/);
 assert.match($('stpCTOView').textContent,/STP Mühendislik Analiz Raporu/,'offline Analyze shows CTO dashboard');
 assert.equal($('exportSTPCTO').disabled,false);
 dom.window.close();
 console.log('STP V1 UI: selected 2 Core devices, preflight, redacted evidence, typed model call, stale review prevention passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
