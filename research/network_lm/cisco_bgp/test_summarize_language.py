"""Proof that cross-seed metrics refer to one fixed synthetic corpus."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest

from .summarize_language import summarize


def fake(seed, state, exact):
    return {
        "status": "CISCO_BGP_CAUSAL_LM_SCRATCH_ONLY",
        "curriculum_version": "v1", "data_seed": 42,
        "seed": seed, "steps": 900, "state_warmup_steps": 0,
        "state_encoder_pretrain_steps": 0, "architecture": {"width": 128},
        "parameter_count": 758912, "training_examples": 384,
        "training_sha256": "train", "heldout_sha256": "v1",
        "acceptance_sha256": "v2", "acceptance_v3_sha256": "v3",
        "tokenizer_mode": "bpe", "tokenizer_fingerprint": "same-bpe",
        "heldout_generation": {"heldout_cases": 32, "state_correct": state,
                               "full_format_correct": exact},
        "fresh_acceptance_v2": {"heldout_cases": 32, "state_correct": state,
                                "full_format_correct": exact},
        "fresh_acceptance_v3": {"heldout_cases": 32, "state_correct": state,
                                "full_format_correct": exact},
        "engineering_verified": False, "production_ready": False,
    }


class CausalSeedSummaryTests(unittest.TestCase):
    def test_all_seeds_comparable_and_research_only(self):
        with TemporaryDirectory() as d:
            files = [Path(d) / f"{s}.json" for s in (42, 7, 99)]
            for p, report in zip(files, (fake(42, 22, 15), fake(7, 24, 18),
                                         fake(99, 20, 11))):
                p.write_text(json.dumps(report))
            result = summarize(files)
            self.assertEqual(result["seed_count"], 3)
            self.assertEqual(result["v3_state_accuracy_mean"], round(22/32, 4))
            self.assertFalse(result["engineering_verified"])
            self.assertFalse(result["production_ready"])

    def test_model_selection_cannot_mix_tokenizers_or_frozen_tests(self):
        with TemporaryDirectory() as d:
            a, b = Path(d) / "a.json", Path(d) / "b.json"
            a.write_text(json.dumps(fake(42, 22, 15)))
            changed = fake(7, 20, 12)
            changed["tokenizer_fingerprint"] = "different"
            b.write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "Incomparable"):
                summarize([a, b])
            changed = fake(7, 20, 12)
            changed["acceptance_v3_sha256"] = "wrong benchmark"
            b.write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "Incomparable"):
                summarize([a, b])
            changed = fake(42, 20, 12)
            b.write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "Duplicate model"):
                summarize([a, b])
            changed = fake(7, 20, 12)
            changed["fresh_acceptance_v3"]["full_format_correct"] = 21
            b.write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "Invalid Cisco BGP"):
                summarize([a, b])


if __name__ == "__main__":
    unittest.main()
