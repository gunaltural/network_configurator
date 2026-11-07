"""Random-init Cisco BGP multi-CLI explanation LM: genuine causal generation.

Independent from live Network Configurator, Render and AI Analysis.
The model MUST generate its own finding, rationale, uncertainty boundary and
next check. No diagnostic rules or reference targets are called in inference.
All test data is authored synthetic; this is NOT a Cisco production assessment.
"""
from argparse import ArgumentParser
from collections import Counter
from dataclasses import asdict
from hashlib import sha256
from pathlib import Path
import json
import random

import torch

from ..data import encode_example
from ..model import LMConfig, ScratchNetworkLM
from ..train import batch, validate
from .multicli_curriculum import (
    CURRICULUM_VERSION, KINDS, SOURCE_IDS, TARGET, dataset, fingerprint,
)
from .tokenizer import train_bpe
from .multicli_abstraction import abstract_record
from .multicli_holdout_v2 import holdout
from .multicli_views import train_views, v3_view

ROOT = Path(__file__).resolve().parent
EVIDENCE_FIELDS = ("FINDING", "WHY", "NOT_PROVEN", "CHECK")
PAIRS = (
    ("ACTIVE_TARGET", "ACTIVE_WRONG_PEER"),
    ("ZERO_PREFIX", "POSITIVE_PREFIX"),
    ("NEXT_HOP_MISSING", "NEXT_HOP_PRESENT"),
)


def prompt_tokens(tok, text):
    return tok.encode(
        "Network observation:\n" + text + "\nEngineering review:\n",
        bos=True,
    )


def _parse_lines(value):
    parsed = {}
    lines = value.strip().splitlines()
    for line in lines:
        if "=" not in line:
            continue
        key, answer = line.split("=", 1)
        if key in EVIDENCE_FIELDS:
            if key in parsed:
                parsed[key] = None  # Duplicates are invalid, not extra evidence.
            else:
                parsed[key] = answer
    return parsed


@torch.no_grad()
def evaluate(model, tok, records, *, max_new_tokens=160):
    model.eval()
    scores = {k: 0 for k in EVIDENCE_FIELDS}
    full = 0
    detail = []
    by_kind = Counter()
    totals = Counter()
    samples = []
    for record in records:
        prefix = prompt_tokens(tok, record.example.prompt)
        if len(prefix) > model.config.block_size:
            raise ValueError("Model context too small for the heldout multi-CLI prompt")
        full_tokens = model.complete(prefix, max_new_tokens=max_new_tokens)
        produced = tok.decode(full_tokens[len(prefix):]).strip()
        actual = _parse_lines(produced)
        expected = _parse_lines(record.example.completion)
        for field in EVIDENCE_FIELDS:
            scores[field] += actual.get(field) is not None and actual.get(field) == expected[field]
        finding_correct = actual.get("FINDING") == expected["FINDING"]
        by_kind[record.kind] += int(finding_correct)
        totals[record.kind] += 1
        complete = produced == record.example.completion
        full += int(complete)
        detail.append({
            "id": record.example.id, "kind": record.kind,
            "expected": expected["FINDING"],
            "predicted": actual.get("FINDING"),
            "correct": bool(finding_correct), "full": bool(complete),
        })
        if len(samples) < 8:
            samples.append({
                "case": record.example.id,
                "expected": record.example.completion,
                "generated": produced[:500],
            })
    index = {(x["id"].rsplit("-", 1)[0], x["kind"]): x for x in detail}
    # All three pairs have the same target neighbor and target prefix, with
    # relevant CLI evidence altered to require a different finding.
    contrasts = []
    for split_number in sorted({
        x["id"].split("-")[2] for x in detail
    }):
        prefix = "evidence-test-" + split_number
        for left, right in PAIRS:
            a = index.get((prefix, left))
            b = index.get((prefix, right))
            if a is None or b is None:
                continue
            if a["expected"] == b["expected"]:
                raise ValueError("Counterfactual pair has same expected finding")
            contrasts.append({
                "left": left, "right": right, "case": split_number,
                "both_correct": bool(a["correct"] and b["correct"]),
                "prediction_changed": a["predicted"] != b["predicted"],
            })
    return {
        "total": len(records),
        "finding_correct": scores["FINDING"],
        "exact_explanation": full,
        "fields_correct": scores,
        "by_kind": {
            key: {"correct": by_kind[key], "total": totals[key]}
            for key in KINDS
        },
        "paired_contrasts": {
            "total": len(contrasts),
            "both_correct": sum(x["both_correct"] for x in contrasts),
            "prediction_changed": sum(x["prediction_changed"] for x in contrasts),
        },
        "first_samples": samples,
        "production_ready": False,
        "engineering_verified": False,
    }


