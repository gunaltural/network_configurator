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
