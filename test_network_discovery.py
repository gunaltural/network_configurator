import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import app
from network_discovery import parse_neighbors, build_graph

CISCO = '''Local Intf: GigabitEthernet1/0/1
Chassis id: 0011.2233.4455
Port id: Ethernet1
System Name: LEAF-1
System Description: Arista Networks EOS
Management Addresses:
 IP: 192.0.2.11
'''
ARISTA = '''Interface Ethernet1 detected 1 LLDP neighbors:
 Neighbor 0011.2233.4400/GigabitEthernet1/0/1, age 8 seconds
 - Chassis ID type: MAC address (4)
 - Chassis ID: 0011.2233.4400
 - Port ID type: Interface name (5)
 - Port ID: "GigabitEthernet1/0/1"
 - System Name: "CORE-1"
 - System Description: "Cisco IOS-XE"
 - Management Address Subtype: IPv4 (1)
 - Management Address: 192.0.2.10
'''
HUAWEI = '''10GE1/0/1 has 1 neighbor(s):
Neighbor index : 1
Chassis type : MAC address
Chassis ID : 0011-2233-4400
Port ID type : Interface name
Port ID : Ethernet1/1
System name : NEXUS-1
System description : Cisco Nexus NX-OS
Management address type : IPv4
Management address value : 192.0.2.20
'''
CDP = '''Device ID: LEAF-1
Entry address(es):
 IP address: 192.0.2.11
Platform: Arista Networks, Capabilities: Switch
Interface: GigabitEthernet1/0/1, Port ID (outgoing port): Ethernet1
Holdtime : 120 sec
'''

def source(platform, name, target, output, protocol='lldp'):
 return dict(platform=platform,deviceName=name,target=target,output=output,protocol=protocol,observedAt='2026-10-06T17:00:00Z',origin='CLI import')

class DiscoveryTests(unittest.TestCase):
 def test_vendor_formats_and_ipv4(self):
  for platform,output,local,remote,address in [('Cisco IOS-XE',CISCO,'Gi1/0/1','Eth1','192.0.2.11'),('Cisco NX-OS',CISCO.replace('Local Intf','Local Port id'),'Gi1/0/1','Eth1','192.0.2.11'),('Arista EOS',ARISTA,'Eth1','Gi1/0/1','192.0.2.10'),('Huawei_CE_SW',HUAWEI,'10GE1/0/1','Eth1/1','192.0.2.20'),('Huawei iStack',HUAWEI,'10GE1/0/1','Eth1/1','192.0.2.20')]:
   rows,warnings=parse_neighbors(platform,'lldp',output);self.assertEqual(len(rows),1,(platform,warnings));self.assertEqual(rows[0]['localPort'],local);self.assertEqual(rows[0]['remotePort'],remote);self.assertIn(address,rows[0]['managementAddresses'])
 def test_reciprocal_and_protocol_dedup(self):
  sources=[source('Cisco IOS-XE','CORE-1','192.0.2.10',CISCO),source('Arista EOS','LEAF-1','192.0.2.11',ARISTA),source('Cisco IOS-XE','CORE-1','192.0.2.10',CDP,'cdp')]
  g=build_graph(sources);self.assertEqual(len(g['devices']),2);self.assertEqual(len(g['links']),1);self.assertEqual(g['links'][0]['state'],'Both ends observed');self.assertEqual(set(g['links'][0]['protocols']),{'LLDP','CDP'});self.assertTrue(all(not d['serial'] and not d['softwareVersion'] for d in g['devices']))
 def test_multi_neighbors_parallel_links_and_unknown(self):
  text=CISCO+'\n'+CISCO.replace('GigabitEthernet1/0/1','GigabitEthernet1/0/2').replace('Port id: Ethernet1','Port id: Ethernet2')
  g=build_graph([source('Cisco IOS-XE','CORE','192.0.2.10',text)]);self.assertEqual(len(g['links']),2)
  rows,warnings=parse_neighbors('Cisco IOS-XE','lldp','System Name: missing local port\nPort id: Eth1');self.assertEqual(rows,[]);self.assertTrue(warnings)
  self.assertTrue(parse_neighbors('Cisco IOS-XE','lldp','% Invalid input detected')[1]);self.assertEqual(parse_neighbors('Cisco IOS-XE','lldp','Total neighbors: 0')[1],[])
 def test_duplicate_names_and_identity(self):
  a=source('Cisco IOS-XE','CORE','192.0.2.10',CISCO);a['origin']='SSH inventory / neighbors';a['identity']={'hostname':'CORE','serial':'SERIAL-1','software_version':'17.12.4','model':'C9300'}
  b=source('Cisco IOS-XE','CORE','192.0.2.12','No neighbors')
  g=build_graph([a,b]);self.assertEqual(len([d for d in g['devices'] if d['seed']]),2);self.assertEqual(next(d for d in g['devices'] if d['serial'])['identitySource'],'SSH inventory / neighbors')
 def test_api_parse_offline_limits_and_no_network_execution(self):
  c=TestClient(app.app)
  with patch.object(app,'connect',side_effect=AssertionError('offline parser must not connect')):
   r=c.post('/api/discovery/parse',json={'sources':[source('Cisco IOS-XE','CORE','',CISCO)]});self.assertEqual(r.status_code,200);self.assertEqual(len(r.json()['graph']['links']),1)
   s=source('Arista EOS','SW','',CDP,'cdp');self.assertEqual(c.post('/api/discovery/parse',json={'sources':[s]}).status_code,400)
   s=source('Cisco IOS-XE','SW','','x'*200001);self.assertEqual(c.post('/api/discovery/parse',json={'sources':[s]}).status_code,422)
  self.assertEqual(c.get('/network-discovery').status_code,200);self.assertIn('discoverySave',c.get('/network-discovery').text);self.assertEqual(c.get('/network-discovery.js').status_code,200)
 def test_ssh_fixed_read_only_and_cleanup(self):
  class Connection:
   calls=[];closed=False
   def send_command(self,cmd,**kw):
    self.calls.append(cmd)
    return CISCO if cmd=='show lldp neighbors detail' else 'hostname CORE-1' if 'hostname' in cmd else 'Cisco IOS XE Software, Version 17.12.4\nModel Number : C9300\nSystem Serial Number : SERIAL-1'
   def disconnect(self):self.closed=True
  conn=Connection();c=TestClient(app.app)
  with patch.object(app,'MOCK_SSH',False),patch.object(app,'checks',return_value=[]),patch.object(app,'ok',return_value=True),patch.object(app,'connect',return_value=(conn,'cisco_ios')):
   r=c.post('/api/discovery/collect',json={'target':'192.0.2.10','platform':'Cisco IOS-XE','username':'test','password':'SYNTHETIC','protocol':'lldp'});self.assertEqual(r.status_code,200);self.assertTrue(conn.closed);self.assertIn('show inventory',conn.calls);self.assertTrue(all(cmd.startswith('show ') for cmd in conn.calls));self.assertNotIn('password',r.text);self.assertEqual(r.json()['sources'][0]['identity']['hostname'],'CORE-1')
 def test_blocked_targets_disconnect_failures(self):
  c=TestClient(app.app)
  with patch.object(app,'checks',return_value=[{'status':'FAIL'}]),patch.object(app,'connect') as connect:
   self.assertEqual(c.post('/api/discovery/collect',json={'target':'127.0.0.1','platform':'Cisco IOS-XE'}).status_code,400);connect.assert_not_called()
  self.assertEqual(c.post('/api/discovery/collect',json={'target':'x','platform':'Arista EOS','protocol':'cdp'}).status_code,400)

if __name__=='__main__':unittest.main()
