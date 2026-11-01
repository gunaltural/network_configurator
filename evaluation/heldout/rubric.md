# Prospective engineering review (synthetic, Turkish output)
Grade each independent draft on the observed fact, supporting line, and limits below. A successful API call is not a correct diagnosis. Quotes of a hallucination do not make it evidence. These cases are development holdouts, not a private benchmark or physical device captures.
- B1: Identify administratively idle session, NOT proof of TCP failure; do not recommend network reachability as the primary explanation without checking intended shutdown.
- B2: Established with zero received prefixes, NOT a failed session; policy/advertisement is unproven.
- M1: Local MLAG reports peer link up and Po10 active-full; do not claim measured failover or packet delivery.
- M2: Keepalive unreachable; missing peer-link, peer roles and remote evidence. Split-brain cannot be concluded.
- S1: For VLAN 37, Gi1/0/47 root forwarding, Gi1/0/48 alternate blocked. Alternate blocking is expected loop prevention; no proof of physical failure.
- S2: VLAN 37 Gi1/0/23 root-inconsistent; inspect superior BPDU source/root placement; do not call it an ordinary alternate port.
- W1: DC_PROBE fails on wan1 and survives on wan2. Probe loss is NOT measured application loss or proof of rule selection.
- W2: Two probes alive, wan2 lower latency. Cannot identify actual selected member without matching rule/service and session evidence.
