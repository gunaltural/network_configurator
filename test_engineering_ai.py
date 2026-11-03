import os
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from engineering_ai import install_engineering_ai, redact

class Tests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        install_engineering_ai(app)
        self.client = TestClient(app)
        self.body = dict(module='BGP', vendor='Cisco IOS-XE', task='scenario', evidence=[dict(id='s1', text='ISP1 failed\npassword sensitive')])

    def test_disabled(self):
        with patch.dict(os.environ, {'AI_ENABLED': '0'}), patch('engineering_ai.generate') as generate:
            self.assertFalse(self.client.get('/api/ai/status').json()['available'])
            self.assertEqual(self.client.post('/api/ai/analyze', json=self.body).status_code, 503)
            generate.assert_not_called()

    def test_draft(self):
        with patch.dict(os.environ, {'AI_PROVIDER': 'openai', 'AI_ENABLED': '1', 'AI_MODEL': 'test', 'OPENAI_API_KEY': 'test'}), patch('engineering_ai.generate', return_value='Draft [s1]') as generate:
            result = self.client.post('/api/ai/analyze', json=self.body)
            self.assertEqual(result.status_code, 200)
            self.assertTrue(result.json()['reviewRequired'])
            payload = generate.call_args.args[0]
            self.assertFalse(payload['store'])
            self.assertNotIn('sensitive', payload['input'])
            self.assertIn('ISP1 failed', payload['input'])
            self.assertEqual(self.body['evidence'][0]['text'], 'ISP1 failed\npassword sensitive')
            self.body['evidence'] *= 2
            self.assertEqual(self.client.post('/api/ai/analyze', json=self.body).status_code, 422)

    def test_cli_model_review_uses_retrieved_knowledge(self):
        capture = dict(module='CLI_ANALYSIS', vendor='Cisco IOS-XE', task='report', evidence=[
            dict(id='summary', text='Device: CE1\nCommand: show ip bgp summary\nL2: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\nL3: 192.0.2.2 4 65002 0 0 1 0 0 never Idle')])
        env = {'AI_PROVIDER':'local','AI_ENABLED':'1','AI_MODEL':'network-engineer','AI_BASE_URL':'http://localhost:8080/v1'}
        with patch.dict(os.environ, env, clear=True), patch('engineering_ai.generate', return_value='Observed idle [summary, L3].') as generate:
            result = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(result.status_code, 200)
            draft = result.json()
            self.assertEqual(draft['mode'], 'model-evidence-cited-draft')
            self.assertIn('bgp-control-plane', draft['knowledgeIds'])
            self.assertEqual(draft['evidenceIds'], ['summary'])
            payload = generate.call_args.args[0]
            self.assertIn('retrieved_knowledge', payload['input'])
            self.assertIn('L3:', payload['input'])

    def test_vpc_model_receives_source_backed_questions_without_per_command_rules(self):
        capture = dict(module='CLI_ANALYSIS', vendor='Cisco NX-OS', task='report', evidence=[
            dict(id='cli-1-0', text='Device: N9K-A\nCommand: show running-config vpc\nL3: vpc domain 100'),
            dict(id='cli-2-0', text='Device: N9K-A\nCommand: show vpc\nL8: Peer Gateway : Enabled')])
        env = {'AI_PROVIDER':'local','AI_ENABLED':'1','AI_MODEL':'network-engineer','AI_BASE_URL':'http://localhost:8080/v1'}
        with patch.dict(os.environ, env, clear=True), patch('engineering_ai.generate',
                return_value='Operational state reports gateway forwarding enabled [cli-2-0, L8]; confirm configuration scope.') as generate:
            response = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['mode'], 'model-evidence-cited-draft')
            self.assertIn('cisco-nxos-vpc-design', response.json()['knowledgeIds'])
            payload = generate.call_args.args[0]
            self.assertIn('peer-switch', payload['input'])
            self.assertIn('peer-gateway', payload['input'])
            self.assertIn('manufacturer_documentation', payload['input'])
            self.assertIn('Max 65 words', payload['instructions'])

    def test_cli_rejects_hallucinated_line_citation(self):
        capture = dict(module='CLI_ANALYSIS', vendor='Cisco NX-OS', task='report', evidence=[
            dict(id='cli-1-0', text='Device: LEAF1\nCommand: show vpc\nL3: peer-link status: up')])
        env = {'AI_PROVIDER':'openai','AI_ENABLED':'1','AI_MODEL':'test','OPENAI_API_KEY':'test'}
        with patch.dict(os.environ, env), patch('engineering_ai.generate', return_value='Potential issue [cli-1-0, L999].'):
            result = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()['mode'], 'model-unverified-draft')
            self.assertIn('unverified', result.json()['text'])
            self.assertNotIn('Potential issue', result.json()['text'])
            self.assertIn('peer-link status: up', result.json()['text'])

    def test_cross_batch_synthesis_is_explicitly_unverified(self):
        capture = dict(module='CLI_SYNTHESIS', vendor='Cisco NX-OS', task='report', evidence=[
            dict(id='batch-1', text='Preliminary vPC hypothesis [cli-1-0, L6]'),
            dict(id='batch-2', text='Potentially contradictory operational state [cli-8-0, L44]')])
        env = {'AI_PROVIDER':'openai','AI_ENABLED':'1','AI_MODEL':'test','OPENAI_API_KEY':'test'}
        with patch.dict(os.environ, env), patch('engineering_ai.generate', return_value='UNVERIFIED: compare peer state across reports.') as generate:
            result = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()['mode'], 'cross-batch-unverified-synthesis')
            self.assertIn('batch_drafts', generate.call_args.args[0]['input'])

    def test_cli_provider_failure_returns_explicit_evidence_only(self):
        from fastapi import HTTPException
        capture = dict(module='CLI_ANALYSIS', vendor='Other', task='report', evidence=[
            dict(id='cli-1-1', text='Device: EDGE1\nCommand: show running-config\nL3: interface Ethernet1\nL4: ip address 192.0.2.1/24')])
        env = {'AI_PROVIDER':'openai', 'AI_ENABLED':'1', 'AI_MODEL':'test', 'OPENAI_API_KEY':'test'}
        with patch.dict(os.environ, env), patch('engineering_ai.generate', side_effect=HTTPException(502, 'AI provider did not return a complete draft.')):
            result = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(result.status_code, 200)
            draft = result.json()
            self.assertEqual(draft['mode'], 'evidence-only-provider-fallback')
            self.assertIn('cli-1-1', draft['text'])
            self.assertIn('not a root-cause assessment', draft['text'])
            self.assertTrue(draft['reviewRequired'])
            self.assertEqual(draft['evidenceIds'], ['cli-1-1'])
            ordinary = self.client.post('/api/ai/analyze', json=self.body)
            self.assertEqual(ordinary.status_code, 502)

    def test_schema(self):
        self.body['rawConfig'] = 'not allowed'
        self.assertEqual(self.client.post('/api/ai/analyze', json=self.body).status_code, 422)


