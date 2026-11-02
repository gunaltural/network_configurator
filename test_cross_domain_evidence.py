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
        self.assertNotIn("explicitly uses this interface",
                         correlate_domains([bgp, interface, other], "Cisco IOS-XE", "en")[0])

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
