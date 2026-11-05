'use strict';
const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const html=fs.readFileSync('ai-topology.html','utf8');
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://test.invalid/ai-topology'});
 const w=dom.window,d=w.document,$=id=>d.getElementById(id);
 const devices=['CORE-01','CORE-02','ACCESS-01','ACCESS-02','ACCESS-03','ACCESS-04'];
 const report={vendor:'Cisco IOS-XE',source:{module:'BGP'},
  devices:devices.map((hostname,i)=>({id:'node-'+i,hostname,tier:i<2?'upper':'lower'})),
  links:[],specialLinks:[],parameters:[
   {label:'local-preference',value:'200 / 150',impact:'Primary and secondary egress preferences'},
   {label:'failover design',value:'dual core',impact:'No live failure convergence measured'}],
  configurations:devices.map((hostname,i)=>({deviceId:'node-'+i,text:'hostname '+hostname+
   '\nrouter bgp 65001\n neighbor 192.0.2.'+(i+1)+' remote-as 65002'+
   '\nusername admin secret PrivateSecretValue\nset psksecret MySecretPSKData\ncrypto isakmp key DeviceIsakmpValue address 192.0.2.6'})),
  designChecks:{evaluated:35,errors:0,warnings:0,issues:[]}
 };
 w.sessionStorage.setItem('networkConfigurator.aiTopology.pending',JSON.stringify(report));
 let mode='disabled',modelCalls=0;
 w.fetch=async(url)=>{
  if(url==='/api/projects/status')return {ok:true,json:async()=>({configured:false,available:false})};
  if(url==='/api/ai/status')return {ok:true,json:async()=>({available:mode!=='disabled',provider:'local'})};
  if(url==='/api/ai/analyze'){modelCalls++;return {ok:true,json:async()=>({mode:mode==='fallback'?'evidence-only-provider-fallback':'model-evidence-cited-draft',text:mode==='fallback'?'Provider unavailable; evidence only.':'Provisional BGP finding [config-0, L2].'})};}
  throw Error('Unexpected request '+url);
 };
 w.eval(fs.readFileSync('ai-topology-workspace.js','utf8'));
 w.eval(fs.readFileSync('network-evidence-correlation-v1.js','utf8'));
 w.eval(fs.readFileSync('ai-topology-ui.js','utf8'));
 assert.equal($('workflowStep2').hidden,false,'Design handoff enters the same 4-stage workflow');
 assert.match($('designReviewSummary').textContent,/6 Design configuration proposals/);
 assert.equal($('configReadiness').querySelectorAll('tr').length,7,'All six devices have readiness rows');
 assert.match($('readinessSummary').textContent,/6 \/ 6 devices have configuration/);
 assert.match($('showTechDeviceList').textContent,/CORE-01 · Design \/ attached configuration available/);
 assert.doesNotMatch($('showTechDeviceList').textContent,/No operational CLI/,'False missing-CLI impression is removed');
 assert.match($('showTechDeviceList').textContent,/No captured show output \(optional/);
 $('wizardNext').click();
 assert.equal($('workflowStep3').hidden,false);
 await $('analyze').onclick();
 assert.equal(modelCalls,0,'Offline evidence summary does not call a model');
 assert.equal($('workflowStep4').hidden,false,'Offline report opens normal final step');
 const output=$('stpCTOView');
 assert.match(output.textContent,/NO AI MODEL EXECUTED/,'No-AI state is disclosed');
 assert.match(output.textContent,/6 \/ 6/);
 assert.match(output.textContent,/35 Design checks/);
 assert.match(output.textContent,/Zero input errors do not imply zero network risk/);
 assert.match(output.textContent,/200 \/ 150/,'Original Design engineering choices are present');
 assert.match(output.textContent,/CORE-01/);
 assert.match(output.textContent,/BGP/);
 assert.match(output.textContent,/Neighbor FSM/,'Technology-specific verification task provided');
 assert.match(output.textContent,/Cross-device CLI evidence correlation/,'Generic report includes evidence correlation layer');
 assert.match(output.textContent,/Inter-domain routing policy/,'Technology purpose is explained for executives');
 assert.match(output.textContent,/unintended advertisements/,'Conditional risk is explained without asserting a live failure');
 assert.match(output.textContent,/router bgp, neighbor address families/,'Evidence and CLI method provided for BGP');
 assert.match(output.textContent,/L2: router bgp 65001/,'Line-addressed device CLI shown');
 assert.doesNotMatch(output.textContent,/PrivateSecretValue/,'Credentials never appear in report');
 assert.doesNotMatch(output.textContent,/MySecretPSKData|DeviceIsakmpValue/,'PSK and ISAKMP keys never appear in reports or their export source');
 assert.match(output.textContent,/\[REDACTED\]/,'Redacted CLI lines remain locatable');

 // Multi-line key payloads must never appear in report/HTML/PDF/Word source DOM.
 assert.doesNotMatch(output.textContent,/SENSITIVEPEM_PAYLOAD_123/);

 assert.equal(output.querySelectorAll('.engineering-deployment-evidence').length,6);
 assert.equal($('downloadEngineeringPDF').disabled,false);
 assert.equal($('downloadEngineeringWord').disabled,false);
 assert.equal($('exportSTPCTO').disabled,false);
 // A change invalidates the report rather than preserving stale findings.
 $('configDevice').value='node-0';$('configuration').value='hostname CORE-01\nrouter bgp 65099';
 $('saveConfig').click();
 assert.equal($('exportSTPCTO').disabled,true);
 assert.equal($('workflowStep4').hidden,true);
 // Operational capture does not overwrite generated Design configuration.
 $('showTechDevice').value='node-0';
 $('showTechPasteName').value='show-bgp-summary.out';
 $('showTechPasteText').value='CORE-01#show ip bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n192.0.2.1 4 65002 0 0 1 0 0 never Active';
 await $('attachShowTechPaste').onclick();
 assert.match($('showTechDeviceList').textContent,/show-bgp-summary.out/);
 assert.match($('showTechDeviceList').textContent,/Design \/ attached configuration available/);
 // The model path remains independently functional.
 mode='model';
 await $('analyze').onclick();
 assert.equal(modelCalls>0,true);
 assert.match($('stpCTOView').textContent,/AI DRAFT/);
 assert.match($('stpCTOView').textContent,/Provisional BGP finding/);
 assert.match($('stpCTOView').textContent,/show-bgp-summary.out/);
 assert.match($('stpCTOView').textContent,/Observed BGP neighbor FSM/,'Observed FSM is correlated from uploaded show output');
 assert.match($('stpCTOView').textContent,/L3: 192.0.2.1 4 65002/,'Original device line proof is visible in expanded DOM');
 // Provider-side evidence-only fallback must never be presented as successful AI reasoning.
 mode='fallback';$('configuration').value='hostname CORE-01\nrouter bgp 65003';$('saveConfig').click();
 await $('analyze').onclick();
 assert.match($('stpCTOView').textContent,/PROVIDER FAILED — EVIDENCE ONLY, NOT AI REASONING/);
 assert.doesNotMatch($('stpCTOView').textContent,/AI DRAFT — ENGINEER REVIEW REQUIRED/);
 dom.window.close();
 console.log('AI Analysis 6-device Design handoff, no-model report, provenance, staleness, CLI and model regression passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
