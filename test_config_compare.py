import random
import unittest
from fastapi.testclient import TestClient
from config_compare import CompareRequest, compare_configurations
import app


def compare(a, b, **options):
    return compare_configurations(CompareRequest(left=a, right=b, **options))


class ConfigCompareTests(unittest.TestCase):
    def test_independent_vendor_texts_and_counts(self):
        for old, new in [('hostname CE1', 'hostname CE2'), ('sysname CE1', 'sysname CE2'), ('set hostname CE1', 'set hostname CE2')]:
            result=compare(old+'\ninterface X\n shutdown\n',new+'\ninterface X\n no shutdown\n description new\n')
            self.assertEqual(result['counts'],dict(added=1,removed=0,modified=2,unchanged=1))
            self.assertIn('-'+old,result['diff']);self.assertIn('+'+new,result['diff'])

    def test_empty_sides_and_normalized_endings(self):
        self.assertEqual(compare('', 'a\nb')['counts']['added'],2)
        self.assertEqual(compare('a\nb', '')['counts']['removed'],2)
        self.assertTrue(compare('\ufeffa\r\nb\r\n','a\nb\n')['identical'])
        self.assertTrue(compare('','')['identical'])

    def test_opt_in_filters_keep_original_numbers(self):
        a='! Last configuration change at OLD\n\nhostname A\n description test  \n'
        b='! Last configuration change at NEW\nhostname A\n   description test\n'
        self.assertFalse(compare(a,b)['identical'])
        r=compare(a,b,ignore_metadata=True,ignore_blank_lines=True,ignore_trailing_space=True,ignore_indentation=True)
        self.assertTrue(r['identical']);self.assertEqual(r['ignored'],{'left':2,'right':1})
        self.assertEqual(r['rows'][0]['leftNumber'],3);self.assertEqual(r['rows'][0]['rightNumber'],2)
        self.assertFalse(compare('permit A\ndeny B','deny B\npermit A')['identical'])
        self.assertFalse(compare('hostname A','hostname a')['identical'])

    def test_literal_exclusions(self):
        r=compare('counter: 1\nhostname A','counter: 9\nhostname A',exclude_prefixes=['counter:'])
        self.assertTrue(r['identical'])
        self.assertFalse(compare('.* old','x new',exclude_prefixes=['.*'])['identical'])

    def test_repeated_large_config_single_change(self):
        lines=[' description repeated']*9500
        other=lines.copy();other[4000]=' description changed'
        r=compare('\n'.join(lines),'\n'.join(other))
        self.assertEqual(r['counts'],dict(added=0,removed=0,modified=1,unchanged=9499))
        self.assertEqual(r['rows'][4000]['leftNumber'],4001)

    def test_diff_preserves_both_inputs_randomized(self):
        rng=random.Random(42)
        for _ in range(250):
            a=[rng.choice(['interface X',' shutdown',' no shutdown','!','']) for _ in range(rng.randrange(1,70))]
            b=[rng.choice(['interface X',' shutdown',' no shutdown','!','']) for _ in range(rng.randrange(1,70))]
            r=compare('\n'.join(a)+'\n','\n'.join(b)+'\n')
            self.assertEqual([x['left'] for x in r['rows'] if x['left'] is not None],a)
            self.assertEqual([x['right'] for x in r['rows'] if x['right'] is not None],b)
            self.assertEqual(sum(r['counts'].values()),len(r['rows']))

    def test_text_bounds_assets_and_no_device_calls(self):
        c=TestClient(app.app)
        for path in ['/config-compare','/config-compare.js']:
            r=c.get(path);self.assertEqual(r.status_code,200);self.assertEqual(r.headers['cache-control'],'no-store')
        self.assertEqual(c.post('/api/config-compare',json={'left':'a','right':'b'}).status_code,200)
        self.assertEqual(c.post('/api/config-compare',json={'left':'a\x00','right':'b'}).status_code,400)
        self.assertEqual(c.post('/api/config-compare',json={'left':'x'*500001,'right':'b'}).status_code,422)
        self.assertEqual(c.post('/api/config-compare',json={'left':'x\n'*10001,'right':'b'}).status_code,400)


if __name__=='__main__':unittest.main()
