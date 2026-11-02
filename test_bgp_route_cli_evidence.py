import unittest
from bgp_route_cli_evidence import extract_route_evidence, route_diagnostic_text
from tac_overview import overview


def capture(command, line, evidence_id="ev1"):
    return {"id": evidence_id, "text": f"Device: R1\nCommand: {command}\nL1: {line}"}


class RouteEvidenceTests(unittest.TestCase):
    def test_advertised_prefix_is_positive_observation(self):
        b = capture("show ip bgp neighbors 192.0.2.2 advertised-routes", "*> 10.11.0.0/16 0.0.0.0 0 32768 i")
        results = extract_route_evidence([b])
        self.assertEqual(len(results), 1)
        self.assertTrue(results[0]["observations"]["prefix_advertised"])
        self.assertIn("ev1, L1", results[0]["references"][0])

    def test_absent_prefix_does_not_prove_denial(self):
        b = capture("show ip bgp neighbors 192.0.2.2 advertised-routes", "Network Next Hop Metric LocPrf Weight Path")
        self.assertEqual(extract_route_evidence([b]), [])

    def test_received_route_does_not_imply_installed(self):
        b = capture("show ip bgp neighbors 192.0.2.2 routes", "*> 10.11.0.0/16 192.0.2.2 0 65002 i")
        result = extract_route_evidence([b])[0]
        self.assertEqual(result["observations"], {"prefix_received": True})

    def test_holistic_report_includes_route_evidence(self):
        b = capture("show ip bgp neighbors 192.0.2.2 advertised-routes", "*> 10.11.0.0/16 0.0.0.0 0 32768 i")
        result = overview([b], "Cisco IOS-XE", "en")
        self.assertIsNotNone(result)
        self.assertIn("BGP routes", result[0])
        self.assertIn("10.11.0.0/16", result[0])

    def test_malformed_route_ignored(self):
        b = capture("show ip bgp", "*> 999.0.0.0/16 192.0.2.2")
        self.assertEqual(extract_route_evidence([b]), [])


if __name__ == "__main__":
    unittest.main()
