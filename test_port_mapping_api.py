import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import app


class PortMappingApiTests(unittest.TestCase):
    def test_import_never_contacts_devices(self):
        source={'id':'capture','device':'CORE','kind':'lldp','platform':'Cisco NX-OS','raw':'Chassis id: 0011.2233.4455\nPort id: Ethernet1\nLocal Port id: Ethernet1/1\nSystem Name: ACCESS\nEnabled Capabilities: Bridge','importedAt':'2026-10-19T12:00:00Z'}
        with patch.object(app,'connect',side_effect=AssertionError('Import cannot execute SSH')):
            response=TestClient(app.app).post('/api/port-mapping/analyze',json={'sources':[source]})
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.json()['graph']['links']),1)
        self.assertEqual(response.json()['activeSourceIds'],['capture'])
        self.assertEqual(TestClient(app.app).post('/api/port-mapping/analyze',json={'sources':[source,source]}).status_code,400)

    def test_invalid_command_rejected(self):
        source={'id':'capture','device':'CORE','kind':'interfaces','platform':'Cisco NX-OS','command':'configure terminal','raw':'anything','importedAt':'2026-10-19T12:00:00Z'}
        self.assertEqual(TestClient(app.app).post('/api/port-mapping/analyze',json={'sources':[source]}).status_code,400)

    def test_synthetic_sample_download(self):
        from io import BytesIO
        from zipfile import ZipFile
        response=TestClient(app.app).get('/port-mapping-sample.zip')
        self.assertEqual(response.status_code,200)
        with ZipFile(BytesIO(response.content)) as archive:
            self.assertEqual(len(archive.namelist()),3)
            for name in ('CORE-01-show-tech-support.txt','ACCESS-01-show-tech-support.txt'):
                self.assertIn(b'SYNTHETIC DEMONSTRATION ONLY',archive.read(name))
        embedded=TestClient(app.app).get('/api/port-mapping/samples')
        self.assertEqual(embedded.status_code,200)
        self.assertTrue(embedded.json()['synthetic'])
        self.assertEqual(len(embedded.json()['files']),2)
        with ZipFile(BytesIO(response.content)) as archive:
            for item in embedded.json()['files']:
                self.assertEqual(item['text'],archive.read(item['name']).decode('utf-8'))


if __name__=='__main__':unittest.main()
