import unittest
from bgp_eos_neighbor_detail import eos_neighbor_details
from tac_overview import overview


def block(id, device, command, *lines):
    return {"id": id, "text": "\n".join(
        [f"Device: {device}", f"Command: {command}"] +
        [f"L{i}: {line}" for i, line in enumerate(lines, 1)])}


class EOSNeighborDetailTests(unittest.TestCase):
    def test_extract_explicit_state_and_remote_as(self):
        b = block("detail", "EOS-1", "show ip bgp neighbors 192.0.2.2",
                  "BGP neighbor is 192.0.2.2, remote AS 65002",
                  "BGP state is Active")
        rows = eos_neighbor_details([b])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["remote_as"], "65002")
        self.assertEqual(rows[1]["state"], "Active")

    def test_only_same_device_and_peer_correlated(self):
        summary = block("summary", "EOS-1", "show ip bgp summary",
                        "Neighbor V AS MsgRcvd MsgSent InQ OutQ Up/Down State/PfxRcd",
                        "192.0.2.2 4 65002 0 0 0 0 never Active")
        matching = block("matching", "EOS-1", "show ip bgp neighbors 192.0.2.2",
                         "BGP state is Active")
        different_device = block("other", "EOS-2", "show ip bgp neighbors 192.0.2.2",
                                 "BGP state is Established")
        report = overview([summary, matching, different_device], "Arista EOS", "en")[0]
        self.assertIn("matching, L1", report)
        self.assertNotIn("other, L1; neighbor detail", report)

    def test_unidentified_and_malformed_ignored(self):
        a = block("x", "Unidentified", "show ip bgp neighbors 192.0.2.2", "BGP state is Active")
        b = block("y", "EOS-1", "show ip bgp neighbors 999.0.0.1", "BGP state is Active")
        self.assertEqual(eos_neighbor_details([a, b]), [])

    def test_no_state_inferred_from_unrelated_text(self):
        b = block("x", "EOS-1", "show ip bgp neighbors 192.0.2.2",
                  "Last reset due to Active peer")
        self.assertEqual(eos_neighbor_details([b]), [])


if __name__ == "__main__":
    unittest.main()
