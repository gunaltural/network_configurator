"""Keep multiple CLI views train-only and third-format evaluation untouched."""
import unittest

from .multicli_curriculum import KINDS, case, dataset, fingerprint
from .multicli_abstraction import abstract_record
from .multicli_views import train_views, v3_view


class OriginalCLIMultiViewTests(unittest.TestCase):
    def test_training_views_keep_findings_evidence_and_scope_unchanged(self):
        for kind in KINDS:
            row = abstract_record(case(kind, "train", 4))
            views = train_views(row)
            self.assertEqual(len(views), 4)
            self.assertEqual(len({x.example.prompt for x in views}), 4)
            self.assertTrue(all(x.example.split == "train" for x in views))
            self.assertTrue(all(x.example.completion == row.example.completion
                                for x in views))
            self.assertTrue(all(x.kind == row.kind for x in views))
            self.assertTrue(all("TARGET_NEIGHBOR=PEER_TARGET" in x.example.prompt
                                for x in views))
            self.assertTrue(all("TARGET_PREFIX=TARGET_IPV4_PREFIX" in x.example.prompt
                                for x in views))
            self.assertTrue(all("FINDING=" not in x.example.prompt
                                for x in views))
            self.assertTrue(any("show bgp ipv4 unicast" in x.example.prompt
                                for x in views))

    def test_third_format_uses_untrained_command_order_and_cisco_variant(self):
        orig = dataset()
        v3 = [v3_view(x) for x in orig["test"]]
        self.assertEqual(len(v3), 96)
        self.assertEqual(len({r.example.id for r in v3}), 96)
        self.assertEqual(
            [r.example.completion for r in v3],
            [r.example.completion for r in orig["test"]],
        )
        self.assertTrue(all(r.example.split == "test" for r in v3))
        self.assertNotEqual(fingerprint(v3), fingerprint(orig["test"]))
        self.assertTrue(any("show ip bgp all summary" in r.example.prompt
                            for r in v3))
        training = [
            v for r in orig["train"] for v in train_views(abstract_record(r))
        ]
        known = {x.example.prompt for x in training}
        heldout = {abstract_record(r).example.prompt for r in v3}
        self.assertEqual(len(known.intersection(heldout)), 0)
        self.assertTrue(all("Read-only BGP evidence packet" in r.example.prompt
                            for r in v3))

    def test_cannot_augment_validation_or_test(self):
        for split in ("val", "test"):
            with self.assertRaisesRegex(ValueError, "training records only"):
                train_views(case("ACTIVE_TARGET", split, 1))
        with self.assertRaisesRegex(ValueError, "test-only"):
            v3_view(case("ACTIVE_TARGET", "train", 1))


if __name__ == "__main__":
    unittest.main()
