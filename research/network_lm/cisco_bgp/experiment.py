"""Train and evaluate an ISOLATED randomly initialized Cisco IOS-XE BGP state model.

The supervised BGP head shares the from-scratch causal Transformer architecture.
It is not the network-configurator product, and not generative diagnosis.
Held-out source is frozen independently and never used for optimization.
"""
from argparse import ArgumentParser
from collections import Counter
from dataclasses import asdict
from hashlib import sha256
from pathlib import Path
import json
import random

import torch
import torch.nn as nn
import torch.nn.functional as F

from ..model import ByteTokenizer, LMConfig, ScratchNetworkLM
from .curriculum import (
    CLASSES, DATA_VERSION, INTERPRETATIONS, dataset_fingerprint,
    load_frozen_holdout, training_cases,
)

FROZEN_PATH = Path(__file__).with_name("frozen_heldout_v1.jsonl")
CLASS_INDEX = {c: i for i, c in enumerate(CLASSES)}
PREFIX = "Cisco BGP observation:\n"


class BGPStudent(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.backbone = ScratchNetworkLM(config)
        self.classifier = nn.Linear(config.width, len(CLASSES))

    def forward(self, tokens, lengths):
        features = self.backbone.encode(tokens)
        last = lengths - 1
        if bool((last < 0).any()) or bool((lengths > tokens.shape[1]).any()):
            raise ValueError("Invalid token span")
        # Sequence length is observed, not inferred from padded byte values.
        pooled = features[torch.arange(tokens.shape[0], device=tokens.device), last]
        return self.classifier(pooled)


def encode(cases, tokenizer, context):
    rows = []
    for case in cases:
        if case.label not in CLASS_INDEX:
            raise ValueError("Unknown Cisco BGP state")
        token_ids = tokenizer.encode(PREFIX + case.text, bos=True)
        if len(token_ids) > context:
            raise ValueError("Observation exceeds context; no truncation")
        rows.append((token_ids, CLASS_INDEX[case.label]))
    return rows


def make_batch(encoded, selected):
    longest = max(len(encoded[i][0]) for i in selected)
    tokens = torch.zeros((len(selected), longest), dtype=torch.long)
    sizes = torch.zeros((len(selected),), dtype=torch.long)
    labels = torch.zeros((len(selected),), dtype=torch.long)
    for j, idx in enumerate(selected):
        t, lab = encoded[idx]
        tokens[j, :len(t)] = torch.tensor(t, dtype=torch.long)
        sizes[j] = len(t)
        labels[j] = lab
    return tokens, sizes, labels


@torch.no_grad()
def evaluate(model, encoded, cases, *, max_examples=64):
    model.eval()
    right = 0
    predictions = []
    confusion = Counter()
    for idx, case in enumerate(cases):
        tokens, sizes, labels = make_batch(encoded, [idx])
        scores = model(tokens, sizes)
        guess = int(torch.argmax(scores[0]).item())
        truth = int(labels[0])
        correct = guess == truth
        right += int(correct)
        confusion[(CLASSES[truth], CLASSES[guess])] += 1
        if idx < max_examples:
            predictions.append({
                "id": case.case_id, "expected": CLASSES[truth],
                "predicted": CLASSES[guess], "correct": correct,
            })
    return {
        "correct": right,
        "total": len(cases),
        "accuracy": round(right / len(cases), 4) if cases else 0.0,
        "predictions": predictions,
        "confusions": [
            {"actual": actual, "predicted": predicted, "count": count}
            for (actual, predicted), count in sorted(confusion.items())
        ],
    }


COUNTERFACTUALS = (
    ("admin_vs_idle", "Idle (Admin)", "Idle", "IDLE_ADMIN", "IDLE"),
    ("connect_vs_active", "Connect", "Active", "CONNECT", "ACTIVE"),
    ("opensent_vs_openconfirm", "OpenSent", "OpenConfirm", "OPENSENT", "OPENCONFIRM"),
    ("established_zero_vs_routes", "0", "24", "ESTABLISHED_ZERO", "ESTABLISHED_ROUTES"),
)


def counterfactual_score(model, tokenizer, context):
    pairs = []
    for name, left, right, expected_l, expected_r in COUNTERFACTUALS:
        results = []
        for status in (left, right):
            # Paired synthetic inputs differ ONLY in the BGP state/PfxRcd.
            line = f"CE-101 show ip bgp summary: peer 198.51.100.9 State/PfxRcd {status}"
            token_ids = tokenizer.encode(PREFIX + line, bos=True)
            if len(token_ids) > context:
                raise ValueError("Counterfactual out of context")
            with torch.no_grad():
                logits = model(torch.tensor([token_ids], dtype=torch.long),
                               torch.tensor([len(token_ids)], dtype=torch.long))
            results.append(CLASSES[int(logits[0].argmax())])
        pairs.append({
            "id": name, "expected": [expected_l, expected_r],
            "predicted": results,
            "both_correct": results == [expected_l, expected_r],
            "model_changed_output": results[0] != results[1],
        })
    return {
        "pairs": pairs,
        "correct": sum(x["both_correct"] for x in pairs),
        "total": len(pairs),
    }


def train(*, steps=600, per_class=48, seed=42, context=384,
          width=64, layers=2, heads=4, batch_size=8, lr=0.001,
          threads=2, output="/tmp/cisco-bgp-student.pt"):
    if not (1 <= steps <= 10000 and 1 <= batch_size <= 64
            and 1 <= threads <= 16 and 0 < lr < 0.1):
        raise ValueError("Invalid training bounds")
    torch.manual_seed(seed)
    torch.set_num_threads(threads)
    rng = random.Random(seed)
    config = LMConfig(block_size=context, width=width, layers=layers, heads=heads)
    config.validate()
    tokenizer = ByteTokenizer()
    training = training_cases(per_class=per_class, seed=seed)
    dev = training_cases(per_class=8, seed=seed + 239)
    test = load_frozen_holdout(FROZEN_PATH)
    if ({x.text for x in training} & {x.text for x in dev + test}
            or {x.case_id for x in training} & {x.case_id for x in test}
            or {x.scenario for x in training} & {x.scenario for x in test}):
        raise ValueError("Cisco BGP train/evaluation leakage")
    encoded_train = encode(training, tokenizer, context)
    encoded_dev = encode(dev, tokenizer, context)
    encoded_test = encode(test, tokenizer, context)
    model = BGPStudent(config)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    before = evaluate(model, encoded_test, test)
    schedule = list(range(len(training)))
    rng.shuffle(schedule)
    cursor = 0
    first, final = None, None
    for _ in range(steps):
        ids = []
        for _ in range(batch_size):
            if cursor >= len(schedule):
                rng.shuffle(schedule)
                cursor = 0
            ids.append(schedule[cursor])
            cursor += 1
        tokens, sizes, labels = make_batch(encoded_train, ids)
        model.train()
        optimizer.zero_grad(set_to_none=True)
        loss = F.cross_entropy(model(tokens, sizes), labels)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if first is None:
            first = round(float(loss.item()), 6)
        final = round(float(loss.item()), 6)
    train_result = evaluate(model, encoded_train, training, max_examples=0)
    dev_result = evaluate(model, encoded_dev, dev, max_examples=0)
    heldout = evaluate(model, encoded_test, test)
    paired = counterfactual_score(model, tokenizer, context)
    report = {
        "status": "CISCO_BGP_SCRATCH_RESEARCH_ONLY",
        "data_version": DATA_VERSION,
        "architecture": asdict(config),
        "params": sum(p.numel() for p in model.parameters()),
        "seed": seed,
        "steps": steps, "batch_size": batch_size, "per_class": per_class,
        "train_count": len(training), "dev_count": len(dev),
        "heldout_count": len(test),
        "train_digest": dataset_fingerprint(training),
        "dev_digest": dataset_fingerprint(dev),
        "heldout_sha256": sha256(FROZEN_PATH.read_bytes()).hexdigest(),
        "loss_first": first, "loss_last": final,
        "train_accuracy": train_result["accuracy"],
        "dev_accuracy": dev_result["accuracy"],
        "heldout": heldout,
        "counterfactual": paired,
        "source_scope": "Original synthetic observations; IOS/IOS-XE BGP only",
        "no_model_generated_root_cause": True,
        "engineering_verified": False, "production_ready": False,
        "limitations": [
            "Status recognition, not root cause or natural-language reasoning",
            "No real TAC capture, deployment, or service availability proof",
            "No customer data, no pretrained weights, no external inference",
        ],
    }
    dest = Path(output)
    dest.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "weights": model.state_dict(), "config": asdict(config),
        "classes": CLASSES, "manifest": {
            k: report[k] for k in (
                "status", "data_version", "architecture", "params",
                "seed", "steps", "per_class", "train_digest",
                "dev_digest", "heldout_sha256",
                "engineering_verified", "production_ready",
            )
        },
    }, dest)
    dest.with_suffix(".metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "checkpoint": str(dest), "seed": seed, "steps": steps,
        "train": report["train_accuracy"], "dev": report["dev_accuracy"],
        "heldout": {"correct": heldout["correct"], "total": heldout["total"],
                    "accuracy": heldout["accuracy"]},
        "counterfactual": {"correct": paired["correct"], "total": paired["total"]},
        "production_ready": False,
    }), flush=True)
    return report


def main():
    ap = ArgumentParser(description=__doc__)
    ap.add_argument("--steps", type=int, default=600)
    ap.add_argument("--per-class", type=int, default=48)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--context", type=int, default=384)
    ap.add_argument("--width", type=int, default=64)
    ap.add_argument("--layers", type=int, default=2)
    ap.add_argument("--heads", type=int, default=4)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--lr", type=float, default=0.001)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--output", default="/tmp/cisco-bgp-student.pt")
    args = ap.parse_args()
    train(steps=args.steps, per_class=args.per_class, seed=args.seed,
          context=args.context, width=args.width, layers=args.layers,
          heads=args.heads, batch_size=args.batch_size, lr=args.lr,
          threads=args.threads, output=args.output)


if __name__ == "__main__":
    main()
