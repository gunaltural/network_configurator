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
