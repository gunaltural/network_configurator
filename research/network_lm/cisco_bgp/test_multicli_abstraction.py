"""Protect peer scoping and alternate-command holdouts under input abstraction."""
import unittest

from .multicli_curriculum import case, dataset, fingerprint
from .multicli_abstraction import abstract_cli, abstract_record
from .multicli_holdout_v2 import holdout
from .multicli_lm import train


class SyntheticPeerIdentityAbstractionTests(unittest.TestCase):
    def test_distinguishes_target_and_other_peer(self):
        a = case("ACTIVE_TARGET", "train", 0)
        b = case("ACTIVE_WRONG_PEER", "train", 0)
        target_a = abstract_cli(a.example.prompt)
        target_b = abstract_cli(b.example.prompt)
        self.assertIn("TARGET_NEIGHBOR=PEER_TARGET", target_a)
        self.assertIn("TARGET_PREFIX=TARGET_IPV4_PREFIX", target_a)
        self.assertIn("show ip bgp neighbors PEER_TARGET", target_a)
        self.assertIn("show ip bgp neighbors PEER_DISTRACTOR", target_b)
        self.assertIn("BGP state = Active", target_a)
        self.assertIn("BGP state = Established", target_b)
        self.assertNotEqual(target_a, target_b)
        self.assertNotIn("192.0.2.", target_a)
        self.assertNotIn("10.51.1.0/24", target_a)
        self.assertNotIn("64512", target_a)
        self.assertEqual(
            abstract_record(a).example.completion, a.example.completion
        )

    def test_next_hop_resolution_versus_missing_route_remains_different(self):
        missing = abstract_record(case("NEXT_HOP_MISSING", "train", 0))
        present = abstract_record(case("NEXT_HOP_PRESENT", "train", 0))
        self.assertIn("TARGET_NEXT_HOP", missing.example.prompt)
        self.assertIn("% Network not in table", missing.example.prompt)
        self.assertIn("Known via connected", present.example.prompt)
        self.assertNotEqual(missing.example.prompt, present.example.prompt)

    def test_new_alternate_command_v2_remains_train_disjoint_even_after_abstraction(self):
        previous = dataset()
        new, fingerprint_v2 = holdout()
        self.assertEqual(len(new), 96)
        self.assertEqual(len(fingerprint_v2), 64)
        self.assertTrue(all("show bgp ipv4 unicast" in x.example.prompt or
                            "show running-config" in x.example.prompt
                            for x in new))
        old = {
            abstract_record(r).example.prompt
            for r in previous["train"] + previous["val"]
        }
        new_inputs = {abstract_record(r).example.prompt for r in new}
        self.assertTrue(new_inputs.isdisjoint(old))
        self.assertGreaterEqual(
            len(new_inputs), 8,
            "Every distinct evidence class must retain a unique normalized prompt",
        )
        self.assertNotEqual(
            fingerprint(new), fingerprint(previous["test"])
        )

    def test_unsupported_malformed_identifiers_refused(self):
        original = case("ACTIVE_TARGET", "train", 0).example.prompt
        with self.assertRaisesRegex(ValueError, "target peer"):
            abstract_cli(original.replace("TARGET_NEIGHBOR=", "MISSING_PEER="))
        with self.assertRaisesRegex(ValueError, "target peer"):
            abstract_cli(original.replace("TARGET_PREFIX=", "UNKNOWN_PREFIX="))
        with self.assertRaisesRegex(ValueError, "Missing"):
            abstract_cli("")


if __name__ == "__main__":
    unittest.main()
