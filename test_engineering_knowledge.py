import unittest
from engineering_knowledge import retrieve_knowledge
from engineering_ai import validate_evidence_citations

class KnowledgeRetrievalTests(unittest.TestCase):
    def test_vpc_retrieves_design_questions_without_missing_command_rules(self):
        evidence = [
            {'id': 'cli-1-0', 'text': 'Device: N9K-A\nCommand: show running-config vpc\nL12: vpc domain 100'},
            {'id': 'cli-2-0', 'text': 'Device: N9K-A\nCommand: show vpc\nL50: Peer status : peer adjacency formed ok'},
        ]
        items = retrieve_knowledge(evidence, 'Cisco NX-OS')
        self.assertIn('multi-chassis-redundancy', [x['id'] for x in items])
        self.assertIn('cisco-nxos-vpc-design', [x['id'] for x in items])
        vendor_guidance = next(x for x in items if x['id'] == 'cisco-nxos-vpc-design')
        self.assertEqual(vendor_guidance['origin_kind'], 'manufacturer_documentation')
        self.assertIn('cisco.com', vendor_guidance['source_uri'])
        # Engineering knowledge can name technologies and capabilities;
        # it must not encode a mechanical absence -> FAIL rule.
        self.assertIn('peer-switch', str(vendor_guidance))
        self.assertIn('rather than treating its absence as proof', str(vendor_guidance))

    def test_mixed_topology_retrieves_explicit_vendor_knowledge(self):
        evidence = [
            {'id': 'topology-0', 'text': 'Device: WORKSPACE\nL1: Device n9k-a hostname=N9K-A vendor=Cisco NX-OS role=peer\nL2: Link peer-link n9k-a to n9k-b kind=vpc'},
            {'id': 'config-0', 'text': 'Device: N9K-A\nVendor: Cisco NX-OS\nL7: vpc domain 100'},
            {'id': 'config-1', 'text': 'Device: ISP-A\nVendor: Arista EOS\nL8: router bgp 65000'},
        ]
        found = [x['id'] for x in retrieve_knowledge(evidence, 'Mixed')]
        self.assertIn('cisco-nxos-vpc-design', found)
        self.assertIn('bgp-control-plane', found)

    def test_nonmatching_domain_does_not_hallucinate_knowledge(self):
        evidence = [{'id':'x', 'text':'Device: LEAF-1\nCommand: show clock\nL3: 10:11:12 UTC'}]
        self.assertEqual(retrieve_knowledge(evidence, 'Cisco NX-OS'), [])

    def test_validates_actual_evidence_id_and_line(self):
        evidence = [
            {'id':'cli-1-0', 'text':'Device: N9K-A\nCommand: show vpc\nL3: Peer status: up'},
            {'id':'cli-2-0', 'text':'Device: N9K-A\nCommand: show running-config\nL9: vpc domain 100'},
        ]
        ok, ids = validate_evidence_citations('Observed [cli-1-0, L3], context [cli-2-0, L9].', evidence)
        self.assertTrue(ok)
        self.assertEqual(ids, ['cli-1-0', 'cli-2-0'])
        self.assertEqual(validate_evidence_citations('Observed [cli-1-0, L999].', evidence)[0], False)
        self.assertEqual(validate_evidence_citations('Observed [cli-99-0, L3].', evidence)[0], False)
        self.assertEqual(validate_evidence_citations('Observed without citations.', evidence)[0], False)

if __name__ == '__main__':
    unittest.main()
