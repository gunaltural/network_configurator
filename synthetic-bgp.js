/* Deterministic design model: no network OS, packets, real sessions or timers. */
(function(root){'use strict';
function evaluate(model,downNodes=[],downLinks=[]){
 const nodes=new Map(model.nodes.map(n=>[n.id,n])),failedNodes=new Set(downNodes),failedLinks=new Set(downLinks);
 if(nodes.size!==4||nodes.size!==model.nodes.length||!nodes.has('ce1')||!nodes.has('ce2')||!nodes.has('isp1')||!nodes.has('isp2'))throw Error('The pilot requires unique ce1, ce2, isp1 and isp2 devices.');
 if([...nodes.values()].some(n=>!Number.isInteger(n.asn)||n.asn<1||n.asn>4294967295))throw Error('Use valid integer AS numbers.');
 if(['isp1','isp2'].some(id=>nodes.get(id).asn===nodes.get('ce1').asn))throw Error('Upstreams must use an external AS in this model.');
 if(nodes.get('ce1').asn!==nodes.get('ce2').asn)throw Error('This model requires both CE devices in the same AS.');
 if(nodes.get('isp1').prefix!==nodes.get('isp2').prefix)throw Error('This model requires both upstreams to advertise the same test prefix.');
 if(new Set(model.links.map(l=>l.id)).size!==model.links.length)throw Error('Connection IDs must be unique.');
 if(model.links.some(l=>l.a===l.b||l.a.startsWith('isp')&&l.b.startsWith('isp')))throw Error('This pilot supports CE–ISP circuits and a CE interconnect only.');
 if(model.links.some(l=>!nodes.has(l.a)||!nodes.has(l.b)||!Number.isFinite(l.localPreference)||l.localPreference<0))throw Error('Check link endpoints and Local Preference values.');
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
 return {engine:'Synthetic BGP design model v1',destination:nodes.get('isp1').prefix,downNodes:[...failedNodes],downLinks:[...failedLinks],adjacencies,routes,assumptions:['Both upstreams advertise the same test prefix without filtering.','Available CE interconnect permits direct iBGP exchange and usable next hops.','Rank by Local Preference, then prefer a directly connected eBGP exit; final ties use connection ID for deterministic visualization.','AS-path differences, MED, weight, communities, route filtering, recursive next-hop resolution, VRFs, ECMP, traffic volume, packet loss and convergence timers are not modeled.']};
}
root.SyntheticBGP={evaluate};if(typeof module!=='undefined')module.exports=root.SyntheticBGP;
})(typeof window==='undefined'?globalThis:window);
