"""Background SSH collection lifecycle tests; no network/device access."""
import threading
import time
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
import app

class InventoryJobTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app.app)
        self.credentials=dict(target='example.test',port=22,platform='Cisco NX-OS',username='test',password='TEST_ONLY_PASSWORD',secret='TEST_ONLY_SECRET')
        self.checks=patch.object(app,'checks',return_value=[]);self.checks.start()
    def tearDown(self):
        self.checks.stop()
    def start(self):
        response=self.client.post('/api/reporting/inventory-jobs',json=self.credentials)
        self.assertEqual(response.status_code,202,response.text)
        return response.json()['job_id']
    def wait(self,id):
        for _ in range(100):
            data=self.client.get('/api/reporting/inventory-jobs/'+id).json()
            if data['status'] in ['completed','failed','cancelled']:return data
            time.sleep(.01)
        self.fail('Worker did not finish')
    def test_completed_status_and_credential_cleanup(self):
        requests=[]
        def collect(request,cancel):
            requests.append(request)
            return dict(ok=True,hostname='TEST-SW',serial='TEST-SERIAL')
        with patch.object(app,'collect_inventory',side_effect=collect):
            id=self.start();result=self.wait(id)
        self.assertEqual(result['status'],'completed');self.assertEqual(result['result']['hostname'],'TEST-SW')
        self.assertNotIn('TEST_ONLY_PASSWORD',str(result));self.assertEqual(requests[0].password,'');self.assertEqual(requests[0].secret,'')
    def test_failure_then_success_isolated(self):
        with patch.object(app,'collect_inventory',side_effect=[HTTPException(502,detail={'error':'Test failure','connection_status':'connected'}),{'ok':True,'hostname':'NEXT-SW'}]):
            a=self.wait(self.start());b=self.wait(self.start())
        self.assertEqual(a['status'],'failed');self.assertEqual(a['connection_status'],'connected');self.assertEqual(b['status'],'completed')
    def test_cancel_does_not_publish_late_success(self):
        entered=threading.Event();release=threading.Event();requests=[]
        def collect(request,cancel):
            requests.append(request);entered.set();release.wait(2);return {'ok':True,'hostname':'LATE-RESULT'}
        with patch.object(app,'collect_inventory',side_effect=collect):
            id=self.start();self.assertTrue(entered.wait(1))
            self.assertEqual(self.client.post('/api/reporting/inventory-jobs/'+id+'/cancel').json()['status'],'cancelling')
            release.set();result=self.wait(id)
        self.assertEqual(result['status'],'cancelled');self.assertIsNone(result['result']);self.assertEqual(requests[0].password,'')
    def test_unknown_and_expired_jobs(self):
        self.assertEqual(self.client.get('/api/reporting/inventory-jobs/unknown').status_code,404)
        with patch.object(app,'collect_inventory',return_value={'ok':True}):id=self.start();self.wait(id)
        with app._inventory_job_lock:app._inventory_jobs[id]['finished']=time.monotonic()-app.INVENTORY_JOB_TTL-1
        self.assertEqual(self.client.get('/api/reporting/inventory-jobs/'+id).status_code,404)
    def test_queue_limit(self):
        with patch.object(app,'INVENTORY_JOB_LIMIT',0):
            self.assertEqual(self.client.post('/api/reporting/inventory-jobs',json=self.credentials).status_code,429)
    def test_shared_locale_endpoint(self):
        response=self.client.get('/engineering-locale.js');self.assertEqual(response.status_code,200);self.assertIn('NetworkLocale',response.text)

if __name__=='__main__':unittest.main()
