(function(){'use strict';
if(new URLSearchParams(location.search).get('workspace')!=='1')return;
const $=id=>document.getElementById(id),engine=window.WorkspaceSimulationEngine;
let context,model,current,records=[],policies={},state={devices:[],links:[]},source,target,preferredRoot,offeredRate=100;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.NetworkLab={model:()=>model||{nodes:[],links:[]},scenarioRecords:()=>records,ensureScenario:()=>{if(!current)throw Error('The simulation model is invalid.');if(!records.some(s=>s.stateKey===scenarioStateKey()))$('syntheticRecord').click();}};
try{context=JSON.parse(sessionStorage.getItem('networkConfigurator.lab.workspace')||'null');if(context?.schema!=='network-configurator-workspace-simulation-v1')throw Error('Open a Technology Workspace and choose Test in Simulation.');model=engine.normalize(context);}catch(e){$('syntheticStatus').textContent=e.message;document.querySelectorAll('#labWorkspace button').forEach(b=>b.disabled=true);return;}
const isPair=model.module==='VPC';
const displayVendor=({'Huawei_CE_SW':'Huawei CloudEngine'}[model.vendor]||model.vendor);
const name=id=>model.nodes.find(n=>n.id===id)?.hostname||id;
const linkName=l=>l.kind+' · '+name(l.a)+' ↔ '+name(l.b)+([l.upperPort||l.aPort,l.lowerPort||l.bPort].filter(Boolean).length?' · '+[l.upperPort||l.aPort,l.lowerPort||l.bPort].filter(Boolean).join(' ↔ '):'');
const pairPathText=paths=>paths?.length?paths.map(p=>p.nodes.map(name).join(' → ')).join(' | '):'No modeled path';
const pathText=p=>p?p.nodes.map(name).join(' → '):'No modeled path';
source=model.nodes.find(n=>n.tier==='lower'&&!n.external)?.id||model.nodes[0].id;target=model.nodes.find(n=>n.tier==='upper'&&n.id!==source)?.id||model.nodes.at(-1).id;
if(model.module==='SDWAN')target=model.links.find(l=>l.a===source)?.b||target;
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
// Shared visual language: state is part of the topology and every recorded SVG.
const visualPalette={healthy:{stroke:'#14865f',fill:'#e5f2ec'},warning:{stroke:'#a5660b',fill:'#fff2d9'},critical:{stroke:'#bd3048',fill:'#fbe7eb'}};
const controlLink=l=>/peer-link|keepalive|SVL|Stack interconnect|DAD|DFS|MAD|peer control/i.test(l.kind);
// Describe physical and protocol state independently; a live cable is not proof of service.
function pairServiceStates(){
 if(!isPair)return [];
 return model.nodes.filter(n=>n.tier==='lower'&&!n.external).map(n=>({id:n.id,hostname:n.hostname,result:engine.evaluate(model,state,{...options(),source:n.id})}));
}
function additionalServiceStates(){
 if(['STP','OSPF','QOS'].includes(model.module))return model.nodes.filter(n=>n.tier==='lower'&&!n.external&&n.id!==target).map(n=>({id:n.id,hostname:n.hostname,target:name(target),result:engine.evaluate(model,state,{...options(),source:n.id})}));
 if(model.module==='SDWAN')return model.links.filter(l=>model.nodes.some(n=>n.id===l.a&&!n.external)&&model.nodes.some(n=>n.id===l.b&&n.external)).map(l=>({id:l.id,hostname:name(l.a),target:name(l.b),result:engine.evaluate(model,state,{...options(),source:l.a,target:l.b})}));
 return [];
}
function linkVisual(ids,selected){
 const links=ids.map(id=>model.links.find(l=>l.id===id)).filter(Boolean),down=links.filter(l=>state.links.includes(l.id)||state.devices.includes(l.a)||state.devices.includes(l.b));
 const recovery=links.some(l=>!controlLink(l)&&current.vpc?.recoveringPeers?.some(id=>[l.a,l.b].includes(id)));
 const blocked=links.some(l=>current.blockedLinks?.includes(l.id))||recovery;
 const unverified=links.some(l=>!controlLink(l))&&(current.vpc?.dualActive||['dual-active-risk','split-brain'].includes(current.status)||isPair&&state.conditions?.vlanMismatch);
 const status=down.length===links.length?'down':down.length?'partial':blocked?'blocked':unverified?'unverified':ids.some(id=>selected.has(id))?'forwarding':'available';
 let reason=status==='down'?(down.some(l=>state.devices.includes(l.a)||state.devices.includes(l.b))?'Endpoint device down; connection unavailable.':'Connection disabled by this scenario.'):status==='partial'?down.length+' of '+links.length+' represented members unavailable; '+(blocked?'remaining members are blocked by protocol protection.':unverified?'remaining members are physically available, but service forwarding is unverified.':'remaining members are physically available. Protocol state determines service forwarding.'):status==='blocked'?(model.module==='STP'?'STP alternate link; blocked to prevent a Layer 2 loop.':recovery?'Physical connection available; service members await modeled recovery.':(current.findings.find(f=>/SUSPENDED|PROTECTED_PEER|TYPE1/.test(f.code))?.description||'Physical connection available; protocol protection blocks service forwarding.')):status==='unverified'?(state.conditions?.vlanMismatch?'Physical connection available; selected service VLAN is inconsistent.':'Physical connection available; peer coordination is lost and service forwarding is unverified.'):status==='forwarding'?(model.module==='EVPN'?'Selected logical session path; physical underlay and VNI forwarding are not verified.':isPair?'Selected leaf modeled service attachment.':'Selected modeled path for the current source and destination.'):(links.every(controlLink)?'Control connection available; not a selected service traffic path.':'Connection available; not selected for this query.');
 const label={down:'× DOWN',partial:'! '+down.length+'/'+links.length+' DOWN',blocked:'Ⅱ BLOCKED',unverified:'? UNVERIFIED',forwarding:'→ SELECTED',available:'AVAILABLE'}[status];
 return {status,label,reason,links};
}
function describeLink(line,visual){
 const text=visual.links.map(linkName).join(' | ')+' · '+visual.label+' · '+visual.reason;
 line.dataset.visualLinkState=visual.status;line.dataset.stateReason=visual.reason;line.setAttribute('aria-label',text);
 let title=[...line.children].find(n=>n.localName==='title');if(!title){title=document.createElementNS('http://www.w3.org/2000/svg','title');line.append(title);}title.textContent=text;
}
function linkStateMark(overlay,visual,point,geometry){
 if(!point||!['blocked','unverified','partial'].includes(visual.status))return;
 // Parallel/crossing native links can share a midpoint. Keep each symbol on its
 // own line while separating symbols that would otherwise hide one another.
 if(geometry){const dx=geometry.after.x-geometry.before.x,dy=geometry.after.y-geometry.before.y,length=Math.hypot(dx,dy),occupied=[...overlay.querySelectorAll('[data-link-state-marker] circle')].map(c=>({x:Number(c.getAttribute('cx')),y:Number(c.getAttribute('cy'))}));if(length){for(const offset of [0,24,-24,48,-48]){const candidate={x:point.x+offset*dx/length,y:point.y+offset*dy/length};if(occupied.every(p=>Math.hypot(p.x-candidate.x,p.y-candidate.y)>=23)){point=candidate;break;}}}}
 const ns='http://www.w3.org/2000/svg',g=document.createElementNS(ns,'g'),circle=document.createElementNS(ns,'circle'),text=document.createElementNS(ns,'text'),title=document.createElementNS(ns,'title');
 g.dataset.linkStateMarker=visual.status;g.setAttribute('pointer-events','none');
 for(const [k,v]of Object.entries({cx:point.x,cy:point.y,r:10,fill:'#fff8e9',stroke:'#a5660b','stroke-width':1.8}))circle.setAttribute(k,v);
 for(const [k,v]of Object.entries({x:point.x,y:point.y+4,'text-anchor':'middle','font-family':'Arial','font-size':12,'font-weight':800,fill:'#895309'}))text.setAttribute(k,v);
 text.textContent=visual.status==='blocked'?'Ⅱ':visual.status==='unverified'?'?':'!';title.textContent=visual.label+' · '+visual.reason;g.append(circle,text,title);overlay.append(g);
}
function visualSummary(){
 const split=current.status==='split-brain',risk=current.status==='dual-active-risk'||isPair&&current.vpc?.dualActive&&!split,noPath=!current.path&&current.status!=='same-device',changed=JSON.stringify(current.path)!==JSON.stringify(current.baseline),faults=state.devices.length+state.links.length,protectedMembers=isPair&&current.blockedLinks?.length>0;
 const severity=split||risk||noPath?'critical':protectedMembers||current.vpc?.recoveryWait||current.qos?.excessMbps>0||faults?'warning':'healthy';
 let title=split?'SPLIT-BRAIN · TWO INDEPENDENT ACTIVE PEERS':risk?'CONTROL PARTITION · FORWARDING UNVERIFIED':noPath?'NO MODELED PATH':current.vpc?.recoveryWait?'RECOVERY IN PROGRESS':protectedMembers?'PROTECTION ACTIVE · MEMBER PORTS BLOCKED':faults&&changed?'FAILOVER · ALTERNATE PATH SELECTED':faults?'DEGRADED · SERVICE PATH AVAILABLE':'MODELED PATH AVAILABLE';
 let detail=split?'Peer synchronization lost · Local members may remain up · End-to-end forwarding is not assured':risk?'Independent peer state · Available cables do not confirm synchronized forwarding':noPath?'Failed or protected components prevent the selected source from reaching its modeled destination':protectedMembers?'Amber members are intentionally blocked · Green members show the available service path':current.vpc?.recoveryWait?'Returning or protected members await the modeled recovery step':changed&&faults?'Traffic has moved from the baseline path to the highlighted surviving path':'Green arrows: selected path · Red ×: failed component · Amber: blocked or unverified';
 if(isPair&&current.findings.some(f=>f.code==='TYPE1_MISMATCH'))detail='Mandatory consistency mismatch · Amber members are suspended by consistency protection';
 if(isPair&&current.findings.some(f=>f.code==='VLAN_MISMATCH'))detail='Selected service VLAN is inconsistent · Physical link availability does not establish service forwarding';
 if(model.module==='STP')detail='ROOT: '+name(current.root)+' · Amber dashed links: STP blocked · Green arrows: selected tree path';
 if(model.module==='OSPF'&&current.path)detail='Selected OSPF path cost: '+current.path.cost+' · Cost and topology changes recalculate the highlighted path';
 if(model.module==='BGP')detail='Destination prefix: '+(direction==='inbound'?model.nodes.find(n=>n.id===bgpTarget)?.prefix:model.nodes.find(n=>n.id.startsWith('isp'))?.prefix)+' · '+(direction==='inbound'?'AS-path / prepend selection':'Local Preference selection');
 if(model.module==='EVPN')detail='Logical session connectivity only · Physical underlay and VNI forwarding are not verified';
 if(current.qos){title=noPath?'NO MODELED PATH':current.qos.excessMbps>0?'POLICY LIMIT · EXCESS TRAFFIC':'POLICY CAPACITY AVAILABLE';detail='Offered '+current.qos.offeredMbps+' Mbps · Admitted '+current.qos.admittedMbps+' Mbps · Excess '+current.qos.excessMbps+' Mbps (arithmetic model)';}
 return {split,risk,noPath,severity,title,detail};
}
function paintTopologyState(map,overlay,points,shapes){
 const ns='http://www.w3.org/2000/svg',v=visualSummary(),palette=visualPalette[v.severity],box=(original.getAttribute('viewBox')||'0 0 950 450').split(/\s+/).map(Number);
 const add=(tag,attrs,parent=overlay,text)=>{const el=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);if(text!==undefined)el.textContent=text;parent.append(el);return el;};
 map.setAttribute('viewBox',[box[0],box[1]-108,box[2],box[3]+156].join(' '));map.dataset.visualState=v.split?'split-brain':v.risk?'partition-risk':v.noPath?'no-path':v.severity;map.setAttribute('aria-label',model.technology+' topology · '+v.title+' · '+v.detail);
 const ribbon=add('g',{'data-topology-state':map.dataset.visualState,role:'img','aria-label':v.title+'; '+v.detail,'pointer-events':'none'}),width=Math.min(box[2]-24,850),center=box[0]+box[2]/2;
 add('rect',{x:center-width/2,y:box[1]-99,width,height:86,rx:10,fill:palette.fill,stroke:palette.stroke,'stroke-width':1.5},ribbon);
 add('text',{x:center,y:box[1]-74,'text-anchor':'middle',fill:palette.stroke,'font-family':'Arial','font-size':16,'font-weight':800},ribbon,v.title);
 add('text',{x:center,y:box[1]-53,'text-anchor':'middle',fill:'#3c5669','font-family':'Arial','font-size':11},ribbon,v.detail);
 const baselineRoles=isPair?engine.evaluate(model,{devices:[],links:[]},options()).vpc.roles:null;
 const initialRoots=model.module==='STP'?engine.evaluate(model,{devices:[],links:[]},{...options(),preferredRoot:model.settings.preferredRoot}).roots:[];
 const visualSource=model.module==='BGP'?(current.path?.nodes[0]||bgpSource):source,visualTarget=model.module==='BGP'?(current.path?.nodes.at(-1)||bgpTarget):target;
 const failedNames=[...state.devices.map(name),...state.links.map(id=>{const l=model.links.find(l=>l.id===id);return l?(l.kind+' '+(l.upperPort||l.aPort||l.id)):id;})],impact=failedNames.length?'FAILED: '+failedNames.join(' · '):'SOURCE: '+name(visualSource)+' → '+(isPair?model.technology+' domain':name(visualTarget)),impactText=impact.length>120?impact.slice(0,117)+'…':impact;
 const impactLabel=add('text',{x:center,y:box[1]-31,'text-anchor':'middle',fill:failedNames.length?'#a2263c':'#4b6577','font-family':'Arial','font-size':10,'data-failed-summary':state.devices.length+' devices / '+state.links.length+' links'},ribbon,impactText);add('title',{},impactLabel,impact);
 if((v.split||v.risk)&&isPair)for(const domain of map.querySelectorAll('.vpc-domain-box')){domain.style.stroke=palette.stroke;domain.style.strokeDasharray='9 7';domain.style.fill='#fff4f6';}
 for(const n of model.nodes){const point=points.get(n.id);if(!point)continue;const upper=n.tier==='upper',failed=state.devices.includes(n.id),memberLinks=isPair&&upper?model.links.filter(l=>!l.logical&&[l.a,l.b].includes(n.id)&&!/(peer-link|keepalive|SVL|Stack interconnect|DAD|DFS|MAD|peer control)/i.test(l.kind)):[],protectedPeer=isPair&&(current.vpc?.suspended===n.id||current.vpc?.recoveringPeers?.includes(n.id)||memberLinks.length>0&&memberLinks.every(l=>current.blockedLinks?.includes(l.id))),independent=upper&&isPair&&(v.split||v.risk)&&!failed;
  const role=isPair&&upper?current.vpc.roles[n.id]:model.module==='STP'&&current.roots.includes(n.id)?'ROOT BRIDGE':model.module==='STP'&&initialRoots.includes(n.id)?'NON-ROOT':n.id===visualSource?'SOURCE':n.id===visualTarget?'DESTINATION':null;
  if(!failed&&!protectedPeer&&!independent&&!role&&!(model.module==='STP'&&initialRoots.includes(n.id)))continue;
  const severity=failed||independent?'critical':protectedPeer?'warning':'healthy',color=visualPalette[severity],b=shapes.get(n.id)||{x:point.x-55,y:point.y-74,width:110,height:58};
  const previousRole=isPair&&upper?baselineRoles[n.id]:model.module==='STP'?(initialRoots.includes(n.id)?'ROOT BRIDGE':'NON-ROOT'):null,roleChanged=!failed&&!!previousRole&&(isPair?previousRole!==role:initialRoots.includes(n.id)!==current.roots.includes(n.id));
  const group=add('g',{'data-visual-device':n.id,'data-device-state':failed?'down':independent?'independent-active':protectedPeer?'protected':role==='ROOT BRIDGE'?'root':'available','data-role-changed':String(roleChanged),'pointer-events':'none'});
  const explanation=failed?'Device disabled by this scenario.':independent?'Peer coordination lost; independent active role does not verify service forwarding.':protectedPeer?(current.findings.find(f=>/SUSPENDED|PROTECTED_PEER|TYPE1|RECOVERY|DELAY_RESTORE/.test(f.code))?.description||'Service members are protected or awaiting recovery.'):roleChanged?'Operational role changed from '+previousRole+' to '+(role||'NON-ROOT')+'.':'Current role: '+(role||'NON-ROOT')+'.';
  add('title',{},group,name(n.id)+' · '+explanation);group.setAttribute('aria-label',name(n.id)+' · '+explanation);
  const native=[...map.querySelectorAll('[data-device]')].find(el=>el.dataset.device===n.id);if(native){native.setAttribute('aria-label',name(n.id)+' · '+explanation);native.dataset.stateReason=explanation;if(native.localName==='g'){let tooltip=[...native.children].find(el=>el.localName==='title');if(!tooltip)tooltip=add('title',{},native);tooltip.textContent=name(n.id)+' · '+explanation;}}
  add('rect',{x:b.x-7,y:b.y-7,width:b.width+14,height:b.height+14,rx:13,fill:'none',stroke:color.stroke,'stroke-width':independent?4:2.5,'stroke-dasharray':independent?'9 5':'none',class:independent?'topology-alarm':''},group);
  if(failed){const x=b.x+b.width/2,y=b.y+b.height/2;add('circle',{cx:x,cy:y,r:14,fill:'#fff',stroke:color.stroke,'stroke-width':2},group);add('path',{d:`M${x-6} ${y-6}l12 12m0 -12l-12 12`,stroke:color.stroke,'stroke-width':3,fill:'none'},group);}
  const label=failed?'DEVICE DOWN':independent?(v.split?'? PRIMARY · INDEPENDENT':'? ACTIVE · UNVERIFIED'):protectedPeer?(current.vpc.recoveringPeers?.includes(n.id)?'Ⅱ RECOVERY · WAIT':current.vpc.roles[n.id]==='RECOVERY'?'Ⅱ RECOVERY · BLOCKED':'Ⅱ MEMBERS SUSPENDED'):(role||'NON-ROOT')+(roleChanged?' ↻':'');
  const labelWidth=Math.max(94,Math.min(190,label.length*6.6+16)),y=Math.max(point.y+10,b.y+b.height+7);
  if(isPair&&!upper&&!failed)continue;
  add('rect',{x:point.x-labelWidth/2,y,width:labelWidth,height:21,rx:5,fill:color.fill,stroke:color.stroke,'stroke-width':1},group);
  add('text',{x:point.x,y:y+14,'text-anchor':'middle','font-family':'Arial','font-size':10,'font-weight':700,fill:color.stroke},group,label);
 }
}
function draw(){
 const map=$('labMap'),copy=original.cloneNode(true),points=new Map(),shapes=new Map();map.replaceChildren(...[...copy.childNodes].map(n=>document.importNode(n,true)));map.setAttribute('viewBox',copy.getAttribute('viewBox')||'0 0 950 450');map.dataset.source='design';
 for(const n of model.nodes){const label=[...map.querySelectorAll('text')].find(t=>t.dataset.labDevice===n.id)||[...map.querySelectorAll('text')].find(t=>t.textContent.trim()===n.hostname);if(!label)continue;
  let x=Number(label.getAttribute('x')),y=Number(label.getAttribute('y'));
  if(label.getCTM&&map.getCTM&&map.createSVGPoint){try{const p=map.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(label.getCTM()).matrixTransform(map.getCTM().inverse());x=q.x;y=q.y;}catch{}}
  if(Number.isFinite(x)&&Number.isFinite(y))points.set(n.id,{x,y});
  const parent=label.closest('g'),shape=parent&&parent!==map&&parent.querySelector('rect')||label.previousElementSibling;
  if(shape?.localName==='rect'&&shape.getBBox&&map.createSVGPoint)try{const b=shape.getBBox(),matrix=map.getCTM().inverse().multiply(shape.getCTM()),corners=[[b.x,b.y],[b.x+b.width,b.y+b.height]].map(([x,y])=>{const p=map.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(matrix);});shapes.set(n.id,{x:corners[0].x,y:corners[0].y,width:corners[1].x-corners[0].x,height:corners[1].y-corners[0].y});}catch{}

  let g=label.closest('g');if(!g||g===map||model.nodes.filter(other=>other.id!==n.id).some(other=>[...g.querySelectorAll('text')].some(t=>t.textContent.trim()===other.hostname))){g=label;}
  g.dataset.device=n.id;g.style.cursor='pointer';g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-label',name(n.id)+(state.devices.includes(n.id)?' · failed':''));
  if(state.devices.includes(n.id)){g.style.opacity='.35';const shape=g.querySelector('rect')||(label.previousElementSibling?.localName==='rect'?label.previousElementSibling:null);if(shape){shape.style.stroke='#c93b4f';shape.style.strokeWidth='4';}}
 }
 const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'g');overlay.dataset.simulationOverlay='true';
 const trafficPaths=(current?.paths||[current?.path]).filter(Boolean),selected=new Set(trafficPaths.flatMap(p=>p.links));
 const mappedIds=new Set();
 {
  for(const line of map.querySelectorAll('[data-lab-link],[data-lab-links]')){
   const ids=line.dataset.labLinks?JSON.parse(line.dataset.labLinks):[line.dataset.labLink];if(!ids.length)continue;
   const failed=ids.filter(id=>{const l=model.links.find(l=>l.id===id);return l&&(state.links.includes(id)||state.devices.includes(l.a)||state.devices.includes(l.b));}).length;
   const visual=linkVisual(ids,selected),blocked=visual.status==='blocked',unverified=visual.status==='unverified',flow=visual.status==='forwarding';ids.forEach(id=>mappedIds.add(id));
   line.style.setProperty('stroke',visual.status==='down'?'#c93b4f':['blocked','partial','unverified'].includes(visual.status)?'#c88616':flow?'#14865f':line.classList.contains('vpc-ka-line')?'#a45bc0':line.classList.contains('vpc-peer-line')?'#16835f':'#287bb5');
   line.style.setProperty('stroke-width',visual.status!=='available'?'3.5':'2.2');line.style.setProperty('stroke-dasharray',['down','partial','blocked','unverified'].includes(visual.status)?'7 5':flow?'10 7':line.classList.contains('vpc-ka-line')?'8 6':'none');
   describeLink(line,visual);
   let geometry=null;
   try{if(line.getTotalLength&&line.getPointAtLength){const length=line.getTotalLength();if(length>0){const toMap=p=>{const q=map.createSVGPoint();q.x=p.x;q.y=p.y;return q.matrixTransform(map.getCTM().inverse().multiply(line.getCTM()));};geometry={start:toMap(line.getPointAtLength(0)),end:toMap(line.getPointAtLength(length)),middle:toMap(line.getPointAtLength(length/2)),before:toMap(line.getPointAtLength(Math.max(0,length/2-5))),after:toMap(line.getPointAtLength(Math.min(length,length/2+5)))};}}}catch{}
   linkStateMark(overlay,visual,geometry?.middle,geometry);
   if(failed===ids.length&&geometry){const {x,y}=geometry.middle,mark=document.createElementNS(ns,'path');mark.setAttribute('d',`M${x-5} ${y-5}l10 10m0 -10l-10 10`);mark.setAttribute('stroke','#bd3048');mark.setAttribute('stroke-width','2.5');mark.dataset.faultMarker='link';overlay.append(mark);}
   if(flow&&!failed&&!blocked&&geometry&&(model.module==='OSPF'||model.module==='BGP'&&ids.includes(current.path?.externalLink))){const label=document.createElementNS(ns,'g');label.dataset.pathDecision=model.module;label.style.pointerEvents='none';const text=document.createElementNS(ns,'text'),background=document.createElementNS(ns,'rect'),caption=model.module==='OSPF'?'Cost '+(policies[ids[0]]||model.links.find(l=>l.id===ids[0])?.cost||1):direction==='inbound'?'AS prepend +'+current.path.prependCount:'LocalPref '+current.path.localPreference;for(const [k,value]of Object.entries({x:geometry.middle.x-54,y:geometry.middle.y-(model.module==='OSPF'?58:27),width:108,height:21,rx:5,fill:'#fff',stroke:'#14865f'}))background.setAttribute(k,value);for(const [k,value]of Object.entries({x:geometry.middle.x,y:geometry.middle.y-(model.module==='OSPF'?43:12),'text-anchor':'middle','font-family':'Arial','font-size':11,'font-weight':700,fill:'#116446'}))text.setAttribute(k,value);text.textContent=caption;label.append(background,text);overlay.append(label);}
   if(flow&&!failed&&!blocked&&!['dual-active-risk','split-brain'].includes(current.status)){line.classList.add('synthetic-flow');if(geometry){const link=model.links.find(l=>ids.includes(l.id)),path=trafficPaths.find(p=>p?.links.some(id=>ids.includes(id))),from=path&&link?points.get(path.nodes[path.links.indexOf(link.id)]):null,{x:mx,y:my}=geometry.middle;let angle=Math.atan2(geometry.after.y-geometry.before.y,geometry.after.x-geometry.before.x);if(from&&Math.hypot(from.x-geometry.start.x,from.y-geometry.start.y)>Math.hypot(from.x-geometry.end.x,from.y-geometry.end.y))angle+=Math.PI;const arrow=document.createElementNS(ns,'polyline');arrow.setAttribute('points',[[-8,-5],[0,0],[-8,5]].map(([x,y])=>[mx+x*Math.cos(angle)-y*Math.sin(angle),my+x*Math.sin(angle)+y*Math.cos(angle)].join(',')).join(' '));arrow.setAttribute('fill','none');arrow.setAttribute('stroke','#14865f');arrow.setAttribute('stroke-width','3');overlay.append(arrow);}}

  }
 }
 for(const l of model.links){if(mappedIds.has(l.id)||isPair)continue;const a=points.get(l.a),b=points.get(l.b);if(!a||!b||a.x===b.x&&a.y===b.y)continue;
  const down=state.links.includes(l.id)||[l.a,l.b].some(id=>state.devices.includes(id));const suspended=current?.blockedLinks?.includes(l.id);if(!down&&!selected.has(l.id)&&!suspended)continue;
  const line=document.createElementNS(ns,'line');for(const [key,value]of Object.entries({x1:a.x,y1:a.y+10,x2:b.x,y2:b.y+10,stroke:down?'#c93b4f':suspended?'#c88616':'#14865f','stroke-width':4,'stroke-dasharray':down||suspended?'7 5':'10 7',opacity:'.9'}))line.setAttribute(key,value);
  const visual=linkVisual([l.id],selected);describeLink(line,visual);line.dataset.labLink=l.id;line.style.cursor='pointer';if(visual.status==='forwarding')line.classList.add('synthetic-flow');overlay.append(line);linkStateMark(overlay,visual,{x:(a.x+b.x)/2,y:(a.y+b.y)/2+10});
  if(down){const mark=document.createElementNS(ns,'text');mark.setAttribute('x',(a.x+b.x)/2);mark.setAttribute('y',(a.y+b.y)/2+10);mark.setAttribute('text-anchor','middle');mark.setAttribute('fill','#bd3048');mark.setAttribute('font-size','20');mark.textContent='×';mark.dataset.faultMarker='link';overlay.append(mark);}
  if(!down&&!suspended){const ids=(current.paths?.find(p=>p.links.includes(l.id))||current.path).nodes,forward=ids.indexOf(l.a)<ids.indexOf(l.b),from=forward?a:b,to=forward?b:a,angle=Math.atan2(to.y-from.y,to.x-from.x),mx=(from.x+to.x)/2,my=(from.y+to.y)/2+10,arrow=document.createElementNS(ns,'polyline');arrow.setAttribute('points',[[-8,-6],[0,0],[-8,6]].map(([x,y])=>[mx+x*Math.cos(angle)-y*Math.sin(angle),my+x*Math.sin(angle)+y*Math.cos(angle)].join(',')).join(' '));arrow.setAttribute('fill','none');arrow.setAttribute('stroke','#14865f');arrow.setAttribute('stroke-width','3');overlay.append(arrow);}
 }
 if(model.module==='STP')for(const n of model.nodes.filter(n=>n.tier==='upper')){const label=[...map.querySelectorAll('text')].find(t=>t.dataset.labDevice===n.id||t.textContent.trim()===n.hostname);for(const text of label?.closest('g')?.querySelectorAll('text')||[])if(/^(ROOT|SECONDARY)$/.test(text.textContent.trim()))text.textContent=current.roots.includes(n.id)?'ROOT':'NON-ROOT';}
 if(model.module==='BGP'){const links=model.bgp.links,up=l=>!state.devices.includes(l.a)&&!state.devices.includes(l.b)&&!state.links.includes(l.id),external=l=>[l.a,l.b].some(id=>id.startsWith('isp')),ebgp=links.filter(external),ibgp=links.filter(l=>!external(l)),counter=map.querySelector('[data-bgp-session-counts]');if(counter)counter.textContent='Available model sessions · eBGP '+ebgp.filter(up).length+'/'+ebgp.length+' · iBGP '+ibgp.filter(up).length+'/'+ibgp.length;const internal=ibgp.length&&ibgp.every(up);for(const line of map.querySelectorAll('[data-bgp-ibgp-session]'))line.style.stroke=internal?'#8065a8':'#c34141';const label=map.querySelector('[data-bgp-ibgp-label]');if(label){label.textContent=internal?'iBGP · CE-TO-CE':'iBGP · UNAVAILABLE';label.style.fill=internal?'#8065a8':'#a12f3d';}}
 paintTopologyState(map,overlay,points,shapes);

 const box=(original.getAttribute('viewBox')||'0 0 950 450').split(/\s+/).map(Number),legend=document.createElementNS(ns,'g');legend.dataset.stateLegend='true';legend.setAttribute('pointer-events','none');
 for(const [i,[caption,color]]of [['→ Selected path','#116446'],['× Physical failure','#a2263c'],['Ⅱ Protocol blocked','#895309'],['? Service unverified','#895309'],['! Partial member loss','#895309'],['↻ Role changed','#31576b']].entries()){const text=document.createElementNS(ns,'text');for(const [key,value]of Object.entries({x:box[0]+14+(i%3)*(box[2]-28)/3,y:box[1]+box[3]+17+Math.floor(i/3)*18,'font-family':'Arial','font-size':10,fill:color}))text.setAttribute(key,value);text.textContent=caption;legend.append(text);}overlay.append(legend);
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
function bgpDesignValue(link,key){const dir=key==='localPreference'?'import':'export',route=dir==='import'?model.bgp.nodes.find(n=>n.id.startsWith('isp'))?.prefix:model.bgp.nodes.find(n=>n.id===bgpTarget)?.prefix;return window.BgpTrafficPolicy?window.BgpTrafficPolicy.resolve(link,dir,route)[key]??0:link[key]??0;}
if(model.module==='BGP'){
 $('workspaceSource').parentElement.firstChild.textContent='Outbound CE ';$('workspaceTarget').parentElement.firstChild.textContent='Inbound prefix owner ';
 const tabs=document.createElement('div');tabs.className='lab-actions';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Traffic engineering direction');settingsHost.append(tabs);
 const panels={},buttons={},inputs={};
 function selectDirection(side){direction=side.toLowerCase();for(const name of ['Outbound','Inbound']){panels[name].hidden=name!==side;buttons[name].setAttribute('aria-pressed',String(name===side));}render();}
 for(const [side,key,max]of [['Outbound','localPreference',4294967295],['Inbound','prependCount',10]]){
  const tab=document.createElement('button');tab.type='button';tab.id='synthetic'+side+'Tab';tab.textContent=side;tab.setAttribute('aria-pressed',String(side==='Outbound'));tabs.append(tab);buttons[side]=tab;
  const panel=document.createElement('section');panel.id='synthetic'+side+'Panel';panel.hidden=side!=='Outbound';panels[side]=panel;tab.setAttribute('aria-controls',panel.id);tab.onclick=()=>selectDirection(side);settingsHost.append(panel);
  const heading=document.createElement('h3');heading.textContent=side==='Outbound'?'Outbound · choose the exit path':'Inbound · influence the entry path';panel.append(heading);
  const help=document.createElement('p');help.textContent=side==='Outbound'?'Higher Local Preference selects the customer exit. Edit values, then apply parameters.':'AS-path prepend adds copies of the customer AS. Fewer copies favor that entry under equal upstream policy.';panel.append(help);
  inputs[side]=[];
  for(const l of model.bgp.links.filter(l=>[l.a,l.b].some(n=>n.startsWith('isp')))){
   const wrap=document.createElement('label'),input=document.createElement('input');wrap.textContent=linkName({...l,kind:l.kind||l.id})+' · '+(side==='Outbound'?'Local Preference':'AS-path prepend');input.type='number';input.min='0';input.max=String(max);input.step='1';input.value=policies[l.id]?.[key]??bgpDesignValue(l,key);input.dataset.link=l.id;input.dataset.policy=key;input.setAttribute('aria-label',wrap.textContent);wrap.append(input);panel.append(wrap);inputs[side].push([input,l]);
  }
  const actions=document.createElement('div');actions.className='lab-actions';const apply=document.createElement('button'),defaults=document.createElement('button');apply.type=defaults.type='button';apply.id='syntheticApply'+side;defaults.id='syntheticDefault'+side;apply.className='primary';apply.textContent='Apply parameters';defaults.textContent='Apply defaults';actions.append(apply,defaults);panel.append(actions);
  apply.onclick=()=>{const next=JSON.parse(JSON.stringify(policies));for(const [input,link]of inputs[side]){const value=Number(input.value);if(!input.value.trim()||!Number.isInteger(value)||value<0||value>max){input.setCustomValidity('Enter an integer from 0 to '+max);input.reportValidity();status.textContent=side+': enter valid parameters before applying.';return;}input.setCustomValidity('');(next[link.id]??={})[key]=value;}policies=next;render();status.textContent=side+' parameters applied. Other direction and failure scenario preserved.';};
  defaults.onclick=()=>{for(const [input,link]of inputs[side]){if(policies[link.id]){delete policies[link.id][key];if(!Object.keys(policies[link.id]).length)delete policies[link.id];}input.value=bgpDesignValue(link,key);input.setCustomValidity('');}render();status.textContent=side+' Design parameters applied. Other direction and failure scenario preserved.';};
 }
 const status=document.createElement('p');status.id='workspacePolicyStatus';status.setAttribute('role','status');status.textContent='Defaults reload the parameters imported from Design for the selected direction.';settingsHost.append(status);
 $('workspaceSource').onchange=()=>{source=$('workspaceSource').value;bgpSource=source;render();};$('workspaceTarget').onchange=()=>{target=$('workspaceTarget').value;bgpTarget=target;render();};
 fill($('workspaceSource'),model.nodes.filter(n=>n.id.startsWith('ce')));fill($('workspaceTarget'),model.nodes.filter(n=>n.id.startsWith('ce')));source=bgpSource;target=bgpTarget;$('workspaceSource').value=source;$('workspaceTarget').value=target;
}
if(!settingsHost.children.length){const p=document.createElement('p');p.textContent='Parameters and fault domains are imported from the current design. Use Failures to compare baseline and changed availability.';settingsHost.append(p);}
const inputDefaults=[...settingsHost.querySelectorAll('input,select')].map(input=>[input,input.value]);
const resetPolicy=document.createElement('button');resetPolicy.textContent='Restore design parameters';resetPolicy.onclick=()=>{policies={};if(model.bgp)for(const l of model.bgp.links)policies[l.id]={localPreference:l.localPreference,prependCount:l.prependCount||0};offeredRate=100;preferredRoot=model.settings.preferredRoot;for(const [input,value]of inputDefaults)input.value=value;direction='outbound';render();};if(model.module!=='BGP')policyPanel.append(resetPolicy);

function options(){return {source,target,preferredRoot,offeredRate,costs:model.module==='OSPF'?policies:{},policies:model.module==='BGP'?policies:null,direction,bgpSource,bgpTarget};}
function choices(kind){if(isPair)return pairChoices(kind);const isDevice=kind==='devices',select=$(isDevice?'syntheticNode':'syntheticLink'),host=$(isDevice?'syntheticDeviceChoices':'syntheticLinkChoices'),items=isDevice?model.nodes:model.links,selection=new Set([...select.selectedOptions].map(o=>o.value));select.replaceChildren();host.replaceChildren();
 for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=isDevice?item.hostname:linkName(item);option.selected=selection.has(item.id);select.append(option);const label=document.createElement('label');label.className='wb-device-choice'+(state[kind].includes(item.id)?' is-failed':'');const input=document.createElement('input');input.type='checkbox';input.value=item.id;input.checked=option.selected;input.onchange=()=>{option.selected=input.checked;selectionText(kind);};const text=document.createElement('span');text.className='device-name';text.textContent=option.textContent;const status=document.createElement('span');status.className='device-state';status.textContent=state[kind].includes(item.id)?'FAILED':'Available';label.append(input,text,status);host.append(label);}
 select.onchange=()=>choices(kind);selectionText(kind);
}
function selectionText(kind){const isDevice=kind==='devices',count=$(isDevice?'syntheticNode':'syntheticLink').selectedOptions.length;$(isDevice?'syntheticDeviceSelection':'syntheticLinkSelection').textContent=count+' selected · Fail or restore together.';if(isPair)updatePairRestore();}
function action(kind,restore){const select=$(kind==='devices'?'syntheticNode':'syntheticLink'),ids=[...select.selectedOptions].map(o=>o.value),next=new Set(state[kind]);for(const id of ids)restore?next.delete(id):next.add(id);state[kind]=[...next];if(restore)for(const o of select.options)if(ids.includes(o.value))o.selected=false;checkpoint();render();}
for(const [id,kind,restore]of [['syntheticNodeDown','devices',false],['syntheticNodeUp','devices',true],['syntheticLinkDown','links',false],['syntheticLinkUp','links',true]])$(id).onclick=()=>action(kind,restore);
$('syntheticReset').onclick=()=>{state={devices:[],links:[]};for(const id of ['syntheticNode','syntheticLink'])for(const o of $(id).options)o.selected=false;render();};
function pairChoices(kind){
 const devices=kind==='devices',select=$(devices?'syntheticNode':'syntheticLink'),host=$(devices?'syntheticDeviceChoices':'syntheticLinkChoices'),items=devices?model.nodes:model.links,selected=new Set([...select.selectedOptions].map(o=>o.value));
 select.replaceChildren();host.replaceChildren();for(const item of items){const o=document.createElement('option');o.value=item.id;o.textContent=devices?item.hostname:linkName(item);o.selected=selected.has(item.id);select.append(o);}
 const add=(label,ids,parent,status)=>{const row=document.createElement('label');row.className='wb-device-choice pair-choice';const input=document.createElement('input');input.type='checkbox';input.value=ids[0];input.dataset.faultIds=JSON.stringify(ids);input.checked=ids.every(id=>selected.has(id));input.onchange=()=>{for(const o of select.options)if(ids.includes(o.value))o.selected=input.checked;selectionText(kind);for(const box of host.querySelectorAll('input[data-fault-ids]'))box.checked=JSON.parse(box.dataset.faultIds).every(id=>[...select.selectedOptions].some(o=>o.value===id));};
  const text=document.createElement('span');text.className='device-name';text.textContent=label;const badge=document.createElement('span');badge.className='device-state';badge.textContent=status;row.dataset.faultComponent=ids.length>1?'bundle':ids[0];row.append(input,text,badge);parent.append(row);};
 const advanced=document.createElement('details'),summary=document.createElement('summary');summary.textContent=devices?'Additional · leaf device failures':'Additional · physical members & access links';advanced.append(summary);
 if(devices){for(const n of model.nodes.filter(n=>n.tier==='upper').slice(0,2))add(n.hostname,[n.id],host,(current?.vpc?.roles[n.id]||'Available')+(model.vendor==='Cisco NX-OS'&&current?.vpc?.suspended===n.id?' · vPC SUSPENDED':''));for(const n of model.nodes.filter(n=>n.tier!=='upper'))add(n.hostname,[n.id],advanced,state.devices.includes(n.id)?'DOWN':'UP');}
 else {
  const peer=model.links.filter(l=>/peer-link|SVL|Stack interconnect/i.test(l.kind)),control=model.links.filter(l=>/keepalive|DAD|DFS|MAD|peer control/i.test(l.kind));
  if(peer.length)add(model.vendor==='Cisco IOS-XE'?'StackWise Virtual Link (SVL)':model.vendor==='Huawei iStack'?'Stack interconnect':'Peer-link'+(model.settings.vpc?.peerPo?' · Po'+model.settings.vpc.peerPo:''),peer.map(l=>l.id),host,(current?.vpc?.peerLinkUp?'UP':'DOWN')+' · '+(current?.vpc?.availableMembers??peer.length)+'/'+peer.length);
  if(control.length)add(model.vendor==='Cisco NX-OS'?'Peer-keepalive':model.vendor==='Arista EOS'?'MLAG control SVI (not independent DAD)':model.vendor==='Huawei_CE_SW'?'DFS / DAD heartbeat':model.vendor==='Huawei iStack'?'Multi-active detection (MAD)':'Dual-active detection (DAD)',control.map(l=>l.id),host,control.every(l=>!state.links.includes(l.id))&&!model.nodes.filter(n=>n.tier==='upper').some(n=>state.devices.includes(n.id))?'UP':'DOWN');
  else {const p=document.createElement('p');p.className='muted';p.textContent='No independent detection link is configured in this design.';host.append(p);}
  for(const l of model.links)add(linkName(l),[l.id],advanced,state.links.includes(l.id)?'FAILED':current?.blockedLinks?.includes(l.id)?'SUSPENDED':'Available');
 }
 host.append(advanced);select.onchange=()=>pairChoices(kind);selectionText(kind);
}
function checkpoint(extra={}){state.events??=[];state.events.push({devices:[...state.devices],links:[...state.links],...extra});}
function pairRestoreMode(){
 const selected=['syntheticNode','syntheticLink'].some(id=>$(id).selectedOptions.length);
 if(selected)return 'selected';
 if(state.devices.length||state.links.length||Object.values(state.conditions||{}).some(Boolean))return 'scenario';
 if(current?.vpc?.recoveryWait)return current.vpc.manualRecoveryRequired?'manual':'recovery';
 return 'none';
}
function updatePairRestore(){
 const button=$('pairRestore');if(!button)return;const mode=pairRestoreMode();
 button.textContent=({selected:'Restore selected',scenario:'Restore scenario',recovery:'Complete recovery (simulation)',manual:'Manual recovery required',none:'Restore selected'})[mode];
 button.disabled=['manual','none'].includes(mode);button.dataset.restoreMode=mode;
 button.title=mode==='recovery'?'Connections are restored. Complete the pending modeled recovery phase.':mode==='scenario'?'Restore the active scenario faults; preserve operational role and recovery history.':mode==='none'?'Select a failed component or run a failure scenario.':'';
 $('pairFail').disabled=!['syntheticNode','syntheticLink'].some(id=>$(id).selectedOptions.length);
}
function setupPairUi(){
 document.body.classList.add('pair-simulation');$('wbPolicies').hidden=true;$('wbPoliciesPanel').hidden=true;
 $('wbFailuresPanel').querySelector('h2').textContent=model.technology+' · Failure scenarios';
 $('wbFailuresPanel').querySelector('p:not([id])').textContent='Select the interconnect, detection path or peer device. Apply a fault and inspect forwarding, protection and operational roles.';
 fill($('workspaceSource'),model.nodes.filter(n=>n.tier==='lower'));$('workspaceSource').value=source;
 $('workspaceSource').parentElement.firstChild.textContent='Traffic from ';$('workspaceTarget').parentElement.hidden=true;
 const baselineRole=document.createElement('label');baselineRole.textContent='Baseline role (scenario) ';const roleSelect=document.createElement('select');fill(roleSelect,model.nodes.filter(n=>n.tier==='upper').slice(0,2));roleSelect.value=model.settings.vpc?.initialPrimary||model.settings.redundancy?.initialPrimary||model.nodes[0].id;roleSelect.onchange=()=>{model.settings.redundancy??={};model.settings.redundancy.initialPrimary=roleSelect.value;if(model.settings.vpc)model.settings.vpc.initialPrimary=roleSelect.value;state={devices:[],links:[],events:[]};render();};baselineRole.append(roleSelect);const roleAssumptions=document.createElement('details'),roleTitle=document.createElement('summary');roleTitle.textContent='Initial role & recovery assumptions';roleAssumptions.append(roleTitle,baselineRole);traffic.append(roleAssumptions);
 const roleBox=document.createElement('div');roleBox.id='pairState';roleBox.setAttribute('aria-live','polite');traffic.append(roleBox);
 const grid=$('wbFailuresPanel').querySelector('.fault-grid');grid.prepend($('nodeFault'));
 $('nodeFault').querySelector('h3').textContent='Peer devices';$('linkFault').querySelector('h3').textContent='Domain links';
 for(const id of ['syntheticNodeDown','syntheticNodeUp','syntheticLinkDown','syntheticLinkUp'])$(id).hidden=true;
 const actions=document.createElement('div');actions.className='lab-actions pair-actions';
 const apply=restore=>{const mode=restore?pairRestoreMode():null;if(restore&&mode==='recovery'){checkpoint({recoveryElapsed:true});render();return;}if(restore&&mode==='scenario'){state.devices=[];state.links=[];state.conditions={};checkpoint();render();return;}if(restore&&['manual','none'].includes(mode))return;for(const [kind,id]of [['devices','syntheticNode'],['links','syntheticLink']]){const select=$(id),ids=[...select.selectedOptions].map(o=>o.value),next=new Set(state[kind]);for(const value of ids)restore?next.delete(value):next.add(value);state[kind]=[...next];if(restore)for(const o of select.options)o.selected=false;}checkpoint();render();};
 for(const [id,text,restore]of [['pairFail','Fail selected',false],['pairRestore','Restore selected',true]]){const b=document.createElement('button');b.id=id;b.textContent=text;b.onclick=()=>apply(restore);actions.append(b);}grid.after(actions);
 const catalogue=document.createElement('label');catalogue.textContent='Documented scenario';const select=document.createElement('select');select.id='pairScenario';catalogue.append(select);
 const run=document.createElement('button');run.id='pairRunScenario';run.textContent='Run scenario';
 const peer=model.links.filter(l=>/peer-link|SVL|Stack interconnect/i.test(l.kind)).map(l=>l.id),detection=model.links.filter(l=>/keepalive|DAD|DFS|MAD|peer control/i.test(l.kind)).map(l=>l.id),peers=model.nodes.filter(n=>n.tier==='upper').slice(0,2);
 const terms=({'Cisco NX-OS':['vPC peer-link','peer-keepalive'],'Arista EOS':['MLAG peer-link','MLAG control SVI / session'],'Huawei_CE_SW':['M-LAG peer-link','DFS DAD heartbeat'],'Cisco IOS-XE':['SVL','DAD'],'Huawei iStack':['stack interconnect','MAD']})[model.vendor];
 const catalogueItems=[{id:'baseline',name:'Healthy baseline',steps:[]},{id:'peer',name:'Complete '+terms[0]+' failure',steps:[{links:peer}]}];
 if(peer.length>1)catalogueItems.push({id:'member',name:(model.vendor==='Huawei iStack'?'Ring → chain: one stack link fails':'One physical '+terms[0]+' member fails'),steps:[{links:[peer[0]]}]});
 if(detection.length){catalogueItems.push({id:'simultaneous',name:terms[0]+' + '+terms[1]+' fail simultaneously',steps:[{links:[...peer,...detection]}]},{id:'detection',name:terms[1]+' fails only',steps:[{links:detection}]},{id:'detect-peer',name:terms[1]+' fails → '+terms[0]+' fails',steps:[{links:detection},{links:peer}]},{id:'peer-detect',name:terms[0]+' fails → '+terms[1]+' fails',steps:[{links:peer},{links:detection}]});}
 if(detection.length)catalogueItems.push({id:'repair-detection',name:'Both paths lost → repair '+terms[1]+' first',steps:[{links:[...peer,...detection]},{links:peer,restoreLinks:true}]},{id:'repair-peer',name:'Both paths lost → repair '+terms[0]+' first',steps:[{links:[...peer,...detection]},{links:detection,restoreLinks:true}]},{id:'repair-both',name:'Both paths lost → repair both paths',steps:[{links:[...peer,...detection]},{links:[],restoreLinks:true}]});
 for(const p of peers)catalogueItems.push({id:p.id,name:p.hostname+' fails',steps:[{devices:[p.id]}]});
 catalogueItems.push({id:'peer-return',name:'Interconnect fails → recovers',steps:[{links:peer},{links:[],restoreLinks:true}]},{id:'both',name:'Both peers fail',steps:[{devices:peers.map(n=>n.id)}]},{id:'primary-return',name:'Primary fails → returns (operational role recovery)',steps:[{devices:[model.settings.vpc?.initialPrimary||model.settings.redundancy?.initialPrimary||peers[0].id]},{devices:[],restoreDevices:true}]},{id:'leaf-isolated',name:'Selected leaf loses both member links',dynamic:true,steps:[]});
 if(model.vendor==='Cisco NX-OS')catalogueItems.push({id:'type1',name:'Mandatory consistency mismatch',conditions:{type1:true},steps:[]},{id:'vlan',name:'Selected service VLAN inconsistent',conditions:{vlanMismatch:true},steps:[]},{id:'cold-recovery',name:'Pair power outage → one peer returns',steps:[{devices:peers.map(n=>n.id)},{devices:[peers[1].id],restoreDevices:true}]});
 const initial=()=>model.settings.vpc?.initialPrimary||model.settings.redundancy?.initialPrimary||peers[0].id;
 const survivor=()=>model.vendor==='Cisco IOS-XE'?peers.find(n=>n.id!==initial()).id:model.vendor==='Huawei iStack'?(model.settings.redundancy?.madWinner||initial()):initial();
 catalogueItems.push({id:'protected-survivor-fails',name:({'Cisco NX-OS':'Secondary suspended → operational primary fails','Arista EOS':'MLAG association lost → original primary fails','Huawei_CE_SW':'DFS backup Error-Down → master fails','Cisco IOS-XE':'Original active in Recovery → new active fails','Huawei iStack':'MAD loser in Recovery → active fragment fails'})[model.vendor],steps:()=>[{links:peer},{devices:[survivor()]}]},
 {id:'pair-restart',name:'Both chassis fail → both return',steps:[{devices:peers.map(n=>n.id)},{devices:[],restoreDevices:true}]},
 {id:'leaf-device',name:'Selected leaf device fails',steps:()=>[{devices:[source]}]});
 for(const p of peers){const access=()=>model.links.filter(l=>!l.logical&&[l.a,l.b].includes(source)&&[l.a,l.b].includes(p.id));catalogueItems.push(
 {id:'access-'+p.id,name:'Selected leaf loses local members to '+p.hostname,steps:()=>[{links:access().map(l=>l.id)}]},
 {id:'access-return-'+p.id,name:'Leaf members to '+p.hostname+' fail → recover',steps:()=>[{links:access().map(l=>l.id)},{links:[],restoreLinks:true}]},
 {id:'access-device-'+p.id,name:'Leaf members to '+p.hostname+' fail → other chassis fails',steps:()=>[{links:access().map(l=>l.id)},{devices:peers.filter(n=>n.id!==p.id).map(n=>n.id)}]});}
 const primaryReturn=catalogueItems.find(s=>s.id==='primary-return');primaryReturn.steps=()=>[{devices:[initial()]},{devices:[],restoreDevices:true}];
 for(const s of catalogueItems){const o=document.createElement('option');o.value=s.id;o.textContent=s.name;select.append(o);}
 run.onclick=()=>{const scenario=catalogueItems.find(s=>s.id===select.value);state={devices:[],links:[],events:[],conditions:scenario.conditions||{}};
  const steps=scenario.dynamic?[{links:model.links.filter(l=>[l.a,l.b].includes(source)&&peers.some(n=>[l.a,l.b].includes(n.id))).map(l=>l.id)}]:typeof scenario.steps==='function'?scenario.steps():scenario.steps;
  for(const step of steps){state.devices=step.restoreDevices?[...(step.devices||[])]:[...new Set([...state.devices,...step.devices||[]])];state.links=step.restoreLinks?[...(step.links||[])]:[...new Set([...state.links,...step.links||[]])];checkpoint();}
  for(const id of ['syntheticNode','syntheticLink'])for(const o of $(id).options)o.selected=false;render();};
 const scenarioBox=document.createElement('div');scenarioBox.className='pair-catalogue';scenarioBox.append(catalogue,run);actions.after(scenarioBox);
 const recovery=document.createElement('button');recovery.id='pairRecovery';recovery.textContent='Complete recovery interval (simulation)';recovery.onclick=()=>{checkpoint({recoveryElapsed:true});render();};scenarioBox.append(recovery);
 const notes=document.createElement('details'),title=document.createElement('summary');title.textContent='Behavior, configuration assumptions & vendor reference';notes.append(title,details);const anchor=document.createElement('a');const refs={'Cisco NX-OS':['Cisco vPC Best Practices','https://www.cisco.com/c/dam/en/us/td/docs/switches/datacenter/sw/design/vpc_design/vpc_best_practices_design_guide.pdf'],'Arista EOS':['Arista EOS MLAG','https://www.arista.com/en/um-eos/eos-multi-chassis-link-aggregation'],'Huawei_CE_SW':['Huawei M-LAG','https://info.support.huawei.com/info-finder/encyclopedia/en/M-LAG.html'],'Cisco IOS-XE':['Cisco StackWise Virtual','https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/ha/svl/svl-configuration-guide/configuring_cisco_stackwise_virtual.html'],'Huawei iStack':['Huawei iStack technology white paper','https://enterprise.huawei.com/ucmf/groups/entpublic/documents/enterprise_webasset/hw_336742.pdf']};[anchor.textContent,anchor.href]=refs[model.vendor]||['Vendor reference','#'];anchor.target='_blank';anchor.rel='noopener';notes.append(anchor);scenarioBox.after(notes);
 const style=document.createElement('style');style.textContent='.pair-simulation .traffic-view{display:block!important}.pair-simulation .fault-grid{display:flex!important;flex-direction:column;gap:10px}.pair-simulation .fault-grid>div{padding:8px!important}.pair-simulation .fault-grid h3{font-size:13px;margin:4px 0}.pair-simulation .fault-grid p{display:none}.pair-simulation .pair-choice{padding:9px!important;margin:4px 0;font-size:12px}.pair-simulation .device-name{font-weight:600}.pair-simulation .pair-choice .device-state{font-size:10px;white-space:normal}.pair-simulation details{margin:8px 0}.pair-simulation details summary{font-size:11px}.pair-simulation #pairState{background:#e5eef6;padding:8px;border-radius:8px;font-size:12px;line-height:1.6}.pair-simulation .pair-catalogue select{width:100%;font-size:12px}.pair-simulation #workspaceScope{font-size:12px;line-height:1.5;margin:8px 0}.pair-simulation .pair-actions button{flex:1}.pair-simulation #pairRecovery{margin-top:7px;font-size:11px}';document.head.append(style);
}
function updatePairState(){
 const r=current.vpc;if(!r)return;const names=model.nodes.filter(n=>n.tier==='upper').slice(0,2).map(n=>name(n.id)+': '+r.roles[n.id]).join(' · ');
 $('pairState').textContent=(current.status==='split-brain'?'SPLIT-BRAIN / DUAL-ACTIVE | ':'')+names+' | '+(r.peerLinkUp?'Interconnect UP':'Interconnect DOWN')+' | '+(r.keepaliveUp===null?'Independent detection not configured':r.keepaliveUp?'Detection UP':'Detection DOWN');
 $('workspaceScope').textContent=(current.findings.find(f=>f.severity==='critical')||current.findings[0])?.description||name(source)+': '+(current.paths?.length||0)+' modeled member paths. Traffic arrows follow the selected leaf.';
 const severity=current.findings.some(f=>f.severity==='critical')?'critical':current.status==='reachable'?'healthy':'warning';for(const id of ['pairState','workspaceScope']){$(id).dataset.severity=severity;$(id).style.background=severity==='critical'?'#fbe7e9':severity==='warning'?'#fff2d9':'#e5f2ec';$(id).style.color=severity==='critical'?'#8a2434':severity==='warning'?'#725116':'#28564a';}$('syntheticStatus').style.borderLeftColor=severity==='critical'?'#c93b4f':severity==='warning'?'#c88616':'#14865f';
 updatePairRestore();$('pairRecovery').hidden=!r.recoveryWait;$('pairRecovery').disabled=!!r.manualRecoveryRequired;$('pairRecovery').textContent=r.manualRecoveryRequired?'Manual platform recovery required':'Complete recovery interval (simulation)';
}
function render(){
 current=engine.evaluate(model,state,options());choices('devices');choices('links');draw();
 const status=model.technology+' · '+displayVendor+' · '+current.status.toUpperCase()+' · '+state.devices.length+' device / '+state.links.length+' connection failure(s)';$('syntheticStatus').textContent=status;
 const warnings=[...current.findings];$('workspaceScope').textContent=current.notes.join(' ');details.textContent=current.notes.join(' ')+(warnings.length?' '+warnings.map(f=>f.description).join(' '):'');
 const row=document.createElement('tr');for(const text of [name(source),isPair?pairPathText(current.baselinePaths):pathText(current.baseline),isPair?pairPathText(current.paths):pathText(current.path),model.module==='BGP'?(direction==='inbound'?'Shortest advertised AS path':'Highest Local Preference'):model.module==='STP'?'Root: '+name(current.root):model.module==='OSPF'?'Cost: '+(current.path?.cost??'—'):model.module==='QOS'?JSON.stringify(current.qos):model.technology,current.status+(warnings.length?' · '+warnings.map(f=>f.code).join(', '):'')]){const td=document.createElement('td');td.textContent=text;row.append(td);}$('syntheticRoutes').replaceChildren(row);
 $('labSource').textContent='Current Technology Workspace · '+model.technology+' · '+displayVendor;$('labNotice').textContent='Design simulation · No virtual devices or live commands running.';
 $('labEvidence').textContent=JSON.stringify({...current,failures:state},null,2);updateRecords();document.dispatchEvent(new Event('network-lab-updated'));
 if(isPair)updatePairState();
}
function snapshot(){const svg=$('labMap').cloneNode(true);svg.setAttributeNS('http://www.w3.org/2000/xmlns/','xmlns','http://www.w3.org/2000/svg');return new XMLSerializer().serializeToString(svg);}
function baselineEvidence(){
 const saved={state,current,policies,preferredRoot,offeredRate};
 try{state={devices:[],links:[]};policies={};preferredRoot=model.settings.preferredRoot;offeredRate=100;current=engine.evaluate(model,state,{...options(),policies:null,costs:{}});draw();return {result:current,svg:snapshot()};}
 finally{({state,current,policies,preferredRoot,offeredRate}=saved);draw();}
}
function updateRecords(){
 const rows=records.map(s=>{const tr=document.createElement('tr');for(const text of [s.createdAt,s.module+' · '+s.vendor,'Synthetic design model',s.currentPath,s.modelStatus]){const td=document.createElement('td');td.textContent=text;tr.append(td);}return tr;});$('labResultRows').replaceChildren(...rows);
 for(const id of ['simulationPdf','simulationWord','labSendEvidence','labContinueReport'])$(id).disabled=!records.length;
 $('labResultStatus').textContent=records.length+' scenario(s) recorded.';$('wbRecordCount').textContent=records.length;$('simulationExportStatus').textContent=records.length?'Recorded snapshots ready for PDF / Word export.':'Record a scenario first.';
}
function scenarioStateKey(){return JSON.stringify({state,options:options(),policies});}
function sequenceText(){let previous={devices:[],links:[]};return (state.events||[]).map(e=>{const events=[];for(const kind of ['devices','links']){for(const id of e[kind]||[])if(!previous[kind].includes(id))events.push((kind==='devices'?name(id):model.links.find(l=>l.id===id)?.kind||id)+' DOWN');for(const id of previous[kind])if(!(e[kind]||[]).includes(id))events.push((kind==='devices'?name(id):model.links.find(l=>l.id===id)?.kind||id)+' restored');}previous={devices:e.devices||[],links:e.links||[]};return (e.recoveryElapsed?'Recovery interval completed (simulation)':events.join('; ')).slice(0,300);}).filter(Boolean).slice(-128);}
$('syntheticRecord').onclick=()=>{const warnings=[...current.findings],baseline=baselineEvidence();let scenario={stateKey:scenarioStateKey(),id:crypto.randomUUID(),createdAt:new Date().toISOString(),module:model.module,vendor:displayVendor,technology:model.technology,modelScope:current.notes.join(' '),modelStatus:current.status,findings:warnings.map(f=>f.description),direction:model.module==='BGP'?direction:'outbound',clientPrefix:'',preferredGateway:'',activeGateway:'',backupGateway:'',internetEntry:'',sourceDevice:name(model.module==='BGP'?(current.path?.nodes[0]||bgpSource):source),targetDevice:isPair?model.technology+' domain':name(model.module==='BGP'?(current.path?.nodes.at(-1)||bgpTarget):target),failedDevices:state.devices.map(name),failedLinks:state.links.map(id=>linkName(model.links.find(l=>l.id===id))),baselinePath:isPair?pairPathText(current.baselinePaths):pathText(current.baseline),currentPath:isPair?pairPathText(current.paths):pathText(current.path),reachable:!!current.path&&!['split-brain','dual-active-risk','conditional','same-device'].includes(current.status),pathAvailable:!!current.path&&current.status!=='same-device',forwardingAssurance:['split-brain','dual-active-risk','conditional'].includes(current.status)?'unverified':'modeled',pathChanged:isPair?JSON.stringify(current.baselinePaths)!==JSON.stringify(current.paths):JSON.stringify(current.baseline)!==JSON.stringify(current.path),gatewayChanged:isPair?current.vpc.primary!==baseline.result.vpc.primary:false,roleStates:isPair?Object.fromEntries(Object.entries(current.vpc.roles).map(([id,role])=>[name(id),role])):undefined,failureSequence:sequenceText(),policies:model.module==='BGP'?model.bgp.links.filter(link=>[link.a,link.b].some(id=>id.startsWith('isp'))).map(link=>({connection:link.id,localPreference:bgpDesignValue(link,'localPreference'),prependCount:bgpDesignValue(link,'prependCount'),...policies[link.id]})):[],topologySvg:snapshot(),baselineTopologySvg:baseline.svg,evidenceVersion:1};
 scenario=window.SimulationAssessment.enrich(scenario,{model,result:current,baselineResult:baseline.result,state,policies,preferredRoot,offeredRate,bgpObserver:direction==='inbound'?current.path?.nodes[0]:bgpSource,bgpDestination:model.module==='BGP'?(direction==='inbound'?model.nodes.find(n=>n.id===bgpTarget)?.prefix:model.nodes.find(n=>n.id.startsWith('isp'))?.prefix):'',bgpEvaluate:model.module==='BGP'?(devices,links)=>engine.evaluate(model,{devices,links},options()):null,servicePaths:additionalServiceStates().map(x=>({hostname:x.hostname,target:x.target,path:x.result.path?x.result.path.nodes.map(name).join(' → '):'—',status:x.result.status,cost:x.result.path?.cost})),pairLeaves:isPair?pairServiceStates().map(x=>({id:x.id,hostname:x.hostname,current:x.result.paths.length,status:x.result.status,baseline:engine.evaluate(model,{}, {...options(),source:x.id}).paths.length})):null,verificationCommands:context.report.verificationCommands});
 const replaced=records.length===40;records.push(JSON.parse(JSON.stringify(scenario)));records=records.slice(-40);
 let stored=true;try{sessionStorage.setItem(recordKey,JSON.stringify(records));}catch{stored=false;}
 updateRecords();if(!stored)$('labResultStatus').textContent='Snapshots remain available in this tab, but browser storage is full. Export the report before leaving.';else if(replaced)$('labResultStatus').textContent='40-snapshot limit: the oldest snapshot was replaced. Export reports regularly to retain earlier scenarios.';
 document.dispatchEvent(new Event('network-lab-scenarios-updated'));
};
$('labClear').onclick=()=>{records=[];sessionStorage.removeItem(recordKey);updateRecords();document.dispatchEvent(new Event('network-lab-scenarios-updated'));};
function attach(){
 let report;try{report=JSON.parse(sessionStorage.getItem('networkConfigurator.report.current')||'null');}catch{}
 if(report?.source?.projectId!==context.projectId||report?.source?.module!==model.module||report?.vendor!==context.report.vendor||report?.source?.generatedAt!==context.report.source.generatedAt)report=JSON.parse(JSON.stringify(context.report));
 const combined=new Map((report.simulationScenarios||[]).map(s=>[s.id,s]));for(const s of records)combined.set(s.id,s);report.simulationScenarios=[...combined.values()].slice(-40);sessionStorage.setItem('networkConfigurator.report.current',JSON.stringify(report));$('labResultStatus').textContent=records.length+' scenario(s) attached to '+model.technology+' report.';
}
$('labSendEvidence').onclick=attach;$('labContinueReport').onclick=()=>{try{attach();sessionStorage.removeItem('networkConfigurator.report.import');sessionStorage.setItem('networkConfigurator.report.handoff',JSON.stringify({from:'simulation',projectId:context.projectId,scenarioCount:records.length}));location.assign('/reporting?view=design&from=simulation&section=simulation');}catch(e){$('labResultStatus').textContent='Report transfer failed: '+e.message;}};
const payload=()=>({name:(context.report.name||model.technology)+' simulation',language:$('simulationReportLanguage').value,scenarios:records});
$('simulationPdf').onclick=()=>{try{window.SimulationReport.print(payload());}catch(e){$('simulationExportStatus').textContent=e.message;}};
$('simulationWord').onclick=async()=>{try{await window.SimulationReport.word(payload());$('simulationExportStatus').textContent='Word report downloaded.';}catch(e){$('simulationExportStatus').textContent=e.message;}};
$('labImport').onclick=()=>location.reload();
$('syntheticRun').onclick=()=>{$('labEvidence').textContent=JSON.stringify(current,null,2);};
document.querySelector('header .badge').textContent=model.technology+' · '+displayVendor+' · Synthetic simulation';
$('wbPolicies').textContent='Parameters';
if(isPair)setupPairUi();
const visualStyle=document.createElement('style');visualStyle.textContent='@keyframes topology-alarm{50%{stroke-opacity:.4}}.topology-alarm{animation:topology-alarm 1.8s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.topology-alarm{animation:none}}';document.head.append(visualStyle);
for(const legend of document.querySelectorAll('.synthetic-legend')){legend.dataset.workspaceLegend='true';legend.textContent=('→ Selected path')+' · × Failed · Ⅱ Blocked · ? Unverified · ! Partial · ↻ Role changed';}
visualStyle.textContent+=' .synthetic-legend[data-workspace-legend]{max-width:calc(100% - 52px);white-space:normal;line-height:1.5}';
render();
})();