class LocalTests(unittest.TestCase):
    def test_local_request_and_no_fallback(self):
        import json
        from engineering_ai import generate, configured
        from fastapi import HTTPException
        payload = dict(model='internal-model', instructions='Review', input='evidence', max_output_tokens=2000)
        with patch.dict(os.environ, {'AI_ENABLED':'1','AI_PROVIDER':'local','AI_MODEL':'internal-model','AI_BASE_URL':'http://model.internal:8000/v1'}, clear=True), patch('engineering_ai.urllib.request.build_opener') as opener:
            self.assertTrue(configured())
            response = opener.return_value.open.return_value.__enter__.return_value
            response.read.return_value = json.dumps({'choices':[{'finish_reason':'stop','message':{'content':'Local draft'}}]}).encode()
            self.assertEqual(generate(payload), 'Local draft')
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, 'http://model.internal:8000/v1/chat/completions')
            self.assertNotIn('Authorization', request.headers)
            self.assertEqual(json.loads(request.data)['messages'][1]['content'], 'evidence')
            opener.return_value.open.reset_mock()
            opener.return_value.open.side_effect = OSError('internal details')
            with self.assertRaises(HTTPException) as error:
                generate(payload)
            self.assertEqual(error.exception.status_code, 502)
            self.assertEqual(opener.return_value.open.call_count, 1)
            self.assertNotIn('internal details', error.exception.detail)

    def test_invalid_server_not_enabled(self):
        from engineering_ai import configured
        for url in ['', 'file:///tmp/model', 'http://user:pass@server/v1', 'https://server/v1?token=secret']:
            with patch.dict(os.environ, {'AI_ENABLED':'1','AI_PROVIDER':'local','AI_MODEL':'m','AI_BASE_URL':url}, clear=True):
                self.assertFalse(configured())


class AuthBoundaryTests(unittest.TestCase):
    def test_ai_requires_session_and_same_origin(self):
        from pathlib import Path
        from authentication import install_authentication, password_hash
        with patch.dict(os.environ, {'AUTH_ENABLED':'1', 'AUTH_USERNAME':'engineer', 'AUTH_PASSWORD_HASH':password_hash('Synthetic-test-password'), 'AUTH_PASSWORD':'', 'AI_ENABLED':'0'}):
            app = FastAPI()
            install_authentication(app, Path(__file__).parent)
            install_engineering_ai(app)
            client = TestClient(app, base_url='https://testserver')
            body = dict(module='BGP', vendor='Cisco IOS-XE', task='report', evidence=[dict(id='design', text='Two routers')])
            origin = {'Origin':'https://testserver'}
            self.assertEqual(client.get('/api/ai/status').status_code, 401)
            self.assertEqual(client.post('/api/ai/analyze', json=body, headers=origin).status_code, 401)
            response = client.post('/auth/login', headers=origin, json={'username':'engineer','password':'Synthetic-test-password'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(client.get('/api/ai/status').status_code, 200)
            self.assertEqual(client.post('/api/ai/analyze', json=body, headers={'Origin':'https://other.invalid'}).status_code, 403)
            self.assertEqual(client.post('/api/ai/analyze', json=body, headers=origin).status_code, 503)

if __name__ == '__main__':
    unittest.main()
