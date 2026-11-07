# Evidence-gap sampling experiment — 7 November 2026

Base commit: `b3bacc56aa94f633a271c8cb7f10d274c712c542`.

The preceding field-scaffold experiment did not establish an improvement:
its two seeds achieved 0/60 exact WHY and 4/60 exact CHECK on incomplete
evidence. The matched seed-42 control achieved 3/60 and 7/60. These are
canonical-string scores, not semantic engineering correctness.
Source: https://github.com/gunaltural/network_configurator/actions/runs/42363475495

Same-runner reproducibility audits passed for both strict CPU and default
two-thread CPU. This rules out within-runner instability in those tested
conditions, but does not identify the cause of earlier cross-run differences.
Sources:
- https://github.com/gunaltural/network_configurator/actions/runs/42363475485
- https://github.com/gunaltural/network_configurator/actions/runs/42363475589

## Hypothesis and intervention

The existing nine-class sampler gives all five evidence gaps together one
class share. Over 900 steps at seed 42, each known WHY type receives 200
examples, while each unknown WHY type receives only 38–42 examples.
The optional `--balance-gaps` sampler balances eight known finding types
and five distinct evidence gaps. Each WHY type receives 138–139 examples.
This changes the known/unknown training prior as well as subtype exposure;
it is not proof of a unique causal explanation for model failure.

No prompts, targets, data splits, inference logic, or default sampler change.
This remains random-initialized autoregressive model training, with no
inference rules, pretrained weights, or answer injection. Evaluation now
also reports each evidence gap separately.

## Matched comparison

Run each command with seeds 42 and 7, adjusting the output name:

```bash
python -m research.network_lm.bgp_evidence_v2.train \
  --balanced-batches --teach-abstention --strict-cpu --seed 42 \
  --steps 900 --context 768 --width 96 --layers 2 --heads 4 \
  --batch-size 8 --vocab-size 512 --output /tmp/bgp-gap-control42.pt

python -m research.network_lm.bgp_evidence_v2.train \
  --balanced-batches --teach-abstention --strict-cpu --balance-gaps --seed 42 \
  --steps 900 --context 768 --width 96 --layers 2 --heads 4 \
  --batch-size 8 --vocab-size 512 --output /tmp/bgp-gap-balanced42.pt
```

Use the same PyTorch version (2.15.0+cpu), machine, and initial weights.
Compare dataset/tokenizer/config hashes before interpreting results.
Report all four fields, known 96 cases, unknown 60 cases, and paired
counterfactuals. Do not promote a model solely because one field improves.
Repeated experiments on this fixed test set are exploratory; a new locked
holdout is necessary for any subsequent acceptance claim.

## Validation

26 unit tests pass, covering sampler coverage and reproducibility, data
partitioning, constant-output rejection, field-prefix handling, and weights.
The per-gap metric is additionally checked on a constant-output model.
There is no live application integration or deployment in this experiment.
