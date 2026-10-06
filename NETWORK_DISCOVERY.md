# Network Discovery — 5.21.0

Open **Inventory → Network Discovery** in the sidebar. This is a separate existing-network module; Technology Workspaces retain their planned topology and configuration.

## Inputs

- **SSH**: add starting devices or choose current Inventory records. Select platform and LLDP/CDP, enter target/port/username/password, test the connections and discover selected devices. The queue contacts only selected starting devices. Advertised neighbors are not contacted automatically.
- **CLI import**: enter the local device name/platform, optional management address/capture time and paste or upload detailed LLDP/CDP text. Text is parsed, never executed. UTF-8 and BOM-marked UTF-16 text are accepted. The upload picker accepts any filename extension; binary files are rejected.
- **Synthetic example**: loads documentation-range addresses and synthetic hostnames into the import editor. Click Import to build the demonstration graph. No SSH is initiated by this example.

Supported initial platforms: Cisco IOS-XE/NX-OS (LLDP or CDP), Arista EOS (LLDP), Huawei VRP/CloudEngine and iStack (LLDP). Detail output is required. Summary-only or unrecognized outputs generate warnings rather than invented port links. Model-specific/release-specific output variation requires additional fixtures; the current parsers cover tested detail formats and should not be treated as universal vendor support.

## Outputs and interpretation

A draggable, zoomable topology, selectable device table, connection schedule and inspector are derived from collected sources. Each connection retains local/remote ports, protocol, collection origin and capture time. Reciprocal matching observations collapse into one link. Parallel port pairs remain separate. A solid line indicates both ends were observed; a dashed line indicates one-sided neighbor evidence. Neither establishes traffic forwarding, a measured application path or operational health.

Neighbor advertisements populate candidate names, chassis IDs and advertised management addresses. Their advertised vendor description may suggest a platform; the engineer can choose or correct it. Model/serial/software fields are populated only from direct SSH inventory collection on the corresponding starting device. Empty management information stays empty. Unidentified platforms require assignment before Inventory transfer.

New observations replace the same starting-device/platform/protocol source. The change summary lists new connections and prior connections not observed in that update. “Not seen” is not a failure diagnosis. Manual node positions are retained across updates; Fit / auto layout explicitly recomputes placement. Layout levels come from observed graph distances and are not an inferred spine/leaf architecture. The graph view shows up to 200 nodes; tables/export retain up to 500 devices and 2,000 links.

Download map SVG, connections CSV or discovery JSON. Discovery state (including source evidence) is part of normal project Save/Download/Open. Save retains the existing revision behavior. Seed credentials are transient, cleared after collection and excluded from saved state. The stopping control completes the current request before stopping queued work.

## Inventory and reporting integration

Select devices, then **Add selected devices to Inventory**. Imported records appear in Manual Inventory, remain editable and feed the same report Inventory table. Direct SSH identity values retain device verification provenance; neighbor-only records remain incomplete and are labeled discovery records in English/Turkish preview and Word.

The transfer does not alter design devices, planned connections or generated configurations. Previously imported discovery records are retained rather than silently overwritten. A name/management-address collision with another Inventory record blocks the transfer and leaves existing records unchanged; resolve the duplicate explicitly. A transfer associated with another design project is rejected.

The discovered map is exported separately. It does not replace the customer's planned topology in the existing Design and Reporting output. No subnet sweep, automatic recursive collection, scheduled polling, SNMP, L3 route/subnet inference, performance metrics or automatic failure classification is included in this first release. Private-network collection requires actual server routing/access; a target policy exception alone does not create connectivity.

## Research references

- [SolarWinds NTM discovery methods](https://documentation.solarwinds.com/en/success_center/ntm/content/ntm_what_is_solarwinds_network.htm)
- [SolarWinds physical/logical segment interpretation](https://documentation.solarwinds.com/en/success_center/ntm/content/ntm_understanding_network_segment.htm)
- [SolarWinds Intelligent Maps connection inspector](https://documentation.solarwinds.com/en/success_center/orionplatform/content/core-orion-maps-connections.htm)
- [Cisco LLDP detailed neighbor fields](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/cdp-lldp-mac-udld/cdp-lldp-mac-udld-configuration-guide/configure-lldp.html)
- [Arista EOS LLDP](https://www.arista.com/en/um-eos/eos-link-layer-discovery-protocol)
- [Huawei LLDP](https://info.support.huawei.com/info-finder/encyclopedia/en/LLDP.html)
- [NTC Templates parsing/test methodology](https://github.com/networktocode/ntc-templates/blob/master/docs/dev/dev_parser.md)

The implementation uses local parsers and the existing SSH transport; no SolarWinds code/service/license or additional paid service is required. Fixtures in the discovery tests are synthetic examples, not customer data.
