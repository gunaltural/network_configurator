"""Do not cherry-pick one scratch checkpoint or mix challenge versions."""
import json
from pathlib import Path
import tempfile
import unittest
from .summarize_probe import summarize


def report(seed, challenge_correct):
    return {
        "status": "SCRATCH_STATE_RECOGNITION_RESEARCH_ONLY",
        "seed": seed, "architecture": {"layers": 2},
        "curriculum_version": "v2", "steps": 400, "train_cases": 192,
        "frozen_challenge_cases": 32, "challenge_sha256": "hash",
        "transfer_sha256": "holdout", "template_transfer_cases": 16,
        "challenge_after": {"total": 32, "correct": challenge_correct},
        "template_after": {"total": 16, "correct": 10},
        "engineering_verified": False, "production_ready": False,
    }


class MultiSeedTests(unittest.TestCase):
    def test_seed_variance_is_transparent_and_not_product_acceptance(self):
        with tempfile.TemporaryDirectory() as folder:
            files = [Path(folder) / f"seed{i}.json" for i in (1, 2, 3)]
            for file, item in zip(files, (report(42, 15), report(7, 10), report(99, 18))):
                file.write_text(json.dumps(item))
            target = Path(folder) / "summary.json"
            result = summarize(files, target)
            self.assertEqual(result["seed_count"], 3)
            self.assertEqual(result["challenge_accuracy_min"], 0.3125)
            self.assertEqual(result["challenge_accuracy_max"], 0.5625)
            self.assertFalse(result["engineering_verified"])
            self.assertFalse(result["production_ready"])
            self.assertTrue(target.exists())

    def test_reject_repeated_seed_and_changed_benchmark(self):
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder) / "a.json", Path(folder) / "b.json"
            a.write_text(json.dumps(report(42, 15)))
            b.write_text(json.dumps(report(42, 20)))
            with self.assertRaisesRegex(ValueError, "seeds must be distinct"):
                summarize([a, b])
            item = report(7, 20)
            item["challenge_sha256"] = "changed"
            b.write_text(json.dumps(item))
            with self.assertRaisesRegex(ValueError, "Not comparable"):
                summarize([a, b])
            item = report(7, 20)
            item["engineering_verified"] = True
            b.write_text(json.dumps(item))
            with self.assertRaisesRegex(ValueError, "Only unverified"):
                summarize([a, b])


if __name__ == "__main__":
    unittest.main()
