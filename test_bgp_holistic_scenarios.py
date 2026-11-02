"""Synthetic multi-command TAC evidence scenarios (no live-device claims)."""
import unittest
from tac_overview import overview


def block(eid, command, lines, device="R1"):
    text = "\n".join([f"Device: {device}", f"Command: {command}"] +
                     [f"L{i}: {line}" for i, line in enumerate(lines, 1)])
    return {"id": eid, "text": text}


class HolisticEvidenceTests(unittest.TestCase):
    def test_bgp_active_with_static_route_and_acl(self):
        blocks = [
            block("bgp1", "show ip bgp summary", [
                "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd",
                "192.0.2.2 4 65002 0 0 0 0 0 never Active",
            ]),
            block("cfg1", "show running-config", [
                "ip route 198.51.100.0 255.255.255.0 192.0.2.254",
                "line vty 0 4",
                " transport input ssh",
                " access-class MGMT in",
            ]),
            block("acl1", "show ip access-lists", [
                "Standard IP access list MGMT",
                "10 permit 10.0.0.0 0.255.255.255",
            ]),
            block("routes1", "show ip bgp neighbors 192.0.2.2 advertised-routes", [
                "Network Next Hop Metric LocPrf Weight Path",
                "*> 10.11.0.0/16 0.0.0.0 0 32768 i",
            ]),
        ]
        result = overview(blocks, "Cisco IOS-XE", "en")
        self.assertIsNotNone(result)
        report, categories = result
        for category in ("BGP", "BGP routes", "Static routes", "Management security", "ACL"):
            self.assertIn(category, categories)
        self.assertIn("Possible causes (unverified)", report)
        self.assertIn("10.11.0.0/16", report)
        self.assertIn("198.51.100.0/24", report)
        self.assertIn("cfg1, L1", report)
        self.assertNotIn("Root cause:", report)

    def test_empty_evidence_not_diagnosed(self):
        result = overview([block("unknown", "show version", ["Example OS"])], "Cisco IOS-XE", "en")
        self.assertIsNone(result)

    def test_no_cross_device_log_correlation(self):
        blocks = [
            block("bgp", "show ip bgp summary", [
                "Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd",
                "192.0.2.2 4 65002 0 0 0 0 0 never Active",
            ], "R1"),
            block("logs", "show logging", [
                "%BGP-5-ADJCHANGE: neighbor 192.0.2.2 Down Peer closed session",
            ], "R2"),
        ]
        report = overview(blocks, "Cisco IOS-XE", "en")[0]
        self.assertNotIn("Peer closed session", report)


if __name__ == "__main__":
    unittest.main()
