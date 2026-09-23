# Network Configurator v5.9.9 — Multi-Vendor Read-Only Live CLI

Render Web Service deployment using the repository's Dockerfile.

## Browser user experience
No local installation is required. Users open the Render service URL and use:
`Test Connection -> Pre-Check` and `Live CLI -> Run Command -> Copy Output / Download TXT`.

Live CLI supports Cisco IOS-XE, Cisco NX-OS, Arista EOS, Huawei CloudEngine (VRP 8), and
FortiGate. Choose the platform and a command from the grouped catalog, or choose the first
option, **User-defined command**, to enter multiple read-only commands, one per line.
The server accepts `show` on Cisco and Arista, `display` on Huawei, and `show` / `get`
on FortiGate. It also accepts the built-in FortiGate diagnostic commands and common
read-only output filters such as `| include` and `| grep`. Commands run in order over
one SSH session. Configuration commands, redirects, other pipe actions, shell operators,
and command chaining are rejected. Combined output is capped at 1 MB, and the input
at 128 KiB; there is no fixed command-count limit. Exact command availability varies
by model, feature set, and operating system release.

Live CLI uses the same SSH details entered in Deploy Config. Passwords are used for the
request and are not saved in a project. `GET /api/device/commands` supplies the catalog;
`POST /api/device/show` executes one validated command and checks the target allowlist.

## Default safety
- Default mode is READ-ONLY (`ENABLE_REAL_DEPLOY=0`).
- Default allowed SSH target:
  `devnetsandboxiosxec9k.cisco.com`
- Arbitrary SSH targets are blocked server-side.
- To use non-sandbox vendors, add their specific hostnames or IP addresses to Render's
  `ALLOWED_TARGETS` list. The Live CLI platform menu does not grant network access.
- Credentials are accepted only in the HTTPS request and are not stored by this app.
- `CHANGE_ME_*` placeholders and obvious destructive exec commands block deploy.

## Render deployment
Connect this GitHub repository to a Render Web Service and select the Docker runtime.
The Dockerfile starts the FastAPI server on `PORT` (default `10000`) and binds to
`0.0.0.0`; set the health check path to `/api/health`.

Set these environment variables in Render:
- `ENABLE_REAL_DEPLOY=0`
- `ALLOWED_TARGETS=devnetsandboxiosxec9k.cisco.com`
- `ALLOW_ANY_TARGET=0`

Leave `ENABLE_REAL_DEPLOY=0` for read-only sandbox access.

## Important
A hosted Render service can SSH only to destinations reachable from Render's outbound network.
Private corporate management IPs will require an internal/on-prem hosted instance or another private connectivity design.


## Network diagnostic endpoint

Open:

`/api/diagnostics/network`

This performs only DNS resolution and raw TCP connect tests. It does not send credentials,
does not log in to an SSH server, and does not change any device configuration.

The endpoint tests:
- Cisco DevNet C9K sandbox TCP/22
- Cisco DevNet C9K sandbox TCP/443
- GitHub TCP/22
- GitHub TCP/443
- ssh.github.com TCP/443

Interpretation:
- If Cisco:22 and GitHub:22 both fail while 443 succeeds, suspect hosted-network egress behavior for TCP/22.
- If GitHub:22 succeeds but Cisco:22 fails, suspect Cisco-side filtering/routing for the service's outbound IP range.
- If Cisco:443 also fails, suspect DNS/path/reachability rather than SSH specifically.
