(()=>{'use strict';
const $=id=>document.getElementById(id),api=window.NetworkAITopology;
if(!api)return;
const handoff='networkConfigurator.aiTopology.pending';
let workspace=api.blank(),pendingBatches=null,reviewedSignature=null,runState=null,busy=false;
const clean=x=>String(x??'').trim(),snapshot=()=>JSON.stringify(workspace),isReviewed=()=>reviewedSignature===snapshot();
function message(value,error=false){$('status').textContent=value;$('status').dataset.error=String(error);}
function makeOption(id,name){const opt=document.createElement('option');opt.value=id;opt.textContent=name;return opt;}
function populate(select,values,preserve,blank){
 select.replaceChildren();
 if(blank)select.append(makeOption('','New'));
 for(const [id,label] of values)select.append(makeOption(id,label));
 select.value=values.some(x=>x[0]===preserve)?preserve:(blank?'':values[0]?.[0]||'');
}
function invalidate(){reviewedSignature=null;pendingBatches=null;runState=null;$('analyze').disabled=true;$('downloadReport').disabled=true;$('evidencePreview').textContent='';$('analysisResult').value='';}
function draw(){
 const svg=$('topologyCanvas');svg.replaceChildren();
 const NS='http://www.w3.org/2000/svg',points=new Map(),n=workspace.nodes.length;
 workspace.nodes.forEach((node,i)=>{const angle=-Math.PI/2+i*2*Math.PI/Math.max(n,1),radius=n===1?0:Math.min(145,65+n*12);points.set(node.id,{x:400+Math.cos(angle)*radius*1.65,y:180+Math.sin(angle)*radius});});
 function element(tag,attrs){const x=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))x.setAttribute(k,String(v));svg.append(x);return x;}
 for(const link of workspace.links){
  const a=points.get(link.a),b=points.get(link.b);if(!a||!b)continue;
  const line=element('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'link','stroke-dasharray':link.logical?'6 5':'none'});
  line.setAttribute('aria-label',link.id+' '+link.kind);
  const label=element('text',{x:(a.x+b.x)/2,y:(a.y+b.y)/2-10,'text-anchor':'middle'});label.textContent=link.kind||link.id;
 }
 for(const node of workspace.nodes){
  const p=points.get(node.id);element('circle',{cx:p.x,cy:p.y,r:41,class:'node'});
  const name=element('text',{x:p.x,y:p.y-2,'text-anchor':'middle'});name.textContent=node.hostname.slice(0,18);
  const vendor=element('text',{x:p.x,y:p.y+15,'text-anchor':'middle'});vendor.textContent=node.vendor.slice(0,20);vendor.setAttribute('font-size','11');
 }
}
function render(){
 const devs=workspace.nodes.map(n=>[n.id,n.hostname||n.id]),links=workspace.links.map(l=>[l.id,l.id+' · '+l.kind]);
 populate($('deviceSelect'),devs,$('deviceSelect').value,true);
 populate($('linkSelect'),links,$('linkSelect').value,true);
 populate($('linkA'),devs,$('linkA').value,false);
 populate($('linkB'),devs,$('linkB').value,false);
 populate($('configDevice'),devs,$('configDevice').value,false);
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
}
function changed(label){invalidate();$('structuralResult').textContent='Topology changed. Re-run structural analysis.';render();message(label+' Your original Design project was not modified.');}
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
function saveFile(name,text,type){
 const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function fromHandoff(){
 const handoffRaw=sessionStorage.getItem(handoff);
 if(!handoffRaw){
  message('Boş AI çalışma alanı açıldı. Mevcut Design topolojisini aktarmak için projeye dönüp “AI Analizine Gönder” seçeneğini kullanın.');
  return;
 }
 sessionStorage.removeItem(handoff);
 try{
  const report=JSON.parse(handoffRaw);
  workspace=report?.schema==='ai-topology-workspace-v1'?api.validate(report):api.fromDesign(report);
  const project=workspace.sourceProjectName?workspace.sourceProjectName+' · ':'';
  $('sourceLabel').textContent='Imported Design · '+project+(workspace.sourceModule||'')+' · independent copy';
  message('Mevcut '+project+(workspace.sourceModule||'')+' Design aktarıldı: '+workspace.nodes.length+' cihaz, '+workspace.links.length+' bağlantı, '+workspace.configs.length+' konfigürasyon. Analizden önce gizlenmiş kanıtları inceleyin.');
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
 try{workspace=api.template($('template').value);$('sourceLabel').textContent='Template · independent copy';changed('Template loaded.');loadDevice();loadLink();loadConfig();}
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
 if(workspace.configs.some(c=>c.text)&&!window.confirm('Saved JSON includes raw configurations and may contain credentials. Download it to your device?'))return;
 saveFile('network-ai-topology.json',JSON.stringify(workspace,null,2),'application/json');
 message('Workspace downloaded to this device. No cloud project was changed.');
};
$('importWorkspace').onchange=async()=>{
 const file=$('importWorkspace').files[0];if(!file)return;
 if(file.size>2000000)return message('Maximum workspace JSON size is 2 MB.',true);
 if((workspace.nodes.length||workspace.configs.length)&&!window.confirm('Replace the current topology?'))return;
 try{workspace=api.validate(JSON.parse(await file.text()));$('sourceLabel').textContent='Imported saved workspace';changed('Saved workspace imported.');loadDevice();loadLink();loadConfig();}
 catch(e){message('Invalid workspace file: '+e.message,true);}
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
$('preview').onclick=()=>{
 try{
  pendingBatches=api.analysisEvidenceBatches(workspace);
  reviewedSignature=snapshot();runState={batches:pendingBatches,reports:[],modes:[],index:0,signature:reviewedSignature,synthesis:''};
  const previewText=pendingBatches.flat().map(e=>'## '+e.id+'\n'+e.text).join('\n\n');
  $('evidencePreview').textContent=previewText;$('evidenceDetails').open=true;
  $('analyze').disabled=false;$('downloadReport').disabled=true;
  message('Review '+pendingBatches.flat().length+' sanitized evidence items in '+pendingBatches.length+' batch(es) before sending.');
 }catch(e){message(e.message,true);$('analyze').disabled=true;}
};
function reportText(){
 const reports=runState?.reports||[];
 return '# AI Topology Engineering Analysis\n\nStatus: Unverified AI-assisted draft; engineer review required\nTopology: '+workspace.nodes.length+' devices / '+workspace.links.length+' connections\nBatches: '+reports.length+' / '+(runState?.batches.length||0)+'\n\n'+reports.join('\n\n')+(runState?.synthesis?'\n\n## Cross-batch synthesis — UNVERIFIED\n'+runState.synthesis:'');
}
$('analyze').onclick=async()=>{
 if(busy)return;
 if(!isReviewed()||!runState)return message('Topology changed. Review the evidence again before sending.',true);
 busy=true;$('analyze').disabled=true;
 try{
  const statusRes=await fetch('/api/ai/status');if(!statusRes.ok)throw Error('AI service status unavailable.');
  const available=await statusRes.json();if(!available.available)throw Error('AI provider is not configured. Topology editing and local export remain available.');
  if(['groq','openai'].includes(available.provider)&&
     !window.confirm('This sends the reviewed, redacted topology/configuration evidence to the external '+available.provider+' model provider. Confirm that you are authorized to share this data. Continue?')){
    message('External model transfer cancelled. No evidence was submitted.');
    return;
  }
  const vendors=[...new Set(workspace.nodes.map(n=>n.vendor).filter(Boolean))],vendor=vendors.length===1?vendors[0]:'Mixed';
  const stop=Math.min(runState.batches.length,runState.index+12);
  for(;runState.index<stop;){
   const i=runState.index;
   message('Analyzing batch '+(i+1)+' of '+runState.batches.length+'…');
   const response=await fetch('/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({module:'CLI_ANALYSIS',vendor,language:$('language').value,task:'report',evidence:runState.batches[i]})});
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
  message(more?'Partial analysis: '+runState.index+' / '+runState.batches.length+' batches. Continue to cover all evidence.':'All batches submitted. Cross-batch root cause is NOT independently established. Validate the report before use.');
 }catch(e){message(e.message,true);}
 finally{busy=false;$('analyze').disabled=!isReviewed();}
};
$('downloadReport').onclick=()=>{
 if(!$('analysisResult').value.trim())return;
 saveFile('ai-topology-assessment.txt',$('analysisResult').value,'text/plain');
};
fromHandoff();render();loadDevice();loadLink();loadConfig();
})();