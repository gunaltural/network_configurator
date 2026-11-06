"""Reproducible original-synthetic curriculum and train-only boundary tests."""
import argparse
import json
from pathlib import Path
import tempfile
import unittest
import torch

from .curriculum import curriculum_examples, curriculum_digest
from .data import load_corpus, encode_example
from .evaluate import load_verified_checkpoint
from .model import ByteTokenizer
from .train import train

CORPUS = Path(__file__).with_name("synthetic_corpus.jsonl")


class CurriculumTests(unittest.TestCase):
    def test_reproducible_diverse_unique_train_only_examples(self):
        first = curriculum_examples(per_state=3, seed=41)
        again = curriculum_examples(per_state=3, seed=41)
        different = curriculum_examples(per_state=3, seed=42)
        self.assertEqual(first, again)
        self.assertEqual(curriculum_digest(first), curriculum_digest(again))
        self.assertNotEqual(curriculum_digest(first), curriculum_digest(different))
        self.assertEqual(len(first), 48)
        self.assertEqual(len({x.id for x in first}), len(first))
        self.assertTrue(all(x.split == "train" for x in first))
        self.assertEqual(len({x.scenario_id for x in first}), 16)
        heldout = {x.scenario_id for x in load_corpus(CORPUS)["val"]}
        self.assertTrue(heldout.isdisjoint({x.scenario_id for x in first}))
        self.assertEqual(len({x.prompt for x in first}), len(first))
        self.assertTrue(all("root cause" in x.completion.lower() or
                            "unverified" in x.completion.lower() or
                            "not proven" in x.completion.lower() or
                            "not established" in x.completion.lower() or
                            "not proof" in x.completion.lower() or
                            "not verified" in x.completion.lower() or
                            "require" in x.completion.lower()
                            for x in first))
        for example in first:
            encoded, labels = encode_example(example, ByteTokenizer(), 512)
            self.assertEqual(len(encoded), len(labels))

    def test_reject_invalid_curriculum_sizes(self):
        for invalid in (-1, 65, 1.5, True):
            with self.subTest(value=invalid), self.assertRaises(ValueError):
                curriculum_examples(invalid)
        with self.assertRaises(ValueError):
            curriculum_examples(2, seed="wrong")

    def test_augmented_random_checkpoint_contains_reconstructible_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            checkpoint = Path(folder) / "scratch.pt"
            args = argparse.Namespace(corpus=str(CORPUS), output=str(checkpoint),
                steps=2, batch_size=2, context=512, width=32, layers=1,
                heads=4, lr=0.001, seed=4, threads=2, device="cpu",
                curriculum_per_state=2, curriculum_seed=111)
            report = train(args)
            self.assertEqual(report["curriculum_count"], 32)
            self.assertEqual(report["train_example_count"], 38)
            self.assertEqual(report["val_example_count"], 2)
            self.assertFalse(report["engineering_verified"])
            self.assertFalse(report["production_ready"])
            model, tokenizer, corpus = load_verified_checkpoint(checkpoint, CORPUS)
            self.assertEqual(len(corpus["train"]), 38)
            self.assertEqual(len(corpus["val"]), 2)
            self.assertIsNotNone(model)
            self.assertIsNotNone(tokenizer)
            package = torch.load(checkpoint, map_location="cpu", weights_only=True)
            package["manifest"]["curriculum_sha256"] = "0" * 64
            torch.save(package, checkpoint)
            with self.assertRaisesRegex(ValueError, "Curriculum provenance/hash mismatch"):
                load_verified_checkpoint(checkpoint, CORPUS)


if __name__ == "__main__":
    unittest.main()
