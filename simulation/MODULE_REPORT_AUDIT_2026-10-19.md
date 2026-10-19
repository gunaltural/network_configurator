# Module reporting and synthetic command evidence

All eight Technology Workspace modules and their 32 supported module/vendor combinations were reviewed against the transferred model, generated verification commands, scenario capture and HTML/Word renderers.

## Changes

New scenarios include a small set of synthetic command blocks. Command names are selected from the active vendor/module's existing verification list. The body uses model fields and is explicitly identified as a synthetic adaptation, not a byte-for-byte network OS transcript. Failed devices have an unavailable-response block rather than invented CLI data. No uptime, packet counters, measured loss, BFD timing, OSPF FSM state or authentication result is fabricated.

| Module | Recorded output | Specific interpretation |
| --- | --- | --- |
| BGP | Observer-specific neighbor/interface/local and peer IP state; selected forwarding entry | Candidate count, upstream exits, policy and route changes remain separate. |
| vPC / MLAG / StackWise / iStack | Peer coordination, roles, protection/recovery and service members on both peers | Local availability and safe service forwarding are distinct during partitions. All leafs are reported independently. |
| STP | Root for selected source, roots of disconnected components, forwarding/blocked/down connections | Blocking is protocol protection. Root changes and tree partition count are reported. |
| OSPF | Modeled connection availability and configured cost | Selected accumulated path cost changes are reported; actual neighbor FSM, RID and timers are not inferred. |
| EVPN | Imported logical session connectivity | Logical availability is not tenant forwarding, VNI membership or learned Type-2/5 routes. |
| QoS | Offered traffic, configured limit, calculated admission and unserved demand | Path loss is distinguished from policy limiting; unserved demand is not measured packet loss. |
| SD-WAN | Configured local WAN transports | No remote tunnel, controller or application SLA result is inferred. |
| System and Management | Configured management endpoint connectivity | Connectivity does not imply successful AAA, NTP synchronization or server health. |

Generic command plans and repeated unmeasured checklists are omitted for new rich captures. Changes to roles/root remain in before/after comparisons. Historical scenarios are rendered from their stored evidence without reconstructed synthetic output.

## All leaf traffic correction

The shared pair engine already evaluated the selected leaf accurately. The renderer incorrectly used only that selected leaf's paths to form its highlighted connection set. It now evaluates each imported leaf under the same device/link failures, ordered events, conditions and recovery state, then draws the union of usable service paths. Arrow direction follows each leaf's own path. Failed, protected, recovering and unverified members retain their distinct states.

A selected-leaf outage no longer labels the whole topology as having no path when other leafs retain service. Per-leaf path badges, a partial-service-loss ribbon and a report table distinguish selected-source analysis from domain-wide service state. Split-brain never produces healthy green forwarding animations.

## Verification

Coverage includes actual DOM transfers for all 32 module/vendor combinations, command provenance, module-specific report scenarios, bilingual Word API validation, safe escaping and unavailable observers. Browser coverage checks healthy paths for every leaf, isolated leaf failure, peer protection, partitions, recovery and existing vendor failure catalogues. Bilingual PDF and Word output and final-report handoff remain release checks.

Command references reviewed:
- Cisco vPC command reference: https://developer.cisco.com/docs/nx-api-cli-reference-for-the-cisco-nexus-7000-series-platform/vpc-commands/
- Arista MLAG manual: https://www.arista.com/en/um-eos/eos-multi-chassis-link-aggregation
- Huawei M-LAG verification: https://info.support.huawei.com/network/ptmngsys/Web/tsrev_ce/en/content/ce/14_edesk_dc_m-lag_down/edesk_dc_m-lag_down_edesk002.html

## StackWise restore interaction

The supplied screenshot shows SVL and DAD UP while the original active waits in Recovery. With no selected fault, Restore selected previously did nothing. The shared pair UI now exposes three explicit contextual actions: Restore selected, Restore scenario, and Complete recovery (simulation). Physical restoration preserves role/event history; completion of the recovery stage is a separate explicit action. Required manual recovery remains protected. Healthy controls are disabled instead of silently doing nothing.

## StackWise DAD topology connection

The original native diagram included DAD port text but no DAD connection shape. A separate selectable DAD path now connects the chassis above the SVL, with configured endpoint ports. It is mapped to the independent DAD failure IDs, so failure/restore state and captured report topology reflect the actual selected DAD state. Chassis and leaf positions are retained.

## Other module topology coverage

STP, OSPF and QoS now show all imported leaf paths to the selected destination, excluding failed and blocked connections. SD-WAN shows its configured local transport paths. System/Management retains endpoint connectivity evidence without representing AAA or monitoring service success as traffic. Detailed analysis and command evidence retain the selected source. An endpoint-path report table captures those scopes independently. EVPN retains logical-session semantics and the accepted BGP flow selection is preserved.
