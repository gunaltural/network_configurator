# Network Configurator v5.11.0 — Selective Verification, Live CLI, and Reporting

Render Web Service deployment using the repository's Dockerfile.

System and Management generates a baseline for one managed device. Its parameters,
topology and configuration output contain one device block.

## Reporting and Inventory
Open **Reporting and Inventory** from the home page or `/reporting`. The workspace
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
**Reporting and Inventory** action in the workspace
header or at the end of the parameters to open the report after designing
any supported module; the home-page card remains
available. Reopen the report from the workspace after changing the drawing.
In a StackWise Virtual pair the chassis share one logical configuration; both inventory
records say so explicitly. Huawei M-LAG leaf physical uplink ports remain unassigned
until the engineer identifies them.

The imported topology and platform are read-only in the report; edit them in
Technology Workspaces and reopen Reporting and Inventory to refresh. Existing
inventory, scope and documentation-only link details are retained for the same project
in the browser session. MPLS and Multicast modules are placeholders and have no
generated device configuration to document. Standalone reports start with a project name, primary vendor,
architecture, device counts and planned technology.
Device cards and an editable connection schedule follow the topology. Each card has a
hostname, optional management address, product model and serial number. Model and serial
can be entered manually before deployment, or read from a reachable device afterward.

The Maintenance and Reporting **Inventory** tab provides a manual table for observed
hostname, serial number, software version and product model. Upload an `.xlsx` file
using the downloadable template; the first worksheet is matched by Device ID or a
unique existing hostname. Review the preview before applying matched rows. Duplicate
or unmatched rows are skipped, blank values retain existing inventory, and planned
topology names stay unchanged. Formula cells are rejected; use text values, especially
for serial numbers with leading zeros. Maximum upload size is 5 MB / 1,000 records.

Choose **Automatic · SSH · multiple devices** to select inventory devices and supply
each target, port and username. A shared password and enable secret may be used, with
per-device overrides. Collection runs sequentially with separate results; a failure
does not stop remaining devices. Missing returned fields retain previous values.
Passwords and enable secrets are cleared after collection and never saved with the
project. The tab collects existing planned devices; it does not discover neighbors.

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

## Browser user experience
No local installation is required. Users open the Render service URL and use:
`Test Connection -> Pre-Check` and `Live CLI -> Run Command -> Copy Output / Download TXT`.

Live CLI supports Cisco IOS-XE, Cisco NX-OS, Arista EOS, Huawei CloudEngine (VRP 8), and
FortiGate. Choose the platform and a command from the grouped catalog, or choose the first
option, **User-defined command**, to enter multiple read-only commands, one per line.
Live CLI starts with the platform selected in the workspace and refreshes its command
menu when that selection changes. The device platform can also be chosen separately
inside Live CLI. Huawei uses `display` commands, while Arista EOS offers its own
MLAG, VXLAN, and BGP EVPN commands. Some options depend on the device's features,
DFS group/node IDs, and software release.
The server accepts `show` on Cisco and Arista, `display` on Huawei, and `show` / `get`
on FortiGate. It also accepts the built-in FortiGate diagnostic commands and common
read-only output filters such as `| include` and `| grep`. Commands run in order over
one SSH session. Configuration commands, redirects, other pipe actions, shell operators,
and command chaining are rejected. Combined output is capped at 1 MB, and the input
at 128 KiB; there is no fixed command-count limit. Exact command availability varies
by model, feature set, and operating system release.

Live CLI uses the same SSH details entered in Deploy Config. Passwords are used for the
request and are not saved in a project. `GET /api/device/commands` supplies the catalog;
`POST /api/device/show` executes the validated command list against the address entered by the user.

The **Verification** tab uses the same read-only Live CLI engine. It combines the active
Technology Workspace's context-aware post-checks with the selected vendor's wider command
catalog, removes duplicates, and groups checks by purpose (system health, physical links,
Layer 2, protocol adjacencies, routing/forwarding, overlay, redundancy, QoS, and configuration
evidence). Engineers can select recommended checks, an entire category, all commands, or any
individual commands. Only checked commands are sent, in order, over one SSH session. Results
can be copied or downloaded as a text evidence file; a command error does not stop the remaining
selected read-only checks.

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
