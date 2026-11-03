# AI Engineering Analysis — Phase 1: Knowledge Inventory (initial)

Status: IN PROGRESS. This is an inventory of **repository evidence**, not a claim that the knowledge is already machine-readable or that any AI model can reason over it. Source: main at 2fac2afb66fe2a96928b2dc5f664d07dc63d2d88 (2026-11-03).

## Source families discovered

| Domain | Existing repository sources | Extraction target | Validation needed |
| --- | --- | --- | --- |
| BGP | bgp_diagnostic_rules.py; bgp_route_diagnostic_rules.py; bgp_cli_evidence.py; bgp_route_cli_evidence.py; docs/bgp-troubleshooting-agent-v1.md | FSM, route/policy interpretation, hypotheses and verification | Cross-vendor semantics, operational vs configuration evidence |
| vPC/MLAG | simulation/vendor-failure-engine.mjs; test_vpc_report.cjs; test_mlag_ui.mjs; test_pair_behavior.cjs | Peer-link/keepalive states, topology dependencies, design assumptions | Locate design module source and vendor-specific authoritative references |
| EVPN/VXLAN | tac_overview.py; simulation/test_protocol_report.cjs | VNI/NVE discovery and route-type reasoning | Find full design module and coverage gaps |
| STP | tac_overview.py; test_stp_root_browser.mjs | Root selection, port states and convergence risks | Identify applicable vendor/platform conditions |
| OSPF | tac_overview.py; simulation/test_protocol_report.cjs | Neighbor states, topology and route validation | Find design source and evidence coverage |
| SD-WAN | tac_overview.py; test_sdwan_site.cjs; test_sdwan_bulk.py | SLA/member/path policies and observations | Distinguish probes from actual application path |
| Management/security | tac_overview.py; test_management_composition.cjs | Management access, ACL, logging and baseline security | Evidence-based checks; avoid assuming exposure from configuration alone |
| Show-tech/evidence | show-analysis.js; analysis-ui.js; tac_overview.py; cross_domain_evidence.py; test_show_analysis_large_capture.cjs | All-block extraction, per-device evidence IDs, cross-block correlation | Remove 10-block analysis limitation; ensure full-config command variants |
| AI integration | engineering_ai.py; engineering-ai.js; test_engineering_ai.py | Model-provider boundary, retrieval interface and grounded output schema | Confirm model availability; avoid presenting deterministic rules as AI |

## Proposed knowledge contract (to validate, not yet implemented)

A knowledge item records: technology; vendor/platform/version applicability; design intent; dependencies; expected behavior; failure modes; evidence requirements; counterevidence; verification commands; source URI/version; and confidence/limitations. Knowledge items must not encode a finding merely because a CLI token is absent. The reasoning model retrieves applicable items, forms hypotheses and cites observed evidence; a separate validator checks evidence IDs and source provenance.

## Phase 1 acceptance gate

- [ ] Identify exact design/configuration/simulation source for every supported module and vendor.
- [ ] Map module capabilities to knowledge concepts, not one rule per command.
- [ ] Mark source provenance and platform applicability for each extracted concept.
- [ ] Review gaps with test coverage; publish machine-readable catalog and validation tests.

## Coordination

Work only in feature/ai-knowledge-catalog-phase1; do not modify main or PR #56. Keep daily Network Configurator maintenance independent. No merge or production deployment without regression and review.
