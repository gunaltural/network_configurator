# Network Configurator v5.14.1 — Technology Workspaces and Maintenance Reporting

Render Web Service deployment using the repository's Dockerfile.

System and Management generates a baseline for one managed device. Its parameters,
topology and configuration output contain one device block.

## Maintenance and Reporting
Open **Maintenance and Reporting** from the home page or `/reporting`. The workspace
action imports designs from System and Management, BGP, OSPF, STP, vPC / MLAG /
M-LAG / StackWise Virtual, EVPN / VXLAN, QoS and Cisco cEdge SD-WAN. It carries
the active topology, real device names and configured ports, engineering explanations for selected parameters,
and each configuration the module actually generates. BGP ISP peers appear as
external endpoints without generated ISP configurations. A single-device module
reports one device; the other sites drawn in SD-WAN are illustrative, so only
the selected cEdge is inventoried. The report describes a planned design.
SVG topology drawings are captured from the active Technology Workspace, so their
device labels and technology-specific paths appear in the report preview, printed PDF,
and Word download. SD-WAN's HTML topology is represented by a report SVG of the
selected edge, controllers and two WAN transports. The drawings use a light palette for readability on
white paper; the interactive workspace retains its original colors. Use the prominent
**Maintenance and Reporting** action in the workspace
header or at the end of the parameters to open the report after designing
any supported module; the home-page card remains
available. Reopen the report from the workspace after changing the drawing.
In a StackWise Virtual pair the chassis share one logical configuration; both inventory
records say so explicitly. Huawei M-LAG leaf physical uplink ports remain unassigned
until the engineer identifies them.

The imported topology and platform are read-only in the report; edit them in
Technology Workspaces and reopen Maintenance and Reporting to refresh. Existing
inventory, scope and documentation-only link details are retained for the same project
in the browser session. MPLS and Multicast modules are placeholders and have no
generated device configuration to document. Standalone reports start with a project name, primary vendor,
architecture, device counts and planned technology.
The design report uses Technology Workspaces for topology, engineering choices and generated
configuration. Observed inventory comes only from the Inventory tab. The on-screen
Project inventory table and report use the same current record set; planned devices
are not automatically reported as collected inventory.

The Maintenance and Reporting **Inventory** tab provides a manual table for observed
hostname, serial number, software version and product model. Upload an `.xlsx` file
using the downloadable template; the first worksheet is imported directly. Existing
devices are updated by Device ID or unique hostname, and new devices are added to
inventory automatically. No second device selection or Apply action is needed.
Duplicate identities reject the import before changing data. New imports replace the current visible batch; blank values remain empty, and planned
topology names stay unchanged. Formula cells are rejected; use text values, especially
for serial numbers with leading zeros. Maximum upload size is 5 MB / 1,000 records.

Use **Add device** in manual or Automatic SSH mode to add any number of inventory
records. Additional inventory devices appear in reporting and maintenance without
changing Technology Workspace topology, links or generated configurations. Inventory
is retained across page refreshes in the current browser tab and in downloaded projects.

Choose **Automatic · SSH · multiple devices** to select inventory devices and supply
each target, port and username. A shared password and enable secret may be used, with
per-device overrides. Collection runs sequentially with separate results; a failure
does not stop remaining devices. Only the latest successful collection enters the report; missing fields remain empty.
Passwords and enable secrets are cleared after collection and never saved with the
project. The tab collects selected inventory targets; it does not discover neighbors.

Manual and Automatic SSH inventories have separate device lists. Automatic SSH provides
**Download SSH Excel template** and **Upload SSH targets**. The template contains only
SSH Target, Port (default 22), Username and Password; devices use the project platform.
Uploading shows only the uploaded targets, selected for collection, without starting SSH.
Choose **Connect selected devices** to collect inventory. Each row reports connection
success or failure and any collection error. Uploaded passwords are kept temporarily
on the page, cleared after collection and excluded from saved projects and reports.
Hostname, serial, software and model appear in **Collected inventory** and the report.
A new upload replaces the visible list and report inventory. Previous inventory is excluded; blank cells remain empty.

**Read from device** runs platform-specific read-only SSH commands and records the
hardware source. It never changes device configuration and never saves SSH passwords
or enable secrets in the project or report. The target must be reachable from Render
and satisfy the same address policy as Live CLI. A device with an unassigned model or
serial remains explicitly marked **Awaiting assignment**; modules are not mistaken for
the chassis. The report preview contains the planned topology with port labels on smaller
topologies, a device-to-port connection schedule, technology-specific decisions and expected effects, inventory,
special connections, per-device configuration appendices, and outstanding items. Use
**Print / Save PDF** in the browser or **Download Word** for an
editable DOCX report. **Download project** / **Open project** save and restore
the editable design as JSON. The report documents design intent and optional
inventory verification; it does not crawl neighbors or claim operational validation.

## Verification and Troubleshooting
No local installation is required. The Verification and Troubleshooting tabs expose
the read-only SSH engine; there is no separate Live CLI tab. Connection details can
be shared with Deploy Config. Use **Test Connection** before running selected commands.

Verification combines module-specific checks with the selected platform catalog,
groups commands by purpose and provides a scrollable picker. Each command is editable;
a user-defined command appears first. Only checked commands run. Clear selection and
custom edits are retained when switching output tabs without changing the module or platform.
Troubleshooting adds symptom-specific commands and the latest matching Verification evidence.
A failed new run cannot leave an older output enabled for download.

The engine supports Cisco IOS-XE, Cisco NX-OS, Arista EOS, Huawei CloudEngine and FortiGate.
It accepts platform-specific read-only commands and approved output filters. Configuration
mode, command chaining, redirects and shell operators are rejected. Commands execute
sequentially in one SSH session, with per-command results and failure isolation. Combined
output is capped at 1 MB and input at 128 KiB; there is no fixed command-count limit.
Command success indicates execution, not proof that the network meets its design requirements.
`GET /api/device/commands` returns the catalog and `POST /api/device/show` runs selected commands.

