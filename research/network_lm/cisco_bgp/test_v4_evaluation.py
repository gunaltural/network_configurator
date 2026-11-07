"""V4 synthetic BGP acceptance tests: withheld source and counterfactual pairs."""
from hashlib import sha256
import unittest

from ..model import ByteTokenizer
from .module_lm import load_owned_module_cases, grade_focused
from .v4_evaluation import ROOT, load_v4_holdout


class V4UnseenTopologyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old, cls.source_sha = load_owned_module_cases()
        cls.records, cls.v4_sha = load_v4_holdout(source_sha=cls.source_sha)

    def test_v4_not_in_training_and_new_ownership_parameters(self):
        self.assertEqual(len(self.records), 144)
        self.assertEqual(len(self.v4_sha), 64)
        existing_prompts = {
            x.prompt for key in ("train", "val", "test") for x in self.old[key]
        }
        existing_groups = {
            x.scenario_id for key in ("train", "val", "test") for x in self.old[key]
        }
        self.assertTrue({x.prompt for x in self.records}.isdisjoint(existing_prompts))
        self.assertTrue({x.scenario_id for x in self.records}.isdisjoint(existing_groups))
        self.assertEqual(len({x.id for x in self.records}), len(self.records))
        self.assertTrue(all(x.split == "test" for x in self.records))
        self.assertTrue(all("65120" in x.prompt or
                            any("6512" + str(i) in x.prompt for i in range(1, 6))
                            for x in self.records))

    def test_v4_counterfactual_evaluation_refuses_constant_prediction(self):
        tok = ByteTokenizer()

        class ConstantModel:
            config = type("Config", (), {"block_size": 2048})()

            def eval(self):
                return self

            def complete(self, prefix, max_new_tokens=100):
                return prefix + tok.encode(
                    "RESULT=ISP1\nLIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING"
                )

        scores = grade_focused(
            ConstantModel(), tok, self.records,
            contrast_prefix="novel-", contrast_variants=6,
        )
        self.assertEqual(scores["cases"], 144)
        self.assertEqual(scores["counterfactual_exit_pairs"]["total"], 18)
        self.assertEqual(scores["counterfactual_exit_pairs"]["changed_output"], 0)
        self.assertEqual(scores["counterfactual_exit_pairs"]["both_correct"], 0)
        self.assertFalse(scores["production_ready"])

    def test_v4_rejects_unrelated_engine_hash(self):
        with self.assertRaisesRegex(ValueError, "checksum"):
            load_v4_holdout(source_sha="0" * 64)


if __name__ == "__main__":
    unittest.main()
