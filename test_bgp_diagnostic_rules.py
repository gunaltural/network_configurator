"""Regression checks for evidence-bound BGP diagnostic rules."""
import unittest

from bgp_diagnostic_rules import diagnose_neighbor
from bgp_cli_evidence import summarize_capture, summary_rows
from tac_overview import overview


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
    def test_summary_footer_does_not_discard_valid_peer(self):
        block = {"id": "footer", "text": (
            "Device: R1\nCommand: show ip bgp summary\n"
            "L1: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n"
            "L2: 192.0.2.2 4 65002 1 1 1 0 0 00:01:00 5\n"
            "L3: Total number of neighbors 1")}
        rows = summary_rows(block)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][4], "5")

    def test_holistic_overview_shows_bgp_diagnostics(self):
        block = {'id': 'ev2', 'text': (
            'Device: R2\nCommand: show ip bgp summary\n'
            'L1: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n'
            'L2: 192.0.2.3 4 65003 0 0 0 0 0 never Active')}
        result = overview([block], 'Cisco IOS-XE', 'en')
        self.assertIsNotNone(result)
        self.assertIn('Possible causes (unverified)', result[0])
        self.assertIn('Next read-only checks', result[0])

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
