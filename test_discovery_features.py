import unittest
from unittest.mock import patch
from io import BytesIO
from docx import Document
from fastapi.testclient import TestClient
import app
from network_discovery import build_graph
from discovery_details import parse_interfaces, enrich_graph, DETAIL_COMMANDS
from discovery_report import build_discovery_report
from test_network_discovery import CISCO, ARISTA, source

STAMP='2026-10-09T08:00:00Z'
def evidence(command,output):return dict(command=command,output=output,observedAt=STAMP,origin='CLI import')

def fixture():
 a=source('Cisco IOS-XE','CORE-1','192.0.2.10',CISCO)
 a['interfaceEvidence']=[evidence('show interfaces status','Port Name Status Vlan Duplex Speed Type\nGi1/0/1 To Leaf 1 connected 20 a-full a-1000 1000BaseT'),evidence('show interfaces switchport','Name: Gi1/0/1\nOperational Mode: trunk\nAccess Mode VLAN: 20 (PROD)\nTrunking VLANs Enabled: 20,30'),evidence('show etherchannel summary','1 Po1(SU) LACP Gi1/0/1(P)')]
 b=source('Arista EOS','LEAF-1','192.0.2.11',ARISTA)
 b['interfaceEvidence']=[evidence('show interfaces description','Et1 up up To Core'),evidence('show interfaces status','Et1 To Core connected trunk full 1G 1000BaseT')]
 # Cisco abbreviates Ethernet to Eth; EOS commonly prints Et.
 b['interfaceEvidence'][0]['output']=b['interfaceEvidence'][0]['output'].replace('Et1','Ethernet1')
 b['interfaceEvidence'][1]['output']=b['interfaceEvidence'][1]['output'].replace('Et1','Ethernet1')
 return [a,b]

class DiscoveryFeaturesTests(unittest.TestCase):
 def test_platform_status_and_switchport_formats(self):
  for platform,cmd in [('Cisco IOS-XE','show interfaces status'),('Cisco NX-OS','show interface status'),('Arista EOS','show interfaces status')]:
   rows,warnings=parse_interfaces(platform,[evidence(cmd,'Eth1/1 To Server connected 100 full 100G 100Gbase-SR4')]);self.assertEqual(rows['eth1/1']['speed'],'100G');self.assertEqual(rows['eth1/1']['description'],'To Server');self.assertEqual(warnings,[])
  for platform in ['Huawei_CE_SW','Huawei iStack']:
   rows,warnings=parse_interfaces(platform,[evidence('display interface brief','10GE1/0/1 up up 0% 0% 0 0'),evidence('display port vlan','10GE1/0/1 trunk 20 20 30'),evidence('display eth-trunk',"Eth-Trunk1's state information is:\n10GE1/0/1 Selected 1")]);self.assertEqual(rows['10ge1/0/1']['portChannel'],'Eth-Trunk1');self.assertEqual(rows['10ge1/0/1']['vlan'],'20');self.assertNotIn('speed',rows['10ge1/0/1'])
 def test_disabled_ports_and_wrapped_channel_members(self):
  rows,warnings=parse_interfaces('Arista EOS',[evidence('show interfaces status','Et1  disabled 20 full 1G 1000BaseT'),evidence('show port-channel summary','1 Po1(SU) LACP Et1(P)\n    Et2(P)')]);self.assertEqual(rows['eth1']['status'],'disabled');self.assertEqual(rows['eth2']['portChannel'],'Po1');self.assertFalse(warnings)
 def test_endpoint_enrichment_and_provenance(self):
  sources=fixture();g=enrich_graph(build_graph(sources),sources);self.assertEqual(len(g['links']),1);e=g['links'][0];details=[e['aDetails'],e['bDetails']];self.assertTrue(any(d.get('portChannel')=='Po1' for d in details));self.assertTrue(any(d.get('speed')=='1G' for d in details));self.assertTrue(all(d['evidence'][0]['observedAt']==STAMP for d in details))
 def test_invalid_or_unsupported_does_not_invent_data(self):
  rows,warnings=parse_interfaces('Cisco IOS-XE',[evidence('show interfaces status','% Invalid input detected')]);self.assertFalse(rows);self.assertTrue(warnings)
  with self.assertRaises(ValueError):parse_interfaces('Cisco IOS-XE',[evidence('configure terminal','interface Gi1/0/1')])
 def test_legacy_sources_and_report_validation(self):
  client=TestClient(app.app);sources=fixture();r=client.post('/api/discovery/parse',json={'sources':sources});self.assertEqual(r.status_code,200,r.text);self.assertIn('aDetails',r.json()['graph']['links'][0]);sources[0]['interfaceEvidence'][0]['command']='reload';self.assertEqual(client.post('/api/discovery/parse',json={'sources':sources}).status_code,400)
  self.assertEqual(client.post('/api/discovery/report/pdf',json={'name':'','sources':fixture()}).status_code,422)
 def test_pdf_word_independent_report_endpoints(self):
  client=TestClient(app.app)
  for language in ['en','tr']:
   data={'name':'Brownfield Acceptance','sources':fixture(),'language':language,'engineer':'Test engineer','scope':'Only CORE-1 and LEAF-1'}
   for fmt in ['pdf','word']:
    r=client.post('/api/discovery/report/'+fmt,json=data);self.assertEqual(r.status_code,200,r.text[:100]);self.assertEqual(r.headers['cache-control'],'no-store')
    if fmt=='pdf':self.assertTrue(r.content.startswith(b'%PDF'))
    else:
     d=Document(BytesIO(r.content));text=' '.join(p.text for p in d.paragraphs)+' '.join(c.text for t in d.tables for row in t.rows for c in row.cells);self.assertIn('CORE-1',text);self.assertIn('Po1',text);self.assertNotIn('password',text.lower());self.assertIn('Bağlantı detayları' if language=='tr' else 'Connection details',text)
 def test_optional_ssh_commands_and_disconnect(self):
  class Conn:
   def __init__(self):self.commands=[];self.closed=False
   def send_command(self,command,**kwargs):self.commands.append(command);return CISCO if 'lldp' in command else ''
   def disconnect(self):self.closed=True
  for enabled in [False,True]:
   conn=Conn()
   with patch.object(app,'MOCK_SSH',False),patch.object(app,'checks',return_value=[]),patch.object(app,'ok',return_value=True),patch.object(app,'connect',return_value=(conn,None)):
    response=TestClient(app.app).post('/api/discovery/collect',json={'target':'192.0.2.10','platform':'Cisco IOS-XE','username':'test','password':'transient','includeDetails':enabled,'discoveryDepth':1});self.assertEqual(response.status_code,200,response.text);self.assertEqual(response.json()['sources'][0]['discoveryDepth'],1);self.assertEqual(len(response.json()['sources'][0]['interfaceEvidence']),4 if enabled else 0);self.assertTrue(conn.closed)
   self.assertEqual(any(c in DETAIL_COMMANDS['Cisco IOS-XE'] for c in conn.commands),enabled)
