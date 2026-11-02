# BGP Troubleshooting Agent v1 — implementation contract

Status: DESIGN / TEST SPECIFICATION. No live deployment or successful regression is implied.

## Goal
Extend existing AI Analysis; preserve Design -> Inventory -> Simulation -> Module report -> Next module. Never alter saved projects or live configuration automatically.

## Evidence schema
For each finding: device_id, vendor, os_version, vrf, afi_safi, neighbor, observation, source_command, raw_excerpt, confidence, timestamp, hypotheses[], missing_evidence[], recommended_read_only_commands[], source_references[].
Separate confirmed observations from hypotheses. Never fabricate root causes, packet loss, convergence or outage duration.

## Diagnostic families
1. Neighbor FSM: Idle, Connect, Active, OpenSent, OpenConfirm, Established. Verify transport reachability, TCP/179, AS, source/interface, multihop, MD5, logs and policy as platform appropriate.
2. Route origination/advertisement: exact prefix, RIB presence, network/redistribute/aggregate, AF activation, outbound filters, communities, max-prefix.
3. Route receipt/installation: received/accepted/advertised distinctions, inbound policy, next-hop reachability, best-path, RIB installation, VRF/AF.
4. Traffic engineering: local preference, weight, AS path, MED, prepend and community; distinguish outbound path selection from remote inbound policy.

## Agent workflow
Ingest -> parse deterministically -> correlate across modules -> retrieve version-matched references -> formulate hypotheses -> choose least-invasive read-only verification -> reevaluate -> produce report -> request human approval for any change.
Offline uploaded show tech must never claim live verification. Live CLI must be opt-in and read-only in v1.
Redact credentials, keys, customer IPs and identifying data before sending to an external model.

## Initial acceptance fixtures
- Idle with no neighbor detail: state confirmed; cause unknown.
- Active with interface down: identify interface evidence and prioritize transport.
- TCP/179 denied by explicit ACL/log: evidence-backed policy hypothesis.
- MD5 mismatch with log: distinguish authentication from generic reachability.
- Established but prefix absent locally: test origination and RIB.
- Prefix present locally but not advertised: evaluate AF and outbound policy.
- Prefix received but not installed: inspect next-hop and best-path.
- iBGP route next-hop unreachable: identify RIB resolution failure.
- Multiple simultaneous issues: report each with provenance; no single unsupported root cause.
- NX-OS vs IOS-XE: never suggest invalid commands for selected platform.

## Source pointers (summarize principles; do not reproduce copyrighted articles)
- https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/22166-bgp-trouble-main.html
- https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/112188-configure-md5-bgp-00.html
- https://networklessons.com/bgp/troubleshooting-bgp-neighbor-adjacency
- https://networklessons.com/bgp/troubleshooting-bgp-route-advertisement
- https://www.logicmonitor.com/deep-dive/bgp-monitoring/bgp-troubleshooting-cheat-sheet
- https://www.noction.com/wp-content/uploads/2023/04/BGP-network-troubleshooting.pdf

## Gate before merge
Identify actual AI Analysis implementation paths, write parser/rule tests and multi-vendor regression, verify project Save/Open and report flow, run CI, inspect PR diff, obtain human review before production deployment.
