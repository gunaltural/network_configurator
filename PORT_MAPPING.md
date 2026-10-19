# MAC port mapping v1

Open **Inventory → MAC Port Mapping** (`/port-mapping`). Upload text/log/RTF captures or paste Cisco IOS/NX-OS, Arista EOS or Huawei VRP MAC table rows. Each source has an editable device label. Files are parsed locally in the browser; the existing login boundary protects the workspace and registry assets.

The topology groups learned MACs by imported source and port. It is a MAC learning map, not physical neighbor discovery. Operational switchport mode remains unknown until supporting output is available. Virtual gateway addresses, multicast and local/system records are retained as infrastructure evidence, excluded from endpoint groups. A device count or device model is not inferred from address registration. IPv4/IPv6 mapping, LLDP/CDP merging, direct neighbor verification, traffic simulation, and switchport configuration import are outside v1.

Search and VLAN filters apply to topology and records. Selecting a port scopes the table and CSV to it. The inspector includes original capture lines. Workspace JSON includes raw source captures, labels, import times and optional imported registry overrides; JSON restore reparses sources rather than trusting stored results. Nothing is saved automatically. CSV includes source filename and import date; import date is not a measured capture time.

Limits: 3 MB per capture, 50,000 parsed records per source, 20 sources, 10 MB aggregate raw text. Tables are paginated to 100 rows; topology to 24 port groups.

## Address organizations

Bundled registry: IEEE MA-L and IAB listings packaged by netaddr 1.3.0, with 39,659 prefixes. Packaged 2026-10-19; original registry effective date is unknown. See `port-mapping-registry-NOTICE.txt` for attribution and netaddr license. The route serves a gzip-compressed JSON snapshot; no external lookup is required. IEEE MA-L/MA-M/MA-S CSV imports can refresh/extend lookup. Matching uses 36, 28 then 24 bits; locally administered and multicast addresses are not assigned a manufacturer from the OUI database.

## Verification

`node test_port_mapping.cjs` checks row formats, RTF, VLAN identity, infrastructure classification, registry matching, filters and safe workspace restore. `node test_port_mapping_browser.mjs` checks actual file upload/download and navigation. Optionally pass `PORT_MAPPING_SAMPLE=/path/to/show_mac_address.rtf` to check the private acceptance capture: 1,371 dynamic rows, 123 port groups, zero unmatched MAC-bearing lines, Gi4/48 147 distinct MACs, Gi1/20 145. The private capture is not included in this repository.
