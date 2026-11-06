"""Research-only train, causal mask, privacy and held-out leakage controls."""
import argparse
import json
from pathlib import Path
import tempfile
import unittest
import torch
from .model import ByteTokenizer, LMConfig, ScratchNetworkLM
from .data import load_corpus, encode_example
from .train import train

CORPUS = Path(__file__).with_name('synthetic_corpus.jsonl')


class ScratchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)

    def test_bytes_and_turkish(self):
        tok = ByteTokenizer()
        phrase = 'Kök neden doğrulanmadı — EVPN'
        self.assertEqual(tok.decode(tok.encode(phrase, bos=True, eos=True)), phrase)

    def test_future_token_cannot_affect_past_logits(self):
        torch.manual_seed(42)
        model = ScratchNetworkLM(LMConfig(block_size=16, width=32, heads=4, layers=1)).eval()
        with torch.no_grad():
            a, _ = model(torch.tensor([[1, 2, 3, 4]], dtype=torch.long))
            b, _ = model(torch.tensor([[1, 2, 3, 5]], dtype=torch.long))
        self.assertTrue(torch.allclose(a[:, :3], b[:, :3], atol=1e-6))
        self.assertFalse(torch.allclose(a[:, 3:], b[:, 3:], atol=1e-6))

    def test_scenario_splits_and_reject_customer_or_leakage(self):
        data = load_corpus(CORPUS)
        self.assertTrue({x.scenario_id for x in data['train']}.isdisjoint({x.scenario_id for x in data['val']}))
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'bad.jsonl'
            path.write_text(CORPUS.read_text().replace('"origin":"original-synthetic"', '"origin":"customer"', 1))
            with self.assertRaisesRegex(ValueError, 'Only explicitly synthetic'):
                load_corpus(path)
            path.write_text(CORPUS.read_text() + json.dumps({
                'id': 'leak', 'scenario_id': 'holdout-vpc-gateway', 'split': 'train',
                'origin': 'original-synthetic', 'prompt': 'New', 'completion': 'Different'}) + '\n')
            with self.assertRaisesRegex(ValueError, 'data leakage'):
                load_corpus(path)

    def test_completion_only_loss_and_no_silent_truncation(self):
        example = load_corpus(CORPUS)['train'][0]
        x, labels = encode_example(example, ByteTokenizer(), 512)
        self.assertEqual(len(x), len(labels))
        self.assertIn(-100, labels)
        self.assertTrue(any(y != -100 for y in labels))
        with self.assertRaisesRegex(ValueError, 'exceeds context'):
            encode_example(example, ByteTokenizer(), 16)

    def test_real_train_checkpoint_is_random_weight_baseline_only(self):
        with tempfile.TemporaryDirectory() as d:
            path = str(Path(d) / 'mini.pt')
            args = argparse.Namespace(corpus=str(CORPUS), output=path, steps=2,
                    batch_size=1, context=512, width=32, layers=1, heads=4,
                    lr=0.001, seed=1, threads=2, device='cpu')
            metrics = train(args)
            self.assertTrue(Path(path).exists())
            package = torch.load(path, map_location='cpu', weights_only=True)
            self.assertFalse(package['manifest']['engineering_verified'])
            self.assertEqual(package['manifest']['steps'], 2)
            self.assertTrue(Path(path).with_suffix('.metrics.json').exists())
            self.assertEqual(metrics['parameter_count'], sum(t.numel() for t in package['weights'].values()))


if __name__ == '__main__':
    unittest.main()
