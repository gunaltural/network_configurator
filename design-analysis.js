/* Design facts from generated configuration and planned links; no live state is inferred. */
(function(root){
'use strict';
function build(state){
 const tr=state.language==='tr',p=(a,b)=>tr?a:b,devices=state.devices||[],addresses=[],sections=[],configs=state.configurations||[],unique=x=>[...new Set(x)],vrfs=[],features=new Set();
 for(const config of configs){
  const device=devices.find(d=>d.id===config.deviceId);if(!device)continue;
  let current=null,forti=false,depth=0;
  const flush=()=>{if(current)for(const address of current.addresses)addresses.push({hostname:device.observedHostname||device.hostname||device.id,interface:current.name,address,vrf:current.vrf||p('Varsayılan','Default')});current=null;};
  for(const raw of String(config.text||'').split(/\r?\n/)){
   const line=raw.trim();if(!line||/^[!#]/.test(line))continue;
   if(/^config system interface$/i.test(line)){flush();forti=true;depth=1;continue;}
   if(forti){
    if(/^config /i.test(line)){depth++;continue;}
    if(/^end$/i.test(line)){if(--depth===0){flush();forti=false;}continue;}
    if(depth!==1)continue;
    const edit=line.match(/^edit\s+"?([^"\s]+)"?$/i);if(edit){flush();current={name:edit[1],vrf:'',addresses:[]};continue;}
    if(/^next$/i.test(line)){flush();continue;}
    if(current){const ip=line.match(/^set ip (\d+(?:\.\d+){3})\s+(\d+(?:\.\d+){3})$/i);if(ip&&ip[1]!=='0.0.0.0')current.addresses.push(ip[1]+' '+ip[2]);const vrf=line.match(/^set vrf (\d+)$/i);if(vrf)current.vrf=vrf[1];}continue;
   }
   const interfaceMatch=line.match(/^interface\s+(.+)$/i);
   if(interfaceMatch){flush();current={name:interfaceMatch[1],vrf:'',addresses:[]};continue;}
   if(/^(?:router |bgp |ospf |vrf (?:definition|context)|ip vpn-instance |vlan |route-map |route-policy |policy-map |class-map |line |feature |hostname |sysname )/i.test(line))flush();
   if(/^(?:exit|quit|return|end)$/i.test(line)){flush();continue;}
   if(current){const vrf=line.match(/^(?:vrf (?:member|forwarding)|ip vrf forwarding|ip binding vpn-instance)\s+(\S+)/i);if(vrf){current.vrf=vrf[1];vrfs.push(vrf[1]);}
    const ip=line.match(/^(?:ip|ipv6) address\s+([0-9a-f:.]+(?:\/\d+)?)(?:\s+(\d+(?:\.\d+){3}|\d{1,3}))?(?:\s+secondary)?$/i);if(ip&&!/^(?:dhcp|unnumbered)$/i.test(ip[1]))current.addresses.push(ip[1]+(ip[2]?' '+ip[2]:''));
   }
   if(/^(?:vrf (?:definition|context)|ip vpn-instance)\s+(\S+)/i.test(line))vrfs.push(line.match(/^(?:vrf (?:definition|context)|ip vpn-instance)\s+(\S+)/i)[1]);
   if(/^(?:(?:router bgp|bgp)\s+\d+|config router bgp$)/i.test(line))features.add('BGP');
   if(/^(?:router ospf|ospf)\s+\d+/i.test(line))features.add('OSPF');
   if(/^vpc domain\s+\d+/i.test(line))features.add('Cisco vPC');
   if(/^mlag configuration/i.test(line))features.add('Arista MLAG');
   if(/^(?:dfs-group|m-lag)\b/i.test(line))features.add('Huawei M-LAG');
   if(/^stack\s+/i.test(line))features.add('Huawei iStack');
   if(/^(?:feature nv overlay|interface nve|vxlan vni|vxlan source-interface)/i.test(line))features.add('VXLAN');
  }
  flush();
 }
 const active=(state.links||[]).filter(l=>l.enabled),speeds=unique(active.map(l=>l.speed).filter(Boolean));
 if(active.length)sections.push({title:p('Fiziksel bağlantı ve kapasite düzeni','Physical connectivity and capacity arrangement'),paragraphs:[p(`Bağlantı planında ${active.length} aktif fiziksel bağlantı tanımlanmıştır. Her bağlantının cihaz ve port uçları aşağıdaki çizelgede gösterilir. Bu yerleşim kablolama teslimi ve arayüz doğrulaması için uygulama referansıdır.`,`The connection plan defines ${active.length} active physical links. Device and port endpoints are listed in the schedule below. This placement is the implementation reference for cabling handover and interface verification.`),...(speeds.length?[p(`Planlanan bağlantı hızları: ${speeds.join(', ')}. Yedek yolların aynı fiziksel güzergâh veya güç bağımlılığını paylaşmadığı ve kalan kapasitenin servis yükünü karşılayabildiği kabul testinde ayrıca değerlendirilecektir.`,`Planned link rates: ${speeds.join(', ')}. Acceptance must separately assess physical route/power independence and whether remaining capacity can carry the service load.`)]:[])]});
 if(addresses.length)sections.push({title:p('Arayüz adresleme ve yönlendirme kapsamı','Interface addressing and routing scope'),paragraphs:[p(`${unique(addresses.map(a=>a.hostname)).length} cihazın üretilen konfigürasyonunda ${addresses.length} arayüz adres ataması bulunur. Aşağıdaki çizelge tasarım adreslerini ve açıkça atanan VRF kapsamını gösterir; cihazdan okunmuş operasyonel arayüz durumu değildir. DHCP veya unnumbered arayüzlerde sabit IP adresi varsayılmamıştır.`,`Generated configurations contain ${addresses.length} interface address assignments across ${unique(addresses.map(a=>a.hostname)).length} devices. The schedule shows design addresses and explicitly assigned VRF scope; it is not observed operational interface state. Fixed IP addresses are not assumed for DHCP or unnumbered interfaces.`),...(vrfs.length?[p(`Konfigürasyonda tanımlanan yönlendirme bağlamları: ${unique(vrfs).join(', ')}. VRF ayrıştırması yönlendirme tablolarını ayrı tutar; bağlamlar arası erişim ancak ilgili route-import/export veya açık yönlendirme politikasıyla değerlendirilmelidir.`,`Configured routing contexts: ${unique(vrfs).join(', ')}. VRF separation keeps routing tables distinct; inter-context access must be assessed against the relevant route-import/export or explicit routing policy.`)]:[])]});
 if(features.size)sections.push({title:p('Konfigüre edilen kontrol düzlemi mekanizmaları','Configured control-plane mechanisms'),paragraphs:[p(`Üretilen konfigürasyonda ${[...features].join(', ')} mekanizmaları bulunur. Her mekanizmanın seçilen parametreleri, yönlendirme/anahtarlama davranışı ve arıza etkileri aşağıdaki teknoloji kararları ve mühendislik kabul senaryolarında açıklanır. Komşuluk veya peer durumunun sağlıklı olduğu, yalnız konfigürasyon varlığından çıkarılmaz.`,`Generated configuration contains ${[...features].join(', ')} mechanisms. Their selected parameters, routing/switching behavior and failure effects are explained in the design decisions and engineering acceptance scenarios below. Healthy adjacency or peer state is not inferred solely from configuration presence.`)]});
 return {addresses:addresses.slice(0,2000),sections};
}
root.NetworkReportAnalysis={build};
})(typeof window==='undefined'?globalThis:window);