## Project files and combined reports
Save/Open preserves configured module states, including topology count controls and SD-WAN
parameters. SSH passwords and enable secrets are excluded from project snapshots and are
not restored from older files. A combined report preserves module platforms, device references,
engineering explanations and merged device configuration. Word output includes each available
module topology image, together with the current inventory. Project brief samples follow the
selected Turkish/English report language; engineer-edited text is preserved verbatim.

EVPN platform choices are Cisco NX-OS, Arista EOS and Huawei CloudEngine. SD-WAN generates
Cisco IOS-XE cEdge configuration only. STP excludes FortiGate from the design platform menu.

## Regression checks
Install development dependencies and run:

```sh
python -m pip install -r requirements-dev.txt
npm install
python -m unittest test_inventory_excel.py test_application_audit.py
npm test
```

The source DOM suite checks all 31 supported module/platform pairs, configuration and report
coverage, command selection, module state restoration and credential exclusion. Backend tests
cover inventory Excel, combined Word topology integrity, module images and mocked read-only SSH.
No regression test contacts or configures a real device. See `APPLICATION_AUDIT.md` for the
review scope, corrected faults and remaining engineering validation limits.

## Default safety
- Default mode is READ-ONLY (`ENABLE_REAL_DEPLOY=0`).
- Enter a publicly routable hostname or IP for any supported vendor; no per-device
  Render setting is needed. SSH connects to the resolved address selected by the server.
- Private, loopback, link-local, and reserved addresses require an explicit exception in
  `ALLOWED_TARGETS`; the default list includes the Cisco DevNet sandbox for continuity.
- `ALLOW_ANY_TARGET=1` overrides the address policy for an isolated, trusted deployment.
- The selected device still must be reachable from the server over its SSH port.
- Credentials are accepted only in the HTTPS request and are not stored by this app.
- `CHANGE_ME_*` placeholders and obvious destructive exec commands block deploy.

## Render deployment
Connect this GitHub repository to a Render Web Service and select the Docker runtime.
The Dockerfile starts the FastAPI server on `PORT` (default `10000`) and binds to
`0.0.0.0`; set the health check path to `/api/health`.

Set these environment variables in Render:
- `ENABLE_REAL_DEPLOY=0`
- `ALLOWED_TARGETS=devnetsandboxiosxec9k.cisco.com` (optional additional exceptions)
- `ALLOW_ANY_TARGET=0` (keep the default on a public service)

Leave `ENABLE_REAL_DEPLOY=0` for read-only access to any reachable vendor device.

## Important
A hosted Render service can SSH only to destinations reachable from Render's outbound network.
Private corporate management IPs will require an internal/on-prem hosted instance or another private connectivity design.


## Network diagnostic endpoint

Open:

`/api/diagnostics/network?target=DEVICE_HOST&port=22`

This performs only DNS resolution and raw TCP connect tests. It does not send credentials,
does not log in to an SSH server, and does not change any device configuration.

The endpoint tests the user-selected device and port, subject to the same address policy
as Live CLI. A failed TCP probe indicates that Render cannot reach that device and port.


### v5.15.0 — EVPN, SSH collection and shared report language

- Removed optional design–inventory assignment UI. Inventory remains independent of the Technology Workspace topology and generated configurations.
- Single-DC EVPN uses one overlay ASN and full-mesh iBGP between four VTEPs. The two-DC RR model uses one shared overlay ASN, two explicit control-plane-only RRs, four clients and six device configurations. Physical underlay/DCI ports are intentionally not inferred.
- Automatic inventory collection uses bounded background jobs with per-device results, progress, cancellation and failed/cancelled-only retries. Cancellation takes effect after the current SSH operation returns; it cannot instantly interrupt an in-progress SSH read. Job IDs are opaque capabilities, kept only in the active page; passwords are not returned or saved and are cleared after collection. Jobs expire after 15 minutes and are lost on service restart; retry from the page in that case. This implementation assumes one application process.
- Reports and Design Notes share `engineering-locale.js`. Language selection applies to documentation only; parameter labels and CLI syntax remain unchanged. Engineer-written project fields are preserved.
- Regression tests use synthetic output and mocked SSH; real-device/platform validation is still required.

EVPN references: [Cisco NX-OS guide](https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/105x/configuration/vxlan/cisco-nexus-9000-series-nx-os-vxlan-configuration-guide-release-105x/m_configuring_vxlan_bgp_evpn.html), [Arista EVPN guide](https://www.arista.com/en/um-eos/eos-configuring-evpn?searchword=eos+29+2+configuring+bgp), [Huawei CloudEngine distributed-gateway example](https://support.huawei.com/enterprise/en/doc/EDOC1000039339/5e782f6/example-for-configuring-nfvi-distributed-gateways-symmetric-mode).

### v5.16.0 — Verification evidence, first stage
Verification can explicitly save the latest run or accept pasted/TXT output (1 MB file limit, 40,000 characters per record). Each record includes module/platform, target, capture time, pre-check/post-check/diagnostic stage, expected result and engineer assessment. Up to 12 records are retained in project Save/Open and transferred to HTML/PDF and Word reports, including combined modules. Records are filtered to the selected module/platform and removable. Live, mock and manually supplied output remain distinct; execution success does not imply network health or acceptance. Supplied logs are timestamped when added, not at their original device observation. Known SSH credentials and common secret-bearing lines are redacted; engineers must review logs for other sensitive information before saving. No command-output parsing or automatic technical verdict is claimed in this stage.
