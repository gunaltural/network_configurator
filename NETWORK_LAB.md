# Network Lab & Simulation — first release

Entry: Implementation & Validation → Network Lab & Simulation, `/network-lab`.

The web application builds a portable FRR/Containerlab pilot package. It does not
run containers on Render or claim production digital-twin fidelity. No paid service
is required by this integration. The operator provides an isolated Linux lab host
with Docker, Containerlab and access to the selected FRR image.

## Workflow

1. Open a BGP workspace with two CE routers, two upstreams and four external
   connections, then use the Network Lab menu. Click **Use BGP workspace design**.
   Alternatively load the example. Other designs are explicitly rejected, not truncated.
2. Review editable router names, AS numbers, advertised prefixes and link Local
   Preference; select the fault link. Link addresses are editable under Advanced.
3. Validate and download the ZIP. Extract it on the Linux lab host.
4. Run `sudo python3 runner.py start`, `baseline`, `fail`, then `stop`.
5. Upload `results.json`. The current model fingerprint must match. Inspect checks
   and raw CLI evidence. Download a JSON evidence report or print/save PDF.

The failure action requires a passing baseline, checks established peer counts,
best-path Local Preference and loopback-sourced ICMP reachability, and restores the
fault interface in a finally block. Manual `restore` handles host/process interruption.
Snapshots include observation timestamps and raw routing/BGP/ICMP output.

## Fidelity

Imports AS, local advertised prefixes, external link IPv4 addresses and Local
Preference. The upstreams advertise an explicitly synthetic shared test prefix.
Optional CE interconnect becomes direct iBGP with next-hop-self; original loopback
peering, router IDs and production interface names are not reproduced. FRR syntax
is generated independently. BFD, filters, prepend, MED, communities, maximum-prefix,
VRF and authentication are not imported. Do not treat passing tests as acceptance
of the original vendor configuration. ASIC behavior, line rate and production
convergence timing are not measured. Imported evidence is user-supplied, not signed.

Execution evidence can be explicitly attached to the linked design report as
FRR simulation evidence requiring engineer review. Inventory data is not modified.

## Validation

`AUTH_ENABLED=0 python -m unittest test_network_lab`
`node test_network_lab.cjs` (jsdom required)

These cover address/pilot validation, real API ZIP generation, stable identity,
fault cleanup after collection errors, menu integration and BGP data transfer.
Actual Docker execution must be acceptance-tested on the operator's lab host.

References:
- https://containerlab.dev/manual/kinds/frr/
- https://developer.cisco.com/docs/modeling-labs/

## Central service workspace preview (5.36.0)

Primary workflow now presents central service status, lab preparation, clickable
device selection, a planned FRR configuration pane, live-console panel, selectable
verification checks and fault controls. `/api/network-lab/preview` validates and
generates planned configuration without deployment. Model edits invalidate it.
The central service is not provisioned or connected: start/stop, console, commands
and failure execution remain disabled. No emulated runtime results are fabricated.
Offline package generation is retained under Advanced for administrator use.

## Central command runtime (5.37.0)

BGP topology now offers **Test in Simulation**, transferring the supported protocol
subset directly into lab preparation. The app gateway supports service health,
start, stop, active-lab recovery, FRR command batches and fault-link up/down.

The separate `lab_service.py` is a deployable FastAPI service for a dedicated Linux
host with Docker/Containerlab; it is NOT started by the Render application.
Install the repository dependencies and run, for example:

```
export LAB_SERVICE_TOKEN='<a random secret of at least 32 characters>'
export LAB_DATA_DIR='/var/lib/network-configurator/labs'
uvicorn lab_service:service --host 127.0.0.1 --port 8091
```

Use a TLS reverse proxy or private connection for the service. Configure
`LAB_SERVICE_URL` and the same `LAB_SERVICE_TOKEN` on the web application. Service
credentials stay on the server. The service must have Docker/Containerlab permissions.
Use the current single-account web authentication only for trusted pilot users;
per-person accounts and broader multitenant hardening remain future work.

Defaults: two active labs maximum, one per account; four FRR nodes per lab, 256 MiB
and one CPU per node. Failed deployments remain recoverable through service check
and stop. Stop labs explicitly; automatic idle cleanup is not implemented yet.
The reviewed FRR image is enforced by the service. Other images are rejected.

The console executes one or more FRR `vtysh -c` commands on the selected running
container and returns actual stdout/stderr, exit status and observation time. Enter
sends a batch; Shift+Enter adds a command. For configuration, include `configure
terminal`, context and commands in the same submission. Context does not persist
between submissions. This is NOT an interactive TTY and has no Tab completion.
Recorded command evidence can be exported independently of offline runner results.

Tests mock the Docker/Containerlab process boundary to verify API, ownership,
lifecycle, command routing and fault controls. An actual host acceptance test is
still required. No central host is configured in the current Render deployment.

## Design/reporting continuity (5.38.0)

The BGP simulation action remains visible in a fixed bottom bar; the diagram no
longer sticks over it. Entering simulation checkpoints the full design and its
report/topology context. Back to design resumes that checkpoint. Continue to
reporting retains the current project report when one exists. Explicit evidence
transfer maps uniquely named configured devices, rejects a changed lab model,
deduplicates submissions and labels them FRR simulation / needs review. Existing
verification evidence is retained. Original vendor configurations are unchanged.
