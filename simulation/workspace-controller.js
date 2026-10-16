(function(){'use strict';
if(new URLSearchParams(location.search).get('workspace')!=='1')return;
const $=id=>document.getElementById(id),engine=window.WorkspaceSimulationEngine;
let context,model,current,records=[],policies={},state={devices:[],links:[]},source,target,preferredRoot,offeredRate=100;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.NetworkLab={model:()=>model||{nodes:[],links:[]},scenarioRecords:()=>records};
try{context=JSON.parse(sessionStorage.getItem('networkConfigurator.lab.workspace')||'null');if(context?.schema!=='network-configurator-workspace-simulation-v1')throw Error('Open a Technology Workspace and choose Test in Simulation.');model=engine.normalize(context);}catch(e){$('syntheticStatus').textContent=e.message;document.querySelectorAll('#labWorkspace button').forEach(b=>b.disabled=true);return;}
const displayVendor=({'Huawei_CE_SW':'Huawei CloudEngine'}[model.vendor]||model.vendor);
const name=id=>model.nodes.find(n=>n.id===id)?.hostname||id;
const linkName=l=>l.kind+' · '+name(l.a)+' ↔ '+name(l.b)+([l.upperPort||l.aPort,l.lowerPort||l.bPort].filter(Boolean).length?' · '+[l.upperPort||l.aPort,l.lowerPort||l.bPort].filter(Boolean).join(' ↔ '):'');
const pathText=p=>p?p.nodes.map(name).join(' → '):'No modeled path';
source=model.nodes.find(n=>n.tier==='lower'&&!n.external)?.id||model.nodes[0].id;target=model.nodes.find(n=>n.tier==='upper'&&n.id!==source)?.id||model.nodes.at(-1).id;
preferredRoot=model.settings.preferredRoot;
const recordKey='networkConfigurator.simulation.records.'+JSON.stringify([context.projectId,model.module,model.vendor,model.nodes.map(n=>[n.id,n.hostname]),model.links,model.settings]);
try{records=JSON.parse(sessionStorage.getItem(recordKey)||'[]').slice(-40);}catch{records=[];}
function cleanSvg(raw){
 const doc=new DOMParser().parseFromString(raw||'','image/svg+xml'),svg=doc.documentElement;
 if(svg.localName!=='svg'||doc.querySelector('parsererror'))throw Error('The current workspace topology is unavailable. Return to design and transfer it again.');
 const tags=new Set(['svg','g','defs','linearGradient','radialGradient','stop','rect','path','line','polyline','polygon','circle','ellipse','text','tspan','title','desc']);
 for(const n of [svg,...svg.querySelectorAll('*')]){if(!tags.has(n.localName)){n.remove();continue;}for(const a of [...n.attributes])if(/^on/i.test(a.name)||/href/i.test(a.name)||/javascript:|https?:|data:|expression|@import/i.test(a.value)||(/url\s*\(/i.test(a.value)&&!/^url\(["']?#[\w-]+["']?\)$/.test(a.value)&&a.name!=='style'))n.removeAttribute(a.name);
  for(const property of Array.from(n.style)){const value=n.style.getPropertyValue(property);if(/url\s*\(|expression|@import/i.test(value))n.style.removeProperty(property);}
 }
 return svg;
}
let original;
try{original=cleanSvg(context.topologySvg);}catch(e){$('syntheticStatus').textContent=e.message;return;}
function draw(){
 const map=$('labMap'),copy=original.cloneNode(true),points=new Map();map.replaceChildren(...[...copy.childNodes].map(n=>document.importNode(n,true)));map.setAttribute('viewBox',copy.getAttribute('viewBox')||'0 0 950 450');map.dataset.source='design';
 for(const n of model.nodes){const label=[...map.querySelectorAll('text')].find(t=>t.textContent.trim()===n.hostname);if(!label)continue;
  let x=Number(label.getAttribute('x')),y=Number(label.getAttribute('y'));
  if(label.getCTM&&map.getCTM&&map.createSVGPoint){try{const p=map.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(label.getCTM()).matrixTransform(map.getCTM().inverse());x=q.x;y=q.y;}catch{}}
  if(Number.isFinite(x)&&Number.isFinite(y))points.set(n.id,{x,y});
  let g=label.closest('g');if(!g||g===map||model.nodes.filter(other=>other.id!==n.id).some(other=>[...g.querySelectorAll('text')].some(t=>t.textContent.trim()===other.hostname))){g=label;}
  g.dataset.device=n.id;g.style.cursor='pointer';g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-label',name(n.id)+(state.devices.includes(n.id)?' · failed':''));
  if(state.devices.includes(n.id)){g.style.opacity='.35';const shape=g.querySelector('rect');if(shape){shape.style.stroke='#c93b4f';shape.style.strokeWidth='4';}}
 }
 const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'g');overlay.dataset.simulationOverlay='true';
 const selected=new Set(current?.path?.links||[]);
 for(const l of model.links){const a=points.get(l.a),b=points.get(l.b);if(!a||!b||a.x===b.x&&a.y===b.y)continue;
  const down=state.links.includes(l.id)||[l.a,l.b].some(id=>state.devices.includes(id));if(!down&&!selected.has(l.id))continue;
  const line=document.createElementNS(ns,'line');for(const [key,value]of Object.entries({x1:a.x,y1:a.y+10,x2:b.x,y2:b.y+10,stroke:down?'#c93b4f':'#14865f','stroke-width':4,'stroke-dasharray':down?'7 5':'10 7',opacity:'.9'}))line.setAttribute(key,value);
  line.dataset.labLink=l.id;line.style.cursor='pointer';if(!down)line.classList.add('synthetic-flow');const title=document.createElementNS(ns,'title');title.textContent=linkName(l)+(down?' · FAILED':' · Selected path');line.append(title);overlay.append(line);
  if(!down){const ids=current.path.nodes,forward=ids.indexOf(l.a)<ids.indexOf(l.b),from=forward?a:b,to=forward?b:a,angle=Math.atan2(to.y-from.y,to.x-from.x),mx=(from.x+to.x)/2,my=(from.y+to.y)/2+10,arrow=document.createElementNS(ns,'polyline');arrow.setAttribute('points',[[-8,-6],[0,0],[-8,6]].map(([x,y])=>[mx+x*Math.cos(angle)-y*Math.sin(angle),my+x*Math.sin(angle)+y*Math.cos(angle)].join(',')).join(' '));arrow.setAttribute('fill','none');arrow.setAttribute('stroke','#14865f');arrow.setAttribute('stroke-width','3');overlay.append(arrow);}
 }
 map.append(overlay);

}
const fill=(select,nodes)=>{select.replaceChildren(...nodes.map(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.hostname;return o;}));};
const traffic=$('wbFailuresPanel').querySelector('.traffic-view');traffic.innerHTML='<label>Source device<select id="workspaceSource"></select></label><label>Destination device<select id="workspaceTarget"></select></label><p id="workspaceScope" class="gateway-status" role="status"></p>';
fill($('workspaceSource'),model.nodes);fill($('workspaceTarget'),model.nodes);$('workspaceSource').value=source;$('workspaceTarget').value=target;
$('workspaceSource').onchange=()=>{source=$('workspaceSource').value;render();};$('workspaceTarget').onchange=()=>{target=$('workspaceTarget').value;render();};
const heading=$('wbFailuresPanel').querySelector('h2');heading.textContent='Traffic & failure scenarios';
$('wbFailuresPanel').querySelector('p:not([id])').textContent='Select one or more devices or connections. Failures accumulate until restored; restoring selected items clears their checkmarks.';
const policyPanel=$('wbPoliciesPanel');policyPanel.replaceChildren();
const title=document.createElement('h2');title.textContent=model.technology+' · Simulation parameters';policyPanel.append(title);
const settingsHost=document.createElement('div');policyPanel.append(settingsHost);
const details=document.createElement('p');details.id='workspaceAssumptions';policyPanel.append(details);
function numberControl(label,value,min,max,change){const wrap=document.createElement('label'),input=document.createElement('input');wrap.textContent=label;input.type='number';input.value=value;input.min=min;input.max=max;input.step='1';input.onchange=()=>{const v=Number(input.value);if(!input.value.trim()||!Number.isInteger(v)||v<min||v>max){input.setCustomValidity('Enter an integer from '+min+' to '+max);input.reportValidity();return;}input.setCustomValidity('');change(v);render();};wrap.append(input);settingsHost.append(wrap);return input;}
if(model.module==='OSPF')for(const l of model.links)numberControl(linkName(l)+' · OSPF cost',l.cost||10,1,65535,v=>{policies[l.id]=v;});
if(model.module==='QOS')numberControl('Offered traffic (Mbps)',100,0,10000000,v=>{offeredRate=v;});
if(model.module==='STP'){const label=document.createElement('label'),select=document.createElement('select');label.textContent='Preferred root';fill(select,model.nodes);select.value=preferredRoot;select.onchange=()=>{preferredRoot=select.value;render();};label.append(select);settingsHost.append(label);}
let direction='outbound',bgpSource=model.bgp?.nodes.find(n=>n.id.startsWith('ce'))?.id,bgpTarget=bgpSource;
if(model.module==='BGP'){
 $('workspaceSource').parentElement.firstChild.textContent='Outbound CE ';$('workspaceTarget').parentElement.firstChild.textContent='Inbound prefix owner ';
 const label=document.createElement('label'),select=document.createElement('select');label.textContent='Traffic direction';select.innerHTML='<option value="outbound">Outbound · Local Preference</option><option value="inbound">Inbound · AS-path prepend</option>';select.onchange=()=>{direction=select.value;render();};label.append(select);settingsHost.append(label);
 for(const l of model.bgp.links.filter(l=>[l.a,l.b].some(n=>n.startsWith('isp')))){policies[l.id]={localPreference:l.localPreference,prependCount:l.prependCount||0};numberControl(l.id+' · Local Preference',l.localPreference,0,4294967295,v=>{policies[l.id].localPreference=v;});numberControl(l.id+' · AS-path prepend',l.prependCount||0,0,10,v=>{policies[l.id].prependCount=v;});}
 $('workspaceSource').onchange=()=>{source=$('workspaceSource').value;bgpSource=source;render();};$('workspaceTarget').onchange=()=>{target=$('workspaceTarget').value;bgpTarget=target;render();};
 fill($('workspaceSource'),model.nodes.filter(n=>n.id.startsWith('ce')));fill($('workspaceTarget'),model.nodes.filter(n=>n.id.startsWith('ce')));source=bgpSource;target=bgpTarget;$('workspaceSource').value=source;$('workspaceTarget').value=target;
}
if(!settingsHost.children.length){const p=document.createElement('p');p.textContent='Parameters and fault domains are imported from the current design. Use Failures to compare baseline and changed availability.';settingsHost.append(p);}
const inputDefaults=[...settingsHost.querySelectorAll('input,select')].map(input=>[input,input.value]);
const resetPolicy=document.createElement('button');resetPolicy.textContent='Restore design parameters';resetPolicy.onclick=()=>{policies={};if(model.bgp)for(const l of model.bgp.links)policies[l.id]={localPreference:l.localPreference,prependCount:l.prependCount||0};offeredRate=100;preferredRoot=model.settings.preferredRoot;for(const [input,value]of inputDefaults)input.value=value;direction='outbound';render();};policyPanel.append(resetPolicy);
let vendorFindings=[];
function options(){return {source,target,preferredRoot,offeredRate,costs:model.module==='OSPF'?policies:{},policies:model.module==='BGP'?policies:null,direction,bgpSource,bgpTarget};}
function choices(kind){const isDevice=kind==='devices',select=$(isDevice?'syntheticNode':'syntheticLink'),host=$(isDevice?'syntheticDeviceChoices':'syntheticLinkChoices'),items=isDevice?model.nodes:model.links,selection=new Set([...select.selectedOptions].map(o=>o.value));select.replaceChildren();host.replaceChildren();
 for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=isDevice?item.hostname:linkName(item);option.selected=selection.has(item.id);select.append(option);const label=document.createElement('label');label.className='wb-device-choice'+(state[kind].includes(item.id)?' is-failed':'');const input=document.createElement('input');input.type='checkbox';input.value=item.id;input.checked=option.selected;input.onchange=()=>{option.selected=input.checked;selectionText(kind);};const text=document.createElement('span');text.className='device-name';text.textContent=option.textContent;const status=document.createElement('span');status.className='device-state';status.textContent=state[kind].includes(item.id)?'FAILED':'Available';label.append(input,text,status);host.append(label);}
 select.onchange=()=>choices(kind);selectionText(kind);
}
function selectionText(kind){const isDevice=kind==='devices',count=$(isDevice?'syntheticNode':'syntheticLink').selectedOptions.length;$(isDevice?'syntheticDeviceSelection':'syntheticLinkSelection').textContent=count+' selected · Fail or restore together.';}
function action(kind,restore){const select=$(kind==='devices'?'syntheticNode':'syntheticLink'),ids=[...select.selectedOptions].map(o=>o.value),next=new Set(state[kind]);for(const id of ids)restore?next.delete(id):next.add(id);state[kind]=[...next];if(restore)for(const o of select.options)if(ids.includes(o.value))o.selected=false;render();}
for(const [id,kind,restore]of [['syntheticNodeDown','devices',false],['syntheticNodeUp','devices',true],['syntheticLinkDown','links',false],['syntheticLinkUp','links',true]])$(id).onclick=()=>action(kind,restore);
$('syntheticReset').onclick=()=>{state={devices:[],links:[]};for(const id of ['syntheticNode','syntheticLink'])for(const o of $(id).options)o.selected=false;render();};
if(model.module==='VPC'){
 const presets=document.createElement('div');presets.className='lab-actions';presets.setAttribute('aria-label','Vendor failure scenarios');
 const peer=model.links.filter(l=>/Peer-link|SVL|Stack interconnect/i.test(l.kind)).map(l=>l.id),live=model.links.filter(l=>/keepalive|DAD|DFS|MAD/i.test(l.kind)).map(l=>l.id),control=model.links.filter(l=>/peer control/i.test(l.kind)).map(l=>l.id);
 const add=(label,devices=[],links=[])=>{if(!devices.length&&!links.length)return;const b=document.createElement('button');b.textContent=label;b.onclick=()=>{state.devices=[...new Set([...state.devices,...devices])];state.links=[...new Set([...state.links,...links])];render();};presets.append(b);};
 add('Fail all peer / stack links',[],peer);add('Fail liveness / DAD',[],live);if(peer.length&&live.length)add('Fail peer links + liveness',[],[...peer,...live]);add('Fail MLAG control session',[],control);
 const peers=model.nodes.filter(n=>n.tier==='upper').slice(0,2);for(const n of peers)add('Fail '+n.hostname,[n.id]);add('Fail both peers',peers.map(n=>n.id));$('resetFault').before(presets);
}
function render(){
 current=engine.evaluate(model,state,options());choices('devices');choices('links');draw();
 const status=model.technology+' · '+displayVendor+' · '+current.status.toUpperCase()+' · '+state.devices.length+' device / '+state.links.length+' connection failure(s)';$('syntheticStatus').textContent=status;
 const warnings=[...current.findings,...vendorFindings];$('workspaceScope').textContent=current.notes.join(' ');details.textContent=current.notes.join(' ')+(warnings.length?' '+warnings.map(f=>f.description).join(' '):'');
 const row=document.createElement('tr');for(const text of [name(source),pathText(current.baseline),pathText(current.path),model.module==='BGP'?(direction==='inbound'?'Shortest advertised AS path':'Highest Local Preference'):model.module==='STP'?'Root: '+name(current.root):model.module==='OSPF'?'Cost: '+(current.path?.cost??'—'):model.module==='QOS'?JSON.stringify(current.qos):model.technology,current.status+(warnings.length?' · '+warnings.map(f=>f.code).join(', '):'')]){const td=document.createElement('td');td.textContent=text;row.append(td);}$('syntheticRoutes').replaceChildren(row);
 $('labSource').textContent='Current Technology Workspace · '+model.technology+' · '+displayVendor;$('labNotice').textContent='Design simulation · No virtual devices or live commands running.';
 $('labEvidence').textContent=JSON.stringify({...current,failures:state},null,2);updateRecords();document.dispatchEvent(new Event('network-lab-updated'));
 if(model.module==='VPC')updateVendor();
}
let vendorEngine=null,lastVendorSignature='';
function updateVendor(){
 if(!vendorEngine)return;const signature=JSON.stringify(state);if(signature===lastVendorSignature)return;lastVendorSignature=signature;
 const mapped=/iStack/i.test(model.vendor)?null:/Arista/.test(model.vendor)?'Arista EOS':/Huawei/.test(model.vendor)?'Huawei CloudEngine':/IOS-XE/.test(model.vendor)?'Cisco_StackWise':'Cisco NX-OS';if(!mapped)return;
 const peers=model.links.filter(l=>/peer-link|SVL/i.test(l.kind)),live=model.links.filter(l=>/keepalive|DAD|DFS/i.test(l.kind)),failed=[];
 if(state.devices.includes('upper-1'))failed.push('nodeA');if(state.devices.includes('upper-2'))failed.push('nodeB');
 const up=l=>!state.links.includes(l.id)&&![l.a,l.b].some(id=>state.devices.includes(id));
 peers.forEach((l,i)=>{if(!up(l))failed.push('peerLink'+(i+1));});if(peers.length&&!peers.some(up))failed.push('peerLink');if(live.length&&!live.some(up))failed.push('keepalive');
 vendorFindings=vendorEngine.analyzeMlagFailure({vendor:mapped,failed,peerLinkMemberCount:peers.length}).findings.filter(f=>f.code!=='HEALTHY');render();
}
if(model.module==='VPC')import('/simulation/vendor-failure-engine.mjs').then(api=>{vendorEngine=api;updateVendor();}).catch(()=>{$('labNotice').textContent='Vendor-specific analysis unavailable. Physical model remains available; reload to retry.';});
function snapshot(){const svg=$('labMap').cloneNode(true);svg.setAttributeNS('http://www.w3.org/2000/xmlns/','xmlns','http://www.w3.org/2000/svg');return new XMLSerializer().serializeToString(svg);}
function updateRecords(){
 const rows=records.map(s=>{const tr=document.createElement('tr');for(const text of [s.createdAt,s.module+' · '+s.vendor,'Synthetic design model',s.currentPath,s.modelStatus]){const td=document.createElement('td');td.textContent=text;tr.append(td);}return tr;});$('labResultRows').replaceChildren(...rows);
 for(const id of ['simulationPdf','simulationWord','labSendEvidence','labContinueReport'])$(id).disabled=!records.length;
 $('labResultStatus').textContent=records.length+' scenario(s) recorded.';$('wbRecordCount').textContent=records.length;$('simulationExportStatus').textContent=records.length?'Recorded snapshots ready for PDF / Word export.':'Record a scenario first.';
}
$('syntheticRecord').onclick=()=>{const warnings=[...current.findings,...vendorFindings];const scenario={id:crypto.randomUUID(),createdAt:new Date().toISOString(),module:model.module,vendor:displayVendor,technology:model.technology,modelScope:current.notes.join(' '),modelStatus:current.status,findings:warnings.map(f=>f.description),direction:model.module==='BGP'?direction:'outbound',clientPrefix:'',preferredGateway:'',activeGateway:'',backupGateway:'',internetEntry:'',sourceDevice:name(source),targetDevice:name(target),failedDevices:state.devices.map(name),failedLinks:state.links.map(id=>linkName(model.links.find(l=>l.id===id))),baselinePath:pathText(current.baseline),currentPath:pathText(current.path),reachable:current.status==='reachable',pathChanged:JSON.stringify(current.baseline)!==JSON.stringify(current.path),gatewayChanged:false,policies:model.module==='BGP'?Object.entries(policies).filter(([id])=>id.startsWith('wan')).map(([connection,p])=>({connection,...p})):[],topologySvg:snapshot()};
 records.push(JSON.parse(JSON.stringify(scenario)));records=records.slice(-40);sessionStorage.setItem(recordKey,JSON.stringify(records));updateRecords();document.dispatchEvent(new Event('network-lab-scenarios-updated'));
};
$('labClear').onclick=()=>{records=[];sessionStorage.removeItem(recordKey);updateRecords();document.dispatchEvent(new Event('network-lab-scenarios-updated'));};
function attach(){
 let report;try{report=JSON.parse(sessionStorage.getItem('networkConfigurator.report.current')||'null');}catch{}
 if(report?.source?.projectId!==context.projectId||report?.source?.module!==model.module||report?.vendor!==context.report.vendor||report?.source?.generatedAt!==context.report.source.generatedAt)report=JSON.parse(JSON.stringify(context.report));
 const combined=new Map((report.simulationScenarios||[]).map(s=>[s.id,s]));for(const s of records)combined.set(s.id,s);report.simulationScenarios=[...combined.values()].slice(-40);sessionStorage.setItem('networkConfigurator.report.current',JSON.stringify(report));$('labResultStatus').textContent=records.length+' scenario(s) attached to '+model.technology+' report.';
}
$('labSendEvidence').onclick=attach;$('labContinueReport').onclick=()=>{attach();location.assign('/reporting?from=simulation');};
const payload=()=>({name:(context.report.name||model.technology)+' simulation',language:$('simulationLanguage').value,scenarios:records});
$('simulationPdf').onclick=()=>{try{window.SimulationReport.print(payload());}catch(e){$('simulationExportStatus').textContent=e.message;}};
$('simulationWord').onclick=async()=>{try{await window.SimulationReport.word(payload());$('simulationExportStatus').textContent='Word report downloaded.';}catch(e){$('simulationExportStatus').textContent=e.message;}};
$('labImport').onclick=()=>location.reload();
$('syntheticRun').onclick=()=>{$('labEvidence').textContent=JSON.stringify(current,null,2);};
document.querySelector('header .badge').textContent=model.technology+' · '+displayVendor+' · Synthetic simulation';
$('wbPolicies').textContent='Parameters';
for(const legend of document.querySelectorAll('.synthetic-legend'))legend.textContent='Green arrows: selected modeled path · Red dashed: failed connections · Dimmed label: failed device';
render();
})();
