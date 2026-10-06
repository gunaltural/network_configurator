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
        stored=self.repo.get('engineer',first['id']);self.assertEqual(stored['document']['design']['project']['name'],first['name']);self.assertNotIn('sshPassword',stored['document']['design']['fields'])
        with self.assertRaises(HTTPException) as caught:self.repo.get('other',first['id'])
        self.assertEqual(caught.exception.status_code,404)
        second=self.repo.save('engineer',document('Updated lab'),first['id'],1,'updated',True,first['updated_at'])
        self.assertEqual(second['version'],2)
        with self.assertRaises(HTTPException) as caught:self.repo.save('engineer',document('Stale'),first['id'],1)
        self.assertEqual(caught.exception.status_code,409)
        self.assertEqual(self.repo.get('engineer',first['id'])['name'],'Updated lab')
        self.assertEqual(len(self.repo.revisions('engineer',first['id'])['revisions']),2)
        self.assertEqual(self.repo.revision('engineer',first['id'],1)['document']['name'],'Synthetic lab')
    def test_save_keeps_revision_and_blocks_stale_tabs(self):
        first=self.repo.save('one',document())
        updated=self.repo.save('one',document('Edited'),first['id'],1,expected_updated_at=first['updated_at'])
        self.assertEqual(updated['version'],1)
        self.assertEqual(len(self.repo.revisions('one',first['id'])['revisions']),1)
        self.assertEqual(self.repo.revision('one',first['id'],1)['document']['name'],'Edited')
        with self.assertRaises(HTTPException) as caught:
            self.repo.save('one',document('Stale'),first['id'],1,expected_updated_at=first['updated_at'])
        self.assertEqual(caught.exception.status_code,409)
        next_revision=self.repo.save('one',document('Revision 2'),first['id'],1,create_revision=True,expected_updated_at=updated['updated_at'])
        self.assertEqual(next_revision['version'],2)
        self.assertEqual(self.repo.revision('one',first['id'],1)['document']['name'],'Edited')
        for index in range(4):
            next_revision=self.repo.save('one',document('Edited revision 2'),first['id'],2,expected_updated_at=next_revision['updated_at'])
        self.assertEqual(len(self.repo.revisions('one',first['id'])['revisions']),2)
    def test_delete_confirmation_ownership_and_history_cleanup(self):
        first=self.repo.save('one',document());second=self.repo.save('one',document(),first['id'],1,create_revision=True,expected_updated_at=first['updated_at'])
        for who,name,stamp,code in [('two',True,second['updated_at'],404),('one',False,second['updated_at'],400),('one',True,first['updated_at'],409)]:
            with self.assertRaises(HTTPException) as caught:self.repo.delete(who,first['id'],name,stamp)
            self.assertEqual(caught.exception.status_code,code)
        self.assertTrue(self.repo.delete('one',first['id'],True,second['updated_at'])['deleted'])
        self.assertEqual(self.repo.listing('one')['total'],0)
        with self.repo.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) AS total FROM nc_project_revisions').fetchone()['total'],0)
        with self.assertRaises(HTTPException):self.repo.get('one',first['id'])

    def test_old_revision_deletion_preserves_current_and_numbering(self):
        current=self.repo.save('one',document())
        for revision in range(2,5):
            current=self.repo.save('one',document('Revision '+str(revision)),current['id'],current['version'],create_revision=True,expected_updated_at=current['updated_at'])
        for owner,revision,confirmed,code in [('two',1,True,404),('one',1,False,400),('one',4,True,400)]:
            with self.assertRaises(HTTPException) as caught:self.repo.delete_revision(owner,current['id'],revision,confirmed)
            self.assertEqual(caught.exception.status_code,code)
        self.repo.delete_revision('one',current['id'],2,True)
        self.assertEqual([x['revision'] for x in self.repo.revisions('one',current['id'])['revisions']],[4,3,1])
        after=self.repo.get('one',current['id']);self.assertEqual(after['version'],4);self.assertEqual(after['updated_at'],current['updated_at'])
        self.assertEqual(after['document']['name'],'Revision 4')
        updated=self.repo.save('one',document('Still revision 4'),current['id'],4,expected_updated_at=current['updated_at'])
        next_revision=self.repo.save('one',document('Revision 5'),current['id'],4,create_revision=True,expected_updated_at=updated['updated_at'])
        self.assertEqual(next_revision['version'],5)

    def test_literal_search_and_account_listing(self):
        self.repo.save('one',document('Lab 100%'));self.repo.save('one',document('Other'));self.repo.save('two',document('Lab 100%'))
        self.assertEqual(self.repo.listing('one','%')['total'],1)
        self.assertEqual(self.repo.listing('one','lab')['total'],1)
        self.assertEqual(self.repo.listing('two')['total'],1)
    def test_invalid_documents_and_size(self):
        for changes in ({'name':''},{'schema':'invalid'},{'design':None,'reporting':None},{'reporting':{'schema':'network-configurator-report-v1','devices':'bad'}}):
            with self.assertRaises(ValueError):normalize_document({**document(),**changes})
        for key in ('links','parameters','configurations','verificationPlan','specialLinks'):
            for bad in ('invalid',[None]):
                payload=document();payload['reporting'][key]=bad
                with self.assertRaises(ValueError):normalize_document(payload)
        payload=document();payload['design']['moduleStates']['BGP']=None
        with self.assertRaises(ValueError):normalize_document(payload)
        payload=document();payload['design']['fields']['large']='a'*(4*1024*1024)
        with self.assertRaises(ValueError):normalize_document(payload)
    def test_standalone_report_accepts_no_technology_source(self):
        payload=document();payload['design']=None;payload['reporting']['source']=None
        result=self.repo.save('one',payload)
        self.assertTrue(result['has_reporting']);self.assertFalse(result['has_design'])
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
            first=created.json()
            updated=client.put('/api/projects/'+pid,json={'document':document('Changed'),'version':1,'expected_updated_at':first['updated_at']})
            self.assertEqual(updated.status_code,200);self.assertEqual(updated.json()['version'],1)
            revised=client.put('/api/projects/'+pid,json={'document':document('Changed'),'version':1,'expected_updated_at':updated.json()['updated_at'],'create_revision':True})
            self.assertEqual(revised.json()['version'],2)
            self.assertEqual(client.request('DELETE','/api/projects/'+pid+'/revisions/2',json={'confirmed':True}).status_code,400)
            self.assertEqual(client.request('DELETE','/api/projects/'+pid+'/revisions/1',json={'confirmed':False}).status_code,400)
            self.assertEqual(client.request('DELETE','/api/projects/'+pid+'/revisions/1',json={'confirmed':True}).status_code,200)
            self.assertEqual(client.get('/api/projects/'+pid+'/revisions/1').status_code,404)
            deleted=client.request('DELETE','/api/projects/'+pid,json={'confirmed':True,'expected_updated_at':revised.json()['updated_at']})
            self.assertEqual(deleted.status_code,200);self.assertEqual(client.get('/api/projects/'+pid).status_code,404)
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
