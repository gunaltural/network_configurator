/* Report narrative derived from the design, never from inventory counts.
 * Cisco references are recorded with the guide and remain visible in exports. */
(function(root){
  'use strict';
  const sources=[
    ['Cisco vPC Best Practices Design Guide','https://www.cisco.com/c/dam/en/us/td/docs/switches/datacenter/sw/design/vpc_design/vpc_best_practices_design_guide.pdf'],
    ['Nexus 9000 vPC Best Practices','https://www.cisco.com/c/en/us/support/docs/switches/nexus-9000-series-switches/218333-understand-and-configure-nexus-9000-vpc.html'],
    ['NX-OS 10.5(x) Configuring vPCs','https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/105x/configuration/interfaces/cisco-nexus-9000-series-nx-os-interfaces-configuration-guide-release-105x/m_configuring_vpcs_9x.html'],
    ['Virtual Port Channel Operations','https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus5000/sw/operations/n5k_vpc_ops.html'],
    ['Understand vPC Enhancements','https://www.cisco.com/c/en/us/support/docs/ios-nx-os-software/nx-os-software/217274-understand-virtual-port-channel-vpc-en.html'],
    ['NX-OS 10.5(x) Troubleshooting vPCs','https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/105x/configuration/troubleshooting/cisco-nexus-9000-series-nx-os-troubleshooting-guide-105x/m-troubleshooting-vpcs.html'],
    ['Troubleshoot vPC Inconsistency Issues','https://www.cisco.com/c/en/us/support/docs/ios-nx-os-software/nx-os-software/217989-troubleshoot-vpc-inconsistency-issues-on.html']
  ].map(([title,url])=>({title,url}));
  const chapters=[
    ['Yönetici özeti ve iş kazanımları','Executive summary and business benefits',
      'Cisco vPC, iki Nexus üzerinden aynı Layer 2 port-channel bağlantısını sunarak uygun uçlarda aktif-aktif iletimi hedefler. Bağlantı veya şasi kaybında kalan yol servisi sürdürebilir. İş kazanımı, yedek yolun gerçekten bağımsız olması ve arıza sonrası kapasitenin servis ihtiyacını karşılamasına bağlıdır; kesinti süresi kabul testleriyle ölçülmelidir. [2]',
      'Cisco vPC presents one Layer 2 port-channel across two Nexus peers, enabling active-active forwarding for suitable endpoints. A surviving path can maintain service after a link or chassis failure. Business continuity depends on independent paths and adequate residual capacity; outage duration must be measured during acceptance testing. [2]'],
    ['vPC kapsamı ve temel bileşenler','vPC scope and core components',
      'vPC domain iki eş cihazı, peer-link ve member port-channel bağlantılarını ilişkilendirir. Uç cihaz LACP ile tek bir bundle görür; Nexus cihazları ayrı yönetim ve kontrol düzlemlerini korur. Primary/secondary rolleri normal iletimde aktif/pasif anlamına gelmez. vPC, tek başına EVPN kontrol düzlemi veya yönlendirilmiş spine–leaf fabric oluşturmaz. [2, 3]',
      'A vPC domain associates two peers, their peer-link and member port-channels. The endpoint sees one LACP bundle while Nexus peers retain separate management and control planes. Primary/secondary roles do not imply active/standby forwarding during normal operation. vPC alone does not establish an EVPN control plane or a routed spine–leaf fabric. [2, 3]'],
    ['Peer-link ve bağımsız keepalive yolu','Peer-link and independent keepalive path',
      'Peer-link, CFSoE üzerinden eş durumunu ve MAC bilgilerini eşler; gerekli broadcast, unknown-unicast ve multicast trafiğini de taşır. Bir yerel member bağlantısı kaybolduğunda veri için alternatif yol olabilir. Peer-keepalive, ayrı Layer 3 erişimiyle eşin canlılığını değerlendirir; veri veya durum eşleme kanalı değildir. İki yolun ortak kablo, modül ve ara ağ bağımlılığı azaltılmalıdır. [1, 3, 4]',
      'The peer-link synchronizes peer state and MAC information through CFSoE and carries required broadcast, unknown-unicast and multicast traffic. It can carry data when a local member becomes unavailable. Peer-keepalive checks peer liveness over a separate Layer 3 path; it carries neither service data nor state synchronization. Shared cabling, modules and transit dependencies should be minimized. [1, 3, 4]'],
    ['Trafik akışı ve kapasite','Traffic forwarding and capacity',
      'Akışlar port-channel hash algoritmasıyla üyelere dağıtılır; tek bir akış bundle toplamını değil seçilen üyenin kapasitesini kullanır. Uygun yerel çıkış varken normal unicast iletimi peer-link üzerinden dolaştırılmaz. Üye veya şasi arızası kalan bağlantılara yük bindirir. Peer-link boyutlandırması normal trafik yanında arıza sonrası trafik ve BUM yükünü kapsamalıdır. [3, 4]',
      'Port-channel hashing distributes flows among members; a single flow uses one member rather than the aggregate bundle capacity. Normal unicast prefers a suitable local egress instead of traversing the peer-link. Member or chassis failure increases load on surviving paths. Peer-link sizing must include failure traffic and BUM demand, alongside steady-state requirements. [3, 4]'],
    ['STP ve tutarlılık kontrolleri','STP and consistency checks',
      'STP döngü koruması olarak korunur. Peer-switch kullanımı, vPC VLAN’larında ortak STP root kimliği ve simetrik STP ayarları gerektirir. Domain, member kimliği, VLAN kapsamı ve kritik arayüz parametreleri eşler arasında uyumlu olmalıdır. Type-1 uyumsuzluk etkilenen vPC/port/VLAN’ı askıya alabilir; Type-2 bulguları da hizmet etkisi açısından incelenmelidir. [5, 7]',
      'STP remains a loop-protection mechanism. Peer-switch requires a common STP root identity for vPC VLANs and symmetric STP settings. Domain, member identity, VLAN scope and critical interface parameters must agree between peers. Type-1 mismatches can suspend the affected vPC, port or VLAN; Type-2 findings also require service-impact review. [5, 7]'],
    ['Gateway ve Layer 3 sınırları','Gateway and Layer 3 boundaries',
      'SVI VLAN’ın Layer 3 arayüzüdür; FHRP istemci gateway sürekliliğini düzenler. Peer-gateway, eşin router MAC adresine gelen paketi yerel yönlendirerek gereksiz peer-link kullanımını azaltabilir; routing tablolarını tekleştirmez. vPC üzerinden routing adjacency için layer3 peer-router desteği, model ve sürüm koşulları ayrıca kontrol edilmelidir; peer-gateway tek başına bu gereksinimi çözmez. [5]',
      'An SVI provides the VLAN Layer 3 interface; FHRP coordinates client gateway availability. Peer-gateway can locally route packets addressed to the other peer’s router MAC, reducing peer-link traversal; it does not merge routing tables. Routing adjacency over vPC requires a separate review of layer3 peer-router support and platform/release conditions; peer-gateway alone is insufficient. [5]'],
    ['Arıza senaryoları ve servis etkisi','Failure scenarios and service impact',
      'Member kaybı akışları kalan üyelere taşır. Peer-link kaybında keepalive eşin canlı olduğunu doğrularsa secondary, döngü riskine karşı vPC üyelerini askıya alır. Kurulu adjacency’de yalnız keepalive kaybı normalde iletimi durdurmaz fakat ikinci arıza korumasını zayıflatır. İki yolun kayıp sırası dual-active sonucunu etkiler. Orphan port tek eşe bağlıdır ve vPC yedekliliğini otomatik kazanmaz. [1, 4]',
      'A member failure redistributes flows to surviving links. If the peer-link fails while keepalive confirms a live peer, the secondary suspends vPC members to prevent loops. Keepalive loss alone in an established adjacency normally preserves forwarding but weakens protection against a second failure. Failure order affects dual-active behavior. An orphan port connects to one peer and does not automatically inherit vPC redundancy. [1, 4]'],
    ['Geri dönüş ve tasarım önerileri','Recovery and design recommendations',
      'Auto-recovery belirli tek eşle toparlanma durumlarında yerel vPC’leri yeniden açabilir. Delay restore, geri gelen bağlantının routing ve peer durumu hazır olmadan trafik çekmesini önlemek için süre tanır. Orphan-port suspend uç cihazın failover davranışıyla birlikte tasarlanmalıdır. Peer-link en az iki fiziksel üyeyle, mümkünse farklı modül/ASIC ve güç/kablo hata alanlarıyla kurulmalı; VLAN kapsamı gerekli servislerle sınırlandırılmalıdır. [1, 6]',
      'Auto-recovery can restore local vPCs in specific lone-peer recovery conditions. Delay restore allows routing and peer state to recover before returning links attract traffic. Orphan-port suspend must match endpoint failover behavior. Use at least two physical peer-link members, diverse modules/ASICs and power/cabling failure domains where feasible, and limit VLAN scope to required services. [1, 6]'],
    ['Operasyonel doğrulama ve kabul','Operational verification and acceptance',
      'İki eşte show vpc brief, show vpc peer-keepalive, show vpc consistency-parameters global, show vpc consistency-parameters vlans ve show port-channel summary ile adjacency, canlılık, tutarlılık ve member durumları karşılaştırılmalıdır. show spanning-tree summary ile root/peer-switch kontrol edilir. Kontrollü üye, şasi ve kontrol yolu arızalarında paket kaybı, yakınsama ve kalan kapasite ölçülmeli; sonuçlar müşteri kabul hedefleriyle karşılaştırılmalıdır. [6, 7]',
      'On both peers compare adjacency, liveness, consistency and member status with show vpc brief, show vpc peer-keepalive, show vpc consistency-parameters global, show vpc consistency-parameters vlans and show port-channel summary. Check root/peer-switch behavior with show spanning-tree summary. Controlled member, chassis and control-path failures should measure packet loss, convergence and residual capacity against customer acceptance targets. [6, 7]']
  ];
  function build(state){
    const tr=state.language==='tr', pick=(a,b)=>tr?a:b;
    const modules=state.moduleReports||[];
    const module=modules.find(m=>m.vendor==='Cisco NX-OS'&&m.technology==='vPC');
    if(modules.length?!module:state.vendor!=='Cisco NX-OS'||state.technology!=='vPC')return null;
    const design=module?(module.design||null):state;
    let topology=[];
    if(design){
      const devices=(design.devices||[]).filter(d=>!d.inventoryOnly&&!d.inventoryRecord&&!d.external);
      const upper=devices.filter(d=>d.tier==='upper'),lower=devices.filter(d=>d.tier==='lower');
      const ids=new Set(devices.map(d=>d.id));
      const links=(design.links||[]).filter(l=>l.enabled&&ids.has(l.a)&&ids.has(l.b));
      const upperIds=new Set(upper.map(d=>d.id)),lowerIds=new Set(lower.map(d=>d.id));
      const cross=links.filter(l=>upperIds.has(l.a)&&lowerIds.has(l.b)||upperIds.has(l.b)&&lowerIds.has(l.a));
      const dual=lower.filter(d=>new Set(cross.filter(l=>l.a===d.id||l.b===d.id).map(l=>l.a===d.id?l.b:l.a)).size>=2).length;
      const speeds=[...new Set(cross.map(l=>String(l.speed||'').trim()).filter(Boolean))];
      const missing=cross.filter(l=>!String(l.speed||'').trim()).length;
      const roles=design.roles||{},u=roles.upper||(design.architecture==='core-access'?'Core':'Spine'),l=roles.lower||(design.architecture==='core-access'?'Access':'Leaf');
      topology.push(pick(`Planlanan yapı ${upper.length} adet ${u} ve ${lower.length} adet ${l} cihazından oluşur; Cisco NX-OS vPC teknolojisi seçilmiştir. ${cross.length} katmanlar arası bağlantı modellenmiştir. ${dual}/${lower.length} ${l} en az iki farklı üst katman cihazına bağlıdır.`,`The planned design comprises ${upper.length} ${u} and ${lower.length} ${l} devices and uses Cisco NX-OS vPC. It models ${cross.length} inter-tier connections; ${dual}/${lower.length} ${l} devices connect to at least two distinct upper-tier devices.`));
      topology.push(pick(`${speeds.length?`Seçilen bağlantı hızları: ${speeds.join(', ')}.`:'Katmanlar arası bağlantı hızı belirtilmemiştir.'}${missing?` ${missing} bağlantının hızı henüz belirtilmemiştir.`:''} Bu bağlantılar fiziksel yol yedekliliğini gösterir; bağımsız güç, kablo güzergâhı ve arıza sonrası kapasite ayrıca doğrulanmalıdır.`,`${speeds.length?`Selected link rates: ${speeds.join(', ')}.`:'Inter-tier link speed is unspecified.'}${missing?` ${missing} connections still have no specified rate.`:''} These links model physical path diversity; independent power, cabling and residual capacity require separate validation.`));
      const special=design.specialLinks||[],peers=special.filter(s=>/peer[- ]link/i.test(s.kind)&&!s.logical),ka=special.filter(s=>/keepalive/i.test(s.kind));
      topology.push(pick(`vPC eşleşmesi ${design.techPlacement==='lower'?l:u} katmanında planlanmıştır. ${peers.length} fiziksel peer-link üyesi ve ${ka.length} keepalive kontrol yolu kayıtlıdır. ${ka.length?'Keepalive uçları özel bağlantı çizelgesinde gösterilir.':'Keepalive yolu henüz rapor bağlantılarında tanımlanmamıştır.'}`,`The vPC pair is planned in the ${design.techPlacement==='lower'?l:u} tier. The design records ${peers.length} physical peer-link members and ${ka.length} keepalive control paths. ${ka.length?'Keepalive endpoints appear in the special-connection schedule.':'No keepalive path is recorded in the report connections yet.'}`));
    }else topology.push(pick('Birleşik rapor Cisco vPC tasarımını içerir. Bu eski kayıt modülün katman ve bağlantı ayrıntılarını taşımıyor; vPC topoloji açıklamasını güncellemek için raporu Technology Workspaces üzerinden yeniden oluşturun.','The combined report includes Cisco vPC. This older record lacks module-specific tier/link details; regenerate it from Technology Workspaces to refresh the vPC topology narrative.'));
    const configs=(state.configurations||[]).filter(c=>/^\s*vpc domain \d+/m.test(c.text||'')).map(c=>c.text);
    const choices=[];
    const features=[
      ['peer-switch','Peer-switch','Ortak STP root davranışı için iki eşin VLAN ve STP ayarları simetrik olmalıdır.','A common STP root requires symmetric VLAN and STP settings.'],
      ['peer-gateway','Peer-gateway','Eş router MAC adresine gelen trafik yerel yönlendirilebilir.','Traffic addressed to the peer router MAC can be routed locally.'],
      ['ip arp synchronize','ARP synchronization','ARP durum eşlemesi gateway sürekliliğine destek olur.','ARP state synchronization supports gateway continuity.'],
      ['auto-recovery(?: reload-delay)?(?: \\d+)?','Auto-recovery','Tek eşle geri dönüş davranışı arıza sırası ve hedef sürümle test edilmelidir.','Lone-peer recovery must be tested for failure order and target release.'],
      ['delay restore(?: interface-vlan)? \\d+','Delay restore','Seçilen bekleme süresi ölçülen kontrol düzlemi yakınsamasına göre değerlendirilmelidir.','The configured delay must be assessed against measured control-plane convergence.']
    ];
    for(const [pattern,label,whyTr,whyEn] of features){
      const re=new RegExp('^\\s*('+pattern+')\\s*$','m'),matches=configs.map(c=>c.match(re)?.[1]||'');
      choices.push(pick(`${label}: ${!configs.length?'üretilen konfigürasyon mevcut değil':matches.every(Boolean)?`rapordaki ${configs.length} vPC eş konfigürasyonunda seçili (${[...new Set(matches)].join('; ')})`:matches.some(Boolean)?'eş konfigürasyonları arasında seçim farklı; inceleme gerekli':'üretilen konfigürasyonda seçili değil'}. ${whyTr}`,`${label}: ${!configs.length?'no generated peer configuration available':matches.every(Boolean)?`selected in all ${configs.length} reported vPC peer configurations (${[...new Set(matches)].join('; ')})`:matches.some(Boolean)?'selection differs between reported peers; review required':'not selected in generated configuration'}. ${whyEn}`));
    }
    return {title:pick('Cisco vPC teknoloji rehberi','Cisco vPC technology guide'),topologyTitle:pick('Seçilen vPC topolojisi ve bağlantı modeli','Selected vPC topology and connectivity model'),topology,
      sections:[...chapters.map(([a,b,c,d])=>({title:pick(a,b),paragraphs:[pick(c,d)]})),{title:pick('Bu projede seçilen özellikler','Features selected in this project'),paragraphs:choices},{title:pick('Platform ve sürüm değerlendirmesi','Platform and release assessment'),paragraphs:[pick('Rehber klasik fiziksel peer-link tasarımını açıklar. Fabric peering, EVPN/VXLAN ve ISSU için ayrı koşullar geçerlidir. Kaynaklardaki eski Nexus örnekleri kavramsal referanstır; komut ve varsayılanlar hedef model/NX-OS sürümüyle doğrulanmalıdır. Seçim durumu üretilen konfigürasyondan okunmuştur; canlı cihaz doğrulaması değildir.','This guide describes a conventional physical peer-link design. Fabric peering, EVPN/VXLAN and ISSU have additional conditions. Older Nexus examples provide conceptual context; commands and defaults require target model/NX-OS validation. Selection status comes from generated configuration and is not live device verification.')]}],sources};
  }
  root.NetworkReportGuide={build};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.NetworkReportGuide;
})(typeof window==='undefined'?globalThis:window);
