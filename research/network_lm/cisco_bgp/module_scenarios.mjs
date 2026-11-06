/* Original Cisco BGP teaching cases from our own simulation engine.
   No production mutation, devices, packets or real BGP are involved.
   Failure-group heldouts are excluded from training.
*/
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
const require=createRequire(import.meta.url);
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'../../..');
const {evaluate}=require(resolve(root,'synthetic-bgp.js'));
const knowledge=JSON.parse(readFileSync(resolve(dir,'internal_module_knowledge.json'),'utf8'));
const sourceSha256=createHash('sha256').update(readFileSync(resolve(root,'synthetic-bgp.js'))).digest('hex');
export const SCENARIO_GROUPS=Object.freeze([
  {id:'base',split:'train',devices:[],links:[]},
  {id:'wan1',split:'train',devices:[],links:['wan1']},
  {id:'wan2',split:'train',devices:[],links:['wan2']},
  {id:'interconnect',split:'train',devices:[],links:['interconnect']},
  {id:'isp1',split:'train',devices:['isp1'],links:[]},
  {id:'isp2',split:'train',devices:['isp2'],links:[]},
  {id:'ce1',split:'val',devices:['ce1'],links:[]},
  {id:'ce2',split:'val',devices:['ce2'],links:[]},
  {id:'wan1-interconnect',split:'test',devices:[],links:['wan1','interconnect']},
  {id:'wan2-interconnect',split:'test',devices:[],links:['wan2','interconnect']},
  {id:'both-isps',split:'test',devices:['isp1','isp2'],links:[]},
  {id:'ce1-wan2',split:'test',devices:['ce1'],links:['wan2']},
  {id:'ce2-wan1',split:'test',devices:['ce2'],links:['wan1']},
  {id:'both-ces',split:'test',devices:['ce1','ce2'],links:[]},
]);
export function buildModel(i){
 const a=(i%3===0?120:200)+(i%5),b=(i%3===0?230:100)+(i%7);
 const p1=(i%4===0?3:0),p2=(i%4===1?2:0),octet=20+(i%110);
 return {nodes:[
   {id:'ce1',hostname:'CE-1',asn:65001,prefix:'10.'+octet+'.0.0/24'},
   {id:'ce2',hostname:'CE-2',asn:65001,prefix:'10.'+(octet+1)+'.0.0/24'},
   {id:'isp1',hostname:'ISP-1',asn:64501,prefix:'198.18.0.0/24'},
   {id:'isp2',hostname:'ISP-2',asn:64502,prefix:'198.18.0.0/24'},
 ],links:[
   {id:'wan1',a:'ce1',b:'isp1',localPreference:a,prependCount:p1},
   {id:'wan2',a:'ce2',b:'isp2',localPreference:b,prependCount:p2},
   {id:'interconnect',a:'ce1',b:'ce2',localPreference:100,prependCount:0},
 ]};
}
function code(s){
 const map={'reachable':'PATH_AVAILABLE','no-path':'NO_MODELED_PATH',
            'device-down':'DEVICE_FAILED','no-gateway':'NO_MODELED_GATEWAY'};
 if(!(s in map))throw Error('Unexpected synthetic simulator status: '+s);
 return map[s];
}
function modelExit(route){
 return route.state==='device-down'?'DEVICE_FAILED':
        !route.selected?'NO_MODELED_PATH':route.selected.isp.toUpperCase();
}
export function buildCases(){
 const scenarios=[];
 for(const group of SCENARIO_GROUPS){
  const variants=group.split==='train'?32:group.split==='val'?5:4;
  for(let i=0;i<variants;i++){
    const model=buildModel(i);
    const out=evaluate(model,group.devices,group.links,{
      target:'ce1', preferredActive:i%2===0?'ce1':'ce2',
      clientPrefix:'10.'+(140+i%60)+'.0.0/24'
    });
    const ce1=out.routes.find(x=>x.source==='ce1');
    const ownerIsolated=out.inboundRoutes.every(x=>x.state==='no-path');
    const lc=model.links;
    const prompt=[
      'Synthetic 2CE/2ISP BGP Design scenario. No physical network telemetry.',
      'Topology: CE1-AS65001 <wan1> ISP1-AS64501; CE2-AS65001 <wan2> ISP2-AS64502; CE1 <interconnect> CE2.',
      'Both CEs attach to a shared client LAN; CE1 separately owns prefix '+model.nodes[0].prefix+'.',
      'Imported local preference: wan1='+lc[0].localPreference+'; wan2='+lc[1].localPreference+'.',
      'Export AS_PATH prepend: wan1='+lc[0].prependCount+'; wan2='+lc[1].prependCount+'.',
      'Preferred client gateway: '+(i%2===0?'CE1':'CE2')+'.',
      'Failed devices: '+(group.devices.join(',')||'none')+'. Failed links: '+(group.links.join(',')||'none')+'.',
      'Predict only deterministic SIMULATION states and acknowledge what cannot be inferred.'
    ].join('\n');
    const completion=[
      'CE1_EXIT='+modelExit(ce1),
      'CE1_PREFIX_INBOUND='+(ownerIsolated?'NO_MODELED_PATH':'PATH_AVAILABLE'),
      'SHARED_LAN_INBOUND='+code(out.internetInbound.state),
      'CLIENT_OUTBOUND='+code(out.clientOutbound.state),
      'LIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING',
    ].join('\n');
    scenarios.push({
      id:'sim-'+group.id+'-'+String(i).padStart(2,'0'),
      scenario_id:'failgroup-'+group.id,
      split:group.split,
      input:prompt,
      completion,
      provenance:{
        source:'synthetic-bgp.js',source_sha256:sourceSha256,
        source_contract:'synthetic-bgp.js:1-70',
        knowledge:['SIM-OUTBOUND','SIM-INBOUND','SIM-CE-OWNED','SIM-CLIENT','SIM-RESTORE'],
        engine:out.engine,live_verification:false
      }
    });
  }
 }
 if(scenarios.length!==226)throw Error('Unexpected scenario coverage');
 if(knowledge.facts.length<10 || !knowledge.source_files.includes('synthetic-bgp.js'))
   throw Error('Missing original design knowledge catalog');
 return scenarios;
}
export function emitJsonl(){
 return buildCases().map(x=>JSON.stringify(x)).join('\n')+'\n';
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.stdout.write(emitJsonl());
}
