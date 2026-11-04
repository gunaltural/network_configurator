"""Offline regression: probe both Groq endpoints even when one is forbidden."""
import contextlib
import io
import unittest
from unittest.mock import patch
from scripts import probe_groq_access as probe


class AccessComparisonTests(unittest.TestCase):
    def test_allowlist_does_not_emit_provider_messages(self):
        self.assertEqual(
            probe.safe_error_category(b'{"error":{"code":"model_permission_blocked_project",'
                                      b'"message":"secret customer config"}}'),
            'model_permission_blocked_project')
        self.assertEqual(
            probe.safe_error_category(b'{"error":{"code":"PRIVATE-ERROR",'
                                      b'"type":"permissions_error","message":"secret"}}'),
            'permissions_error')
        self.assertEqual(probe.safe_error_category(b'<html>blocked</html>'), 'unclassified')
        self.assertEqual(probe.safe_error_category(b'{"error":{"type":123}}'), 'unclassified')

    def test_chat_runs_even_when_model_listing_forbidden(self):
        calls = []
        def fake_call(url, key=None, payload=None, timeout=20):
            calls.append((url, bool(key), payload))
            if url == probe.MODELS_URL and not key:
                return {'status':403,'category':'unclassified','body':None,'content_type':'html'}
            if url == probe.MODELS_URL:
                return {'status':403,'category':'model_permission_blocked_org',
                        'body':None,'content_type':'json'}
            return {'status':200,'category':'none','content_type':'json','body':{
                'choices':[{'finish_reason':'stop','message':{'content':'OK'}}]}}
        output = io.StringIO()
        with patch.object(probe, 'call', side_effect=fake_call), contextlib.redirect_stdout(output):
            ok = probe.run_probe('synthetic-key')
        self.assertTrue(ok, 'Working chat must permit engineering tests despite a model-list 403')
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[2][0], probe.CHAT_URL)
        self.assertTrue(calls[2][1])
        self.assertEqual(calls[2][2]['messages'][0]['content'], 'Return the single word OK.')
        self.assertNotIn('synthetic-key', output.getvalue())
        self.assertIn('endpoint=authorized_chat status=200', output.getvalue())
        self.assertIn('completion_ok=true', output.getvalue())
        self.assertIn('decision=chat_ready', output.getvalue())

    def test_success_when_both_authenticated_calls_complete(self):
        def fake_call(url, key=None, payload=None, timeout=20):
            if not key:
                return {'status':401,'category':'unclassified','body':None,'content_type':'other'}
            if url == probe.MODELS_URL:
                return {'status':200,'category':'none','content_type':'json',
                        'body':{'data':[{'id':probe.MODEL}]}}
            return {'status':200,'category':'none','content_type':'json',
                    'body':{'choices':[{'finish_reason':'stop','message':{'content':'OK'}}]}}
        with patch.object(probe, 'call', side_effect=fake_call), contextlib.redirect_stdout(io.StringIO()):
            self.assertTrue(probe.run_probe('synthetic-key'))

    def test_incomplete_or_failed_chat_never_counts_as_success(self):
        def fake_call(url, key=None, payload=None, timeout=20):
            if url == probe.MODELS_URL:
                return {'status':200,'category':'none','content_type':'json',
                        'body':{'data':[{'id':probe.MODEL}]}}
            return {'status':403,'category':'permissions_error',
                    'content_type':'json','body':None}
        with patch.object(probe, 'call', side_effect=fake_call), contextlib.redirect_stdout(io.StringIO()):
            self.assertFalse(probe.run_probe('synthetic-key'))


if __name__ == '__main__':
    unittest.main()
