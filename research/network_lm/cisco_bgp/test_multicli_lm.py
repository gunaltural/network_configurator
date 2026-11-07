"""Source-grounded, never-live Cisco BGP multi-CLI generative research tests."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest

import torch

from ..model import ByteTokenizer
from .multicli_curriculum import (
    KINDS, TARGET, SOURCE_IDS, case, dataset, fingerprint,
)
from .multicli_lm import evaluate, train, prompt_tokens, _parse_lines
from .tokenizer import ScratchBPE


class OriginalMultiCliTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)
        cls.corpus = dataset()

    def test_source_catalog_and_group_isolation(self):
        self.assertEqual(len(KINDS), 8)
        self.assertEqual(len(self.corpus["train"]), 240)
        self.assertEqual(len(self.corpus["val"]), 56)
        self.assertEqual(len(self.corpus["test"]), 96)
        catalogs = json.loads(
            (Path(__file__).with_name("source_catalog.json")).read_text()
        )
        references = {s["id"] for s in catalogs["sources"]}
        self.assertTrue(set(sum((list(s) for s in SOURCE_IDS.values()), []))
                        <= references)
        all_ids = [
            r.example.id for rows in self.corpus.values() for r in rows
        ]
        self.assertEqual(len(all_ids), len(set(all_ids)))
        for left, right in (("train", "val"), ("train", "test"), ("val", "test")):
            self.assertTrue({
                r.example.scenario_id for r in self.corpus[left]
            }.isdisjoint({
                r.example.scenario_id for r in self.corpus[right]
            }))
            self.assertTrue({
                r.example.prompt for r in self.corpus[left]
            }.isdisjoint({
                r.example.prompt for r in self.corpus[right]
            }))
        self.assertEqual(len(fingerprint(self.corpus["test"])), 64)

    def test_peer_scope_and_prefix_specific_counterfactual_cases(self):
        for split in ("train", "test"):
            first = case("ACTIVE_TARGET", split, 0)
            second = case("ACTIVE_WRONG_PEER", split, 0)
            assert first.kind != second.kind
            a, b = first.example.prompt, second.example.prompt
            summary = a.split("CE# show ip bgp summary", 1)[1].split(
                "CE# show ip bgp neighbors", 1
            )[0]
            self.assertIn(summary, b)
            self.assertIn("TARGET_NEIGHBOR=", a)
            self.assertNotEqual(a, b)
            self.assertIn("BGP state = Active", a)
            self.assertIn("BGP state = Established", b)
            self.assertNotEqual(first.example.completion,
                                second.example.completion)
            missing = case("NEXT_HOP_MISSING", split, 2)
            present = case("NEXT_HOP_PRESENT", split, 2)
            self.assertIn("% Network not in table", missing.example.prompt)
            self.assertIn("Known via connected", present.example.prompt)
            self.assertNotEqual(missing.example.completion,
                                present.example.completion)
            self.assertIn("NOT_PROVEN=", missing.example.completion)
            self.assertIn("CHECK=", present.example.completion)

    def test_never_call_cisco_diagnostics_real_from_synthetic_evidence(self):
        for split, records in self.corpus.items():
            for record in records:
                e = record.example
                self.assertEqual(e.split, split)
                self.assertIn("NOT a real device", e.prompt)
                self.assertIn("TARGET_NEIGHBOR=", e.prompt)
                self.assertIn("TARGET_PREFIX=", e.prompt)
                self.assertNotIn("FINDING=", e.prompt)
                self.assertEqual(
                    tuple(_parse_lines(e.completion)),
                    ("FINDING", "WHY", "NOT_PROVEN", "CHECK"),
                )
                self.assertEqual(e.completion.count("NOT_PROVEN="), 1)
                self.assertIn(record.kind, TARGET)

    def test_true_autogeneration_scoring_rejects_wrong_evidence_tags(self):
        tok = ByteTokenizer()

        class SameEveryTime:
            config = type("Config", (), {"block_size": 4096})()
            def eval(self):
                return self
            def complete(self, prefix, max_new_tokens=160):
                return prefix + tok.encode("\n".join(TARGET["ACTIVE_TARGET"]))

        score = evaluate(SameEveryTime(), tok, self.corpus["test"])
        self.assertEqual(score["total"], 96)
        self.assertEqual(score["finding_correct"], 12)
        self.assertEqual(score["exact_explanation"], 12)
        self.assertEqual(score["paired_contrasts"]["total"], 36)
        self.assertEqual(score["paired_contrasts"]["both_correct"], 0)
        self.assertEqual(score["paired_contrasts"]["prediction_changed"], 0)
        self.assertFalse(score["production_ready"])
        self.assertEqual(
            _parse_lines("FINDING=A\nFINDING=B")["FINDING"], None
        )

    def test_actual_random_initialized_model_learns_and_saves_safe_checkpoint(self):
        with TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "cli.pt"
            result = train(
                steps=2, seed=17, width=32, layers=1, heads=4,
                context=512, vocab_size=340, batch_size=2,
                threads=2, output=str(checkpoint),
            )
            self.assertTrue(checkpoint.is_file())
            self.assertEqual(result["train_samples"], 240)
            self.assertEqual(result["val_samples"], 56)
            self.assertEqual(result["test_samples"], 96)
            self.assertEqual(result["majority_reference_correct"], 12)
            self.assertEqual(
                result["heldout_generation"]["paired_contrasts"]["total"], 36
            )
            self.assertTrue(result["deterministic_algorithms"])
            self.assertFalse(result["engineering_verified"])
            self.assertFalse(result["production_ready"])
            weights = torch.load(checkpoint, map_location="cpu", weights_only=True)
            self.assertEqual(weights["manifest"]["status"],
                             "CISCO_BGP_MULTI_CLI_GENERATIVE_RESEARCH_ONLY")
            self.assertFalse(weights["manifest"]["engineering_verified"])
            vocabulary = ScratchBPE.from_manifest(weights["tokenizer"])
            self.assertEqual(
                vocabulary.fingerprint(),
                weights["manifest"]["tokenizer_sha256"],
            )
            self.assertEqual(
                sum(t.numel() for t in weights["weights"].values()),
                result["parameter_count"],
            )


if __name__ == "__main__":
    unittest.main()
