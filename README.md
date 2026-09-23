# Network Configurator v5.9.7 — Hosted Read-Only Live CLI

Render Web Service deployment using the repository's Dockerfile.

## Browser user experience
No local installation is required. Users open the Render service URL and use:
`Test Connection -> Pre-Check` and `Live CLI -> Run Command -> Copy Output / Download TXT`.

Live CLI uses the same sandbox SSH details entered in Deploy Config. The server accepts only
the fixed Cisco IOS-XE show command list, runs one command over SSH, and returns its raw
output (up to 1 MB). Passwords are used for the request and are not saved in a project.
The endpoint is `POST /api/device/show` and validates the target allowlist independently.

## Default safety
- Default mode is READ-ONLY (`ENABLE_REAL_DEPLOY=0`).
- Default allowed SSH target:
  `devnetsandboxiosxec9k.cisco.com`
- Arbitrary SSH targets are blocked server-side.
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
