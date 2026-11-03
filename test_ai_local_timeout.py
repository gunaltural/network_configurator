"""Regression checks for configurable local inference timeout."""
import os
import unittest
from unittest.mock import patch

from engineering_ai import provider_timeout


class LocalTimeoutTests(unittest.TestCase):
    def test_default_allows_cpu_inference(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(provider_timeout(), 180)

    def test_override(self):
        with patch.dict(os.environ, {'AI_LOCAL_TIMEOUT_SECONDS': '240'}):
            self.assertEqual(provider_timeout(), 240)

    def test_invalid_values_rejected(self):
        for value in ('abc', '0', '601'):
            with self.subTest(value=value), patch.dict(os.environ, {'AI_LOCAL_TIMEOUT_SECONDS': value}):
                with self.assertRaises(ValueError):
                    provider_timeout()


if __name__ == '__main__':
    unittest.main()
