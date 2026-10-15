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

## Synthetic BGP analysis (5.39.0)

The primary workflow now runs a deterministic browser-based model with no lab host.
`synthetic-bgp.js` calculates candidate exits for the shared test prefix; it ranks
Local Preference first, then direct eBGP over a path through the other CE, then uses
connection ID as a deterministic final tie-break. That final choice is a visualization
rule and is NOT a complete vendor BGP best-path implementation. CE interconnect is
assumed to provide usable iBGP/next-hop transport. No recursive RIB/FIB is computed.

The UI can disable/restore links, fail/restore devices, reset all faults, compare
baseline/current routes and animate the selected path on the original design SVG.
Animations are symbolic; speed, convergence, packet loss and traffic volumes are
not measured. Model queries and familiar show-command aliases are explicitly marked
synthetic. Configuration commands are not executed or validated by this model.
Record a scenario to include it in report evidence with needs-review status and a
synthetic-model label. Real FRR/CML integration remains optional and separate.

BGP physical links use distinct, symmetric attachment points, short vertical exits,
separate curved lanes and light crossing halos to prevent apparent shared junctions.
This common drawing is carried into simulation. Topology/hostname/IP visibility
controls and original generated vendor configurations are preserved.

Validation: `node test_synthetic_bgp.cjs` covers Local Preference, alternate CE,
upstream/device loss, complete isolation, recovery, graph state and recorded evidence.


## 5.40.1 — topology-first simulation and directional policies

- Topology and all editable controls share one viewport: a resizable topology pane on the left and an independently scrolling control pane on the right. Narrow displays use vertically stacked panes. The separator supports pointer dragging and keyboard arrows / Home. Fault scenarios, traffic engineering and scenario records follow in the control pane. The active UI contains only topology, fault controls, inbound/outbound traffic policies, baseline/current path comparison and scenario recording/report transfer. Model queries, raw JSON, advanced lab editing, real CLI and offline runtime controls are hidden for future development. Real runtime, device CLI and offline host menus are removed from the active UI; backend runtime support is retained for future work. The synthetic page no longer probes or automatically prepares a real runtime.
- Outbound what-if Local Preference and inbound per-circuit AS-path prepend (0–10 extra customer-AS copies) use explicit Apply / Restore controls. Values are validated atomically. These policies do not mutate the source design or generated CLI; recorded scenarios include the exact applied overrides and direction.
- Inbound selects an existing CE prefix owner and evaluates each directly connected ISP independently, assuming equal provider Local Preference/weight/filter policy. The alternate CE can advertise the owner prefix only while its interconnect and owner remain available. Shorter AS paths win; ties use connection ID for deterministic illustration, not a complete vendor tie-break. No inter-ISP or Internet-wide path is invented. External provider policy may override prepend.
- Baseline paths retain design policies; current paths include applied policies and faults. ISP-to-CE animation reverses the outbound direction. Scenario records appear immediately and retain explicit synthetic review status in reports.
- The BGP design adds a reversible Client LAN & Internet context display. The exact SVG is reused in the simulator; standalone examples use the same context renderer. Internet transit, client forwarding and VRRP election are not simulated. The two-CE shared LAN is labeled a VRRP gateway concept; no VRRP configuration is generated. This context does not add device inventory, circuit counts or configuration lines.
- Tests cover inbound prepend, outbound independence, per-ISP scope, prefix-owner and interconnect failures, invalid input rejection, policy reset, visible records, source design preservation, hidden future runtime controls and exact design topology transfer.
- Technical reference: Cisco, Connecting to a Service Provider Using External BGP, Local Preference / Influencing Inbound Path Selection by Modifying AS_PATH: https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/ip-routing/b-ip-routing/m_irg-external-sp-0.html


## 5.41.0 — full-width sticky topology, endpoint flows, VRRP and scenario reports

- Simulation uses one full-width topology above the controls. The topology stays sticky while engineers scroll through fault controls, policies and recorded scenarios; the side-by-side splitter is removed.
- Complete animated paths now include Client → shared LAN → active VRRP CE → BGP exit → ISP → Internet, and Internet → selected ISP → BGP entry CE → shared LAN → Client. Shared LAN/cloud SVG segments have stable identifiers; original design device/circuit geometry remains intact.
- The operator selects the preferred synthetic VRRP active CE. A healthy preferred CE is active; device failure promotes the healthy backup, and restoration preempts back. WAN loss alone does not change VRRP roles. Both CE failures leave no client gateway. No real VRRP timers, priorities, LAN faults, tracking or configuration are generated.
- Both CEs are assumed directly attached to the selected shared client LAN and advertise its prefix. Inbound BGP may enter the VRRP backup CE and reach the LAN without using the CE interconnect. The cloud is a selected-ISP boundary, not simulated provider transit or an Internet-wide route calculation. Existing per-CE/prefix-owner engine outputs remain available for compatibility; the UI uses the new end-to-end client flows.
- Record scenario is visible above the topology. Each immutable snapshot stores direction, client prefix, preferred/active/backup VRRP, failed devices/links, no-fault baseline and current path, exact policies and a static topology SVG. Up to 40 scenario records are retained per active lab model.
- Simulation report offers independent PDF print preview and Word download, with EN/TR language selection. Browser rasterization supplies PNG snapshots to the bounded Word API; duplicate XML namespace serialization was corrected and static styles are materialized for portable images.
- Open final report automatically attaches recorded scenarios; Add scenarios to report remains available in the records section. Source-model identity is checked, records are deduplicated by ID, and unrelated existing report content is retained. Structured scenarios render in a dedicated EN/TR section in HTML/PDF and Word rather than being added as raw verification CLI output.
- New routes: `/simulation-report.js`, `/api/network-lab/simulation-word`. Shared typed scenario schemas and document rendering are in `simulation_report.py`; frontend report presentation is in `simulation-report.js`. No external services or paid infrastructure added.
- Tests cover complete path segments, VRRP choice/failure/restoration, no WAN-tracking behavior, total isolation, backup-CE inbound forwarding, immutable snapshots, valid SVG XML, PDF preview, Word UI payload, idempotent final report attachment, EN/TR standalone Word/image generation, EN/TR final Word sections, malformed input and image rejection, plus existing 32 module/platform and reporting regressions.
- VRRP reference: RFC 9568, https://www.rfc-editor.org/rfc/rfc9568.html .
