# BGP report engineering review

The supplied seven-page BGP-2.pdf records simultaneous final device unavailability for CE-1 and ISP-1, an outbound client service on 10.10.0.0/16, and a surviving CE-2–ISP-2 circuit. It is a stored model snapshot, not an executed router session. The report should explain route selection and remaining dependencies using that snapshot's own addresses and policies.

## Findings and implemented behavior

| Original report issue | Engineering consequence | Change |
| --- | --- | --- |
| Available modeled paths stays 1 → 1 | Counts the selected path and hides loss of alternatives | New captures distinguish eligible candidates 4 → 1 and upstream exits 2 → 1. Historical selected-path counts are relabeled without reconstructing missing evidence. |
| Zero failed connections with two failed devices | Explicit link failure controls are confused with effective link availability | Unavailable connections are counted separately from explicitly disabled connections. Four of five modeled connections become unavailable in this case. |
| Static four eBGP and one iBGP caption after failures | Topology contradicts the scenario | Captured native topology reflects available eBGP 1/4 and iBGP 0/1; the logical iBGP connection changes state. Native geometry is retained. |
| Generic commands and unassigned neighbor IPs | A reader cannot identify the executing router or distinguish local and remote addresses | Three short structured synthetic outputs show observer/interface/local IP, neighbor/AS/peer IP, candidate policy and forwarding selection. Addresses come from the transferred design. |
| Generic redundancy warning | No actionable remaining risk | The report re-evaluates additional individual failures on common candidate dependencies and names those that remove the surviving modeled service. |
| Repeated unchanged parameters and policies | More pages without more insight | Changed parameters and impacted components are retained; candidate policy is shown once in the synthetic route table. |
| Repeated unmeasured loss and convergence disclaimers | Adds no scenario-specific result | Unmeasured performance metrics are omitted. Synthetic origin is identified at the report introduction. |
| Captions separated from topology figures and isolated table rows | Difficult to follow before/after evidence | Figures stay with captions; compact tables are kept together in print and Word, with repeated headers available for longer inventories. |

## Expected interpretation of the supplied scenario

CE-1 failure changes the modeled client gateway to CE-2. ISP-1 failure also removes the CE-2–ISP-1 alternative. The remaining outbound circuit is CE-2–ISP-2, with CE address 172.16.20.1/30 and neighbor 172.16.20.2/30. The selected modeled upstream test prefix is distinct from the client LAN prefix. There is one surviving eligible circuit and one usable upstream exit. An additional failure of CE-2, ISP-2 or the remaining WAN circuit removes that service path.

The original command plan's 172.16.16.2 is present on the drawing, but is the peer on CE-1–ISP-1, not a generic neighbor that can be queried on every CE. The interconnect addresses 10.255.0.1/2 appear in that plan but not in the original figure, so the PDF alone cannot prove which endpoint addresses were configured. New transfers retain and display the configured interconnect addresses and interfaces rather than infer them from command strings.

## Model boundaries and next development priorities

1. Explicit protocol events: neighbor FSM, route withdrawal/install and recovery should become recorded state transitions before the application reports simulated event timings. Current session availability is derived from modeled endpoints and connections.
2. Routing policy fidelity: retain the documented current selection subset; add explicit attribute support and per-neighbor import/export behavior before presenting full vendor best-path equivalence. Local Preference belongs to customer-AS route selection; inbound prepend is an advertisement attribute under equal modeled upstream policy.
3. Forwarding dependencies: add configurable next-hop reachability and gateway WAN tracking, then compare return traffic and per-prefix reachability. Current shared-LAN gateway role changes on CE device failure, not WAN tracking.
4. Measured performance: packet loss, outage duration and convergence need a timestamped traffic/protocol evidence source. Until implemented, these fields do not appear in customer reports.
5. Vendor CLI rendering: use the same structured evidence for platform-specific synthetic snippets only with a clearly stated vendor/version profile. Do not fabricate uptime, counters, BFD timings or a real device execution status.

## Validation contract

New tests cover the supplied address plan, candidate versus provider counts, outbound/inbound observation, five vendor profiles, failed-device and link combinations, additional gateway failover, historical snapshot preservation, malformed evidence rejection, actual Word export, standalone PDF rendering and final-report handoff. Existing shared-module and pair-failure regression coverage remains required. The routing engine itself is unchanged by this report update.

Protocol reference: RFC 4271, section 5.1.5 and route selection procedures: https://www.rfc-editor.org/rfc/rfc4271.html
