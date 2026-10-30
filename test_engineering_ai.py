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
        with patch.dict(os.environ, {'AI_ENABLED': '1', 'AI_MODEL': 'test', 'OPENAI_API_KEY': 'test'}), patch('engineering_ai.generate', return_value='Draft [s1]') as generate:
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

if __name__ == '__main__':
    unittest.main()
