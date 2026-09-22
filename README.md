# Network Configurator v5.9.6 — Hosted Zero-Install Direct Deploy

Railway-ready demo build.

## Browser user experience
No local installation is required. Users open the Railway URL and use:
`Test Connection -> Pre-Check -> Deploy Config`.

## Default safety
- Default mode is READ-ONLY (`ENABLE_REAL_DEPLOY=0`).
- Default allowed SSH target:
  `devnetsandboxiosxec9k.cisco.com`
- Arbitrary SSH targets are blocked server-side.
- Credentials are accepted only in the HTTPS request and are not stored by this app.
- `CHANGE_ME_*` placeholders and obvious destructive exec commands block deploy.

## Railway variables
Recommended first deployment:
- `ENABLE_REAL_DEPLOY=0`
- `ALLOWED_TARGETS=devnetsandboxiosxec9k.cisco.com`
- `ALLOW_ANY_TARGET=0`

After Test Connection and Pre-Check are verified, set:
- `ENABLE_REAL_DEPLOY=1`

Only use write mode against a lab/reservation device where configuration changes are permitted.

## Important
A hosted Railway service can SSH only to destinations reachable from Railway's outbound network.
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
- If Cisco:22 and GitHub:22 both fail while 443 succeeds, suspect Railway/shared-cloud egress behavior for TCP/22.
- If GitHub:22 succeeds but Cisco:22 fails, suspect Cisco-side filtering/routing for Railway's source IP range.
- If Cisco:443 also fails, suspect DNS/path/reachability rather than SSH specifically.
