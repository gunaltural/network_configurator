"""Training-only balance over eight known findings and five evidence gaps.

No inference behavior or answer text changes. Each field independently cycles
over all 13 strata, keeping eight examples per optimizer step. A complete
52-step cycle gives each (field, stratum) exactly eight exposures.
"""
import random

from .curriculum import FIELDS, KINDS, SPLIT_CONTEXTS
from .abstention_curriculum import GAPS, UNKNOWN_KIND


class GapBalancedSampler:
    def __init__(self, training, *, seed):
        self.rng = random.Random(seed)
        self.strata = KINDS + GAPS
        self.buckets = {}
        self.cursors = {}
        for field in FIELDS:
            for stratum in self.strata:
                suffix = (stratum + '-' + UNKNOWN_KIND if stratum in GAPS
                          else stratum) + '-' + field
                matches = [i for i, row in enumerate(training)
                           if row.id.endswith('-' + suffix)]
                if len(matches) != len(SPLIT_CONTEXTS['train']):
                    raise ValueError('Missing or duplicated training stratum')
                if any(training[i].split != 'train' for i in matches):
                    raise ValueError('Only training examples may be sampled')
                self.rng.shuffle(matches)
                self.buckets[field, stratum] = matches
                self.cursors[field, stratum] = 0
        if sum(map(len, self.buckets.values())) != len(training):
            raise ValueError('Unexpected or overlapping training records')

    def indices(self, step):
        if type(step) is not int or step < 0:
            raise ValueError('Invalid training step')
        field = FIELDS[step % len(FIELDS)]
        start = (step // len(FIELDS) * 8) % len(self.strata)
        result = []
        for offset in range(8):
            key = field, self.strata[(start + offset) % len(self.strata)]
            cursor = self.cursors[key]
            if cursor == len(self.buckets[key]):
                self.rng.shuffle(self.buckets[key])
                cursor = 0
            result.append(self.buckets[key][cursor])
            self.cursors[key] = cursor + 1
        return result
