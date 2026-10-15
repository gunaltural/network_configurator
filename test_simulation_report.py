import base64, io, unittest, zipfile
from PIL import Image
from fastapi.testclient import TestClient
from docx import Document
from app import app

class SimulationReportTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app)
        png=io.BytesIO();Image.new('RGB',(400,220),'white').save(png,format='PNG')
        self.scenario=dict(id='test-scenario',createdAt='2026-10-15T13:00:00Z',direction='outbound',clientPrefix='10.10.0.0/24',internetEntry='',preferredGateway='CE-1',activeGateway='CE-2',backupGateway='',failedDevices=['CE-1'],failedLinks=[],baselinePath='Client → Shared LAN → CE-1 → ISP-1 → Internet',currentPath='Client → Shared LAN → CE-2 → ISP-1 → Internet',reachable=True,pathChanged=True,gatewayChanged=True,policies=[dict(connection='wan3 · CE-2 ↔ ISP-1',localPreference=250,prependCount=0)],topologyPng='data:image/png;base64,'+base64.b64encode(png.getvalue()).decode())
    def test_standalone_word_both_languages_and_picture(self):
        for language,title in [('en','Simulation and failover scenarios'),('tr','Simülasyon ve failover senaryoları')]:
            r=self.client.post('/api/network-lab/simulation-word',json={'name':'Pilot failover','language':language,'scenarios':[self.scenario]})
            self.assertEqual(r.status_code,200,r.text[:200] if r.status_code!=200 else '')
            doc=Document(io.BytesIO(r.content));text='\n'.join(p.text for p in doc.paragraphs)+'\n'+'\n'.join(c.text for t in doc.tables for row in t.rows for c in row.cells)
            self.assertIn(title,text);self.assertIn('CE-2',text);self.assertIn('10.10.0.0/24',text)
            self.assertIn('İstemci → Ortak LAN' if language=='tr' else 'Client → Shared LAN',text)
            self.assertEqual(len(doc.inline_shapes),1)
            if language=='tr':self.assertNotIn('Synthetic model results',text)
    def test_empty_or_invalid_scenarios_rejected(self):
        self.assertEqual(self.client.post('/api/network-lab/simulation-word',json={'name':'Pilot','scenarios':[]}).status_code,422)
        bad={**self.scenario,'policies':[{'connection':'wan1','localPreference':100,'prependCount':11}]}
        self.assertEqual(self.client.post('/api/network-lab/simulation-word',json={'name':'Pilot','scenarios':[bad]}).status_code,422)
        bad={**self.scenario,'topologyPng':'data:image/png;base64,ZmFrZQ=='}
        self.assertEqual(self.client.post('/api/network-lab/simulation-word',json={'name':'Pilot','scenarios':[bad]}).status_code,400)
    def test_assets_available(self):
        self.assertEqual(self.client.get('/simulation-report.js').status_code,200)
        self.assertEqual(self.client.get('/simulation-report.js').headers['cache-control'],'no-store')

if __name__=='__main__':unittest.main()
