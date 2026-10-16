/* Shared deterministic design engine. Never executes device commands. */
(function(root){'use strict';
const modules=['BASIC','BGP','OSPF','STP','VPC','EVPN','QOS','SDWAN'];
function normalize(context){
 const r=context.report,module=r?.source?.module;
 if(!modules.includes(module))throw Error('This workspace has no configured simulation model.');
 const nodes=(r.devices||[]).map(n=>({...n})),ids=new Set(nodes.map(n=>n.id));
 if(!nodes.length||ids.size!==nodes.length)throw Error('The design needs unique devices.');
 const links=[...(r.links||[]).map(l=>({...l,kind:l.kind||'Connection'})),...(r.specialLinks||[]).map((l,i)=>({...l,id:l.id||'special-'+i,logical:l.logical===true}))].filter(l=>l.enabled!==false);
 if(new Set(links.map(l=>l.id)).size!==links.length||links.some(l=>!ids.has(l.a)||!ids.has(l.b)))throw Error('The design contains invalid or duplicate connections.');
 return {module,vendor:r.vendor,technology:r.technology,nodes,links,settings:context.settings||{},bgp:context.bgp||null};
}
function shortest(model,source,target,downNodes=[],downLinks=[],costs={},allowed=()=>true){
 const failed=new Set(downNodes),disabled=new Set(downLinks),dist=new Map(),prev=new Map(),pending=new Set(model.nodes.map(n=>n.id).filter(id=>!failed.has(id)));
 if(!pending.has(source)||!pending.has(target))return null;
 dist.set(source,0);
 while(pending.size){const a=[...pending].sort((a,b)=>(dist.get(a)??Infinity)-(dist.get(b)??Infinity)||a.localeCompare(b))[0];if(!Number.isFinite(dist.get(a)))break;pending.delete(a);if(a===target)break;
  for(const l of model.links){if(disabled.has(l.id)||l.enabled===false||!allowed(l))continue;const b=l.a===a?l.b:l.b===a?l.a:null;if(!pending.has(b))continue;const weight=Number(costs[l.id]??l.cost??1);if(!Number.isFinite(weight)||weight<=0)throw Error('Link cost must be positive.');const d=dist.get(a)+weight;if(d<(dist.get(b)??Infinity)){dist.set(b,d);prev.set(b,{a,link:l.id});}}
 }
 if(!dist.has(target))return null;const nodes=[target],links=[];let p=target;while(p!==source){const v=prev.get(p);if(!v)return null;links.unshift(v.link);nodes.unshift(v.a);p=v.a;}return {nodes,links,cost:dist.get(target)};
}
function stpTree(model,downNodes,downLinks,preferredRoot){
 const healthy=model.nodes.filter(n=>!downNodes.includes(n.id)),rank=n=>n.id===preferredRoot?0:n.tier==='upper'?1:2,rootNode=healthy.sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id))[0],tree=new Set();
 if(rootNode)for(const n of healthy){const p=shortest(model,n.id,rootNode.id,downNodes,downLinks,{},l=>!l.logical);for(const id of p?.links||[])tree.add(id);}
 return {root:rootNode?.id||null,links:tree};
}
function evaluate(model,state={},options={}){
 const dn=state.devices||[],dl=state.links||[],source=options.source||model.nodes[0].id,target=options.target||model.nodes.at(-1).id;
 const failed=new Set(dn),disabled=new Set(dl),notes=[],findings=[];
 let allowed=l=>!l.logical,path,baseline,rootState=null;
 if(model.module==='BASIC')allowed=()=>true;
 const active=l=>!failed.has(l.a)&&!failed.has(l.b)&&!disabled.has(l.id);
 if(model.module==='STP'){
  rootState=stpTree(model,dn,dl,options.preferredRoot||model.settings.preferredRoot);const initial=stpTree(model,[],[],model.settings.preferredRoot);
  allowed=l=>rootState.links.has(l.id);path=shortest(model,source,target,dn,dl,{},allowed);baseline=shortest(model,source,target,[],[],{},l=>initial.links.has(l.id));
  notes.push('Synthetic equal-cost spanning tree; preferred configured core wins while available. Equal bridge priorities use device ID as a deterministic tie-break, not a learned bridge MAC.');
 }else if(model.module==='EVPN'){
  allowed=l=>true;notes.push('Logical EVPN session connectivity only. Imported overlay sessions do not establish an operational physical underlay or VNI forwarding.');
 }else if(model.module==='VPC'){
  allowed=l=>!l.logical&&!/keepalive|DAD|DFS|MAD|peer control/i.test(l.kind);
  const peers=model.nodes.filter(n=>n.tier==='upper').slice(0,2),peerLinks=model.links.filter(l=>/peer-link|SVL|stack.*link/i.test(l.kind)),liveness=model.links.filter(l=>/keepalive|DAD|DFS|MAD/i.test(l.kind));
  const peerUp=peerLinks.some(active),bothAlive=peers.length===2&&peers.every(n=>!failed.has(n.id));
  if(peerLinks.length&&!peerUp&&bothAlive)findings.push({severity:'critical',code:liveness.length&&!liveness.some(active)?'DUAL_LINK_FAILURE':'PEER_LINK_FAILURE',description:'Peer-link unavailable. Forwarding is conditional on vendor role and dual-active protection; inspect the vendor findings.'});
  else if(peerUp&&peerLinks.some(l=>!active(l)))findings.push({severity:'warning',code:'PEER_LINK_REDUNDANCY_LOST',description:'A physical peer-link member is unavailable; another modeled member survives.'});
  if(liveness.length&&!liveness.some(active)&&bothAlive)findings.push({severity:'warning',code:'LIVENESS_LOST',description:'All configured independent liveness paths are unavailable.'});
  const controls=model.links.filter(l=>/peer control/i.test(l.kind));
  if(bothAlive&&controls.some(l=>!active(l)))findings.push({severity:'critical',code:'MLAG_CONTROL_DOWN',description:'MLAG control session unavailable; peer association and forwarding require vendor-specific recovery assessment.'});
  const stack=model.links.filter(l=>/Stack interconnect/i.test(l.kind));
  if(bothAlive&&stack.length&&!stack.some(active))findings.push({severity:'critical',code:'STACK_PARTITION',description:'All imported stack interconnects are unavailable with both members alive. Multi-active detection and member recovery determine forwarding.'});
  notes.push('Physical attachment path; LACP, VLAN, orphan-port and peer role behavior must also permit forwarding.');
 }else if(model.module==='OSPF')notes.push('Shortest path by modeled OSPF cost. Assumes compatible area, timers, authentication and MTU; no packet or convergence timer simulation.');
 else if(model.module==='QOS')notes.push('Policy arithmetic for the selected offered rate; queue scheduling, bursts and packet loss are not emulated.');
 else if(model.module==='BASIC')notes.push('Configured management endpoint reachability; server process health and authentication acceptance are separate.');
 else if(model.module==='SDWAN')notes.push('Configured local WAN transport availability. No remote-site tunnels or application SLA state are inferred.');
 if(model.module==='BGP'&&model.bgp){
  const b=model.bgp,ces=b.nodes.filter(n=>n.id.startsWith('ce')),isps=b.nodes.filter(n=>n.id.startsWith('isp')),internal={nodes:b.nodes,links:b.links.filter(l=>l.a.startsWith('ce')&&l.b.startsWith('ce'))};
  const start=options.bgpSource||ces[0]?.id,owner=options.bgpTarget||start;
  const candidates=[];
  for(const l of b.links){const ce=[l.a,l.b].find(id=>id.startsWith('ce')),isp=[l.a,l.b].find(id=>id.startsWith('isp'));if(!ce||!isp||dn.includes(isp)||dn.includes(ce)||dl.includes(l.id))continue;
   const route=shortest(internal,options.direction==='inbound'?owner:start,ce,dn,dl);if(!route)continue;
   const policy=options.policies?.[l.id]||l;
   candidates.push({nodes:options.direction==='inbound'?[isp,...route.nodes.slice().reverse()]:[...route.nodes,isp],links:options.direction==='inbound'?[l.id,...route.links.slice().reverse()]:[...route.links,l.id],localPreference:Number(policy.localPreference??l.localPreference),prependCount:Number(policy.prependCount??l.prependCount??0),externalLink:l.id});
  }
  candidates.sort((a,b)=>options.direction==='inbound'?a.prependCount-b.prependCount||a.externalLink.localeCompare(b.externalLink):b.localPreference-a.localPreference||a.links.length-b.links.length||a.externalLink.localeCompare(b.externalLink));
  path=candidates[0]||null;
  if(dn.length||dl.length||options.policies)baseline=evaluate(model,{}, {...options,policies:null}).path;else baseline=path;
  notes.push('BGP Local Preference / AS-path subset; internal transport must be explicitly configured. No internal link is invented for larger CE designs.');
  return {module:model.module,path,baseline,candidates,notes,findings,status:path?'reachable':'no-path'};
 }
 if(path===undefined)path=shortest(model,source,target,dn,dl,options.costs||{},allowed);
 if(baseline===undefined)baseline=shortest(model,source,target,[],[],{},allowed);
 const affected=model.links.filter(l=>!active(l)).map(l=>l.id);
 let status=path?'reachable':'no-path';if(source===target){status=failed.has(source)?'no-path':'same-device';notes.push('Select distinct source and destination devices to assess a traffic path.');}if(model.module==='VPC'&&findings.some(f=>f.severity==='critical')&&path)status='conditional';
 const rate=Math.max(0,Number(options.offeredRate??100)),limits=[model.settings.shapeRate,model.settings.policeRate].map(Number).filter(v=>v>0),limit=limits.length?Math.min(...limits):0;
 const qos=model.module==='QOS'?{offeredMbps:rate,limitMbps:limit||null,admittedMbps:path?limit?Math.min(rate,limit):rate:0,excessMbps:path&&limit?Math.max(0,rate-limit):0}:null;
 return {module:model.module,path,baseline,notes,findings,status,affected,root:rootState?.root||null,blockedLinks:rootState?model.links.filter(l=>!l.logical&&active(l)&&!rootState.links.has(l.id)).map(l=>l.id):[],qos};
}
root.WorkspaceSimulationEngine={normalize,shortest,evaluate,modules};
})(typeof window==='undefined'?globalThis:window);
