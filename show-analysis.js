(function(root){'use strict';
function parse(raw){
 if(raw.length>2000000)throw Error('Maximum input size is 2 MB.');
 const lines=raw.replace(/\r\n?/g,'\n').split('\n'),blocks=[];let current=null,bundleDevice=null;
 for(let i=0;i<lines.length;i++){
  const line=lines[i],match=line.replace(/^<([^>]+)>\s*/, '$1> ').match(/^(?:(\S+)[#>]\s*)?((?:show|display|get|diagnose)\s+.+?)\s*$/i)||line.match(/^[-=]{3,}\s*((?:show|display|get|diagnose)\s+.+?)\s*[-=]{3,}$/i);
  if(match){
   const prompted=match.length===3?match[1]:null;
   const command=(match.length===3?match[2]:match[1]).replace(/\s*[-=]+$/,'');
   const delimiter=match.length===2;
   if(!delimiter || /^show tech-support(?:\s|$)/i.test(command))bundleDevice=prompted&&/^show tech-support(?:\s|$)/i.test(command)?prompted:null;
   current={id:'cli-'+(blocks.length+1),device:prompted||(delimiter&&bundleDevice)||'Unidentified',command,line:i+1,lines:[]};blocks.push(current);
  }
  else if(current)current.lines.push({line:i+1,text:line});
 }
 return blocks.map(b=>({...b,lines:b.lines.filter(x=>x.text.trim()).map(x=>({...x,text:/password|passwd|secret|community|private.?key|api.?key|authorization|sk-[a-zA-Z0-9_-]+/i.test(x.text)?'[REDACTED]':x.text}))}));
}
function evidence(blocks){const result=[];for(const b of blocks){let text='Device: '+b.device+'\nCommand: '+b.command+'\n';for(const line of b.lines){const next='L'+line.line+': '+line.text+'\n';if(text.length+next.length>2900){result.push({id:b.id+'-'+result.length,text});text='Device: '+b.device+'\nCommand: '+b.command+' (continued)\n';}if(next.length>2700)throw Error('A CLI line exceeds the analysis limit.');text+=next;}result.push({id:b.id+'-'+result.length,text});}if(result.length>30||JSON.stringify(result).length>35000)throw Error('Select fewer command blocks for this analysis.');return result;}

const profiles=[
 {vendor:'Cisco NX-OS',title:'vPC resilience',scope:'Collect from both peers at the same incident stage. Include device names and capture times.',source:'https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus9000/sw/93x/troubleshooting/guide/b-cisco-nexus-9000-nx-os-troubleshooting-guide-93x/b-cisco-nexus-9000-nx-os-troubleshooting-guide-93x_chapter_0110.html',commands:[['show vpc','Peer role, peer-link and vPC state'],['show vpc peer-keepalive','Independent keepalive state'],['show vpc consistency-parameters global','Peer configuration consistency'],['show port-channel summary','Member and bundle state'],['show running-config vpc','Configured intent']],note:'A peer-link failure alone does not prove split-brain. Correlate both peer states, keepalive and event order. show tech-support vpc can provide an expanded capture.'},
 {vendor:'Cisco IOS-XE',title:'Campus STP / loop investigation',scope:'Collect from the root candidate and affected access switches for the same VLAN.',source:'https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol-stp-8021d/221722-troubleshoot-mac-flaps-loop-on-cisco-cat.html',commands:[['show spanning-tree','Root, port roles and forwarding/blocking state'],['show spanning-tree detail','Topology changes and originating interfaces']],note:'A blocked alternate port is not automatically a fault. Add interface, EtherChannel, VLAN and MAC evidence to investigate the affected path.'},
 {vendor:'Arista EOS',title:'MLAG resilience',scope:'Collect from both MLAG peers, preserving hostname and capture time.',source:'https://www.arista.com/en/um-eos/eos-multi-chassis-link-aggregation',commands:[['show mlag','Peer and MLAG state'],['show mlag interfaces','Per-interface MLAG state'],['show mlag config-sanity','Configuration consistency']],note:'Correlate peer, member and local interface state; a single peer capture cannot establish the complete failure domain.'},
 {vendor:'Juniper Junos',title:'BGP session and prefix investigation',scope:'Collect the affected router and, where available, its peer. Specify routing instance and affected prefix.',source:'https://www.juniper.net/documentation/us/en/software/junos/bgp/topics/topic-map/troubleshooting-bgp-sessions.html',commands:[['show bgp summary','Session and received-route overview'],['show route <prefix> detail','Selected route and path attributes'],['show route receive-protocol bgp <peer-address>','Routes received from the affected peer']],note:'Replace placeholders and select the relevant routing instance. Established sessions do not alone prove forwarding or application reachability.'},
 {vendor:'Huawei VRP',title:'BGP peer reachability',scope:'Collect both peer endpoints with peer addresses and VPN-instance context where applicable.',source:'https://info.support.huawei.com/network/ptmngsys/Web/tsrev_s/en/content/s/39_BGP_peer_setup_failure/BGP_peer_setup_failure_desk004.html',commands:[['display bgp peer','Peer state'],['display ip routing-table <peer-address>','Route to the peer address']],note:'Replace the peer placeholder. Peer reachability evidence is only one part of BGP diagnosis; correlate interface, configuration and event evidence.'},
 {vendor:'FortiGate',title:'SD-WAN / overlay BGP',scope:'Collect the affected branch and hub in the relevant VDOM/VRF, with capture times.',source:'https://docs.fortinet.com/document/fortigate/7.4.0/administration-guide/818746/sd-wan-related-diagnose-commands',commands:[['get router info bgp summary','Overlay BGP session state'],['get router info bgp network <prefix>','Available paths and selected route'],['diagnose sys sdwan health-check','Health-check measurements and member state']],note:'Replace the prefix placeholder. Syntax varies with FortiOS release. SLA measurements describe their probe target and window, not every application.'}
];
function collectionGuide(vendor){return profiles.filter(p=>p.vendor===vendor).map(p=>({...p,commands:p.commands.map(c=>c.slice())}));}
const examples=[
 {
  "key": "BGP",
  "platform": "Cisco IOS-XE",
  "title": "BGP · One ISP session is idle",
  "question": "Is the incident isolated to one upstream?",
  "expected": "EDGE-01 reports ISP1 Idle (AS 64511) and ISP2 Established with 143 prefixes. Correlate the peer closure log; the transport or policy root cause is not proven.",
  "raw": "EDGE-01# show ip bgp summary\nBGP router identifier 203.0.113.10, local AS number 64510\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n192.0.2.1 4 64511 0 0 17 0 0 00:01:02 Idle\n198.51.100.1 4 64512 544 523 17 0 0 08:44:03 143\nEDGE-01# show logging\nNov 1 08:40:03.100: %BGP-5-ADJCHANGE: neighbor 192.0.2.1 Down Peer closed the session"
 },
 {
  "key": "BASIC",
  "platform": "Cisco IOS-XE",
  "title": "System & Management · Unsynchronized clock",
  "question": "Can these timestamps support a cross-device incident timeline?",
  "expected": "The local clock is unsynchronized (stratum 16). Reach 0 provides no recent successful NTP samples; check VRF, source and reachability before attributing the cause.",
  "raw": "MGMT-01# show ntp status\nClock is unsynchronized, stratum 16, no reference clock\nMGMT-01# show ntp associations\n  address         ref clock       st when poll reach  delay  offset   disp\n ~192.0.2.123     .INIT.          16    -   64     0  0.000   0.000 15937."
 },
 {
  "key": "OSPF",
  "platform": "Cisco IOS-XE",
  "title": "OSPF · One adjacency stuck in EXSTART",
  "question": "Why is one point-to-point adjacency not Full?",
  "expected": "The reciprocal endpoints on the same /30 link have different MTUs (1500 and 9000). This supports an MTU-related database exchange issue; one snapshot does not measure outage duration.",
  "raw": "DIST-A# show ip ospf neighbor\nNeighbor ID     Pri   State           Dead Time   Address         Interface\n10.0.0.2          0   EXSTART/  -     00:00:36    192.0.2.2       GigabitEthernet0/1\nDIST-A# show interfaces GigabitEthernet0/1\nGigabitEthernet0/1 is up, line protocol is up\n  Internet address is 192.0.2.1/30\n  MTU 1500 bytes, BW 1000000 Kbit/sec\nDIST-B# show interfaces GigabitEthernet0/1\nGigabitEthernet0/1 is up, line protocol is up\n  Internet address is 192.0.2.2/30\n  MTU 9000 bytes, BW 1000000 Kbit/sec"
 },
 {
  "key": "STP",
  "platform": "Cisco IOS-XE",
  "title": "STP · Redundant campus uplink",
  "question": "Is the blocked port a fault?",
  "expected": "For VLAN 120, Gi1/0/47 is the forwarding root port and Gi1/0/48 the alternate. The port is physically connected. This is consistent with normal loop prevention.",
  "raw": "ACCESS-12# show spanning-tree vlan 120\nVLAN0120\n  Spanning tree enabled protocol rstp\nInterface        Role Sts Cost      Prio.Nbr Type\nGi1/0/47         Root FWD 4         128.47   P2p\nGi1/0/48         Altn BLK 4         128.48   P2p\nACCESS-12# show interfaces status\nPort      Name             Status       Vlan       Duplex Speed Type\nGi1/0/47  DIST-A           connected    trunk      a-full a-1000 1000BaseSX\nGi1/0/48  DIST-B           connected    trunk      a-full a-1000 1000BaseSX"
 },
 {
  "key": "VPC",
  "platform": "Cisco NX-OS",
  "title": "vPC · Peer-link down, keepalive alive",
  "question": "Is split-brain established by these outputs?",
  "expected": "Both peers report the peer-link down but the keepalive is live. Secondary member suspension is visible. Do not diagnose dual-active or quantify packet loss.",
  "raw": "N9K-A# show vpc brief\nvPC domain id                     : 12\nvPC role                          : primary\nvPC Peer-link status\nid   Port   Status Active vlans\n1    Po100  down   -\nN9K-A# show vpc peer-keepalive\nvPC keep-alive status : peer is alive\nN9K-B# show vpc brief\nvPC domain id                     : 12\nvPC role                          : secondary\nvPC Peer-link status\nid   Port   Status Active vlans\n1    Po100  down   -\nvPC status\nid   Port   Status Consistency Reason\n20   Po20   down   success     Peer-link is down\nN9K-B# show vpc peer-keepalive\nvPC keep-alive status : peer is alive"
 },
 {
  "key": "MLAG",
  "platform": "Arista EOS",
  "title": "MLAG · Single-sided downstream bundle",
  "question": "Did the entire MLAG domain fail?",
  "expected": "The relationship is connected and the peer-link is up, while MLAG 20 is active-partial. Its peer-side Ethernet5 is not connected. Redundancy is reduced; the cause of that physical state is unknown.",
  "raw": "EOS-A# show mlag\nstate              : Active\nnegotiation status : Connected\npeer-link status   : Up\nlocal-int status   : Up\nEOS-A# show mlag interfaces\nmlag     desc      local-intf        peer-intf         status\n20       HOST20    Port-Channel20    Port-Channel20    active-partial\nEOS-B# show interfaces status\nPort  Name          Status       Vlan   Duplex Speed   Type\nEt5   HOST20-NIC2   notconnect   120    full   10G     10GBASE-SR\nEOS-B# show running-config interfaces Ethernet5\ninterface Ethernet5\n   description HOST20-NIC2\n   channel-group 20 mode active"
 },
 {
  "key": "STACKWISE",
  "platform": "Cisco IOS-XE",
  "title": "StackWise Virtual · DAD path unavailable",
  "question": "Which protection is lost while the chassis remain paired?",
  "expected": "The StackWise Virtual link is up and the dedicated fast-hello DAD port is down. Dual-active is a risk under an additional failure, not an observed state.",
  "raw": "CORE-A# show stackwise-virtual link\nSwitch   SVL   Ports                         Link-Status   Protocol-Status\n1        1     FortyGigabitEthernet1/0/1     U             R\n2        1     FortyGigabitEthernet2/0/1     U             R\nCORE-A# show stackwise-virtual dual-active-detection\nSwitch   Dad port                      Status\n1        TenGigabitEthernet1/0/8        down\n2        TenGigabitEthernet2/0/8        down"
 },
 {
  "key": "EVPN",
  "platform": "Cisco NX-OS",
  "title": "EVPN/VXLAN · One tenant VNI down",
  "question": "Is the entire NVE overlay unavailable?",
  "expected": "The remote NVE peer and VNI 10120 are up. VNI 10130 is down on this VTEP. Check VLAN 130 mapping and local state; these outputs do not identify the reason or prove end-host impact.",
  "raw": "VTEP-A# show nve peers\nInterface Peer-IP       State LearnType Uptime   Router-Mac\nnve1      192.0.2.22    Up    CP        02:11:08 n/a\nVTEP-A# show nve vni\nInterface VNI    Multicast-group State Mode Type [BD/VRF] Flags\nnve1      10120  UnicastBGP      Up    CP   L2   [120]\nnve1      10130  UnicastBGP      Down  CP   L2   [130]"
 },
 {
  "key": "SDWAN",
  "platform": "FortiGate",
  "title": "SD-WAN · Probe loss on one member",
  "question": "Can the capture prove voice sessions moved?",
  "expected": "DC-PROBE is dead on wan1 and alive on wan2. The routing table includes wan2, but probe results and a route do not establish the actual voice rule, session path or application loss.",
  "raw": "BR-FGT# diagnose sys sdwan health-check\nHealth Check(DC-PROBE):\nSeq(1 wan1): state(dead), packet-loss(100.000%)\nSeq(2 wan2): state(alive), packet-loss(0.000%) latency(14.200) jitter(1.100)\nBR-FGT# get router info routing-table all\nRouting table for VRF=0\nS*      0.0.0.0/0 [10/0] via 198.51.100.1, wan2, [1/0]"
 },
 {
  "key": "QOS",
  "platform": "Cisco IOS-XE",
  "title": "QoS · Drops in the default queue",
  "question": "Did the voice class drop these packets?",
  "expected": "Output policy counters show 0 drops in VOICE and 317 in class-default. These cumulative counters do not give a current loss rate; compare two timed samples.",
  "raw": "WAN-CE# show policy-map interface GigabitEthernet0/0/0\n GigabitEthernet0/0/0\n  Service-policy output: WAN-OUT\n    Class-map: VOICE (match-any)\n      24000 packets, 4800000 bytes\n      Match: dscp ef (46)\n      (queue depth/total drops/no-buffer drops) 0/0/0\n    Class-map: class-default (match-any)\n      740000 packets, 592000000 bytes\n      (queue depth/total drops/no-buffer drops) 12/317/0\nWAN-CE# show interfaces GigabitEthernet0/0/0\nGigabitEthernet0/0/0 is up, line protocol is up\n  Total output drops: 317"
 },
{
 "key": "TAC-REVIEW",
 "platform": "Cisco IOS-XE",
 "title": "Show tech · Routing and management security",
 "question": "Which observations can be verified across routing, management access and neighbor state?",
 "expected": "CORP static route is configured and installed; GUEST installation is not evidenced. VTY 0–4 permits Telnet in configuration but has an inbound ACL; do not claim external Telnet reachability. BGP Idle has a matching closure log. The OSPF neighbor is Full; NTP is unsynchronized.",
 "raw": "WAN-EDGE-02# show tech-support\n------------------ show running-config ------------------\nhostname WAN-EDGE-02\nip route vrf CORP 10.42.0.0 255.255.0.0 192.0.2.1\nip route vrf GUEST 10.42.0.0 255.255.0.0 198.51.100.1\nline vty 0 4\n access-class MGMT-IN in\n transport input ssh telnet\n!\n------------------ show ip route vrf CORP static ------------------\nRouting Table: CORP\nS    10.42.0.0/16 [1/0] via 192.0.2.1\n------------------ show ip access-lists ------------------\nExtended IP access list MGMT-IN\n    10 permit tcp host 203.0.113.40 any eq 22\n    20 deny ip any any log\n------------------ show ip bgp summary ------------------\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n192.0.2.9 4 64520 0 0 1 0 0 never Idle\n------------------ show logging ------------------\n*Nov 1 08:00:01.003: %BGP-5-ADJCHANGE: neighbor 192.0.2.9 Down Peer closed the session\n------------------ show ip ospf neighbor ------------------\nNeighbor ID     Pri State           Dead Time Address         Interface\n10.1.0.2          1 FULL/DR         00:00:34  198.51.100.6    GigabitEthernet0/1\n------------------ show ntp status ------------------\nClock is unsynchronized, stratum 16, no reference clock"
}
];
root.ShowAnalysis={parse,evidence,collectionGuide,examples};
})(typeof window==='undefined'?globalThis:window);
