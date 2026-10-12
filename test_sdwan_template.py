"""Test the packaged workbook through the same API used by the browser."""
import unittest
from fastapi.testclient import TestClient
from app import app
from sdwan_excel import parse_sdwan_excel


class SiteTemplateTests(unittest.TestCase):
    def test_download_upload_roundtrip(self):
        client = TestClient(app)
        response = client.get('/api/sdwan/template')
        self.assertEqual(response.status_code, 200)
        self.assertIn('attachment', response.headers['content-disposition'])
        parsed = parse_sdwan_excel(response.content)
        self.assertEqual(len(parsed['rows']), 2)
        self.assertEqual([row['Router Hostname'] for row in parsed['rows']], ['Router1', 'Router2'])
        self.assertTrue(all(row['LOKASYON'] == 'Site-1' for row in parsed['rows']))
        uploaded = client.post('/api/sdwan/excel', content=response.content)
        self.assertEqual(uploaded.status_code, 200)
        self.assertEqual(uploaded.json(), parsed)

    def test_example_matches_workbook(self):
        client = TestClient(app)
        example = client.get('/api/sdwan/example').json()['rows']
        workbook = parse_sdwan_excel(client.get('/api/sdwan/template').content)['rows']
        for row, imported in zip(example, workbook):
            self.assertEqual(row['sdHostname'], imported['Router Hostname'])
            self.assertEqual(row['sdWan1Gw'], imported['WAN-1 Gateway'])
            self.assertEqual(row['sdNtp'], imported['NTP'])
            self.assertEqual(row['sdVrrpPriority'], imported['VRRP Priority'])
            self.assertNotEqual(row['sdDns'], row['sdNtp'])


if __name__ == '__main__':
    unittest.main()
