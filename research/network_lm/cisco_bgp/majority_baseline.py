"""Non-neural reference benchmark for the original BGP simulator research.

This never generates model answers or updates neural weights. It predicts the
most frequent training outcome for each of four question types, so research
cannot mistake learning a common label for causal reasoning.
"""
from argparse import ArgumentParser
from collections import Counter
from pathlib import Path
import json

from .module_lm import FIELDS, focused_cases, load_owned_module_cases
from .v4_evaluation import load_v4_holdout


def majority_reference(*, output=None):
    corpus, source_sha = load_owned_module_cases()
    train = focused_cases(corpus["train"])
    test = focused_cases(corpus["test"])
    v4_test, v4_digest = load_v4_holdout(source_sha=source_sha)
    choices = {}
    for field in FIELDS[:4]:
        counts = Counter(
            example.completion.splitlines()[0].split("=", 1)[1]
            for example in train
            if example.id.endswith("-" + field)
        )
        if not counts:
            raise ValueError("Missing training labels for reference field")
        choices[field] = sorted(counts, key=lambda x: (-counts[x], x))[0]
    def evaluate_majority(heldout, expected_per_field):
        matched, total = Counter(), Counter()
        for example in heldout:
            field = example.id.rsplit("-", 1)[1]
            actual = example.completion.splitlines()[0].split("=", 1)[1]
            matched[field] += int(choices[field] == actual)
            total[field] += 1
        if any(total[f] != expected_per_field for f in FIELDS[:4]):
            raise ValueError("Wrong number of synthetic heldout references")
        return matched, total
    matched, total = evaluate_majority(test, 24)
    v4_matched, v4_total = evaluate_majority(v4_test, 36)
    result = {
        "status": "SYNTHETIC_MAJORITY_REFERENCE_NOT_A_MODEL",
        "source_sha256": source_sha,
        "train_cases": len(train),
        "heldout_cases": len(test),
        "reference_choices": choices,
        "per_field": {
            field: {"correct": matched[field], "total": total[field]}
            for field in FIELDS[:4]
        },
        "correct": sum(matched.values()),
        "total": len(test),
        "accuracy": round(sum(matched.values()) / len(test), 4),
        "novel_topology_v4": {
            "sha256": v4_digest,
            "correct": sum(v4_matched.values()),
            "total": len(v4_test),
            "accuracy": round(sum(v4_matched.values()) / len(v4_test), 4),
            "per_field": {
                f: {"correct": v4_matched[f], "total": v4_total[f]}
                for f in FIELDS[:4]
            },
        },
        "caution": ("This majority-label reference does not understand BGP. "
                    "A scratch LM below this accuracy cannot claim useful "
                    "compositional generalization."),
        "engineering_verified": False,
        "production_ready": False,
    }
    if output:
        Path(output).write_text(
            json.dumps(result, indent=2) + "\n", encoding="utf-8",
        )
    print(json.dumps(result), flush=True)
    return result


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="/tmp/bgp-majority-reference.metrics.json")
    args = parser.parse_args()
    majority_reference(output=args.output)


if __name__ == "__main__":
    main()
