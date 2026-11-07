"""Compare current eight-class sampler to the previous 82/96 experiment's schedule."""
from collections import Counter
import random
import unittest

import torch

from ..model import LMConfig, ScratchNetworkLM
from .curriculum import KINDS, FIELDS, SPLIT_CONTEXTS, cases, tasks
from .train import BalancedEvidenceSampler
from .reproducibility import model_fingerprint, runtime_info, compact_batch_fingerprint


class PreviousEightClassSampler:
    """Verbatim behavior of the prior eight-class sampler; audit only."""

    def __init__(self, training, *, seed):
        self.rng = random.Random(seed)
        self.buckets, self.cursors = {}, {}
        for field in FIELDS:
            for kind in KINDS:
                indices = [
                    index for index, example in enumerate(training)
                    if example.id.endswith("-" + kind + "-" + field)
                ]
                if len(indices) != len(SPLIT_CONTEXTS["train"]):
                    raise ValueError("Legacy eight-class label mismatch")
                self.rng.shuffle(indices)
                self.buckets[(field, kind)] = indices
                self.cursors[(field, kind)] = 0

    def indices(self, step):
        if not isinstance(step, int) or step < 0:
            raise ValueError("Invalid legacy training step")
        field = FIELDS[step % len(FIELDS)]
        indices = []
        for kind in KINDS:
            key = (field, kind)
            ptr = self.cursors[key]
            if ptr == len(self.buckets[key]):
                self.rng.shuffle(self.buckets[key])
                ptr = 0
            indices.append(self.buckets[key][ptr])
            self.cursors[key] = ptr + 1
        return indices


class ScratchBGPReproducibilityTests(unittest.TestCase):
    def test_exact_old_and_new_eight_class_batch_schedules_equal_900_steps(self):
        training = tasks(cases()["train"])
        for seed in (42, 7, 17):
            old = PreviousEightClassSampler(training, seed=seed)
            new = BalancedEvidenceSampler(training, seed=seed,
                                          include_unknown=False)
            seen = Counter()
            for step in range(900):
                left, right = old.indices(step), new.indices(step)
                self.assertEqual(left, right)
                self.assertEqual(len(left), 8)
                seen.update(training[index].id.rsplit("-", 1)[-1]
                            for index in left)
            self.assertEqual(set(seen), set(FIELDS))
            self.assertEqual(sum(seen.values()), 900*8)

    def test_weight_fingerprint_tracks_parameters_not_training_heldout(self):
        torch.manual_seed(42)
        a = ScratchNetworkLM(LMConfig(
            block_size=48, width=16, layers=1, heads=4, vocab_size=258,
        ))
        fingerprint = model_fingerprint(a)
        torch.manual_seed(42)
        b = ScratchNetworkLM(LMConfig(
            block_size=48, width=16, layers=1, heads=4, vocab_size=258,
        ))
        self.assertEqual(fingerprint, model_fingerprint(b))
        self.assertEqual(len(fingerprint), 64)
        with torch.no_grad():
            b.head.weight[0, 0] += 0.5
        self.assertNotEqual(fingerprint, model_fingerprint(b))

    def test_cpu_runtime_and_nonambiguous_batch_order_hash(self):
        details = runtime_info()
        self.assertTrue(details["torch_version"])
        self.assertGreaterEqual(details["cpu_threads"], 1)
        self.assertIn("mkldnn_enabled", details)
        self.assertEqual(len(compact_batch_fingerprint([0, 1, 2])), 32)
        self.assertNotEqual(
            compact_batch_fingerprint([0, 1, 2]),
            compact_batch_fingerprint([0, 2, 1]),
        )
        with self.assertRaisesRegex(ValueError, "non-negative"):
            compact_batch_fingerprint([0, -1])


if __name__ == "__main__":
    unittest.main()
