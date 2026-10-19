# Diagnostic evidence used for port mapping

The diagnostic importer uses the same `network_discovery.build_graph` and
`discovery_details.enrich_graph` engine as Network Inventory. It extracts
command sections, normalizes abbreviated Cisco command names, binds them to
the capture's device/site, and consolidates the resulting evidence.

| Output | Information used |
| --- | --- |
| `show cdp neighbors`, `show cdp entry`, LLDP | Device identity, local/remote ports, advertised addresses and capabilities |
| CDP mismatch events embedded in logging or stack/crash diagnostics | Named peer and both ports; duplicate events consolidate with each other and with neighbor tables |
| `show mac-address-table` and `show mac address-table` | MAC/VLAN/learning-port observations and consolidated clients |
| `show arp`, `show ip arp`, IPv6 neighbors | Address-to-MAC associations, reported VLAN scope and VRF |
| `show interfaces`, switchport, trunk, status, description | Operational state, mode, VLANs, local addresses, speed and error counters |
| `show vlan` / `show vlan brief` | VLAN names, status and wrapped port membership lists |
| `show spanning-tree` / `active` / VLAN / MST blocks | Per-instance root indication and per-port role, state and cost |
| EtherChannel / port-channel summary | Aggregate/member relationships |
| Selected interface lines from running configuration | Descriptions, configured mode/VLANs, channel groups, local IPs, VRF and administration |
| `show version`, chassis inventory | Model, chassis serial and software version |

Configured and operational interface fields are kept separately. VLAN membership
does not by itself establish access/trunk mode. Interface ARP timers are not ARP
bindings. A peer name in a CDP event does not establish the device's hardware or
capabilities. Original command and event text remain available in the inspector.
Only selected interface configuration lines and relevant CDP event lines are
retained; surrounding credentials, crash memory and unrelated logs are omitted.

## Cisco references checked

- [IOS Configuration Fundamentals: show tech-support](https://www.cisco.com/c/en/us/td/docs/ios/fundamentals/command/reference/cf_book/cf_s4.html): lists CDP, interfaces/switchport/trunk, logging, MAC, configuration, spanning-tree, version and VLAN among possible component commands; content varies with platform/configuration.
- [IOS LAN Switching: show vlan](https://www.cisco.com/c/en/us/td/docs/ios/lanswitch/command/reference/lsw_book/lsw_s2.html): VLAN name/status/port fields and separate VLAN type tables.
- [Troubleshoot STP Issues on Catalyst Switches](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/28943-170.html): VLAN-scoped port roles and forwarding/blocking state.
- [Ethernet duplex auto-negotiation](https://www.cisco.com/c/en/us/support/docs/lan-switching/ethernet/10561-3.html): CDP mismatch event format containing local port, peer name and peer port.
- [Nexus interface show command reference](https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus5000/sw/command/reference/interfaces/N5k_if_cmd_ref/n5k_if_cmds_show.html): CDP summary/detail formats and fields.

Regression fixtures are synthetic and sanitized. Customer diagnostic captures
are exercised through an optional local browser-test input and are not committed.
