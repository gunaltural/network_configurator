# Network Configurator v5.10.0 — Multi-Vendor Read-Only Live CLI and Reporting

Render Web Service deployment using the repository's Dockerfile.

System and Management generates a baseline for one managed device. Its parameters,
topology and configuration output contain one device block.

## Reporting and Documentation (first version)
Open **Reporting and Documentation** from the home page or `/reporting`. It is a separate
greenfield design workspace. Select the primary vendor/platform first, then the topology
(Spine–Leaf or Core–Access), device counts, and planned technology. Device cards and an
editable connection schedule follow the topology. Each card has a per-device vendor,
hostname, optional management address, product model and serial number. Model and serial
can be entered manually before deployment, or read from a reachable device afterward.

**Read from device** runs platform-specific read-only SSH commands and records the
hardware source. It never changes device configuration and never saves SSH passwords
or enable secrets in the project or report. The target must be reachable from Render
and satisfy the same address policy as Live CLI. A device with an unassigned model or
serial remains explicitly marked **Awaiting assignment**; modules are not mistaken for
the chassis. The report preview contains the planned topology, connection table,
technology summary, inventory and outstanding items. Use **Print / Save PDF** in the
browser to export the report; **Download project** / **Open project** save and restore
the editable design as JSON. This first version documents design intent and optional
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
