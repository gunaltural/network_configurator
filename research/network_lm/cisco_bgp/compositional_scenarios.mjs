/* Cisco BGP compositional reasoning curriculum from original simulator.
   TRAIN-ONLY failure combinations are deliberately disjoint from both old
   validation and heldout combinations. Every result is checked against
   synthetic-bgp.js, not claimed as real device diagnosis.
*/
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve, dirname} from "node:path";
import {buildModel, SCENARIO_GROUPS} from "./module_scenarios.mjs";

const require=createRequire(import.meta.url);
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir, "../../..");
const {evaluate}=require(resolve(root,"synthetic-bgp.js"));
const engine_sha=createHash("sha256").update(readFileSync(resolve(root,"synthetic-bgp.js"))).digest("hex");
const sep=(xs)=>[...xs].sort().join(",");

export const TRAIN_ONLY_COMPOSITIONS=Object.freeze([
 {id:"wan1-wan2",devices:[],links:["wan1","wan2"]},
 {id:"wan1-isp2",devices:["isp2"],links:["wan1"]},
 {id:"wan2-isp1",devices:["isp1"],links:["wan2"]},
 {id:"interconnect-isp1",devices:["isp1"],links:["interconnect"]},
 {id:"interconnect-isp2",devices:["isp2"],links:["interconnect"]},
 {id:"wan1-isp1",devices:["isp1"],links:["wan1"]},
 {id:"wan2-isp2",devices:["isp2"],links:["wan2"]},
 {id:"bothwan-interconnect",devices:[],links:["wan1","wan2","interconnect"]},
 {id:"ce1-wan1",devices:["ce1"],links:["wan1"]},
 {id:"ce1-isp1",devices:["ce1","isp1"],links:[]},
 {id:"ce1-interconnect",devices:["ce1"],links:["interconnect"]},
 {id:"ce2-wan2",devices:["ce2"],links:["wan2"]},
 {id:"ce2-isp2",devices:["ce2","isp2"],links:[]},
 {id:"ce2-interconnect",devices:["ce2"],links:["interconnect"]},
 {id:"bothisp-wan1",devices:["isp1","isp2"],links:["wan1"]},
 {id:"bothwan-isp2",devices:["isp2"],links:["wan1","wan2"]},
]);

