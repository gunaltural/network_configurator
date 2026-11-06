# Network Configurator — two-track AI program (2026-11-06)

## Non-negotiable product goal

Deliver a **working, evidence-grounded AI Analysis module** that takes real multi-device and multi-vendor configuration, Show-Tech and operational CLI, explains network technology in clear language, interprets observed vs intended state, tests competing engineering hypotheses, cites the originating device/file/CLI line, and produces a **CTO-readable executive report with an engineer-actionable drilldown**.

Apply the **same methodology** to BGP, OSPF, STP, vPC/MLAG, EVPN/VXLAN, SD-WAN, System/Management and DCI. Do not let individual examples redefine or narrow the product to STP, BGP or a single vendor.

## Track A — product: strong-model AI Analysis (highest release priority)

Work only on isolated AI Analysis branches; preserve existing stable Design, Simulation, configuration generation, Reporting/Inventory and live Beta functionality.

1. **Ingestion and provenance:** original device, hostname, filename, command/collection time if known, redacted literal CLI line; never confuse synthetic Simulation, configuration intent and observed operations.
2. **Independent engineering interpretation:** compare technology applicability, expected design, observed states, peer/VRF/VLAN/AF scope, cross-device contradictions and alternative explanations. Do not convert a missing config line, a source title or correlated symptoms into a definitive root cause.
3. **Reasoning:** use a capable model, versioned retrieval with manufacturer/release applicability, structured citations, explicit counterevidence and falsifiable hypotheses; deterministic parsers support verification, not an answer key.
4. **Presentation:** executive findings, conditional service/business impact, risk prioritization with clear uncertainty; per-technology context; per-device cited evidence; engineer-level read-only verification, remedial options, acceptance and rollback criteria.
5. **Quality:** independently authored synthetic held-outs (currently 19 cases across 9 scored suites, including separate Cisco vPC and Arista MLAG), adversarial fabricated-source and unsupported-claim tests, multi-vendor coverage, source-trace checks and a separate human engineering review. Format or quote matching alone never proves engineering correctness.
6. **Delivery:** model availability and actual strong-model results must be proven; API/provider permission failures, empty outputs, interrupted runs and abstention are *not* passing diagnoses. Review/merge/release gates remain closed until all are satisfied.

### Track A exit gates (must all hold)
- CI and browser regression checks pass without reducing the existing Design/Simulation baseline.
- Real **strong-model inference** completes; per-case scores are recorded on the exact tested commit; no skipped/cancelled evaluation is called a pass.
- All release-blocking held-out cases pass with valid, distinct original-line evidence and no prohibited invented findings; independent engineering sign-off validates technical meaning and counterfactual behavior.
- A complete CTO + engineering report works on realistic **multi-technology Show-Tech**, with visible unknowns and no unsupported root-cause or business-outage claims.
- External provider, privacy, authorization, timeouts, and resource budget are reviewed before production; rollback and fallback are documented.

## Track B — independently scratch-trained network-domain model (research)

Work only under `research/network_lm/` and the isolated research workflow. Use original randomly initialized weights and **rights-cleared, privacy-screened, provenance-tracked data**; no copied vendor text, customer logs or credential-bearing CLI without explicit authorization.

1. Preserve reproducible training, causal-token checks, train/validation scenario isolation and checkpoint/corpus integrity.
2. Measure both held-out generation and *paired counterfactual sensitivity* (BGP state, OSPF adjacency, EVPN route type) without showing answers to inference.
3. Expand corpus only after licensing, DLP, near-duplicate and split-contamination checks; document vendor, NOS release, source rights and version of every training item.
4. Compare against **both** a deterministic parser baseline and an accepted capable strong model under the *same independent engineering rubrics*. Track unsupported claims, source attribution, technical accuracy, abstention and inference cost independently of training loss.
5. Scale architecture, data and hardware only with a recorded quality/cost gain. No scratch checkpoint becomes a product provider merely because loss fell or code/tests passed.

### Track B exit gates
- Independent unseen/counterfactual scenarios demonstrate reproducible network reasoning beyond lexical proxies.
- Source and security controls have documented validation; an engineer reviews representative accepted and rejected answers.
- Quality meets or exceeds the accepted Track A baseline on identical licensed evaluation scenarios, with sustainable serving cost.
- A separate product integration review expressly authorizes any coupling; **research never blocks Track A**.

## Shared methodology used in every technology report

1. What this technology does and why it matters in *this topology*.
2. Expected behavior and relevant platform/release scope.
3. What's configured (intent) versus what was actually observed (CLI).
4. Control-plane/data-plane and cross-device consistency, accounting for capture times.
5. Competing hypotheses, contrary evidence and missing tests.
6. Conditional service risk and executive impact without invented incidents.
7. Safe vendor-specific **read-only** audit checks.
8. Remediation options, rollback considerations, and observable acceptance criteria.

## Status semantics

- **OBSERVED / SOURCE_ANCHORED:** literal CLI excerpt and provenance verified; *engineering interpretation remains unverified*.
- **HYPOTHESIS / NEEDS_VERIFICATION:** plausible, testable explanation requiring independent evidence.
- **ABSTAINED / INSUFFICIENT_EVIDENCE:** not a success or health verdict.
- **FAILED / CANCELLED / SKIPPED:** not accepted. A locally green syntax/mock test is not a real-model acceptance.
- **RESEARCH_ONLY:** cannot be used as live product diagnosis.

**Current baseline (2026-11-06):** Track A has working source-integrity infrastructure but lacks confirmed strong-model engineering acceptance. Track B has runnable scratch training and integrity/lexical/counterfactual evaluations but no demonstrated domain-level reasoning. Both PRs stay draft; production and Beta remain unchanged.
