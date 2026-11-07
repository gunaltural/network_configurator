"""Research-only finding-token grammar must never inject diagnostic answers."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import torch

from ..model import LMConfig, ScratchNetworkLM
from .tokenizer import train_bpe
from .multicli_curriculum import case
from .multicli_decode import (
    ALLOWED_FINDINGS, label_log_prob, choose_finding,
    LearnedFindingGrammar, restore_checkpoint,
)


class GenerativeLabelGrammarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)
        cls.tokenizer = train_bpe(
            [case("ACTIVE_TARGET", "train", 0).example.prompt] * 4
            + ["FINDING=TARGET_SESSION_DOWN\nWHY=synthetic"] * 4,
            vocab_size=340,
        )
        cls.config = LMConfig(block_size=512, width=32, layers=1,
                              heads=4, vocab_size=cls.tokenizer.vocab_size)
        torch.manual_seed(9)
        cls.model = ScratchNetworkLM(cls.config)

    def test_model_scoring_produces_only_scratch_learned_labels(self):
        prompt = self.tokenizer.encode(
            "Network observation:\n"
            + case("ACTIVE_TARGET", "train", 0).example.prompt
            + "\nEngineering review:\n", bos=True,
        )
        result = choose_finding(self.model, self.tokenizer, prompt)
        self.assertIn(result, ALLOWED_FINDINGS)
        self.assertEqual(len(ALLOWED_FINDINGS), 8)
        self.assertEqual(len(set(ALLOWED_FINDINGS)), 8)
        with_scores = choose_finding(
            self.model, self.tokenizer, prompt, with_scores=True
        )
        self.assertEqual(with_scores[0], result)
        self.assertEqual(set(with_scores[1]), set(ALLOWED_FINDINGS))
        self.assertTrue(all(isinstance(score, float)
                            for score in with_scores[1].values()))
        for label in ALLOWED_FINDINGS:
            score = label_log_prob(
                self.model, self.tokenizer, prompt, label
            )
            self.assertIsInstance(score, float)
            self.assertLessEqual(score, 0)
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            label_log_prob(self.model, self.tokenizer, prompt, "ARBITRARY")

    def test_scored_prefix_is_consistent_with_model_generated_explanation(self):
        prompt = self.tokenizer.encode(
            "Network observation:\n"
            + case("ZERO_PREFIX", "train", 0).example.prompt
            + "\nEngineering review:\n", bos=True,
        )
        policy = LearnedFindingGrammar(self.model, self.tokenizer)
        predicted_label = choose_finding(
            self.model, self.tokenizer, prompt
        )
        produced = policy.complete(prompt, max_new_tokens=45)
        decoded = self.tokenizer.decode(produced[len(prompt):])
        self.assertTrue(decoded.startswith("FINDING=" + predicted_label + "\n"))
        self.assertEqual(len(policy.decisions), 1)
        self.assertEqual(policy.decisions[0]["label"], predicted_label)
        self.assertGreaterEqual(
            policy.decisions[0]["margin_logprob_per_token"], 0.0
        )
        self.assertFalse(hasattr(policy, "evaluate_diagnostics"))
        with self.assertRaisesRegex(ValueError, "Insufficient"):
            policy.complete(prompt, max_new_tokens=1)

    def test_restore_rejects_models_that_claim_engineering_readiness(self):
        weights = self.model.state_dict()
        original = {
            "weights": weights,
            "config": {
                "block_size": 512, "width": 32, "layers": 1,
                "heads": 4, "vocab_size": self.tokenizer.vocab_size,
            },
            "tokenizer": self.tokenizer.to_manifest(),
            "manifest": {
                "status": "CISCO_BGP_MULTI_CLI_GENERATIVE_RESEARCH_ONLY",
                "seed": 9,
                "tokenizer_sha256": self.tokenizer.fingerprint(),
                "parameter_count": sum(p.numel() for p in self.model.parameters()),
                "abstract_identities": True,
                "production_ready": False, "engineering_verified": False,
            },
        }
        with TemporaryDirectory() as d:
            p = Path(d) / "research.pt"
            torch.save(original, p)
            restored, tok, m = restore_checkpoint(p)
            self.assertFalse(m["production_ready"])
            self.assertEqual(restored.config.vocab_size, tok.vocab_size)
            original["manifest"]["engineering_verified"] = True
            torch.save(original, p)
            with self.assertRaisesRegex(ValueError, "research-only"):
                restore_checkpoint(p)


if __name__ == "__main__":
    unittest.main()
