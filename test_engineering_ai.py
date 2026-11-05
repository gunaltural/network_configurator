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

    def test_redaction_masks_snmp_credentials_not_routing_communities(self):
        sample = ('Device: EDGE1\nCommand: show running-config\n'
                  'L7: snmp-server community verySecret RO\n'
                  'L8: set community 65000:1 additive\n'
                  'L9: snmp community privateName\n'
                  'L10: username admin secret superSecret\n')
        filtered = redact(sample)
        self.assertNotIn('verySecret', filtered)
        self.assertNotIn('privateName', filtered)
        self.assertNotIn('superSecret', filtered)
        self.assertIn('set community 65000:1 additive', filtered)
        self.assertIn('L7: [REDACTED]', filtered)
        self.assertIn('L9: [REDACTED]', filtered)
        self.assertIn('L10: [REDACTED]', filtered)
        self.assertIn('L8: set community 65000:1 additive', filtered)
        self.assertEqual(filtered.count('[REDACTED]'), 3)


    def test_disabled(self):
        with patch.dict(os.environ, {'AI_ENABLED': '0'}), patch('engineering_ai.generate') as generate:
            self.assertFalse(self.client.get('/api/ai/status').json()['available'])
            self.assertEqual(self.client.post('/api/ai/analyze', json=self.body).status_code, 503)
            generate.assert_not_called()

    def test_redaction_masks_multiline_pem_and_preserves_original_line_refs(self):
        data = ("L1: interface Gi0/1\n"
                "L2: -----BEGIN RSA PRIVATE KEY-----\n"
                "L3: SUPERSECRETBASE64PAYLOAD\n"
                "L4: -----END RSA PRIVATE KEY-----\n"
                "L5: router bgp 65001\n")
        safe = redact(data)
        self.assertNotIn("SUPERSECRETBASE64PAYLOAD", safe)
        for n in (2,3,4):
            self.assertIn(f"L{n}: [REDACTED]", safe)
        self.assertIn("L5: router bgp 65001", safe)
        incomplete = redact("L1: -----BEGIN OPENSSH PRIVATE KEY-----\nL2: UNCLOSEDKEY\nL3: do not leak")
        self.assertNotIn("UNCLOSEDKEY", incomplete)
        self.assertIn("L3: [REDACTED]", incomplete)

    def test_redaction_masks_psk_isakmp_and_private_keys(self):
        raw = ("L11: crypto isakmp key SuperSensitive address 192.0.2.2\n"
               "L12: set psksecret MyPrivatePSK\n"
               "L13: pre-shared-key AnotherCredential\n"
               "L14: route-map RM-BGP permit 10\n"
               "L15: set community 65000:1 additive")
        output = redact(raw)
        for value in ("SuperSensitive", "MyPrivatePSK", "AnotherCredential"):
            self.assertNotIn(value, output)
        for line in ("L11: [REDACTED]", "L12: [REDACTED]", "L13: [REDACTED]"):
            self.assertIn(line, output)
        self.assertIn("set community 65000:1 additive", output)

    def test_remote_local_endpoint_requires_disclosure(self):
        env = {'AI_PROVIDER':'local','AI_ENABLED':'1','AI_MODEL':'model',
               'AI_BASE_URL':'https://remote-model.example/v1'}
        with patch.dict(os.environ,env,clear=True):
            status=self.client.get('/api/ai/status').json()
            self.assertTrue(status['available'])
            self.assertTrue(status['externalDataTransfer'])
            self.assertFalse(status['reasoningVerified'])
        env['AI_BASE_URL']='http://localhost:8080/v1'
        with patch.dict(os.environ,env,clear=True):
            self.assertFalse(self.client.get('/api/ai/status').json()['externalDataTransfer'])

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

    def test_stp_v1_selected_core_comparison_uses_distinct_model_prompt_and_citations(self):
        capture = dict(module='STP_ANALYSIS', vendor='Cisco NX-OS', task='report', evidence=[
            dict(id='core-1-config-0', text='Device: CORE-1\nCommand: proposed configuration\nL1: spanning-tree mode rapid-pvst\nL2: spanning-tree vlan 10 priority 4096'),
            dict(id='core-2-config-0', text='Device: CORE-2\nCommand: proposed configuration\nL1: spanning-tree mode rapid-pvst\nL2: spanning-tree vlan 10 priority 8192'),
            dict(id='stp-v1-preflight', text='Device: STP-V1-PREFLIGHT\nL1: deterministic preflight, not an AI answer key')])
        env = {'AI_PROVIDER':'local','AI_ENABLED':'1','AI_MODEL':'network-engineer',
               'AI_BASE_URL':'http://localhost:8080/v1'}
        observation = ('Core priority differs for VLAN10: CORE-1 has 4096 [core-1-config-0, L2] '
                       'and CORE-2 has 8192 [core-2-config-0, L2]; '
                       'operational root status remains unverified.')
        with patch.dict(os.environ, env, clear=True), patch('engineering_ai.generate',
                return_value=observation) as model:
            result = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()['mode'], 'model-evidence-cited-draft')
            self.assertFalse(result.json()['engineeringVerified'])
            instructions = model.call_args.args[0]['instructions']
            self.assertIn('STP V1', instructions)
            self.assertIn('deterministic preflight as an answer key', instructions)
            self.assertIn('STP', model.call_args.args[0]['input'])
        with patch.dict(os.environ, env, clear=True), patch('engineering_ai.generate',
                return_value='Core-1 is definitely the root bridge.') as model:
            result = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()['mode'], 'model-unverified-draft')
            self.assertNotIn('definitely the root', result.json()['text'])
        with patch.dict(os.environ, {'AI_ENABLED':'0'}, clear=True), patch('engineering_ai.generate') as model:
            self.assertEqual(self.client.post('/api/ai/analyze', json=capture).status_code, 503)
            model.assert_not_called()

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
            self.assertIn('manufacturer_source_metadata', payload['input'])
            self.assertIn('cisco-bgp-basic-2026', draft['sourceIndexIds'])
            self.assertIn('L3:', payload['input'])
            self.assertIn('Design as intent and Simulation as hypothetical', payload['instructions'])

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

    def test_full_local_profile_preserves_full_reasoning_context(self):
        capture = dict(module='CLI_ANALYSIS', vendor='Cisco NX-OS', task='report', evidence=[
            dict(id='a', text='Device: N9K-A\nCommand: show vpc\nL3: Peer Gateway : Enabled')])
        env = {'AI_PROVIDER': 'local', 'AI_ENABLED': '1', 'AI_MODEL': 'strong-local',
               'AI_BASE_URL': 'http://localhost:8080/v1', 'AI_LOCAL_REASONING_PROFILE': 'full'}
        with patch.dict(os.environ, env, clear=True), patch('engineering_ai.generate',
                return_value='Operational peer gateway enabled [a, L3].') as model:
            response = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['mode'], 'model-evidence-cited-draft')
            payload = model.call_args.args[0]
            self.assertIn('senior multi-vendor', payload['instructions'])
            self.assertIn('Simulation is a modeled hypothetical', payload['instructions'])
            self.assertIn('simulated failure outcome MUST NOT be described as a measured live fault', payload['instructions'])
            self.assertIn('retrieved_knowledge', payload['input'])
            self.assertNotIn('Max 65 words', payload['instructions'])

    def test_groq_403_error_classifier_exposes_only_safe_categories(self):
        import io
        import urllib.error
        from engineering_ai import groq_error_category
        def failure(content):
            return urllib.error.HTTPError('https://api.groq.com/openai/v1/chat/completions',
                                          403, 'Forbidden', {}, io.BytesIO(content.encode()))
        self.assertEqual(groq_error_category(failure(
            '{"error":{"type":"permissions_error","code":"model_permission_blocked_org",'
            '"message":"secret-private-cli should never be logged"}}')),
            'model_permission_blocked_org')
        self.assertEqual(groq_error_category(failure(
            '{"error":{"type":"permissions_error","code":"unexpected_private_secret"}}')),
            'permissions_error')
        self.assertEqual(groq_error_category(failure('HTML authorization refused')),
                         'unclassified')
        self.assertEqual(groq_error_category(failure('{"error":{"type":42}}')),
                         'unclassified')

    def test_opt_in_groq_uses_fixed_chat_endpoint_and_cites_real_evidence(self):
        from engineering_ai import generate, configured
        import json
        env = {'AI_PROVIDER': 'groq', 'AI_ENABLED': '1',
               'AI_MODEL': 'openai/gpt-oss-120b', 'GROQ_API_KEY': 'synthetic-secret'}
        data = {'choices': [{'finish_reason': 'stop', 'message': {
            'content': 'Observed operational state [cli-1, L4]; inspect the other peer.'}}]}
        capture = dict(module='CLI_ANALYSIS', vendor='Cisco NX-OS', task='report',
                       evidence=[dict(id='cli-1', text='Device: N9K-A\nCommand: show vpc\nL4: Peer Gateway : Enabled')])
        with patch.dict(os.environ, env, clear=True), patch('engineering_ai.urllib.request.build_opener') as opener:
            self.assertTrue(configured())
            response = opener.return_value.open.return_value.__enter__.return_value
            response.read.return_value = json.dumps(data).encode()
            draft = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(draft.status_code, 200)
            self.assertEqual(draft.json()['mode'], 'model-evidence-cited-draft')
            self.assertFalse(draft.json()['engineeringVerified'])
            req = opener.return_value.open.call_args.args[0]
            self.assertEqual(req.full_url, 'https://api.groq.com/openai/v1/chat/completions')
            self.assertEqual(req.get_header('Authorization'), 'Bearer synthetic-secret')
            payload = json.loads(req.data)
            self.assertEqual(payload['model'], 'openai/gpt-oss-120b')
            self.assertEqual(payload['messages'][0]['role'], 'system')
            self.assertEqual(payload['messages'][1]['role'], 'user')
            self.assertIn('Peer Gateway : Enabled', payload['messages'][1]['content'])
            self.assertIn('retrieved_knowledge', payload['messages'][1]['content'])
            self.assertFalse(payload['stream'])
            self.assertEqual(payload['reasoning_effort'], 'low')
            self.assertFalse(payload['include_reasoning'])
        with patch.dict(os.environ, {**env, 'GROQ_API_KEY': ''}, clear=True):
            self.assertFalse(configured())

    def test_groq_incomplete_reply_does_not_pass_as_engineering_reasoning(self):
        import json
        env = {'AI_PROVIDER': 'groq', 'AI_ENABLED': '1',
               'AI_MODEL': 'openai/gpt-oss-120b', 'GROQ_API_KEY': 'synthetic-secret'}
        capture = dict(module='CLI_ANALYSIS', vendor='Cisco NX-OS', task='report',
                       evidence=[dict(id='x', text='Device: N9K-A\nL3: Peer-link status : Up')])
        data = {'choices': [{'finish_reason': 'length', 'message': {
            'content': 'Unsupported incomplete model output [x, L3]'}}]}
        with patch.dict(os.environ, env, clear=True), patch('engineering_ai.urllib.request.build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = json.dumps(data).encode()
            result = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()['mode'], 'evidence-only-provider-fallback')
            self.assertNotIn('Unsupported incomplete model output', result.json()['text'])

    def test_hosted_provider_receives_complete_retrieval_context(self):
        capture = dict(module='CLI_ANALYSIS', vendor='Cisco NX-OS', task='report', evidence=[
            dict(id='a', text='Device: N9K-A\nCommand: show vpc\nL3: vPC role : primary\nL4: Peer Gateway : Enabled'),
            dict(id='b', text='Device: N9K-A\nCommand: show spanning-tree vlan 10\nL8: Root ID Priority 24586')])
        env = {'AI_PROVIDER': 'openai', 'AI_ENABLED': '1',
               'OPENAI_API_KEY': 'synthetic-test-key', 'AI_MODEL': 'test-model'}
        with patch.dict(os.environ, env, clear=True), patch('engineering_ai.generate',
                return_value='Observed peer gateway enabled [a, L4]; additional peer evidence required.') as model:
            response = self.client.post('/api/ai/analyze', json=capture)
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data['mode'], 'model-evidence-cited-draft')
            self.assertFalse(data['engineeringVerified'])
            request = model.call_args.args[0]
            self.assertIn('manufacturer_documentation', request['input'])
            self.assertIn('cisco-nxos-vpc-design', request['input'])
            self.assertIn('How do peer reachability', request['input'])
            self.assertIn('Does the spanning-tree', request['input'])
            self.assertIn('peer-gateway', request['input'])
            status = self.client.get('/api/ai/status').json()
            self.assertEqual(status['provider'], 'openai')
            self.assertFalse(status['reasoningVerified'])

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

    def test_full_local_profile_allows_longer_reasoning_output(self):
        import json
        from engineering_ai import generate
        payload = dict(model='strong-local', instructions='Review', input='evidence',
                       max_output_tokens=2200)
        env = {'AI_ENABLED': '1', 'AI_PROVIDER': 'local', 'AI_MODEL': 'strong-local',
               'AI_BASE_URL': 'http://model.internal:8000/v1',
               'AI_LOCAL_REASONING_PROFILE': 'full'}
        with patch.dict(os.environ, env, clear=True), patch('engineering_ai.urllib.request.build_opener') as opener:
            response = opener.return_value.open.return_value.__enter__.return_value
            response.read.return_value = json.dumps({'choices': [
                {'finish_reason': 'stop', 'message': {'content': 'Reasoned draft'}}]}).encode()
            self.assertEqual(generate(payload), 'Reasoned draft')
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(json.loads(request.data)['max_tokens'], 2200)
            self.assertEqual(opener.return_value.open.call_args.kwargs['timeout'], 240)
        env.pop('AI_LOCAL_REASONING_PROFILE')
        with patch.dict(os.environ, env, clear=True), patch('engineering_ai.urllib.request.build_opener') as opener:
            response = opener.return_value.open.return_value.__enter__.return_value
            response.read.return_value = json.dumps({'choices': [
                {'finish_reason': 'stop', 'message': {'content': 'Compact draft'}}]}).encode()
            self.assertEqual(generate(payload), 'Compact draft')
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(json.loads(request.data)['max_tokens'], 640)
            self.assertEqual(opener.return_value.open.call_args.kwargs['timeout'], 75)

    def test_groq_without_key_fails_closed_without_network_or_model_claim(self):
        """A provider adapter alone is not a verified or enabled LLM."""
        from engineering_ai import configured
        app = FastAPI()
        install_engineering_ai(app)
        client = TestClient(app)
        body = dict(module='CLI_ANALYSIS', vendor='Cisco NX-OS', task='report',
                    evidence=[dict(id='cli-1', text='Device: N9K-A\\nL1: Peer Gateway : Enabled')])
        env = {'AI_ENABLED': '1', 'AI_PROVIDER': 'groq',
               'AI_MODEL': 'openai/gpt-oss-120b'}
        with patch.dict(os.environ, env, clear=True), patch(
                'engineering_ai.urllib.request.build_opener') as opener:
            self.assertFalse(configured())
            result = client.post('/api/ai/analyze', json=body)
            self.assertEqual(result.status_code, 503)
            self.assertNotIn('model-evidence-cited-draft', result.text)
            opener.assert_not_called()

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
