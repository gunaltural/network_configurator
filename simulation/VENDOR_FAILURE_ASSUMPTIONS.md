# Failure Simulation — Engineering Assumptions (v5.44 draft)

**Status:** Synthetic, design-level guidance; not a forwarding-plane emulator and not a replacement for software-version-specific vendor validation.

## Common model

- Two peers, two physical members of the peer-link/SVL, one separately modeled liveness/DAD path, and two uplinks.
- One member down is degraded peer-link redundancy, **not necessarily complete logical peer-link down**.
- Both peer-link members down implies loss of the logical peer-link **if** there is no alternative member.
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

- Map actual generated vPC/MLAG topology, device names, member interfaces and role state from the Technology Workspace.
- Add platform/OS profile selection and parameterized recovery timers.
- Validate MAC/ARP synchronization, SVI impact, LACP/member state, orphan ports, access dual-homing, and service-level effects with version-specific documentation.
- Connect scenario export with reporting pipeline and end-to-end UI regression.
- Extend existing BGP synthetic workbench in place without replacing its policy evaluation or traffic path logic.

These limitations should remain visible in the UI and scenario exports.
