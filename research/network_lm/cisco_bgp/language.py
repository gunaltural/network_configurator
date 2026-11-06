"""Genuinely autoregressive Cisco BGP explanation learning from RANDOM weights.

This is distinct from the supervised eight-class state classifier. The causal
student must actually generate its state and evidence boundary; templates
only create training targets, never substitute for inferred text.
"""
from argparse import ArgumentParser
from dataclasses import asdict
from hashlib import sha256
from pathlib import Path
import json
import random
import re

import torch

from ..data import Example, encode_example
from ..model import ByteTokenizer, LMConfig, ScratchNetworkLM
from ..train import batch, validate
from .curriculum import (
    CLASSES, DATA_VERSION, dataset_fingerprint,
    load_frozen_holdout, training_cases,
)
from .experiment import FROZEN_PATH, ACCEPTANCE_V2

# Synthetically authored teaching targets; these are not copied Cisco material.
# A predicted label is not itself a verified root cause, nor a quote from CLI.
BOUNDARIES = {
    "IDLE_ADMIN": "maintenance intent is unknown",
    "IDLE": "cause of inactive session is unknown",
    "CONNECT": "cause of incomplete transport is unknown",
    "ACTIVE": "transport fault cause is unconfirmed",
    "OPENSENT": "reason for incomplete OPEN exchange is unknown",
    "OPENCONFIRM": "keepalive confirmation cause is unknown",
    "ESTABLISHED_ZERO": "route policy and expected advertisements are unknown",
    "ESTABLISHED_ROUTES": "FIB reachability and service are unverified",
}
assert set(BOUNDARIES) == set(CLASSES)


def target(label):
    if label not in BOUNDARIES:
        raise ValueError("Unknown BGP teaching class")
    return ("STATE=" + label
            + "\nNOT_PROVEN=" + BOUNDARIES[label]
            + "\nCHECK=show ip bgp neighbors")


def as_examples(rows, *, state_only=False):
    """Two explicit autoregressive curricula; no label appended to prompts."""
    return [
        Example(c.case_id, c.scenario, c.split, c.text,
                ("STATE=" + c.label) if state_only else target(c.label))
        for c in rows
    ]


@torch.no_grad()
def generate_on_frozen(model, tokenizer, heldout, *, max_new_tokens=140):
    """Grade strictly on NEW inputs; training answer strings are not prompts."""
    model.eval()
    results = []
    for case in heldout:
        prefix = tokenizer.encode(
            "Network observation:\n" + case.text + "\nEngineering review:\n",
            bos=True,
        )
        output = model.complete(prefix, max_new_tokens=max_new_tokens)
        produced = tokenizer.decode(output[len(prefix):])
        match = re.search(r"(?m)^STATE=([A-Z_]+)\b", produced)
        predicted = match.group(1) if match else None
        valid_label = predicted in CLASSES
        correct = predicted == case.label
        # Strict synthetic-output validation. Merely emitting field names
        # is not a coherent review: reject garbled words, extra claims and
        # incorrect/incomplete operational commands. This is a canonical
        # training-target check, NOT a human expert's semantic judgment.
        full = bool(correct and produced.strip() == target(case.label))
        results.append({
            "id": case.case_id, "expected": case.label,
            "predicted": predicted if valid_label else None,
            "state_correct": correct, "full_format_correct": full,
            "preview": produced[:130],
        })
    return {
        "heldout_cases": len(results),
        "state_correct": sum(item["state_correct"] for item in results),
        "full_format_correct": sum(item["full_format_correct"] for item in results),
        "cases": results,
        "engineering_verified": False,
        "production_ready": False,
    }


