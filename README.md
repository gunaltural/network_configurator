# Network Configurator v5.9.5 — Hosted Zero-Install Direct Deploy

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
