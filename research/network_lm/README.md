# Network-domain language model — independent scratch research

This is a **new randomly initialized Transformer**, not the Qwen 0.5B model, a fine-tune, or a network engineer ready for use. This work is **parallel** to the independent AI Analysis product and does not change Design, Simulation, or deployed configurations.

## Implemented

- Randomly initialized causal decoder-only Transformer with byte-level tokenizer and no pretrained model download.
- Completion-only cross-entropy objective, AdamW training and reproducible checkpoint/metric manifest.
- Scenario-grouped held-out validation, duplicate detection, basic secret filter, synthetic-only provenance, and no silent prompt truncation.
- Causal attention isolation, Turkish UTF-8, train/validation separation, and real parameter update tests.

## Run

```bash
python -m pip install torch
python -m unittest research.network_lm.test_scratch -v
python -m research.network_lm.train --steps 3 --output /tmp/network-mini.pt
```

A decreasing training loss **is not proof of useful language or engineering diagnosis**. The tiny included corpus is synthetic by construction and deliberately far below the scale needed for a competent network-domain language model. No learned weights are deployed to AI Analysis or any user-facing service.

## Two independent tracks

**Product: AI Analysis** — use a capable model provider to reason about actual scoped CLI, supported network technologies, explicit peers, competing hypotheses, evidence and counterevidence. Keep synthetic held-out domain acceptance for BGP, OSPF, EVPN, vPC/MLAG, STP and SD-WAN.

**Model research** — build a rights-cleared multilingual technical training corpus, reliable tokenizer, scalable training and stringent independent benchmarks; compare against both strong-model and deterministic-baseline results. Do not treat any scoring or training-loss improvement as network engineering acceptance.

## Before scaling

1. **Rights, privacy and security:** Public vendor documentation and RFCs are not automatically approved for training; obtain legal permission and document scope/version. No unapproved customer logs, CLI, credentials, topology or tickets. The current regex-based secret filter is not comprehensive DLP.
2. **Provenance & data cleaning:** Source license, URL, revision, vendor, NOS/software release, dataset approval, anonymization, duplicate hash and semantic near-duplicates across train/evaluation boundaries.
3. **Hardware & cost:** Budget GPU hours, memory, data storage, training and serving latency. These resources are not established by this proof-of-concept.
4. **Strict evaluation:** Check cited device/line, appropriate CLI syntax, BGP FSM, DR/BDR roles, EVPN route types, vPC/MLAG state, SD-WAN SLA, missing evidence and safe read-only checks. Separate model draft from verified diagnosis.
5. **Release isolation:** Never merge research weights into the product or bypass held-out acceptance. Product's existing AI Analysis route must remain usable regardless of research progress.

