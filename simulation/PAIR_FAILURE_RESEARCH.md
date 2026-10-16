# Vendor redundancy simulation: research and acceptance rules

This revision replaces physical shortest-path reachability for redundant pairs
with vendor-specific member forwarding/protection models. The logical service
is the destination; a failed primary chassis is not itself the traffic target.
BGP's existing topology/controls/report flow is retained as the UI foundation.

## Sources reviewed

- Cisco vPC Best Practices Guide, revised March 2021, printed pp. 32, 126–128:
  https://www.cisco.com/c/dam/en/us/td/docs/switches/datacenter/sw/design/vpc_design/vpc_best_practices_design_guide.pdf
- Cisco Nexus 9000 NX-OS 10.5(x), Configuring vPCs: role election, peer-link
  failure, consistency checks, recovery after outages, sticky-bit and delay restore:
  https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/105x/configuration/interfaces/cisco-nexus-9000-series-nx-os-interfaces-configuration-guide-release-105x/m_configuring_vpcs_9x.html
- Arista EOS MLAG: availability through one peer, reload delay, control-session
  loss, independent heartbeat, optional dual-primary errdisable action and recovery:
  https://www.arista.com/en/um-eos/eos-multi-chassis-link-aggregation
- Huawei M-LAG: member/interface/device failures, DFS/DAD protection and recovery:
  https://info.support.huawei.com/info-finder/encyclopedia/en/M-LAG.html
- Cisco StackWise Virtual: SVL loss, DAD, original-active recovery and rejoin:
  https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/ha/svl/svl-configuration-guide/configuring_cisco_stackwise_virtual.html
- Huawei iStack white paper, principles and DAD competition/recovery:
  https://enterprise.huawei.com/ucmf/groups/entpublic/documents/enterprise_webasset/hw_336742.pdf

The older Nexus best-practices guide includes Nexus 7000-specific details. The
9000 configuration guide is used to cross-check behavior rather than applying
7000 line-card or orphan-port syntax universally. Exact software/platform timers
and exceptions are not inferred from a hostname.

## Behavior matrix

| Failure | Nexus vPC | EOS MLAG | Huawei M-LAG | StackWise Virtual | Huawei iStack |
| --- | --- | --- | --- | --- | --- |
| One interconnect member | Bundle remains up if another member survives | Same physical-bundle principle | Same physical-bundle principle | Remaining imported SVL member survives | Ring becomes chain if another stack link survives |
| Detection path only | No immediate member suspension | Imported control SVI is not independent DAD; association loss is a separate fault | DAD lost: protection reduced | DAD lost: detection reduced | MAD lost: split protection reduced |
| Complete interconnect loss, detection effective | Secondary vPC members suspend | Protection only if independent heartbeat **and** errdisable action are actually configured | Backup modeled service ports Error-Down | Standby becomes active; original active enters recovery | MAD loser enters Recovery; service ports disabled |
| Interconnect and detection lost | Order-dependent protection/dual-active risk | No assumed Cisco suspension | Dual-active risk unless a peer is already protected | Dual-active risk unless recovery has already isolated a chassis | Split-brain risk unless a fragment is already isolated |
| Primary/master/active fails | Surviving peer becomes operational primary | Healthy peer's local legs remain, with STP/config assumptions | Backup takes over | Standby takes over | Standby becomes master |
| Both peers down | No service path | No service path | No service path | No service path | No service path |
| Failed device/interconnect returns | Non-preemptive operational role; delay restore | Reload-delay / MLAG renegotiation | DFS negotiation and member recovery delay | Recovery reload and standby rejoin | Fragment restart and rejoin |

The scenario catalogue is generated from the actual design, including:
healthy baseline; one physical member loss where there are multiple members;
complete interconnect loss; detection/control-only failure; both failure orders;
each peer failure; both peers down; primary return; interconnect recovery; selected
leaf's member links lost. Nexus additionally includes mandatory consistency
mismatch, service VLAN mismatch and pair outage with lone-peer auto-recovery.

## Important implementation boundaries

- Configured role priorities initialize the Nexus/Huawei baseline. Operational
  roles can differ; the baseline role selector is explicitly a scenario input.
  Equal priorities with unknown MAC addresses cannot prove an actual election.
- Arista's currently generated MLAG configuration has no independent
  `peer-address heartbeat` or dual-primary errdisable action. A missing safeguard
  must remain missing in the model; no synthetic extra heartbeat is drawn.
- Nexus mandatory mismatch honors the imported graceful-consistency setting.
  A VLAN mismatch affects the selected modeled service, not every VLAN/bundle.
- All blocked member legs are excluded before traffic-path evaluation. Access
  switches are not used as fictional transit paths to bypass peer protection.
- Recovery is an explicit modeled phase, not measured packet loss or a live
  wall-clock timer. The button advances an interval only; it does not execute a
  device command. A manual platform recovery requirement is not auto-cleared.
- Orphan ports, northbound L3 paths, SVI exclusion lists and reserved management
  interfaces are documented dependencies but are not invented in a dual-homed
  imported topology that does not contain them.
- Roles, event order, baseline/current paths and protection findings are included
  in immutable snapshots, PDF/Word export and final-report transfer.

## Acceptance

- 160 combinations of peer devices, physical interconnect members and detection
  paths checked for five platforms, with explicit order/role/recovery assertions.
- Real Chromium tests run meaningful scenarios for each platform: surviving
  peer forwarding, protected peer, unprotected MLAG risk, both down, recovery,
  selection clearing and actual Word export.
- General 32 module/vendor handoffs and existing BGP behavior remain covered.
