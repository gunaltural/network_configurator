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
