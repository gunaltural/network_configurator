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
healthy baseline; simultaneous interconnect and detection loss; one physical member loss where there are multiple members;
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

## Simultaneous Nexus control-path loss regression

Cisco NX-OS vPC Fundamental Concepts, printed pp.19–20, explicitly documents
complete double failure: both peers retain local vPC members, and the former
secondary becomes operational primary. This is split-brain / dual-active, not
unknown roles. Existing flows may continue; MAC/ARP and multicast synchronization
loss can affect new flows and duplicate forwarding.
https://www.cisco.com/c/dam/en/us/products/collateral/switches/nexus-7000-series-switches/C07-572835-00_NX-OS_vPC_DG.pdf

A single Fail selected action is one atomic simulated failure event. Simultaneous
loss and keepalive-first loss both report `split-brain`, two operational primaries,
no protective suspension, and no healthy traffic animation. Peer-link-first loss
initially suspends the secondary; configured auto-recovery is an explicit later
transition that can reactivate it and create split-brain while both peers live
(Best Practices pp.124,127). Tests assert roles, findings, order, topology state
and recorded report output rather than only checking absence of runtime errors.

## Expanded per-vendor fault and repair catalogue

All five profiles expose atomic simultaneous failures, both sequential failure
orders, each physical interconnect member, each chassis, selected leaf loss,
each leaf-to-peer attachment group, attachment recovery and attachment loss
followed by loss of the opposite chassis. Combined cases include both chassis
restart, protected-domain forwarding chassis loss, and restoration of detection,
interconnect or both after a double failure. Scenario names use vPC/keepalive,
MLAG control SVI, DFS DAD, SVL/DAD or stack/MAD as appropriate.

- EOS: loss of control SVI alone disables the association, even while the physical
  peer-link survives. Repairing only the peer-link does not restore a failed SVI.
  Reloaded peers are held through reload-delay. Optional independent heartbeat
  and errdisable safeguards are only tested when explicitly present in a model.
- Huawei M-LAG: backup service ports Error-Down under effective DFS DAD; peer
  repair requires negotiation/member recovery. Recovered chassis restore the
  original negotiated roles per Huawei's device-failure description, unlike
  Nexus non-preemptive operational role recovery.
- StackWise Virtual: DAD recovery isolates the original active; loss of the
  forwarding chassis does not silently release the surviving Recovery chassis.
  SVL repair leads to reload/rejoin before normal service is modeled.
- iStack: ring loss degrades to a chain if another imported stack link survives;
  a chain with a single imported interconnect splits when that link fails. MAD
  elections need priority/MAC evidence. Equal priorities with no MAC data are
  explicitly unconfirmed. A Recovery fragment is not revived by a timer while
  the stack is still partitioned and requires platform recovery.

Upstream paths, orphan ports, relay/proxy MAD topologies and exclusions are only
modeled if represented in the imported design; they are not invented as extra
failure targets.
