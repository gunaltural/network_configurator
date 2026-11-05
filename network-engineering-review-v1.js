/* Technology-independent Network Engineering Design Review methodology.
 * The rule pack supplies technology semantics and validated CLI links;
 * this file only organizes evidence for management and engineering audiences.
 */
(function(root){'use strict';
 const statuses=['RISK','VERIFY','GOOD','NA'];
 const priorityLabels=['HIGH','MEDIUM','LOW','REVIEW','NONE'];
 const uniq=xs=>[...new Set(xs)];
 const txt=x=>String(x??'').trim();
 const score={CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1,NONE:0};
 function priority(f){
  if(f.status==='VERIFY')return 'REVIEW';
  if(f.status!=='RISK')return 'NONE';
  return (score[f.severity]??0)>=3?'HIGH':(score[f.severity]??0)>=2?'MEDIUM':'LOW';
 }
 function decide(f){
  const p=priority(f);
  return {id:f.id,technology:f.technology,title:f.title,status:f.status,
   priority:p,devices:uniq(f.devices||[]),impact:txt(f.networkImpact),
   action:txt(f.recommendation),confidence:txt(f.confidence),
   proof:uniq(f.evidence||[]).filter(Boolean).length};
 }
 function build(assessment){
  if(!assessment||!Array.isArray(assessment.findings))throw Error('An evidence-based assessment is required');
  const items=assessment.findings.map(decide);
  const rank={HIGH:0,MEDIUM:1,LOW:2,REVIEW:3,NONE:4};
  const actionable=items.filter(x=>x.priority!=='NONE').sort((a,b)=>rank[a.priority]-rank[b.priority]||a.title.localeCompare(b.title));
  const totals={HIGH:0,MEDIUM:0,LOW:0,REVIEW:0};
  for(const f of actionable)totals[f.priority]++;
  return {kind:'engineering-design-review-v1',technology:assessment.technology||'NETWORK',
   knowledgeVersion:assessment.knowledgeVersion||null,
   totals,actionable,good:items.filter(x=>x.status==='GOOD'),
   unassessed:items.filter(x=>x.status==='VERIFY'),
   coverage:{devices:assessment.devices||0,controls:assessment.registeredControls||0},
   caveats:uniq(assessment.limitations||[])};
 }
 // Exact CLI lines are separate from coverage counts. A supported parser may
 // supply structured locations; fallback never claims a line not in evidence.
 function evidenceLocations(f){
  const structured=f.deployment?.configured||[];
  if(structured.length)return structured.filter(x=>x.device&&x.command&&x.line);
  const out=[];
  for(const raw of f.evidence||[]){
   const m=String(raw).match(/^(.+?)\s+config L(\d+)(?:\s+\(([^)]+)\))?:\s*(.+)$/i);
   if(m)out.push({device:m[1],line:Number(m[2]),interface:m[3]||'',command:m[4],role:''});
  }
  return out;
 }
 root.NetworkEngineeringReviewV1={build,priority,evidenceLocations,version:'1.0.0'};
})(typeof window==='undefined'?globalThis:window);
