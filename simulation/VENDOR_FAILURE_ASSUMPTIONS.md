# Failure Simulation — Engineering Assumptions (v5.44 draft)

**Status:** Synthetic, design-level guidance; not a forwarding-plane emulator and not a replacement for software-version-specific vendor validation.

## Common model

- Imported designs use the **dynamic Technology Workspace topology SVG** as the sole visual reference. Device names, leaf count, attached interfaces and peer-link physical members come from the same current Workspace report data, not an invented graph.\n- Standalone simulations without a Workspace snapshot are explicitly marked as incomplete; no fake topology is drawn.\n- Dedicated liveness or upstream links appear as failure options only when the imported design explicitly identifies the matching fault domain. Arista MLAG peer-control VLAN is not a separate physical heartbeat.
- One member down is degraded peer-link redundancy, **not necessarily complete logical peer-link down**.
- All imported peer-link members down implies loss of the logical peer-link **if** there is no alternative member.
- One or both failed devices, and any subset of links, may be selected simultaneously.
- Dual-active/split-brain risk requires both peers to remain operational. A failed peer is not itself a dual-active event.
- No assertion is made for traffic convergence time, BGP RIB/FIB contents, exact packet loss, platform versions, or downstream single-homed traffic absent explicit topology.

## Device-specific evidence

| Technology | Peer-link/SVL down while liveness path remains up | Both down |
| --- | --- | --- |
| Cisco Nexus vPC | On secondary, vPC member suspension and associated vPC VLAN SVI behavior; orphan port isolation must be checked | Dual-active risk |
| Arista EOS MLAG | Primary/secondary and heartbeat configuration govern failure handling; review heartbeat interval and dual-primary recovery | Split-brain/dual-primary risk |
| Huawei CloudEngine M-LAG | DFS pairing, DAD link and MAD design matter; member/uplink tracking needed | Dual-active protection unavailable |
| Cisco StackWise Virtual | Standby assumes active; functioning DAD can put original active into recovery and disable nonexempt interfaces | Dual-active risk if DAD unavailable |

## Reference manuals

1. Cisco Nexus vPC best practices: https://www.cisco.com/c/dam/en/us/td/docs/switches/datacenter/sw/design/vpc_design/vpc_best_practices_design_guide.pdf
2. Cisco Nexus NX-OS interfaces / dual active: https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/101x/configuration/interfaces/cisco-nexus-9000-nx-os-interfaces-configuration-guide-101x/b-cisco-nexus-9000-nx-os-interfaces-configuration-guide-93x_chapter_01000.html
3. Arista MLAG chapter: https://www.arista.com/en/um-eos/eos-multi-chassis-link-aggregation
4. Huawei M-LAG overview and DAD: https://info.support.huawei.com/info-finder/encyclopedia/en/M-LAG.html
5. Cisco StackWise Virtual / DAD: https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/ha/svl/svl-configuration-guide/configuring_cisco_stackwise_virtual.html

## Deferred work

- Keep dynamic SVG and model-link identities synchronized when editing the live Workspace; the current transfer is a snapshot captured on launching simulation.\n- Add explicit role-state input and vendor/version-specific role election; hostnames alone do not prove primary/secondary status.
- Add platform/OS profile selection and parameterized recovery timers.
- Validate MAC/ARP synchronization, SVI impact, LACP/member state, orphan ports, access dual-homing, and service-level effects with version-specific documentation.
- Connect scenario export with reporting pipeline and perform interactive browser visual regression (CI currently validates DOM and link/model contracts).
- Extend existing BGP synthetic workbench in place without replacing its policy evaluation or traffic path logic.

These limitations should remain visible in the UI and scenario exports.
\n## BGP audit findings\n\n- Corrected a false positive in synthetic Internet inbound selection: routes entering through an alternate CE now require a working CE interconnect to reach the selected owner; an offline target owner cannot be marked reachable.\n- The existing BGP lab is still a 2-CE / 2-ISP protocol subset, even though Technology Workspace allows more dynamic device counts. The simulator must not silently claim arbitrary BGP topologies are emulated.\n- New BGP fail/restore and concurrent-failure tests cover route reachability and protect the existing 2x2 evaluator.\n