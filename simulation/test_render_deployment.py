import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from verify_render_deployment import check_once

class FakeResponse:
    def __init__(self, value, status=200):
        self.raw = io.BytesIO(json.dumps(value).encode())
        self.status = status
    def __enter__(self):
        return self
    def __exit__(self, *_):
        return None
    def read(self, *args):
        return self.raw.read(*args)

class RenderDeploymentVerificationTests(unittest.TestCase):
    def test_expected_version_and_ready_assets(self):
        with patch('verify_render_deployment.urlopen', return_value=FakeResponse({
            'ok': True, 'version': '5.44.3', 'simulator_ready': True
        })):
            ok, result = check_once('https://test.example', '5.44.3')
            self.assertTrue(ok, result)

    def test_stale_render_deploy_is_not_success(self):
        with patch('verify_render_deployment.urlopen', return_value=FakeResponse({
            'ok': True, 'version': '5.44.2', 'simulator_ready': True
        })):
            ok, result = check_once('https://test.example', '5.44.3')
            self.assertFalse(ok)
            self.assertIn('5.44.2', result)

    def test_missing_simulation_assets_is_failure(self):
        with patch('verify_render_deployment.urlopen', return_value=FakeResponse({
            'ok': False, 'version': '5.44.3', 'simulator_ready': False
        })):
            ok, _ = check_once('https://test.example', '5.44.3')
            self.assertFalse(ok)

    def test_server_error_is_failure(self):
        with patch('verify_render_deployment.urlopen', side_effect=HTTPError(
            'https://test.example/healthz', 503, 'not ready', {}, None
        )):
            ok, result = check_once('https://test.example', '5.44.3')
            self.assertFalse(ok)
            self.assertIn('503', result)

    def test_public_check_must_use_https(self):
        ok, _ = check_once('http://test.example', '5.44.3')
        self.assertFalse(ok)

    def test_dockerfile_packages_health_required_files(self):
        contents = (Path(__file__).resolve().parents[1] / 'Dockerfile').read_text()
        self.assertIn('COPY simulation/ ./simulation/', contents)

if __name__ == '__main__':
    unittest.main()