def train(*, seed=42, steps=800, width=96, layers=2, heads=4,
          context=512, vocab_size=512, batch_size=6, threads=2,
          abstract_identities=False, augment_views=False,
          output="/tmp/cisco-bgp-multicli.pt"):
    if not 1 <= steps <= 4000 or not 1 <= batch_size <= 32:
        raise ValueError("Invalid training budget")
    if type(abstract_identities) is not bool or type(augment_views) is not bool:
        raise ValueError("Invalid synthetic curriculum controls")
    if not 1 <= threads <= 8:
        raise ValueError("Invalid CPU thread configuration")
    torch.manual_seed(seed)
    torch.set_num_threads(threads)
    torch.use_deterministic_algorithms(True)
    rng = random.Random(seed)
    records = dataset()
    v2_original, v2_raw_fingerprint = holdout()
    v3_original = [v3_view(x) for x in dataset()["test"]]
    v3_raw_fingerprint = fingerprint(v3_original)
    if abstract_identities:
        records = {
            split: [abstract_record(x) for x in items]
            for split, items in records.items()
        }
        v2 = [abstract_record(x) for x in v2_original]
        v3 = [abstract_record(x) for x in v3_original]
    else:
        v2 = v2_original
        v3 = v3_original
    # Crucial: evaluation-only alternate CLI examples, after normalization,
    # must not appear in the exact TRAIN or validation input set.
    train_prompts = {x.example.prompt for x in records["train"] + records["val"]}
    if any(x.example.prompt in train_prompts for x in v2 + v3):
        raise ValueError("Alternative-command BGP holdout leaked into training")
    catalog = json.loads((ROOT / "source_catalog.json").read_text(encoding="utf-8"))
    allowed = {s["id"] for s in catalog["sources"]}
    if any(source not in allowed for ids in SOURCE_IDS.values() for source in ids):
        raise ValueError("Evidence source missing from Cisco catalog")
    training = records["train"]
    if augment_views:
        training = [variant for row in training for variant in train_views(row)]
        heldout_prompts = {x.example.prompt for x in v3}
        if any(x.example.prompt in heldout_prompts for x in training):
            raise ValueError("Multi-view training contaminated third CLI-format test")
    # Strictly original TRAIN strings; never fit BPE on validation/test CLI
    # or labels. Prefix and suffix are separate documents.
    documents = [
        text for x in training for text in (
            "Network observation:\n" + x.example.prompt + "\nEngineering review:\n",
            x.example.completion,
        )
    ]
    tokenizer = train_bpe(documents, vocab_size=vocab_size)
    config = LMConfig(
        block_size=context, width=width, layers=layers,
        heads=heads, vocab_size=tokenizer.vocab_size,
    )
    config.validate()
    train_data = [
        encode_example(x.example, tokenizer, context) for x in training
    ]
    valid_data = [
        encode_example(x.example, tokenizer, context) for x in records["val"]
    ]
    model = ScratchNetworkLM(config)
    before = validate(model, valid_data, torch.device("cpu"))
    optim = torch.optim.AdamW(model.parameters(), lr=0.001)
    order = list(range(len(train_data)))
    rng.shuffle(order)
    ptr, first_loss, final_loss = 0, None, None
    for _ in range(steps):
        picks = []
        for __ in range(batch_size):
            if ptr == len(order):
                rng.shuffle(order)
                ptr = 0
            picks.append(order[ptr])
            ptr += 1
        x, y = batch(train_data, picks, torch.device("cpu"))
        model.train()
        optim.zero_grad(set_to_none=True)
        _, loss = model(x, y)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1)
        optim.step()
        if first_loss is None:
            first_loss = round(float(loss.item()), 6)
        final_loss = round(float(loss.item()), 6)
    after = validate(model, valid_data, torch.device("cpu"))
    # No scripted fallback: full autogeneration from random-init weights.
    scored = evaluate(model, tokenizer, records["test"])
    v2_scored = evaluate(model, tokenizer, v2)
    v3_scored = evaluate(model, tokenizer, v3)
    if (scored["paired_contrasts"]["total"] != 36
            or v2_scored["paired_contrasts"]["total"] != 36
            or v3_scored["paired_contrasts"]["total"] != 36):
        raise ValueError("Multi-CLI paired counterfactual coverage is incomplete")
    references = Counter(TARGET[k][0] for k in KINDS)
    majority = sorted(references, key=lambda x: (-references[x], x))[0]
    baseline_correct = sum(
        x.example.completion.splitlines()[0] == majority
        for x in records["test"]
    )
    report = {
        "status": "CISCO_BGP_MULTI_CLI_GENERATIVE_RESEARCH_ONLY",
        "curriculum_version": CURRICULUM_VERSION,
        "seed": seed, "steps": steps,
        "abstract_identities": abstract_identities,
        "augment_training_views": augment_views,
        "configuration": asdict(config),
        "parameter_count": sum(p.numel() for p in model.parameters()),
        "train_samples": len(training),
        "val_samples": len(records["val"]),
        "test_samples": len(records["test"]),
        "training_sha256": fingerprint(training),
        "validation_sha256": fingerprint(records["val"]),
        "heldout_sha256": fingerprint(records["test"]),
        "new_alternate_cli_sha256": v2_raw_fingerprint,
        "new_alternate_cli_view_sha256": fingerprint(v2),
        "third_cli_holdout_sha256": v3_raw_fingerprint,
        "third_cli_holdout_view_sha256": fingerprint(v3),
        "tokenizer_sha256": tokenizer.fingerprint(),
        "data_source_ids": sorted(allowed),
        "torch": torch.__version__,
        "deterministic_algorithms": torch.are_deterministic_algorithms_enabled(),
        "first_train_token_loss": first_loss,
        "last_train_token_loss": final_loss,
        "val_token_loss_before": before,
        "val_token_loss_after": after,
        "majority_reference_correct": baseline_correct,
        "majority_reference_total": len(records["test"]),
        "heldout_generation": scored,
        "new_alternate_cli_generation": v2_scored,
        "third_cli_holdout_generation": v3_scored,
        "limitations": (
            "Entirely original-synthetic CLI snippets; not real Cisco operations, "
            "complete root-cause diagnoses or cross-platform BGP engineering. "
            "Exact explanation matches represent only canonical targets."
        ),
        "engineering_verified": False,
        "production_ready": False,
    }
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "weights": model.state_dict(), "config": asdict(config),
        "tokenizer": tokenizer.to_manifest(),
        "manifest": {
            "status": report["status"], "seed": seed,
            "train_sha256": report["training_sha256"],
            "heldout_sha256": report["heldout_sha256"],
            "new_alternate_cli_sha256": v2_raw_fingerprint,
            "third_cli_holdout_sha256": v3_raw_fingerprint,
            "abstract_identities": abstract_identities,
            "augment_training_views": augment_views,
            "tokenizer_sha256": report["tokenizer_sha256"],
            "parameter_count": report["parameter_count"],
            "engineering_verified": False, "production_ready": False,
        },
    }, path)
    path.with_suffix(".metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "mode": report["status"], "seed": seed,
        "parameters": report["parameter_count"],
        "val_loss": after,
        "correct_finding": scored["finding_correct"],
        "exact_full_explanation": scored["exact_explanation"],
        "alt_cli_correct_finding": v2_scored["finding_correct"],
        "alt_cli_exact_explanation": v2_scored["exact_explanation"],
        "third_cli_finding": v3_scored["finding_correct"],
        "third_cli_full_explanation": v3_scored["exact_explanation"],
        "total": scored["total"],
        "paired_both_correct": scored["paired_contrasts"]["both_correct"],
        "paired_total": scored["paired_contrasts"]["total"],
        "reference_correct": baseline_correct,
        "production_ready": False,
    }), flush=True)
    return report


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--steps", type=int, default=800)
    parser.add_argument("--width", type=int, default=96)
    parser.add_argument("--layers", type=int, default=2)
    parser.add_argument("--heads", type=int, default=4)
    parser.add_argument("--context", type=int, default=512)
    parser.add_argument("--vocab-size", type=int, default=512)
    parser.add_argument("--batch-size", type=int, default=6)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--abstract-identities", action="store_true")
    parser.add_argument("--augment-views", action="store_true")
    parser.add_argument("--output", default="/tmp/cisco-bgp-multicli.pt")
    a = parser.parse_args()
    train(
        seed=a.seed, steps=a.steps, width=a.width, layers=a.layers,
        heads=a.heads, context=a.context, vocab_size=a.vocab_size,
        batch_size=a.batch_size, threads=a.threads,
        abstract_identities=a.abstract_identities,
        augment_views=a.augment_views, output=a.output,
    )


if __name__ == "__main__":
    main()
