import json
import subprocess
import unittest
from pathlib import Path
from tac_overview import overview
BASE=Path(__file__).parent
def parse(raw):
    return json.loads(subprocess.check_output(['node','-e',"require('./show-analysis.js');console.log(JSON.stringify(ShowAnalysis.evidence(ShowAnalysis.parse(require('fs').readFileSync(0,'utf8')))))"],cwd=BASE,input=raw,text=True))
class OverviewTests(unittest.TestCase):
    def test_same_capture(self):
        blocks=parse((BASE/'samples/analysis/tac-review.txt').read_text())
        tr,groups=overview(blocks,'Cisco IOS-XE','tr')
        for name in ['Static routes','ACL','Management security','BGP','OSPF','Management']: self.assertIn(name,groups)
        self.assertIn('Konfigürasyon ve RIB eşleşiyor: CORP',tr)
        self.assertNotIn('Konfigürasyon ve RIB eşleşiyor: GUEST',tr)
        self.assertIn('line vty 0 4: access-class MGMT-IN in',tr)
        self.assertIn('dışarıdan erişim kanıtlanmadı',tr)
        self.assertIn('ACL MGMT-IN (in): Kural listesi aynı cihazda görüldü',tr)
        self.assertIn('Peer closed the session',tr)
        self.assertIn('L12;',tr)
    def test_module_examples(self):
        for key,vendor,group in [('qos','Cisco IOS-XE','QoS'),('stackwise','Cisco IOS-XE','StackWise'),('evpn','Cisco NX-OS','EVPN/VXLAN'),('stp','Cisco IOS-XE','STP'),('mlag','Arista EOS','MLAG'),('vpc','Cisco NX-OS','vPC'),('sdwan','FortiGate','SD-WAN')]:
            with self.subTest(key=key):
                blocks=parse((BASE/f'samples/analysis/{key}.txt').read_text())
                text,areas=overview(blocks,vendor,'en')
                self.assertIn(group,areas)
                self.assertIn('Missing evidence',text)
    def test_static_next_hop_connected_vrf_scope(self):
        raw = ('EDGE# show running-config\n'
               'interface GigabitEthernet0/0\n'
               ' ip address 192.0.2.1 255.255.255.0\n'
               'interface GigabitEthernet0/1\n'
               ' vrf forwarding BLUE\n'
               ' ip address 198.51.100.1 255.255.255.0\n'
               'ip route 203.0.113.0 255.255.255.0 192.0.2.2\n'
               'ip route vrf BLUE 10.10.0.0 255.255.0.0 198.51.100.2\n'
               'ip route vrf BLUE 10.20.0.0 255.255.0.0 192.0.2.2')
        result = overview(parse(raw),'Cisco IOS-XE','en')
        self.assertIsNotNone(result)
        text,areas=result
        self.assertIn('Next hop matches a directly connected interface subnet',text)
        self.assertIn('No directly connected subnet matches next hop',text)
        self.assertIn('10.20.0.0/16',text)
        self.assertIn('198.51.100.2',text)

    def test_cisco_historical_duplex_mismatch_diagnosis(self):
        raw = ('SW1# show stacks\n'
               '123: %CDP-4-DUPLEX_MISMATCH: duplex mismatch discovered on GigabitEthernet9/39 (not half duplex), with PEER(ABC) mgmt0 (half duplex).\n'
               '124: %CDP-4-DUPLEX_MISMATCH: duplex mismatch discovered on GigabitEthernet9/39 (not half duplex), with PEER(ABC) mgmt0 (half duplex).')
        result = overview(parse(raw),'Cisco IOS-XE','en')
        self.assertIsNotNone(result)
        report, groups = result
        self.assertIn('Interface diagnostics',groups)
        self.assertIn('Recorded CDP duplex mismatch',report)
        self.assertIn('show interfaces GigabitEthernet9/39',report)
        self.assertEqual(report.count('Recorded CDP duplex mismatch'),1)

    def test_no_cross_router_or_unscoped_security_finding(self):
        data='A# show running-config\nip route 203.0.113.0 255.255.255.0 192.0.2.1\n transport input telnet\nB# show ip route static\nS 203.0.113.0/24 [1/0] via 192.0.2.1'
        text,areas=overview(parse(data),'Cisco IOS-XE','en')
        self.assertNotIn('Configuration and RIB match',text)
        self.assertNotIn('Management security',areas)
