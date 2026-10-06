# Path Diagnostics — first draft (5.20.0)

Open a Technology Workspace, choose **Troubleshooting**, and expand **Path Diagnostics** near the top. This is a flow-evidence workflow inspired by Cisco NWPI, not a connected NWPI implementation.

1. Start a flow case. Enter source, destination, protocol/ports, VRF/VPN, incident time/timezone and application symptom.
2. Refresh planned connections to view current workspace design intent, including device names, ports and rates where modeled. This does not infer the forwarding path of the entered flow.
3. Add hop observations. Record device, interface, next hop, time and supporting evidence. Mark knowledge as Not collected, Inferred, Observed or Conflicting. The sequence shows engineer-entered ordering, not automatically correlated telemetry.
4. Select/edit commands in the existing Recommended diagnostic commands list and click **Add selected diagnostic commands**. Each command has a separate editable output. Manual command evidence can also be added without SSH or a lab.
5. Optionally use the existing Test Connection / Run Selected Commands controls and attach the latest results. SSH remains subject to the existing read-only policy. No ping, traceroute, packet capture or controller trace is launched by this draft.
6. Record findings. Download a TXT case summary or JSON case. Normal project Save, Download and revision handling preserve the case; opening another project clears or restores its own case.

Repeated live attachment does not duplicate identical captures or overwrite manually entered evidence. Live results from another module/platform cannot be attached to an existing case. A case retains its original technology/platform when navigating other modules; reset explicitly to start another case. New live runs clear the previous attachable result before execution, and opening a project also clears transient live results. Failed commands and mock outputs retain their labels. Missing outputs are not successful tests.

## Current boundaries

One flow case per project, with up to 100 hop observations and 100 command evidence entries. No automatic flow-to-CLI correlation, route parser, performance score, loss/jitter/latency measurements, controller API, NWPI archive importer or multi-case history is included. Evidence is project data; SSH credentials are not added to the case. The ordinary project download therefore includes manually entered CLI evidence and should be handled accordingly.

The draft exports its own summary. Automatic inclusion in the customer Design and Reporting PDF/Word is deferred until the evidence model is reviewed; existing reporting is preserved.

Research and next phases: [NWPI research](NWPI_RESEARCH_2026-10-06.md).
