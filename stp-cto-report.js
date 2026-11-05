/* CTO-level STP dashboard, grounded in read-only Design-derived SQLite knowledge. */
(function(root){
'use strict';
const E=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x;};
const A=(node,...children)=>{for(const child of children)node.append(child);return node;};
function build(container,review,preflight,db,language){
 if(!db||db.module!=='STP'||!Array.isArray(db.records)||db.records.length<10)throw Error('Engineering knowledge DB is not ready.');
 const tr=language==='tr',records=new Map(db.records.map(x=>[x.id,x])),sources=new Map(db.sources.map(x=>[x.id,x]));
 const L=(a,b)=>tr?a:b;
 const cat={vtpMode:'campus.vtp',vtpPassword:'campus.vtp',vtpVersion:'campus.vtp',vtpDomain:'campus.vtp',nativeVlan:'campus.native_vlan',allowedVlans:'campus.allowed_vlans',dtp:'campus.dtp',stpMode:'stp.mode',mstRegion:'stp.mode',bridgePriority:'stp.root_priority',portfast:'stp.edge_portfast',bpduGuard:'stp.bpdu_guard',rootGuard:'stp.root_guard',loopGuard:'stp.loop_guard'};
 container.replaceChildren();
 const paper=E('article','paper stp-design-paper');container.append(paper);
 const hdr=A(E('header','report-header'),E('div','report-tag','NETWORK CONFIGURATOR / ENGINEERING ASSESSMENT'),E('h1','',L('STP Mühendislik Analiz Raporu','STP Engineering Assessment Report')),E('p','report-meta',L('Tasarım / konfigürasyon değerlendirmesi · Mühendis onayı bekleniyor','Design / configuration assessment · Engineer approval pending')));
 hdr.append(E('p','report-meta',L('Konfigürasyon bazlı inceleme — AI modeli çalıştırılmadı; operasyonel root ve port durumları doğrulanmadı.','Configuration-only assessment — AI model was not run; live root and port states unverified.')));
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
 paper.append(E('footer','report-footer',L('Kaynak:','Source:')+' Design parameter know-how · SQLite knowledge v'+db.version+' · '+db.signature.slice(0,12)+' · '+L('AI çalıştırılmadı','No AI executed')));
 return {deviceCount:review.devices.length,riskCount:decisions.length,ruleCount:db.records.length};
}
root.NetworkSTPCTOReport={build};
})(typeof window==='undefined'?globalThis:window);