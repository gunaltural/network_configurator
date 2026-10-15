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

Execution evidence stays in this workspace/export, separate from customer design
reports in this first release. No project library or inventory data is modified.

## Validation

`AUTH_ENABLED=0 python -m unittest test_network_lab`
`node test_network_lab.cjs` (jsdom required)

These cover address/pilot validation, real API ZIP generation, stable identity,
fault cleanup after collection errors, menu integration and BGP data transfer.
Actual Docker execution must be acceptance-tested on the operator's lab host.

References:
- https://containerlab.dev/manual/kinds/frr/
- https://developer.cisco.com/docs/modeling-labs/
