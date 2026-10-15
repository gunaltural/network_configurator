import io,json,zipfile,unittest,tempfile,os,sys
from pathlib import Path
from unittest.mock import patch
from network_lab import Lab,build
import lab_runner

def model():
    return {'name':'bgp-pilot','nodes':[{'id':n,'hostname':n.upper(),'asn':65001 if n.startswith('ce') else 64501+i,'prefix':('10.10.0.0/24' if n=='ce1' else '10.20.0.0/24') if n.startswith('ce') else '198.18.255.1/32'} for i,n in enumerate(['ce1','ce2','isp1','isp2'])],'links':[{'id':'wan'+str(i+1),'a':c,'b':p,'aIp':f'172.16.0.{i*4+1}/30','bIp':f'172.16.0.{i*4+2}/30','localPreference':250 if p=='isp1' else 100} for i,(c,p) in enumerate([('ce1','isp1'),('ce1','isp2'),('ce2','isp1'),('ce2','isp2')])],'failureLink':'wan1'}
class LabTests(unittest.TestCase):
    def test_package(self):
        data,m=build(Lab(**model()));z=zipfile.ZipFile(io.BytesIO(data));t=json.loads(z.read('lab.clab.yml'));self.assertEqual(len(t['topology']['links']),4)
        for n in ['ce1','ce2','isp1','isp2']:
            cfg=z.read(f'configs/{n}/frr.conf').decode();self.assertIn('router bgp',cfg);self.assertIn('network ',cfg);self.assertIn(f'configs/{n}/vtysh.conf',z.namelist())
        self.assertIn('set local-preference 250',z.read('configs/ce1/frr.conf').decode());self.assertEqual(m['failure']['interface'],'eth1')
        self.assertEqual(m['fingerprint'],build(Lab(**model()))[1]['fingerprint'])
        d=model();d['links'][0]['localPreference']=300;self.assertNotEqual(m['fingerprint'],build(Lab(**d))[1]['fingerprint'])
    def test_invalid(self):
        for mutate in [lambda d:d['links'][0].update(aIp='172.16.0.0/30'),lambda d:d['links'][1].update(aIp='172.16.0.1/30',bIp='172.16.0.2/30'),lambda d:d.update(failureLink='missing'),lambda d:d['nodes'][0].update(hostname='$(touch x)'),lambda d:d['nodes'][3].update(prefix='198.19.0.1/32')]:
            d=model();mutate(d)
            with self.assertRaises(ValueError):Lab(**d)
    def test_routes_auth_and_export(self):
        from app import app
        from fastapi.testclient import TestClient
        with TestClient(app) as c:
            self.assertEqual(c.get('/network-lab').status_code,200)
            self.assertEqual(c.post('/api/network-lab/package',json=model()).status_code,200)
            self.assertEqual(c.post('/api/network-lab/identity',json=model()).json()['fingerprint'],build(Lab(**model()))[1]['fingerprint'])
            bad=model();bad['links'][0]['bIp']='wrong';self.assertEqual(c.post('/api/network-lab/package',json=bad).status_code,422)
    def test_fault_finally_restores(self):
        _,m=build(Lab(**model()));cwd=Path.cwd()
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp,'manifest.json').write_text(json.dumps(m))
            calls=[]
            def measurement(m,phase):
                if phase=='failure':raise RuntimeError('simulated collection error')
                return {'phase':phase,'passed':True,'checks':[]}
            try:
                with patch.object(lab_runner,'__file__',str(Path(tmp,'runner.py'))),patch.object(sys,'argv',['runner.py','fail']),patch.object(lab_runner,'wait_measure',side_effect=measurement),patch.object(lab_runner,'interface',side_effect=lambda m,up:calls.append(up) or {'returncode':0}):
                    with self.assertRaises(SystemExit) as e:lab_runner.main()
                    self.assertEqual(e.exception.code,1)
                self.assertEqual(calls,[False,True]);self.assertIn('simulated collection error',Path(tmp,'results.json').read_text())
            finally:os.chdir(cwd)
if __name__=='__main__':unittest.main()
