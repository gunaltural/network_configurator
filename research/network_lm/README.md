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

The workflow keeps only synthetic metric JSON artifacts. Model weights are not uploaded or deployed. To move toward a network-language model that generalizes, next build licensed corpus scale, a better tokenizer/training budget, held-out topology/peer-specific causal benchmarks, and cross-vendor expert-reviewed evaluation. A small classifier alone cannot satisfy those conditions.
