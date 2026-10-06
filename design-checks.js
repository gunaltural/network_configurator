(function(root){
'use strict';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function ipv4(value){const s=String(value??'').trim();if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s))return null;const octets=s.split('.').map(Number);return octets.some(n=>n>255)?null:octets.reduce((n,v)=>n*256+v,0);}
function prefix(value){const s=String(value??'').trim().replace(/^\//,'');if(/^\d{1,2}$/.test(s))return +s<=32?+s:null;const mask=ipv4(s);if(mask===null)return null;const bits=mask.toString(2).padStart(32,'0');return /^1*0*$/.test(bits)?bits.indexOf('0')<0?32:bits.indexOf('0'):null;}
function cidr(value){const parts=String(value??'').trim().split('/');if(parts.length!==2)return null;const ip=ipv4(parts[0]),p=prefix(parts[1]);if(ip===null||p===null)return null;const size=2**(32-p),network=Math.floor(ip/size)*size;return {ip,p,network,last:network+size-1};}
function asn(value){const s=String(value??'').trim();if(/^\d+$/.test(s))return Number(s);if(/^\d+\.\d+$/.test(s)){const [a,b]=s.split('.').map(Number);if(a<=65535&&b<=65535)return a*65536+b;}return NaN;}
function port(value){return String(value||'').replace(/\s+/g,'').toLowerCase().replace(/^gi(?=\d)/,'gigabitethernet').replace(/^te(?=\d)/,'tengigabitethernet').replace(/^fo(?=\d)/,'fortygigabitethernet').replace(/^et(?=\d)/,'ethernet').replace(/^eth(?=\d)/,'ethernet').replace(/^xge(?=\d)/,'xgigabitethernet').replace(/^10gigabitethernet/,'xgigabitethernet');}
function ports(value){return String(value||'').split(',').flatMap(part=>{const s=part.trim(),m=s.match(/^(.*\/)(\d+)\s*-\s*(\d+)$/);return m&&+m[3]>=+m[2]&&+m[3]-+m[2]<128?Array.from({length:+m[3]-+m[2]+1},(_,i)=>port(m[1]+(+m[2]+i))):s?[port(s)]:[];});}
function vlanSet(value){const values=[];for(const part of String(value||'').trim().split(/[,\s]+/)){const m=part.match(/^(\d+)(?:-(\d+))?$/);if(!m)return null;const a=+m[1],b=m[2]?+m[2]:a;if(a<1||b>4094||a>b)return null;for(let n=a;n<=b;n++)values.push(n);}return new Set(values);}
function evaluate({module,platform,fields:f={}}){
 const issues=[],seenPorts=new Map();let evaluated=0;
 const has=id=>own(f,id),value=id=>String(f[id]??'').trim(),on=id=>f[id]===true||f[id]==='Enabled',num=id=>Number(value(id));
 const add=(code,ids,message,severity='error')=>{issues.push({code,fields:ids.filter(has),message,severity});};
 const check=(code,ids,condition,message,severity='error')=>{evaluated++;if(!condition)add(code,ids,message,severity);};
 const integer=(id,min,max)=>{if(!has(id))return null;const n=num(id),valid=/^\d+$/.test(value(id))&&Number.isSafeInteger(n)&&n>=min&&n<=max;check('integer',[id],valid,`${id}: enter an integer from ${min} to ${max}.`);return valid?n:null;};
 const ip=(id)=>{if(!has(id))return null;const n=ipv4(value(id));check('ipv4',[id],n!==null,`${id}: enter a valid IPv4 address.`);return n;};
 const address=(id,host=true)=>{if(!has(id))return null;const a=cidr(value(id));check('cidr',[id],!!a,`${id}: enter an IPv4 address with a prefix from /0 to /32.`);if(a&&host)check('host-address',[id],a.ip>0&&a.ip<0xe0000000&&(a.p>=31||a.ip!==a.network&&a.ip!==a.last),`${id}: use a unicast host address; network and broadcast addresses cannot identify an interface. /31 point-to-point addresses are supported.`);return a;};
 const autonomous=id=>{if(!has(id))return null;const n=asn(value(id));check('asn',[id],Number.isInteger(n)&&n>0&&n<4294967295&&n!==65535,`${id}: use a valid ASN in asplain or asdot notation; AS 0, 65535 and 4294967295 are reserved.`);return n;};
 const pair=(a,b)=>{const x=address(a),y=address(b);if(x&&y){check('link-subnet',[a,b],x.p===y.p&&x.network===y.network&&x.p<=31,`${a} / ${b}: directly connected endpoints must use the same subnet and prefix (/31 is supported).`);check('link-address',[a,b],x.ip!==y.ip,`${a} / ${b}: the two endpoints must have different addresses.`);}return [x,y];};
 const gateway=(a,g,raw)=>{const x=raw?cidr(raw):address(a),y=ip(g);if(raw&&x)check('host-address',[a],x.ip>0&&x.ip<0xe0000000&&(x.p>=31||x.ip!==x.network&&x.ip!==x.last),`${a}: choose a usable unicast host address in the management subnet.`);if(x&&y!==null)check('gateway',[a,g],x.ip!==y&&Math.floor(y/2**(32-x.p))*2**(32-x.p)===x.network&&(x.p>=31||y!==x.network&&y!==x.last),`${g}: choose a different usable host in the subnet of ${a}.`);};
 const unique=(ids,transform=s=>s.toLowerCase(),code='duplicate')=>{const seen=new Map();for(const id of ids.filter(has)){const key=transform(value(id));if(!key)continue;check(code,[seen.get(key),id].filter(Boolean),!seen.has(key),`${id}${seen.has(key)?' / '+seen.get(key):''}: use distinct values for these devices or resources.`);seen.set(key,id);}};
 const reserve=(id,device,items)=>{if(!has(id))return;const list=items||ports(value(id));check('port-required',[id],list.length>0,`${id}: specify at least one physical interface.`);for(const p of list){const key=device+'|'+port(p),previous=seenPorts.get(key);check('port-conflict',[previous,id].filter(Boolean),!previous,`${device}: ${p} is assigned more than once (${previous||id} / ${id}). Reserve separate physical ports for these connections.`);seenPorts.set(key,id);}};
 const vlans=id=>{if(!has(id))return null;const set=vlanSet(value(id));check('vlan-list',[id],!!set&&set.size>0,`${id}: use VLAN IDs 1–4094 or ascending ranges, for example 10,20,30-35.`);return set;};
 const priority=id=>{const n=integer(id,0,61440);if(n!==null)check('stp-priority',[id],n%4096===0,`${id}: STP priority must be a multiple of 4096.`);};
 const names=ids=>{unique(ids);for(const id of ids.filter(has))check('hostname',[id],!!value(id)&&!/[\s;\n]/.test(value(id)),`${id}: enter a non-empty device name without whitespace or command separators.`);};
 const loopbacks=ids=>{ids.forEach(id=>{const a=address(id);if(a)check('loopback-prefix',[id],a.p===32,`${id}: this workspace generates an IPv4 /32 loopback.`);});unique(ids,s=>cidr(s)?.ip??s,'duplicate-address');};
 const routerIds=ids=>{ids.forEach(id=>{const n=ip(id);if(n!==null)check('router-id',[id],n>0&&n!==4294967295,`${id}: use a non-zero router ID.`);});unique(ids,s=>ipv4(s)??s,'duplicate-router-id');};
 if(module==='BASIC'){
  names(['d1host']);const p=prefix(value('d1mask'));check('mask',['d1mask'],p!==null,'OOB Mask / Prefix: use a contiguous subnet mask or prefix length.');
  ip('d1oobip');if(p!==null)gateway('d1oobip','gw',value('d1oobip')+'/'+p);address('mgmtSubnet',false);
  for(const [enabled,ids] of [['secDns',['dns1','dns2']],['secAAA',['aaa1','aaa2']],['secLogging',['syslog1','syslog2']],['secSnmpv3',['nmsServer']]])if(on(enabled))for(const id of ids)if(/^\d/.test(value(id)))ip(id);
  for(const id of ['ntp1','ntp2'])if(/^\d/.test(value(id)))ip(id);
 }else if(module==='BGP'){
  const local=autonomous('bgpCustomerAs'),ce=Math.min(8,num('bgpCeCount')||2),isp=Math.min(8,num('bgpIspCount')||2);
  names([...Array.from({length:ce},(_,i)=>`bgpCe${i+1}Name`),...Array.from({length:isp},(_,i)=>`bgpIsp${i+1}Name`)]);
  routerIds(Array.from({length:ce},(_,i)=>`bgpCe${i+1}Rid`));loopbacks(Array.from({length:ce},(_,i)=>`bgpCe${i+1}Loop`));
  for(let i=1;i<=isp;i++){const remote=autonomous(`bgpIsp${i}As`);if(local!==null&&remote!==null)check('ebgp-as',['bgpCustomerAs',`bgpIsp${i}As`],local!==remote,`ISP-${i}: the eBGP peer ASN must differ from the customer ASN.`);}
  for(const id of Object.keys(f).filter(id=>/^bgpLinkC\d+I\d+CeIp$/.test(id))){const base=id.replace(/CeIp$/,''),m=base.match(/C(\d+)I(\d+)$/);pair(id,base+'IspIp');reserve(base+'CeIf','CE-'+m[1]);reserve(base+'IspIf','ISP-'+m[2]);}
  for(let i=1;i<=ce;i++){const id=`bgpCe${i}Prefix`,a=address(id,false);if(a)check('network-prefix',[id],a.ip===a.network,`${id}: the advertised prefix must use the network address.`);}
  if(ce===2&&value('bgpInternal')==='ibgp'){pair('bgpIbgpCe1Ip','bgpIbgpCe2Ip');reserve('bgpIbgpCe1If','CE-1');reserve('bgpIbgpCe2If','CE-2');}
  if(on('bgpTeOutboundEnable')&&on('bgpTeLocalPref')){integer('bgpTeLocalPrefValue',0,4294967295);integer('bgpTeBackupLocalPref',0,4294967295);check('local-preference',['bgpTeLocalPrefValue','bgpTeBackupLocalPref'],num('bgpTeLocalPrefValue')>num('bgpTeBackupLocalPref'),'Preferred ISP Local Preference must exceed Backup Local Preference to express the selected preference.','warning');}
 }else if(module==='OSPF'){
  names(['d1host','d2host']);routerIds(['d1rid','d2rid']);pair('d1ip','d2ip');reserve('d1if','Device-1');reserve('d2if','Device-2');integer('ospfCost',1,65535);
  const area=ipv4(value('ospfArea'));check('ospf-area',['ospfArea'],area!==null||/^\d+$/.test(value('ospfArea'))&&num('ospfArea')<=4294967295,'OSPF Area: use a 32-bit decimal value or dotted IPv4 notation.');
  if(value('ospfNet')==='broadcast'&&cidr(value('d1ip'))?.p===31)add('ospf-broadcast',['ospfNet','d1ip','d2ip'],'A /31 subnet is for point-to-point links. Select point-to-point OSPF network type.');
 }else if(module==='STP'){
  names(['d1host','d2host']);vlans('stpVlans');priority('stpRootPri');priority('stpSecPri');check('root-election',['stpRootPri','stpSecPri'],num('stpRootPri')<num('stpSecPri'),'Root priority must be lower than Secondary priority to express the selected root.','warning');
  const count=Math.min(8,num('stpLeafCount')||4),start=num('stpCoreLeafStart');integer('stpCoreLeafStart',1,65535);
  for(const device of ['Core-1','Core-2']){reserve('stpCoreLinkIf',device);reserve('stpCoreLeafPrefix',device,Array.from({length:count},(_,i)=>value('stpCoreLeafPrefix')+(start+i)));}
  reserve('stpLeafUp1','Each Leaf');reserve('stpLeafUp2','Each Leaf');reserve('stpAccessIf','Each Leaf');
  const leafNames=value('stpLeafNames').split(',').slice(0,count).map(s=>s.trim().toLowerCase());check('leaf-names',['stpLeafNames'],leafNames.length===count&&leafNames.every(Boolean)&&new Set([...leafNames,value('d1host').toLowerCase(),value('d2host').toLowerCase()]).size===count+2,'Provide a distinct hostname for each selected leaf and both cores.');
 }else if(module==='EVPN'){
  autonomous('evAsL');const model=value('evFabricModel'),dual=['dual-dc','multisite'].includes(model);if(dual){autonomous('evAsR');check('evpn-ebgp',['evAsL','evAsR'],asn(value('evAsL'))!==asn(value('evAsR')),'The selected dual-AS EVPN eBGP model requires different DC ASNs.');}
  const nodeNames=[1,2,3,4].map(i=>'evR'+i),rids=[1,2,3,4].map(i=>'evRid'+i),loops=[1,2,3,4].map(i=>'evLo'+i);
  if(model==='dual-dc-rr'){nodeNames.push('evRr1','evRr2');loops.push('evRrLo1','evRrLo2');}
  if(model==='multisite'){nodeNames.push('evBgw1','evBgw2');rids.push('evBgwRid1','evBgwRid2');loops.push('evBgwLo1','evBgwLo2');pair('evBgwDciIp1','evBgwDciIp2');for(let i=1;i<=2;i++){reserve('evBgwFabIf'+i,'BGW-'+i);reserve('evBgwDciIf'+i,'BGW-'+i);}unique(['evMsId1','evMsId2']);}
  names(nodeNames);routerIds(rids);loopbacks(loops);
  const count=Math.min(4,num('evVrfCount')||1),vnis=['evVni10','evVni20'],vrfs=[];
  for(let i=1;i<=count;i++){const suffix=i===1?'':i;vnis.push('evL3Vni'+suffix);vrfs.push('evVrf'+suffix);const id='evRt'+suffix,s=value(id),m=s.match(/^([^:]+):(\d+)$/),valid=m&&(ipv4(m[1])!==null?+m[2]<=65535:Number.isInteger(asn(m[1]))&&asn(m[1])>=0&&asn(m[1])<=4294967295&&+m[2]<=(asn(m[1])>65535?65535:4294967295));check('route-target',[id],!!valid,`${id}: use an ASN:number or IPv4:number route target with valid field widths.`);}
  names(vrfs);unique(vnis,s=>String(Number(s)),'vni-collision');for(const id of vnis)integer(id,1,platform==='Cisco NX-OS'?16777214:16777215);
  const vlanIds=['evVlan10','evVlan20',...(on('evType5')?['evVlan100','evVlan200']:[])];vlanIds.forEach(id=>integer(id,1,4094));unique(vlanIds,s=>String(Number(s)),'vlan-collision');
  if(on('evType5'))for(const n of [100,200]){const a=address('evSvi'+n),p=address('evPfx'+n,false);if(a&&p)check('svi-prefix',['evSvi'+n,'evPfx'+n],p.ip===p.network&&a.ip>=p.network&&a.ip<=p.last,`SVI ${n}: the selected local prefix must be a network containing the SVI address.`);}
 }else if(module==='QOS'){
  names(['d1host','d2host']);if(on('qosTrustEnable'))for(const id of ['qosDefaultDscp','qosVoiceDscp','qosCriticalDscp'])integer(id,0,63);
  if(on('qosSetInterfaceMtu')){integer('qosInterfaceMtu',576,65535);integer('qosL3Mtu',576,65535);check('mtu-order',['qosL3Mtu','qosInterfaceMtu'],num('qosL3Mtu')<=num('qosInterfaceMtu'),'L3 MTU must not exceed Interface MTU.');}
  if(on('qosEnableJumbo')){integer('qosSystemMtu',576,65535);integer('qosJumboMtu',576,65535);if(on('qosSetInterfaceMtu'))check('mtu-system',['qosInterfaceMtu','qosSystemMtu'],num('qosInterfaceMtu')<=num('qosSystemMtu'),'Interface MTU exceeds the selected System MTU; review platform forwarding limits.','warning');}
  if(on('qosPolicing')){integer('qosPoliceRate',1,1000000000);integer('qosPoliceBurst',1,1000000000);}if(on('qosShaping'))integer('qosShapeRate',1,1000000000);
  if(on('qosWred')){integer('qosWredMin',1,1000000000);integer('qosWredMax',1,1000000000);check('wred-threshold',['qosWredMin','qosWredMax'],num('qosWredMin')<num('qosWredMax'),'WRED Min Threshold must be lower than Max Threshold.');}
 }else if(module==='SDWAN'){
  if(value('sdHostname')||value('sdSystemIp')){names(['sdHostname']);routerIds(['sdSystemIp']);integer('sdSiteId',1,4294967295);for(const part of ['Wan1','Wan2','Mgmt'])gateway('sd'+part+'Cidr','sd'+part+'Gw');unique(['sdWan1Cidr','sdWan2Cidr'],s=>cidr(s)?.ip??s,'duplicate-address');for(const id of ['sdWan1If','sdWan2If','sdMgmtIf','sdTun1','sdTun2'])reserve(id,'SD-WAN Edge');}
 }else if(module==='VPC'){
  if(platform==='Cisco NX-OS'){
   names(['d1host','d2host']);integer('vpcDomain',1,1000);vlans('vpcCreateVlans');priority('vpcStpPriority');pair('vpcKa1','vpcKa2');integer('vpcPeerPo',1,4096);
   const n=Math.min(8,num('vpcLeafCount')||4);names(Array.from({length:n},(_,i)=>'vpcLeaf'+(i+1)));unique(['vpcPeerPo',...Array.from({length:n},(_,i)=>'vpcLeafPo'+(i+1))],s=>String(Number(s)),'port-channel-id');
   for(let side=1;side<=2;side++){reserve('vpcKaIf'+side,'Spine-'+side);reserve('vpcPeerIf'+side,'Spine-'+side);reserve('vpcSp'+side+'LeafIfs','Spine-'+side,ports(value('vpcSp'+side+'LeafIfs')).slice(0,n));check('peer-redundancy',['vpcPeerIf'+side],ports(value('vpcPeerIf'+side)).length>=2,'Spine-'+side+': a single Peer-Link member provides no member-link redundancy.','warning');}
   check('downstream-count',['vpcSp1LeafIfs','vpcSp2LeafIfs','vpcLeafCount'],ports(value('vpcSp1LeafIfs')).length>=n&&ports(value('vpcSp2LeafIfs')).length>=n,'Provide one physical spine uplink for every selected leaf on each spine.');reserve('vpcLeafUp1','Each Leaf');reserve('vpcLeafUp2','Each Leaf');
  }else if(platform==='Arista EOS'){
   names(['arH1','arH2']);integer('arPv',1,4094);priority('arCp');priority('arLp');pair('arIp1','arIp2');const n=Math.min(8,num('arLeafCount')||4);const service=vlans('arVlans');if(service)check('peer-vlan',['arPv','arVlans'],!service.has(num('arPv')),'The private MLAG peer VLAN must be separate from downstream service VLANs.');
   names(Array.from({length:n},(_,i)=>'arLeaf'+(i+1)));unique(['arPpo',...Array.from({length:n},(_,i)=>'arPo'+(i+1))],s=>String(Number(s)),'port-channel-id');unique(Array.from({length:n},(_,i)=>'arMid'+(i+1)),s=>String(Number(s)),'mlag-id');
   for(let side=1;side<=2;side++){reserve('arPif'+side,'Core-'+side);for(let i=1;i<=n;i++)reserve('arIf'+side+'_'+i,'Core-'+side);}for(let i=1;i<=n;i++){reserve('arUp1_'+i,'Leaf-'+i);reserve('arUp2_'+i,'Leaf-'+i);}
  }else if(platform==='Huawei_CE_SW'){
   names(['hwHost1','hwHost2']);vlans('hwVlans');const p=prefix(value('hwDadMask'));check('mask',['hwDadMask'],p!==null,'DAD Mask: use a contiguous subnet mask or prefix.');if(p!==null){const local={...f,hwDadIp1:value('hwDadIp1')+'/'+p,hwDadIp2:value('hwDadIp2')+'/'+p};const checks=evaluatePair(local.hwDadIp1,local.hwDadIp2);check('dad-subnet',['hwDadIp1','hwDadIp2','hwDadMask'],checks,'DAD endpoints must use distinct usable addresses in the same subnet.');}
   const n=Math.min(8,num('hwLeafCount')||4);names(Array.from({length:n},(_,i)=>'hwLeaf'+(i+1)));unique(['hwPeerPo',...Array.from({length:n},(_,i)=>'hwLeafPo'+(i+1))],s=>String(Number(s)),'eth-trunk-id');
   for(let side=1;side<=2;side++){reserve('hwDadIf'+side,'Core-'+side);reserve('hwPeerIf'+side,'Core-'+side);for(let i=1;i<=n;i++)reserve('hwLeafIf'+side+'_'+i,'Core-'+side);}
  }else if(platform==='Cisco IOS-XE'){
   names(['swvHost']);vlans('swvVlans');priority('swvStpPri');priority('swvLeafStpPri');const n=Math.min(8,num('swvLeafCount')||4);names(Array.from({length:n},(_,i)=>'swvLeaf'+(i+1)));unique(Array.from({length:n},(_,i)=>'swvLeafPo'+(i+1)),s=>String(Number(s)),'port-channel-id');
   for(let side=1;side<=2;side++){reserve('swvLink'+side,'StackWise member-'+side);reserve('swvDad'+side,'StackWise member-'+side);for(let i=1;i<=n;i++)reserve('swvLeafCoreIf'+side+'_'+i,'StackWise member-'+side);}for(let i=1;i<=n;i++){reserve('swvLeafUp1_'+i,'Leaf-'+i);reserve('swvLeafUp2_'+i,'Leaf-'+i);}
  }else if(platform==='Huawei iStack'){
   names(['isHost','isName1','isName2']);vlans('isVlans');priority('isCorePriority');priority('isLeafPriority');unique(['isId1','isId2'],s=>String(Number(s)),'member-id');const n=Math.min(8,num('isLeafCount')||4);names(Array.from({length:n},(_,i)=>'isLeaf'+(i+1)));unique(Array.from({length:n},(_,i)=>'isPo'+(i+1)),s=>String(Number(s)),'eth-trunk-id');
   for(let side=1;side<=2;side++){integer('isId'+side,0,8);integer('isPriority'+side,1,255);reserve('isLink'+side+'a','Stack member-'+side);if(value('isTopology')==='ring')reserve('isLink'+side+'b','Stack member-'+side);if(on('isMad'))reserve('isMad'+side,'Stack member-'+side);for(let i=1;i<=n;i++)reserve('isCore'+side+'_'+i,'Stack member-'+side);}for(let i=1;i<=n;i++){reserve('isUp1_'+i,'Leaf-'+i);reserve('isUp2_'+i,'Leaf-'+i);}
   if(!on('isMad'))add('mad-disabled',['isMad'],'MAD is disabled. Document how independently active partitions will be contained after a stack split.','warning');
  }
 }
 return {module,platform,evaluated,issues,errors:issues.filter(x=>x.severity==='error').length,warnings:issues.filter(x=>x.severity==='warning').length};
}
function evaluatePair(a,b){const x=cidr(a),y=cidr(b);return !!(x&&y&&x.ip!==y.ip&&x.network===y.network&&x.p===y.p&&x.p<=31&&(x.p===31||x.ip!==x.network&&x.ip!==x.last&&y.ip!==y.network&&y.ip!==y.last));}
function render(module,platform){
 const node=document.getElementById('designChecks');if(!node)return;
 const f={};document.querySelectorAll('#params input[id],#params select[id],#params textarea[id],#topologyControls input[id],#topologyControls select[id]').forEach(el=>{if(!['file','password'].includes(el.type))f[el.id]=el.type==='checkbox'?el.checked:el.value;});
 const result=evaluate({module,platform,fields:f}),prior=node.querySelector('details')?.open;
 document.querySelectorAll('[data-design-invalid]').forEach(el=>{el.removeAttribute('data-design-invalid');el.removeAttribute('aria-invalid');});
 node.replaceChildren();const details=document.createElement('details');details.open=result.errors>0||!!prior;const summary=document.createElement('summary');summary.textContent=`Design consistency · ${result.errors} errors · ${result.warnings} advisories`;details.append(summary);node.dataset.state=result.errors?'error':result.warnings?'warning':'ok';
 const context=document.createElement('p');context.textContent=`${platform} · ${module} · ${result.evaluated} input checks. Device state and software compatibility require separate verification.`;details.append(context);
 if(!result.issues.length){const text=document.createElement('p');text.textContent=result.evaluated?'No inconsistencies detected in the evaluated inputs.':'Select a site and router to evaluate the SD-WAN inputs.';details.append(text);}
 const readable=message=>Object.keys(f).sort((a,b)=>b.length-a.length).reduce((text,id)=>{const el=document.getElementById(id),label=el?.parentElement?.querySelector('label')?.textContent.trim();return label?text.replaceAll(id,label):text;},message);
 for(const issue of result.issues){const row=document.createElement('div');row.className='nc-design-issue';const message=document.createElement('span');message.textContent=(issue.severity==='error'?'Error: ':'Review: ')+readable(issue.message);row.append(message);const id=issue.fields.find(id=>document.getElementById(id));if(id){const button=document.createElement('button');button.type='button';button.textContent='Go to field';button.onclick=()=>{const el=document.getElementById(id);el.scrollIntoView?.({block:'center',behavior:'smooth'});el.focus();};row.append(button);}details.append(row);if(issue.severity==='error')issue.fields.forEach(id=>{const el=document.getElementById(id);if(el){el.dataset.designInvalid='true';el.setAttribute('aria-invalid','true');}});}
 node.append(details);root.NetworkDesignValidation=result;return result;
}
root.NetworkDesignChecks={evaluate,render,ipv4,prefix,cidr,asn,port,ports};
})(typeof window==='undefined'?globalThis:window);