Technical references: [PyTorch causal SDPA](https://docs.pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html) · [AdamW](https://docs.pytorch.org/docs/stable/generated/torch.optim.AdamW.html).

## Independent held-out generation (added 2026-11-06)

The scratch checkpoint now has its own `python -m research.network_lm.evaluate --checkpoint /tmp/network-mini.pt --max-new-tokens 35` evaluator. The evaluator checks checkpoint provenance, corpus SHA-256, held-out scenario separation and generated text **only**. It does not provide the target completion to inference and does not score training loss as engineering accuracy.

On the first three-step 165,888-parameter prototype, held-out BGP Idle(Admin) and vPC Peer Gateway scenarios passed **0 of 2** very basic lexical checks. The model generated incomplete/unusable text. This is a **documented negative result**, not an engineering acceptance. A zero-score evaluation deliberately does not prevent the isolated research CI job from passing its *software-integrity* checks. `engineering_verified=false` and `production_ready=false` remain explicit in every report.

Research-only checks: `python -m unittest research.network_lm.test_scratch research.network_lm.test_evaluate -v`. No production inference, Design or Simulation changes.

## Contrastive research gate (parallel track)

`python -m research.network_lm.counterfactual --checkpoint /tmp/network-mini.pt --max-new-tokens 35` tests *paired original-synthetic* counterfactual inputs for BGP Idle(Admin) vs a session with received prefixes, OSPF 2WAY/DROTHER vs EXSTART/DR, and EVPN Type-2 vs Type-5. The second observation changes while the surrounding task stays comparable. The model sees only the prompt, **never** the expected lexical signals.

The metric is intentionally conservative: a pair passes only if each generated response contains its respective distinctive observable signal without repeating the opposite state. It is neither a semantic correctness test nor proof of troubleshooting capability; valid paraphrases can score poorly. Evaluation outputs record changed-text sensitivity and lexical contrast separately. Research CI now runs actual scratch training, checkpoint integrity checks and this counterfactual report on PR changes without touching deployed services.

Before this work can become a product candidate, a substantially larger rights-cleared corpus, stronger architecture, independently authored unseen scenarios, vendor/release scoped source checks, cross-device consistency and expert review are still required. No current scratch weights qualify.

## Expanded original-synthetic curriculum and measured training (2026-11-06)

The scratch training script supports `--curriculum-per-state 12 --curriculum-seed 42`, generating 192 *original synthetic* examples for 16 distinct operational states across BGP, OSPF, EVPN, SD-WAN, MLAG, STP, System/NTP and DCI. Every generated record is **train-only**; the two original held-out scenario groups remain untouched. Curriculum generator version, deterministic sample digest and exact scenario families are recorded in the checkpoint and revalidated before loading. The trainer uses seeded, epoch-wise shuffled batches rather than always taking the first records.

[Real research CI](https://github.com/gunaltural/network_configurator/actions/runs/42195999728) completed 14 software/integrity tests and ran an actual CPU comparison with the **same 165,888-parameter, randomly initialized architecture**:

| Metric | First scratch baseline | Expanded run |
| --- | ---: | ---: |
| Training examples | 6 | 198 |
| Optimizer steps | 3 | 160 |
| Held-out token loss | 5.361920 | 2.994153 |
| Held-out lexical sanity | 0/2 | 0/2 |
| Counterfactual lexical distinction | 0/3 | 0/3 |

**Interpretation:** the network-domain language model learns to predict tokens from the expanded synthetic corpus, but still does **not** reliably generate meaningful descriptions or distinguish protocol states. Training length *and* dataset size changed, so this is not a controlled ablation and does not prove augmentation caused the improvement. No successful domain reasoning or engineering acceptance is claimed.

### Separate scratch Transformer state-recognition probe

The experimental `state_probe.py` uses the exact same architecture's *randomly initialized causal Transformer backbone*, with a newly initialized supervised 16-class state head. It measures **synthetic observed-state recognition**, not diagnosis, on (a) unseen identifiers/phrasing from the same templates and (b) 16 independently authored out-of-template status sentences. Labels do not enter the model at inference; they are evaluation-only. A successful classification is not a rooted diagnosis, and the supervised probe is **not substituted for the causal language-model weights**.

```bash
python -m research.network_lm.train --steps 160 --batch-size 4 --curriculum-per-state 12 --output /tmp/network-curriculum.pt
python -m research.network_lm.evaluate --checkpoint /tmp/network-curriculum.pt
python -m research.network_lm.counterfactual --checkpoint /tmp/network-curriculum.pt
python -m research.network_lm.state_probe --steps 400 --samples-per-state 12 --output /tmp/network-state-probe.pt
```

Research CI retains synthetic metric JSON and now also makes the **seed-42 synthetic-only scratch checkpoint** available as a short-lived (7-day) GitHub Actions preview artifact. This is not an approved or deployed model, and it is never copied into live Network Configurator or any customer system. To move toward a network-language model that generalizes, next build licensed corpus scale, a better tokenizer/training budget, held-out topology/peer-specific causal benchmarks, and cross-vendor expert-reviewed evaluation. A small classifier alone cannot satisfy those conditions.

## Evidence of state recognition — and its limits (2026-11-06)

A 16-class scratch Transformer state probe ran for 400 CPU training steps on 192 original-synthetic cases with a 166,928-parameter randomly initialized network. The *first* one-template curriculum memorized training examples and achieved 3/16 on separately worded transfer cases. A new **versioned, three-phrasing** curriculum with the same number of examples and steps reached 10/16 on that previously viewed transfer set. Because we inspected that set, it is **development feedback**, not blind acceptance.

We then froze **32 additional original-synthetic CLI-format challenge observations** in `challenge_v1.jsonl`, two for each of the 16 labels. Their exact SHA is recorded in the checkpoint and research results. These observations are not fed into training, and no model weights, Design/Simulation or deployed product components are changed.

[Actual three-seed GitHub Actions training](https://github.com/gunaltural/network_configurator/actions/runs/42198138109) completed **20 software/integrity tests** plus three independently initialized 400-step state probes (seeds 42/7/99). Results on the same frozen 32-case challenge:

| Seed | Correct / 32 | Accuracy |
| --- | ---: | ---: |
| 42 | 15 / 32 | 46.875% |
| 7 | 15 / 32 | 46.875% |
| 99 | 14 / 32 | 43.750% |
| **Mean** | **14.67 / 32** | **45.83%** |

The 16 equally populated classes have a 6.25% uniform-random chance baseline. This is narrow **synthetic state classification** only. It is not confirmed network engineering, independent real-CLI diagnosis, root-cause reasoning, a working generative language model or production readiness. BGP state generalization and multiple STP/EVPN/SD-WAN contrasts still fail on unseen CLI phrasings.

The generative language-model track remains below its own minimal behavioral threshold: its expanded 160-step run reduced held-out token loss from 5.361920 to around 3.0, but held-out lexical tests remained 0/2 and paired counterfactual output tests remained 0/3. The state classifier **is a separate supervised probe**, not a substitute for generative model acceptance.

### Next research gates

1. Obtain sufficiently large rights-cleared and privacy-screened network-domain material, including multilingual explanations, device-scoped CLI evidence and original adversarial examples. Audit licensing, near-duplicate scenario families and secret exposure before ingestion.
2. Improve tokenizer/context coverage and conduct controlled architecture/optimizer/data ablations. Record GPU/CPU time, multiple seeds and reproducibility; do not infer quality solely from falling loss.
3. Demand unseen *topology- and evidence-level causal* tasks: BGP Idle(Admin) versus transport failure, OSPF 2-WAY versus EXSTART, vPC peer link/keepalive, EVPN route presence versus FIB installation, and SD-WAN SLA versus actual selected service. Require explicit falsifiable alternatives and grounded citations, not keyword-matched labels.
4. Freeze stronger independent test sets before tuning, compare against deterministic parsing and accepted external-model baselines, and require engineer adjudication. Scratch weights remain research-only until all release criteria are met.

## Local scratch-model product candidate: offline demo

**Development-only, end-to-end product slice:** A scratch-trained state recognition checkpoint is loaded from local disk, validated against the versioned curriculum and frozen evaluation manifest, and queried through an explicitly enabled, localhost-only FastAPI service and browser page. This is not yet a network troubleshooting agent. Design, Simulation, strong-model AI Analysis and live Beta remain unchanged.

### Run with synthetic examples

Python 3.12, PyTorch, FastAPI, HTTPX and Uvicorn:

```bash
python -m pip install torch fastapi httpx uvicorn
python -m research.network_lm.state_probe --steps 400 --samples-per-state 12 --seed 42 --output /tmp/network-state-probe.pt
python -m research.network_lm.demo_api --checkpoint /tmp/network-state-probe.pt --port 8766
```

Open **http://127.0.0.1:8766** on the same machine. Use only the included original-synthetic observation examples. Do not enter customer data, upload full Show-Tech or open the server to the network.

### API (synthetic data only)

```bash
curl -sS http://127.0.0.1:8766/api/research/predict \
  -H 'Content-Type: application/json' \
  -d '{"observation":"DIST-01 OSPF neighbor 10.0.0.3 state EXSTART/DR","device":"LAB-01","evidence_id":"synthetic-1"}'
```

The response has an experimental candidate among 16 known synthetic state classes and a softmax score that is **NOT calibrated correctness probability**. A low score or low class margin triggers `ABSTAIN`. No response is an accepted diagnosis: `engineering_verified=false`, `root_cause_verified=false` and `production_ready=false`. Device and evidence IDs are unverified user submissions, not source-verified CLI citations.

The server is disabled by default; the explicit CLI opt-in binds only to `127.0.0.1`. It neither connects to external AI providers nor changes any network equipment. Short single-line inputs are required; the basic regex secret filter is not comprehensive DLP. No inputs are automatically uploaded. CI now publishes a **7-day synthetic-only research checkpoint artifact**, separate from the model-metrics artifact, for a local preview; it is not deployed or incorporated into the production product. Download the checkpoint from the successful Research Actions run, extract `network-state-probe.pt` and supply that path using `--checkpoint` instead of retraining locally.

**Real validation:** CI trains fresh weights, tests rejection of corrupted manifests and suspicious inputs, validates disabled-by-default behavior and submits an actual localhost HTTP request to the trained model. Successful software/HTTP tests do **not** change the independent engineering-quality acceptance requirements.

### Productization gates

Before offering this inside Network Configurator: acquire permissioned and privacy-reviewed network training material; improve blind multi-device/multi-protocol generalization, original-source citation and competing hypothesis quality; compare against deterministic parsing and an accepted strong model; calibrate or empirically bound abstention error; perform independent engineer review. This research demo is not ready for production or operational decisions.
