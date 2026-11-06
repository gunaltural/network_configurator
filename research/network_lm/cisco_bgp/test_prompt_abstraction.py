"""Original 2CE topology identity normalization must not leak answers."""
from dataclasses import replace
import unittest

from .module_lm import load_owned_module_cases, focused_cases
from .v4_evaluation import load_v4_holdout
from .prompt_abstraction import abstract_prompt, abstract_examples


class IdentityNormalizationTests(unittest.TestCase):
    def test_ce_and_isp_role_and_failure_information_are_preserved(self):
        original, source_sha = load_owned_module_cases()
        training = focused_cases(original["train"])[0]
        result = abstract_prompt(training.prompt)
        self.assertIn("CE1-AS_CE_AS", result)
        self.assertIn("CE2-AS_CE_AS", result)
        self.assertIn("ISP1-AS_UPSTREAM1_AS", result)
        self.assertIn("ISP2-AS_UPSTREAM2_AS", result)
        self.assertIn("owns prefix OWNED_IPV4_PREFIX", result)
        self.assertIn("Failed devices:", result)
        self.assertIn("Failed links:", result)
        self.assertIn("Imported local preference: wan1=", result)
        self.assertIn("Export AS_PATH prepend: wan1=", result)
        self.assertIn("Requested simulator outcome: CE1_EXIT.", result)
        self.assertNotIn("RESULT=", result)
        self.assertNotIn("10.20.0.0/24", result)

        changed = replace(training, prompt=training.prompt.replace(
            "Failed devices: none", "Failed devices: ce1"
        ))
        self.assertNotEqual(abstract_prompt(training.prompt),
                            abstract_prompt(changed.prompt))
        self.assertEqual(
            abstract_examples([training])[0].completion, training.completion
        )

    def test_v4_uses_identical_schema_but_never_enters_training(self):
        original, source_sha = load_owned_module_cases()
        v4, digest = load_v4_holdout(source_sha=source_sha)
        transformed = abstract_examples(v4)
        self.assertEqual(len(transformed), 144)
        self.assertEqual(len(digest), 64)
        self.assertTrue(all("CE1-AS_CE_AS" in x.prompt for x in transformed))
        self.assertTrue(all("OWNED_IPV4_PREFIX" in x.prompt for x in transformed))
        self.assertTrue(all(x.split == "test" for x in transformed))
        self.assertEqual(
            [x.completion for x in transformed],
            [x.completion for x in v4]
        )
        baseline_prompts = {
            x.prompt for x in abstract_examples(focused_cases(original["train"]))
        }
        self.assertTrue({x.prompt for x in transformed}.isdisjoint(baseline_prompts))

    def test_reject_malformed_or_mixed_as_syntax(self):
        data, _ = load_owned_module_cases()
        prompt=data["train"][0].prompt
        with self.assertRaisesRegex(ValueError, "internal AS"):
            abstract_prompt(prompt.replace("CE2-AS65001", "CE2-AS65099"))
        with self.assertRaisesRegex(ValueError, "schema"):
            abstract_prompt(prompt.replace("CE1-AS65001", "CE1-ASXYZ"))
        with self.assertRaisesRegex(ValueError, "original prefix"):
            abstract_prompt(prompt.replace("owns prefix", "owns unknown"))
        with self.assertRaisesRegex(ValueError, "research prompt"):
            abstract_prompt("")

    def test_freeform_design_fact_text_is_not_modified(self):
        question="BGP Design question: eBGP ASN\nUse cautious design guidance."
        self.assertEqual(abstract_prompt(question), question)


if __name__ == "__main__":
    unittest.main()
