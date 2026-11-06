# Cisco BGP — Scratch Network LM curriculum (isolated experiment)

**Scope is intentionally narrow: Cisco IOS / IOS-XE IPv4-unicast BGP.** This folder is independent from the deployed Network Configurator, AI Analysis, Design, Simulation and Render. It uses only a new, randomly initialized causal Transformer and original authored *synthetic* CLI text. No customer TAC data, downloaded pretrained weights, vendor document text dumps or live systems.

## Why Cisco BGP instead of spreading training across every technology?

We need a measurable learning sequence, not repeated memorization over 16 shallow classes. Cisco BGP has a particularly clear operational state machine, well-documented `show ip bgp summary` fields, and subtle evidence boundaries that matter to network engineering. We begin with recognizing eight *observational* categories, then add corroboration and genuinely new phrasing before any narrative generation or multi-technology scope.

| Status category | Observation only | What it does **not** prove |
| --- | --- | --- |
| IDLE_ADMIN | Explicit `Idle (Admin)` indication | Unexpected outage, TCP fault |
| IDLE | Not established; no admin indicator | Specific transport/config failure |
| CONNECT | Session negotiating establishment | Exact cause of uncompleted TCP |
| ACTIVE | TCP establishment retry state | Firewall/ACL as confirmed cause |
| OPENSENT | OPEN exchange in progress | Established peering |
| OPENCONFIRM | Keepalive confirmation pending | Confirmed mismatch or root cause |
| ESTABLISHED_ZERO | Peer up, zero prefixes for scoped AF | Failed TCP, missing network route by itself |
| ESTABLISHED_ROUTES | Peer up and prefixes received in scoped AF | Reachability, RIB/FIB installation or business service |

These are **eight classification categories**, not eight Cisco FSM states. Zero-prefix and nonzero-prefix are observations *within Established*, not extra FSM transitions. Whether the neighbor is administratively shut down is an operational qualification, not a standard separate FSM state.

Technical checking references (for human review and curriculum semantics only, **not copied as training text**):

- [Cisco — Understand Basic BGP Troubleshoot](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/220604-understand-basic-bgp-troubleshoot.html)
- [Cisco — BGP command reference (`show ip bgp summary`, Idle (Admin))](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/iproute_bgp/command/irg-cr-book/bgp-m1.html)
- [Cisco — Troubleshoot Border Gateway Protocol Basic Issues](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/218027-troubleshoot-border-gateway-protocol-bas.html)

## First training experiment

The independent `curriculum.py` produces 48 training variations × 8 categories = **384 training examples**, with a separate same-template development slice. The `frozen_heldout_v1.jsonl` has **32 independent, original CLI-style test observations** (4 per category) never supplied to the optimizer. Input variation includes distinct host/peer addresses, summary versus neighbor-show phrasing, and explicitly Admin-vs-normal Idle and 0-prefix-vs-nonzero-prefix distinctions.

The `experiment.py` code trains a genuinely randomly initialized Transformer, with an 8-class supervised observation head. Each experiment reports training and development accuracy, all 32 frozen case-level decisions and confusions, and four counterfactual pairs in which only the operational status changes. It never reports falling loss as proven network intelligence.

```bash
python -m unittest research.network_lm.cisco_bgp.test_experiment -v
python -m research.network_lm.cisco_bgp.experiment --steps 600 --per-class 48 --seed 42 --output /tmp/cisco-bgp-seed42.pt
```

GitHub Actions repeats this with **independent seeds 42 and 7** in the research-only workflow. The model weights and scripts cannot be used as a production provider. Outputs have `engineering_verified=false` and `production_ready=false`.

## Following milestones

1. **Observation accuracy:** Hold-out and changed-status tests above the 12.5% balanced eight-class chance level, with explicit failure inspection. Different template distribution is intentional.
2. **Independent explanation learning:** Train the original causal language model itself to give short, conditional explanations (state, what is known, what is not known, read-only verification); explicitly separate learned text from any deterministic template notes.
3. **Evidence-aware BGP reasoning:** Distinguish `Idle (Admin)` vs TCP failure, `Active` vs confirmed ACL problem, `Established` vs route propagation, with contradictory multi-command samples and negative examples.
4. **Blindness and quality:** Freeze unseen scenarios *before* tuning, compare with a simple direct CLI parser and a human-validated rubric, and record false claims and abstention. No benchmark score proves readiness until those tests and independent engineering review pass.

**Out of scope:** Live Network Configurator application, any product deployment, and other technology modules including STP.
