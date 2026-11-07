"""Compare two scratch experiments without mislabeling language competence.

Training loss, held-out token loss and lexical proxies are independent metrics.
None qualifies the model as a production network analysis provider.
"""
from argparse import ArgumentParser
import json
from pathlib import Path


def _read(checkpoint, suffix):
    return json.loads(Path(checkpoint).with_suffix(suffix).read_text(encoding="utf-8"))


def compare(baseline, candidate):
    first, second = (_read(baseline, ".metrics.json"),
                     _read(candidate, ".metrics.json"))
    if (first.get("engineering_verified") is not False or
            second.get("engineering_verified") is not False or
            first.get("production_ready") is not False or
            second.get("production_ready") is not False):
        raise ValueError("Only non-production research runs may be compared")
    if (first["architecture"] != second["architecture"] or
            first["corpus_sha256"] != second["corpus_sha256"] or
            first["heldout_scenarios"] != second["heldout_scenarios"]):
        raise ValueError("Comparison requires identical architecture and blind heldout data")
    if (first["curriculum_count"] != 0 or
            second["curriculum_count"] <= first["curriculum_count"]):
        raise ValueError("Expected baseline without curriculum and augmented candidate")
    b_eval, c_eval = (_read(baseline, ".evaluation.json"),
                      _read(candidate, ".evaluation.json"))
    b_counter, c_counter = (_read(baseline, ".counterfactual.json"),
                            _read(candidate, ".counterfactual.json"))
    if (b_eval["heldout_cases"] != c_eval["heldout_cases"] or
            b_counter["pair_count"] != c_counter["pair_count"]):
        raise ValueError("Comparison evaluation suites must match")
    if any(x.get("engineering_verified") is not False
           for x in (b_eval, c_eval, b_counter, c_counter)):
        raise ValueError("Engineering acceptance cannot be inferred from proxies")

    report = {
        "status": "SCRATCH_RESEARCH_DIAGNOSTICS_ONLY",
        "baseline_training_steps": first["steps"],
        "candidate_training_steps": second["steps"],
        "baseline_training_examples": first["train_example_count"],
        "candidate_training_examples": second["train_example_count"],
        "parameter_count": first["parameter_count"],
        "heldout_loss_baseline": first["heldout_loss_after"],
        "heldout_loss_candidate": second["heldout_loss_after"],
        "heldout_loss_delta": round(
            second["heldout_loss_after"] - first["heldout_loss_after"], 6),
        "lexical_holdout_baseline": b_eval["lexical_proxy_pass_count"],
        "lexical_holdout_candidate": c_eval["lexical_proxy_pass_count"],
        "lexical_holdout_total": c_eval["heldout_cases"],
        "counterfactual_baseline": b_counter["lexical_contrast_pass_count"],
        "counterfactual_candidate": c_counter["lexical_contrast_pass_count"],
        "counterfactual_total": c_counter["pair_count"],
        "confounded_comparison": "Training steps AND number of synthetic examples differ; do not attribute changes solely to curriculum.",
        "engineering_verified": False,
        "production_ready": False,
    }
    target = Path(candidate).with_suffix(".comparison.json")
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report), flush=True)
    return report


def parser():
    ap = ArgumentParser(description=__doc__)
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--candidate", required=True)
    return ap


if __name__ == "__main__":
    args = parser().parse_args()
    compare(args.baseline, args.candidate)
