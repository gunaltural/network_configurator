"""Multi-seed comparison of the ACTUAL Cisco BGP causal language model.

Same model architecture, same training examples and BPE merges, different
random weights / batch order. No selective reporting of a lucky checkpoint.
"""
from argparse import ArgumentParser
from pathlib import Path
from statistics import mean, pstdev
import json


def summarize(paths, *, output=None):
    if len(paths) < 2:
        raise ValueError("At least two independently initialized language models required")
    reports = [json.loads(Path(path).read_text(encoding="utf-8")) for path in paths]
    first = reports[0]
    same = (
        "status", "curriculum_version", "data_seed", "architecture",
        "training_sha256", "heldout_sha256", "acceptance_sha256",
        "acceptance_v3_sha256", "tokenizer_mode", "tokenizer_fingerprint",
        "steps", "state_warmup_steps", "state_encoder_pretrain_steps",
    )
    for report in reports:
        if (report.get("status") != "CISCO_BGP_CAUSAL_LM_SCRATCH_ONLY"
                or report.get("production_ready") is not False
                or report.get("engineering_verified") is not False):
            raise ValueError("Only unverified scratch causal models can be compared")
        if any(report.get(field) != first.get(field) for field in same):
            raise ValueError("Incomparable BGP models or evaluation corpora")
        for name in ("heldout_generation", "fresh_acceptance_v2", "fresh_acceptance_v3"):
            result = report.get(name)
            if (not isinstance(result, dict)
                    or result.get("heldout_cases") != 32
                    or any(type(result.get(key)) is not int
                           or not 0 <= result[key] <= 32
                           for key in ("state_correct", "full_format_correct"))
                    or result["full_format_correct"] > result["state_correct"]):
                raise ValueError("Invalid Cisco BGP generated answer scores")
    seeds = [r["seed"] for r in reports]
    if len(seeds) != len(set(seeds)):
        raise ValueError("Duplicate model initialization seeds")
    exact = [r["fresh_acceptance_v3"]["full_format_correct"] / 32 for r in reports]
    state = [r["fresh_acceptance_v3"]["state_correct"] / 32 for r in reports]
    result = {
        "status": "CISCO_BGP_MULTI_SEED_GENERATION_RESEARCH_ONLY",
        "seed_count": len(reports),
        "data_seed": first["data_seed"],
        "parameter_count": first["parameter_count"],
        "tokenizer_fingerprint": first["tokenizer_fingerprint"],
        "heldout_v3_sha256": first["acceptance_v3_sha256"],
        "training_examples": first["training_examples"],
        "v3_state_accuracy_mean": round(mean(state), 4),
        "v3_state_accuracy_std": round(pstdev(state), 4),
        "v3_full_review_accuracy_mean": round(mean(exact), 4),
        "v3_full_review_accuracy_std": round(pstdev(exact), 4),
        "per_seed": [
            {"seed": r["seed"],
             "v3_correct_states": r["fresh_acceptance_v3"]["state_correct"],
             "v3_exact_reviews": r["fresh_acceptance_v3"]["full_format_correct"],
             "v3_cases": 32}
            for r in reports
        ],
        "limitations": ("Original synthetic BGP and canonical short explanations only; "
                        "not vendor-verified diagnosis, root cause, or real-case acceptance."),
        "engineering_verified": False,
        "production_ready": False,
    }
    if output:
        Path(output).write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return result


def main():
    ap = ArgumentParser(description=__doc__)
    ap.add_argument("metric_files", nargs="+")
    ap.add_argument("--output", default="/tmp/cisco-bgp-multi-seed-summary.json")
    args = ap.parse_args()
    summarize(args.metric_files, output=args.output)


if __name__ == "__main__":
    main()