def train_language(*, steps=900, per_class=48, seed=42, context=384,
                   width=64, layers=2, heads=4, batch_size=8, lr=0.001,
                   threads=2, state_warmup_steps=0,
                   output="/tmp/cisco-bgp-lm.pt"):
    if (not 1 <= steps <= 10000 or not 1 <= batch_size <= 64
            or not 1 <= threads <= 16 or not 0 < lr < 0.1):
        raise ValueError("Invalid scratch BGP language training bounds")
    if type(state_warmup_steps) is not int or not 0 <= state_warmup_steps < steps:
        raise ValueError("Warmup must leave at least one full-review learning step")
    torch.manual_seed(seed)
    torch.set_num_threads(threads)
    rng = random.Random(seed)
    config = LMConfig(block_size=context, width=width, layers=layers, heads=heads)
    config.validate()
    tok = ByteTokenizer()
    training = training_cases(per_class=per_class, seed=seed)
    dev = training_cases(per_class=8, seed=seed + 239)
    heldout = load_frozen_holdout(FROZEN_PATH)
    acceptance = load_frozen_holdout(ACCEPTANCE_V2)
    if ({c.text for c in training} & {c.text for c in dev + heldout + acceptance}
            or {c.text for c in heldout} & {c.text for c in acceptance}):
        raise ValueError("BGP language model training/heldout overlap")
    examples = as_examples(training)
    warmup_examples = as_examples(training, state_only=True)
    dev_examples = as_examples(dev)
    encoded = [encode_example(x, tok, context) for x in examples]
    encoded_warmup = [encode_example(x, tok, context) for x in warmup_examples]
    encoded_dev = [encode_example(x, tok, context) for x in dev_examples]
    model = ScratchNetworkLM(config)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    first_eval = validate(model, encoded_dev, torch.device("cpu"))
    schedule = list(range(len(encoded)))
    rng.shuffle(schedule)
    cursor = 0
    initial, latest = None, None
    for step in range(steps):
        selected = []
        for _ in range(batch_size):
            if cursor >= len(schedule):
                rng.shuffle(schedule)
                cursor = 0
            selected.append(schedule[cursor])
            cursor += 1
        objective = encoded_warmup if step < state_warmup_steps else encoded
        tokens, labels = batch(objective, selected, torch.device("cpu"))
        model.train()
        optimizer.zero_grad(set_to_none=True)
        _, loss = model(tokens, labels)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if initial is None:
            initial = round(float(loss.item()), 6)
        latest = round(float(loss.item()), 6)
    final_eval = validate(model, encoded_dev, torch.device("cpu"))
    outputs = generate_on_frozen(model, tok, heldout)
    fresh_outputs = generate_on_frozen(model, tok, acceptance)
    metrics = {
        "status": "CISCO_BGP_CAUSAL_LM_SCRATCH_ONLY",
        "architecture": asdict(config),
        "parameter_count": sum(p.numel() for p in model.parameters()),
        "curriculum_version": DATA_VERSION,
        "seed": seed, "steps": steps,
        "state_warmup_steps": state_warmup_steps,
        "full_review_steps": steps - state_warmup_steps,
        "training_examples": len(examples),
        "training_sha256": dataset_fingerprint(training),
        "heldout_sha256": sha256(FROZEN_PATH.read_bytes()).hexdigest(),
        "acceptance_sha256": sha256(ACCEPTANCE_V2.read_bytes()).hexdigest(),
        "loss_first": initial, "loss_last": latest,
        "dev_token_loss_before": first_eval,
        "dev_token_loss_after": final_eval,
        "heldout_generation": outputs,
        "fresh_acceptance_v2": fresh_outputs,
        "engineering_verified": False, "production_ready": False,
        "note": ("This is ACTUAL causal text generation from random weights. "
                 "Matching a short templated response is not network diagnosis."),
    }
    checkpoint = Path(output)
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "weights": model.state_dict(), "config": asdict(config),
        "manifest": {
            k: metrics[k] for k in (
                "status", "architecture", "parameter_count",
                "curriculum_version", "seed", "steps", "training_sha256",
                "heldout_sha256", "acceptance_sha256",
                "state_warmup_steps", "engineering_verified", "production_ready",
            )
        },
    }, checkpoint)
    checkpoint.with_suffix(".metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "mode": "real_autoregressive_scratch_model",
        "steps": steps,
        "dev_loss_before": first_eval, "dev_loss_after": final_eval,
        "heldout_states": outputs["state_correct"],
        "heldout_full_reports": outputs["full_format_correct"],
        "heldout_total": outputs["heldout_cases"],
        "fresh_state_correct": fresh_outputs["state_correct"],
        "fresh_full_reports": fresh_outputs["full_format_correct"],
        "fresh_total": fresh_outputs["heldout_cases"],
        "production_ready": False,
    }), flush=True)
    return metrics


def main():
    ap = ArgumentParser(description=__doc__)
    ap.add_argument("--steps", type=int, default=900)
    ap.add_argument("--per-class", type=int, default=48)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--context", type=int, default=384)
    ap.add_argument("--width", type=int, default=64)
    ap.add_argument("--layers", type=int, default=2)
    ap.add_argument("--heads", type=int, default=4)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--lr", type=float, default=0.001)
    ap.add_argument("--state-warmup-steps", type=int, default=0)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--output", default="/tmp/cisco-bgp-lm.pt")
    args = ap.parse_args()
    train_language(steps=args.steps, per_class=args.per_class,
                   seed=args.seed, context=args.context, width=args.width,
                   layers=args.layers, heads=args.heads,
                   batch_size=args.batch_size, lr=args.lr,
                   threads=args.threads,
                   state_warmup_steps=args.state_warmup_steps,
                   output=args.output)


if __name__ == "__main__":
    main()
