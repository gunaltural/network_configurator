(()=>{'use strict';
const host=document.querySelector('#ncSidebar');if(!host)return;
const trigger=document.createElement('button');trigger.className='nc-nav-item';trigger.textContent='AI Engineering Assistant';host.append(trigger);
// Optional design-review entry point: never intercepts Design -> Inventory navigation.
const designTrigger=document.createElement('button');designTrigger.className='nc-nav-item';designTrigger.textContent='Analyze Design with AI (optional)';host.append(designTrigger);
const workspaceTrigger=document.createElement('button');workspaceTrigger.className='nc-nav-item';workspaceTrigger.textContent='AI Topology Workspace';host.append(workspaceTrigger);
const dialog=document.createElement('dialog');dialog.style.cssText='width:min(820px,94vw);max-height:90vh;overflow:auto;padding:24px;border:1px solid #aabac8;border-radius:12px';
dialog.innerHTML='<form method="dialog"><button>Close</button></form><h2>AI Engineering Assistant</h2><p>Analyze the current module using its recorded evidence.</p><label>Task <select id="aiTask"><option value="design">Review design</option><option value="scenario">Explain scenarios</option><option value="report">Draft report commentary</option></select></label><p id="aiStatus" role="status"></p><details><summary>Evidence to send</summary><pre id="aiEvidence" style="white-space:pre-wrap;max-height:240px;overflow:auto"></pre></details><button id="aiRun" disabled>Analyze displayed evidence</button><textarea id="aiDraft" aria-label="Editable AI draft" style="display:block;width:100%;min-height:260px;margin:16px 0"></textarea><button id="aiCopy" disabled>Copy reviewed draft</button><label>Report section <select id="aiSection"><option value="executiveSummary">Executive summary</option><option value="trafficFlows">Traffic flows</option><option value="openItems">Open design items</option></select></label><button id="aiInsert" disabled>Append reviewed draft to report</button>';
document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);
const topologyPanel=document.createElement('section');topologyPanel.id='aiDesignTopology';topologyPanel.hidden=true;
topologyPanel.innerHTML='<h3>Design topology</h3><p id="aiTopologySummary"></p><div id="aiTopologyNodes" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0"></div><details><summary>Device configurations (optional)</summary><div id="aiDeviceConfigs"></div></details>';
dialog.insertBefore(topologyPanel,$('aiStatus'));
function renderDesign(report){
 topologyPanel.hidden=true;$('aiTopologyNodes').replaceChildren();$('aiDeviceConfigs').replaceChildren();
 const devices=Array.isArray(report?.devices)?report.devices:[],links=Array.isArray(report?.links)?report.links:[];
 if(!devices.length)return;
 topologyPanel.hidden=false;
 $('aiTopologySummary').textContent=devices.length+' devices · '+links.length+' links (design snapshot)';
 for(const device of devices){
  const node=document.createElement('div');node.style.cssText='padding:10px;border:1px solid #9eafbd;border-radius:8px;min-width:110px';
  node.textContent=String(device.hostname||device.id||'Device');$('aiTopologyNodes').append(node);
  const detail=document.createElement('details');const summary=document.createElement('summary');
  summary.textContent=String(device.hostname||device.id||'Device')+' — view configuration';detail.append(summary);
  const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;max-height:200px;overflow:auto';
  pre.textContent='Configuration preview is not yet connected to the design output. No raw configuration is transmitted.';
  detail.append(pre);$('aiDeviceConfigs').append(detail);
 }
}
let context=null,busy=false,language='en',reportSnapshot=null;
async function openAssistant(designOnly=false){if(busy)return;dialog.showModal();$('aiTask').value=designOnly?'design':'report';$('aiRun').disabled=true;$('aiCopy').disabled=true;$('aiDraft').value='';$('aiEvidence').textContent='';context=null;reportSnapshot=null;$('aiInsert').disabled=true;
try{const report=window.NetworkReportProject?.snapshot?.()||(window.__designWorkspaceOpened?window.NetworkWorkspaceProject?.diagnosticDesign?.():null);renderDesign(designOnly?report:null);context=NetworkAIEvidence.build(report);reportSnapshot=window.NetworkReportProject?JSON.stringify(report):null;language=report.language==='tr'?'tr':'en';$('aiEvidence').textContent=JSON.stringify(context,null,2);const r=await fetch('/api/ai/status');if(!r.ok)throw Error('AI status unavailable.');const status=await r.json();$('aiRun').disabled=!status.available;$('aiStatus').textContent=status.available?'Ready. Only displayed evidence will be sent.':'Model server is not activated. Your project is unchanged.';}catch(e){$('aiStatus').textContent=e.message;}}
trigger.onclick=()=>openAssistant(false);
workspaceTrigger.onclick=()=>window.location.assign('/ai-topology');
designTrigger.onclick=()=>{
 try{
  const report=window.NetworkWorkspaceProject?.diagnosticDesign?.()||window.NetworkReportProject?.snapshot?.();
  if(!Array.isArray(report?.devices)||!report.devices.length)throw Error('Open an individual Design with devices before importing it.');
  // Reuse the current Design output, not synthetic Simulation verdicts.
  // Only redacted Design parameters/config proposals and deterministic source
  // checks cross the one-use same-tab boundary; nothing is transmitted yet.
  const project=window.NetworkWorkspaceProject?.snapshot?.();
  const sourceFields=project?.fields||null;
  let validation=null;
  if(sourceFields&&window.NetworkDesignChecks?.evaluate){
   validation=window.NetworkDesignChecks.evaluate({module:report.source?.module,platform:report.vendor,fields:sourceFields});
  }
  const subset=window.NetworkAIEvidence.designHandoff(report,validation);
  window.sessionStorage.setItem('networkConfigurator.aiTopology.pending',JSON.stringify(subset));
  window.location.assign('/ai-topology');
 }catch(e){$('aiStatus').textContent=e.message;dialog.showModal();}
};
$('aiRun').onclick=async()=>{if(!context||busy)return;busy=true;$('aiRun').disabled=true;$('aiTask').disabled=true;$('aiCopy').disabled=true;$('aiDraft').value='';$('aiInsert').disabled=true;$('aiStatus').textContent='Analyzing…';
try{const r=await fetch('/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...context,language,task:$('aiTask').value})});const data=await r.json();if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'AI request rejected.');$('aiDraft').value=data.text;$('aiCopy').disabled=false;$('aiInsert').disabled=!reportSnapshot;$('aiStatus').textContent='Draft ready. Review before adding it to your report. No project changes were made.';}catch(e){$('aiStatus').textContent=e.message;}finally{busy=false;$('aiRun').disabled=false;$('aiTask').disabled=false;}};
$('aiInsert').onclick=()=>{
try{
 if(!reportSnapshot||JSON.stringify(window.NetworkReportProject?.snapshot?.())!==reportSnapshot)throw Error('The report changed. Reopen the assistant and analyze the current report before inserting.');
 const field=document.querySelector('[data-project-detail="'+$('aiSection').value+'"]');
 if(!field)throw Error('Open the editable module report to insert this draft.');
 const text=$('aiDraft').value.trim();if(!text)throw Error('The draft is empty.');
 const combined=field.value+(field.value.trim()?'\n\n':'')+text;
 if(field.maxLength>=0&&combined.length>field.maxLength)throw Error('Draft exceeds the report section limit. Shorten it before inserting.');
 field.value=combined;field.dispatchEvent(new Event('input',{bubbles:true}));$('aiInsert').disabled=true;$('aiStatus').textContent='Appended to the selected report section. Existing text was preserved.';
}catch(e){$('aiStatus').textContent=e.message;}
};
$('aiCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('aiDraft').value);$('aiStatus').textContent='Copied. Paste into the report section after review.';}catch{$('aiStatus').textContent='Select and copy the draft manually.';}};
})();
