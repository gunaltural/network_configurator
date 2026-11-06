"""Aggregate scratch state-probe results across independent random seeds.

A single favorable seed is not evidence of reliable engineering reasoning.
This report is intentionally labelled research-only and includes failure rates.
"""
from argparse import ArgumentParser
from pathlib import Path
import json
from statistics import mean, pstdev


def summarize(paths, output=None):
    if len(paths) < 2:
        raise ValueError("At least two independently trained seeds required")
    entries = [json.loads(Path(p).read_text(encoding="utf-8")) for p in paths]
    seeds = [m.get("seed") for m in entries]
    if len(set(seeds)) != len(seeds):
        raise ValueError("Random seeds must be distinct")
    base = entries[0]
    invariants = (
        "architecture", "curriculum_version", "steps", "train_cases",
        "frozen_challenge_cases", "challenge_sha256", "transfer_sha256",
    )
    for item in entries:
        if (item.get("status") != "SCRATCH_STATE_RECOGNITION_RESEARCH_ONLY" or
                item.get("engineering_verified") is not False or
                item.get("production_ready") is not False):
            raise ValueError("Only unverified scratch research results are accepted")
        if any(item.get(key) != base.get(key) for key in invariants):
            raise ValueError("Not comparable: model, curriculum or challenge differs")
        if (item.get("frozen_challenge_cases") != 32 or
                item.get("template_transfer_cases") != 16):
            raise ValueError("Required frozen evaluation coverage missing")
        for name, total in (("challenge_after", 32), ("template_after", 16)):
            metric = item.get(name)
            if (not isinstance(metric, dict) or metric.get("total") != total or
                    not isinstance(metric.get("correct"), int) or
                    not 0 <= metric["correct"] <= total):
                raise ValueError("Invalid probe evaluation metric")
    challenge = [m["challenge_after"]["correct"] / 32 for m in entries]
    transfer = [m["template_after"]["correct"] / 16 for m in entries]
    report = {
        "status": "MULTI_SEED_SYNTHETIC_STATE_RECOGNITION_ONLY",
        "seed_count": len(entries),
        "seeds": seeds,
        "training_examples_per_seed": base["train_cases"],
        "optimizer_steps_per_seed": base["steps"],
        "frozen_challenge_cases": 32,
        "challenge_sha256": base["challenge_sha256"],
        "chance_level_balanced_16_class": 1 / 16,
        "challenge_accuracy_mean": round(mean(challenge), 4),
        "challenge_accuracy_std": round(pstdev(challenge), 4),
        "challenge_accuracy_min": round(min(challenge), 4),
        "challenge_accuracy_max": round(max(challenge), 4),
        "template_transfer_accuracy_mean": round(mean(transfer), 4),
        "per_seed": [
            {"seed": m["seed"], "challenge_correct": m["challenge_after"]["correct"],
             "challenge_total": 32,
             "template_correct": m["template_after"]["correct"],
             "template_total": 16}
            for m in entries
        ],
        "limitation": "Synthetic status classification and reused templates; no network diagnosis, model calibration or expert validation.",
        "engineering_verified": False,
        "production_ready": False,
    }
    if output:
        Path(output).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report), flush=True)
    return report


def parser():
    ap = ArgumentParser(description=__doc__)
    ap.add_argument("metric_files", nargs="+")
    ap.add_argument("--output", default="/tmp/network-state-seeds.summary.json")
    return ap


if __name__ == "__main__":
    args = parser().parse_args()
    summarize(args.metric_files, args.output)
