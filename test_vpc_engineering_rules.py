import unittest
from vpc_engineering_rules import assess_vpc


class VpcEngineeringRulesTest(unittest.TestCase):
    def setUp(self):
        self.evidence = [
            {"id": "cli-1-0", "text": "Device: N9K\nCommand: show running-config vpc\nL12: version 10.2(3)F\nL16: vpc domain 100\nL17:   role priority 10\nL18:   peer-keepalive destination 10.1.1.2 source 10.1.1.1 vrf management\nL19:   auto-recovery\nL20:   delay restore 30\nL22: interface port-channel1\nL25:   vpc peer-link"},
            {"id": "cli-2-0", "text": "Device: N9K\nCommand: show vpc\nL43: vPC domain id : 100\nL44: Peer status : peer adjacency formed ok\nL45: vPC keep-alive status : peer is alive\nL46: Configuration status : success\nL47: Per-vlan consistency status : success\nL51: Peer Gateway : Enabled"},
        ]

    def test_missing_design_and_operational_conflict(self):
        result = assess_vpc(self.evidence)
        self.assertIn("peer-switch yapılandırılmamış", result)
        self.assertIn("peer-gateway açıkça yapılandırılmamış", result)
        self.assertIn("Peer Gateway = Enabled", result)
        self.assertIn("VPC-OPER-001", result)
        self.assertIn("cli-1-0:L16", result)
        self.assertIn("cli-2-0:L51", result)

    def test_no_false_missing_when_configured(self):
        evidence = [dict(x) for x in self.evidence]
        evidence[0]["text"] = evidence[0]["text"].replace("L19:   auto-recovery", "L19:   peer-switch\nL19:   peer-gateway\nL19:   auto-recovery")
        result = assess_vpc(evidence)
        self.assertIn("peer-switch mevcut", result)
        self.assertIn("peer-gateway mevcut", result)
        self.assertNotIn("peer-switch yapılandırılmamış", result)

    def test_operational_only_does_not_infer_missing_config(self):
        self.assertIsNone(assess_vpc(self.evidence[1:]))

    def test_unrelated_evidence(self):
        self.assertIsNone(assess_vpc([{"id":"cli-1-0","text":"Command: show ip bgp summary\nL1: Established"}]))


if __name__ == "__main__":
    unittest.main()
