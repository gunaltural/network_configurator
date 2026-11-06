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

## Measured BPE and scratch Transformer scaling (2026-11-06)

All results below come from actual GitHub Actions CPU training on **original-synthetic Cisco BGP-only data** with random initial weights. No customer CLI and no pretrained vocabulary. These are proof-of-learning experiments, not real network engineering acceptance.

### 1. Raw UTF-8 bytes versus original train-only BPE

The first controlled 900-step run used identical synthetic examples, optimizer settings, width 64, 2 layers and seed 42. The tokenizer is fitted exclusively on training prompts and targets, never evaluation examples. Both versions use the same causal decoder without grafting classifier outputs.

| Metric | Original bytes | Scratch BPE, 448 tokens |
| --- | ---: | ---: |
| Model parameters | fewer due to vocabulary | 182,016 |
| Mean training prompt tokens | 131.13 | **42.54** |
| V2 held-out state recognition in **generated text** | 9 / 32 | **19 / 32** |
| V2 exact canonical short explanations in **generated text** | 5 / 32 | **15 / 32** |

[Actual training and 18 passed tests](https://github.com/gunaltural/network_configurator/actions/runs/42209020847). Teacher-forced per-token losses are **not directly comparable** across tokenizers because tokens and their distributions differ.

### 2. Scaling with the same train-only BPE

A new V3 set of 32 independent original-synthetic CLI-style observations was frozen **before** testing the larger capacity. The data, tokenizer, training steps (900) and random seed (42) were unchanged.

| Scratch causal model | Parameters | V3 state | V3 exact explanation |
| --- | ---: | ---: | ---: |
| Width 64, 2 layers | 182,016 | 18 / 32 | 11 / 32 |
| Width 128, 3 layers | **758,912** | **22 / 32** | **15 / 32** |

[Actual capacity comparison and 19 passed tests](https://github.com/gunaltural/network_configurator/actions/runs/42209525715).

### 3. Three independent random initializations, fixed corpus

Training-data seed was separated from model initialization/shuffle seed so all three training runs use **identical 384 training examples and identical BPE merge vocabulary**. Each model was trained from scratch for 900 optimizer steps.

| Model seed | V3 state | V3 exact explanation |
| --- | ---: | ---: |
| 42 | 22 / 32 | 15 / 32 |
| 7 | 20 / 32 | 16 / 32 |
| 99 | 22 / 32 | 16 / 32 |
| **Mean** | **66.67%** | **48.96%** |

[Actual three-seed run, 21 passed tests](https://github.com/gunaltural/network_configurator/actions/runs/42210083308). Measured population standard deviations were 2.95 percentage points for state accuracy and 1.47 percentage points for exact canonical review accuracy. This improves reproducibility, **not** external validity.

**What the model has learned:** BGP FSM status labels and a small number of short conditional, authored explanation patterns; direct generation, not only classification. **What it has not learned:** independent root-cause inference; robust free-form engineering discussion; attribution to verified original CLI files/line numbers; selection among alternative explanations; calibrated uncertainty; or multi-device service impact. In particular `Established` with prefixes received does not prove RIB/FIB installation, and `Idle (Admin)` does not by itself prove an unplanned incident.

The V1/V2/V3 frozen test sets are synthetic and have been inspected during research iterations. Do not call them a final blind production benchmark. The next meaningful teaching set must cover **multiple commands for the same neighbor**, adversarial peer-specific evidence, safe abstention on insufficient evidence and independent human-reviewed Cisco BGP causal outcomes. Only then should we evaluate explanation generation beyond short canonical strings.

### Research-only reproducibility

```bash
python -m unittest research.network_lm.cisco_bgp.test_experiment research.network_lm.cisco_bgp.test_language research.network_lm.cisco_bgp.test_tokenizer research.network_lm.cisco_bgp.test_summarize_language -v
python -m research.network_lm.cisco_bgp.language --tokenizer bpe --bpe-vocab-size 448 --width 128 --layers 3 --heads 4 --steps 900 --per-class 48 --data-seed 42 --seed 42 --output /tmp/cisco-bgp-large42.pt
```

This work is an isolated small language-model project, not a component or deployment request of the live Network Configurator.

## Training from our own BGP Design and Simulation modules

Our BGP Design and Simulation modules are used **read-only** as original, line-traceable teaching material. Neither production code nor live Render/Network Configurator deployments were modified.

- The source_catalog.json inventories 14 official Cisco pointers. Only original learning objectives, not copied Cisco document bodies, appear in research artifacts.
- The internal_module_knowledge.json maps **14** BGP design, policy, simulation and FSM principles to the exact project files and line ranges, with explicit not-proven limitations.
- The module_scenarios.mjs generator actually calls the original synthetic-bgp.js engine. A source hash and group split are recorded; **192** simulator-derived examples are training-only, **10** are validation, and **24** heldout examples span six unseen multi-failure combinations.
- The module_lm.py script trains a fresh BPE Transformer, compares simulation-only with simulation + **70** authored Design examples, and separately tests focused single-outcome generation. Its outputs are **model-generated text**, not simulator answers patched into the response.

### Measured outcomes (research only)

[Actual GitHub Actions experiment](https://github.com/gunaltural/network_configurator/actions/runs/42238250876) passed **4 Node simulator tests and 6 Python teaching/integrity tests**, then trained scratch models with a fixed architecture and same optimizer budget.

| Metric on withheld simulator failure combinations | Simulation only | Simulation + Design |
| --- | ---: | ---: |
| Whole four-outcome response (24 scenarios) | 0/24 | 0/24 |
| Individual outcome answer (96 questions) | 22/96 | **24/96** |
| Exact focused response including limitation | 18/96 | **20/96** |
| Correct CE1 exit (24 questions) | 2/24 | **4/24** |

**Interpretation:** This demonstrates a reproducible teaching pipeline, NOT working causal network inference. The tiny model often predicts an active path during a compound failure. Even a perfectly formatted LIMITATION line cannot make a wrong route assessment correct. Design samples helped slightly but generalization is still weak. The current withheld tests have now been inspected and should not become a final untainted production benchmark.

### Next learning gate

Develop compositional training over explicit alternative exit, CE interconnect dependency, CE-owned versus shared client LAN, VRRP gateway and simultaneous failure sets. Keep original engine supervision and group-separated unseen failure scenarios. Demand correctly generated **individual outcomes first**, then integrated review. Treat every modeled result as simulation-only; no inferred live Cisco BGP FSM, forwarding, root cause or outage decision is allowed.

Code: module_lm.py, module_scenarios.mjs, internal_module_knowledge.json and their tests. No UI or production integration is required.

## 2026-11-06 — Causal dependency composition and corrected labels

New results from [GitHub Actions research run 42242720284](https://github.com/gunaltural/network_configurator/actions/runs/42242720284). No production or live application changes.

### Training-label bug fixed *before* comparing approaches

In the original research-only simulation dataset generator, a CE-owned prefix was incorrectly marked `PATH_AVAILABLE` whenever all inbound route states were not literally `no-path`. In particular, an ISP can be `device-down`: that is *not* a usable route. We fixed both research generators to mark `PATH_AVAILABLE` **only if at least one inbound route actually has state `reachable` and a candidate path**. New regression tests specifically assert that `both-isps` gives `NO_MODELED_PATH` for both CE-owned prefix and shared LAN while surviving alternate paths can remain available. **Previous heldout scores using the faulty labels should not be compared to corrected-label results.**

### Compositional curriculum and source provenance

`compositional_scenarios.mjs` creates **16 TRAIN-only compound-failure groups** that are disjoint from all existing train-group signatures, validation groups and the six heldout compound-failure groups. It derives **960 extra synthetic training examples**, including explicit, engine-cross-checked direct WAN1 and alternate CE2/WAN2 candidate availability, CE1 exit, route ownership, shared-LAN and client-outbound outcomes. `compositional_training.py` rejects mismatched engine hashes, duplicates, non-train records or unsupported targets. During inference, no simulator outcome is copied or called: the random-initialized Transformer generates its own answers.

### Controlled outcome

Both arms use the same BPE vocabulary, model configuration (~371,328 parameters), random seed 42 and **600 optimizer steps**, with Design knowledge included. The only experimental difference is the additional training records; therefore the data distribution also changes, and the test suite is synthetic and already inspected.

| Corrected synthetic heldout metric | Original focused Design + Simulation | Plus causal dependency curriculum |
| --- | ---: | ---: |
| Individual modeled outcomes correct / 96 | **20** | **34** |
| Exact canonical focused answers / 96 | **20** | **34** |
| CE1 exit correctly generated / 24 | **4** | **11** |
| Both outcomes correct on paired exit-changing failures / 12 | **0** | **2** |
| Any output change on paired exit-changing failures / 12 | **0** | **4** |
| Training examples | 838 | 1,798 |

Eight Node tests and eight Python tests passed; synthetic evaluation and training ran successfully. This supports limited learned generalization to compound dependencies compared with the previous baseline but **not** true causal engineering competence: 34/96 overall and 2/12 fully correct contrast pairs remain inadequate for network diagnosis. The original simulator only models simplified BGP Design assumptions, not BGP FSM, actual Cisco best-path, live VRRP, reconvergence or packet forwarding.

### Next gate

Before evaluating a further model, freeze independent source topologies and failure group combinations, implement a simple route-availability heuristic baseline and calibrate a safe abstention mechanism. Subsequently teach evidence-bound relationships from multiple independently sourced Cisco BGP `show` commands (session, prefix advertisement, next-hop and RIB). The live Network Configurator and Render are separate.

### Follow-up no-learning majority reference and exact-score replication

A second [full CPU training and majority-reference CI run](https://github.com/gunaltural/network_configurator/actions/runs/42243897141) completed successfully after adding `majority_baseline.py` (and its test). The reference uses only the most common training response per outcome field and **does not learn BGP or infer causal relationships**.

| Corrected 96-case evaluation | No-learning majority | Standard Design + Simulation LM | Additional dependency teaching LM |
| --- | ---: | ---: | ---: |
| Correct generated outcome / 96 | **20** | **20** | **32** |
| CE1_EXIT correct / 24 | N/A | **4** | **9** |
| Both outcomes correct on 12 contrast pairs | N/A | **0** | **1** |

The same nominal model seed and training setup had previously scored **34/96** (and 11/24 CE1_EXIT, 2/12 contrast pairs) in run 42242720284, so **do not claim exact numerical reproducibility**. The two observed runs suggest a result in the 32–34/96 range under these executions, not a validated confidence interval. Both exceed the simple majority reference but remain too weak for production inference. Follow-up requires explicit deterministic kernel settings, fixed-corpus multiple-seed runs, more difficult independently frozen topologies and a human-validated multi-CLI BGP evidence test.

Note that the earlier 24/96 score from before the incorrect `device-down` label was fixed is not a valid baseline for this corrected evaluation. The current reference is 20/96, which is the value to use in comparisons.
