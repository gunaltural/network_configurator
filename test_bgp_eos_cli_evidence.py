import unittest
from bgp_eos_cli_evidence import eos_summary_rows
from tac_overview import overview


class EOSBGPEvidenceTests(unittest.TestCase):
    def test_active_neighbor_appears_in_holistic_report(self):
        block = {"id": "eos1", "text": (
            "Device: EOS-1\nCommand: show ip bgp summary\n"
            "L1: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n"
            "L2: 192.0.2.2 4 65002 0 0 0 0 0 never Active")}
        report = overview([block], "Arista EOS", "en")
        self.assertIsNotNone(report)
        self.assertIn("Possible causes (unverified)", report[0])
        self.assertIn("eos1, L2", report[0])

    def test_eos_summary_without_tblver(self):
        block = {"id": "eos2", "text": (
            "Device: EOS-2\nCommand: show ip bgp summary\n"
            "L1: Neighbor V AS MsgRcvd MsgSent InQ OutQ Up/Down State/PfxRcd\n"
            "L2: 192.0.2.3 4 65003 10 11 0 0 00:05:00 12")}
        rows = eos_summary_rows(block)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][4], "12")

    def test_invalid_table_does_not_infer_state(self):
        block = {"id": "bad", "text": (
            "Device: EOS-1\nCommand: show ip bgp summary\n"
            "L1: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n"
            "L2: 192.0.2.2 4 65002 0 0 0 0 0 never Unknown")}
        self.assertEqual(eos_summary_rows(block), [])

    def test_unidentified_device_not_attributed(self):
        block = {"id": "bad", "text": (
            "Device: Unidentified\nCommand: show ip bgp summary\n"
            "L1: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n"
            "L2: 192.0.2.2 4 65002 0 0 0 0 0 never Active")}
        self.assertEqual(eos_summary_rows(block), [])


if __name__ == "__main__":
    unittest.main()
