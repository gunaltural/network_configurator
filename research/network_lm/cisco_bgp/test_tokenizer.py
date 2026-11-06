"""Train-only byte-pair tokenization: lossless fallback, isolation, real LM training."""
from pathlib import Path
import tempfile
import unittest

import torch

from ..model import LMConfig, ScratchNetworkLM
from .tokenizer import ScratchBPE, train_bpe
from .language import train_language
from .curriculum import training_cases


class CiscoBGPTokenizerTests(unittest.TestCase):
    def test_deterministic_from_only_supplied_training_text(self):
        texts = [
            "Cisco IOS-XE show ip bgp summary State/PfxRcd Established",
            "Cisco IOS-XE BGP neighbor 192.0.2.14 Active",
            "Cisco IOS-XE show ip bgp summary State/PfxRcd Established",
        ]
        first = train_bpe(texts, vocab_size=330)
        second = train_bpe(texts, vocab_size=330)
        self.assertEqual(first.to_manifest(), second.to_manifest())
        self.assertEqual(first.fingerprint(), second.fingerprint())
        different = train_bpe(texts + ["an unrelated training string"] * 6,
                              vocab_size=330)
        self.assertNotEqual(first.fingerprint(), different.fingerprint())
        self.assertGreater(first.vocab_size, 258)
        self.assertLessEqual(first.vocab_size, 330)

    def test_unseen_cisco_cli_and_unicode_remain_lossless(self):
        training = [
            "Neighbor 192.0.2.19 state Active, 0 received routes.",
            "Neighbor 192.0.2.17 state Established, 22 received routes.",
        ] * 6
        tok = train_bpe(training, vocab_size=320)
        examples = (
            "Cisco CE42# show bgp ipv4 unicast summary 198.51.100.18 OpenSent",
            "IPv6 2001:db8::1 şifre değil; gözlem: bağlantı kesildi",
            "random\nmulti-line status 0 and OpenConfirm",
            "🎯 📡 unknown symbols BGP FSM",
        )
        for text in examples:
            with self.subTest(text=text):
                encoded = tok.encode(text, bos=True, eos=True)
                self.assertEqual(encoded[0], 256)
                self.assertEqual(encoded[-1], 257)
                self.assertEqual(tok.decode(encoded), text)
                self.assertTrue(all(0 <= i < tok.vocab_size for i in encoded))

    def test_bpe_shortens_common_bgp_training_inputs(self):
        texts = [
            "Network observation:\nCisco IOS-XE BGP neighbor 192.0.2.14 "
            "State/PfxRcd Established\nEngineering review:\n"
        ] * 16
        tok = train_bpe(texts, vocab_size=352)
        sample = texts[0]
        self.assertLess(len(tok.encode(sample)), len(sample.encode("utf-8")) // 2)
        self.assertEqual(tok.decode(tok.encode(sample)), sample)

    def test_invalid_or_tampered_manifest_fails_closed(self):
        tok = train_bpe(["BGP neighbor Established"] * 5, vocab_size=320)
        self.assertEqual(ScratchBPE.from_manifest(tok.to_manifest()).fingerprint(),
                         tok.fingerprint())
        bad = tok.to_manifest()
        bad["vocab_size"] += 1
        with self.assertRaisesRegex(ValueError, "size mismatch"):
            ScratchBPE.from_manifest(bad)
        with self.assertRaisesRegex(ValueError, "Invalid BPE merge"):
            ScratchBPE([[999, 999]])
        with self.assertRaisesRegex(ValueError, "BPE vocabulary"):
            train_bpe(["abc"], vocab_size=100)
        with self.assertRaisesRegex(ValueError, "minimum frequency"):
            train_bpe(["abc"], min_frequency=1)
        with self.assertRaisesRegex(ValueError, "Invalid BPE training"):
            train_bpe(["valid", ""])

    def test_variable_vocabulary_model_works_and_default_is_preserved(self):
        self.assertEqual(LMConfig().vocab_size, 258)
        for vocab in (258, 448, 512):
            cfg = LMConfig(block_size=128, width=32, layers=1,
                           heads=4, vocab_size=vocab)
            cfg.validate()
            model = ScratchNetworkLM(cfg)
            x = torch.tensor([[256, 66, 78, 257]], dtype=torch.long)
            logits, _ = model(x)
            self.assertEqual(tuple(logits.shape), (1, 4, vocab))
        with self.assertRaises(ValueError):
            LMConfig(vocab_size=257).validate()

    def test_real_scratch_lm_can_train_with_new_tokenizer(self):
        with tempfile.TemporaryDirectory() as d:
            output = Path(d) / "bpe-scratch.pt"
            report = train_language(
                steps=2, per_class=8, seed=41, context=384,
                width=32, layers=1, heads=4, batch_size=2,
                threads=2, tokenizer_mode="bpe", bpe_vocab_size=336,
                output=str(output),
            )
            self.assertEqual(report["tokenizer_mode"], "bpe")
            self.assertGreater(report["architecture"]["vocab_size"], 258)
            self.assertEqual(report["fresh_acceptance_v2"]["heldout_cases"], 32)
            self.assertFalse(report["production_ready"])
            checkpoint = torch.load(output, weights_only=True, map_location="cpu")
            tokenizer = ScratchBPE.from_manifest(checkpoint["tokenizer"])
            self.assertEqual(tokenizer.fingerprint(),
                             checkpoint["manifest"]["tokenizer_fingerprint"])
            self.assertEqual(tokenizer.vocab_size,
                             checkpoint["config"]["vocab_size"])


if __name__ == "__main__":
    unittest.main()
