/* Shared, vendor-aware engineering finding contract.
 * Each technology is a versioned, separately deployable knowledge package.
 * No missing/unsupported parser can manufacture a GOOD compliance result.
 */
(function(root){'use strict';
const byTechnology=new Map();
const statuses=['GOOD','RISK','VERIFY','NA'];
const known=['STP','BGP','OSPF','EVPN','VPC','SDWAN','DCI','SYSTEM'];
const toString=v=>String(v==null?'':v);
const uniq=items=>[...new Set(items)];
const freeze=entry=>Object.freeze(entry);
const LIMITS={controls:500,findings:2000,devices:500,lines:150};
function checkTechnology(technology){
 const t=toString(technology).trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9_-]{1,31}$/.test(t))throw Error('Invalid technology knowledge namespace');
 return t;
}
function register(packageSpec){
 if(!packageSpec||typeof packageSpec!=='object')throw Error('Knowledge package descriptor is required');
 const technology=checkTechnology(packageSpec.technology);
 if(byTechnology.has(technology))throw Error('Duplicate knowledge package for '+technology);
 const version=toString(packageSpec.knowledgeVersion);
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Knowledge package requires semantic version');
 if(typeof packageSpec.evaluate!=='function')throw Error(technology+' has no deterministic evaluation adapter');
 if(!Array.isArray(packageSpec.controls)||!packageSpec.controls.length||packageSpec.controls.length>LIMITS.controls)throw Error('Knowledge package must register a bounded control catalogue');
 if(!Array.isArray(packageSpec.vendors)||!packageSpec.vendors.length)throw Error('Knowledge package requires a vendor support declaration');
 const ids=new Set();
 const controls=packageSpec.controls.map(c=>{
  if(!c||!c.id||!c.family||!Array.isArray(c.sources)||!c.sources.length)throw Error('Invalid knowledge rule');
  const id=toString(c.id).trim().toUpperCase();
  if(!/^[A-Z][A-Z0-9_-]{3,64}$/.test(id)||ids.has(id))throw Error('Duplicate/invalid control id: '+id);
  ids.add(id);
  return freeze({id,family:toString(c.family),sources:uniq(c.sources.map(toString)),
   verification:uniq((c.verification||[]).map(toString)),
   findingPrefixes:freeze(uniq((c.findingPrefixes||[]).map(toString))),
   purpose:toString(c.purpose),applicableWhen:toString(c.applicableWhen),
   absenceImpact:toString(c.absenceImpact),acceptance:toString(c.acceptance)});
 });
 const descriptor=freeze({
  technology,knowledgeVersion:version,status:toString(packageSpec.status||'EXPERIMENTAL'),
  vendors:freeze(uniq(packageSpec.vendors.map(toString))),
  description:toString(packageSpec.description),controls:freeze(controls),
  references:freeze((packageSpec.references||[]).map(r=>freeze({title:toString(r.title),url:toString(r.url)}))),
  evaluate:packageSpec.evaluate,
  planVerification:typeof packageSpec.planVerification==='function'?packageSpec.planVerification:null,
  resolveVerification:typeof packageSpec.resolveVerification==='function'?packageSpec.resolveVerification:null});
 byTechnology.set(technology,descriptor);
 return describe(technology);
}
function describe(technology){
 const p=byTechnology.get(checkTechnology(technology));
 if(!p)return {technology:checkTechnology(technology),status:'NOT_IMPLEMENTED',controls:[],vendors:[],references:[]};
 return {technology:p.technology,version:p.knowledgeVersion,status:p.status,
  vendors:[...p.vendors],description:p.description,
  controls:p.controls.map(c=>({id:c.id,family:c.family,sources:[...c.sources],verification:[...c.verification]})),
  references:p.references.map(r=>({...r}))};
}
function list(){
 return uniq([...known,...byTechnology.keys()]).map(describe);
}
function unsupported(technology,workspace,deviceIds){
 const ids=uniq(deviceIds||[]),nodes=(workspace?.nodes||[]).filter(n=>ids.includes(n.id));
 return {kind:'network-engineering-findings-v1',technology,knowledgeVersion:null,
  moduleStatus:'NOT_IMPLEMENTED',devices:nodes.length,
  findings:[{id:technology+'-KNOWLEDGE-MISSING',technology,title:technology+' knowledge package not yet implemented',
   status:'VERIFY',severity:'NONE',confidence:'UNSUPPORTED_ENGINE',
   devices:nodes.map(x=>x.hostname),deviceIds:nodes.map(x=>x.id),interfaces:[],
   expected:'A versioned, vendor-aware parser and control catalogue for the selected technology.',
   observed:'No validated deterministic assessment package is registered.',
   explanation:'Selecting a module does not prove that its engineering controls have been evaluated.',
   networkImpact:'Cannot conclude technology design compliance or operational health.',
   recommendation:'Install and test a vendor-specific knowledge package before making a compliance decision.',
   verification:[],evidence:[],references:[],limitations:[],provenance:'MISSING_ENGINE',
   verificationTask:{owner:'Network Engineering',reviewer:'Knowledge Maintainer',
    action:'Implement and test the technology-specific engineering knowledge package before rerunning this assessment.',
    acceptance:'The registered vendor-specific adapter parses the selected configs and its regression tests pass.',commands:[]}}],
  counts:{GOOD:0,RISK:0,VERIFY:1,NA:0},
  limitations:['Technology-specific deterministic evaluation is not available. No positive assessment generated.']};
}
function run(args){
 if(!args||!args.workspace)throw Error('Workspace is required for engineering evaluation');
 const technology=checkTechnology(args.technology||'STP');
 const pack=byTechnology.get(technology);
 if(!pack)return unsupported(technology,args.workspace,args.deviceIds||[]);
 const result=pack.evaluate({...args,technology});
 if(!result||!Array.isArray(result.findings)||result.findings.length>LIMITS.findings)throw Error(technology+' adapter must return a bounded list of evidence-based findings');
 const ids=new Set(),counts={GOOD:0,RISK:0,VERIFY:0,NA:0};
 const findings=result.findings.map(original=>{
  const raw=pack.resolveVerification?pack.resolveVerification(original,{...args,technology}):original;
  if(!raw||typeof raw!=='object'||!raw.id||!statuses.includes(raw.status))throw Error(technology+' adapter emitted invalid finding');
  if(ids.has(raw.id))throw Error(technology+' adapter emitted duplicate finding '+raw.id);
  ids.add(raw.id);
  // A technical "GOOD" requires identifiable positive evidence, not empty inference.
  if(raw.status==='GOOD'&&!(raw.evidence||[]).length)
   throw Error('GOOD outcome has no positive evidence: '+raw.id);
  const finding={
   id:toString(raw.id),technology,title:toString(raw.title),
   status:raw.status,severity:toString(raw.severity||'NONE'),confidence:toString(raw.confidence||'UNKNOWN'),
   devices:uniq(raw.devices||[]),deviceIds:uniq(raw.deviceIds||[]),interfaces:uniq(raw.interfaces||[]),
   expected:toString(raw.expected),observed:toString(raw.observed),
   explanation:toString(raw.explanation),networkImpact:toString(raw.networkImpact),
   recommendation:toString(raw.recommendation),
   verification:uniq(raw.verification||[]).map(toString),
   evidence:uniq(raw.evidence||[]).slice(0,LIMITS.lines).map(toString),
   references:(raw.references||[]).map(r=>({title:toString(r.title),url:toString(r.url)})),
   limitations:(raw.limitations||[]).map(toString),provenance:toString(raw.provenance||'DESIGN_CONFIG')
  };
  if(!finding.expected||!finding.observed||!finding.explanation||!finding.recommendation)throw Error('Incomplete engineering finding: '+finding.id);
  if(finding.status==='VERIFY'){
   const planned=pack.planVerification?.(finding)||{};
   finding.verificationTask={owner:toString(planned.owner||'Network Operations'),
    reviewer:toString(planned.reviewer||'Network Engineering'),
    action:toString(planned.action||finding.recommendation),
    acceptance:toString(planned.acceptance||finding.expected),
    commands:[...finding.verification]};
  }
  counts[finding.status]++;
  return finding;
 });
 return {...result,kind:'network-engineering-findings-v1',technology,
  knowledgeVersion:pack.knowledgeVersion,moduleStatus:pack.status,
  registeredControls:pack.controls.length,counts,findings};
}
root.NetworkEngineeringFindingsV1={run,register,describe,list,version:'2.0.0',statuses:freeze(statuses),knownTechnologies:freeze(known)};
})(typeof window==='undefined'?globalThis:window);
