"""Evaluate that a no-learning BGP baseline is explicit and reproducible."""
from tempfile import TemporaryDirectory
from pathlib import Path
import json
import unittest

from .majority_baseline import majority_reference


class MajorityReferenceTests(unittest.TestCase):
    def test_reference_uses_training_labels_and_never_claims_engineering(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / "reference.json"
            score = majority_reference(output=path)
            self.assertEqual(score["status"],
                             "SYNTHETIC_MAJORITY_REFERENCE_NOT_A_MODEL")
            self.assertEqual(score["train_cases"], 768)
            self.assertEqual(score["heldout_cases"], 96)
            self.assertTrue(0 <= score["correct"] <= 96)
            self.assertEqual(score["total"], 96)
            self.assertEqual(len(score["per_field"]), 4)
            self.assertTrue(all(x["total"] == 24 for x in score["per_field"].values()))
            self.assertFalse(score["engineering_verified"])
            self.assertFalse(score["production_ready"])
            self.assertEqual(json.loads(path.read_text())["correct"], score["correct"])


if __name__ == "__main__":
    unittest.main()
