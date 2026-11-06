/* Independent AI Analysis hypothesis-review V1
 * Bounded investigation candidates assembled only from source-verified matrix facts.
 * This is a deterministic preflight for AI reasoning, NOT a root-cause verdict.
 * Never infer a network link from co-occurrence, a filename or same peer token.
 */
(function(root){'use strict';
const VERSION='1.0.0',SCHEMA='ai-hypothesis-review-v1';
const PROBES={
 BGP:{
  en:['Does the actual BGP transport/neighbor state support a session establishment problem?',
      'Could the intended AFI/SAFI, VRF or applied import/export policy explain the observed routing state?'],
  tr:['Gerçek BGP transport/komşuluk durumu oturum kurulumu problemiyle tutarlı mı?',
      'Amaçlanan AFI/SAFI, VRF veya etkin import/export politikası gözlenen rota durumunu açıklıyor olabilir mi?']},
 OSPF:{
  en:['Do area, interface network type, MTU and authentication explain the observed adjacency state?',
      'Is this an expected DR/BDR adjacency state, or do LSDB and installed routes contradict the design?'],
  tr:['Area, interface network type, MTU ve authentication gözlenen komşuluğu açıklıyor olabilir mi?',
      'Bu durum beklenen DR/BDR komşuluğu mu; LSDB ve kurulu rotalar tasarımla çelişiyor mu?']},
 EVPN:{
  en:['Do VNI/RT import-export and AF/VRF scope match the intended tenant reachability?',
      'Do VTEP/underlay and RIB/FIB observations corroborate the EVPN control-plane routes?'],
  tr:['VNI/RT import-export ve AF/VRF kapsamı hedef tenant erişimiyle tutarlı mı?',
      'VTEP/underlay ve RIB/FIB gözlemleri EVPN kontrol düzlemi rotalarını doğruluyor mu?']},
 VPC:{
  en:['Do the two vendor-specific peer-link/heartbeat status captures show the same peer relationship?',
      'Could consistency checks and port/member state explain the forwarding concern without assuming a link outage?'],
  tr:['İki cihazın üreticiye özgü peer-link/heartbeat kayıtları aynı peer ilişkisini doğruluyor mu?',
      'Consistency ve üye port durumları link kesintisi varsaymadan forwarding kaygısını açıklıyor olabilir mi?']},
 SDWAN:{
  en:['Is this only a failed health probe, or does the SLA result actually change service policy selection?',
      'Does the matching overlay route/neighbor state explain a path-selection dependency, at comparable capture times?'],
  tr:['Yalnız health-check mi başarısız, yoksa SLA sonucu gerçek service politikasını değiştiriyor mu?',
      'Karşılaştırılabilir zamanlarda overlay rota/komşuluk durumu yol seçimi bağımlılığını açıklıyor mu?']},
 STP:{
  en:['Do VLAN/instance root and port roles agree with intended forwarding boundaries?',
      'Could topology change or an applied guard explain this observation after operational checks?'],
  tr:['VLAN/instance root ve port rolleri amaçlanan forwarding sınırlarıyla tutarlı mı?',
      'Operasyonel kontroller sonrasında topoloji değişimi veya etkin guard gözlemi açıklayabilir mi?']},
 SYSTEM:{
  en:['Do effective access restrictions and AAA policies match the intended management access?',
      'Are logging, time synchronization and operational access outcomes independently verified?'],
  tr:['Etkin erişim kısıtları ve AAA politikası hedeflenen yönetim erişimiyle eşleşiyor mu?',
      'Logging, zaman senkronizasyonu ve operasyonel erişim ayrı kanıtlarla doğrulandı mı?']},
 DCI:{
  en:['Do underlay reachability, VNI/RT scope and observed remote routes agree with design?',
      'Could a routing or L2 extension boundary explain the remote service observation?'],
  tr:['Underlay erişimi, VNI/RT kapsamı ve gözlenen uzak rotalar tasarımla uyumlu mu?',
      'Routing veya L2 uzatma sınırı uzak servis gözlemini açıklıyor olabilir mi?']}
};
function review({assessment,language='en',maxFindings=32}={}){
 if(!assessment||assessment.schema!=='ai-engineering-assessment-matrix-v1'||!Array.isArray(assessment.findings))
  throw Error('Source-validated AI Engineering Assessment is required');
 const lng=language==='tr'?'tr':'en';
 const all=assessment.findings;
 const selected=all.filter(f=>f.status==='REVIEW'||f.status==='CONFLICT').slice(0,Math.min(40,Math.max(1,maxFindings)));
 const cards=selected.map(f=>{
  const deviceIds=new Set(f.deviceIds||[]);
  const linked=all.filter(other=>other.id!==f.id&&
   (other.deviceIds||[]).some(id=>deviceIds.has(id))&&
   Array.isArray(other.operationalEvidence)&&other.operationalEvidence.length);
  // A related symptom only narrows the scope of *investigation*, never establishes cause.
  const crossTechnology=linked.filter(other=>other.technology!==f.technology).slice(0,5).map(other=>({
   findingId:other.id,technology:other.technology,observed:other.observed,
   status:other.status,evidence:other.operationalEvidence,
   relationship:'SAME_DEVICE_ONLY_NOT_CAUSAL'}));
  // Explicit cross-device evidence is limited to an already verified multi-device
  // finding (never infer peer identity from the topology drawing).
  const multiDevice=(f.deviceIds||[]).length>1&&f.evidence.length>1;
  const contrary=[];
  if(f.confidence==='CAPTURE_TIMING_UNVERIFIED'){
   contrary.push({kind:'OBSERVATIONS_DIFFER_ACROSS_CAPTURES',
    text:lng==='tr'?'Aynı konu farklı yakalamalarda farklı durumda; zaman sırası doğrulanmadı.':
       'The same subject differs across captures; temporal order is unverified.',
    evidence:f.operationalEvidence});
  }
  if(f.confidence==='CONFIG_IP_AND_AS_EXPLICIT'){
   contrary.push({kind:'CONFIG_NOT_RUNNING_STATE',
    text:lng==='tr'?'IP/ASN uyuşmazlığı konfigürasyonda kanıtlı; etkin VRF/AF ve canlı BGP sonucu bilinmiyor.':
       'IP/ASN discrepancy is evidenced in configuration; active VRF/AF and live BGP behavior remain unknown.',
    evidence:f.configEvidence});
  }
  if(f.technology==='BGP'&&/Idle \(Admin\)/i.test(f.observed||'')){
   contrary.push({kind:'ADMINISTRATIVE_IDLE',
    text:lng==='tr'?'İdari Idle gözlemi taşıma katmanı arızasını tek başına desteklemez.':
      'Administrative Idle is not independent proof of a transport failure.',
    evidence:f.operationalEvidence});
  }
  const questions=(PROBES[f.technology]?.[lng]||[
   lng==='tr'?'Bu gözlemi hangi bağımsız operasyonel kanıt doğrular?':'Which independent operational fact corroborates this observation?',
   lng==='tr'?'Karşıt kanıt hangi varsayımı zayıflatır?':'Which contrary observation would disfavor the hypothesis?'
  ]);
  const evidence=f.evidence||[];
  const nextChecks=[...new Set((f.audit||[]).filter(x=>typeof x==='string'&&x.trim()))].slice(0,8);
  const coverage=evidence.some(x=>/^show:/i.test(x.source||''))?'OPERATIONAL_EVIDENCE':
    'CONFIGURATION_INTENT_ONLY';
  return {id:'H-'+f.id,technology:f.technology,title:f.title,status:'INVESTIGATION_ONLY',
   supportStatus:f.status,deviceIds:[...deviceIds],evidenceCoverage:coverage,
   observed:f.observed,primary:f.hypothesis,possibleExplanations:questions,
   sourceEvidence:evidence,contraryEvidence:contrary,crossTechnology,multiDevice,
   nextChecks,acceptance:f.acceptance,
   uncertainty:lng==='tr'?
    'Kaynak satırı gözlemi doğrular, neden-sonuç veya zaman eşleşmesini doğrulamaz. Kesin kök neden üretilmedi.':
    'A source line corroborates an observation, not cause-and-effect or timestamp alignment. No root cause was established.'
  };
 });
 return {schema:SCHEMA,version:VERSION,language:lng,
  items:cards,counts:{investigations:cards.length,withCrossTechnologySignals:cards.filter(x=>x.crossTechnology.length).length,
   withExplicitMultiDeviceEvidence:cards.filter(x=>x.multiDevice).length,
   withContraryContext:cards.filter(x=>x.contraryEvidence.length).length,
   excludedUnboundFindings:assessment.rejectedUnboundFindings||0},
  limitations:[
   'Investigation questions are manufacturer-context hypotheses, not model-validated diagnoses.',
   'Sharing a device or showing an unhealthy probe cannot prove causal linkage.',
   'Only findings already validated against original CLI proof are eligible.',
   'The AI model must test alternatives against time-aligned peer, policy and forwarding evidence.'
  ]};
}
root.NetworkAIHypothesisReviewV1={VERSION,SCHEMA,PROBES,review};
})(typeof window==='undefined'?globalThis:window);
