# Network topology and port mapping · 5.53.0

The independent `/port-mapping` workspace correlates neighbor discovery, interface evidence, MAC learning and IP/MAC tables. It does not execute imported CLI text or alter technology project data.

## Diagnostic-file workflow

Upload one `show tech-support` file per Cisco IOS-XE, NX-OS or Arista switch, or the corresponding Huawei VRP/iStack `display diagnostic-information` text. TXT, LOG, RTF and gzip-compressed text are accepted. Recognized command separators include dashed/equals/asterisk headings and CLI prompts. Individual command imports and old `mac-port-mapping-v1` workspaces remain supported.

The browser extracts relevant neighbor, MAC, interface, aggregation and ARP/ND sections. Platform is detected from the version section; hostname comes from a CLI prompt or the hostname/sysname statement. Unrelated running configuration and logs are omitted from retained evidence. The extractor reports missing categories, oversized/unparseable sections and pagination markers. A bundle with no recognizable usable sections leaves the existing workspace intact. Files containing multiple device prompts must be split by device.

Limits: diagnostic text up to 50 MB; each retained section up to 3 MB; at most 100 retained sources and 10 MB text in a workspace; graph at most 500 devices and 2,000 links. Gzip expansion is bounded. ZIP/TAR archives are not unpacked. Neighbor and interface sections are submitted to the application's authenticated parsing endpoint; MAC-only analysis remains in the browser.

## Correlation and presentation

- LLDP/CDP detailed and supported summary formats establish advertised neighbor connections and local/remote ports. Reverse observations consolidate into a single link, with both-end confirmation separate from one-sided observation.
- Site/fabric scopes prevent identical names/MACs in different networks from collapsing. Use consistent names and management addresses across captures; ambiguous identities are reported.
- Port status, descriptions, operational switchport mode, access/native/voice/allowed VLANs, link speed, aggregation membership, available errors and PoE fields enrich each port. Missing fields remain uncollected. Numbers of learned MACs never determine access/trunk mode.
- MAC/VLAN observations consolidate per site. Transit observations remain attached to the same identity instead of duplicating the client. Switch uplinks and remote NVE/VXLAN learning do not become physical client locations. Multiple candidate edge locations remain explicit, including possible dual attachment or movement.
- Neighbor chassis MAC and advertised capabilities can identify a phone, AP, switch/bridge or router. OUI lookup identifies the registered organization only. Engineer hostname/type/notes annotations have explicit provenance.
- ARP/ND addresses retain VRF, observed VLAN, source and time. Records without an SVI VLAN are labelled as unscoped rather than asserted to match a VLAN.
- Newest device/command/VRF snapshots supersede previous captures. Explicit empty MAC tables remove old learning; per-interface diagnostic sections retain independent snapshot identities. Raw active and superseded captures remain inspectable.

The main map shows neighbor links and expandable learned-port groups. Port groups learned through a network-device connection are associated with that neighbor when the last access port is unknown. Phone/AP downstream groups are placed beside their advertised neighbor. Device focus and neighborhood depth limit large maps; port view supports paging. MAC/IP/hostname/vendor/port search and VLAN filters apply to tables and maps. Highlighted relationships traverse the discovered graph; they are not measured traffic or an STP forwarding-path claim.

Each switch, link, port and consolidated client opens its evidence inspector. Source commands, original diagnostic line ranges and timestamps remain available. Supplied capture time is used when entered; otherwise times are import times. Access/native VLAN conflicts, multiple neighbors, multiple edge candidates and down-port/MAC evidence are review notes.

## Persistence and export

The independent browser draft uses `networkConfigurator.portMapping.v2`. Explicit JSON export stores raw extracted sections, custom OUI prefixes, coverage notes and client annotations; restore reparses the original sections. Old v1 files import as MAC-only workspaces. Network Discovery JSON can be opened without changing the source project. CSV exports cover port observations or consolidated clients; SVG exports the current topology. Print/Save PDF uses current filters and topology scope.

## Verification

The bundled offline organization registry retains its existing attribution: IEEE MA-L and IAB listings packaged by netaddr 1.3.0 (39,659 prefixes; packaged 2026-10-19; original registry effective date unknown). See `port-mapping-registry-NOTICE.txt` for attribution and license. Optional IEEE CSV imports extend MA-L/MA-M/MA-S prefixes; longest-prefix matching takes precedence, and multicast/locally administered MACs remain unassigned.

The private v1 RTF acceptance capture is not committed. `PORT_MAPPING_SAMPLE=/path/to/show_mac_address.rtf node test_port_mapping_browser.mjs` retains its expected 1,371 dynamic rows, 123 port groups, zero unmatched MAC-bearing lines and original port counts.

`test_port_mapping.cjs` preserves the original MAC/RTF/OUI/import behavior. `test_port_mapping_topology.cjs` exercises cross-vendor neighbor/port correlation, reciprocal links, LAG transit, phone/AP identities, MAC deduplication, path highlighting, IPv4/IPv6/VRF, site isolation, dual attachment, overlay learning, annotations and newest empty snapshots. `test_port_mapping_support.cjs` exercises diagnostic extraction, summary neighbors, per-port sections, trunk VLANs and omission of unrelated config/log output. `test_port_mapping_api.py` verifies import does not contact devices. Chromium verifies gzip upload, actual API parsing, topology interactions, drafts, annotations, JSON restore and mobile layout.

Diagnostic command lists and formatting vary by vendor/platform/release. Coverage is determined from the supplied file; a missing section is not treated as an empty table or absence of neighbors. Initial fixtures are synthetic representative outputs, not validation of the customer's live network.
