"""Measure effective information diversity after synthetic peer-ID abstraction.

Counts example rows AND distinct model prompts: a model can see 960 rows
while learning only a few unique CLI observations. Train/test isolation by
scenario IDs is insufficient once many addresses are normalized away.
This non-neural audit never reads gradients, scores models, or injects
ground-truth answers into the inference path.
"""
from collections import Counter
import json

from .multicli_curriculum import KINDS, dataset
from .multicli_abstraction import abstract_record
from .multicli_views import train_views, v3_view


def audit_training_diversity():
    data = dataset()
    original_train = data["train"]
    standardized_train = [abstract_record(x) for x in original_train]
    augmented_train = [
        alternate
        for row in standardized_train
        for alternate in train_views(row)
    ]
    standardized_test = [abstract_record(x) for x in data["test"]]
    third_test = [abstract_record(v3_view(x)) for x in data["test"]]

    def prompts(rows):
        return {x.example.prompt for x in rows}

    unique_raw = prompts(original_train)
    unique_abstracted = prompts(standardized_train)
    unique_augmented = prompts(augmented_train)
    unique_test_abstracted = prompts(standardized_test)
    unique_v3 = prompts(third_test)
    per_kind = {
        kind: len(prompts([x for x in standardized_train if x.kind == kind]))
        for kind in KINDS
    }
    result = {
        "status": "SYNTHETIC_BGP_TRAIN_DIVERSITY_AUDIT_NOT_A_MODEL",
        "original_records": len(original_train),
        "original_distinct_prompts": len(unique_raw),
        "normalized_records": len(standardized_train),
        "normalized_distinct_prompts": len(unique_abstracted),
        "augmented_records": len(augmented_train),
        "augmented_distinct_prompts": len(unique_augmented),
        "normalized_per_class_unique_prompts": per_kind,
        "normalized_test_records": len(standardized_test),
        "normalized_test_distinct_prompts": len(unique_test_abstracted),
        "normalized_test_prompts_seen_in_training": len(
            unique_test_abstracted & unique_abstracted
        ),
        "third_cli_distinct_prompts": len(unique_v3),
        "third_cli_prompts_seen_in_augmented_training": len(
            unique_v3 & unique_augmented
        ),
        "note": (
            "Training samples are not independent evidence after role "
            "normalization. Fully repeated abstracted test prompts must not "
            "be called blind generalization. Third CLI format is a new view "
            "of the same original eight synthetic semantic classes, not a "
            "real-world unseen protocol/device test."
        ),
        "production_ready": False,
        "engineering_verified": False,
    }
    if result["augmented_distinct_prompts"] >= result["augmented_records"]:
        raise ValueError("Expected synthetic template duplication did not occur")
    if result["third_cli_prompts_seen_in_augmented_training"]:
        raise ValueError("Third format leaked into augmented synthetic training")
    return result


if __name__ == "__main__":
    print(json.dumps(audit_training_diversity(), indent=2, sort_keys=True))
