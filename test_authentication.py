"""Authentication boundary regression tests; synthetic credentials, no device access."""
import time
import unittest
from unittest.mock import patch
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from authentication import install_authentication, password_hash, safe_next, COOKIE

HASH = password_hash('Synthetic-password-only-123')


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        with patch.dict('os.environ', {'AUTH_ENABLED':'1','AUTH_USERNAME':'engineer','AUTH_PASSWORD_HASH':HASH,'AUTH_PASSWORD':''}):
            self.app = FastAPI()
            self.auth = install_authentication(self.app, Path(__file__).parent)
        self.app.get('/')(lambda: {'workspace': True})
        self.app.get('/reporting')(lambda: {'report': True})
        self.app.post('/api/device/show')(lambda: {'protected': True})
        self.client = TestClient(self.app, base_url='https://testserver', follow_redirects=False)
        self.origin = {'Origin':'https://testserver'}

    def login(self, password='Synthetic-password-only-123', **extra):
        return self.client.post('/auth/login', headers=self.origin, json={'username':'engineer','password':password, **extra})

    def test_gate_and_health(self):
        for route in ('/', '/reporting', '/corporate-shell.js', '/openapi.json'):
            self.assertEqual(self.client.get(route).status_code,303)
        self.assertEqual(self.client.post('/api/device/show', headers=self.origin).status_code,401)
        self.assertEqual(self.client.get('/healthz').json(), {'ok':True})
        self.assertEqual(self.client.get('/login').status_code,200)

    def test_login_cookie_rotation_logout_and_replay(self):
        self.assertEqual(self.login('wrong').status_code,401)
        response = self.login(next='/reporting?view=inventory')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['next'],'/reporting?view=inventory')
        cookie = response.headers['set-cookie']
        for flag in ('Secure','HttpOnly','SameSite=strict','Path=/'):
            self.assertIn(flag,cookie)
        old = self.client.cookies.get(COOKIE)
        self.assertEqual(self.client.get('/').status_code,200)
        self.assertEqual(self.client.post('/api/device/show',headers=self.origin).status_code,200)
        self.login()
        self.assertIsNone(self.auth.user(old))
        current = self.client.cookies.get(COOKIE)
        self.assertEqual(self.client.post('/auth/logout',headers=self.origin).status_code,204)
        self.assertIsNone(self.auth.user(current))
        self.assertEqual(self.client.get('/').status_code,303)

    def test_missing_credentials_fail_closed(self):
        self.auth.encoded=''
        self.assertEqual(self.login().status_code,503)
        self.assertEqual(self.client.get('/').status_code,303)
        self.assertFalse(self.client.get('/auth/status').json()['configured'])

    def test_cross_site_and_missing_origin_blocked(self):
        for headers in ({},{'Origin':'https://evil.invalid'}):
            self.assertEqual(self.client.post('/auth/login',headers=headers,json={'username':'engineer','password':'x'}).status_code,403)
        self.login()
        self.assertEqual(self.client.post('/api/device/show',headers={'Origin':'https://evil.invalid'}).status_code,403)

    def test_tls_terminated_upstream(self):
        client=TestClient(self.app,base_url='http://testserver',follow_redirects=False)
        response=client.post('/auth/login',headers=self.origin,json={'username':'engineer','password':'Synthetic-password-only-123'})
        self.assertEqual(response.status_code,200)

    def test_throttle_and_expiry(self):
        for _ in range(10):
            self.assertEqual(self.login('incorrect').status_code,401)
        self.assertEqual(self.login().status_code,429)
        token=self.auth.issue()
        with patch('authentication.time.time',return_value=time.time()+9*3600):
            self.assertIsNone(self.auth.user(token))

    def test_safe_return_and_identity(self):
        for value in ('//evil.invalid','https://evil.invalid','/\\evil.invalid','/auth/login','/\n/evil'):
            self.assertEqual(safe_next(value),'/')
        self.login()
        self.assertEqual(self.client.get('/auth/status').json()['username'],'engineer')
        self.assertNotIn('password',str(self.client.get('/auth/status').json()))

    def test_raw_secret_and_invalid_hash(self):
        with patch.dict('os.environ',{'AUTH_ENABLED':'1','AUTH_USERNAME':'engineer','AUTH_PASSWORD_HASH':'','AUTH_PASSWORD':'Synthetic-password-only-123'}):
            auth=install_authentication(FastAPI(),Path(__file__).parent)
        self.assertTrue(auth.configured)
        self.assertNotEqual(auth.encoded,'Synthetic-password-only-123')
        self.auth.encoded='pbkdf2_sha256$1$00$00'
        self.assertFalse(self.auth.configured)

    def test_application_route_boundary(self):
        import app
        main_auth=app.app.state.authentication
        with patch.object(main_auth,'enabled',True), patch.object(main_auth,'username','engineer'):
            client=TestClient(app.app,base_url='https://testserver',follow_redirects=False)
            for route in ('/api/device/commands','/api/diagnostics/network?target=example.com','/api/health'):
                response=client.get(route)
                self.assertEqual(response.status_code,200 if route=='/api/health' else 401)
                if route=='/api/health': self.assertEqual(response.json(),{'ok':True})
            for route in ('/api/device/show','/api/device/deploy','/api/device/test','/api/device/precheck','/api/reporting/inventory','/api/reporting/inventory-jobs','/api/reporting/inventory-excel','/api/reporting/word','/api/reporting/vendor-source'):
                self.assertEqual(client.post(route,headers=self.origin,json={}).status_code,401,route)
            token=main_auth.issue();client.cookies.set(COOKIE,token,domain='testserver.local',path='/')
            self.assertEqual(client.get('/').status_code,200)
            self.assertEqual(client.get('/reporting').status_code,200)
            main_auth.revoke(token)


if __name__=='__main__':
    unittest.main()
