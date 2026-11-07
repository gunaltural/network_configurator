"""Real semantic BGP evidence diversity and split protection, not row inflation."""
from collections import Counter
import json
import re
import unittest

from .curriculum import (
    ALL_CONTEXTS, FIELDS, KINDS, SPLIT_CONTEXTS,
    cases, tasks, make_case, report, digest,
)


def _role_mask(prompt):
    return re.sub(
        r"\b(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d+\b",
        "ROLE_IP", re.sub(r"\b10\.\d+\.0\.0/24\b", "TARGET_PREFIX", prompt),
    )


class FactorialEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = cases()
        cls.audit = report()

    def test_split_sizes_and_original_contexts_are_disjoint(self):
        self.assertEqual(len(ALL_CONTEXTS), 48)
        self.assertEqual({s: len(x) for s,x in self.dataset.items()},
                         {"train":224,"val":64,"test":96})
        self.assertEqual(self.audit["field_tasks"],
                         {"train":896,"val":256,"test":384})
        self.assertEqual(self.audit["unique_case_prompts"],
                         {"train":224,"val":64,"test":96})
        self.assertEqual(
            self.audit["unique_field_prompts"],
            self.audit["field_tasks"],
        )
        for left,right in (("train","val"),("train","test"),("val","test")):
            self.assertTrue(set(SPLIT_CONTEXTS[left]).isdisjoint(
                SPLIT_CONTEXTS[right]))
            self.assertTrue({
                x.example.scenario_id for x in self.dataset[left]
            }.isdisjoint({
                x.example.scenario_id for x in self.dataset[right]
            }))
            self.assertTrue({
                x.example.prompt for x in self.dataset[left]
            }.isdisjoint({
                x.example.prompt for x in self.dataset[right]
            }))
        self.assertFalse(self.audit["production_ready"])
        self.assertFalse(self.audit["engineering_verified"])

    def test_semantically_distinct_even_after_removing_device_identifiers(self):
        # Hard guard against repeating the previous mistake: 240 original
        # prompt rows collapsed to just 19 distinct after abstraction.
        for split,minimum in (("train",120),("val",40),("test",60)):
            observed={_role_mask(x.example.prompt) for x in self.dataset[split]}
            self.assertGreaterEqual(len(observed), minimum)
            self.assertGreaterEqual(len(self.dataset[split])/len(observed), 1)

    def test_counterfactual_peer_binding_has_same_summary_and_different_detail(self):
        cid=SPLIT_CONTEXTS["test"][0]
        direct=make_case("ACTIVE_TARGET","test",cid).example.prompt
        unrelated=make_case("ACTIVE_WRONG_PEER","test",cid).example.prompt
        peer="192.0.2."+str(18+cid)
        other="198.51.100."+str(18+cid)
        self.assertIn(peer+"  64512  00:18:34  Active",direct)
        self.assertIn(peer+"  64512  00:18:34  Active",unrelated)
        self.assertIn("show ip bgp neighbors "+peer,direct)
        self.assertIn("show ip bgp neighbors "+other,unrelated)
        self.assertNotEqual(direct,unrelated)
        self.assertIn("TARGET_NEIGHBOR="+peer,direct)
        self.assertNotIn("FINDING=",direct)

    def test_counterfactual_prefix_and_route_selectors_preserved(self):
        cid=SPLIT_CONTEXTS["test"][1]
        zero=make_case("ZERO_PREFIX","test",cid).example.prompt
        positive=make_case("POSITIVE_PREFIX","test",cid).example.prompt
        self.assertIn("received prefixes 0",zero)
        self.assertRegex(positive,r"received prefixes (?:[3-9]|1[0-6])")
        missing=make_case("NEXT_HOP_MISSING","test",cid).example.prompt
        resolved=make_case("NEXT_HOP_PRESENT","test",cid).example.prompt
        self.assertIn("% Network not in table",missing)
        self.assertIn("Known via connected",resolved)
        static=make_case("RIB_STATIC_WINS","test",cid).example.prompt
        self.assertIn("Known via static, distance 1",static)
        self.assertIn("BGP-to-RIB selection not shown",static)

    def test_all_eight_target_classes_have_balanced_contexts_and_same_provenance(self):
        for split,records in self.dataset.items():
            counts=Counter(r.kind for r in records)
            self.assertEqual(set(counts),set(KINDS))
            self.assertEqual(len(set(counts.values())),1)
            self.assertEqual(
                len({r.example.id for r in records}),len(records))
            fields=tasks(records)
            self.assertTrue(all(x.split==split for x in fields))
            self.assertTrue(all(x.completion.split("=",1)[0] in FIELDS
                                for x in fields))
            self.assertEqual(len(digest(fields)),64)
            self.assertTrue(all(len(r.source_ids)>0 for r in records))
            self.assertTrue(all("NOT a real device" not in r.example.prompt
                                or "synthetic" in r.example.prompt.lower()
                                for r in records))

    def test_impossible_context_leakage_fails_closed(self):
        cid=SPLIT_CONTEXTS["test"][0]
        with self.assertRaisesRegex(ValueError, "frozen split"):
            make_case("ACTIVE_TARGET","train",cid)
        with self.assertRaises(ValueError):
            make_case("OTHER_PROTOCOL","test",cid)


if __name__ == "__main__":
    unittest.main()
