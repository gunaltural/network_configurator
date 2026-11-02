"""Regression checks for evidence-bound BGP diagnostic rules."""
import unittest

from bgp_diagnostic_rules import diagnose_neighbor
from bgp_cli_evidence import summarize_capture


class NeighborRulesTests(unittest.TestCase):
    def test_idle_does_not_claim_root_cause(self):
        result = diagnose_neighbor("Idle")
        self.assertIsNone(result["root_cause"])
        self.assertFalse(result["configuration_change_authorized"])
        self.assertFalse(result["live_verification_performed"])
        self.assertTrue(result["hypotheses"])

    def test_established_prefix_count_zero(self):
        result = diagnose_neighbor("0")
        self.assertEqual(result["state"], "Established")
        self.assertEqual(result["received_prefix_count"], 0)
        self.assertFalse(result["hypotheses"])

    def test_admin_idle_is_not_unexpected_failure(self):
        result = diagnose_neighbor("Idle (Admin)")
        self.assertIn("administratively", result["hypotheses"][0])

    def test_unknown_state_is_rejected(self):
        with self.assertRaises(ValueError):
            diagnose_neighbor("Established")


class SummaryIntegrationTests(unittest.TestCase):
    def test_cli_summary_includes_unverified_hypotheses(self):
        block = {
            "id": "ev1",
            "text": (
                "Device: R1\nCommand: show ip bgp summary\n"
                "L1: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n"
                "L2: 192.0.2.2 4 65002 0 0 0 0 0 never Idle"
            ),
        }
        result = summarize_capture([block], "en")
        self.assertIsNotNone(result)
        _, rendered = result
        self.assertIn("Possible causes (unverified)", rendered)
        self.assertIn("[ev1, L2;", rendered)
        self.assertNotIn("Root cause:", rendered)


if __name__ == "__main__":
    unittest.main()
