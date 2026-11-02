import unittest
from cross_domain_evidence import correlate_domains


def block(identifier, device, command, rows):
    return {"id": identifier, "text": "\n".join(
        [f"Device: {device}", f"Command: {command}"] + rows)}


class CrossDomainEvidenceTests(unittest.TestCase):
    def test_same_device_correlates_without_claiming_root_cause(self):
        blocks = [
            block("bgp", "CE1", "show ip bgp summary", [
                "L4: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd",
                "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active"]),
            block("interfaces", "CE1", "show ip interface brief", [
                "L7: GigabitEthernet0/1 192.0.2.1 YES manual down down"])]
        findings = correlate_domains(blocks, "Cisco IOS-XE", "en")
        self.assertEqual(len(findings), 1)
        self.assertIn("do not establish causality", findings[0])
        self.assertIn("bgp, L5", findings[0])
        self.assertIn("interfaces, L7", findings[0])

    def test_explicit_host_route_supports_peer_path_without_proving_cause(self):
        bgp = block("bgp", "CE1", "show ip bgp summary", [
            "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active"])
        interface = block("int", "CE1", "show ip interface brief", [
            "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down"])
        route = block("rib", "CE1", "show ip route", [
            "L8: S 192.0.2.2/32 [1/0] via 10.0.0.1, GigabitEthernet0/1"])
        findings = correlate_domains([bgp, interface, route], "Cisco IOS-XE", "en")
        self.assertEqual(len(findings), 1)
        self.assertIn("explicitly uses this interface", findings[0])
        self.assertIn("rib, L8", findings[0])
        other = block("rib", "CE1", "show ip route", [
            "L8: S 192.0.2.2/32 [1/0] via 10.0.0.1, GigabitEthernet0/9"])
        self.assertEqual(correlate_domains([bgp, interface, other], "Cisco IOS-XE", "en"), [])

    def test_ambiguous_interfaces_do_not_produce_a_spurious_link(self):
        bgp = block("bgp", "CE1", "show ip bgp summary", [
            "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active"])
        interfaces = block("int", "CE1", "show ip interface brief", [
            "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down",
            "L7: GigabitEthernet0/2 198.51.100.1 YES manual down down"])
        self.assertEqual(correlate_domains([bgp, interfaces], "Cisco IOS-XE", "en"), [])

    def test_multiple_peers_are_evaluated_separately(self):
        blocks = [
            block("bgp", "CE1", "show ip bgp summary", [
                "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active",
                "L6: 192.0.2.3 4 65003 0 0 0 0 0 never Idle"]),
            block("int", "CE1", "show ip interface brief", [
                "L7: GigabitEthernet0/1 192.0.2.1 YES manual down down"])]
        result = correlate_domains(blocks, "Cisco IOS-XE", "en")
        self.assertEqual(len(result), 2)
        self.assertTrue(any("192.0.2.2" in finding for finding in result))
        self.assertTrue(any("192.0.2.3" in finding for finding in result))

    def test_route_disambiguates_multiple_failed_interfaces(self):
        blocks = [
            block("bgp", "CE1", "show ip bgp summary", [
                "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active"]),
            block("int", "CE1", "show ip interface brief", [
                "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down",
                "L7: GigabitEthernet0/2 198.51.100.1 YES manual down down"]),
            block("rib", "CE1", "show ip route", [
                "L8: S 192.0.2.2/32 [1/0] via 10.0.0.1, GigabitEthernet0/2"])]
        result = correlate_domains(blocks, "Cisco IOS-XE", "en")
        self.assertEqual(len(result), 1)
        self.assertIn("GigabitEthernet0/2", result[0])
        self.assertIn("rib, L8", result[0])
        self.assertNotIn("GigabitEthernet0/1", result[0])

    def test_vrf_route_is_not_used_as_default_bgp_path(self):
        bgp = block("bgp", "CE1", "show ip bgp summary", [
            "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active"])
        interface = block("int", "CE1", "show ip interface brief", [
            "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down"])
        vrf_route = block("vrf", "CE1", "show ip route vrf CUSTOMER", [
            "L8: S 192.0.2.2/32 [1/0] via 10.0.0.1, GigabitEthernet0/1"])
        result = correlate_domains([bgp, interface, vrf_route], "Cisco IOS-XE", "en")
        self.assertEqual(len(result), 1)
        self.assertNotIn("explicitly uses this interface", result[0])
        self.assertNotIn("vrf, L8", result[0])

    def test_vrf_bgp_peer_matches_only_its_own_rib(self):
        bgp = block("bgp", "CE1", "show ip bgp vrf CUSTOMER summary", [
            "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active"])
        interface = block("int", "CE1", "show ip interface brief", [
            "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down"])
        correct = block("vrf", "CE1", "show ip route vrf CUSTOMER", [
            "L8: S 192.0.2.2/32 [1/0] via 10.0.0.1, GigabitEthernet0/1"])
        unrelated = block("global", "CE1", "show ip route", [
            "L8: S 192.0.2.2/32 [1/0] via 10.0.0.1, GigabitEthernet0/1"])
        matched = correlate_domains([bgp, interface, correct], "Cisco IOS-XE", "en")
        self.assertEqual(len(matched), 1)
        self.assertIn("VRF customer", matched[0])
        self.assertIn("explicitly uses this interface", matched[0])
        unmatched = correlate_domains([bgp, interface, unrelated], "Cisco IOS-XE", "en")
        self.assertEqual(len(unmatched), 1)
        self.assertNotIn("explicitly uses this interface", unmatched[0])

    def test_contradictory_route_does_not_select_failed_interface(self):
        bgp = block("bgp", "CE1", "show ip bgp summary", [
            "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active"])
        down = block("int", "CE1", "show ip interface brief", [
            "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down"])
        route = block("rib", "CE1", "show ip route", [
            "L8: S 192.0.2.2/32 [1/0] via 10.0.0.1, GigabitEthernet0/2"])
        self.assertEqual(
            correlate_domains([bgp, down, route], "Cisco IOS-XE", "en"), [])

    def test_recursive_host_route_reaches_failed_egress(self):
        blocks = [
            block("bgp", "CE1", "show ip bgp summary", [
                "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active"]),
            block("int", "CE1", "show ip interface brief", [
                "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down"]),
            block("rib", "CE1", "show ip route", [
                "L8: S 192.0.2.2/32 [1/0] via 10.0.0.2",
                "L9: S 10.0.0.2/32 [1/0] via 10.0.0.1, GigabitEthernet0/1"])]
        result = correlate_domains(blocks, "Cisco IOS-XE", "en")
        self.assertEqual(len(result), 1)
        self.assertIn("explicitly uses this interface", result[0])
        self.assertIn("rib, L8", result[0])
        self.assertIn("rib, L9", result[0])

    def test_unresolved_recursive_route_is_not_assumed_direct(self):
        blocks = [
            block("bgp", "CE1", "show ip bgp summary", [
                "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active"]),
            block("int", "CE1", "show ip interface brief", [
                "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down"]),
            block("rib", "CE1", "show ip route", [
                "L8: S 192.0.2.2/32 [1/0] via 10.0.0.2"])]
        self.assertEqual(correlate_domains(blocks, "Cisco IOS-XE", "en"), [])

    def test_longest_prefix_route_selects_specific_egress(self):
        blocks = [
            block("bgp", "CE1", "show ip bgp summary", [
                "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Active"]),
            block("int", "CE1", "show ip interface brief", [
                "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down"]),
            block("rib", "CE1", "show ip route", [
                "L8: S 192.0.0.0/16 [1/0] via 10.0.0.1, GigabitEthernet0/9",
                "L9: S 192.0.2.0/24 [1/0] via 10.0.0.2, GigabitEthernet0/1"])]
        findings = correlate_domains(blocks, "Cisco IOS-XE", "en")
        self.assertEqual(len(findings), 1)
        self.assertIn("rib, L9", findings[0])
        self.assertNotIn("rib, L8", findings[0])

    def test_invalid_peer_address_is_ignored(self):
        bgp = block("bgp", "CE1", "show ip bgp summary", [
            "L5: 999.0.2.2 4 65002 0 0 0 0 0 never Active"])
        interface = block("int", "CE1", "show ip interface brief", [
            "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down"])
        self.assertEqual(correlate_domains([bgp, interface], "Cisco IOS-XE", "en"), [])

    def test_no_cross_device_or_healthy_interface_correlation(self):
        bgp = block("bgp", "CE1", "show ip bgp summary", [
            "L5: 192.0.2.2 4 65002 0 0 0 0 0 never Idle"])
        other = block("int", "CE2", "show ip interface brief", [
            "L6: GigabitEthernet0/1 192.0.2.1 YES manual down down"])
        healthy = block("int", "CE1", "show ip interface brief", [
            "L6: GigabitEthernet0/1 192.0.2.1 YES manual up up"])
        self.assertEqual(correlate_domains([bgp, other], "Cisco IOS-XE", "en"), [])
        self.assertEqual(correlate_domains([bgp, healthy], "Cisco IOS-XE", "en"), [])


if __name__ == "__main__":
    unittest.main()
