// Additive, read-only failure analysis; no CLI changes or live-state claims.
export const vendorProfiles = Object.freeze({
 "Cisco NX-OS": {peer:"vPC peer-link lost: with keepalive reachable, secondary generally suspends vPC members; inspect orphan ports.", keep:"Keepalive lost while peer-link remains up: degraded detection; not normally immediate port suspension.", both:"Peer-link and keepalive lost: dual-active/isolation risk."},
 "Arista EOS": {peer:"MLAG peer-link lost: outcome depends on peer heartbeat, primary role and recovery timers.", keep:"MLAG heartbeat lost with peer-link operational: degraded failure discrimination.", both:"MLAG peer-link and heartbeat lost: potential split-brain; inspect configured reload-delay and detection."},
 "Huawei CloudEngine": {peer:"M-LAG peer-link lost: outcome depends on DFS heartbeat, role and MAD configuration.", keep:"DFS heartbeat lost with peer-link operational: failure detection degraded.", both:"M-LAG peer-link and DFS heartbeat lost: dual-active risk; consult platform/version and MAD design."},
 "Cisco_StackWise": {peer:"StackWise Virtual Link lost while DAD is available: standby takes active role; original active enters recovery and disables non-exempt interfaces after dual-active detection. Check platform and software release.", keep:"Dual-active detection path lost: detection redundancy reduced.", both:"SVL and DAD paths both unavailable: dual-active conflict risk, because the original active may not receive the recovery indication."},
 "Cisco IOS-XE": {peer:"StackWise Virtual Link lost while DAD is available: standby takes active role; original active enters recovery and disables non-exempt interfaces after dual-active detection. Check platform and software release.", keep:"Dual-active detection path lost: detection redundancy reduced.", both:"SVL and DAD paths both unavailable: dual-active conflict risk, because the original active may not receive the recovery indication."}
});
export function changeFailures(current={},action,kind,ids=[]) {
 if(!["fail","restore","reset"].includes(action) || !["devices","links"].includes(kind)) throw Error("Invalid failure action");
 if(action==="reset") return {devices:[],links:[],selectedDevices:[],selectedLinks:[]};
 const next={devices:[...new Set(current.devices||[])],links:[...new Set(current.links||[])],
   selectedDevices:[...(current.selectedDevices||[])],selectedLinks:[...(current.selectedLinks||[])]};
 const set=new Set(next[kind]);
 for(const id of new Set(ids)){if(action==="fail")set.add(id);else set.delete(id);}
 next[kind]=[...set];
 if(action==="restore") { const choice=kind==="devices"?"selectedDevices":"selectedLinks";next[choice]=next[choice].filter(id=>!ids.includes(id)); }
 return next;
}
export function analyzeMlagFailure({vendor,failed=[]}={}) {
 const p=vendorProfiles[vendor];if(!p)throw Error("Unsupported vendor");
 const f=new Set(failed),out=[];
 const add=(severity,code,description)=>out.push({severity,code,description});
 if(f.has("nodeA")&&f.has("nodeB"))add("critical","PAIR_DOWN","Both peers down: pair-level outage expected.");
 else if(f.has("nodeA")||f.has("nodeB"))add("warning","NODE_DOWN","One peer down; dependent single-homed endpoints may fail.");
 if(f.has("peerLink1")!==f.has("peerLink2"))add("warning","PEER_LINK_REDUNDANCY_LOST","One physical peer-link member failed; the remaining member maintains the logical port-channel if operational and capacity is sufficient.");
 if(f.has("nodeA")||f.has("nodeB")){
   if(f.has("peerLink"))add("warning","LINK_FAILED_WITH_NODE_DOWN","Peer-link unavailable and at least one peer down; dual-active cannot be inferred because both peers are not confirmed operational.");
   if(f.has("keepalive"))add("warning","LIVENESS_WITH_NODE_DOWN","Liveness path also unavailable; examine surviving peer recovery timers and role.");
 } else if(f.has("peerLink")&&f.has("keepalive"))add("critical","DUAL_LINK_FAILURE",p.both);
 else if(f.has("peerLink"))add("critical","PEER_LINK_FAILURE",p.peer);
 else if(f.has("keepalive"))add("warning","KEEPALIVE_FAILURE",p.keep);
 if(f.has("uplinkA")&&f.has("uplinkB"))add("critical","UPLINKS_DOWN","Both modeled external uplinks down.");
 else if(f.has("uplinkA")||f.has("uplinkB"))add("warning","UPLINK_DOWN","One uplink down; validate alternative reachability and capacity.");
 return {vendor,findings:out.length?out:[{severity:"normal",code:"HEALTHY",description:"No modeled failures."}],modeled:true,liveTelemetry:false};
}
// Physical graph reachability only. BGP sessions, routes, policies and timers are NOT inferred.
export function analyzeBgpConnectivity({nodes=[],links=[],failures={},source}={}) {
 const ids=new Set(nodes.map(n=>n.id));if(!ids.has(source))throw Error("Unknown source");
 const downNodes=new Set(failures.devices||[]),downLinks=new Set(failures.links||[]);
 const graph=new Map([...ids].filter(id=>!downNodes.has(id)).map(id=>[id,[]]));
 for(const l of links)if(!downLinks.has(l.id)&&graph.has(l.from)&&graph.has(l.to)){graph.get(l.from).push(l.to);graph.get(l.to).push(l.from);}
 const seen=new Set(),q=[];if(graph.has(source)){seen.add(source);q.push(source);}
 for(let i=0;i<q.length;i++)for(const n of graph.get(q[i]))if(!seen.has(n)){seen.add(n);q.push(n);}
 return {reachable:[...seen],unreachable:[...ids].filter(id=>!seen.has(id)),limitation:"Physical graph only; not a BGP best-path or convergence prediction."};
}
