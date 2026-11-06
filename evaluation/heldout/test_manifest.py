"""Independent offline integrity checks for the AI Analysis held-out model acceptance.

No API keys, models, inference or customer CLI are required for this test.
It checks rubric completeness, not model engineering correctness.
"""
import json
import unittest
from pathlib import Path

CASES = json.loads(Path(__file__).with_name('cases.json').read_text(encoding='utf-8'))
EXPECTED = {'BGP', 'VPC', 'MLAG', 'STP', 'SDWAN', 'OSPF', 'EVPN'}


class HeldoutManifestTest(unittest.TestCase):
    def test_all_required_technology_suites_have_scored_synthetic_cases(self):
        suites = {tech: [case for case in CASES if case['tech'] == tech] for tech in EXPECTED}
        self.assertTrue(all(len(rows) >= 2 for rows in suites.values()),
                        'Each technology requires more than one independent holdout')
        ids = [case['id'] for case in CASES]
        self.assertEqual(len(ids), len(set(ids)), 'Duplicate test case IDs')

    def test_every_case_has_referenced_engineering_acceptance(self):
        for case in CASES:
            with self.subTest(case=case['id']):
                self.assertIsInstance(case.get('vendor'), str)
                self.assertGreater(len(case.get('raw', '')), 50)
                self.assertIn(case['tech'], EXPECTED)
                criteria = case.get('acceptance')
                self.assertIsInstance(criteria, dict, 'No unscored acceptance placeholder')
                self.assertGreaterEqual(criteria.get('minimum_line_citations', 0), 1)
                self.assertTrue(criteria.get('must_mention') or criteria.get('must_mention_any'),
                                'At least one positive observational criterion is required')
                self.assertTrue(criteria.get('must_not_claim'), 'At least one false-claim guard required')
                for group in criteria.get('must_mention_any', []):
                    self.assertIsInstance(group, list)
                    self.assertGreaterEqual(len(group), 2)
                    self.assertTrue(all(isinstance(word, str) and word.strip() for word in group))

    def test_acceptance_examples_do_not_include_hardcoded_answer_in_model_evidence(self):
        for case in CASES:
            with self.subTest(case=case['id']):
                # The inference input is only case['raw']; the rubric remains in
                # an app-owned field and run.py never passes it into the model.
                self.assertNotIn('acceptance', case['raw'].lower())
                self.assertNotIn('must_mention', case['raw'].lower())
                self.assertNotIn('must_not_claim', case['raw'].lower())


if __name__ == '__main__':
    unittest.main()
