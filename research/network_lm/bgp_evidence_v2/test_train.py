"""Test genuine generated text grading, strict holdout integrity and baselines."""
from collections import Counter
import unittest

import torch

from ..model import ByteTokenizer
from .curriculum import FIELDS, SPLIT_CONTEXTS, KINDS, cases, tasks, report
from .train import test_model_generation, _train


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