const MODELED_FIELDS=["CE1_EXIT","CE1_PREFIX_INBOUND","SHARED_LAN_INBOUND","CLIENT_OUTBOUND"];
function state(s){
 const dict={"reachable":"PATH_AVAILABLE","no-path":"NO_MODELED_PATH",
             "device-down":"DEVICE_FAILED","no-gateway":"NO_MODELED_GATEWAY"};
 if(!Object.hasOwn(dict,s))throw Error("Unexpected simulation state: "+s);
 return dict[s];
}
function exit(route){
 return route.state==="device-down"?"DEVICE_FAILED":
   !route.selected?"NO_MODELED_PATH":route.selected.isp.toUpperCase();
}
function recordsOf(group,i){
 const model=buildModel(i+64);
 const prefs=model.links;
 const owner="ce1", prefGateway=i%2===0?"ce1":"ce2";
 const sharedPrefix="10."+(160+i%40)+".0.0/24";
 const failedDev=new Set(group.devices),failedLink=new Set(group.links);
 const simulated=evaluate(model,group.devices,group.links,{
   target:owner,preferredActive:prefGateway,clientPrefix:sharedPrefix
 });
 const ce1=simulated.routes.find(x=>x.source==="ce1");
 const ce1Direct=(!failedDev.has("ce1")&&!failedDev.has("isp1")&&!failedLink.has("wan1"));
 const ce1ViaCe2=(!failedDev.has("ce1")&&!failedDev.has("ce2")
                   &&!failedDev.has("isp2")&&!failedLink.has("interconnect")
                   &&!failedLink.has("wan2"));
 // Only if the independent dependency calculation agrees with the actual
 // simulator's candidate paths may it be used as a teaching explanation.
 const directFromEngine=ce1.candidates.some(x=>x.isp==="isp1");
 const backupFromEngine=ce1.candidates.some(x=>x.isp==="isp2");
 if(ce1Direct!==directFromEngine||ce1ViaCe2!==backupFromEngine)
   throw Error("The causal decomposition disagrees with existing simulator");
 const selected=exit(ce1);
 const ownerOut=simulated.inboundRoutes.every(x=>x.state==="no-path")
   ?"NO_MODELED_PATH":"PATH_AVAILABLE";
 const actual={
   CE1_EXIT:selected,
   CE1_PREFIX_INBOUND:ownerOut,
   SHARED_LAN_INBOUND:state(simulated.internetInbound.state),
   CLIENT_OUTBOUND:state(simulated.clientOutbound.state)
 };
 const input=[
   "Synthetic 2CE/2ISP BGP Design scenario. No physical network telemetry.",
   "Topology: CE1-AS65001 <wan1> ISP1-AS64501; CE2-AS65001 <wan2> ISP2-AS64502; CE1 <interconnect> CE2.",
   "Both CEs attach to a shared client LAN; CE1 separately owns prefix "+model.nodes[0].prefix+".",
   "Imported local preference: wan1="+prefs[0].localPreference+"; wan2="+prefs[1].localPreference+".",
   "Export AS_PATH prepend: wan1="+prefs[0].prependCount+"; wan2="+prefs[1].prependCount+".",
   "Preferred client gateway: "+prefGateway.toUpperCase()+".",
   "Failed devices: "+(group.devices.join(",")||"none")+". Failed links: "+(group.links.join(",")||"none")+".",
   "Predict only deterministic SIMULATION states and acknowledge what cannot be inferred."
 ].join("\n");
 const base={
   scenario_id:"compose-"+group.id,split:"train",
   provenance:{
     source:"synthetic-bgp.js",
     source_sha256:engine_sha,
     assumptions:"read-only original simulator, not operational Cisco state",
     direct_candidate_verified_with_engine:true,
     alternate_candidate_verified_with_engine:true,
     live_verification:false
   }
 };
 const focused=MODELED_FIELDS.map(field=>({
   ...base,id:"compose-"+group.id+"-"+i+"-"+field,
   input:input+"\nRequested simulator outcome: "+field+".",
   completion:"RESULT="+actual[field]+"\nLIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING"
 }));
 const chain={
   ...base,id:"compose-"+group.id+"-"+i+"-dependency",
   input:input+"\nExplain CE1 path dependencies in the synthetic model.",
   completion:[
     "CE1_DIRECT_WAN1="+(ce1Direct?"AVAILABLE":"UNAVAILABLE"),
     "CE1_ALTERNATE_WAN2="+(ce1ViaCe2?"AVAILABLE":"UNAVAILABLE"),
     "CE1_EXIT="+selected,
     "LIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING"
   ].join("\n")
 };
 return [...focused,chain];
}

export function composeCases({variants=12}={}){
 if(!Number.isInteger(variants)||variants<1||variants>32)
   throw Error("Invalid number of independent composition variants");
 const grouped=new Set(),all=[];
 const reserved=new Set(SCENARIO_GROUPS.map(x=>sep(x.devices)+"|"+sep(x.links)));
 for(const group of TRAIN_ONLY_COMPOSITIONS){
   const combination=sep(group.devices)+"|"+sep(group.links);
   if(reserved.has(combination))throw Error("Composition leaks a heldout or original group: "+group.id);
   if(grouped.has(combination))throw Error("Duplicate composed failure group");
   grouped.add(combination);
   for(let i=0;i<variants;i++)all.push(...recordsOf(group,i));
 }
 return all;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.stdout.write(composeCases().map(x=>JSON.stringify(x)).join("\n")+"\n");
}
