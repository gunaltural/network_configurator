(()=>{'use strict';
const host=document.querySelector('#ncSidebar');if(!host)return;
const navigation=host.querySelector('[data-nc-group="analysis"] > div')||host;
const trigger=document.createElement('button');trigger.className='nc-nav-item nc-nav-sub';trigger.textContent='AI Engineering Assistant';navigation.append(trigger);
// Optional design-review entry point: never intercepts Design -> Inventory navigation.
const designTrigger=document.createElement('button');designTrigger.className='nc-nav-item nc-nav-sub';designTrigger.textContent='Analyze Design with AI (optional)';navigation.append(designTrigger);
const workspaceTrigger=document.createElement('button');workspaceTrigger.className='nc-nav-item nc-nav-sub';workspaceTrigger.textContent='AI Topology Workspace';navigation.append(workspaceTrigger);
const dialog=document.createElement('dialog');dialog.style.cssText='width:min(820px,94vw);max-height:90vh;overflow:auto;padding:24px;border:1px solid #aabac8;border-radius:12px';
dialog.innerHTML='<form method="dialog"><button>Close</button></form><h2>AI Engineering Assistant</h2><p>Analyze the current module using its recorded evidence.</p><label>Task <select id="aiTask"><option value="design">Review design</option><option value="scenario">Explain scenarios</option><option value="report">Draft report commentary</option></select></label><p id="aiStatus" role="status"></p><details><summary>Evidence to send</summary><pre id="aiEvidence" style="white-space:pre-wrap;max-height:240px;overflow:auto"></pre></details><button id="aiRun" disabled>Analyze displayed evidence</button><textarea id="aiDraft" aria-label="Editable AI draft" style="display:block;width:100%;min-height:260px;margin:16px 0"></textarea><button id="aiCopy" disabled>Copy reviewed draft</button><p>AI engineering drafts are independent. They are not appended to Module Report or Final Project Report.</p>';
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
let context=null,busy=false,language='en',modelProvider='disabled';
async function openAssistant(designOnly=false){if(busy)return;dialog.showModal();$('aiTask').value=designOnly?'design':'report';$('aiRun').disabled=true;$('aiCopy').disabled=true;$('aiDraft').value='';$('aiEvidence').textContent='';context=null;
try{const report=window.NetworkReportProject?.snapshot?.()||(window.__designWorkspaceOpened?window.NetworkWorkspaceProject?.diagnosticDesign?.():null);renderDesign(designOnly?report:null);context=NetworkAIEvidence.build(report);language=report.language==='tr'?'tr':'en';$('aiEvidence').textContent=JSON.stringify(context,null,2);const r=await fetch('/api/ai/status');if(!r.ok)throw Error('AI status unavailable.');const status=await r.json();modelProvider=status.available?status.provider||'local':'disabled';$('aiRun').disabled=!status.available;$('aiStatus').textContent=status.available?'Ready. Only displayed evidence will be sent.':'Model server is not activated. Your project is unchanged.';}catch(e){$('aiStatus').textContent=e.message;}}
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
  // Reuse the Design module's own SVG, rather than reconstructing its layout from device counts.
  // This is a visual-only snapshot; it is never included in the model evidence batches.
  try{report.topologySvg=window.NetworkWorkspaceProject?.simulationTopologySvg?.()||'';}catch{report.topologySvg='';}
  // Preserve the exact Design workspace for Return to <module>, including Quick Design.
  // Same-tab session only; this never mutates Module Report or uploads the project.
  if(project?.schema==='network-configurator-v3')window.sessionStorage.setItem('networkConfigurator.workflow.design',JSON.stringify(project));
  const subset=window.NetworkAIEvidence.designHandoff(report,validation);
  window.sessionStorage.setItem('networkConfigurator.aiTopology.pending',JSON.stringify(subset));
  window.location.assign('/ai-topology');
 }catch(e){$('aiStatus').textContent=e.message;dialog.showModal();}
};
// Keep the existing main Design entry point and guided workflow contract.
const designHead=document.getElementById('v3WorkspaceHead');
if(designHead&&!document.getElementById('sendDesignToAI')){
 const button=document.createElement('button');
 button.id='sendDesignToAI';button.type='button';button.className='v3-btn primary';
 button.textContent='AI Analizine Gönder';
 button.setAttribute('aria-label','Mevcut tasarımı bağımsız AI Analysis alanında incele');
 button.style.cssText='margin-left:auto;padding:9px 13px;background:#174e76;color:#fff;border:1px solid #174e76;border-radius:8px;white-space:nowrap;cursor:pointer';
 button.onclick=()=>designTrigger.click();designHead.append(button);
}
document.addEventListener('click',event=>{if(event.target.closest?.('[data-nc-ai-design]'))designTrigger.click();});
document.addEventListener('nc-ai-import-design',()=>designTrigger.click());
 // A user-selected saved Design can continue directly into this same AI Workspace.
 // This is a local snapshot handoff; no model request is triggered automatically.
 if(new URLSearchParams(location.search).get('aiImport')==='1'){
  Promise.resolve(window.__workspaceRestoreReady).then(async()=>{
   const requested=new URLSearchParams(location.search).get('workspace');
   const active=window.NetworkWorkspaceProject?.diagnosticScope?.()?.module;
   if(requested&&active!==requested&&window.NetworkWorkspaceProject?.activateModule)
    await window.NetworkWorkspaceProject.activateModule(requested);
   designTrigger.click();
  }).catch(error=>{$('aiStatus').textContent='Saved Design import unavailable: '+error.message;dialog.showModal();});
 }

$('aiRun').onclick=async()=>{if(!context||busy)return;busy=true;$('aiRun').disabled=true;$('aiTask').disabled=true;$('aiCopy').disabled=true;$('aiDraft').value='';$('aiStatus').textContent='Analyzing…';
try{if(['groq','openai'].includes(modelProvider)&&!window.confirm('The reviewed Design evidence will be sent to the external '+modelProvider+' AI provider. Confirm authorization to share this data. Continue?')){ $('aiStatus').textContent='External model transfer cancelled; no evidence sent.';return; }const r=await fetch('/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...context,language,task:$('aiTask').value})});const data=await r.json();if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'AI request rejected.');$('aiDraft').value=data.text;$('aiCopy').disabled=false;$('aiStatus').textContent='Independent AI draft ready. No Module Report or Final Project Report was changed.';}catch(e){$('aiStatus').textContent=e.message;}finally{busy=false;$('aiRun').disabled=false;$('aiTask').disabled=false;}};
$('aiCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('aiDraft').value);$('aiStatus').textContent='Copied. Paste into the report section after review.';}catch{$('aiStatus').textContent='Select and copy the draft manually.';}};
})();
