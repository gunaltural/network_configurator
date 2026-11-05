/* CTO-level STP dashboard, grounded in read-only Design-derived SQLite knowledge. */
(function(root){
'use strict';
const E=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x;};
const A=(node,...children)=>{for(const child of children)node.append(child);return node;};
function build(container,review,preflight,db,language,engineering,network,operational){
 if(!engineering||engineering.kind!=='stp-engineering-v2-deterministic-not-ai')throw Error('STP Engineering V2 evidence engine is unavailable.');
 if(!network||network.kind!=='stp-network-correlation-v2')throw Error('N-device STP network correlation is unavailable.');
 if(!db||db.module!=='STP'||!Array.isArray(db.records)||db.records.length<10)throw Error('Engineering knowledge DB is not ready.');
 const tr=language==='tr',records=new Map(db.records.map(x=>[x.id,x])),sources=new Map(db.sources.map(x=>[x.id,x]));
 const L=(a,b)=>tr?a:b;
 const cat={vtpMode:'campus.vtp',vtpPassword:'campus.vtp',vtpVersion:'campus.vtp',vtpDomain:'campus.vtp',nativeVlan:'campus.native_vlan',allowedVlans:'campus.allowed_vlans',dtp:'campus.dtp',stpMode:'stp.mode',mstRegion:'stp.mode',bridgePriority:'stp.root_priority',portfast:'stp.edge_portfast',bpduGuard:'stp.bpdu_guard',rootGuard:'stp.root_guard',loopGuard:'stp.loop_guard'};
 container.replaceChildren();
 const paper=E('article','paper stp-design-paper');container.append(paper);
 const hdr=A(E('header','report-header'),E('div','report-tag','NETWORK CONFIGURATOR / ENGINEERING ASSESSMENT'),E('h1','',L('STP Mühendislik Analiz Raporu','STP Engineering Assessment Report')),E('p','report-meta',L('Tasarım / konfigürasyon değerlendirmesi · Mühendis onayı bekleniyor','Design / configuration assessment · Engineer approval pending')));
 hdr.append(E('p','report-meta',operational?.devices.some(x=>x.present)?L('Tasarım konfigürasyonu + cihaz bazlı doğrulama çıktıları; sentetik veriler ayrıca işaretlenmiştir. AI modeli çalıştırılmadı.','Design configurations + per-device operational CLI; synthetic data is labelled. No AI model run.'):L('Yalnızca tasarım konfigürasyonu; operasyonel veriler yüklenmedi. AI modeli çalıştırılmadı.','Design configuration only; no operational captures provided. No AI model run.')));
 paper.append(hdr);
 const risk=review.entries.filter(x=>x.severity==='warning'||x.severity==='review');
 // When VTP authentication cannot be evidenced, domain/mode checks belong to
 // the same governance decision, not three repetitive low-value paragraphs.
 const hostsWithAuthGap=new Set(risk.filter(x=>x.parameter==='vtpPassword').map(x=>x.title.split(':')[0]));
 const decisions=risk.filter(x=>!(['vtpMode','vtpDomain'].includes(x.parameter)&&hostsWithAuthGap.has(x.title.split(':')[0])));
 decisions.sort((x,y)=>Number(y.parameter==='vtpPassword')-Number(x.parameter==='vtpPassword')||Number(y.severity==='warning')-Number(x.severity==='warning'));
 const kpis=E('div','summary-grid');
 for(const [title,val] of [[L('Cihazlar','Devices'),review.devices.length],[L('Öncelikli incelemeler','Risk reviews'),decisions.length],[L('Design bilgi kayıtları','Design knowledge rules'),db.records.length],[L('Operasyonel durum','Operational state'),L('Doğrulanmadı','Not verified')]]){
  kpis.append(A(E('div','metric'),E('b','',val),E('span','',title)));
 }
 paper.append(E('h2','',L('1 · Yönetici özeti','1 · Executive summary')));
 paper.append(E('p','',L('Değerlendirme yalnızca seçilen cihaz konfigürasyonlarına dayanır. Canlı root/port durumları doğrulanmadı.','Review is based only on selected configurations. Live root and port state is unverified.')));
 paper.append(kpis);
 appendNetworkReadout(paper,network,tr,operational);
 appendEngineeringReadout(paper,engineering,tr);
 const rootFindings=preflight.findings.filter(x=>['BRIDGE_PRIORITY_COMPARISON','EQUAL_BRIDGE_PRIORITY'].includes(x.code));
 const sec=E('section','');sec.append(E('h2','',L('2 · STP Root Tasarımı ve Yedeklilik','2 · Root Placement and Redundancy')));
 if(rootFindings.length){
  const byIntention=new Map();
  for(const result of rootFindings){
   const m=result.claim.match(/^(VLAN|MST)\s+(\d+):\s*(.*?)\s+(\d+)\s+vs\s+(.*?)\s+(\d+)\./);
   if(!m)continue;
   const key=[m[3],m[4],m[5],m[6],result.code].join('|');
   const value=byIntention.get(key)||{first:m[3],firstPri:Number(m[4]),second:m[5],secondPri:Number(m[6]),instances:[],refs:[]};
   value.instances.push(m[1]+' '+m[2]);value.refs.push(...result.refs);
   byIntention.set(key,value);
  }
  for(const choice of byIntention.values()){
   const card=E('div','decision');
   const priorityEqual=choice.firstPri===choice.secondPri;
   const candidate=choice.firstPri<choice.secondPri?choice.first:choice.firstPri>choice.secondPri?choice.second:null;
   card.append(E('strong','',L('Root bridge konumlandırması','Root bridge placement')+' — '+choice.instances.join(', ')));
   card.append(E('span','choice',choice.first+' '+choice.firstPri+' · '+choice.second+' '+choice.secondPri));
   const engineering=priorityEqual?
    L('İki Core aynı bridge priority ile yapılandırılmış. Daha düşük köprü kimliğini belirleyen diğer alanlara göre root seçilebilir; birincil/yedek root tasarım niyeti açık değildir.',
      'Both Cores have the same configured bridge priority. The remaining bridge ID can decide root selection, so primary/backup intent is unclear.'):
    L(candidate+' daha düşük bridge priority ile ilgili VLAN/instance grubunda root tercih adayıdır. Bu düzen iki Core arasında planlı bir birincil/yedek STP tasarımına işaret edebilir. VLAN bazlı trafik paylaşımı hedefleniyorsa root yerleşimlerinin farklılaştırılması ayrıca değerlendirilmelidir. Mevcut root/port state sonucu yalnız bu konfigürasyondan çıkarılamaz.',
      candidate+' has the lower priority and is the preferred root candidate for these VLANs/instances. This can be intentional active/standby, while per-VLAN load distribution requires deliberate root placement. Live root and port roles remain unverified.');
   card.append(E('p','',engineering));
   card.append(E('p','report-muted',L('Doğrulama: iki Core üzerinde show spanning-tree root ve ilgili VLAN/instance çıktıları; başka daha düşük bridge ID olup olmadığı.','Verify show spanning-tree root and relevant instances on both Cores, including other possible lower bridge IDs.')));
   const evidence=E('details','');evidence.append(E('summary','',L('İlgili konfigürasyon kanıtı','Source configuration evidence')),E('p','',[...new Set(choice.refs)].join(' · ')));card.append(evidence);
   sec.append(card);
  }
  if(!byIntention.size)sec.append(E('p','',L('Kök önceliği değerleri bulundu ancak ilişkili cihaz/VLAN grupları güvenilir şekilde çıkarılamadı.','Priority values were observed, but matching device/instance groups could not be reliably inferred.')));
 }else sec.append(E('p','report-muted',L('İki Core üzerinde karşılaştırılabilir root priority tanımları bulunamadı.','Comparable bridge priorities were not supplied for both nodes.')));
 paper.append(sec);
 const risks=E('section','');risks.append(E('h2','',L('3 · Riskler ve Mühendislik Kararları','3 · Risks and Engineering Decisions')));
 if(!decisions.length)risks.append(E('p','',L('Açık konfigürasyon tutarsızlığı bulunamadı; bu, ağın sağlıklı olduğu anlamına gelmez.','No explicit contradiction found; this does not establish network health.')));
 for(const item of decisions){
  const r=records.get(cat[item.parameter]),card=E('div','decision');
  const head=A(E('div','cto-finding-head'),E('strong','',item.parameter==='vtpPassword'?L(item.title.split(':')[0]+': VTP kimlik doğrulaması doğrulanamadı',item.title):item.title),E('span','choice',item.parameter==='vtpPassword'?L('YÜKSEK ÖNCELİKLİ KONTROL','HIGH-PRIORITY CHECK'):item.severity.toUpperCase()));card.append(head);
  card.append(E('p','',item.parameter==='vtpPassword'?L('VTP Server/Client modunda kimlik doğrulama ayarının varlığı kanıtlanamadı. VTP alanına erişebilen bir cihazdan yanlış veya yetkisiz VLAN güncellemeleri yayılabilir; bu güvenlik ve servis sürekliliği açısından yüksek öncelikli doğrulama gerektirir. Ancak gizlenmiş parola satırını yok kabul etmiyoruz.','Authentication presence is not evidenced for VTP Server/Client. Without authentication, incorrect or unauthorized VLAN updates could propagate. A hidden password cannot be assumed absent.'):item.impact));
  if(r){
   card.append(E('p','cto-context',L('Design parametre gerekçesi','Design parameter rationale')+': '+(tr?r.contextTr||r.context:r.context)));
   card.append(E('p','cto-action',L('Mühendislik kararı ve aksiyon','Engineering decision and action')+': '+(tr?r.analysisTr||r.analysis:r.analysis)));
   const details=E('details','');details.append(E('summary','',L('Kanıt ve standart kaynaklar','Evidence and standards')));
   details.append(E('p','',item.evidence.join(' · ')||L('İlgili satır doğrulanmadı','Source line not verified')));
   for(const id of r.sources){const source=sources.get(id);if(!source)continue;const a=E('a','',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';details.append(a);}
   card.append(details);
  }else card.append(E('p','',L('Kanıt','Evidence')+': '+item.evidence.join(' · ')));
  if(item.limitation)card.append(E('small','cto-muted',L('Sınır','Limitation')+': '+item.limitation));
  risks.append(card);
 }
 paper.append(risks);
 const verify=E('section','');verify.append(E('h2','',L('4 · Doğrulama ve Kabul Planı','4 · Verification and Acceptance')));
 const ol=E('ol','');for(const x of [...new Set([...preflight.missing,...review.furtherEvidence])].slice(0,12))ol.append(E('li','',x));verify.append(ol);paper.append(verify);
 const parameterCoverage=appendDecisionMatrix(paper,review,preflight,db,tr,engineering,operational);
 paper.append(E('footer','report-footer',L('Kaynak:','Source:')+' Design parameter know-how · SQLite knowledge v'+db.version+' · '+db.signature.slice(0,12)+' · '+L('AI çalıştırılmadı','No AI executed')));
 return {deviceCount:review.devices.length,riskCount:decisions.length,ruleCount:db.records.length,parameterCoverage};
}



/* Aggregate all selected configurations into one topology and protocol report. */
function appendNetworkReadout(paper,network,tr,operational){
 const L=(a,b)=>tr?a:b,sec=E('section','stp-network-readout');
 sec.append(E('h2','',L('2 · Bütünleşik Ağ ve Protokol Değerlendirmesi','2 · End-to-end Network and Protocol Assessment')));
 sec.append(E('p','',L('Bu bölüm seçilen cihazları ayrı ayrı değerlendirmekle yetinmez; VLAN, fiziksel bağlantı, root tercihleri, port korumaları ve topolojik bağımlılıkları tüm seçili cihazlar arasında karşılaştırır.',
  'All selected devices are evaluated together for per-VLAN root preferences, modeled connectivity, STP guard relationships and graph dependencies.')));
 const summary=E('div','summary-grid');
 for(const [name,value] of [
  [L('Seçili cihaz','Selected devices'),network.deviceCount],
  [L('Konfigürasyonlu cihaz','Captured configurations'),network.capturedCount],
  [L('Modellenen bağlantı','Modeled physical links'),network.modeledLinkCount],
  [L('VLAN değerlendirmesi','VLAN assessments'),network.vlans.length],
  [L('Cihazlar arası bulgu','Cross-device findings'),network.findings.length]
 ])summary.append(A(E('div','metric'),E('b','',value),E('span','',name)));
 sec.append(summary);
 sec.append(E('p','report-muted',L('Kanıt kapsamı: ','Evidence scope: ')+network.coverage.deviceConfigs+
  L(' cihaz konfigürasyonu; ',' captured device configurations; ')+network.coverage.mappedLinks+
  L(' uç eşleşmeli bağlantı. ',' links with mapped endpoints. ')+network.scope));
 for(const component of network.components){
  sec.append(E('p','cto-context',L('Modellenen bağlantılı cihaz grubu: ','Modeled connected component: ')+component.join(' ↔ ')));
 }
 if(operational?.devices.some(x=>x.present)){
  const verification=E('details','');verification.open=false;
  verification.append(E('summary','',L('Operasyonel CLI: Root ID korelasyonu','Operational CLI: Root ID correlation')));
  if(operational.devices.some(x=>x.syntheticOnly))verification.append(E('p','report-meta','SYNTHETIC LAB — NOT REAL DEVICE EVIDENCE'));
  for(const rel of operational.relationships){
   const p=E('p','',rel.devices.join(' ↔ ')+' VLAN '+rel.vlan+' · '+rel.status);
   verification.append(p);
   if(rel.status==='CONFLICTING_ROOT_EVIDENCE')verification.append(E('p','cto-action',L('Cihazlar farklı Root ID bildiriyor. Zaman ve STP domain sınırını kontrol edin.','Conflicting Root IDs observed; verify capture times and STP domain boundaries.')));
  }
  if(!operational.relationships.length)verification.append(E('p','',L('Root ID için karşılaştırılabilir operasyonel çıktı bulunamadı.','No comparable operational Root IDs supplied.')));
  sec.append(verification);
 }
 const vlanSec=E('details','');vlanSec.open=true;vlanSec.append(E('summary','',L('VLAN bazında root adayları ve karşılaştırmalı priority','Per-VLAN root candidate / priority correlation')));
 const rootTable=E('table','');rootTable.style.cssText='width:100%;border-collapse:collapse;font-size:12px';
 const header=E('tr','');for(const t of [L('VLAN / kapsam','VLAN / scope'),L('Cihaz priority değerleri','Observed priorities'),L('Root adayı / sonuç','Root preference / conclusion')]){
  const th=E('th','',t);th.style.cssText='text-align:left;padding:8px;border-bottom:2px solid #becbd5';header.append(th);}
 rootTable.append(header);
 for(const x of network.vlans){
  const row=E('tr','');
  const priorities=x.configured.map(p=>p.hostname+': '+(p.priority??L('tanımsız','not explicit'))).join(' · ');
  const values=['VLAN '+x.vlan+' · '+x.component,priorities,x.status+' · '+x.interpretation];
  for(const value of values){const cell=E('td','',value);cell.style.cssText='padding:8px;vertical-align:top;border-bottom:1px solid #dbe5ec;overflow-wrap:anywhere';row.append(cell);}
  rootTable.append(row);
 }
 vlanSec.append(rootTable);
 if(!network.vlans.length)vlanSec.append(E('p','',L('VLAN tanımları veya ilgili priority kanıtları bulunamadı.','No explicit VLAN participation or priorities were captured.')));
 sec.append(vlanSec);
 const links=E('details','');links.open=true;links.append(E('summary','',L('Cihazlar arası trunk ve STP koruma ilişkileri','Inter-device trunk and STP protection correlations')));
 for(const x of network.links){
  const item=E('div','decision');
  item.append(E('strong','',x.first+' ('+x.ports[0]+') ↔ '+x.second+' ('+x.ports[1]+')'));
  item.append(E('p','report-muted',x.status));
  for(const line of x.details)item.append(E('p','',line));
  if(x.evidence.length){const proof=E('details','');proof.append(E('summary','',L('Her iki cihazın CLI kanıtları','Source CLI evidence from both devices')));
   for(const v of x.evidence)proof.append(E('p','report-muted',v));item.append(proof);}
  links.append(item);
 }
 if(!network.links.length)links.append(E('p','',L('Seçilen cihazlar arasında fiziksel bağlantı eşleştirmesi verilmedi. Gerçek komşuluk tahmin edilmez.',
  'No physical links between selected devices were mapped. Peer adjacency is not inferred from hostnames or interface labels.')));
 sec.append(links);
 const risks=E('details','');risks.open=true;risks.append(E('summary','',L('İlişkisel bulgular ve doğrulama kararları','Cross-device findings and verification decisions')));
 if(!network.findings.length)risks.append(E('p','',L('Kanıtlı çapraz cihaz çelişkisi görülmedi. Bu ağın doğru çalıştığını kanıtlamaz.',
  'No explicit cross-device contradiction was found; this does not establish network health.')));
 for(const x of network.findings){
  const item=E('div','decision');
  item.append(E('strong','',x.severity+' · '+x.code+' · '+x.scope));
  item.append(E('p','',x.message));
  item.append(E('p','cto-action',L('Doğrulama: ','Verification: ')+x.verification));
  if(x.evidence.length)item.append(E('p','report-muted',x.evidence.join(' · ')));
  risks.append(item);
 }
 sec.append(risks);
 const failures=E('details','');failures.append(E('summary','',L('Topoloji bağımlılıkları ve arıza senaryoları (tasarım modelinden)','Modeled fault domains and failure scenarios')));
 if(!network.resilience.length)failures.append(E('p','',L('Modellenen bağlantılarda bağlantıyı bölen tekil cihaz/link bağımlılığı saptanmadı. Gerçek yedeklilik yine doğrulanmalıdır.',
  'No graph-separating single node/link was found in modeled links; operational redundancy is unproven.')));
 for(const x of network.resilience){
  const box=E('div','decision');
  box.append(E('strong','',x.event+' · '+(x.device||x.link)));
  box.append(E('p','',x.assessment));failures.append(box);
 }
 sec.append(failures);
 sec.append(E('p','report-muted',L('Sınır: Bu, çalışan cihazlardan toplanmış STP port state/TCN ölçümü değildir. Topoloji bağlantıları kullanıcı modelinden, root adayı çıkarımları ise yüklenen konfigürasyondan gelir.',
  'Limit: this is not measured STP forwarding, TCN or convergence. Topology links reflect modeled design; root preference reflects captured configuration only.')));
 paper.append(sec);
}

/* A CTO can see actual device observations before generalized catalog findings. */
function appendEngineeringReadout(paper,assessment,tr){
 const L=(a,b)=>tr?a:b;
 const section=E('section','stp-device-evidence');
 section.append(E('h2','',L('2 · Cihaz Konfigürasyonundan Çıkarılan Mühendislik Analizi','2 · Configuration-driven Device Engineering Assessment')));
 section.append(E('p','report-muted',L(
  'Aşağıdaki tüm değerler analiz için seçilen cihazların yüklenen konfigürasyonlarından çıkarılmıştır. Port rolü ve fiziksel komşu doğrulanmadan STP koruma politikaları eksik/hatalı ilan edilmez.',
  'All values below are parsed from selected device configurations. Port roles and physical neighbors must be verified before declaring missing or incorrect STP safeguards.')));
 for(const device of assessment.devices){
  const m=device.summary;
  const panel=E('div','decision');panel.append(E('h3','',device.hostname+' · '+device.platform));
  if(!device.hasConfig){panel.append(E('p','',L('Konfigürasyon bulunamadı. Bu cihaz için mühendislik sonucu oluşturulamaz.','No configuration supplied. Engineering conclusions are blocked.')));section.append(panel);continue;}
  const facts=E('table','');facts.style.cssText='width:100%;border-collapse:collapse;font-size:12px';
  const labels=[
   [L('STP modu','STP mode'),m.mode||L('Doğrulanmadı','Unverified')],
   [L('VTP modu','VTP mode'),m.vtp||L('Doğrulanmadı','Unverified')],
   [L('Root priority (VLAN/instance)','Root priority (VLAN/instance)'),m.rootPriority||L('Doğrulanmadı','Unverified')],
   [L('Tanımlı trunk','Configured trunks'),String(m.trunkCount)],
   ['Root Guard',String(m.rootGuardCount)+L(' arayüz',' interfaces')],
   ['Loop Guard',String(m.loopGuardCount)+L(' arayüz',' interfaces')],
   ['UDLD',String(m.udldCount)+L(' arayüz',' interfaces')],
   [L('Native VLAN dağılımı','Native VLAN distribution'),m.nativeSummary||'-'],
   [L('Allowed VLAN dağılımı','Allowed VLAN distribution'),m.allowedSummary||'-']
  ];
  for(const [label,value] of labels){const row=E('tr',''),a=E('th','',label),b=E('td','',value);
   a.style.cssText='padding:5px;text-align:left;width:32%;border-bottom:1px solid #dbe5ec';b.style.cssText='padding:5px;border-bottom:1px solid #dbe5ec;overflow-wrap:anywhere';
   row.append(a,b);facts.append(row);}
  panel.append(facts);
  if(m.rootGuardCount&&m.loopGuardCount){
   panel.append(E('p','cto-context',L(
    m.rootGuardCount+' arayüzde Root Guard, '+m.loopGuardCount+' arayüzde Loop Guard kullanılması farklı L2 port rollerine göre bilinçli koruma tasarımına işaret edebilir. Root Guard designated/downstream; Loop Guard root/alternate bağlantılarında anlamlıdır. Gerçek port rolleri henüz kanıtlanmadı.',
    m.rootGuardCount+' Root Guard and '+m.loopGuardCount+' Loop Guard ports may indicate deliberate separation of L2 boundary roles. Root Guard is intended for designated/downstream ports, Loop Guard for root/alternate behavior. Actual port roles remain unproven.')));
  }
  if(m.trunkCount&&!device.ports.some(p=>p.portfast||p.bpduGuard)){
   panel.append(E('p','cto-action',L(
    'PortFast ve BPDU Guard: Bu trunk arayüzlerde açıkça yapılandırılmamış. Switch-to-switch trunk üzerinde bu durum kendi başına hata değildir. Komşu/edge rolü doğrulanmadan eksiklik yazılamaz.',
    'PortFast and BPDU Guard are not explicitly configured on these trunks. This is NOT inherently a defect on network-facing trunks. Verify edge/neighbor role before scoring applicability.')));
  }
  const ports=E('details','');ports.open=true;ports.append(E('summary','',L(
   'Arayüz Bazlı Mühendislik Kontrolleri ('+device.ports.length+' port)',
   'Per-interface engineering findings ('+device.ports.length+' ports)')));
  const table=E('table','');table.style.cssText='width:100%;border-collapse:collapse;font-size:11px';
  const head=E('tr','');for(const t of [L('Arayüz','Interface'),L('Trunk / VLAN','Trunk / VLAN'),L('Koruma / DTP','Protection / DTP'),L('Mühendislik yorumu','Engineering assessment')]){
   const x=E('th','',t);x.style.cssText='padding:8px;text-align:left;border-bottom:2px solid #aabfcf';head.append(x);}
  table.append(head);
  for(const port of device.ports){
   const row=E('tr','');const detail=E('details','');
   detail.append(E('summary','',port.name));
   detail.append(E('p','',port.description||L('Port açıklaması bulunmuyor','No interface description')));
   detail.append(E('p','',port.evidence.join(' · ')||L('Tanımlanmış kural kanıtı bulunmuyor','No explicit control evidence')));
   const values=[detail,
    port.mode+' · native '+(port.native??'?')+' · allowed '+(port.allowed??'?'),
    port.guard+' · '+port.udld+' · '+port.dtp,
    port.interpretation];
   for(const value of values){const cell=E('td','');cell.style.cssText='padding:8px;vertical-align:top;border-bottom:1px solid #dbe5ec;overflow-wrap:anywhere';
    if(typeof value==='string')cell.textContent=value;else cell.append(value);row.append(cell);}
   table.append(row);
  }
  ports.append(table);panel.append(ports);section.append(panel);
 }
 if(assessment.findings.length){
  const alerts=E('div','');alerts.append(E('h3','',L('Kanıtlı konfigürasyon incelemeleri','Configuration findings requiring review')));
  for(const item of assessment.findings){
   const x=E('div','decision');
   x.append(E('strong','',item.severity+' · '+item.id+' · '+item.device));
   x.append(E('p','',item.reason));x.append(E('p','cto-action',item.action));
   x.append(E('p','report-muted',item.evidence.join(' · ')));alerts.append(x);
  }
  section.append(alerts);
 }
 paper.append(section);
}
function appendEngineeringMatrix(paper,assessment,tr,operational){
 const L=(a,b)=>tr?a:b,section=E('section','stp-assessment-matrix');
 section.append(E('h2','',L('5 · Cihaz Bazlı Mühendislik Kriterleri','5 · Per-device Engineering Criteria')));
 let observed=0,review=0,verify=0;
 for(const [index,device] of assessment.devices.entries()){
  const op=operational?.devices.find(x=>x.deviceId===device.id);
  const hasEvidence=!!op?.present;
  const group=E('details','stp-device-criteria');group.open=index===0;
  const heading=device.hostname+' · '+device.controls.length+' '+L('kriter','controls')+' · '+(hasEvidence?op.syntheticOnly?'SYNTHETIC LAB':L('CLI yüklü','CLI attached'):L('Show Tech yok','Show Tech missing'));
  group.append(E('summary','',heading));
  const tip=E('p','report-meta',hasEvidence?
   L('Yüklü kanıt: ','Captured files: ')+op.captures.map(x=>x.filename+(x.synthetic?' [LAB]':'')).join(', '):
   L('Operasyonel kanıt yüklenmedi. Aşağıdaki Upload düğmesiyle bu cihaz için ekleyebilirsiniz.','No operational evidence attached. Use Upload to add verification CLI for this device.'));
  group.append(tip);
  const table=E('table','stp-compact-matrix');table.style.cssText='width:100%;border-collapse:collapse;font-size:11px';
  const header=E('tr','');
  for(const x of ['ID',L('Kontrol','Control'),L('Sonuç','Result'),L('Kanıt ve doğrulama','Evidence / verification')]){
   const th=E('th','',x);th.style.cssText='padding:8px;text-align:left;border-bottom:2px solid #becbd5';header.append(th);
  }table.append(header);
  for(const c of device.controls){
   if(c.status==='OBSERVED'||c.status==='OPERATIONAL_EVIDENCE'||c.status==='LAB_OBSERVED')observed++;
   else if(c.status==='VERIFY'||c.status==='NO_DATA')verify++;else review++;
   const row=E('tr',''),action=E('div',''),upload=E('button','');
   upload.type='button';upload.dataset.evidenceUpload=device.id;upload.className='evidence-upload';
   upload.textContent=L('CLI yükle','Upload CLI');upload.setAttribute('aria-label',L(device.hostname+' için CLI kanıtı yükle, '+c.id,'Upload CLI for '+device.hostname+', '+c.id));
   action.append(upload);
   const info=E('details','');info.append(E('summary','',L('Detay / Kanıt','Details / Evidence')));
   info.append(E('p','',c.analysis||L('Mühendislik yorumu yok','No interpretation')));
   info.append(E('p','',L('Doğrulama: ','Verify: ')+(c.verify||'-')));
   for(const evidence of c.evidence.slice(0,40))info.append(E('p','report-meta',evidence));
   if(c.evidence.length>40)info.append(E('p','report-meta',L('Ek kanıtlar kısaltıldı.','Additional evidence omitted from display.')));
   if(c.source){const link=E('a','',c.source.title);link.href=c.source.url;link.rel='noopener noreferrer';link.target='_blank';info.append(link);}
   action.append(info);
   const compact=String(c.observed||'-'),short=compact.length>180?compact.slice(0,177)+'…':compact;
   const cells=[c.id,c.label,c.status+' · '+short,action];
   for(const value of cells){const td=E('td','');td.style.cssText='padding:8px;vertical-align:top;border-bottom:1px solid #dbe5ec;overflow-wrap:anywhere';
    if(typeof value==='string')td.textContent=value;else td.append(value);row.append(td);}
   table.append(row);
  }
  group.append(table);section.append(group);
 }
 section.append(E('p','report-meta',L('Okunan kriter: ','Observed controls: ')+observed+' · '+L('Tasarım/rol incelemesi: ','Design/role review: ')+review+' · '+L('Ek kanıt gerekli: ','Verification pending: ')+verify));
 paper.append(section);
 return {observed,issues:assessment.findings.length,unverified:verify,notAutomated:verify};
}

/* Auditable engineering parameter matrix — evidence presence is NOT compliance. */
function appendDecisionMatrix(paper,review,preflight,db,tr,engineering,operational){
 if(engineering)return appendEngineeringMatrix(paper,engineering,tr,operational);
 const L=(a,b)=>tr?a:b;
 const matrix=E('section','stp-assessment-matrix');
 matrix.append(E('h2','',L('5 · Cihaz Bazlı Parametre Matrisi ve Kanıt Kapsamı','5 · Device Parameter Matrix and Evidence Coverage')));
 matrix.append(E('p','report-muted',L(
 'Bu matris kontrol envanteridir; satır bulunması uyumluluk kanıtı değildir. Konfigürasyon satırı bulunmadığında platform varsayılanları ve running-state bilinmiyor kabul edilir. Manuel inceleme gerektiren başlıklar otomatik olarak PASS sayılmaz.',
 'This is a control inventory, not a compliance certificate. Missing statements do not prove disabled features; vendor defaults and operational state remain unknown. Non-automated controls are never marked PASS.')));
 const specifications=[
 ['STP-001',L('Platform ve sürüm','Platform and version'),null,'show version'],
 ['STP-002',L('Cihaz / port rolü','Device and port role'),null,'show cdp neighbors detail / show lldp neighbors detail'],
 ['STP-003',L('STP protokol modu','STP protocol mode'),'stpMode','show spanning-tree summary'],
 ['STP-004',L('Root yerleşimi','Root placement'),'bridgePriority','show spanning-tree root'],
 ['STP-005',L('Bridge priority / ID','Bridge priority / ID'),'bridgePriority','show spanning-tree detail'],
 ['STP-006',L('Root yedekliliği','Root redundancy'),'bridgePriority','show spanning-tree root'],
 ['STP-007',L('MST bölge tutarlılığı','MST region consistency'),'mstRegion','show spanning-tree mst configuration'],
 ['STP-008',L('PortFast / edge uygunluğu','PortFast / edge role'),'portfast','show spanning-tree interface detail'],
 ['STP-009',L('BPDU Guard','BPDU Guard'),'bpduGuard','show spanning-tree summary'],
 ['STP-010',L('Root Guard','Root Guard'),'rootGuard','show spanning-tree inconsistentports'],
 ['STP-011',L('Loop Guard','Loop Guard'),'loopGuard','show spanning-tree inconsistentports'],
 ['STP-012',L('UDLD link koruması','UDLD protection'),'udld','show udld interface'],
 ['STP-013',L('EtherChannel / LACP','EtherChannel / LACP'),null,'show etherchannel summary'],
 ['STP-014',L('Native / Allowed VLAN','Native / allowed VLAN'),'nativeVlan','show interfaces trunk'],
 ['STP-015',L('Topology change davranışı','Topology changes'),null,'show spanning-tree detail'],
 ['STP-016',L('Core / uplink arıza etkisi','Core / uplink failure impact'),null,'show spanning-tree detail'],
 ['STP-017',L('vPC / MLAG / Stack uyumu','vPC / MLAG / Stack context'),null,'show vpc / show mlag / show switch virtual'],
 ['STP-018',L('Üretici referansı / sürüm','Vendor and release reference'),null,'show version']
 ];
 const rows=E('table','stp-matrix-table');rows.style.width='100%';rows.style.borderCollapse='collapse';rows.style.fontSize='12px';
 const header=E('thead','');const hr=E('tr','');
 for(const label of ['ID',L('Kontrol','Control'),L('Cihaz','Device'),L('Kapsam / durum','Evidence status'),L('Kanıt','Evidence'),L('Sonraki doğrulama','Verification')]){
  const th=E('th','',label);th.style.cssText='padding:8px;text-align:left;border-bottom:2px solid #cbd5e1';hr.append(th);
 }
 header.append(hr);rows.append(header);
 const body=E('tbody',''),catalog=new Map((review.coverage||[]).map(x=>[x.id,x]));
 const hosts=review.devices||[],results={observed:0,unverified:0,notAutomated:0,issues:0};
 for(const [id,label,param,verify] of specifications){
  const c=param?catalog.get(param):null;
  for(const hostname of hosts){
   const matching=c?.devices?.find(d=>d.hostname===hostname),refs=matching?.refs||[];
   const findings=(review.entries||[]).filter(x=>x.parameter===param&&x.title?.includes(hostname)&&['warning','review'].includes(x.severity));
   let status,meaning;
   if(!c){status=L('OTOMATİK ANALİZ YOK','NOT AUTOMATED');meaning=L('Manuel / operasyonel kanıt gerekli','Manual or operational evidence required');results.notAutomated++;}
   else if(findings.length){status=L('İNCELEME GEREKLİ','REVIEW REQUIRED');meaning=findings.map(x=>x.title).join(' · ');results.issues++;}
   else if(refs.length){status=L('GÖZLENDİ · UYGUNLUK DOĞRULANMADI','OBSERVED · NOT COMPLIANCE');meaning=L('Konfigürasyon satırı var; davranış doğrulanmadı','Configuration observed; behavior unverified');results.observed++;}
   else if(id==='STP-008'||id==='STP-009'){
    status=L('ROL BAĞIMLI · EKSİKLİK TESPİT EDİLMEDİ','ROLE DEPENDENT · NO DEFECT ESTABLISHED');
    meaning=L('PortFast / BPDU Guard özellikle gerçek edge portları için değerlendirilir. Core trunk üzerinde görünmemesi tek başına risk değildir; komşu/port görevi doğrulanmalı.',
    'PortFast / BPDU Guard require confirmed edge-port context. Not configured on a Core trunk is not, by itself, a defect; verify neighbor and port role.');
    results.unverified++;
   }
   else {status=L('KANIT YETERSİZ','INSUFFICIENT EVIDENCE');meaning=L('Ayar yokluğu/varsayılanı belirlenemedi','Absence or default cannot be determined');results.unverified++;}
   const row=E('tr','');for(const value of [id,label,hostname,status,(refs.slice(0,3).join(' · ')||meaning),verify]){
    const td=E('td','',value);td.style.cssText='padding:7px;border-bottom:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere';row.append(td);
   }body.append(row);
  }
 }
 rows.append(body);
 const summary=E('p','report-muted',L('Toplam ','Total ')+specifications.length+L(' kontrol / cihaz. Kanıtlı satır: ',' controls / device. Observed: ')+results.observed+L(' · İnceleme: ',' · Review: ')+results.issues+L(' · Kanıt yetersiz: ',' · Unverified: ')+results.unverified+L(' · Henüz otomatik değil: ',' · Not automated: ')+results.notAutomated+'.');
 matrix.append(summary);
 const detail=E('details','');detail.open=true;detail.append(E('summary','',L('Tüm cihazlar ve 18 kontrolü göster','Show all devices and 18 controls')),rows);
 matrix.append(detail);
 matrix.append(E('p','report-muted',L('Yöntem: Kontrol kapsamı = gözlemlenen konfigürasyon / karşılaştırma / eksik kanıt. Risk sınıfı ayrı, güven düzeyi ayrı belirlenmelidir. Gerçek root rolü, arıza yakınsaması ve güvenlik uygunluğu sadece config üzerinden doğrulanmaz.',
 'Method: parameter coverage is observed configuration, cross-device comparison and missing evidence; risk and confidence are separate. Live root role, failover convergence and security compliance are not proven by config.')));
 paper.append(matrix);
 return results;
}

root.NetworkSTPCTOReport={build};
})(typeof window==='undefined'?globalThis:window);