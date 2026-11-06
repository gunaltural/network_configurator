"""Real scratch-checkpoint and offline API smoke. No network/external provider."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import torch
from fastapi.testclient import TestClient

from .demo_api import app, _cached_local_model
from .inference import load_probe, predict, validate_observation
from .state_probe import train_probe


class OfflineResearchDemoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)
        cls.temp = tempfile.TemporaryDirectory()
        cls.checkpoint = Path(cls.temp.name) / "probe.pt"
        train_probe(steps=2, samples_per_state=1, width=32, layers=1,
                    heads=4, seed=13, batch_size=2,
                    output=str(cls.checkpoint), threads=2)

    @classmethod
    def tearDownClass(cls):
        _cached_local_model.cache_clear()
        cls.temp.cleanup()

    def test_local_checkpoint_can_really_reload_and_predict(self):
        model, tokenizer = load_probe(self.checkpoint)
        result = predict(model, tokenizer, "OSPF neighbor 10.0.0.5 state EXSTART/DR")
        self.assertEqual(result["mode"], "offline-scratch-state-probe")
        self.assertIn(result["decision"], {"ABSTAIN", "RESEARCH_CANDIDATE_ONLY"})
        self.assertEqual(len(result["top_candidates"]), 3)
        self.assertTrue(all(0 <= item["uncalibrated_score"] <= 1
                            for item in result["top_candidates"]))
        self.assertFalse(result["engineering_verified"])
        self.assertFalse(result["production_ready"])
        self.assertFalse(result["root_cause_verified"])
        if result["decision"] == "ABSTAIN":
            self.assertIsNone(result["candidate_label"])

    def test_force_abstention_and_declares_uncalibrated_scores(self):
        model, tokenizer = load_probe(self.checkpoint)
        result = predict(model, tokenizer, "BGP neighbor 192.0.2.2 Active",
                         abstain_score=1.01, abstain_margin=1.0)
        self.assertEqual(result["decision"], "ABSTAIN")
        self.assertIsNone(result["candidate_label"])
        self.assertTrue(any("Softmax" in x for x in result["limitations"]))

    def test_input_rejects_secrets_multiline_and_long_utf8(self):
        for text in ("", "line1\nline2", "show running-config\n router bgp",
                     "router secret supersecret", "password abc123",
                     "snmp-server community public", "Bearer AAAABBBB",
                     "X" * 490, "ğ" * 260):
            with self.subTest(text=text[:30]), self.assertRaises(ValueError):
                validate_observation(text)
        self.assertEqual(validate_observation("  BGP Active  "), "BGP Active")

    def test_provenance_tampering_fails_closed(self):
        original = torch.load(self.checkpoint, map_location="cpu", weights_only=True)
        checkpoint = Path(self.temp.name) / "tampered.pt"
        for field, value in (
            ("challenge_sha256", "0" * 64),
            ("curriculum_train_digest", "0" * 64),
            ("production_ready", True),
            ("parameter_count", 1),
        ):
            with self.subTest(field=field):
                payload = torch.load(self.checkpoint, map_location="cpu",
                                     weights_only=True)
                payload["manifest"][field] = value
                torch.save(payload, checkpoint)
                with self.assertRaises(ValueError):
                    load_probe(checkpoint)
        payload = original
        payload["states"] = ("fake",)
        torch.save(payload, checkpoint)
        with self.assertRaises(ValueError):
            load_probe(checkpoint)

    def test_api_is_disabled_by_default(self):
        _cached_local_model.cache_clear()
        with patch.dict(os.environ, {}, clear=True):
            client = TestClient(app)
            self.assertFalse(client.get("/health").json()["enabled"])
            self.assertEqual(client.get("/").status_code, 404)
            self.assertEqual(client.post("/api/research/predict",
                json={"observation": "BGP Active"}).status_code, 503)

    def test_api_opt_in_returns_real_logits_but_never_diagnosis(self):
        _cached_local_model.cache_clear()
        env = {"SCRATCH_DEMO_ENABLED": "1",
               "SCRATCH_DEMO_CHECKPOINT": str(self.checkpoint)}
        with patch.dict(os.environ, env, clear=True):
            client = TestClient(app)
            self.assertEqual(client.get("/").status_code, 200)
            self.assertIn("Scratch Lab", client.get("/").text)
            response = client.post("/api/research/predict", json={
                "observation": "BGP neighbor 192.0.2.3 Active",
                "device": "LAB-01", "evidence_id": "manual-1"})
            self.assertEqual(response.status_code, 200)
            doc = response.json()
            self.assertEqual(doc["source"]["device"], "LAB-01")
            self.assertEqual(doc["source"]["provenance"],
                             "unverified-user-submitted-observation")
            self.assertFalse(doc["engineering_verified"])
            self.assertFalse(doc["production_ready"])
            self.assertIn(doc["decision"], {"ABSTAIN", "RESEARCH_CANDIDATE_ONLY"})
            self.assertNotIn("verified_root_cause", doc)
            invalids = [
                {"observation": "password 123"},
                {"observation": "BGP Active\nOSPF Full"},
                {"observation": "BGP Active", "device": "../test"},
                {"observation": "BGP Active", "unknown": "field"},
            ]
            for body in invalids:
                with self.subTest(body=body):
                    self.assertEqual(client.post("/api/research/predict",
                                                  json=body).status_code, 422)


if __name__ == "__main__":
    unittest.main()
