(()=>{'use strict';
const $=id=>document.getElementById(id),api=window.NetworkAITopology;
if(!api)return;
const handoff='networkConfigurator.aiTopology.pending';
let workspace=api.blank(),pendingBatches=null,reviewedSignature=null,runState=null,busy=false,originalMode=true;
const selectedDeviceIds=new Set();

/* Four-stage Design-like workflow; all existing element IDs and analysis functions remain intact. */
let currentStep=1,reportGenerated=false,activeSavedReport=null;
const workflowStages=[];
function createStep(number,title){
 const el=document.createElement('section');el.id='workflowStep'+number;el.dataset.step=number;
 el.className='workflow-step';el.hidden=number!==1;
 const h=document.createElement('h2');h.textContent=number+' · '+title;el.append(h);
 $('workflowStages').append(el);workflowStages.push(el);return el;
}
function stagePanel(){
 const panel=document.createElement('section');panel.className='panel workflow-stage-panel';return panel;
}
function setupWorkflow(){
 const old=$('legacyWorkspaceGrid'),topology=old.querySelector('[aria-label="Topology editor"]'),
  overview=old.querySelector('[aria-label="Topology overview"]'),analysis=old.querySelector('[aria-label="Engineering analysis"]');
 if(!topology||!overview||!analysis)throw Error('Workflow initialization failed.');
 const first=createStep(1,'Topology Selection'),columns=document.createElement('div');columns.className='workflow-columns';
 columns.append(topology,overview);first.append(columns);
 topology.querySelector('h2').textContent='Import or build topology';
 overview.querySelector('h2').textContent='Topology Preview';
 const second=createStep(2,'Configuration & Evidence'),config=stagePanel();
 const info=document.createElement('p');info.className='hint';info.id='readinessSummary';
 const table=document.createElement('div');table.id='configReadiness';
 config.append(info,table,$('perDeviceConfiguration'),$('showTechEvidence'),$('designReviewPanel'));second.append(config);
 const third=createStep(3,'Network Engineering Analysis');
 analysis.querySelector('h2').textContent='Analyze selected devices';
 third.append(analysis);
 const fourth=createStep(4,'Engineering Report'),report=stagePanel();
 const reportHelp=document.createElement('p');reportHelp.id='reportStageStatus';reportHelp.className='hint';
 reportHelp.textContent='Run analysis in step 3 to generate a report.';
 const controls=document.createElement('div');controls.className='report-tools';
 controls.append($('viewSTPCTO'),$('exportSTPCTO'));
 for(const [id,label] of [['saveEngineeringReport','Save Report'],['editEngineeringReport','Edit Report']]){
  const b=document.createElement('button');b.type='button';b.id=id;b.textContent=label;b.disabled=true;controls.append(b);
 }
 const edits=document.createElement('div');edits.id='reportEditPanel';edits.hidden=true;
 const noteTitle=document.createElement('h3');noteTitle.textContent='Reviewer notes (automatic CLI evidence is unchanged)';
 edits.append(noteTitle);
 for(const [id,label] of [['reviewExecutiveComment','Executive commentary'],['reviewEngineeringNotes','Technical notes / recommendations']]){
  const wrapper=document.createElement('label');wrapper.textContent=label;
  const text=document.createElement('textarea');text.id=id;wrapper.append(text);edits.append(wrapper);
 }
 const apply=document.createElement('button');apply.id='applyReportEdits';apply.type='button';apply.className='primary';apply.textContent='Apply Reviewer Notes';
 edits.append(apply);
 const saved=document.createElement('details');saved.id='savedReportsPanel';
 const title=document.createElement('summary');title.textContent='Saved reports (this browser)';
 const row=document.createElement('div');row.className='control';
 const list=document.createElement('select');list.id='reportSavedList';list.setAttribute('aria-label','Saved reports');
 const open=document.createElement('button');open.type='button';open.id='openSavedReport';open.textContent='Open saved report';
 row.append(list,open);saved.append(title,row);
 const frame=document.createElement('iframe');frame.id='savedReportPreview';frame.title='Read-only saved report';frame.setAttribute('sandbox','');frame.hidden=true;
 report.append(reportHelp,controls,$('stpCTOStatus'),edits,$('stpCTOView'),frame,
  $('analysisResult').closest('label'),$('downloadReport'),saved);
 fourth.append(report);
 $('workflowStages').before($('status'));old.remove();
 $('runSTPCTO').textContent='Run STP Engineering Analysis';
 for(const b of document.querySelectorAll('#workflowNav button[data-workflow-step]')){
  b.onclick=()=>navigateWorkflow(Number(b.dataset.workflowStep));
 }
 $('wizardBack').onclick=()=>navigateWorkflow(currentStep-1);
 $('wizardNext').onclick=()=>navigateWorkflow(currentStep+1);
}
const hasConfig=id=>workspace.configs.some(c=>c.deviceId===id&&typeof c.text==='string'&&!!c.text.trim());
function renderReadiness(){
 const root=$('configReadiness');root.replaceChildren();
 const table=document.createElement('table'),header=document.createElement('tr');
 for(const title of ['Device','Configuration','Verification CLI','Action']){const th=document.createElement('th');th.textContent=title;header.append(th);}
 table.append(header);let ready=0,withCli=0;
 for(const node of workspace.nodes){
  const isReady=hasConfig(node.id);if(isReady)ready++;
  const files=(workspace.showTech||[]).filter(c=>c.deviceId===node.id);if(files.length)withCli++;
  const tr=document.createElement('tr');
  const fields=[
   node.hostname+' · '+(node.vendor||'Unknown'),
   isReady?(node.source==='design'?'Design configuration':'Configuration attached'):'Missing — attach configuration',
   files.length?files.length+' captured file(s)':'Optional · not uploaded'
  ];
  fields.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i===1)td.className='readiness-state '+(isReady?'good':'missing');tr.append(td);});
  const cell=document.createElement('td'),button=document.createElement('button');
  button.type='button';button.textContent=isReady?'View / replace':'Attach config';
  button.onclick=()=>{navigateWorkflow(2);$('configDevice').value=node.id;loadConfig();$('perDeviceConfiguration').scrollIntoView?.({behavior:'smooth',block:'nearest'});};
  cell.append(button);tr.append(cell);table.append(tr);
 }
 root.append(table);
 $('readinessSummary').textContent=ready+' / '+workspace.nodes.length+' devices have configuration · '+withCli+' have optional CLI evidence';
}
function reportAvailable(){return reportGenerated||!!activeSavedReport||savedReportRecords().length>0;}
function refreshWorkflow(){
 renderReadiness();
 const enabled={1:true,2:workspace.nodes.length>0,3:workspace.configs.some(c=>hasConfig(c.deviceId)),4:reportAvailable()};
 for(const button of document.querySelectorAll('#workflowNav button[data-workflow-step]')){
  const step=Number(button.dataset.workflowStep);
  button.disabled=!enabled[step]&&step!==currentStep;
  if(step===currentStep)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
 }
 for(const step of workflowStages)step.hidden=Number(step.dataset.step)!==currentStep;
 $('wizardBack').disabled=currentStep===1;
 $('wizardNext').disabled=currentStep===4||!enabled[currentStep+1];
 $('wizardNext').textContent=['','Continue to Configurations','Continue to Analysis','View Report',''][currentStep];
 $('workflowSummary').textContent=[
  '',workspace.nodes.length+' nodes · '+workspace.links.length+' modeled links',
  workspace.configs.filter(c=>hasConfig(c.deviceId)).length+' configurations ready · operational CLI optional',
  'Select devices and technologies, then run analysis',
  activeSavedReport?'Read-only saved report':'View, export, annotate or save the engineering report'
 ][currentStep];
}
function navigateWorkflow(step){
 if(!Number.isInteger(step)||step<1||step>4)return false;
 const archived=step===4&&reportAvailable();
 if(step>1&&!workspace.nodes.length&&!archived){message('Create or import a topology first.',true);return false;}
 if(step>2&&!workspace.configs.some(c=>hasConfig(c.deviceId))&&!archived){message('Attach at least one device configuration before analysis.',true);return false;}
 if(step===4&&!reportAvailable()){message('Run engineering analysis before opening the report.',true);return false;}
 currentStep=step;refreshWorkflow();
 $('workflowNav').scrollIntoView?.({behavior:'smooth',block:'start'});return true;
}
setupWorkflow();

