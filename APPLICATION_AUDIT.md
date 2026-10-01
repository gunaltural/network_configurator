# Application review 1 October 2026

Release: 5.14.1. Scope: the eight active Technology Workspaces, supported platform selections,
configuration output, Design Notes, project Save/Open, Verification, Troubleshooting,
manual and SSH inventory, reporting language and Word export. MPLS and Multicast are
existing placeholders outside the eight home-page workspaces.

## Corrected faults

| Area | Finding | Result |
| --- | --- | --- |
| Combined Word export | Validation required upper-N/lower-N IDs and a 32-character technology name, rejecting combined module identities and titles. | Module topology validation accepts combined identities while checking unique device IDs, counts, endpoints and configuration references. |
| Inventory transfer to Word | Transferred records could have a longer UUID and inventory tier that the Word API rejected. | Inventory-only records use an export-compatible tier/index; IDs support transferred records. |
| Combined topology export | Word received only the first topology image. | Every available module topology PNG is retained and rendered under its platform-specific heading. |
| Module state | Counts moved to topology controls were excluded from module capture. Saved projects retained only the current screen. | Topology controls and all configured module states are captured/restored; stale topology controls are removed before rebuilding a module. |
| Project credentials | Verification/Troubleshooting password inputs could enter the project snapshot. | Password inputs are excluded; legacy SSH credential fields are ignored on restore and current password inputs are cleared on project load. |
| Platform selection | EVPN and SD-WAN offered platforms their generators/report adapters do not support; STP offered FortiGate. | Platform menus match existing supported generators. |
| FortiGate connection test | Read-only command execution supported FortiGate but Test Connection used the deployment platform map. | Test Connection uses the live adapter and FortiGate read-only configuration command. |
| Troubleshooting selection | Returning to the tab rebuilt selected commands and undid Clear selection. | Same-context tab switching retains selection and edited commands. |
| Output provenance | An unsuccessful new diagnostic run could leave previous output downloadable. | A new run clears cached diagnostic output and disables its download controls; Verification evidence is invalidated when its output is cleared. |
| Vendor context | Troubleshooting could mix workspace-specific commands with a different device platform. | Workspace baseline commands are omitted when device and workspace platforms differ; explicit device-platform choices survive tab switching. |
| UI metadata | Device-count badges were static/incomplete. | Counts follow the selected module and topology inputs. |
| Imported text | SD-WAN Excel values and BGP dynamic values were inserted into HTML without escaping. | Imported option/summary values and dynamic BGP card values are HTML-escaped. |
| Empty inventory | Both report formats claimed that all model/serial fields were complete when no records existed. | Empty inventory is explicitly unverified and has an explanatory table row. |
| Turkish reporting | Word dates, tier labels and unresolved ports contained English labels. | These generated labels are localized; on-screen Project inventory headers follow the report language. |

## Validation

- All 31 supported module/platform combinations: configuration generation, Design Notes,
  report-device/configuration mapping, Verification picker and Troubleshooting commands.
- Save/Open with four BGP CE routers and a separately edited Arista MLAG module; topology
  counts, dynamic fourth-device fields and module platform survive restoration.
- Clear selection survives Troubleshooting/Verification tab switching.
- Synthetic password markers do not appear in serialized projects; legacy markers are not restored.
- Existing inventory/dialect/Excel/dynamic removal/language regression suite passes.
- Seventeen Python API/import/export tests pass, including a 30-device combined topology,
  transferred inventory IDs, all module images, invalid reference rejection, catalog command
  validation, 101-command input, FortiGate adapter routing and mocked command failure isolation.
- Real generator-produced vPC + System and Management + BGP payload is accepted by Word API.
- A bounded combined Word control document is rendered and visually inspected for headings,
  both topology images, tables, Turkish text and device configuration appendices.
- Real-device SSH and configuration deployment are not claimed as validated: no credentials
  were supplied for this review, and no device configuration is changed by these tests.

## Remaining engineering limitations and development priorities

1. **Design/configuration alignment:** EVPN single-DC currently retains a DC-1/DC-2 generator
   model; its report explicitly warns that ASNs and peer settings require adaptation. The
   illustrative RR is not a generated RR device. These modes require a dedicated topology,
   addressing and peer-plan generator with vendor/release-specific lab tests before treating
   them as deployable designs.
2. **Observed network health:** CLI success/error detection does not establish BGP adjacency,
   vPC consistency, EVPN route import or service reachability. Add parsed observations,
   expected state, pass/fail rules and timestamped evidence tied to the selected device.
3. **Inventory/design identity:** Preserve distinct planned and observed records, then offer
   an explicit engineer-approved mapping. Show model, serial, software, planned role,
   management target and last observation together without silently merging devices.
4. **Report traceability:** Each narrative decision should cite its selected parameters,
   expected forwarding/resilience effect, applicability, official source and evidence.
   Separate planned design, verified state and open acceptance items.
5. **Long-running SSH:** Sequential synchronous command batches can outlast HTTP/service
   timeouts. Introduce background jobs, progress, cancellation and incremental results before
   scaling simultaneous device collections or long command lists.
6. **Project durability:** Browser-local/session data and JSON files are not shared project
   storage. Add versioned project persistence, recovery and project isolation when team use
   is introduced; do not persist SSH passwords as project data.
7. **Maintenance evidence:** Manufacturer document reads provide candidate model mentions,
   not authoritative EOL/EOS or recommended-release confirmation. Keep model/PID, release,
   publication date, source URL and engineer applicability review explicit.
8. **Maintainability:** Split the large HTML/inline-JS files by domain, centralize TR/EN strings
   and report contracts, and run these regression suites in CI before each Render release.

Suggested next increment: design-to-inventory mapping plus structured Verification evidence
in the customer report. It connects the existing modules without changing their configuration
logic. EVPN single-DC/RR generator alignment should be handled as a separate high-priority
engineering increment with vendor-specific test cases.
