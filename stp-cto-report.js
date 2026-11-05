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
 const kpis=E('div','summary-grid');
 for(const [title,val] of [[L('Cihazlar','Devices'),review.devices.length],[L('Öncelikli incelemeler','Risk reviews'),risk.length],[L('Design bilgi kayıtları','Design knowledge rules'),db.records.length],[L('Operasyonel durum','Operational state'),L('Doğrulanmadı','Not verified')]]){
  kpis.append(A(E('div','metric'),E('b','',val),E('span','',title)));
 }
 paper.append(E('h2','',L('1 · Yönetici özeti','1 · Executive summary')));
 paper.append(E('p','',L('Değerlendirme yalnızca seçilen cihaz konfigürasyonlarına dayanır. Canlı root/port durumları doğrulanmadı.','Review is based only on selected configurations. Live root and port state is unverified.')));
 paper.append(kpis);
 const rootFindings=preflight.findings.filter(x=>['BRIDGE_PRIORITY_COMPARISON','EQUAL_BRIDGE_PRIORITY'].includes(x.code));
 const sec=E('section','');sec.append(E('h2','',L('2 · STP Root Tasarımı ve Yedeklilik','2 · Root Placement and Redundancy')));
 if(rootFindings.length){
  const distinct=[...new Set(rootFindings.map(x=>x.claim.replace(/^(VLAN|MST) \d+:/,'').trim()))];
  sec.append(E('p','',rootFindings.length+' VLAN/instance: '+distinct.join(' · ')));
  sec.append(E('p','',L('Düşük konfigüre priority birincil root tercihine işaret eder. Gerçek root seçimi yalnız konfigürasyondan kanıtlanamaz. Root yerleşiminin active/standby mı yoksa VLAN bazlı yük paylaşımı mı hedeflediği topoloji bağlamında doğrulanmalıdır.','Lower configured priority favors the root candidate, but does not prove live root state. Validate whether design intends active/standby or per-VLAN load sharing.')));
  sec.append(E('small','',rootFindings.flatMap(x=>x.refs).filter((x,i,a)=>a.indexOf(x)===i).join(' · ')));
 }else sec.append(E('p','',L('İki cihazdan karşılaştırılabilir root priority kanıtı alınamadı.','No comparable bridge priorities supplied across both nodes.')));
 paper.append(sec);
 const risks=E('section','');risks.append(E('h2','',L('3 · Riskler ve Mühendislik Kararları','3 · Risks and Engineering Decisions')));
 if(!risk.length)risks.append(E('p','',L('Açık konfigürasyon tutarsızlığı bulunamadı; bu, ağın sağlıklı olduğu anlamına gelmez.','No explicit contradiction found; this does not establish network health.')));
 for(const item of risk){
  const r=records.get(cat[item.parameter]),card=E('div','decision');
  const head=A(E('div','cto-finding-head'),E('strong','',item.title),E('span','choice',item.severity.toUpperCase()));card.append(head);
  card.append(E('p','',item.impact));
  if(r){
   card.append(E('p','cto-context',L('Design know-how','Design know-how')+': '+r.context));
   card.append(E('p','cto-action',L('Mühendislik aksiyonu','Engineering action')+': '+r.analysis));
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
 return {deviceCount:review.devices.length,riskCount:risk.length,ruleCount:db.records.length};
}
root.NetworkSTPCTOReport={build};
})(typeof window==='undefined'?globalThis:window);