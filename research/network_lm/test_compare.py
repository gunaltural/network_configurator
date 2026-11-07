"""Independent metric comparison tests never declare product readiness."""
import json
from pathlib import Path
import tempfile
import unittest
from .compare import compare


def write_set(path, *, curriculum=0, val=5.0, arch=None):
    metrics = {
        "architecture": arch or {"block_size": 512, "width": 64, "layers": 2,
                                  "heads": 4, "vocab_size": 258},
        "corpus_sha256": "ab" * 32,
        "heldout_scenarios": ["holdout-bgp-admin", "holdout-vpc-gateway"],
        "curriculum_count": curriculum,
        "train_example_count": 6 + curriculum,
        "parameter_count": 165888,
        "steps": 3 if not curriculum else 160,
        "heldout_loss_after": val,
        "engineering_verified": False,
        "production_ready": False,
    }
    outputs = {
        ".metrics.json": metrics,
        ".evaluation.json": {
            "heldout_cases": 2, "lexical_proxy_pass_count": 0 if not curriculum else 1,
            "engineering_verified": False,
        },
        ".counterfactual.json": {
            "pair_count": 3, "lexical_contrast_pass_count": 0 if not curriculum else 1,
            "engineering_verified": False,
        },
    }
    for suffix, report in outputs.items():
        path.with_suffix(suffix).write_text(json.dumps(report))


class ComparisonTests(unittest.TestCase):
    def test_improvement_is_reported_as_proxy_not_certified(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "base.pt", Path(tmp) / "candidate.pt"
            write_set(a)
            write_set(b, curriculum=192, val=4.5)
            result = compare(a, b)
            self.assertEqual(result["heldout_loss_delta"], -0.5)
            self.assertEqual(result["lexical_holdout_candidate"], 1)
            self.assertFalse(result["engineering_verified"])
            self.assertFalse(result["production_ready"])
            self.assertIn("confounded_comparison", result)
            self.assertTrue(b.with_suffix(".comparison.json").exists())

    def test_reject_false_production_and_noncomparable_architecture(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "base.pt", Path(tmp) / "candidate.pt"
            write_set(a)
            write_set(b, curriculum=16)
            metrics_path = b.with_suffix(".metrics.json")
            metrics = json.loads(metrics_path.read_text())
            metrics["engineering_verified"] = True
            metrics_path.write_text(json.dumps(metrics))
            with self.assertRaisesRegex(ValueError, "non-production"):
                compare(a, b)
            metrics["engineering_verified"] = False
            metrics["architecture"]["width"] = 128
            metrics_path.write_text(json.dumps(metrics))
            with self.assertRaisesRegex(ValueError, "identical architecture"):
                compare(a, b)


if __name__ == "__main__":
    unittest.main()
