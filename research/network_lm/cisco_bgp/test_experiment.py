"""Cisco IOS-XE BGP-specific scratch learning tests. All fixtures synthetic."""
from collections import Counter
from pathlib import Path
import json
import tempfile
import unittest

import torch

from ..model import ByteTokenizer, LMConfig
from .curriculum import (
    CLASSES, INTERPRETATIONS, READ_ONLY_CHECKS, dataset_fingerprint,
    load_frozen_holdout, training_cases,
)
from .experiment import BGPStudent, FROZEN_PATH, counterfactual_score, encode, train


class CiscoBGPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)

    def test_only_eight_scoped_bgp_labels_not_other_technologies(self):
        self.assertEqual(len(CLASSES), 8)
        self.assertEqual(len(set(CLASSES)), 8)
        self.assertEqual(set(CLASSES), set(INTERPRETATIONS))
        self.assertTrue(all("show " in item for item in READ_ONLY_CHECKS))
        self.assertIn("ADMIN", CLASSES[0])
        self.assertIn("ESTABLISHED_ZERO", CLASSES)

    def test_frozen_test_is_not_used_as_training(self):
        training = training_cases(40, seed=42)
        alternate = training_cases(8, seed=241)
        test = load_frozen_holdout(FROZEN_PATH)
        self.assertEqual(len(training), 320)
        self.assertEqual(len(test), 32)
        self.assertEqual(set(CLASSES), {x.label for x in test})
        self.assertEqual(dict(Counter(x.label for x in test)),
                         {x: 4 for x in CLASSES})
        self.assertTrue({x.scenario for x in test}.isdisjoint(
            x.scenario for x in training))
        self.assertTrue({x.text for x in test}.isdisjoint(
            x.text for x in training))
        self.assertEqual(dataset_fingerprint(training),
                         dataset_fingerprint(training_cases(40, seed=42)))
        self.assertNotEqual(dataset_fingerprint(training),
                            dataset_fingerprint(training_cases(40, seed=43)))
        self.assertTrue(all(x.split == "train" for x in training))
        self.assertTrue(all(x.split == "test" for x in test))
        self.assertTrue({x.text for x in alternate}.isdisjoint(
            x.text for x in training))

    def test_all_evidence_fits_without_truncation(self):
        cases = training_cases(48, seed=42) + load_frozen_holdout(FROZEN_PATH)
        encoded = encode(cases, ByteTokenizer(), 384)
        self.assertEqual(len(encoded), len(cases))
        self.assertTrue(all(0 < len(x) <= 384 for x, label in encoded))
        with self.assertRaisesRegex(ValueError, "no truncation"):
            encode(cases, ByteTokenizer(), 40)

    def test_causal_pair_holdouts_modify_only_status(self):
        torch.manual_seed(42)
        model = BGPStudent(LMConfig(block_size=384, width=32, layers=1, heads=4))
        results = counterfactual_score(model, ByteTokenizer(), 384)
        self.assertEqual(results["total"], 4)
        self.assertEqual(len(results["pairs"]), 4)
        for item in results["pairs"]:
            self.assertEqual(len(item["expected"]), 2)
            self.assertNotEqual(*item["expected"])

    def test_masked_sequence_pooling_is_padding_invariant(self):
        config = LMConfig(block_size=384, width=32, layers=1, heads=4)
        for mode in ("last", "mean", "max"):
            with self.subTest(mode=mode):
                torch.manual_seed(42)
                student = BGPStudent(config, pooling=mode).eval()
                single = torch.tensor([[256, 67, 68, 69]], dtype=torch.long)
                padded = torch.tensor([[256, 67, 68, 69, 0, 0, 0, 0]],
                                      dtype=torch.long)
                with torch.no_grad():
                    one = student(single, torch.tensor([4]))
                    two = student(padded, torch.tensor([4]))
                self.assertTrue(torch.allclose(one, two, atol=1e-5))
        with self.assertRaisesRegex(ValueError, "Unsupported sequence pooling"):
            BGPStudent(config, pooling="nonexistent")

    def test_actual_scratch_training_and_checkpoint_never_verify_network(self):
        with tempfile.TemporaryDirectory() as folder:
            checkpoint = Path(folder) / "test-bgp.pt"
            result = train(steps=3, per_class=8, seed=5, context=384,
                           width=32, layers=1, heads=4, batch_size=4,
                           threads=2, output=str(checkpoint))
            self.assertTrue(checkpoint.is_file())
            self.assertEqual(result["heldout_count"], 32)
            self.assertEqual(result["train_count"], 64)
            self.assertEqual(result["counterfactual"]["total"], 4)
            self.assertFalse(result["engineering_verified"])
            self.assertFalse(result["production_ready"])
            manifest = torch.load(checkpoint, weights_only=True, map_location="cpu")
            self.assertEqual(tuple(manifest["classes"]), CLASSES)
            self.assertEqual(manifest["manifest"]["data_version"],
                             "cisco-bgp-fsm-synthetic-v1")
            self.assertEqual(sum(x.numel() for x in manifest["weights"].values()),
                             manifest["manifest"]["params"])
            scores = json.loads(checkpoint.with_suffix(".metrics.json").read_text())
            self.assertIn("heldout", scores)
            self.assertTrue(all(x["id"].startswith("BGPH-")
                                for x in scores["heldout"]["predictions"]))


if __name__ == "__main__":
    unittest.main()
