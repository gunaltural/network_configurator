import unittest,tempfile,os,json
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import lab_service
from test_network_lab import model
class RuntimeTests(unittest.TestCase):
 def test_authenticated_lifecycle_and_ownership(self):
  with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'LAB_SERVICE_TOKEN':'s'*40}),patch.object(lab_service,'ROOT',Path(root)),patch.object(lab_service,'execute',return_value={'returncode':0,'output':'device output'}) as run:
   c=TestClient(lab_service.service);h={'Authorization':'Bearer '+'s'*40}
   self.assertEqual(c.post('/labs',json={'owner':'alice','lab':model()}).status_code,401)
   r=c.post('/labs',json={'owner':'alice','lab':model()},headers=h);self.assertEqual(r.status_code,200,r.text);id=r.json()['id'];self.assertEqual(r.json()['state'],'running')
   self.assertEqual(c.post('/labs',json={'owner':'alice','lab':model()},headers=h).status_code,409)
   self.assertEqual(c.post('/current',json={'owner':'alice'},headers=h).json()['id'],id)
   self.assertIsNone(c.post('/current',json={'owner':'bob'},headers=h).json())
   base='/labs/'+id
   self.assertEqual(c.post(base+'/commands',json={'owner':'bob','node':'ce1','commands':['show version']},headers=h).status_code,404)
   self.assertEqual(c.post(base+'/commands',json={'owner':'alice','commands':['bash']},headers=h).status_code,422)
   r=c.post(base+'/commands',json={'owner':'alice','node':'ce2','commands':['show bgp summary']},headers=h);self.assertEqual(r.json()['output'],'device output');self.assertIn('clab-nc-'+id+'-ce2',run.call_args.args[0])
   self.assertEqual(c.post(base+'/link',json={'owner':'alice','link':'wan1','up':False},headers=h).status_code,200);self.assertEqual(run.call_args.args[0][-1],'down')
   self.assertEqual(c.post(base+'/link',json={'owner':'alice','link':'other'},headers=h).status_code,422)
   self.assertEqual(c.post(base+'/stop',json={'owner':'alice'},headers=h).json()['state'],'stopped')
   self.assertEqual(c.post(base+'/commands',json={'owner':'alice','commands':['show version']},headers=h).status_code,409)
 def test_gateway(self):
  from app import app
  with TestClient(app) as c,patch('lab_gateway.central',return_value={'state':'running','id':'a'*24}) as central:
   r=c.post('/api/network-lab/runtime/labs',json=model());self.assertEqual(r.status_code,200);self.assertEqual(central.call_args.args[1]['owner'],'local-development')
   self.assertEqual(c.post('/api/network-lab/runtime/labs/invalid/commands',json={'node':'ce1','commands':['show version']}).status_code,404)
  with TestClient(app) as c,patch.dict(os.environ,{'LAB_SERVICE_URL':'','LAB_SERVICE_TOKEN':''}):
   self.assertFalse(c.get('/api/network-lab/runtime/status').json()['liveCli'])
   self.assertEqual(c.post('/api/network-lab/runtime/labs',json=model()).status_code,503)
if __name__=='__main__':unittest.main()
