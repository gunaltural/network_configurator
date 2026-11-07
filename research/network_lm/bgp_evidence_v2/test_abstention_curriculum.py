"""Guard against hallucinated BGP root causes on incomplete or conflicting CLI."""
from collections import Counter
import re
import unittest

from ..model import ByteTokenizer
from .abstention_curriculum import (
    GAPS, UNKNOWN_KIND, case, cases, field_tasks, audit,
)
from .curriculum import FIELDS, SPLIT_CONTEXTS


class InsufficientEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.a=audit()
        cls.c=cases()

    def test_nonoverlapping_and_five_distinct_missing_evidence_modes(self):
        self.assertEqual(len(GAPS),5)
        self.assertEqual(self.a["records"],
                         {"train":140,"val":40,"test":60})
        self.assertEqual(self.a["field_tasks"],
                         {"train":560,"val":160,"test":240})
        for split,rows in self.c.items():
            self.assertEqual(
                {x.gap for x in rows},set(GAPS))
            self.assertEqual(len({x.example.prompt for x in rows}),len(rows))
            self.assertEqual(len({x.example.id for x in rows}),len(rows))
            self.assertTrue(all(x.example.split==split for x in rows))
            tasks=field_tasks(rows)
            self.assertTrue(all(
                x.completion.startswith(x.id.rsplit("-",1)[-1]+"=")
                for x in tasks))
            self.assertTrue(all(
                "FINDING="+UNKNOWN_KIND in x.example.completion
                for x in rows))
        self.assertEqual(len(self.a["sha256"]["test"]),64)
        self.assertFalse(self.a["production_ready"])

    def test_missing_peer_never_borrows_distractor_status(self):
        for cid in SPLIT_CONTEXTS["test"]:
            row=case("test",cid,"OTHER_PEER_ONLY")
            text=row.example.prompt
            peer="192.0.2."+str(18+cid)
            other="198.51.100."+str(18+cid)
            self.assertIn("TARGET_NEIGHBOR="+peer,text)
            self.assertIn("show ip bgp neighbors "+other,text)
            self.assertNotIn("show ip bgp neighbors "+peer,text)
            self.assertNotIn(peer+" 64512",text)
            self.assertEqual(row.example.completion.splitlines()[0],
                             "FINDING=EVIDENCE_INSUFFICIENT")

    def test_prefix_and_next_hop_evidence_must_be_for_same_subject(self):
        for cid in SPLIT_CONTEXTS["test"]:
            prefix="10."+str(20+cid)+".0.0/24"
            nh="203.0.113."+str(18+cid)
            missing=case("test",cid,"BGP_PREFIX_ONLY").example.prompt
            self.assertIn("show ip bgp "+prefix,missing)
            self.assertNotIn("show ip route "+nh,missing)
            route=case("test",cid,"IP_ROUTE_ONLY").example.prompt
            self.assertIn("show ip route "+nh,route)
            self.assertNotIn("show ip bgp "+prefix,route)
            wrong=case("test",cid,"WRONG_PREFIX_RIB").example.prompt
            self.assertIn("show ip bgp "+prefix,wrong)
            self.assertNotIn("show ip route "+prefix,wrong)
            self.assertIn("Known via static",wrong)

    def test_conflicting_peer_fsm_cannot_be_treated_as_certain_snapshot(self):
        cid=SPLIT_CONTEXTS["test"][0]
        row=case("test",cid,"CONTRADICTORY_PEER").example
        self.assertIn("00:15:20 8",row.prompt)
        self.assertIn("BGP state = Active",row.prompt)
        self.assertIn("Observation times unknown",row.prompt)
        self.assertIn("NOT_PROVEN=",row.completion)
        self.assertIn("CHECK=",row.completion)

    def test_cross_split_synthetic_abstention_contexts_dont_leak(self):
        for left,right in (("train","val"),("train","test"),("val","test")):
            self.assertTrue({
                r.context_id for r in self.c[left]
            }.isdisjoint({r.context_id for r in self.c[right]}))
            self.assertTrue({
                r.example.prompt for r in self.c[left]
            }.isdisjoint({r.example.prompt for r in self.c[right]}))
        with self.assertRaisesRegex(ValueError,"frozen context"):
            case("train",SPLIT_CONTEXTS["test"][0],"BGP_PREFIX_ONLY")
        with self.assertRaisesRegex(ValueError,"Unexpected"):
            case("test",SPLIT_CONTEXTS["test"][0],"FAKE_EVIDENCE")


if __name__=="__main__":
    unittest.main()
