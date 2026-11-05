/* AI Analysis assessment matrix: shared methodology, read-only evidence.
 * Independent from Design configuration generation and Simulation outputs.
 * Metadata and verification goals are contextual, not automated compliance rules.
 */
(function(root){'use strict';
const VERSION='1.0.0',SCHEMA='ai-engineering-assessment-matrix-v1';
const KNOWLEDGE={
 BGP:{
  purpose:{en:'Control-plane exchange and selection of IP prefixes across autonomous systems and routing domains.',
   tr:'Otonom sistemler ve yönlendirme alanları arasında prefix ilanı, kabulü ve yol seçimini yönetir.'},
  risk:{en:'Incorrect neighbor, policy or address-family decisions may prevent expected route exchange or select an unintended path.',
   tr:'Komşuluk, politika veya address-family uyumsuzluğu beklenen rota alışverişini engelleyebilir ya da istenmeyen yol seçimine neden olabilir.'},
  requirements:{en:'Compare peer ASN, VRF/AF, session FSM, applied import/export policy, accepted and advertised prefixes, and installed routes.',
   tr:'Komşu ASN, VRF/AF, oturum FSM, etkin import/export politikası, alınan/ilan edilen prefixler ve kurulu rotaları karşılaştır.'},
  acceptance:{en:'Both peers and the intended route policy are verified, with observed route exchange and installation matching the documented objective.',
   tr:'İki uç, hedeflenen yönlendirme politikası ve operasyonel rota alışverişi/kurulumu belgelendirilmiş amaçla doğrulanır.'}
 },
 OSPF:{
  purpose:{en:'Distribute link-state topology within an IGP domain and calculate eligible forwarding paths.',
   tr:'IGP alanında link-state topolojisini dağıtır ve kullanılabilir yönlendirme yollarını hesaplar.'},
  risk:{en:'Area, network type, MTU or authentication mismatches may prevent a required adjacency or route propagation.',
   tr:'Area, ağ tipi, MTU veya kimlik doğrulama uyumsuzluğu gerekli komşuluğu veya rota dağıtımını etkileyebilir.'},
  requirements:{en:'Inspect interface/area membership, expected adjacency role, neighbor state, LSDB and corresponding RIB entries.',
   tr:'Arayüz/area üyeliğini, beklenen komşuluk rolünü, neighbor durumunu, LSDB ve ilgili RIB kayıtlarını incele.'},
  acceptance:{en:'Expected adjacencies and LSDB/RIB behavior agree across scoped devices; 2-WAY is interpreted by network type.',
   tr:'Beklenen komşuluklar ile LSDB/RIB durumu cihazlar arasında tutarlı; 2-WAY ağ tipine göre değerlendirilmiştir.'}
 },
 STP:{
  purpose:{en:'Avoid L2 loops by electing a bridge root and determining forwarding/alternate port roles.',
   tr:'Bridge root seçimi ve forwarding/alternate port rolleriyle L2 döngülerini önler.'},
  risk:{en:'Unintended root placement or inappropriate port safeguards may introduce path changes or L2 instability.',
   tr:'İstenmeyen root konumu veya port rolüne uygun olmayan korumalar L2 kararsızlığına neden olabilir.'},
  requirements:{en:'Compare VLAN/instance root intent, STP mode, actual bridge/root IDs, port roles, trunk scope and safeguards.',
   tr:'VLAN/instance root tasarımını, STP modunu, gerçek bridge/root ID ve port rollerini, trunk kapsamını ve korumaları karşılaştır.'},
  acceptance:{en:'Observed per-VLAN/instance root and port states match intended roles; risk controls are verified on mapped ports.',
   tr:'Gözlenen VLAN/instance root ve port durumları beklenen rollerle örtüşür; korumalar eşleşen portlarda doğrulanır.'}
 },
 VPC:{
  purpose:{en:'Provide coordinated multi-chassis L2 link redundancy and peer-aware forwarding.',
   tr:'Birden çok cihazda koordineli L2 link yedekliliği ve peer-aware forwarding sağlar.'},
  risk:{en:'Peer reachability, consistency or member-link mismatches may result in suspended ports or impaired redundancy.',
   tr:'Peer erişimi, consistency veya üye link uyumsuzlukları port askıya alma ve yedeklilik kaybı riskini artırabilir.'},
  requirements:{en:'Identify vendor-specific vPC/MLAG design, peer-link, keepalive/peer address, consistency and both peer states.',
   tr:'Üreticiye özgü vPC/MLAG yapısını, peer-link, keepalive/peer IP, consistency ve iki peer durumunu incele.'},
  acceptance:{en:'Operational peer/member state and consistency are confirmed on both systems under the matching platform release.',
   tr:'İki cihazın operasyonel peer/member durumları ve consistency kontrolü ilgili platform/sürüm kapsamında doğrulanır.'}
 },
 EVPN:{
  purpose:{en:'Distribute MAC/IP reachability and IP-prefix routes over a BGP-controlled VXLAN overlay.',
   tr:'BGP kontrollü VXLAN overlay üzerinde MAC/IP erişilebilirliği ve IP prefix rotalarını dağıtır.'},
  risk:{en:'VNI, RT, underlay or Type-2/Type-5 inconsistencies may isolate selected tenants or prefixes.',
   tr:'VNI, RT, underlay veya Type-2/Type-5 tutarsızlığı belirli tenant veya prefixleri izole edebilir.'},
  requirements:{en:'Check tenant/VRF scope, VLAN-VNI, RT import/export, VTEP reachability, advertised route types and RIB/FIB.',
   tr:'Tenant/VRF, VLAN-VNI, RT import/export, VTEP erişimi, ilan edilen rota türleri ve RIB/FIB ile karşılaştır.'},
  acceptance:{en:'Expected endpoint and prefix reachability are observed in both control and data planes for the intended tenants.',
   tr:'Beklenen endpoint/prefix erişilebilirliği doğru tenant için kontrol ve veri düzleminde doğrulanır.'}
 },
 SDWAN:{
  purpose:{en:'Select WAN paths using service policy, SLA/health observations and routing dependencies.',
   tr:'Servis politikası, SLA/sağlık ölçümleri ve yönlendirme bağımlılıklarıyla WAN yolunu seçer.'},
  risk:{en:'SLA loss, policy precedence or overlay route changes may conditionally steer traffic onto an unsuitable path.',
   tr:'SLA kaybı, politika sırası veya overlay rota değişiklikleri trafiği uygunsuz yola yönlendirebilir.'},
  requirements:{en:'Compare SLA targets/results, member/zone state, selected service policy and BGP overlay route dependencies.',
   tr:'SLA hedef/sonuçlarını, member/zone durumunu, seçilen service politikasını ve BGP overlay rotalarını birlikte incele.'},
  acceptance:{en:'Actual selected service path meets documented policy/SLA intent with overlay reachability verified.',
   tr:'Gerçek service yolu hedeflenen politika/SLA ile eşleşir ve overlay erişimi doğrulanır.'}
 },
 SYSTEM:{
  purpose:{en:'Secure and observe device management through access control, AAA, logging and time services.',
   tr:'Yönetim erişimi, AAA, log ve zaman servisleriyle cihazların güvenli ve izlenebilir yönetimini sağlar.'},
  risk:{en:'Management control gaps may reduce auditability or complicate incident response; exposure needs ACL/VTY evidence.',
   tr:'Yönetim kontrollerindeki eksiklikler izlenebilirliği azaltabilir; erişim riski ACL/VTY kanıtlarıyla doğrulanmalıdır.'},
  requirements:{en:'Review AAA, SSH/VTY, management ACLs, NTP, logging and the actual applied interface/direction.',
   tr:'AAA, SSH/VTY, yönetim ACL, NTP, logging ve gerçek interface/yön uygulamalarını incele.'},
  acceptance:{en:'Access policy and audit/time services are verified against platform release and organizational requirements.',
   tr:'Erişim politikası ve denetim/zaman servisleri platform sürümü ve kurum gereksinimleriyle doğrulanır.'}
 },
 DCI:{
  purpose:{en:'Connect sites through scoped L2 extension and L3 exchange with explicit failure-domain boundaries.',
   tr:'Kontrollü L2 uzatma ve L3 rota alışverişiyle siteleri arıza alanları gözetilerek bağlar.'},
  risk:{en:'Uncontrolled VLAN extension or route-target import may extend a fault domain or isolate a remote service.',
   tr:'Kontrolsüz VLAN uzatma ya da RT import politikası arıza alanını genişletebilir veya uzak servisi izole edebilir.'},
  requirements:{en:'Check per-site VLAN/VRF scope, L2/L3 dependencies, underlay/overlay and remote MAC/IP or route observations.',
   tr:'Site bazlı VLAN/VRF kapsamını, L2/L3 bağımlılıklarını, underlay/overlay ile uzak MAC/IP/rota durumlarını incele.'},
  acceptance:{en:'The expected remote L2/L3 service and failure-domain boundaries are validated across both sites.',
   tr:'Beklenen uzak L2/L3 servisleri ve arıza alanı sınırları her iki sitede doğrulanır.'}
 }
};
function localized(record,field,language){return record?.[field]?.[language==='tr'?'tr':'en']||'';}
function evaluate({workspace,deviceIds,modules,correlation,language='en'}={}){
 if(!workspace||!Array.isArray(workspace.nodes))throw Error('Analysis workspace required');
 const all=new Map(workspace.nodes.map(node=>[node.id,node])),ids=new Set(deviceIds||[...all.keys()]);
 const scope=[...new Set((modules||[]).map(value=>String(value).toUpperCase()))];
 const real=(workspace.showTech||[]).filter(cap=>ids.has(cap.deviceId)&&!cap.synthetic);
 const captureCounts=new Map([...ids].map(id=>[id,real.filter(cap=>cap.deviceId===id).length]));
 const facts=Array.isArray(correlation?.findings)?correlation.findings:[];
 const controls=scope.map(technology=>{
  const entry=KNOWLEDGE[technology];
  const observations=facts.filter(f=>f.technology===technology);
  const hasOperational=observations.some(f=>(f.evidence||[]).some(x=>/^show:/i.test(x.source||'')));
  const state=hasOperational?'EVIDENCE_OBSERVED':observations.length?'CONFIG_ONLY_REVIEW':'NOT_VERIFIED';
  return {technology,
   applicability:entry?'CONTEXTUAL':'UNSUPPORTED_TECHNOLOGY',
   state,
   findings:observations.length,
   realCaptures:real.length,
   purpose:localized(entry,'purpose',language),
   conditionalRisk:localized(entry,'risk',language),
   audit:localized(entry,'requirements',language),
   acceptance:localized(entry,'acceptance',language),
   limitation:hasOperational?'Operational observations are not certification, root cause or proven impact.':
    observations.length?'Only configuration/intent discrepancies are reported; operational state not proven.':
    'No matching source-scoped operational fact was observed; evidence may be incomplete or unsupported.'
  };
 });
 const findings=facts.filter(f=>scope.includes(f.technology)).map((f,i)=>{
  const control=KNOWLEDGE[f.technology],evidence=Array.isArray(f.evidence)?f.evidence:[];
  const operational=evidence.filter(x=>/^show:/i.test(x.source||''));
  const design=evidence.filter(x=>!/^(?:show:)/i.test(x.source||''));
  const vendors=[...new Set((f.deviceIds||[]).map(id=>all.get(id)?.vendor).filter(Boolean))];
  const missingPeers=(f.deviceIds||[]).some(id=>(captureCounts.get(id)||0)===0);
  const status=['OBSERVED','REVIEW','CONFLICT'].includes(f.status)?f.status:'REVIEW';
  return {
   id:f.id||'MATRIX-'+(i+1),technology:f.technology,title:language==='tr'&&f.titleTr?f.titleTr:f.title,
   status,confidence:f.confidence||'NOT_VERIFIED',deviceIds:[...(f.deviceIds||[])],
   vendorScope:vendors,sourceApplicability:f.source?.length?'VENDOR_SCOPED_RELEASE_UNVERIFIED':'VENDOR_SOURCE_NOT_MATCHED',
   purpose:localized(control,'purpose',language),expected:localized(control,'requirements',language),
   configured:design.length?'Configuration/intent evidence attached; deployment not independently verified.':
    'Configuration applicability not proven from this finding.',
   observed:f.observed||'',hypothesis:f.explanation||'',
   counterevidence:f.confidence==='CAPTURE_TIMING_UNVERIFIED'
    ?(language==='tr'?'Sağlanan yakalamalarda aynı BGP komşusu farklı durumlar bildiriyor; zaman sırası bilinmiyor.':
       'Supplied captures report different states for the same BGP peer; chronological order is unverified.')
    :f.confidence==='CONFIG_IP_AND_AS_EXPLICIT'
    ?(language==='tr'?'İki cihazın ASN ve IP konfigürasyonları farklı; gerçek VRF, oturum bağlamı ve çalışan konfigürasyon doğrulanmalı.':
       'Two configured ASN/IP facts disagree; actual VRF, peer context and running state remain unverified.')
    :(language==='tr'?'Karşıt kanıt veya eş zamanlı karşı cihaz bilgisi doğrulanmadı; kesin neden çıkarılamaz.':
       'No contrary and time-aligned peer evidence has been verified; a causal conclusion is not supported.'),
   conditionalImpact:f.networkImpact||localized(control,'conditionalRisk',language),
   audit:Array.isArray(f.verification)?f.verification:[],
   remediation:language==='tr'?
    'Önce salt-okunur komutlarla doğrulayın; değişiklik öncesinde lab, rollback ve onay sürecini tamamlayın.':
    'Verify with read-only commands first; lab-test, rollback-plan and approve any actual change.',
   acceptance:localized(control,'acceptance',language),
   evidence,configEvidence:design,operationalEvidence:operational,
   source:Array.isArray(f.source)?f.source:[],
   limitations:[...(missingPeers?['At least one scoped device has no real operational capture.']:[]),
    'Capture timestamps and platform releases may be unverified.']
  };
 });
 const counts={OBSERVED:0,REVIEW:0,CONFLICT:0,NOT_VERIFIED:0};
 for(const finding of findings)counts[finding.status]++;
 for(const item of controls)if(item.state==='NOT_VERIFIED')counts.NOT_VERIFIED++;
 return {schema:SCHEMA,version:VERSION,language,scope:{deviceIds:[...ids],modules:scope},
  controls,findings,counts,
  evidenceCoverage:{scopedDevices:ids.size,realCaptureFiles:real.length,
   devicesWithRealCapture:[...ids].filter(id=>(captureCounts.get(id)||0)>0).length},
  limitations:[
   'Manufacturer documentation is contextual and release-scoped, not device compliance proof.',
   'Observed evidence, design intent, synthetic data and model draft are not interchangeable.',
   'Unobserved commands or unknown defaults never establish missing features or healthy state.',
   'This deterministic assessment matrix does not validate model engineering accuracy.'
  ]};
}
root.NetworkAIEngineeringAssessmentV1={VERSION,KNOWLEDGE,evaluate};
})(typeof window==='undefined'?globalThis:window);
