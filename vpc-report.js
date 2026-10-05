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
    const istack=modules.find(m=>m.vendor==='Huawei iStack'&&/istack/i.test(m.technology||m.title));
    if((!modules.length&&state.vendor==='Huawei iStack'&&/istack/i.test(state.technology))||(istack&&!modules.some(m=>m.vendor==='Cisco NX-OS'&&m.technology==='vPC'))){
      const d=istack?.design||state,params=istack?.parameters||state.parameters||[],members=(d.devices||[]).filter(x=>x.tier==='upper'),leaves=(d.devices||[]).filter(x=>x.tier==='lower');
      const paths=(d.links||[]).filter(x=>x.enabled),rates=[...new Set(paths.map(x=>x.speed).filter(Boolean))].join(' / ');
      const topology=[pick(`Tasarım, tek mantıksal Huawei iStack switch olarak çalışan ${members.length} fiziksel stack üyesi ve bunlara çapraz üye LACP bağlantılarıyla bağlı ${leaves.length} leaf switch içerir.`,`The design comprises ${members.length} physical stack members operating as one logical Huawei iStack switch and ${leaves.length} leaf switches using cross-member LACP attachments.`)];
      if(rates)topology.push(pick(`Leaf–stack bağlantıları ${rates} hızında planlanmıştır.`,`Leaf-to-stack connections are planned at ${rates}.`));
      return {title:pick('Huawei iStack teknoloji rehberi','Huawei iStack technology guide'),topologyTitle:pick('iStack mimarisi ve bağlantı modeli','iStack architecture and connectivity model'),topology,sections:params.filter(p=>p.impact).map(p=>({title:pick(p.labelTr||p.label,p.label),paragraphs:[pick(p.impactTr||p.impact,p.impact)]})).concat([{title:pick('Kurulum ve kabul sırası','Formation and acceptance sequence'),paragraphs:[pick('Üye hazırlık çıktıları stack kurulmadan önce her cihazda ayrı uygulanır. Planlanan ID değişikliği için kaydetme ve yeniden başlatma bakım planına dahil edilir. Stack kurulduktan sonra ortak servis konfigürasyonu yalnız bir kez uygulanır. Üyeler, stack portları, MAD ve Eth-Trunk üyeleri doğrulanır; kontrollü bağlantı ve üye kaybında kalan kapasite ve trafik kesintisi ölçülür.','Apply member preparation outputs separately before forming the stack. Plan save/restart for member ID changes within the maintenance procedure. After formation, apply the shared service configuration once. Verify members, stack ports, MAD and Eth-Trunk members; measure surviving capacity and traffic interruption during controlled link/member failures.')]}]),sources:[['Huawei · S-series stack configuration', 'https://info.support.huawei.com/network/ptmngsys/Web/tsrev_s/en/content/s/07_Failed_to_Set_Up_a_Stack/edesk_Failed_to_Set_Up_a_Stack_edesk002.html'],['Huawei · Direct-mode MAD example','https://support.huawei.com/enterprise/en/doc/EDOC1100410521/ae875312/example-for-configuring-mad-in-direct-mode']]};
    }
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
      const connectivity=dual===lower.length&&lower.length&&upper.length===2
        ?pick(`Her ${l} switch, iki ${u} switch'e ayrı fiziksel uplinklerle bağlanır.`,`Each ${l} switch connects to both ${u} switches through separate physical uplinks.`)
        :dual?pick(`${dual} ${l} switch, iki farklı ${u} switch'e ayrı fiziksel uplinklerle bağlanır.`,`${dual} ${l} switches connect to two distinct ${u} switches through separate physical uplinks.`):'';
      topology.push(pick(`Tasarım ${upper.length} adet ${u} ve ${lower.length} adet ${l} switch'ten oluşur ve Cisco NX-OS vPC teknolojisini kullanır. ${connectivity} ${l}–${u} bağlantıları toplam ${cross.length} fiziksel uplink üzerinden sağlanır.`,`The design comprises ${upper.length} ${u} and ${lower.length} ${l} switches and uses Cisco NX-OS vPC. ${connectivity} The ${l}–${u} connections use a total of ${cross.length} physical uplinks.`));
      if(cross.length&&speeds.length&&!missing)topology.push(pick(speeds.length===1?`${l}–${u} uplinkleri ${speeds[0]} hızında tasarlanmıştır.`:`${l}–${u} uplinklerinde ${speeds.join(', ')} bağlantı hızları kullanılır.`,speeds.length===1?`The ${l}–${u} uplinks are designed to operate at ${speeds[0]}.`:`The ${l}–${u} uplinks use link rates of ${speeds.join(', ')}.`));
      const special=design.specialLinks||[],peers=special.filter(s=>/peer[- ]link/i.test(s.kind)&&!s.logical),ka=special.filter(s=>/keepalive/i.test(s.kind));
      topology.push(pick(`vPC eşleşmesi ${design.techPlacement==='lower'?l:u} katmanında planlanmıştır. ${peers.length} fiziksel peer-link üyesi ve ${ka.length} keepalive kontrol yolu kayıtlıdır. ${ka.length?'Keepalive uçları özel bağlantı çizelgesinde gösterilir.':'Keepalive yolu henüz rapor bağlantılarında tanımlanmamıştır.'}`,`The vPC pair is planned in the ${design.techPlacement==='lower'?l:u} tier. The design records ${peers.length} physical peer-link members and ${ka.length} keepalive control paths. ${ka.length?'Keepalive endpoints appear in the special-connection schedule.':'No keepalive path is recorded in the report connections yet.'}`));
    }
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
  function separateTopologyNarratives(state){
    const tr=state.language==='tr',pick=(a,b)=>tr?a:b;
    const rolesTr={'Stack member':'stack üyesi','Device':'ağ cihazı','Peer':'eş cihaz','Router':'yönlendirici','CE router':'CE yönlendirici','ISP router':'ISP yönlendirici','Network device':'ağ cihazı','Managed device':'yönetilen cihaz','Edge router':'uç yönlendirici','External endpoint':'harici uç','DC-1 node':'DC-1 düğümü','DC-2 node':'DC-2 düğümü','Fabric VTEP':'Fabric VTEP'};
    const modules=state.moduleReports||[];
    const scopes=modules.length?modules.filter(m=>m.design).map(m=>({...m,design:{...m.design,vendor:m.vendor,technology:m.technology}})):[{title:state.technology,design:state}];
    return scopes.map(scope=>{
      const design=scope.design,guide=build({...design,language:state.language,moduleReports:[]});
      if(guide)return {title:guide.topologyTitle,paragraphs:guide.topology};
      const devices=(design.devices||[]).filter(d=>!d.inventoryOnly&&!d.inventoryRecord),ids=new Set(devices.map(d=>d.id));
      const labels=design.roles||{upper:design.architecture==='core-access'?'Core':design.architecture==='spine-leaf'?'Spine':'Network device',lower:design.architecture==='core-access'?'Access':design.architecture==='spine-leaf'?'Leaf':'Network device'};
      const counts=new Map();
      devices.forEach(d=>{const role=labels[d.tier]||'Network device';counts.set(role,(counts.get(role)||0)+1);});
      const roles=[...counts].map(([role,n])=>tr?`${n} adet ${rolesTr[role]||role}`:`${n} ${role}${n===1?'':'s'}`);
      const vendor=design.vendor==='Huawei_CE_SW'?'Huawei CloudEngine':design.vendor;
      const paragraphs=[];
      if(devices.length)paragraphs.push(pick(`Tasarım ${roles.join(' ve ')} içerir. ${vendor} platformunda ${design.technology} teknolojisi kullanılır.`,`The design comprises ${roles.join(' and ')}. It uses ${design.technology} on the ${vendor} platform.`));
      const links=(design.links||[]).filter(l=>l.enabled&&ids.has(l.a)&&ids.has(l.b));
      if(links.length){
        const names=[...new Set(devices.filter(d=>links.some(l=>l.a===d.id||l.b===d.id)).map(d=>labels[d.tier]))].filter(Boolean);
        const roleText=names.map(role=>tr?rolesTr[role]||role:role).join(' / ');
        paragraphs.push(pick(`${roleText} bağlantı planı ${links.length} fiziksel bağlantıdan oluşur.`,`The ${roleText} connection plan contains ${links.length} physical ${links.length===1?'connection':'connections'}.`));
        if(links.every(l=>String(l.speed||'').trim())){
          const speeds=[...new Set(links.map(l=>l.speed.trim()))];
          paragraphs.push(pick(`Bu bağlantılar ${speeds.join(', ')} hızında tasarlanmıştır.`,`These connections are designed for ${speeds.join(', ')} link rates.`));
        }
      }
      const logical=(design.specialLinks||[]).filter(l=>l.logical&&ids.has(l.a)&&ids.has(l.b));
      if(logical.length){const kinds=[...new Set(logical.map(l=>l.kind))];paragraphs.push(pick(`Mantıksal kontrol bağlantıları ${kinds.join(', ')} oturumlarını içerir. Bu oturumlar fiziksel kablo bağlantılarından ayrı olarak gösterilir.`,`Logical control connections include ${kinds.join(', ')} sessions, shown separately from physical cable connections.`));}
      return {title:pick(`${scope.title} topolojisi ve bağlantı modeli`,`${scope.title} topology and connectivity model`),paragraphs};
    }).filter(section=>section.paragraphs.length);
  }
  const isService=m=>/^(BASIC|QOS)$/.test(m.module||'')||/System and Management|^QoS$/i.test(m.technology||m.title||'');
  const cleanLabel=text=>String(text||'').replace(/\bCombined\b\s*[·:+-]?\s*/gi,'').trim();
  function designPresentation(state){
    const modules=state.moduleReports||[],tr=state.language==='tr',pick=(a,b)=>tr?a:b;
    const technology=modules.length?modules.map(m=>cleanLabel(m.technology||m.title)).join(' + '):cleanLabel(state.technology);
    const vendors=[...new Set(modules.length?modules.map(m=>m.vendor):[state.vendor])].map(v=>v==='Huawei_CE_SW'?'Huawei CloudEngine':v).join(', ');
    if(!modules.length)return {technology,vendors,narratives:separateTopologyNarratives(state),overview:'',approach:'',svg:state.topologySvg||''};
    const physical=modules.filter(m=>!isService(m)&&m.design);
    const scopes=physical.length?physical:modules.filter(m=>m.design&&!isService(m));
    const rank=m=>/vPC|MLAG|M-LAG|iStack|StackWise|EVPN|VXLAN|STP/i.test(m.technology||m.title)?0:/BGP|OSPF|SD-WAN/i.test(m.technology||m.title)?1:2;
    const ordered=[...scopes].sort((a,b)=>rank(a)-rank(b));
    const paragraphs=[];
    for(const m of ordered){
      const sections=separateTopologyNarratives({...m.design,language:state.language,vendor:m.vendor,technology:m.technology,moduleReports:[]});
      const domain=rank(m)===0?pick('Veri merkezi ve anahtarlama yapısı','In the data centre and switching architecture'):rank(m)===1?pick('Yönlendirme ve WAN bağlantı yapısı','In the routing and WAN architecture'):pick('Ağ bağlantı yapısı','In the network connectivity architecture');
      const text=sections.flatMap(x=>x.paragraphs).join(' ').replace(/^Tasarım /,`${domain} `).replace(/^The design /,`${domain}, the design `);
      if(text)paragraphs.push(text);
    }
    const serviceParts=modules.filter(isService).map(m=>{
      const targets=[...new Set((m.design?.devices||[]).filter(d=>!d.inventoryOnly&&!d.inventoryRecord).map(d=>d.hostname).filter(Boolean))];
      const label=/QoS/i.test(m.technology||m.title)?pick('QoS politikaları','QoS policies'):pick('Sistem ve yönetim ayarları','System and management settings');
      return pick(`${label}${targets.length?` ${targets.join(', ')} için hazırlanmıştır`:' tasarımın işletim kapsamını tanımlar'}.`,`${label}${targets.length?` are prepared for ${targets.join(', ')}`:' define the operational scope of the design'}.`);
    });
    paragraphs.push(...serviceParts);
    const overview=paragraphs.map(p=>p.split(/(?<=\.)\s/)[0]).join(' ');
    const identities=new Set(ordered.flatMap(m=>(m.design?.devices||[]).filter(d=>!d.inventoryOnly&&!d.inventoryRecord).map(d=>`${m.vendor}|${d.hostname||m.module+'|'+d.id}`)));
    const physicalCount=identities.size;
    const approach=pick(`Tasarımın teknoloji kapsamı ${technology}; platform kapsamı ${vendors} olarak belirlenmiştir. Bağlantı yedekliliği, yönlendirme politikaları ve işletim ayarları aşağıdaki tasarım kararlarıyla açıklanır. Cihaz konfigürasyonları ve bağlantı çizelgeleri aynı proje kapsamında sunulur.`,`The technology scope is ${technology}, using ${vendors}. The design decisions below explain link resilience, routing policies and operational settings. Device configurations and connection schedules are presented within the same project.`);
    return {technology,vendors,overview,approach,physicalCount,narratives:paragraphs.length?[{title:pick('Ağ mimarisi ve bağlantı modeli','Network architecture and connectivity model'),paragraphs}]:[],svg:architectureSvg(state,ordered,serviceParts)};
  }
  function architectureSvg(state,modules,serviceParts){
    const tr=state.language==='tr',escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const panels=modules.filter(m=>m.topologySvg),height=panels.length*340+(serviceParts.length?75:0)+55;
    if(!panels.length)return '';
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}"><rect width="1100" height="${height}" fill="#f6f9fc"/><text x="30" y="32" font-family="Arial" font-size="22" fill="#17324d">${tr?'Ağ mimarisi':'Network architecture'}</text>`;
    panels.forEach((m,i)=>{
      const label=/BGP|OSPF|SD-WAN/i.test(m.technology||m.title)?(tr?'Yönlendirme ve WAN':'Routing and WAN'):(tr?'Anahtarlama ve ağ bağlantıları':'Switching and network connectivity');
      const y=50+i*340;
      svg+=`<rect x="15" y="${y}" width="1070" height="330" rx="12" fill="#fff" stroke="#d4e0ec"/><text x="30" y="${y+26}" font-family="Arial" font-size="17" fill="#17324d">${escape(label+' · '+cleanLabel(m.technology||m.title)+' · '+m.vendor)}</text>`;
      const nested=m.topologySvg.replace(/<\?xml[^>]*\?>/g,'').replace(/<svg\b[^>]*>/,tag=>tag.replace(/\s(?:x|y|width|height)="[^"]*"/g,'').replace('<svg',`<svg x="25" y="${y+40}" width="1050" height="280"`));
      svg+=nested;
    });
    if(serviceParts.length)svg+=`<rect x="15" y="${50+panels.length*340}" width="1070" height="60" rx="12" fill="#e8f0f7"/><text x="30" y="${86+panels.length*340}" font-family="Arial" font-size="17" fill="#17324d">${tr?'İşletim kapsamı: Sistem yönetimi ve hizmet politikaları':'Operational scope: System management and service policies'}</text>`;
    return svg+'</svg>';
  }
  function topologyNarratives(state){return designPresentation(state).narratives;}
  root.NetworkReportGuide={build,topologyNarratives,designPresentation};

  if(typeof module!=='undefined'&&module.exports)module.exports=root.NetworkReportGuide;
})(typeof window==='undefined'?globalThis:window);
