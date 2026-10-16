# Simulation visual behavior contract

The imported design remains the base drawing. Faults, roles, path choice,
protection, recovery and policy results are rendered on that drawing, then
captured in the existing immutable scenario SVG and report flow.

| Scenario state | Required topology behavior |
| --- | --- |
| Healthy selected path | Green directional flow on eligible modeled links |
| Physical device loss | Dimmed original device, red outline, cross and DEVICE DOWN badge |
| Connection loss | Red dashed original link and failure cross where geometry is available |
| Protective suspension / recovery | Amber blocked members and explicit device badge; no healthy flow on blocked links |
| Dual-active / unverified peer partition | Independently outlined peers, visible domain warning, unverified member lines, no healthy flow animation |
| Alternate path | Selected surviving path replaces baseline highlight |
| No modeled path | Persistent in-canvas state banner; failed/protected components remain visible |
| Partial restore | Only restored components lose their fault marks; other failures persist |
| Full restore / reset | No stale failure, split or recovery marks |
| Policy change | OSPF cost and BGP selection attribute on selected native link; STP root badge; QoS arithmetic in topology header |
| Report capture | Static status, component marks and role labels survive SVG capture and Word/PDF rendering |

Endpoint failures that belong to aggregated design symbols remain named in the
in-canvas failure summary; an aggregate service/cloud is not falsely marked as
entirely down for one endpoint. Logical EVPN connectivity and QoS arithmetic
retain their existing model boundaries.

Native link identities are retained for vPC/MLAG, STP, OSPF, QoS, BGP and SD-WAN.
Curved link arrow directions follow path traversal without replacing the native
geometry. StackWise SWITCH-1/2 labels map to the actual imported chassis IDs.
Recovery peer IDs are exposed as renderer metadata; forwarding decisions and
existing protocol calculations are unchanged.

Acceptance covers the complete currently generated five-vendor pair catalogue,
all 32 workspace/vendor handoffs, multiple device failures and partial restore,
parameter edits/reset, scenario captures and actual report downloads. The
pre-existing BGP, configuration, inventory and combined report suites remain
required regression checks.