const scopedDeviceIds=()=>workspace.nodes.map(node=>node.id).filter(id=>selectedDeviceIds.has(id));
function syncDeviceChoices(){
 const known=new Set(workspace.nodes.map(n=>n.id));
 for(const id of selectedDeviceIds)if(!known.has(id))selectedDeviceIds.delete(id);
 for(const node of workspace.nodes)if(!selectedDeviceIds.has(node.id)&&![...document.querySelectorAll('#deviceAnalysisChoices input')].some(input=>input.dataset.deviceId===node.id))selectedDeviceIds.add(node.id);
 const root=$('deviceAnalysisChoices');root.replaceChildren();
 for(const node of workspace.nodes){
  const label=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span');
  input.type='checkbox';input.dataset.deviceId=node.id;input.checked=selectedDeviceIds.has(node.id);
  input.onchange=()=>{if(input.checked)selectedDeviceIds.add(node.id);else selectedDeviceIds.delete(node.id);invalidate();updateDeviceCount();};
  name.textContent=node.hostname+' · '+(node.vendor||'Unknown vendor');label.append(input,name);root.append(label);
 }
 updateDeviceCount();
}
function updateDeviceCount(){
 const count=scopedDeviceIds().length;
 $('deviceScopeCount').textContent=count+' / '+workspace.nodes.length+' devices selected';
}
$('selectAllDevices').onclick=()=>{for(const n of workspace.nodes)selectedDeviceIds.add(n.id);syncDeviceChoices();invalidate();};
$('clearSelectedDevices').onclick=()=>{selectedDeviceIds.clear();for(const input of document.querySelectorAll('#deviceAnalysisChoices input'))input.checked=false;updateDeviceCount();invalidate();};
const selectedModules=()=>[...document.querySelectorAll('#moduleChoices input:checked')].map(el=>el.value);
const clean=x=>String(x??'').trim(),snapshot=()=>JSON.stringify({workspace,modules:selectedModules(),devices:scopedDeviceIds()}),isReviewed=()=>reviewedSignature===snapshot();
function message(value,error=false){$('status').textContent=value;$('status').dataset.error=String(error);}
function updateScopeCount(){const modules=selectedModules(),n=modules.length;$('scopeCount').textContent=n?n+' engineering module'+(n===1?'':'s')+' selected':'No modules selected';$('stpV1Panel').hidden=!modules.includes('STP');}
function selectTopologyMode(original){
 originalMode=original;
 const hasOriginal=!!workspace.originalDesignSvg;
 $('originalDesignPane').hidden=!original||!hasOriginal;
 $('editableTopologyPane').hidden=original&&hasOriginal;
 $('showOriginalDesign').setAttribute('aria-pressed',String(original&&hasOriginal));
 $('showEditableTopology').setAttribute('aria-pressed',String(!original||!hasOriginal));
}
$('showOriginalDesign').onclick=()=>selectTopologyMode(true);
$('showEditableTopology').onclick=()=>selectTopologyMode(false);
function renderOriginalDesign(){
 const available=!!workspace.originalDesignSvg;
 $('showOriginalDesign').hidden=!available;
 const img=$('originalDesignImage');
 if(available){
  // SVG is displayed as a non-interactive image (not injected into the DOM).
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(workspace.originalDesignSvg);
  img.alt='Original '+(workspace.sourceModule||'Design')+' network topology';
 }else{img.removeAttribute('src');}
 selectTopologyMode(available&&originalMode);
}

