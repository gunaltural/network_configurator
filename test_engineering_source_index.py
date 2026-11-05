"""Source metadata retrieval tests; no network or hosted model required."""
import unittest
from engineering_source_index import catalog, retrieve_sources

class EngineeringSourceIndexTests(unittest.TestCase):
    def test_catalog_has_release_scoped_https_provenance(self):
        data = catalog()
        self.assertEqual(data["version"], "1.0.0")
        self.assertGreaterEqual(len(data["sources"]), 7)
        for source in data["sources"]:
            self.assertTrue(source["url"].startswith("https://"))
            self.assertTrue(source["releaseScope"])
            self.assertTrue(source["questions"])
    def test_mixed_requires_named_vendor(self):
        evidence = [{"id":"bgp","text":"Device: CE-1\nCommand: show ip bgp summary\nL1: BGP neighbor Idle"}]
        self.assertEqual(retrieve_sources(evidence,"Mixed"), [])
        evidence[0]["text"] += "\nVendor: Cisco IOS-XE"
        found = retrieve_sources(evidence,"Mixed")
        self.assertIn("cisco-bgp-basic-2026", [x["id"] for x in found])
        self.assertNotIn("arista-eos-bgp-437", [x["id"] for x in found])
    def test_vendor_and_release_are_not_claimed_verified(self):
        evidence = [{"id":"a","text":"Vendor: FortiGate\nDevice: BRANCH-A\nL1: diagnose sys sdwan health-check\nL2: Health Check(ping): state(dead)"}]
        sources = retrieve_sources(evidence, "Fortinet FortiOS")
        self.assertTrue(any(x["id"]=="fortinet-fortios-sdwan-748" for x in sources))
        self.assertTrue(all(x["provenance"]=="curated_metadata_not_fetched_text" for x in sources))
        self.assertTrue(all("release_scope" in x for x in sources))
        self.assertFalse(any(x["technology"]=="BGP" for x in sources))
    def test_mixed_vendors_do_not_borrow_keywords_across_devices(self):
        evidence = [
            {"id":"arista-bgp","text":"Device: LEAF-01\nVendor: Arista EOS\nCommand: show ip bgp summary\nL1: BGP Neighbor Active"},
            {"id":"cisco-stp","text":"Device: CORE-01\nVendor: Cisco IOS-XE\nCommand: show spanning-tree\nL1: root bridge priority 4096"},
        ]
        retrieved = retrieve_sources(evidence,"Mixed")
        ids = [x["id"] for x in retrieved]
        self.assertIn("arista-eos-bgp-437",ids)
        self.assertIn("cisco-campus-stp-ha",ids)
        self.assertNotIn("cisco-bgp-basic-2026",ids)
        evidence[0]["text"] = "Device: LEAF-01\nVendor: Arista EOS\nCommand: show ip bgp summary\nL1: BGP Neighbor Active"
        retrieved = retrieve_sources(evidence,"Cisco IOS-XE")
        self.assertNotIn("cisco-bgp-basic-2026",[x["id"] for x in retrieved])

    def test_ambiguous_multi_vendor_evidence_is_not_mapped_to_one_platform(self):
        evidence = [{"id":"topology","text":"Device: A\nVendor: Cisco IOS-XE\nDevice: B\nVendor: Arista EOS\nBGP summary Neighbor Active"}]
        self.assertEqual(retrieve_sources(evidence,"Mixed"),[])

    def test_software_module_not_inferred_from_missing_vendor(self):
        self.assertEqual(retrieve_sources([{"id":"a","text":"L1: show vpc peer-gateway"}], "Unknown"), [])
    def test_bound_results(self):
        data=[{"id":"a","text":"Vendor: Cisco NX-OS\nspanning-tree bgp evpn vxlan vpc ospf"}]
        self.assertLessEqual(len(retrieve_sources(data,"Cisco NX-OS",max_items=2)),2)
        self.assertEqual(retrieve_sources(data,"Cisco NX-OS",max_items=0),[])

if __name__=="__main__":
    unittest.main()
