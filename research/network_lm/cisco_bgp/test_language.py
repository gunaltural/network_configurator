"""Cisco BGP scratch *language-model* tests, separate from status classifier."""
from pathlib import Path
import tempfile
import unittest

import torch

from ..data import encode_example
from ..model import ByteTokenizer
from .curriculum import CLASSES, training_cases, load_frozen_holdout
from .experiment import FROZEN_PATH
from .language import (
    BOUNDARIES, as_examples, target, generate_on_frozen, train_language,
)


class CiscoBGPLanguageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)

    def test_teaching_targets_are_conditional_and_technology_scoped(self):
        self.assertEqual(set(BOUNDARIES), set(CLASSES))
        for label in CLASSES:
            response = target(label)
            self.assertTrue(response.startswith("STATE=" + label + "\n"))
            self.assertIn("\nNOT_PROVEN=", response)
            self.assertIn("\nCHECK=show ip bgp neighbors", response)
            self.assertNotIn("confirmed root cause", response.lower())
            self.assertNotIn("outage is proven", response.lower())
        with self.assertRaisesRegex(ValueError, "Unknown BGP"):
            target("OTHER_VENDOR")

    def test_completion_only_targets_not_exposed_in_prompts(self):
        train_rows = training_cases(8, seed=42)
        frozen = load_frozen_holdout(FROZEN_PATH)
        records = as_examples(train_rows)
        self.assertEqual(len(records), 64)
        self.assertTrue({r.prompt for r in records}.isdisjoint(r.text for r in frozen))
        state_only = as_examples(train_rows, state_only=True)
        self.assertTrue(all(x.completion.startswith("STATE=")
                            and x.completion[6:] in CLASSES for x in state_only))
        self.assertEqual([x.prompt for x in state_only], [x.prompt for x in records])
        tok = ByteTokenizer()
        for record in records:
            x, y = encode_example(record, tok, 384)
            self.assertEqual(len(x), len(y))
            self.assertTrue(y.count(-100) > 50)
            self.assertTrue(any(v >= 0 for v in y))

    def test_frozen_grader_rejects_empty_and_incomplete_generations(self):
        tok = ByteTokenizer()
        test = load_frozen_holdout(FROZEN_PATH)[:2]

        class EmptyLanguageModel:
            def eval(self):
                return self
            def complete(self, prompt, max_new_tokens=140):
                return prompt + tok.encode("network is healthy")

        score = generate_on_frozen(EmptyLanguageModel(), tok, test,
                                   max_new_tokens=18)
        self.assertEqual(score["heldout_cases"], 2)
        self.assertEqual(score["state_correct"], 0)
        self.assertEqual(score["full_format_correct"], 0)
        self.assertFalse(score["production_ready"])

        class PartialLanguageModel:
            def eval(self):
                return self
            def complete(self, prompt, max_new_tokens=140):
                return prompt + tok.encode("STATE=IDLE_ADMIN")

        score = generate_on_frozen(PartialLanguageModel(), tok, test)
        self.assertEqual(score["state_correct"], 2)
        self.assertEqual(score["full_format_correct"], 0)

        class CorruptedButTaggedLanguageModel:
            def eval(self):
                return self
            def complete(self, prompt, max_new_tokens=140):
                return prompt + tok.encode(
                    "STATE=IDLE_ADMIN\nNOT_PROVEN=maintentenancte is unknown"
                    "\nCHECK=show ip bgp neighbors"
                )

        corrupted = generate_on_frozen(CorruptedButTaggedLanguageModel(), tok, test)
        self.assertEqual(corrupted["state_correct"], 2)
        self.assertEqual(corrupted["full_format_correct"], 0)

        class ExactCanonicalLanguageModel:
            def eval(self):
                return self
            def complete(self, prompt, max_new_tokens=140):
                return prompt + tok.encode(target("IDLE_ADMIN"))

        exact = generate_on_frozen(ExactCanonicalLanguageModel(), tok, test)
        self.assertEqual(exact["state_correct"], 2)
        self.assertEqual(exact["full_format_correct"], 2)

    def test_actual_random_initialized_transformer_trains_and_generates(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "cisco-bgp-language.pt"
            result = train_language(
                steps=2, per_class=8, seed=11, context=384, width=32,
                layers=1, heads=4, batch_size=2, threads=2, output=str(path),
            )
            self.assertTrue(path.is_file())
            self.assertEqual(result["training_examples"], 64)
            self.assertEqual(result["heldout_generation"]["heldout_cases"], 32)
            self.assertEqual(result["fresh_acceptance_v2"]["heldout_cases"], 32)
            self.assertEqual(result["state_warmup_steps"], 0)
            self.assertFalse(result["production_ready"])
            self.assertFalse(result["engineering_verified"])
            package = torch.load(path, map_location="cpu", weights_only=True)
            self.assertEqual(
                package["manifest"]["status"], "CISCO_BGP_CAUSAL_LM_SCRATCH_ONLY"
            )
            self.assertEqual(
                sum(p.numel() for p in package["weights"].values()),
                package["manifest"]["parameter_count"],
            )
            with self.assertRaisesRegex(ValueError, "Warmup must leave"):
                train_language(steps=2, state_warmup_steps=2)


if __name__ == "__main__":
    unittest.main()
