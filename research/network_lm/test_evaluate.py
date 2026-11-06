"""Scratch checkpoint evaluation accepts no false-green engineering score."""
import argparse
from pathlib import Path
import tempfile
import unittest
import torch
from .train import train
from .evaluate import evaluate

CORPUS = Path(__file__).with_name('synthetic_corpus.jsonl')


class ScratchEvaluationTests(unittest.TestCase):
    def test_holdout_generation_runs_and_never_certifies(self):
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / 'scratch.pt'
            options = argparse.Namespace(corpus=str(CORPUS), output=str(checkpoint),
                steps=1, batch_size=1, context=512, width=32,
                layers=1, heads=4, lr=0.001, seed=7, threads=2, device='cpu')
            train(options)
            report = evaluate(checkpoint, CORPUS, max_new_tokens=8)
            self.assertEqual(report['heldout_cases'], 2)
            self.assertFalse(report['engineering_verified'])
            self.assertFalse(report['production_ready'])
            self.assertEqual(len(report['per_case']), 2)
            self.assertEqual({r['scenario_id'] for r in report['per_case']},
                {'holdout-bgp-admin', 'holdout-vpc-gateway'})
            self.assertTrue(checkpoint.with_suffix('.evaluation.json').exists())
            with self.assertRaisesRegex(ValueError, 'Bound generation'):
                evaluate(checkpoint, CORPUS, max_new_tokens=0)
            package = torch.load(checkpoint, map_location='cpu', weights_only=True)
            package['manifest']['corpus_sha256'] = '0' * 64
            torch.save(package, checkpoint)
            with self.assertRaisesRegex(ValueError, 'Corpus/weights mismatch'):
                evaluate(checkpoint, CORPUS, max_new_tokens=8)


if __name__ == '__main__':
    unittest.main()
