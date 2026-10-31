# Synthetic CLI excerpts

These anonymized lab-style fixtures are synthetic, not live device recordings. Each uses example IP addresses. Questions and answer keys are withheld from the model.

### BGP · One ISP session is idle

[Cisco IOS-XE capture](bgp.txt) · Is the incident isolated to one upstream?

Expected: EDGE-01 reports ISP1 Idle (AS 64511) and ISP2 Established with 143 prefixes. Correlate the peer closure log; the transport or policy root cause is not proven.

### System & Management · Unsynchronized clock

[Cisco IOS-XE capture](basic.txt) · Can these timestamps support a cross-device incident timeline?

Expected: The local clock is unsynchronized (stratum 16). Reach 0 provides no recent successful NTP samples; check VRF, source and reachability before attributing the cause.

### OSPF · One adjacency stuck in EXSTART

[Cisco IOS-XE capture](ospf.txt) · Why is one point-to-point adjacency not Full?

Expected: The reciprocal endpoints on the same /30 link have different MTUs (1500 and 9000). This supports an MTU-related database exchange issue; one snapshot does not measure outage duration.

### STP · Redundant campus uplink

[Cisco IOS-XE capture](stp.txt) · Is the blocked port a fault?

Expected: For VLAN 120, Gi1/0/47 is the forwarding root port and Gi1/0/48 the alternate. The port is physically connected. This is consistent with normal loop prevention.

### vPC · Peer-link down, keepalive alive

[Cisco NX-OS capture](vpc.txt) · Is split-brain established by these outputs?

Expected: Both peers report the peer-link down but the keepalive is live. Secondary member suspension is visible. Do not diagnose dual-active or quantify packet loss.

### MLAG · Single-sided downstream bundle

[Arista EOS capture](mlag.txt) · Did the entire MLAG domain fail?

Expected: The relationship is connected and the peer-link is up, while MLAG 20 is active-partial. Its peer-side Ethernet5 is not connected. Redundancy is reduced; the cause of that physical state is unknown.

### StackWise Virtual · DAD path unavailable

[Cisco IOS-XE capture](stackwise.txt) · Which protection is lost while the chassis remain paired?

Expected: The StackWise Virtual link is up and the dedicated fast-hello DAD port is down. Dual-active is a risk under an additional failure, not an observed state.

### EVPN/VXLAN · One tenant VNI down

[Cisco NX-OS capture](evpn.txt) · Is the entire NVE overlay unavailable?

Expected: The remote NVE peer and VNI 10120 are up. VNI 10130 is down on this VTEP. Check VLAN 130 mapping and local state; these outputs do not identify the reason or prove end-host impact.

### SD-WAN · Probe loss on one member

[FortiGate capture](sdwan.txt) · Can the capture prove voice sessions moved?

Expected: DC-PROBE is dead on wan1 and alive on wan2. The routing table includes wan2, but probe results and a route do not establish the actual voice rule, session path or application loss.

### QoS · Drops in the default queue

[Cisco IOS-XE capture](qos.txt) · Did the voice class drop these packets?

Expected: Output policy counters show 0 drops in VOICE and 317 in class-default. These cumulative counters do not give a current loss rate; compare two timed samples.
