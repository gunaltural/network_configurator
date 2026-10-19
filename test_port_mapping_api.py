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


if __name__=='__main__':unittest.main()
