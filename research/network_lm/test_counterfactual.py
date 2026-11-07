"""Adversarial sensitivity and checkpoint integrity gates; research only."""
import argparse
from pathlib import Path
import tempfile
import unittest
import torch

from .train import train
from .evaluate import load_verified_checkpoint
from .counterfactual import PAIRS, score_pair_output, evaluate_counterfactual

CORPUS = Path(__file__).with_name("synthetic_corpus.jsonl")


class CounterfactualTests(unittest.TestCase):
    def test_contrast_proxies_reject_nonspecific_and_swapped_answers(self):
        for pair in PAIRS:
            with self.subTest(pair=pair["id"]):
                self.assertFalse(score_pair_output("", "", pair))
                self.assertFalse(score_pair_output("No proof of outage", "No proof of outage", pair))
                self.assertFalse(score_pair_output(
                    pair["right_signals"][0], pair["left_signals"][0], pair))
                self.assertFalse(score_pair_output(
                    pair["left_signals"][0] + " " + pair["right_signals"][0],
                    pair["right_signals"][0], pair))
                self.assertTrue(score_pair_output(
                    pair["left_signals"][0], pair["right_signals"][0], pair))

    def test_real_random_checkpoint_runs_but_not_certified(self):
        with tempfile.TemporaryDirectory() as folder:
            checkpoint = Path(folder) / "scratch.pt"
            args = argparse.Namespace(corpus=str(CORPUS), output=str(checkpoint),
                steps=1, batch_size=1, context=512, width=32,
                layers=1, heads=4, lr=0.001, seed=9, threads=2, device="cpu")
            train(args)
            report = evaluate_counterfactual(checkpoint, CORPUS, max_new_tokens=6)
            self.assertEqual(report["pair_count"], 3)
            self.assertFalse(report["engineering_verified"])
            self.assertFalse(report["production_ready"])
            self.assertEqual(len(report["pairs"]), 3)
            self.assertTrue(checkpoint.with_suffix(".counterfactual.json").exists())
            with self.assertRaisesRegex(ValueError, "Bound counterfactual"):
                evaluate_counterfactual(checkpoint, CORPUS, max_new_tokens=0)

    def test_wrong_training_split_or_parameter_manifest_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            checkpoint = Path(folder) / "scratch.pt"
            args = argparse.Namespace(corpus=str(CORPUS), output=str(checkpoint),
                steps=1, batch_size=1, context=512, width=32,
                layers=1, heads=4, lr=0.001, seed=10, threads=2, device="cpu")
            train(args)
            good = torch.load(checkpoint, map_location="cpu", weights_only=True)
            package = torch.load(checkpoint, map_location="cpu", weights_only=True)
            package["manifest"]["train_scenarios"] = ["unrelated-train-scenario"]
            torch.save(package, checkpoint)
            with self.assertRaisesRegex(ValueError, "scenario manifest mismatch"):
                load_verified_checkpoint(checkpoint, CORPUS)

            package = good
            package["manifest"]["parameter_count"] = 1
            torch.save(package, checkpoint)
            with self.assertRaisesRegex(ValueError, "parameter count mismatch"):
                load_verified_checkpoint(checkpoint, CORPUS)


if __name__ == "__main__":
    unittest.main()
