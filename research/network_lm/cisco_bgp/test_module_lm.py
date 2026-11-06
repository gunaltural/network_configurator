"""Independent simulator/design BGP model teaching, with sealed incident holdouts."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import torch

from .module_lm import (
    FIELDS, design_teaching_examples, experiment, focused_cases,
    load_owned_module_cases, grade_simulation, grade_focused,
)
from ..model import ByteTokenizer


class ModuleKnowledgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)

    def test_real_simulator_is_the_source_and_failures_never_leak(self):
        corpus, fingerprint = load_owned_module_cases()
        self.assertEqual([len(corpus[k]) for k in ("train", "val", "test")],
                         [192, 10, 24])
        self.assertEqual(len(fingerprint), 64)
        scenario_ids = {
            split: {x.scenario_id for x in examples}
            for split, examples in corpus.items()
        }
        self.assertTrue(scenario_ids["train"].isdisjoint(scenario_ids["val"]))
        self.assertTrue(scenario_ids["train"].isdisjoint(scenario_ids["test"]))
        self.assertTrue(scenario_ids["val"].isdisjoint(scenario_ids["test"]))
        self.assertEqual(len(scenario_ids["test"]), 6)
        self.assertTrue(all("SIMULATION_NOT_LIVE" in case.completion
                            for split in corpus for case in corpus[split]))

    def test_owned_design_knowledge_teaches_uncertainty_not_live_claims(self):
        examples = design_teaching_examples(3)
        self.assertEqual(len(examples), 42)
        self.assertTrue(all(x.split == "train" for x in examples))
        self.assertTrue(all("NOT_PROVEN=" in x.completion for x in examples))
        self.assertTrue(any("Local Preference" in x.completion for x in examples))
        self.assertTrue(all("DESIGN_CHECK_NOT_LIVE_NETWORK" in x.completion
                            for x in examples))

    def test_scoring_rejects_field_names_without_actual_correct_values(self):
        corpus, _ = load_owned_module_cases()
        tok = ByteTokenizer()
        sample = corpus["test"][:2]

        class Incomplete:
            config = type("Config", (), {"block_size": 2048})()
            def eval(self):
                return self
            def complete(self, prefix, max_new_tokens=160):
                return prefix + tok.encode("CE1_EXIT=FAKE\n"
                    "LIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING")

        report = grade_simulation(Incomplete(), tok, sample, max_new_tokens=12)
        self.assertEqual(report["cases"], 2)
        self.assertEqual(report["all_four_outcomes_correct"], 0)
        self.assertEqual(report["exact_canonical"], 0)
        self.assertFalse(report["production_ready"])

        class Canonical:
            config = type("Config", (), {"block_size": 2048})()
            def __init__(self, examples):
                self.answers = {ex.prompt: ex.completion for ex in examples}
            def eval(self):
                return self
            def complete(self, prefix, max_new_tokens=160):
                prompt = tok.decode(prefix).split("Network observation:\n", 1)[1]
                prompt = prompt.rsplit("\nEngineering review:\n", 1)[0]
                return prefix + tok.encode(self.answers[prompt])

        best = grade_simulation(Canonical(sample), tok, sample)
        self.assertEqual(best["all_four_outcomes_correct"], 2)
        self.assertEqual(best["exact_canonical"], 2)

    def test_focused_tasks_keep_heldout_failure_groups_sealed(self):
        corpus, _ = load_owned_module_cases()
        focused = {split: focused_cases(rows) for split, rows in corpus.items()}
        self.assertEqual(len(focused["train"]), 768)
        self.assertEqual(len(focused["val"]), 40)
        self.assertEqual(len(focused["test"]), 96)
        self.assertTrue({x.scenario_id for x in focused["train"]}.isdisjoint(
            x.scenario_id for x in focused["test"]))
        self.assertTrue(all(x.completion.startswith("RESULT=")
                            and "LIMITATION=SIMULATION_NOT_LIVE" in x.completion
                            for x in focused["test"]))
        self.assertEqual(len({x.id for x in focused["test"]}), 96)
        self.assertTrue(all("Requested simulator outcome:" in x.prompt
                            for x in focused["test"]))

    def test_focused_grading_checks_values_not_just_syntax(self):
        corpus, _ = load_owned_module_cases()
        heldout = focused_cases(corpus["test"][:2])
        tok = ByteTokenizer()
        class Bad:
            config = type("Config", (), {"block_size": 2048})()
            def eval(self):
                return self
            def complete(self, prefix, max_new_tokens=100):
                return prefix + tok.encode("RESULT=MADE_UP\nLIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING")
        result = grade_focused(Bad(), tok, heldout)
        self.assertEqual(result["cases"], 8)
        self.assertEqual(result["correct_single_outcome"], 0)
        self.assertEqual(result["exact_canonical"], 0)

    def test_actual_random_weights_learn_from_source_without_product_approval(self):
        with TemporaryDirectory() as tmp:
            output = Path(tmp) / "model.pt"
            result = experiment(
                include_design=True, steps=2, seed=19, width=32, layers=1,
                heads=4, context=512, vocab_size=344, batch_size=2,
                output=str(output),
            )
            self.assertTrue(output.exists())
            self.assertEqual(result["train_simulation"], 192)
            self.assertEqual(result["train_design_knowledge"], 70)
            self.assertEqual(result["withheld_simulation"]["cases"], 24)
            self.assertFalse(result["production_ready"])
            weights = torch.load(output, map_location="cpu", weights_only=True)
            self.assertFalse(weights["manifest"]["engineering_verified"])
            self.assertEqual(weights["manifest"]["status"],
                             "SCRATCH_BGP_MODULE_KNOWLEDGE_RESEARCH_ONLY")
            self.assertEqual(sum(x.numel() for x in weights["weights"].values()),
                             result["parameters"])


if __name__ == "__main__":
    unittest.main()
