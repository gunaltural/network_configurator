"""Closed-pilot scoring must never turn synthetic model accuracy into diagnosis."""
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

from .pilot_gate import audit
from .state_probe import load_challenge, train_probe


class PilotGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.checkpoint = Path(cls.temp.name) / "probe.pt"
        train_probe(steps=1, samples_per_state=1, seed=31,
                    width=32, layers=1, heads=4, batch_size=2,
                    output=str(cls.checkpoint), threads=2)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_real_tiny_model_is_not_a_production_diagnosis(self):
        metrics = audit(self.checkpoint)
        self.assertEqual(metrics["evaluated_cases"], 32)
        self.assertEqual(metrics["status"], "NOT_ELIGIBLE_FOR_CLOSED_PILOT")
        self.assertFalse(metrics["engineering_verified"])
        self.assertFalse(metrics["production_ready"])
        self.assertFalse(metrics["root_cause_verified"])

    def test_even_perfect_synthetic_scores_only_allow_human_review(self):
        answers = {observation: state for state, observation in load_challenge()}
        def synthetic_perfect(model, tokenizer, observation):
            label = answers[observation]
            return {"top_candidates": [{"label": label}],
                    "decision": "RESEARCH_CANDIDATE_ONLY",
                    "candidate_label": label}
        with patch("research.network_lm.pilot_gate.predict",
                   side_effect=synthetic_perfect):
            metrics = audit(self.checkpoint)
        self.assertEqual(metrics["raw_correct"], 32)
        self.assertEqual(metrics["accepted_cases"], 32)
        self.assertEqual(metrics["status"], "CLOSED_PILOT_ELIGIBLE_FOR_HUMAN_REVIEW")
        self.assertFalse(metrics["production_ready"])
        self.assertFalse(metrics["engineering_verified"])

    def test_all_abstention_is_not_success(self):
        with patch("research.network_lm.pilot_gate.predict", return_value={
            "top_candidates": [{"label": "ospf-exstart"}],
            "decision": "ABSTAIN", "candidate_label": None,
        }):
            metrics = audit(self.checkpoint)
        self.assertEqual(metrics["accepted_cases"], 0)
        self.assertIsNone(metrics["accepted_precision"])
        self.assertEqual(metrics["status"], "NOT_ELIGIBLE_FOR_CLOSED_PILOT")


if __name__ == "__main__":
    unittest.main()
