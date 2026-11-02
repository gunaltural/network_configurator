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

    def test_same_prefix_from_distinct_peers_kept_separate(self):
        a = capture("show ip bgp neighbors 192.0.2.2 advertised-routes", "*> 10.11.0.0/16 0.0.0.0 0 32768 i", "a")
        b = capture("show ip bgp neighbors 192.0.2.3 advertised-routes", "*> 10.11.0.0/16 0.0.0.0 0 32768 i", "b")
        rows = extract_route_evidence([a, b])
        self.assertEqual(len(rows), 2)
        self.assertEqual({row["peer"] for row in rows}, {"192.0.2.2", "192.0.2.3"})

    def test_nxos_command_family(self):
        b = capture("show bgp ipv4 unicast neighbors 192.0.2.2 advertised-routes", "*> 10.11.0.0/16 0.0.0.0 0 32768 i")
        self.assertEqual(len(extract_route_evidence([b])), 1)

    def test_missing_evidence_is_not_assumed_negative(self):
        b = capture("show ip bgp", "*> 10.11.0.0/16 0.0.0.0 0 32768 i")
        row = extract_route_evidence([b])[0]
        self.assertEqual(row["observations"], {"prefix_in_local_bgp": True})
        self.assertNotIn("prefix_advertised", row["observations"])

    def test_unidentified_device_not_attributed(self):
        b = capture("show ip bgp", "*> 10.11.0.0/16 0.0.0.0 0 32768 i")
        b["text"] = b["text"].replace("Device: R1", "Device: Unidentified")
        self.assertEqual(extract_route_evidence([b]), [])

    def test_report_discloses_incomplete_capture(self):
        b = capture("show ip bgp", "*> 10.11.0.0/16 0.0.0.0 0 32768 i")
        self.assertIn("does not prove route absence", str(route_diagnostic_text([b], "en")))

    def test_unrelated_evidence_id_not_marked_interpreted(self):
        a = capture("show ip bgp", "*> 10.11.0.0/16 0.0.0.0 0 32768 i", "ev1")
        b = capture("show version", "Example OS", "ev")
        report = overview([a, b], "Cisco IOS-XE", "en")[0]
        self.assertIn("ev (R1 · show version)", report)

    def test_malformed_route_ignored(self):
        b = capture("show ip bgp", "*> 999.0.0.0/16 192.0.2.2")
        self.assertEqual(extract_route_evidence([b]), [])


if __name__ == "__main__":
    unittest.main()
