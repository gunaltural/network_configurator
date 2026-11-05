/* Explicit opt-in synthetic STP lab; never label this data as real device evidence. */
(function(root){'use strict';
function create(){
 const nodes=[
  {id:'lab-core-a',hostname:'LAB-CORE-A',vendor:'Cisco IOS-XE',role:'upper'},
  {id:'lab-core-b',hostname:'LAB-CORE-B',vendor:'Cisco IOS-XE',role:'upper'},
  {id:'lab-access-a',hostname:'LAB-ACCESS-A',vendor:'Cisco IOS-XE',role:'lower'}];
 const links=[
  {id:'lab-core-peer',a:'lab-core-a',b:'lab-core-b',aPort:'TenGigabitEthernet1/0/48',bPort:'TenGigabitEthernet1/0/48',kind:'Ethernet',logical:false},
  {id:'lab-access-uplink-a',a:'lab-core-a',b:'lab-access-a',aPort:'TenGigabitEthernet1/0/1',bPort:'TenGigabitEthernet1/0/1',kind:'Ethernet',logical:false},
  {id:'lab-access-uplink-b',a:'lab-core-b',b:'lab-access-a',aPort:'TenGigabitEthernet1/0/1',bPort:'TenGigabitEthernet1/0/2',kind:'Ethernet',logical:false}];
 const configs=[];
 for(const n of nodes){
  const isAccess=n.role==='lower',isA=n.id==='lab-core-a';
  const pr10=isAccess?32768:isA?4096:8192,pr20=isAccess?32768:isA?8192:4096;
  const interfaces=isAccess?['TenGigabitEthernet1/0/1','TenGigabitEthernet1/0/2']:['TenGigabitEthernet1/0/48','TenGigabitEthernet1/0/1'];
  const lines=['hostname '+n.hostname,'vtp mode off','vlan 10','vlan 20','vlan 999','spanning-tree mode rapid-pvst',
   'spanning-tree vlan 10 priority '+pr10,'spanning-tree vlan 20 priority '+pr20];
  for(const p of interfaces){
   lines.push('interface '+p,' switchport mode trunk',' switchport trunk native vlan 999',
    ' switchport trunk allowed vlan 10,20',' switchport nonegotiate');
   if(!isAccess)lines.push(' spanning-tree guard '+(p.endsWith('/48')?'loop':'root'));
   else lines.push(' spanning-tree guard loop');
   lines.push(' udld port aggressive','!');
  }
  configs.push({deviceId:n.id,text:lines.join('\n')});
 }
 const mac={a:'0011.2200.0001',b:'0011.2200.0002',c:'0011.2200.0003'};
 const showTech=[];
 for(const n of nodes){
  const isAccess=n.role==='lower',isA=n.id==='lab-core-a';
  const localMac=isAccess?mac.c:isA?mac.a:mac.b;
  const root10=mac.a,root20=mac.b;
  const own10=isA?4096:isAccess?32768:8192;
  const own20=!isA&&!isAccess?4096:isAccess?32768:8192;
  const trunkPorts=isAccess?['TenGigabitEthernet1/0/1','TenGigabitEthernet1/0/2']:['TenGigabitEthernet1/0/48','TenGigabitEthernet1/0/1'];
  const portTable=(vlan)=>{
   if(isAccess)return vlan===10?
    ['TenGigabitEthernet1/0/1 Root FWD 4 128.1 P2p','TenGigabitEthernet1/0/2 Altn BLK 4 128.2 P2p']:
    ['TenGigabitEthernet1/0/1 Altn BLK 4 128.1 P2p','TenGigabitEthernet1/0/2 Root FWD 4 128.2 P2p'];
   if(isA)return vlan===10?['TenGigabitEthernet1/0/48 Desg FWD 4 128.48 P2p','TenGigabitEthernet1/0/1 Desg FWD 4 128.1 P2p']:
    ['TenGigabitEthernet1/0/48 Root FWD 4 128.48 P2p','TenGigabitEthernet1/0/1 Desg FWD 4 128.1 P2p'];
   return vlan===20?['TenGigabitEthernet1/0/48 Desg FWD 4 128.48 P2p','TenGigabitEthernet1/0/1 Desg FWD 4 128.1 P2p']:
    ['TenGigabitEthernet1/0/48 Root FWD 4 128.48 P2p','TenGigabitEthernet1/0/1 Desg FWD 4 128.1 P2p'];
  };
  const lines=['===== show version =====','Cisco IOS XE Software, Version 17.12.04',
   'Model Number : '+(isAccess?'C9300-48P':'C9500-24Y4C'),'===== show spanning-tree summary =====',
   'Switch is in rapid-pvst mode',
   '===== show spanning-tree root ====='];
  // Each VLAN has its own root/bridge identity, showing that the split-root intent works.
  for(const vlan of [10,20]){
   const rMac=vlan===10?root10:root20,prio=vlan===10?own10:own20;
   lines.push('===== show spanning-tree vlan '+vlan+' detail =====',
    'VLAN'+String(vlan).padStart(4,'0'),'  Spanning tree enabled protocol rstp',
    '  Root ID    Priority    '+(4096+vlan),'             Address     '+rMac,
    '  Bridge ID  Priority    '+(prio+vlan),'             Address     '+localMac,
    'Interface Role Sts Cost Prio.Nbr Type',...portTable(vlan),
    'Number of topology changes '+(isAccess?2:1)+' last change occurred 2d ago');
  }
  lines.push('===== show interfaces trunk =====','Port Mode Encapsulation Status Native vlan');
  for(const p of trunkPorts)lines.push(p+' 802.1q trunking 999');
  lines.push('===== show udld interface =====','Interface Admin Mode Operational State');
  for(const p of trunkPorts)lines.push(p+' aggressive bidirectional');
  lines.push('===== show etherchannel summary =====','No port-channel interfaces in this lab fixture',
   '===== show spanning-tree inconsistentports =====','Name Interface Inconsistency','Number of inconsistent ports: 0',
   '===== show cdp neighbors detail =====','LAB evidence: manually modelled links, not authenticated neighbor discovery');
  showTech.push({deviceId:n.id,filename:n.hostname.toLowerCase()+'-synthetic-showtech.txt',
   text:lines.join('\n'),synthetic:true});
 }
 return root.NetworkAITopology.validate({schema:'ai-topology-workspace-v1',sourceModule:'STP',
  nodes,links,configs,showTech,labMode:true});
}
root.NetworkSTPLabV1={create};
})(typeof window==='undefined'?globalThis:window);
