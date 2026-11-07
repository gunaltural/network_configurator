"""Measure whether a scratch state model is even eligible for a closed pilot.

Acceptance is stricter than syntactic CI success. A low-accuracy model will
report NOT_ELIGIBLE without failing research software-integrity checks.
"""
from argparse import ArgumentParser
from pathlib import Path
import json

from .inference import load_probe, predict
from .state_probe import load_challenge

MIN_RAW_ACCURACY = 0.95
MIN_ACCEPTED_PRECISION = 0.95
MIN_COVERAGE = 0.5

def audit(checkpoint, *, output=None):
    model, tokenizer = load_probe(checkpoint)
    examples = load_challenge()
    raw_correct = accepted = accepted_correct = 0
    errors = []
    for index, (expected, observation) in enumerate(examples, 1):
        result = predict(model, tokenizer, observation)
        top = result["top_candidates"][0]["label"]
        raw_correct += top == expected
        if result["decision"] != "ABSTAIN":
            accepted += 1
            accepted_correct += result["candidate_label"] == expected
            if result["candidate_label"] != expected:
                errors.append({"case": index, "expected": expected,
                               "candidate": result["candidate_label"]})
    total = len(examples)
    raw_accuracy = raw_correct / total
    coverage = accepted / total
    selective_accuracy = accepted_correct / accepted if accepted else None
    meets_gate = (
        raw_accuracy >= MIN_RAW_ACCURACY
        and accepted > 0
        and coverage >= MIN_COVERAGE
        and selective_accuracy is not None
        and selective_accuracy >= MIN_ACCEPTED_PRECISION
    )
    report = {
        "status": "CLOSED_PILOT_ELIGIBLE_FOR_HUMAN_REVIEW" if meets_gate
                  else "NOT_ELIGIBLE_FOR_CLOSED_PILOT",
        "benchmark": "synthetic-frozen-32-state-observations",
        "evaluated_cases": total,
        "raw_correct": raw_correct,
        "raw_accuracy": round(raw_accuracy, 4),
        "accepted_cases": accepted,
        "accepted_correct": accepted_correct,
        "accepted_precision": round(selective_accuracy, 4)
                              if selective_accuracy is not None else None,
        "coverage": round(coverage, 4),
        "incorrect_accepted_cases": errors,
        "required_raw_accuracy": MIN_RAW_ACCURACY,
        "required_accepted_precision": MIN_ACCEPTED_PRECISION,
        "required_coverage": MIN_COVERAGE,
        "engineering_verified": False,
        "root_cause_verified": False,
        "production_ready": False,
        "limitation": ("Synthetic 16-class recognition only. Even a passing pilot "
                       "gate is NOT network diagnosis or production approval. "
                       "Thresholds are policy targets, not calibrated confidence."),
    }
    if output:
        Path(output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                                encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False), flush=True)
    return report

def main():
    ap = ArgumentParser(description=__doc__)
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--output", default="/tmp/network-scratch-pilot-gate.json")
    args = ap.parse_args()
    audit(args.checkpoint, output=args.output)

if __name__ == "__main__":
    main()
