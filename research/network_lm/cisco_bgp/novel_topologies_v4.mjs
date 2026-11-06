/* Independent synthetic V4 topology holdout, evaluation only.
 * No V4 text may be used in tokenizer fitting or gradient training.
 * This uses the original read-only BGP simulation engine as source.
 */
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {buildModel,SCENARIO_GROUPS} from "./module_scenarios.mjs";
const require=createRequire(import.meta.url);
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,"../../..");
const {evaluate}=require(resolve(root,"synthetic-bgp.js"));
const srcSha=createHash("sha256").update(readFileSync(resolve(root,"synthetic-bgp.js"))).digest("hex");
const heldout=SCENARIO_GROUPS.filter(x=>x.split==="test");
if(heldout.length!==6)throw Error("Evaluation failure groups changed");

const modelFor=i=>{
 const model=buildModel(300+i);
 const ceAs=65120+i,ispAs1=64450+i,ispAs2=64550+i;
 model.nodes[0].asn=model.nodes[1].asn=ceAs;
 model.nodes[2].asn=ispAs1;model.nodes[3].asn=ispAs2;
 model.nodes[0].prefix="172."+(20+i)+".40.0/24";
 model.nodes[1].prefix="172."+(20+i)+".41.0/24";
 model.nodes[2].prefix=model.nodes[3].prefix="198.19."+(30+i)+".0/24";
 model.links[0].localPreference=110+(i*37)%130;
 model.links[1].localPreference=125+(i*61)%130;
 model.links[0].prependCount=(i+2)%4;
 model.links[1].prependCount=(i+1)%4;
 return model;
};
const code=x=>({
 "reachable":"PATH_AVAILABLE","no-path":"NO_MODELED_PATH",
 "device-down":"DEVICE_FAILED","no-gateway":"NO_MODELED_GATEWAY"
})[x];
const ceExit=r=>r.state==="device-down"?"DEVICE_FAILED":
 !r.selected?"NO_MODELED_PATH":r.selected.isp.toUpperCase();
export function holdoutCases(){
 const rows=[];
 for(const group of heldout){
  for(let i=0;i<6;i++){
   const model=modelFor(i);
   const gateway=i%2?"ce1":"ce2";
   const out=evaluate(model,group.devices,group.links,{
     target:"ce1",preferredActive:gateway,
     clientPrefix:"172."+(20+i)+".50.0/24"
   });
   const ce1=out.routes.find(x=>x.source==="ce1");
   const ownerRoute=out.inboundRoutes.some(x=>x.state==="reachable"&&x.candidates.length>0);
   const answers={
     CE1_EXIT:ceExit(ce1),
     CE1_PREFIX_INBOUND:ownerRoute?"PATH_AVAILABLE":"NO_MODELED_PATH",
     SHARED_LAN_INBOUND:code(out.internetInbound.state),
     CLIENT_OUTBOUND:code(out.clientOutbound.state)
   };
   const ceAs=model.nodes[0].asn;
   const ispAs1=model.nodes[2].asn,ispAs2=model.nodes[3].asn;
   const [wan1,wan2]=model.links;
   const prompt=[
     "Synthetic 2CE/2ISP BGP Design scenario. No physical network telemetry.",
     "Topology: CE1-AS"+ceAs+" <wan1> ISP1-AS"+ispAs1+
       "; CE2-AS"+ceAs+" <wan2> ISP2-AS"+ispAs2+"; CE1 <interconnect> CE2.",
     "Both CEs attach to a shared client LAN; CE1 separately owns prefix "+model.nodes[0].prefix+".",
     "Imported local preference: wan1="+wan1.localPreference+"; wan2="+wan2.localPreference+".",
     "Export AS_PATH prepend: wan1="+wan1.prependCount+"; wan2="+wan2.prependCount+".",
     "Preferred client gateway: "+gateway.toUpperCase()+".",
     "Failed devices: "+(group.devices.join(",")||"none")+
       ". Failed links: "+(group.links.join(",")||"none")+".",
     "Predict only deterministic SIMULATION states and acknowledge what cannot be inferred."
   ].join("\n");
   for(const [field,result] of Object.entries(answers)){
     rows.push({
       id:"novel-"+group.id+"-"+String(i).padStart(2,"0")+"-"+field,
       scenario_id:"novel-v4-"+group.id,split:"test",
       input:prompt+"\nRequested simulator outcome: "+field+".",
       completion:"RESULT="+result+"\nLIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING",
       provenance:{
         source:"synthetic-bgp.js",source_sha256:srcSha,
         kind:"evaluation-only-independent-topology-v4",
         live_verification:false,
         ce_as:ceAs,isp1_as:ispAs1,isp2_as:ispAs2,
         owner_prefix:model.nodes[0].prefix,
         local_preferences:[wan1.localPreference,wan2.localPreference]
       }
     });
   }
  }
 }
 if(rows.length!==144)throw Error("Incorrect independent topology coverage");
 return rows;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.stdout.write(holdoutCases().map(x=>JSON.stringify(x)).join("\n")+"\n");
}
