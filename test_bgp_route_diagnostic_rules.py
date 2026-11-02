import unittest
from bgp_route_diagnostic_rules import diagnose_route


class RouteTriageTests(unittest.TestCase):
    def test_missing_originated_prefix(self):
        d = diagnose_route(prefix_in_local_rib=False, prefix_in_local_bgp=False)
        self.assertIn("Local origination", " ".join(d["hypotheses"]))
        self.assertIsNone(d["root_cause"])

    def test_present_not_advertised(self):
        d = diagnose_route(prefix_in_local_bgp=True, prefix_advertised=False)
        self.assertIn("Outbound policy", " ".join(d["hypotheses"]))

    def test_received_not_installed(self):
        d = diagnose_route(prefix_received=True, prefix_installed=False, next_hop_reachable=False)
        self.assertIn("next hop is unreachable", " ".join(d["findings"]))
        self.assertFalse(d["configuration_change_authorized"])

    def test_no_evidence_never_guesses(self):
        d = diagnose_route()
        self.assertFalse(d["findings"])
        self.assertFalse(d["hypotheses"])

    def test_non_boolean_evidence_rejected(self):
        with self.assertRaises(TypeError):
            diagnose_route(prefix_advertised="false")


if __name__ == "__main__":
    unittest.main()
