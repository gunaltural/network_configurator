"""Test genuine generated text grading, strict holdout integrity and baselines."""
from collections import Counter
import unittest

import torch

from ..model import ByteTokenizer
from .curriculum import FIELDS, SPLIT_CONTEXTS, KINDS, cases, tasks, report
from .train import test_model_generation, BalancedEvidenceSampler, evaluate_insufficient_evidence
from .abstention_curriculum import (
    UNKNOWN_KIND, GAPS, cases as uncertainty_cases, field_tasks as uncertainty_tasks
)


class EvidenceLearningTests(unittest.TestCase):
    def test_finding_constant_predictions_do_not_pass_counterfactuals(self):
        data = cases()
        heldout = tasks(data["test"])
        tok = ByteTokenizer()

        class Constant:
            config = type("ModelConfig", (), {"block_size": 2048})()
            def eval(self):
                return self
            def complete(self, token_ids, max_new_tokens=100):
                return token_ids + tok.encode("FINDING=ADMIN_DISABLED")

        scored = test_model_generation(Constant(), tok, heldout, limit=30)
        self.assertEqual(scored["field_tasks"], 384)
        self.assertEqual(scored["incidents"], 96)
        self.assertEqual(scored["by_field"]["FINDING"]["first_line_correct"], 12)
        self.assertEqual(scored["all_four_fields_correct"], 0)
        self.assertEqual(scored["counterfactual_finding"]["total_pairs"], 36)
        self.assertEqual(scored["counterfactual_finding"]["both_correct"], 0)
        self.assertEqual(scored["counterfactual_finding"]["prediction_changed"], 0)
        self.assertFalse(scored["production_ready"])

    def test_balanced_sampler_rotates_output_fields_and_all_eight_classes(self):
        training=tasks(cases()["train"])
        a=BalancedEvidenceSampler(training, seed=42)
        b=BalancedEvidenceSampler(training, seed=42)
        for step in range(36):
            indices=a.indices(step)
            self.assertEqual(indices,b.indices(step))
            self.assertEqual(len(indices),8)
            self.assertEqual(len(set(indices)),8)
            selected=[training[index] for index in indices]
            expected_field=FIELDS[step % len(FIELDS)]
            self.assertEqual(
                {item.id.rsplit("-",1)[-1] for item in selected},
                {expected_field},
            )
            self.assertEqual(
                {item.id.rsplit("-",2)[-2] for item in selected},
                set(KINDS),
            )
        with self.assertRaisesRegex(ValueError,"Invalid"):
            a.indices(-1)

    def test_9_class_sampler_balances_uncertainty_without_hiding_original_classes(self):
        training=tasks(cases()["train"])+uncertainty_tasks(uncertainty_cases()["train"])
        a=BalancedEvidenceSampler(training,seed=42,include_unknown=True)
        b=BalancedEvidenceSampler(training,seed=42,include_unknown=True)
        observed=Counter()
        observed_fields=Counter()
        for step in range(72):
            selected=a.indices(step)
            self.assertEqual(selected,b.indices(step))
            self.assertEqual(len(selected),8)
            self.assertEqual(len(set(selected)),8)
            kinds=[UNKNOWN_KIND if "-"+UNKNOWN_KIND+"-" in training[i].id
                   else next(k for k in KINDS if training[i].id.endswith(
                       "-"+k+"-"+FIELDS[step%4]))
                   for i in selected]
            self.assertEqual(len(set(kinds)),8)
            observed.update(kinds)
            field=FIELDS[step%4]
            self.assertEqual({training[i].id.rsplit("-",1)[-1] for i in selected},
                             {field})
            observed_fields[field]+=1
        self.assertEqual(set(observed),set(KINDS)|{UNKNOWN_KIND})
        self.assertEqual(set(observed_fields),set(FIELDS))
        self.assertEqual(len(set(observed_fields.values())),1)
        self.assertEqual(len(set(observed.values())),1)

    def test_grade_unknown_keeps_four_fields_and_penalizes_constant_finding(self):
        tokens=ByteTokenizer()
        class Constant:
            config=type("Config",(),{"block_size":2048})()
            def eval(self):return self
            def complete(self,prompt,max_new_tokens=100):
                return prompt+tokens.encode("FINDING=EVIDENCE_INSUFFICIENT")
        unknown=uncertainty_tasks(uncertainty_cases()["test"])
        report=evaluate_insufficient_evidence(Constant(),tokens,unknown,limit=40)
        self.assertEqual(report["field_tasks"],240)
        self.assertEqual(report["incidents"],60)
        self.assertEqual(report["by_field"]["FINDING"]["correct"],60)
        self.assertEqual(report["by_field"]["WHY"]["correct"],0)
        self.assertEqual(report["all_four_correct"],0)
        self.assertEqual(set(report["by_gap"]),set(GAPS))
        for gap in GAPS:
            self.assertEqual(report["by_gap"][gap]["FINDING"],
                             {"correct":12,"total":12})
            self.assertEqual(report["by_gap"][gap]["WHY"],
                             {"correct":0,"total":12})
        self.assertFalse(report["production_ready"])

    def test_training_and_test_are_distinct_factor_combinations(self):
        x=report()
        self.assertEqual(x["total_contexts"], 48)
        self.assertEqual(x["cases"], {"train":224,"val":64,"test":96})
        self.assertEqual(x["field_tasks"], {"train":896,"val":256,"test":384})
        self.assertEqual(x["unique_case_prompts"], x["cases"])
        self.assertEqual(x["unique_field_prompts"], x["field_tasks"])
        self.assertEqual(len(x["train_sha256"]), 64)
        self.assertEqual(len(x["val_sha256"]), 64)
        self.assertEqual(len(x["test_sha256"]), 64)
        self.assertEqual(len(set(SPLIT_CONTEXTS["train"])), 28)
        self.assertEqual(len(set(SPLIT_CONTEXTS["test"])), 12)
        self.assertFalse(x["engineering_verified"])


if __name__ == "__main__":
    unittest.main()
