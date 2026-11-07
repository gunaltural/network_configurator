"""Expose misleading effective sample counts in scratch multi-CLI learning."""
import unittest

from .multicli_diversity import audit_training_diversity


class NormalizedCorpusDiversityTests(unittest.TestCase):
    def test_effective_cli_prompt_diversity_much_lower_than_row_counts(self):
        report = audit_training_diversity()
        self.assertEqual(report["original_records"], 240)
        self.assertEqual(report["normalized_records"], 240)
        self.assertEqual(report["augmented_records"], 960)
        self.assertEqual(report["original_distinct_prompts"], 240)
        self.assertLess(report["normalized_distinct_prompts"], 100)
        self.assertLess(report["augmented_distinct_prompts"], 200)
        self.assertEqual(report["normalized_test_records"], 96)
        self.assertEqual(report["third_cli_prompts_seen_in_augmented_training"], 0)
        self.assertFalse(report["production_ready"])
        self.assertFalse(report["engineering_verified"])

    def test_normalized_test_prompt_overlap_is_not_blind_generalization(self):
        report = audit_training_diversity()
        self.assertGreater(report["normalized_test_prompts_seen_in_training"], 0)
        self.assertGreater(report["normalized_test_distinct_prompts"], 0)
        self.assertEqual(
            set(report["normalized_per_class_unique_prompts"]),
            {
                "ADMIN_DOWN", "ACTIVE_TARGET", "ACTIVE_WRONG_PEER",
                "ZERO_PREFIX", "POSITIVE_PREFIX", "NEXT_HOP_MISSING",
                "NEXT_HOP_PRESENT", "RIB_STATIC_WINS",
            },
        )


if __name__ == "__main__":
    unittest.main()
