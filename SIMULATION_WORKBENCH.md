# Simulation workbench — 5.42.0

The canvas remains the primary workspace. Failures, Policies and Results open in a dismissible contextual inspector. Device/link selection chooses a control without applying a fault. The original Design SVG geometry and model are retained; camera pan/zoom is applied outside the SVG so reports always receive the full topology.

Compared alternatives: a sticky canvas above a long control page requires nested scrolling; a permanent split consumes diagram width. The contextual inspector preserves the canvas and reserves control space only when needed. Fit accommodates the inspector on desktop; 100% restores the native Design scale. Full screen, keyboard pan, wheel zoom and drag pan are available.

Workflow references (interaction patterns, no added framework dependency):
- Cisco CML workbench: https://developer.cisco.com/docs/modeling-labs/2-8/workbench/
- GNS3 project topology: https://docs.gns3.com/docs-3.1-en/web-ui/project-topology

A failed device is red with a cross and failure label, including in exported snapshots. Restore removes the failure treatment. Load Example has been removed. No real device CLI is executed.

Final-report handoff clears stale imports, retains project identity and existing report content, and carries structured scenarios independently of inventory mappings. Opening the final report captures the current state if it has not already been recorded. Working snapshots are restored only for an identical model in the same project, and Clear records removes that working history. Already attached final-report records remain intact.

Validation: contextual inspector, zoom/camera independence, failure/restoration, snapshot retention/clear and isolation, actual Design-to-Lab-to-Reporting bootstrap, and English/Turkish final Word section plus image generation. Browser geometry/appearance still merits user review on the deployed page; DOM tests do not replace visual review.
