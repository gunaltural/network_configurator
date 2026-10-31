import unittest
from bgp_cli_evidence import summarize_capture

class BgpCaptureTests(unittest.TestCase):
    def test_mixed_capture(self):
        columns = 'Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd'
        table = {'id':'summary','text':f'Device: CE1\nCommand: show ip bgp summary\nL4: {columns}\nL5: 192.0.2.2 4 65002 0 0 0 0 0 never Idle\nL6: 192.0.2.3 4 65003 2 2 1 0 0 01:00:00 0'}
        interface = {'id':'interfaces','text':'Device: CE1\nCommand: show ip interface brief\nL2: Gig0/0 192.0.2.1 YES manual up up'}
        for lang in ('en','tr'):
            rows, text = summarize_capture([interface, table], lang)
            self.assertEqual(len(rows),2)
            self.assertIn('AS 65002 · Idle [summary, L5;',text)
            self.assertIn('AS 65003 · Established',text)
            self.assertIn('interfaces',text)

    def test_unrecognized_columns_never_become_observations(self):
        data = {'id':'unsupported','text':'Device: CE1\nCommand: show ip bgp summary\nL3: Neighbor AS V Different Columns\nL4: 192.0.2.2 65002 4 Idle'}
        rows,text = summarize_capture([data],'en')
        self.assertEqual(rows,[])
        self.assertIn('Evidence not interpreted: unsupported',text)
        self.assertNotIn('AS 4',text)

class TacCorrelationTests(unittest.TestCase):
    def test_bundle_to_fsm_report(self):
        import subprocess, json
        from pathlib import Path
        raw = """CE1# show tech-support
------ show ip bgp summary ------
Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd
192.0.2.2 4 65002 0 0 0 0 0 never Idle
------ show logging ------
*Nov 1: %BGP-5-ADJCHANGE: neighbor 192.0.2.2 Down Peer closed the session
*Nov 1: %BGP-5-ADJCHANGE: neighbor 192.0.2.20 Down unrelated-peer
CE2# show tech-support
------ show logging ------
*Nov 1: %BGP-5-ADJCHANGE: neighbor 192.0.2.2 Down unrelated-router"""
        js="require('./show-analysis.js');console.log(JSON.stringify(ShowAnalysis.evidence(ShowAnalysis.parse(require('fs').readFileSync(0,'utf8')))))"
        blocks=json.loads(subprocess.check_output(['node','-e',js],input=raw,text=True,cwd=Path(__file__).parent))
        for lang in ('tr','en'):
            _,report=summarize_capture(blocks,lang)
            self.assertIn('CE1 · 192.0.2.2 · AS 65002 · Idle',report)
            self.assertIn('Peer closed the session',report)
            self.assertIn('L6; show logging',report)
            self.assertIn('FSM',report)
            self.assertNotIn('unrelated-peer',report)
            self.assertNotIn('unrelated-router',report)
