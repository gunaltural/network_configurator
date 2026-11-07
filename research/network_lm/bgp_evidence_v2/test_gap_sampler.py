from collections import Counter
from dataclasses import replace
import unittest

from .curriculum import FIELDS, KINDS, cases, tasks
from .abstention_curriculum import GAPS, cases as gaps, field_tasks
from .gap_sampler import GapBalancedSampler


class GapSamplerTests(unittest.TestCase):
    def setUp(self):
        self.training = tasks(cases()['train']) + field_tasks(gaps()['train'])

    def test_every_field_stratum_has_equal_exposure_and_no_duplicate_batch(self):
        a = GapBalancedSampler(self.training, seed=42)
        b = GapBalancedSampler(self.training, seed=42)
        seen = Counter()
        for step in range(104):
            indices = a.indices(step)
            self.assertEqual(indices, b.indices(step))
            self.assertEqual(len(indices), 8)
            self.assertEqual(len(set(indices)), 8)
            for i in indices:
                row = self.training[i]
                field = row.id.rsplit('-', 1)[-1]
                stratum = row.id.rsplit('-', 3)[-3] if row.id.startswith('uncertain-') else row.id.rsplit('-', 2)[-2]
                self.assertEqual(field, FIELDS[step % 4])
                self.assertEqual(row.split, 'train')
                seen[field, stratum] += 1
        self.assertEqual(set(seen), {(f, k) for f in FIELDS for k in KINDS + GAPS})
        self.assertEqual(set(seen.values()), {16})

    def test_rejects_holdout_missing_duplicate_and_extra_records(self):
        for rows in (self.training[:-1], self.training + [self.training[0]],
                     [replace(self.training[0], split='test')] + self.training[1:]):
            with self.assertRaises(ValueError):
                GapBalancedSampler(rows, seed=42)

    def test_rejects_invalid_step(self):
        sampler = GapBalancedSampler(self.training, seed=42)
        for step in (-1, True, 0.5):
            with self.assertRaises(ValueError):
                sampler.indices(step)


if __name__ == '__main__':
    unittest.main()