// The three entry routes share this page; no import mutates the saved Design source.
function chooseEntry(mode){
 const choices=[['design','chooseDesign','designSource'],['saved','chooseSaved','savedSource'],['build','chooseBuild','buildSource']];
 for(const [key,button,panel] of choices){
  $(button).setAttribute('aria-pressed',String(mode===key));
  $(panel).hidden=mode!==key;
 }
}
$('chooseDesign').onclick=()=>{chooseEntry('design');$('refreshSavedDesign').click();};
$('chooseSaved').onclick=()=>chooseEntry('saved');
$('chooseBuild').onclick=()=>chooseEntry('build');
const buildCatalog=api.technologyCatalog();
const platformVendor=platform=>platform.startsWith('Cisco')?'Cisco':platform.startsWith('Arista')?'Arista':platform.startsWith('Huawei')?'Huawei':platform==='FortiGate'?'Fortinet':'Other';
function updateBuildPlatforms(){
 const definition=buildCatalog[$('buildTechnology').value];
 const permitted=definition.platforms.filter(platform=>platformVendor(platform)===$('buildVendor').value);
 $('buildPlatform').replaceChildren(...permitted.map(platform=>makeOption(platform,platform)));
}
function updateBuildOptions(){
 const tech=$('buildTechnology').value,definition=buildCatalog[tech];if(!definition)return;
 const vendors=[...new Set(definition.platforms.map(platformVendor))];
 $('buildVendor').replaceChildren(...vendors.map(v=>makeOption(v,v)));
 updateBuildPlatforms();
 $('buildPrimaryCount').value=String(definition.primaryCount);
 $('buildSecondaryCount').value=String(definition.secondaryCount);
 $('buildPrimaryCount').disabled=['STP','VPC','OSPF','QOS'].includes(tech);
 $('buildSecondaryCount').disabled=!definition.secondary||['OSPF','QOS'].includes(tech);
 $('primaryCountLabel').firstChild.textContent=definition.primary.charAt(0).toUpperCase()+definition.primary.slice(1)+' count';
 $('secondaryCountLabel').firstChild.textContent=(definition.secondary||'Secondary device')+' count';
}
$('buildTechnology').append(...Object.entries(buildCatalog).map(([key,definition])=>makeOption(key,definition.label)));
$('buildTechnology').value='STP';
$('buildTechnology').onchange=updateBuildOptions;
$('buildVendor').onchange=updateBuildPlatforms;
updateBuildOptions();
$('applyTechnologyTemplate').onclick=()=>{
 if((workspace.nodes.length||workspace.configs.length)&&!window.confirm('Replace your AI topology and attached device configurations? Original Design projects remain unchanged.'))return;
 try{
  workspace=api.buildTechnologyTopology($('buildTechnology').value,$('buildPlatform').value,Number($('buildPrimaryCount').value),Number($('buildSecondaryCount').value));
  selectedDeviceIds.clear();
  originalMode=false;
  $('sourceLabel').textContent='Built topology · configuration not yet attached';
  document.querySelectorAll('#moduleChoices input').forEach(input=>{input.checked=input.value===workspace.sourceModule;});
  changed('Technology topology created. Select a node and upload its real configuration or CLI output below.');
  loadDevice();loadLink();loadConfig();
 }catch(error){message(error.message,true);}
};
const sourceProjects=new Map();
const projectStatus=(message)=>{$('savedDesignStatus').textContent=message;};
function addProjectSource(id,label,source){
 if(sourceProjects.has(id))return;
 sourceProjects.set(id,source);$('savedDesignSelect').append(makeOption(id,label));
}
function refreshBrowserProjects(){
 const previousSelection=$('savedDesignSelect').value;
 sourceProjects.clear();
 $('savedDesignSelect').replaceChildren(makeOption('','Select a Design project'));
 const read=(storage,key)=>{try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}};
 const current=read(sessionStorage,'networkConfigurator.workflow.design');
 if(current?.schema==='network-configurator-v3'&&current.workspace?.technology)
  addProjectSource('current',String(current.project?.name||'Current Design')+' · current browser session',{kind:'browser',design:current});
 const saved=read(localStorage,'networkConfigurator.v3.projects');
 if(saved&&typeof saved==='object'&&!Array.isArray(saved))
 for(const [key,design] of Object.entries(saved)){
  if(design?.schema!=='network-configurator-v3'||!design.workspace?.technology)continue;
  addProjectSource('local:'+key,String(design.project?.name||key)+' · browser saved',{kind:'browser',design});
 }
 $('savedDesignSelect').value=sourceProjects.has(previousSelection)?previousSelection:'';
 $('openSavedDesign').disabled=!sourceProjects.has($('savedDesignSelect').value);
 projectStatus(sourceProjects.size?sourceProjects.size+' browser Design source(s) on this Beta address.':'No browser Design sources saved on this Beta address.');
}
$('savedDesignSelect').onchange=()=>{$('openSavedDesign').disabled=!sourceProjects.has($('savedDesignSelect').value);};
let refreshCounter=0;
$('refreshSavedDesign').onclick=async()=>{
 const refreshId=++refreshCounter;
 refreshBrowserProjects();
 const browserCount=sourceProjects.size;
 projectStatus('Checking Beta Project Library… '+browserCount+' browser source(s) found.');
 try{
  const statusResponse=await fetch('/api/projects/status');
  if(!statusResponse.ok){
   if(statusResponse.status===401||statusResponse.status===403)throw Error('Beta Project Library requires sign-in. Your main website session does not transfer to this Beta website.');
   throw Error('Beta Project Library status could not be checked (HTTP '+statusResponse.status+').');
  }
  const status=await statusResponse.json();
  if(!status.available)throw Error(status.configured?'Beta Project Library database is not responding.':'Beta Project Library database is not configured.');
  let offset=0,loaded=0;
  while(offset<500){
   const response=await fetch('/api/projects?offset='+offset);
   if(!response.ok)throw Error('Project Library list failed (HTTP '+response.status+').');
   const data=await response.json();if(refreshId!==refreshCounter)return;
   const projects=Array.isArray(data.projects)?data.projects:[];
   for(const item of projects){
    if(!item.has_design)continue;
    addProjectSource('library:'+item.id,String(item.name||item.id)+' · Project Library',{kind:'library',id:item.id});
    loaded++;
   }
   offset+=projects.length;
   if(!projects.length||offset>=(Number(data.total)||0))break;
  }
  if(refreshId!==refreshCounter)return;
  projectStatus(browserCount+' browser Design source(s) + '+loaded+' Beta Project Library record(s).'+(offset>=500?' Showing the first 500 records.':''));
 }catch(error){
  if(refreshId!==refreshCounter)return;
  projectStatus(browserCount+' browser Design source(s). '+error.message+' Main website saved projects must be exported or imported through their original Design source.');
 }
};
function designFromJson(input){
 if(input?.schema==='network-configurator-v3')return input;
 if(input?.schema==='network-configurator-project-v1'&&input.design?.schema==='network-configurator-v3')return input.design;
 throw Error('Unsupported JSON format. Choose a Design project export or a saved AI Workspace file.');
}
function openDesignForImport(design){
 if(design?.schema!=='network-configurator-v3'||!design.workspace?.technology||!design.fields||typeof design.fields!=='object')
  throw Error('This file does not contain a usable Network Configurator Design workspace.');
 const module=String(design.workspace.technology).toUpperCase();
 if(!['BASIC','BGP','OSPF','STP','VPC','EVPN','SDWAN','QOS'].includes(module))
  throw Error('Unsupported Design technology: '+module);
 if((workspace.nodes.length||workspace.configs.length)&&!window.confirm('Replace the current unsaved AI workspace with a different Design import?'))return false;
 sessionStorage.setItem('networkConfigurator.workflow.design',JSON.stringify(design));
 window.location.assign('/?resume=1&workspace='+encodeURIComponent(module)+'&aiImport=1');
 return true;
}
$('importDesignFile').onchange=async()=>{
 const file=$('importDesignFile').files?.[0];if(!file)return;
 if(file.size>5000000)return projectStatus('Design JSON exceeds 5 MB.');
 try{
  const design=designFromJson(JSON.parse(await file.text()));
  projectStatus('Opening '+(design.project?.name||file.name)+' in Design for AI import…');
  openDesignForImport(design);
 }catch(error){projectStatus('Design JSON import failed: '+error.message);}
};
$('openSavedDesign').onclick=async()=>{
 const source=sourceProjects.get($('savedDesignSelect').value);if(!source)return;
 try{
  let design=source.design;
  if(source.kind==='library'){
   const response=await fetch('/api/projects/'+encodeURIComponent(source.id));
   if(!response.ok)throw Error('The saved Project Library document could not be opened.');
   const record=await response.json();design=record.document?.design;
  }
  openDesignForImport(designFromJson(design));
 }catch(error){projectStatus('Could not open Design: '+error.message);}
};
function makeOption(id,name){const opt=document.createElement('option');opt.value=id;opt.textContent=name;return opt;}
function populate(select,values,preserve,blank){
 select.replaceChildren();
 if(blank)select.append(makeOption('','New'));
 for(const [id,label] of values)select.append(makeOption(id,label));
 select.value=values.some(x=>x[0]===preserve)?preserve:(blank?'':values[0]?.[0]||'');
}
function invalidate(){if(currentStep===4)currentStep=3;reportGenerated=false;activeSavedReport=null;$('saveEngineeringReport').disabled=true;$('editEngineeringReport').disabled=true;$('reportEditPanel').hidden=true;$('savedReportPreview').hidden=true;$('savedReportPreview').srcdoc='';$('reviewExecutiveComment').value='';$('reviewEngineeringNotes').value='';reviewedSignature=null;pendingBatches=null;runState=null;$('analyze').disabled=true;$('downloadReport').disabled=true;$('evidencePreview').textContent='';$('analysisResult').value='';$('stpPreflightResult').textContent='STP V1 preflight not run for the current device selection.';$('stpKnowledgeResult').textContent='Knowledge review not run for this device selection.';$('stpCTOView').replaceChildren();$('stpCTOStatus').textContent='';$('exportSTPCTO').disabled=true;$('viewSTPCTO').disabled=true;$('stpCTOView').hidden=true;}
function draw(){
 const svg=$('topologyCanvas');svg.replaceChildren();
 const NS='http://www.w3.org/2000/svg',points=new Map(),n=workspace.nodes.length;
 const nodes=workspace.nodes;
 nodes.forEach((node,i)=>{
  const angle=-Math.PI/2+i*2*Math.PI/Math.max(n,1),radius=n===1?0:Math.min(145,65+n*12);
  points.set(node.id,node.position||{x:400+Math.cos(angle)*radius*1.65,y:180+Math.sin(angle)*radius});
 });
 function element(tag,attrs,parent=svg){
  const x=document.createElementNS(NS,tag);
  for(const [k,v]of Object.entries(attrs))x.setAttribute(k,String(v));
  parent.append(x);return x;
 }
 // Align with Design's tiered, rectangular network-diagram visual grammar.
 // This is a view of the AI-owned graph, never a second configuration generator.
 const upper=nodes.filter(node=>(points.get(node.id)?.y||0)<180).length;
 const lower=nodes.length-upper;
 if(nodes.length){
  element('rect',{x:12,y:28,width:776,height:135,rx:12,class:'topology-tier'});
  element('rect',{x:12,y:193,width:776,height:145,rx:12,class:'topology-tier'});
  const label1=element('text',{x:27,y:47,class:'topology-tier-title'});label1.textContent='CORE / PRIMARY  ·  '+upper;
  const label2=element('text',{x:27,y:212,class:'topology-tier-title'});label2.textContent='ACCESS / SECONDARY  ·  '+lower;
 }
 for(const link of workspace.links){
  const a=points.get(link.a),b=points.get(link.b);if(!a||!b)continue;
  const line=element('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:link.logical?'link link-logical':'link','stroke-dasharray':link.logical?'7 5':'none'});
  line.setAttribute('aria-label',link.id+' '+link.kind);
  // Link descriptions remain in Advanced inventory; generic captions obscure nodes.
 }
 for(const node of nodes){
  const p=points.get(node.id),external=/external|isp|transport/i.test(node.role||'')||/^External/.test(node.vendor||'');
  const box=element('rect',{x:p.x-57,y:p.y-35,width:114,height:70,rx:12,ry:12,class:external?'node node-external':'node','data-device-id':node.id,tabindex:0,role:'button','aria-label':'Select or drag '+node.hostname+' to reposition'});
  const title=element('title',{},box);title.textContent=node.hostname+' · '+node.vendor+' · '+(node.role||'network device');
  const name=element('text',{x:p.x,y:p.y-11,'text-anchor':'middle',class:'node-title'});name.textContent=String(node.hostname).slice(0,17);
  const role=element('text',{x:p.x,y:p.y+8,'text-anchor':'middle',class:'node-role'});role.textContent=String(node.role||'network device').slice(0,22);
  const vendor=element('text',{x:p.x,y:p.y+25,'text-anchor':'middle',class:'node-vendor'});vendor.textContent=String(node.vendor).slice(0,19);
 }
}
// SVG pointer interactions update drawing coordinates only; config and Design remain intact.
let draggingNode=null;
function pointerLocation(event){
 const svg=$('topologyCanvas'),rect=svg.getBoundingClientRect();
 if(!rect.width||!rect.height)return null;
 return {x:(event.clientX-rect.left)*800/rect.width,y:(event.clientY-rect.top)*360/rect.height};
}
$('topologyCanvas').addEventListener('pointerdown',event=>{
 const target=event.target.closest?.('[data-device-id]');
 if(!target||event.button!==0)return;
 const start=pointerLocation(event);if(!start)return;
 const node=workspace.nodes.find(n=>n.id===target.dataset.deviceId);if(!node)return;
 const i=workspace.nodes.indexOf(node),angle=-Math.PI/2+i*2*Math.PI/Math.max(workspace.nodes.length,1);
 const radius=workspace.nodes.length===1?0:Math.min(145,65+workspace.nodes.length*12);
 const current=node.position||{x:400+Math.cos(angle)*radius*1.65,y:180+Math.sin(angle)*radius};
 draggingNode={id:node.id,offsetX:current.x-start.x,offsetY:current.y-start.y,moved:false};
 $('topologyCanvas').setPointerCapture?.(event.pointerId);event.preventDefault();
});
$('topologyCanvas').addEventListener('pointermove',event=>{
 if(!draggingNode)return;const point=pointerLocation(event);if(!point)return;
 workspace=api.moveDevice(workspace,draggingNode.id,point.x+draggingNode.offsetX,point.y+draggingNode.offsetY);
 draggingNode.moved=true;draw();
});
// Clicking a topology node selects its corresponding configuration editor.
$('topologyCanvas').addEventListener('click',event=>{
 const node=event.target.closest?.('[data-device-id]');if(!node)return;
 const id=node.dataset.deviceId;
 if(!workspace.nodes.some(n=>n.id===id))return;
 $('deviceSelect').value=id;loadDevice();
 $('configDevice').value=id;loadConfig();
 navigateWorkflow(2);
 $('perDeviceConfiguration').scrollIntoView?.({behavior:'smooth',block:'nearest'});
});
function finishDrag(){
 if(!draggingNode)return;
 const moved=draggingNode.moved;draggingNode=null;
 if(moved)changed('Node position updated.');
}
$('topologyCanvas').addEventListener('pointerup',finishDrag);
$('topologyCanvas').addEventListener('pointercancel',finishDrag);
$('topologyCanvas').addEventListener('lostpointercapture',finishDrag);
function render(){
 syncDeviceChoices();
 updateScopeCount();
 renderOriginalDesign();
 const devs=workspace.nodes.map(n=>[n.id,n.hostname||n.id]),links=workspace.links.map(l=>[l.id,l.id+' · '+l.kind]);
 populate($('deviceSelect'),devs,$('deviceSelect').value,true);
 populate($('linkSelect'),links,$('linkSelect').value,true);
 populate($('linkA'),devs,$('linkA').value,false);
 populate($('linkB'),devs,$('linkB').value,false);
 populate($('configDevice'),devs,$('configDevice').value,false);
 populate($('showTechDevice'),devs,$('showTechDevice').value,false);
 renderEvidenceDevices();
 $('overview').textContent=workspace.nodes.length+' devices · '+workspace.links.length+' links · '+workspace.configs.length+' configurations attached (not operationally validated)';
 const review=workspace.designReview,panel=$('designReviewPanel');
 panel.hidden=!review;
 if(review){
  const checks=review.checks||null;
  $('designReviewSummary').textContent=
   'Imported '+review.parameters.length+' Design engineering parameters and '+workspace.configs.length+
   ' configuration proposals. '+(checks?checks.evaluated+' original input checks · '+checks.errors+' errors · '+checks.warnings+' advisories.':'Original Design consistency checks not provided.')+
   (review.edited?' ATTENTION: Workspace changed after import; original Design checks are STALE.':' No network device has been verified.');
  $('designReviewIssues').replaceChildren();
  for(const issue of checks?.issues||[]){
   const li=document.createElement('li');li.textContent=issue.severity.toUpperCase()+': '+issue.message;
   $('designReviewIssues').append(li);
  }
 }
 $('devicesList').replaceChildren();$('linksList').replaceChildren();
 for(const node of workspace.nodes){
  const li=document.createElement('li'),button=document.createElement('button');
  button.type='button';button.textContent=node.hostname+' · '+node.vendor;
  button.onclick=()=>{$('deviceSelect').value=node.id;loadDevice();$('configDevice').value=node.id;loadConfig();};
  li.append(button);$('devicesList').append(li);
 }
 for(const link of workspace.links){
  const li=document.createElement('li'),button=document.createElement('button');
  button.type='button';button.textContent=link.id+': '+link.a+' → '+link.b;
  button.onclick=()=>{$('linkSelect').value=link.id;loadLink();};li.append(button);$('linksList').append(li);
 }
 draw();
 refreshWorkflow();
}
function changed(label){invalidate();render();message(label+' Your original Design project was not modified.');}
function loadDevice(){
 const n=workspace.nodes.find(n=>n.id===$('deviceSelect').value);
 $('deviceId').readOnly=!!n;$('deviceId').value=n?.id||'';$('hostname').value=n?.hostname||'';
 $('vendor').value=n?.vendor||'';$('role').value=n?.role||'';
}
function loadLink(){
 const l=workspace.links.find(l=>l.id===$('linkSelect').value);
 $('linkId').readOnly=!!l;$('linkId').value=l?.id||'';$('linkKind').value=l?.kind||'';
 if(l){$('linkA').value=l.a;$('linkB').value=l.b;}
 $('linkAPort').value=l?.aPort||'';$('linkBPort').value=l?.bPort||'';$('linkLogical').checked=!!l?.logical;
}
function loadConfig(){
 const c=workspace.configs.find(c=>c.deviceId===$('configDevice').value);
 $('configuration').value=c?.text||'';
}
function renderEvidenceDevices(){
 const list=$('showTechDeviceList');list.replaceChildren();
 for(const device of workspace.nodes){
  const item=document.createElement('div');item.className='evidence-device';item.setAttribute('role','listitem');
  const files=(workspace.showTech||[]).filter(c=>c.deviceId===device.id);
  const caption=document.createElement('span');
  caption.textContent=device.hostname+' · '+(files.length?files.map(c=>c.filename+(c.synthetic?' [SYNTHETIC LAB]':'')).join(', '):'No operational CLI');
  item.append(caption);
  const button=document.createElement('button');button.type='button';button.textContent='Upload';button.dataset.evidenceDevice=device.id;
  button.onclick=()=>chooseEvidenceFile(device.id);item.append(button);
  for(const file of files){
   const remove=document.createElement('button');remove.type='button';remove.textContent='Remove '+file.filename;
   remove.onclick=()=>{workspace=api.removeShowTech(workspace,device.id,file.filename);changed('Operational evidence removed.');};
   item.append(remove);
  }
  list.append(item);
 }
}
let pendingEvidenceDevice=null;
function chooseEvidenceFile(deviceId){
 if(!workspace.nodes.some(n=>n.id===deviceId))return message('Select a valid device.',true);
 pendingEvidenceDevice=deviceId;
 $('showTechDevice').value=deviceId;
 $('showTechFile').value='';
 $('showTechFile').click();
}
function evidenceText(file,text){
 if(!text.trim())throw Error(file+' is empty.');
 const probe=text.slice(0,16000);
 if(probe.includes('\u0000')||((probe.match(/\uFFFD/g)||[]).length>24))throw Error(file+' does not appear to be a plain text CLI capture. Extract text from ZIP or binary archive first.');
 return text;
}
async function attachEvidenceBatch(files,deviceId){
 if(!deviceId||!workspace.nodes.some(n=>n.id===deviceId))throw Error('Choose a device for the CLI evidence.');
 if(!files.length)return;
 const ready=[];
 for(const file of files){
  if(file.size>8000000)throw Error(file.name+' exceeds 8 MB. Split the CLI capture.');
  const contents=evidenceText(file.name,await file.text());
  ready.push({filename:file.name||'verification.out',text:contents});
 }
 let next=workspace;
 for(const entry of ready)next=api.addShowTech(next,deviceId,entry.text,entry.filename,false);
 const wasVisible=!$('stpCTOView').hidden,alreadyHadReport=!$('exportSTPCTO').disabled;
 workspace=next;
 changed(ready.length+' CLI capture'+(ready.length===1?'':'s')+' uploaded.');
 $('showTechDevice').value=deviceId;
 const host=workspace.nodes.find(n=>n.id===deviceId).hostname;
 $('showTechStatus').textContent=ready.map(x=>x.filename).join(', ')+' attached to '+host+'.';
 if(alreadyHadReport&&selectedModules().includes('STP')){
  await $('runSTPCTO').onclick();
  $('stpCTOView').hidden=!wasVisible;
  $('viewSTPCTO').textContent=wasVisible?'Hide HTML View':'HTML View';
 }
}
$('showTechDevice').onchange=()=>{pendingEvidenceDevice=null;};
$('showTechFile').onpointerdown=()=>{pendingEvidenceDevice=null;};
$('showTechFile').onkeydown=()=>{pendingEvidenceDevice=null;};
$('showTechFile').onchange=async()=>{
 const files=[...($('showTechFile').files||[])],deviceId=pendingEvidenceDevice||$('showTechDevice').value;
 pendingEvidenceDevice=null;
 try{await attachEvidenceBatch(files,deviceId);}
 catch(e){$('showTechStatus').textContent=e.message;message('Show Tech: '+e.message,true);}
 finally{$('showTechFile').value='';}
};
$('attachShowTechPaste').onclick=async()=>{
 const deviceId=$('showTechDevice').value,text=$('showTechPasteText').value;
 const filename=$('showTechPasteName').value.trim()||'pasted-verification.out';
 try{
  await attachEvidenceBatch([{name:filename,size:new Blob([text]).size,text:async()=>text}],deviceId);
  $('showTechPasteText').value='';$('showTechPasteName').value='';
 }catch(e){$('showTechStatus').textContent=e.message;message('Show Tech: '+e.message,true);}
};
$('stpCTOView').addEventListener('click',event=>{
 const upload=event.target.closest?.('[data-evidence-upload]');
 if(upload)chooseEvidenceFile(upload.dataset.evidenceUpload);
});
$('loadSTPLab').onclick=()=>{
 if((workspace.nodes.length||workspace.configs.length||(workspace.showTech||[]).length)&&!window.confirm('Replace the current AI workspace with a synthetic 2 Core + 1 Access LAB?'))return;
 if(!window.NetworkSTPLabV1)return message('Synthetic LAB module not available.',true);
 try{
  workspace=window.NetworkSTPLabV1.create();originalMode=false;
  for(const choice of document.querySelectorAll('#moduleChoices input'))choice.checked=choice.value==='STP';
  $('sourceLabel').textContent='SYNTHETIC STP LAB · NOT PRODUCTION DATA';
  currentStep=2;changed('Synthetic 2 Core + 1 Access LAB loaded.');
  loadDevice();loadLink();loadConfig();
 }catch(e){message('LAB: '+e.message,true);}
};
function saveFile(name,text,type){
 const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
document.querySelectorAll('#moduleChoices input').forEach(input=>input.addEventListener('change',()=>{invalidate();updateScopeCount();message('Analysis scope changed. Review evidence again before sending.');}));
$('moduleSearch').addEventListener('input',()=>{
 const query=$('moduleSearch').value.trim().toLocaleLowerCase();
 document.querySelectorAll('#moduleChoices label').forEach(label=>{label.hidden=!label.textContent.toLocaleLowerCase().includes(query);});
});
$('clearModules').onclick=()=>{
 for(const checkbox of document.querySelectorAll('#moduleChoices input'))checkbox.checked=false;
 invalidate();updateScopeCount();message('Analysis modules cleared. Select at least one technology.');
};

function fromHandoff(){
 const handoffRaw=sessionStorage.getItem(handoff);if(!handoffRaw)return;
 sessionStorage.removeItem(handoff);
 try{
  const report=JSON.parse(handoffRaw);
  workspace=report?.schema==='ai-topology-workspace-v1'?api.validate(report):api.fromDesign(report);originalMode=true;
  chooseEntry('design');
  $('sourceLabel').textContent='Imported Design snapshot · independent copy';
  $('topologyEntryHint').textContent='Imported '+(workspace.sourceModule||'Design')+' topology and generated configurations from Design. The source is unchanged. You can edit this independent copy, review evidence and return to the source module.';
  const sourceModule=String(workspace.sourceModule||'').toUpperCase();
  const aliases={SYSTEM_MANAGEMENT:'SYSTEM',SYSTEM_MANAGEMENT_AND_SECURITY:'SYSTEM',MLAG:'VPC',VXLAN:'EVPN'};
  const chosen=aliases[sourceModule]||sourceModule;
  const sourceChoice=[...document.querySelectorAll('#moduleChoices input')].find(el=>el.value===chosen);
  if(sourceChoice)sourceChoice.checked=true;
  const returnLink=$('returnToDesign');if(returnLink){const module=String(workspace.sourceModule||'').toUpperCase();const supported=['BASIC','BGP','OSPF','STP','VPC','EVPN','SDWAN','QOS'];if(supported.includes(module)){returnLink.hidden=false;returnLink.textContent='Return to '+(module==='BASIC'?'System and Management':module)+' Design';returnLink.href='/?resume=1&workspace='+encodeURIComponent(module);}else{returnLink.hidden=true;}}
  currentStep=2;
  message('Imported '+workspace.nodes.length+' Design devices, '+workspace.configs.length+' generated configuration proposals and '+(workspace.designReview?.parameters.length||0)+' engineering parameters. Review redacted evidence before AI analysis.');
 }catch(e){message('Could not import Design snapshot: '+e.message,true);}
}
$('aiBuildTopology').onclick=()=>{
 if((workspace.nodes.length||workspace.links.length||workspace.configs.length)&&
    !window.confirm('Replace the current topology and its attached configurations with a new, independent network?'))return;
 try{
  workspace=api.buildFreeTopology({deviceCount:Number($('aiNodeCount').value),
   layout:$('aiTopologyPattern').value,vendor:$('aiDefaultVendor').value,role:clean($('aiDefaultRole').value)});
  $('sourceLabel').textContent='New independent topology';
  changed('Created '+workspace.nodes.length+' devices and '+workspace.links.length+' links.');
  loadDevice();loadLink();loadConfig();
 }catch(e){message(e.message,true);}
};
$('applyTemplate').onclick=()=>{
 if((workspace.nodes.length||workspace.configs.length)&&!window.confirm('Replace your current topology and attached configurations?'))return;
 try{workspace=api.template($('template').value);originalMode=false;const module=String(workspace.sourceModule||'').toUpperCase();const choice=[...document.querySelectorAll('#moduleChoices input')].find(el=>el.value===module);if(choice)choice.checked=true;$('sourceLabel').textContent='Template · independent copy';changed('Template loaded.');loadDevice();loadLink();loadConfig();}
 catch(e){message(e.message,true);}
};
$('deviceSelect').onchange=loadDevice;
$('newDevice').onclick=()=>{$('deviceSelect').value='';loadDevice();};
$('saveDevice').onclick=()=>{
 try{
  const id=clean($('deviceId').value),fields={hostname:clean($('hostname').value),vendor:clean($('vendor').value),role:clean($('role').value)};
  if(!id||!fields.hostname||!fields.vendor)throw Error('Device ID, hostname and vendor are required.');
  workspace=$('deviceSelect').value?api.updateDevice(workspace,$('deviceSelect').value,fields):api.addDevice(workspace,{id,...fields});
  changed('Device saved.');$('deviceSelect').value=id;loadDevice();
 }catch(e){message(e.message,true);}
};
$('deleteDevice').onclick=()=>{
 const id=$('deviceSelect').value;if(!id)return message('Choose a device to remove.',true);
 if(!window.confirm('Remove this device, its connections and its attached configuration?'))return;
 try{workspace=api.removeDevice(workspace,id);changed('Device removed.');loadDevice();loadConfig();}catch(e){message(e.message,true);}
};
$('linkSelect').onchange=loadLink;
$('newLink').onclick=()=>{$('linkSelect').value='';loadLink();};
$('saveLink').onclick=()=>{
 try{
  const id=clean($('linkId').value),fields={a:$('linkA').value,b:$('linkB').value,aPort:clean($('linkAPort').value),bPort:clean($('linkBPort').value),kind:clean($('linkKind').value),logical:$('linkLogical').checked};
  if(!id||!fields.a||!fields.b)throw Error('Link ID and both endpoint devices are required.');
  workspace=$('linkSelect').value?api.updateLink(workspace,$('linkSelect').value,fields):api.addLink(workspace,{id,...fields});
  changed('Connection saved.');$('linkSelect').value=id;loadLink();
 }catch(e){message(e.message,true);}
};
$('deleteLink').onclick=()=>{
 const id=$('linkSelect').value;if(!id)return message('Choose a connection.',true);
 try{workspace=api.removeLink(workspace,id);changed('Connection removed.');loadLink();}catch(e){message(e.message,true);}
};
$('configDevice').onchange=loadConfig;
$('configFile').onchange=async()=>{
 const file=$('configFile').files[0];if(!file)return;
 if(file.size>150000){message('File exceeds 150 KB for this editor. Use CLI Analysis for large captures.',true);return;}
 try{$('configuration').value=await file.text();message('Loaded '+file.name+' locally; click Attach to include it in the workspace.');}
 catch(e){message('Unable to read file: '+e.message,true);}
};
$('saveConfig').onclick=()=>{
 const id=$('configDevice').value;if(!id)return message('Add and select a device first.',true);
 try{workspace=api.setConfiguration(workspace,id,$('configuration').value);changed('Device configuration attached locally.');$('configDevice').value=id;loadConfig();}
 catch(e){message(e.message,true);}
};
$('exportWorkspace').onclick=()=>{
 if((workspace.configs.some(c=>c.text)||(workspace.showTech||[]).some(c=>c.text))&&!window.confirm('Workspace JSON contains raw Design and verification CLI; it may include credentials. Download to this device?'))return;
 saveFile('network-ai-topology.json',JSON.stringify(workspace,null,2),'application/json');
 message('Workspace downloaded to this device. No cloud project was changed.');
};
$('importWorkspace').onchange=async()=>{
 const file=$('importWorkspace').files?.[0];if(!file)return;
 if(file.size>5000000)return message('Maximum JSON size is 5 MB.',true);
 try{
  const input=JSON.parse(await file.text());
  if(input?.schema==='network-configurator-v3'||input?.schema==='network-configurator-project-v1'){
   chooseEntry('design');
   projectStatus('Design project JSON detected. Opening source Design before AI import.');
   openDesignForImport(designFromJson(input));return;
  }
  if((workspace.nodes.length||workspace.configs.length)&&!window.confirm('Replace the current AI workspace?'))return;
  workspace=api.validate(input);currentStep=2;$('sourceLabel').textContent='Imported saved AI workspace';changed('Saved AI workspace imported.');loadDevice();loadLink();loadConfig();
 }catch(e){message('JSON import failed: '+e.message,true);}
};
$('assessStructure').onclick=()=>{
 try{
  const result=api.structuralAssessment(workspace);
  const lines=[
   'Source: planned graph only; not observed operational reachability',
   'Devices: '+result.devices+' · physical links: '+result.physicalLinks+
     ' · logical links: '+result.logicalLinks,
   'Physical components: '+result.components.length+
     ' ('+result.components.map(x=>x.length).join(', ')+' device(s))',
   'Isolated in drawn physical graph: '+(result.isolatedDevices.join(', ')||'none'),
   'Potential transit dependencies: '+(result.potentialTransitDependencies.join(', ')||'none'),
   'Potential single-path links: '+(result.potentialSinglePathLinks.join(', ')||'none'),
   'Devices without attached configurations: '+(result.configurationMissing.join(', ')||'none'),
   result.caveat
  ];
  $('structuralResult').textContent=lines.join('\n');
 }catch(e){message(e.message,true);}
};
function renderSTPKnowledgeSources(){
 const container=$('stpKnowledgeSources');
 container.replaceChildren();
 const catalog=window.NetworkSTPKnowledgeV1;
 if(!catalog)return;
 for(const source of [...Object.values(catalog.sources),...Object.values(catalog.standards||{})]){
  const a=document.createElement('a');
  a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';
  a.textContent=source.title;
  a.style.display='block';a.style.margin='4px 0';
  container.append(a);
 }
}
renderSTPKnowledgeSources();
function stpKnowledgeV1Review(){
 if(!window.NetworkSTPKnowledgeV1)throw Error('STP knowledge catalog script unavailable.');
 return window.NetworkSTPKnowledgeV1.review(workspace,scopedDeviceIds());
}
$('runSTPKnowledge').onclick=()=>{
 try{
  if(!selectedModules().includes('STP'))throw Error('Select STP engineering scope first.');
  const r=stpKnowledgeV1Review();
  $('stpKnowledgeResult').textContent=window.NetworkSTPKnowledgeV1.format(r,$('language').value);
  $('stpKnowledgeDetails').open=true;
  message('STP knowledge review complete. '+r.entries.length+' contextual entries; platform and operating state require engineering review.');
 }catch(error){message('STP knowledge: '+error.message,true);}
};
$('runSTPCTO').onclick=async()=>{
 if(!selectedModules().includes('STP')){message('Select STP scope for the CTO report.',true);return;}
 const selected=scopedDeviceIds();
 if(!selected.length){message('Select at least one STP device.',true);return;}
 const signature=JSON.stringify({deviceIds:selected,configs:workspace.configs,showTech:workspace.showTech,modules:selectedModules()});
 $('stpCTOStatus').textContent='Loading versioned Design engineering knowledge…';
 try{
  const response=await fetch('/api/engineering-knowledge/stp');
  if(!response.ok)throw Error('Knowledge database unavailable (HTTP '+response.status+').');
  const db=await response.json();
  if(signature!==JSON.stringify({deviceIds:scopedDeviceIds(),configs:workspace.configs,showTech:workspace.showTech,modules:selectedModules()}))throw Error('Device scope changed; please run the report again.');
  const review=stpKnowledgeV1Review(),preflight=stpV1Review();
  if(!window.NetworkSTPEngineeringV2)throw Error('STP V2 configuration reasoning engine is unavailable.');
  const engineering=window.NetworkSTPEngineeringV2.assess(workspace,selected);
  if(!window.NetworkSTPOperationalV1)throw Error('Operational evidence module is unavailable.');
  const operational=window.NetworkSTPOperationalV1.assess(workspace,selected);
  window.NetworkSTPOperationalV1.augment(engineering,operational);
  if(!window.NetworkSTPNetworkV2)throw Error('Multi-device STP correlation engine unavailable.');
  const network=window.NetworkSTPNetworkV2.analyze(workspace,selected);
  const result=window.NetworkSTPCTOReport.build($('stpCTOView'),review,preflight,db,$('language').value,engineering,network,operational);
  $('stpCTOStatus').textContent='STP V2 · '+network.deviceCount+' devices · '+operational.devices.filter(x=>x.present).length+' with verification CLI · '+network.findings.length+' network findings'+(operational.devices.some(x=>x.syntheticOnly)?' · SYNTHETIC LAB':'')+'.';
  activeSavedReport=null;reportGenerated=true;$('savedReportPreview').hidden=true;
  $('saveEngineeringReport').disabled=false;$('editEngineeringReport').disabled=false;
  $('reportStageStatus').textContent='Analysis complete. Open HTML View, export, edit reviewer notes, or save.';
  $('exportSTPCTO').disabled=false;$('viewSTPCTO').disabled=false;
  if(currentStep===3)navigateWorkflow(4);else refreshWorkflow();
 }catch(error){$('exportSTPCTO').disabled=true;$('viewSTPCTO').disabled=true;$('stpCTOView').replaceChildren();$('stpCTOStatus').textContent='CTO report error: '+error.message;message(error.message,true);}
};
$('viewSTPCTO').onclick=()=>{
 if($('viewSTPCTO').disabled)return;
 const view=activeSavedReport?$('savedReportPreview'):$('stpCTOView');
 view.hidden=!view.hidden;
 $('viewSTPCTO').textContent=view.hidden?'HTML View':'Hide HTML View';
 if(!view.hidden)view.scrollIntoView?.({block:'nearest',behavior:'smooth'});
};

function buildGenericReport(){
 if(!$('analysisResult').value.trim())return;
 const article=document.createElement('article');article.className='stp-design-paper';
 const title=document.createElement('h1');title.textContent='Network Engineering Assessment';
 const label=document.createElement('p');label.className='report-meta';
 label.textContent='Unverified AI-assisted engineering draft. Engineer approval and independent operational verification are required.';
 const body=document.createElement('pre');body.textContent=$('analysisResult').value;
 body.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:none';
 article.append(title,label,body);
 $('stpCTOView').replaceChildren(article);
 $('stpCTOView').hidden=true;
 $('viewSTPCTO').textContent='HTML View';
 $('viewSTPCTO').disabled=false;$('exportSTPCTO').disabled=false;
}
function getReportDocument(){
 const css="body{font-family:Arial,system-ui,sans-serif;color:#1b2933;background:#f0f3f6;max-width:1080px;margin:25px auto;padding:0 20px}.paper{background:white;border-radius:5px;padding:34px;box-shadow:0 10px 28px #0002;min-height:500px}.paper h1{font-size:26px;margin:8px 0}.paper h2{font-size:17px;border-bottom:1px solid #cad5dd;padding:0 0 5px;margin:26px 0 8px}.paper p,.paper li{font-size:12px;line-height:1.6}.report-meta{color:#506779;font-size:11px}.report-tag{color:#186595;font-weight:800;text-transform:uppercase;letter-spacing:.12em;font-size:10px}.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:18px 0}.metric{border:1px solid #cad6df;border-radius:7px;padding:10px}.metric b{display:block;font-size:20px}.metric span{display:block;font-size:10px;color:#586d79}.decision{border-left:3px solid #80abc4;background:#f5f9fc;padding:12px 14px;margin:12px 0;break-inside:avoid}.decision strong{font-size:13px;color:#153e58}.decision .choice{display:inline-block;margin-left:7px;color:#215f83;font-size:11px;font-weight:700}.decision p{margin:7px 0;color:#354e5e}.decision details{margin-top:9px;font-size:11px}.decision details a{display:block;padding:3px 0;overflow-wrap:anywhere}.report-footer{font-size:10px;color:#6c7c87;margin-top:30px}.cto-action{border-top:1px solid #d8e4ea;padding-top:8px}.cto-muted{color:#5f798b;font-size:11px}@media print{body{background:white;padding:0;margin:0}.paper{box-shadow:none;padding:12px}}";
 let reportHtml='';
 if($('stpCTOView').children.length){
  const report=$('stpCTOView').cloneNode(true);report.hidden=false;
  report.querySelectorAll('[data-evidence-upload]').forEach(button=>button.remove());
  reportHtml=report.outerHTML;
 }else{
  const section=document.createElement('section');section.className='paper';
  const title=document.createElement('h1');title.textContent='Network Engineering Analysis';section.append(title);
  const output=document.createElement('pre');output.textContent=$('analysisResult').value;section.append(output);
  reportHtml=section.outerHTML;
 }
 return '<!doctype html><html lang="'+($('language').value==='tr'?'tr':'en')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Network Engineering Assessment</title><style>'+css+'</style></head><body>'+reportHtml+'</body></html>';
}
$('exportSTPCTO').onclick=()=>{
 if(activeSavedReport){saveFile('network-assessment-saved.html',activeSavedReport.html,'text/html;charset=utf-8');return;}
 if($('exportSTPCTO').disabled||(!reportGenerated&&!$('stpCTOView').children.length))return;
 saveFile('network-configurator-engineering-assessment.html',getReportDocument(),'text/html;charset=utf-8');
};
function applyReviewerNotes(){
 if(!reportGenerated)return;
 const comment=$('reviewExecutiveComment').value.trim(),notes=$('reviewEngineeringNotes').value.trim();
 const current=$('stpCTOView').querySelector('[data-reviewer-notes]');
 if(current)current.remove();
 if(comment||notes){
  const paper=$('stpCTOView').querySelector('.stp-design-paper')||$('stpCTOView').firstElementChild;
  if(paper){
   const section=document.createElement('section');section.dataset.reviewerNotes='true';
   const head=document.createElement('h2');head.textContent='Reviewer Commentary (human-authored)';section.append(head);
   for(const [label,value] of [['Executive commentary',comment],['Engineering notes',notes]]){
    if(!value)continue;
    const title=document.createElement('strong');title.textContent=label;
    const text=document.createElement('p');text.textContent=value;
    text.style.whiteSpace='pre-wrap';section.append(title,text);
   }
   paper.append(section);
  }
 }
 $('reportEditPanel').hidden=true;
 $('reportStageStatus').textContent='Reviewer notes updated. Automated analysis and CLI evidence remain unchanged.';
}
$('editEngineeringReport').onclick=()=>{
 if($('editEngineeringReport').disabled||activeSavedReport)return;
 $('reportEditPanel').hidden=!$('reportEditPanel').hidden;
};
$('applyReportEdits').onclick=applyReviewerNotes;
const REPORT_KEY='networkConfigurator.aiAnalysis.savedReports.v1';
function savedReportRecords(){
 try{
  const raw=JSON.parse(localStorage.getItem(REPORT_KEY)||'[]');
  return Array.isArray(raw)?raw.filter(r=>typeof r.id==='string'&&typeof r.html==='string').slice(0,8):[];
 }catch{return [];}
}
function refreshSavedReports(){
 const target=$('reportSavedList'),before=target.value;
 target.replaceChildren();
 for(const item of savedReportRecords()){
  const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.title;target.append(opt);
 }
 if([...target.options].some(o=>o.value===before))target.value=before;
 $('openSavedReport').disabled=!target.options.length;
}
$('saveEngineeringReport').onclick=()=>{
 if(!reportGenerated||activeSavedReport)return;
 if(!window.confirm('Save a report that may contain device topology and CLI evidence in this browser? This is local storage, not Project Library or the main application.'))return;
 applyReviewerNotes();
 try{
  const html=getReportDocument();
  if(html.length>1700000)throw Error('Report is too large for browser storage. Download HTML instead.');
  const title='Network Assessment · '+new Date().toLocaleString()+' · '+scopedDeviceIds().length+' devices';
  const record={id:'analysis-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
   title,created:new Date().toISOString(),html,
   draft:$('analysisResult').value.slice(0,160000),
   module:selectedModules().join(', '),devices:scopedDeviceIds().map(id=>workspace.nodes.find(n=>n.id===id)?.hostname||id),
   notes:{executive:$('reviewExecutiveComment').value,engineering:$('reviewEngineeringNotes').value}};
  localStorage.setItem(REPORT_KEY,JSON.stringify([record,...savedReportRecords()].slice(0,5)));
  refreshSavedReports();$('reportSavedList').value=record.id;$('savedReportsPanel').open=true;
  $('reportStageStatus').textContent='Report saved to this browser. It is available in Saved reports. Use Download HTML for a portable copy.';
 }catch(e){message('Could not save report: '+e.message,true);}
};
$('openSavedReport').onclick=()=>{
 const record=savedReportRecords().find(r=>r.id===$('reportSavedList').value);
 if(!record)return message('Select a saved report.',true);
 activeSavedReport=record;
 const frame=$('savedReportPreview');frame.srcdoc=record.html;frame.hidden=false;
 $('stpCTOView').hidden=true;
 $('viewSTPCTO').disabled=false;$('viewSTPCTO').textContent='Hide HTML View';
 $('exportSTPCTO').disabled=false;
 $('saveEngineeringReport').disabled=true;$('editEngineeringReport').disabled=true;$('reportEditPanel').hidden=true;
 $('reportStageStatus').textContent='Saved report · '+record.title+' · read-only snapshot; CLI evidence cannot be changed.';
 navigateWorkflow(4);
};
refreshSavedReports();
function stpV1Review(){
 if(!window.NetworkSTPV1)throw Error('STP V1 parser is unavailable.');
 return window.NetworkSTPV1.assess(workspace,scopedDeviceIds());
}
$('runSTPPreflight').onclick=()=>{
 try{
  if(!selectedModules().includes('STP'))throw Error('Select STP scope first.');
  const review=stpV1Review();
  $('stpPreflightResult').textContent=window.NetworkSTPV1.format(review);
  message('STP V1 local preflight complete. Operational state and AI reasoning remain unverified.');
 }catch(error){message('STP V1: '+error.message,true);}
};
$('preview').onclick=()=>{
 try{
  const modules=selectedModules();if(!modules.length)throw Error('Select at least one analysis module.');
  const devices=scopedDeviceIds();if(!devices.length)throw Error('Select at least one device to analyze.');
  pendingBatches=api.analysisEvidenceBatches(workspace,devices);
  if(modules.includes('STP')){
   const review=stpV1Review();
   $('stpPreflightResult').textContent=window.NetworkSTPV1.format(review);
   const knowledge=stpKnowledgeV1Review();
   $('stpKnowledgeResult').textContent=window.NetworkSTPKnowledgeV1.format(knowledge);
   const statements=window.NetworkSTPKnowledgeV1.context(knowledge).slice(0,8).map((line,i)=>'L'+(i+1)+': '+line.slice(0,245));
   pendingBatches[0].unshift({id:'stp-knowledge-v1',text:'Device: STP-KNOWLEDGE-CATALOG\nCommand: version-scoped Cisco engineering context, NOT device evidence or model findings\n'+statements.join('\n')});

   const lines=window.NetworkSTPV1.evidence(review).slice(0,12).map((line,i)=>'L'+(i+1)+': '+line.slice(0,160));
   pendingBatches[0].unshift({id:'stp-v1-preflight',text:'Device: STP-V1-PREFLIGHT\nCommand: deterministic config comparison, not an AI answer key\n'+lines.join('\n')});
  }
  pendingBatches[0].unshift({id:'analysis-scope',text:'Device: ANALYSIS-SCOPE\nCommand: user-selected engineering review scope (intent, not operational evidence)\nL1: Analyze ONLY these engineering modules: '+modules.join(', ')+'\nL2: Analyze ONLY device IDs: '+devices.join(', ')+'; do not infer findings for unselected devices.\nL3: Do not perform unrelated module audits. Cross-module facts may be mentioned only when directly relevant to selected scope.\nL4: Assess proposed configurations as design intent, not deployed operational state.'});
  reviewedSignature=snapshot();runState={batches:pendingBatches,reports:[],modes:[],index:0,signature:reviewedSignature,synthesis:''};
  const previewText=pendingBatches.flat().map(e=>'## '+e.id+'\n'+e.text).join('\n\n');
  $('evidencePreview').textContent=previewText;$('evidenceDetails').open=true;
  $('analyze').disabled=false;$('downloadReport').disabled=true;
  message('Review '+pendingBatches.flat().length+' sanitized evidence items in '+pendingBatches.length+' batch(es) before sending.');
 }catch(e){message(e.message,true);$('analyze').disabled=true;}
};
function reportText(){
 const reports=runState?.reports||[];
 return '# AI Topology Engineering Analysis\n\nSelected modules: '+selectedModules().join(', ')+'\nSelected devices: '+scopedDeviceIds().map(id=>workspace.nodes.find(n=>n.id===id)?.hostname||id).join(', ')+'\nStatus: '+(runState?.modes.includes('deterministic-stp-offline')?'DETERMINISTIC STP CONFIGURATION REVIEW ONLY — NO AI MODEL WAS RUN; engineer review required':'Unverified AI-assisted draft; engineer review required')+'\nTopology: '+workspace.nodes.length+' devices / '+workspace.links.length+' connections\nBatches: '+reports.length+' / '+(runState?.batches.length||0)+'\n\n'+reports.join('\n\n')+(runState?.synthesis?'\n\n## Cross-batch synthesis — UNVERIFIED\n'+runState.synthesis:'');
}
async function reportOfflineSTP(reason){
 if(!isReviewed()||!runState)throw Error('Review the current device evidence before STP local analysis.');
 if(!selectedModules().includes('STP'))throw Error('STP module must be selected for local fallback.');
 const selected=scopedDeviceIds();
 if(!selected.length)throw Error('Select at least one STP device.');
 const preflight=stpV1Review(),catalog=stpKnowledgeV1Review();
 const lang=$('language').value;
 const title=lang==='tr'
  ?'STP V1 — YEREL KONFİGÜRASYON ANALİZİ (AI modeli ÇALIŞTIRILMADI)'
  :'STP V1 — LOCAL CONFIGURATION ANALYSIS (NO AI MODEL WAS RUN)';
 const notice=lang==='tr'
  ?'AI sağlayıcısı kullanılamıyor. Aşağıdaki bulgular kaynaklı ve deterministik ön kontroldür. Gerçek root/port durumları doğrulanmamıştır.'
  :'AI provider unavailable. Findings below are source-backed deterministic checks only. Actual root and port states are not verified.';
 const priorities=preflight.findings.filter(item=>item.code!=='INSUFFICIENT_COMPARABLE_EVIDENCE');
 const comparison=priorities.length?priorities.map(item=>
  '- ['+item.level.toUpperCase()+'] '+item.claim+'\n  Evidence: '+item.refs.join(' | ')+
  '\n  Verification: show spanning-tree root/detail on both devices before determining live root role.').join('\n\n'):
  (lang==='tr'?'İki cihazdan karşılaştırılabilir kök önceliği veya mod çelişkisi gözlenmedi. Bu, root durumunun doğru olduğunu kanıtlamaz.':
   'No explicit cross-device priority/mode contradiction observed. This does not prove the current root is correct.');
 runState.reports=[title+'\n\n'+notice+
  '\n\n## '+(lang==='tr'?'CORE-1 / CORE-2 KARŞILAŞTIRMASI':'CORE-TO-CORE COMPARISON')+'\n'+comparison+
  '\n\n'+window.NetworkSTPKnowledgeV1.format(catalog,lang)];
 runState.modes=['deterministic-stp-offline'];
 runState.index=0;runState.synthesis='';
 $('stpPreflightResult').textContent=window.NetworkSTPV1.format(preflight);
 $('stpKnowledgeResult').textContent=window.NetworkSTPKnowledgeV1.format(catalog);
 $('analysisResult').value=reportText();
 $('downloadReport').disabled=false;
 message((lang==='tr'?'Yalnız STP yerel konfigürasyon değerlendirmesi oluşturuldu. AI çalıştırılmadı. ':'Local STP configuration assessment generated; AI was not run. ')+reason);
 await $('runSTPCTO').onclick();
}
$('analyze').onclick=async()=>{
 if(busy)return;
 if(!isReviewed()||!runState)return message('Topology changed. Review the evidence again before sending.',true);
 busy=true;$('analyze').disabled=true;
 try{
  const statusRes=await fetch('/api/ai/status');if(!statusRes.ok)throw Error('AI service status unavailable.');
  const available=await statusRes.json();if(!available.available){if(selectedModules().includes('STP')){await reportOfflineSTP('AI provider is not configured.');return;}throw Error('AI provider is not configured. Local STP review is available when STP is selected.');}
  if(['groq','openai'].includes(available.provider)&&
     !window.confirm('This sends the reviewed, redacted topology/configuration evidence to the external '+available.provider+' model provider. Confirm that you are authorized to share this data. Continue?')){
    message('External model transfer cancelled. No evidence was submitted.');
    return;
  }
  const vendors=[...new Set(workspace.nodes.filter(n=>selectedDeviceIds.has(n.id)).map(n=>n.vendor).filter(Boolean))],vendor=vendors.length===1?vendors[0]:'Mixed';
  const stop=Math.min(runState.batches.length,runState.index+12);
  for(;runState.index<stop;){
   const i=runState.index;
   message('Analyzing batch '+(i+1)+' of '+runState.batches.length+'…');
   const response=await fetch('/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({module:selectedModules().length===1&&selectedModules()[0]==='STP'?'STP_ANALYSIS':'CLI_ANALYSIS',vendor,language:$('language').value,task:'report',evidence:runState.batches[i]})});
   const result=await response.json();if(!response.ok)throw Error('Batch '+(i+1)+': '+(result.detail||'model request failed'));
   const unverified=result.mode!=='model-evidence-cited-draft';
   runState.reports.push('## Batch '+(i+1)+' — '+(unverified?'NOT VERIFIED / EVIDENCE ONLY':'Citations syntactically checked; engineering claims unverified')+'\n'+result.text);
   runState.modes.push(result.mode);
   runState.index++;
   $('analysisResult').value=reportText();
  }
  const more=runState.index<runState.batches.length;
  if(!more&&runState.reports.length>1&&!runState.synthesis){
   if(runState.modes.some(mode=>mode!=='model-evidence-cited-draft')){
    runState.synthesis='Not attempted: one or more batches lack valid model evidence citations. The individual observations must be reviewed first.';
   }else{
    try{
     let nodes=runState.reports.map((text,i)=>({id:'batch-'+(i+1),text:text.slice(0,2600)})),round=0;
     while(nodes.length>1&&round<6){
      const next=[];
      for(let i=0;i<nodes.length;i+=12){
       const group=nodes.slice(i,i+12);
       if(group.length===1){next.push(group[0]);continue;}
       message('Cross-batch synthesis pass '+(round+1)+'…');
       const response=await fetch('/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({module:'CLI_SYNTHESIS',vendor,language:$('language').value,task:'report',evidence:group})});
       const result=await response.json();
       if(!response.ok||result.mode!=='cross-batch-unverified-synthesis')throw Error('Synthesis unavailable');
       next.push({id:'synthesis-'+round+'-'+i,text:result.text.slice(0,2600)});
      }
      nodes=next;round++;
     }
     runState.synthesis=nodes.length===1?nodes[0].text:'Synthesis could not cover all batches.';
    }catch(e){runState.synthesis='Synthesis unavailable: '+e.message+'. No cross-batch root cause has been established.';}
   }
   $('analysisResult').value=reportText();
  }
  $('analyze').textContent=more?'Continue remaining batches':'Analyze reviewed evidence';
  $('downloadReport').disabled=false;
  if(runState.reports.length){
   activeSavedReport=null;reportGenerated=true;buildGenericReport();$('saveEngineeringReport').disabled=false;$('editEngineeringReport').disabled=false;
   $('reportStageStatus').textContent=more?'Partial analysis — additional batches remain.':'Analysis draft ready for engineering review.';
   if(!more&&currentStep===3)navigateWorkflow(4);else refreshWorkflow();
  }
  message(more?'Partial analysis: '+runState.index+' / '+runState.batches.length+' batches. Continue to cover all evidence.':'All batches submitted. Cross-batch root cause is NOT independently established. Validate the report before use.');
 }catch(e){message(e.message,true);}
 finally{busy=false;$('analyze').disabled=!isReviewed();}
};
$('downloadReport').onclick=()=>{
 if(!$('analysisResult').value.trim())return;
 saveFile('ai-topology-assessment.txt',$('analysisResult').value,'text/plain');
};
refreshBrowserProjects();fromHandoff();render();loadDevice();loadLink();loadConfig();
// Populate Project Library choices on first entry without requiring manual refresh.
$('refreshSavedDesign').click();
})();