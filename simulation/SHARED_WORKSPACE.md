# Shared simulation workspace

All eight implemented Technology Workspaces now launch the same `/network-lab`
page, stylesheet and pan/zoom/inspector controls. The existing 2-CE / 2-ISP BGP
controller remains unchanged for its accepted topology. Other BGP sizes and the
other modules use `workspace-engine.js` and `workspace-controller.js` on that
same page. The old separate MLAG page remains available for old links; the
Technology Workspace no longer navigates there.

The current project snapshot, vendor, hostnames, ports, actual physical and
logical link IDs, generated configurations and exact topology SVG are captured
together. No network OS or device CLI is executed by this synthetic model.

| Module | Modeled behavior | Scope |
| --- | --- | --- |
| BGP | Local Preference, prepend, explicit internal paths, simultaneous device/circuit failure | Dynamic CE/ISP sizes; no invented transport for a logical full mesh |
| vPC / MLAG / SVL | Peer members, independent liveness/DAD where configured, peer/control failure, node failure | Vendor findings; physical path is conditional when peer protection is uncertain |
| Huawei iStack | Stack interconnect redundancy, partition, member/access failure | No assumption about elected master or MAD recovery |
| OSPF | Shortest modeled cost, cost changes, node/link failure | Compatible adjacency settings assumed; no timers or packets |
| STP | Synthetic spanning tree, preferred root failover, blocked links | Equal link costs; device ID resolves unknown bridge-MAC ties |
| EVPN/VXLAN | Imported overlay session graph and failures | No inferred physical underlay or MAC/VNI forwarding |
| SD-WAN | Configured local router/WAN gateway transport failures | No inferred remote site, tunnel, OMP or SLA |
| QoS | Offered-rate arithmetic against selected shaper/policer, link/device availability | No queue, burst or packet emulation |
| System & Management | Configured OOB/AAA/NTP/syslog/NMS endpoint dependencies | No server process or authentication simulation |

The vendor combinations are exactly those offered by the implemented module's
platform selector (32 combinations). This does not enable configuration
production for vendor/module combinations absent from that selector. MPLS and
Multicast remain unimplemented placeholders, with no misleading simulation CTA.

Failure selections are independent of failed state. Several selected devices
and links can fail together; Restore Selected removes only selected faults and
clears their checkmarks. Reset removes all faults. The baseline design remains
unchanged. Immutable scenario snapshots retain module, vendor, source/target,
failures, baseline/current path, model findings and topology. PDF/Word and final
report transfer use the same snapshots. Report transfer preserves the matching
project/module's existing report and deduplicates scenario IDs.

## Vendor references

- Cisco vPC best practices: https://www.cisco.com/c/dam/en/us/td/docs/switches/datacenter/sw/design/vpc_design/vpc_best_practices_design_guide.pdf
- Arista MLAG: https://www.arista.com/en/um-eos/eos-multi-chassis-link-aggregation
- Huawei M-LAG: https://info.support.huawei.com/info-finder/encyclopedia/en/M-LAG.html
- Cisco StackWise Virtual: https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/ha/svl/svl-configuration-guide/configuring_cisco_stackwise_virtual.html

## Verification

- `node simulation/test_workspace_engine.cjs`
- `node simulation/test_workspace_dom.cjs` — actual Workspace transfers for all 32 combinations
- `node simulation/test_workspace_browser.mjs` — real Chromium, shared controls, Restore and reporting
- `node simulation/test_browser_smoke.mjs` — preserved original BGP handoff
- `AUTH_ENABLED=0 npm test`
- `AUTH_ENABLED=0 python -m unittest discover -s simulation -p 'test_*.py'`
- `AUTH_ENABLED=0 python -m unittest test_simulation_report`
