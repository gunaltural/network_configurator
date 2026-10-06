import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from project_store import ProjectRepository, install_project_store, normalize_document

class Connection:
    def __init__(self,path):
        self.db=sqlite3.connect(path);self.db.row_factory=sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
    def __enter__(self):return self
    def __exit__(self,*args):
        if args[0]:self.db.rollback()
        else:self.db.commit()
        self.db.close()
    def execute(self,sql,params=()):return self.db.execute(sql.replace('%s','?'),params)

def document(name='Synthetic lab'):
    return {'schema':'network-configurator-project-v1','name':name,'design':{'schema':'network-configurator-v3','project':{'id':'p_test','name':name},'workspace':{'platform':'Huawei VRP','technology':'BGP'},'fields':{'sshPassword':'not-a-real-secret','asn':'65000'},'moduleStates':{'BGP':{}}},'reporting':{'schema':'network-configurator-report-v1','name':name,'source':{'projectId':'p_test'},'devices':[{'id':'i1','hostname':'LAB-1','serial':'SYNTHETIC'}],'inventoryDeviceIds':['i1']}}

class ProjectStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.repo=ProjectRepository(connect_factory=lambda:Connection(str(Path(self.temp.name)/'test.db')))
    def tearDown(self):self.temp.cleanup()
    def test_roundtrip_revision_ownership_and_conflict(self):
        first=self.repo.save('engineer',document(),note='initial')
        self.assertEqual(first['inventory_count'],1);self.assertEqual(first['vendors'],['Huawei VRP'])
        stored=self.repo.get('engineer',first['id']);self.assertNotIn('sshPassword',stored['document']['design']['fields'])
        with self.assertRaises(HTTPException) as caught:self.repo.get('other',first['id'])
        self.assertEqual(caught.exception.status_code,404)
        second=self.repo.save('engineer',document('Updated lab'),first['id'],1,'updated')
        self.assertEqual(second['version'],2)
        with self.assertRaises(HTTPException) as caught:self.repo.save('engineer',document('Stale'),first['id'],1)
        self.assertEqual(caught.exception.status_code,409)
        self.assertEqual(self.repo.get('engineer',first['id'])['name'],'Updated lab')
        self.assertEqual(len(self.repo.revisions('engineer',first['id'])['revisions']),2)
        self.assertEqual(self.repo.revision('engineer',first['id'],1)['document']['name'],'Synthetic lab')
    def test_literal_search_and_account_listing(self):
        self.repo.save('one',document('Lab 100%'));self.repo.save('one',document('Other'));self.repo.save('two',document('Lab 100%'))
        self.assertEqual(self.repo.listing('one','%')['total'],1)
        self.assertEqual(self.repo.listing('one','lab')['total'],1)
        self.assertEqual(self.repo.listing('two')['total'],1)
    def test_invalid_documents_and_size(self):
        for changes in ({'name':''},{'schema':'invalid'},{'design':None,'reporting':None},{'reporting':{'schema':'network-configurator-report-v1','devices':'bad'}}):
            with self.assertRaises(ValueError):normalize_document({**document(),**changes})
        payload=document();payload['design']['fields']['large']='a'*(4*1024*1024)
        with self.assertRaises(ValueError):normalize_document(payload)
    def test_repository_survives_new_instance(self):
        first=self.repo.save('one',document());other=ProjectRepository(connect_factory=self.repo.connect_factory)
        self.assertEqual(other.get('one',first['id'])['name'],'Synthetic lab')
    def test_api_and_unavailable_database(self):
        app=FastAPI();app.state.authentication=SimpleNamespace(enabled=False);install_project_store(app,self.repo)
        with TestClient(app) as client:
            self.assertTrue(client.get('/api/projects/status').json()['available'])
            created=client.post('/api/projects',json={'document':document()});self.assertEqual(created.status_code,201)
            pid=created.json()['id'];self.assertEqual(client.put('/api/projects/'+pid,json={'document':document(),'version':99}).status_code,409)
            self.assertEqual(client.get('/api/projects?q='+('x'*121)).status_code,400)
        app=FastAPI();app.state.authentication=SimpleNamespace(enabled=False);install_project_store(app,ProjectRepository(database_url=''))
        with TestClient(app) as client:
            self.assertFalse(client.get('/api/projects/status').json()['configured'])
            self.assertEqual(client.post('/api/projects',json={'document':document()}).status_code,503)
    def test_owner_is_taken_from_authenticated_request(self):
        app=FastAPI();app.state.authentication=SimpleNamespace(enabled=True)
        @app.middleware('http')
        async def authenticated(request:Request,call_next):
            request.state.user=request.headers.get('x-test-user');return await call_next(request)
        install_project_store(app,self.repo)
        with TestClient(app) as client:
            self.assertEqual(client.get('/api/projects').status_code,401)
            created=client.post('/api/projects',headers={'x-test-user':'one'},json={'document':document(),'owner':'two'}).json()
            self.assertEqual(client.get('/api/projects/'+created['id'],headers={'x-test-user':'two'}).status_code,404)

if __name__=='__main__':unittest.main()
