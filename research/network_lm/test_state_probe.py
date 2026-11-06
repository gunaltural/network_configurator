"""Scratch state probe tests: observed-state recognition != diagnostic proof."""
from pathlib import Path
import tempfile
import unittest

import torch
from .curriculum import curriculum_examples
from .model import ByteTokenizer, LMConfig
from .state_probe import (
    STATES, STATE_INDEX, TRANSFER_CASES, ScratchStateProbe,
    accuracy, batch, encode_records, train_probe, load_challenge,
)


class StateProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)

    def test_all_classes_have_observation_and_independent_transfer_case(self):
        self.assertEqual(len(STATES), 16)
        self.assertEqual(len(STATES), len(set(STATES)))
        challenge = load_challenge()
        self.assertEqual(len(challenge), 32)
        self.assertTrue({prompt for _, prompt in challenge}.isdisjoint(
            {prompt for _, prompt in TRANSFER_CASES}))
        self.assertEqual(set(STATES), {state for state, _ in TRANSFER_CASES})
        a = curriculum_examples(2, seed=42)
        b = curriculum_examples(2, seed=443)
        self.assertTrue({x.prompt for x in a}.isdisjoint(x.prompt for x in b))
        self.assertTrue({x.prompt for x in a}.isdisjoint(prompt for _, prompt in TRANSFER_CASES))
        examples = encode_records(
            [(x.scenario_id.removeprefix("curriculum-"), x.prompt) for x in a],
            ByteTokenizer(), 512)
        self.assertEqual(len(examples), 32)

    def test_unknown_state_or_overflow_rejects_instead_of_truncation(self):
        tokenizer = ByteTokenizer()
        with self.assertRaisesRegex(ValueError, "Unknown state"):
            encode_records([("not-a-protocol-state", "Status Up")], tokenizer, 512)
        with self.assertRaisesRegex(ValueError, "truncation forbidden"):
            encode_records([(STATES[0], "X" * 900)], tokenizer, 512)

    def test_backward_causal_state_probe_has_correct_dimensions(self):
        config = LMConfig(width=32, layers=1, heads=4, block_size=512)
        net = ScratchStateProbe(config)
        examples = encode_records(
            [(STATES[0], "BGP status Active"), (STATES[1], "BGP status Established")],
            ByteTokenizer(), 512)
        tokens, lengths, labels = batch(examples, [0, 1], torch.device("cpu"))
        self.assertEqual(tuple(net(tokens, lengths).shape), (2, 16))
        self.assertEqual(labels.tolist(), [STATE_INDEX[STATES[0]], STATE_INDEX[STATES[1]]])
        metrics = accuracy(net, examples, torch.device("cpu"))
        self.assertEqual(metrics["total"], 2)
        self.assertEqual(len(metrics["per_case"]), 2)

    def test_actual_random_initialized_training_never_claims_engineering_acceptance(self):
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / "probe.pt")
            result = train_probe(steps=2, samples_per_state=1, seed=5, width=32,
                                 layers=1, heads=4, batch_size=2,
                                 threads=2, output=path)
            self.assertEqual(result["train_cases"], 16)
            self.assertEqual(result["surface_heldout_cases"], 48)
            self.assertEqual(result["template_transfer_cases"], 16)
            self.assertEqual(result["frozen_challenge_cases"], 32)
            self.assertEqual(result["challenge_after"]["total"], 32)
            self.assertFalse(result["engineering_verified"])
            self.assertFalse(result["production_ready"])
            self.assertTrue(0 <= result["template_after"]["accuracy"] <= 1)
            self.assertTrue(Path(path).with_suffix(".metrics.json").exists())
            package = torch.load(path, map_location="cpu", weights_only=True)
            self.assertEqual(tuple(package["states"]), STATES)
            self.assertEqual(package["manifest"]["parameter_count"],
                             sum(x.numel() for x in package["weights"].values()))


if __name__ == "__main__":
    unittest.main()
