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
        self.assertTrue(all(x['origin_kind'] == 'existing_application_module' for x in items))
        # A knowledge question is not a hardcoded peer-switch or peer-gateway absence detector.
        self.assertNotIn('peer-switch', str(items))
        self.assertNotIn('peer-gateway', str(items))

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
