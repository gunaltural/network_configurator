/* Deterministic design model: no network OS, packets, real sessions or timers. */
(function(root){'use strict';
function evaluate(model,downNodes=[],downLinks=[],options={}){
 const nodes=new Map(model.nodes.map(n=>[n.id,n])),failedNodes=new Set(downNodes),failedLinks=new Set(downLinks);
 if(nodes.size!==4||nodes.size!==model.nodes.length||!nodes.has('ce1')||!nodes.has('ce2')||!nodes.has('isp1')||!nodes.has('isp2'))throw Error('The pilot requires unique ce1, ce2, isp1 and isp2 devices.');
 if([...nodes.values()].some(n=>!Number.isInteger(n.asn)||n.asn<1||n.asn>4294967295))throw Error('Use valid integer AS numbers.');
 if(['isp1','isp2'].some(id=>nodes.get(id).asn===nodes.get('ce1').asn))throw Error('Upstreams must use an external AS in this model.');
 if(nodes.get('ce1').asn!==nodes.get('ce2').asn)throw Error('This model requires both CE devices in the same AS.');
 if(nodes.get('isp1').prefix!==nodes.get('isp2').prefix)throw Error('This model requires both upstreams to advertise the same test prefix.');
 if(new Set(model.links.map(l=>l.id)).size!==model.links.length)throw Error('Connection IDs must be unique.');
 if(model.links.some(l=>l.a===l.b||l.a.startsWith('isp')&&l.b.startsWith('isp')))throw Error('This pilot supports CE–ISP circuits and a CE interconnect only.');
 if(model.links.some(l=>!nodes.has(l.a)||!nodes.has(l.b)||!Number.isInteger(l.localPreference)||l.localPreference<0||l.localPreference>4294967295))throw Error('Check link endpoints and Local Preference values.');
 if(model.links.some(l=>!Number.isInteger(l.prependCount??0)||(l.prependCount??0)<0||(l.prependCount??0)>10))throw Error('AS-path prepend must be an integer from 0 to 10.');
 const active=l=>!failedLinks.has(l.id)&&!failedNodes.has(l.a)&&!failedNodes.has(l.b),adjacencies=model.links.map(l=>({id:l.id,a:l.a,b:l.b,available:active(l)}));
 const routes=['ce1','ce2'].map(source=>{
  if(failedNodes.has(source))return {source,state:'device-down',candidates:[],selected:null};
  const candidates=[];
  for(const l of model.links){if(!active(l))continue;const exit=[l.a,l.b].find(n=>n.startsWith('ce')),isp=[l.a,l.b].find(n=>n.startsWith('isp'));if(!exit||!isp)continue;
   let internal=null;if(exit!==source){internal=model.links.find(x=>active(x)&&[x.a,x.b].includes(source)&&[x.a,x.b].includes(exit));if(!internal)continue;}
   candidates.push({nodes:internal?[source,exit,isp]:[source,isp],links:internal?[internal.id,l.id]:[l.id],exit,isp,localPreference:l.localPreference,asPath:[nodes.get(isp).asn],externalLink:l.id});
  }
  candidates.sort((a,b)=>b.localPreference-a.localPreference||a.links.length-b.links.length||a.externalLink.localeCompare(b.externalLink));
  return {source,state:candidates.length?'reachable':'no-path',candidates,selected:candidates[0]||null};
 });
 const target=options.target||'ce1',owner=nodes.get(target);
 if(!target.startsWith('ce')||!owner)throw Error('Select a customer prefix owner.');
 const inboundRoutes=['isp1','isp2'].map(source=>{
  if(failedNodes.has(source))return {source,state:'device-down',candidates:[],selected:null};
  const candidates=[];
  for(const l of model.links){if(!active(l)||![l.a,l.b].includes(source))continue;const entry=[l.a,l.b].find(id=>id.startsWith('ce'));if(!entry||failedNodes.has(target))continue;
   const internal=entry===target?null:model.links.find(x=>active(x)&&[x.a,x.b].includes(entry)&&[x.a,x.b].includes(target));if(entry!==target&&!internal)continue;
   candidates.push({nodes:internal?[source,entry,target]:[source,entry],links:internal?[l.id,internal.id]:[l.id],entry,isp:source,externalLink:l.id,prependCount:l.prependCount??0,asPath:Array(1+(l.prependCount??0)).fill(owner.asn)});
  }
  candidates.sort((a,b)=>a.asPath.length-b.asPath.length||a.externalLink.localeCompare(b.externalLink));
  return {source,state:candidates.length?'reachable':'no-path',candidates,selected:candidates[0]||null};
 });
 const preferredActive=options.preferredActive||'ce1';
 if(!['ce1','ce2'].includes(preferredActive))throw Error('Select CE1 or CE2 as the preferred VRRP active router.');
 const backup=preferredActive==='ce1'?'ce2':'ce1',activeGateway=!failedNodes.has(preferredActive)?preferredActive:!failedNodes.has(backup)?backup:null;
 const clientPrefix=options.clientPrefix||nodes.get('ce1').prefix;
 const cidr=String(clientPrefix).match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
 if(!cidr||cidr[1].split('.').some(x=>+x>255)||+cidr[2]>32)throw Error('Enter a valid IPv4 client LAN prefix.');
 const gateway={preferredActive,active:activeGateway,backup:activeGateway?['ce1','ce2'].find(id=>id!==activeGateway&&!failedNodes.has(id))||null:null,failedOver:!!activeGateway&&activeGateway!==preferredActive};
 const extendOutbound=c=>({...c,nodes:['client','lan',...c.nodes,'internet'],links:['client-lan','lan-'+activeGateway,...c.links,'internet-'+c.isp]});
 const gatewayRoute=routes.find(r=>r.source===activeGateway);
 const clientCandidates=(gatewayRoute?.candidates||[]).map(extendOutbound);
 const clientOutbound={source:'client',state:!activeGateway?'no-gateway':clientCandidates.length?'reachable':'no-path',candidates:clientCandidates,selected:clientCandidates[0]||null};
 const clientInbound=['isp1','isp2'].map(isp=>{
  if(failedNodes.has(isp))return {source:isp,state:'device-down',candidates:[],selected:null};
  const candidates=model.links.filter(l=>active(l)&&[l.a,l.b].includes(isp)).flatMap(l=>{
   const entry=[l.a,l.b].find(id=>id.startsWith('ce'));
   if(!entry)return [];
   // Both healthy CEs directly attach to and advertise the shared client LAN.
   // CE-owned prefixes retain their separate interconnect dependency in inboundRoutes.
   return [{entry,isp,externalLink:l.id,prependCount:l.prependCount??0,
    asPath:Array(1+(l.prependCount??0)).fill(nodes.get(entry).asn),
    nodes:['internet',isp,entry,'lan','client'],
    links:['internet-'+isp,l.id,'lan-'+entry,'client-lan']}];
  });
  candidates.sort((a,b)=>a.asPath.length-b.asPath.length||a.externalLink.localeCompare(b.externalLink));
  return {source:isp,state:candidates.length?'reachable':'no-path',candidates,selected:candidates[0]||null};
 });
 const internetCandidates=clientInbound.flatMap(route=>route.candidates).sort((a,b)=>a.asPath.length-b.asPath.length||a.externalLink.localeCompare(b.externalLink));
 const internetInbound={source:'internet',state:internetCandidates.length?'reachable':'no-path',candidates:internetCandidates,selected:internetCandidates[0]||null};
 return {engine:'Synthetic BGP design model v4',gateway,clientPrefix,clientOutbound,clientInbound,internetInbound,destination:nodes.get('isp1').prefix,inboundDestination:owner.prefix,inboundTarget:target,inboundRoutes,downNodes:[...failedNodes],downLinks:[...failedLinks],adjacencies,routes,assumptions:['Both upstreams advertise the same external test prefix without filtering.','Available CE interconnect permits direct iBGP exchange and usable next hops.','Outbound: rank by Local Preference, then directly connected eBGP exit; final ties use connection ID for deterministic visualization.','CE-owned prefix detail: each ISP independently selects among its direct CE advertisements for the selected customer prefix. An alternate CE advertises the prefix only with an available path to its owner over the CE interconnect.','Inbound: equal upstream Local Preference, weight and filtering are assumed; shorter AS_PATH is preferred. Equal paths use connection ID only for deterministic illustration, not a vendor tie-break prediction.','Client simulation: both CEs have direct attachment to one shared client LAN and advertise its selected prefix. VRRP chooses only the client outbound gateway; inbound BGP entry may use the backup CE.','VRRP model: preferred healthy CE is active, device failure promotes the healthy backup, and restoration preempts back to the preferred CE. No timers, LAN faults or WAN route tracking are modeled.','Internet inbound selection is a simplified synthetic observer: all reachable ISP-to-CE advertisements are compared by AS-path length under equal upstream policy. Unavailable devices and circuits are excluded; equal paths use connection ID for deterministic display. This does not model provider transit, inter-ISP routing or actual Internet policy. Prepend influences preference but cannot guarantee a global inbound path.','MED, communities, route filtering, recursive next-hop resolution, VRFs, ECMP, traffic volume, packet loss and convergence timers are not modeled.']};
}
function contextSvg({width=950,ispXs=[],ceXs=[],ispTop=66,ceBottom=378,cloudY=-48,lanY=490,clientY=553,ispIds=ispXs.map((x,i)=>'isp'+(i+1)),ceIds=ceXs.map((x,i)=>'ce'+(i+1))}){
 const mid=width/2,multi=ceXs.length===2;
 return `<g data-bgp-context="true" fill="none" stroke="#91adbf" stroke-width="1.6"><title>Context illustration only. Internet transit and VRRP election are not simulated; no VRRP configuration is generated.</title>${ispXs.map((x,i)=>`<path data-context-link="internet-${ispIds[i]}" d="M ${mid+(i-(ispXs.length-1)/2)*38} ${cloudY+20} V ${cloudY+42} H ${x} V ${ispTop}" stroke-dasharray="5 4"/>`).join('')}<path d="M ${mid-62} ${cloudY+20} C ${mid-94} ${cloudY+20} ${mid-96} ${cloudY-15} ${mid-65} ${cloudY-18} C ${mid-63} ${cloudY-47} ${mid-18} ${cloudY-51} ${mid-5} ${cloudY-30} C ${mid+21} ${cloudY-57} ${mid+61} ${cloudY-41} ${mid+64} ${cloudY-17} C ${mid+99} ${cloudY-18} ${mid+101} ${cloudY+20} ${mid+65} ${cloudY+20} Z" fill="#e4eff7" stroke="#6c96b3"/><text x="${mid}" y="${cloudY+3}" text-anchor="middle" stroke="none" fill="#254f6a" font-family="Arial" font-size="13" font-weight="600">Internet</text>${ceXs.map((x,i)=>`<path data-context-link="lan-${ceIds[i]}" d="M ${mid} ${lanY} H ${x} V ${ceBottom}" stroke-dasharray="5 4"/><circle cx="${x}" cy="${lanY}" r="3" fill="#6c96b3"/>`).join('')}<path data-context-link="client-lan" d="M ${mid} ${clientY-21} V ${lanY}"/><rect x="${mid-170}" y="${lanY-12}" width="340" height="25" rx="6" fill="#edf4f9"/><text data-context-gateway="true" x="${mid}" y="${lanY+5}" text-anchor="middle" stroke="none" fill="#365e77" font-family="Arial" font-size="11">${multi?'Shared LAN · VRRP gateway concept':'Client LAN · Gateway context'}</text><rect x="${mid-35}" y="${clientY-21}" width="70" height="35" rx="5" fill="#e4eff7"/><path d="M ${mid} ${clientY+14} V ${clientY+22} M ${mid-15} ${clientY+22} H ${mid+15}"/><text x="${mid}" y="${clientY+2}" text-anchor="middle" stroke="none" fill="#254f6a" font-family="Arial" font-size="12">Client</text><text data-context-note="true" x="${mid}" y="${clientY+45}" text-anchor="middle" stroke="none" fill="#5c778a" font-family="Arial" font-size="10">Context only · ${multi?'VRRP not configured or simulated':'No client forwarding simulated'}</text></g>`;
}
root.SyntheticBGP={evaluate,contextSvg};if(typeof module!=='undefined')module.exports=root.SyntheticBGP;
})(typeof window==='undefined'?globalThis:window);
