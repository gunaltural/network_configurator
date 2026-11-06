"""Provider-native schema tests: format must be strict and CLI proof still verified."""
import json
import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_model_response_schema import (
    CLAIM_REVIEW_SCHEMA, GROQ_STRICT_MODELS,
    add_structured_response_format, has_structured_output_support,
)
from engineering_ai import install_engineering_ai, generate
from test_ai_model_claim_review import EVIDENCE, good


class ProviderSchemaTests(unittest.TestCase):
    def test_schema_is_nested_strict_and_has_all_required_model_fields(self):
        def check(node):
            if not isinstance(node, dict):
                return
            if node.get("type") == "object":
                self.assertEqual(set(node["properties"]), set(node["required"]))
                self.assertIs(node.get("additionalProperties"), False)
                for child in node["properties"].values():
                    check(child)
            elif node.get("type") == "array":
                check(node["items"])
        check(CLAIM_REVIEW_SCHEMA)
        self.assertEqual(CLAIM_REVIEW_SCHEMA["properties"]["schema"]["enum"],
                         ["network-ai-claim-review-v1"])
        finding = CLAIM_REVIEW_SCHEMA["properties"]["findings"]["items"]
        self.assertEqual(set(finding["properties"]),
                         {"technology", "observations", "hypotheses", "conditional_impact"})
        hypothesis = finding["properties"]["hypotheses"]["items"]
        self.assertIn("if_refuted", hypothesis["required"])
        self.assertIn("potential_counterevidence", hypothesis["required"])

    def test_supported_providers_get_independent_contract_without_mutation(self):
        original = dict(model="openai/gpt-oss-120b", max_tokens=1200)
        groq = add_structured_response_format(original, "groq")
        self.assertNotIn("response_format", original)
        self.assertTrue(groq["response_format"]["json_schema"]["strict"])
        self.assertEqual(groq["response_format"]["type"], "json_schema")
        openai = add_structured_response_format(original, "openai")
        self.assertNotIn("text", original)
        self.assertTrue(openai["text"]["format"]["strict"])
        self.assertEqual(openai["text"]["format"]["type"], "json_schema")
        with self.assertRaises(ValueError):
            add_structured_response_format(dict(model="unlisted"), "groq")
        self.assertFalse(has_structured_output_support("groq", "unlisted"))
        self.assertTrue(all(has_structured_output_support("groq", m) for m in GROQ_STRICT_MODELS))
        self.assertFalse(has_structured_output_support("local", "tiny"))
        self.assertTrue(has_structured_output_support("local", "full", "full"))

    @staticmethod
    def _response_json():
        return json.dumps({"choices": [{"finish_reason": "stop",
                          "message": {"content": json.dumps(good())}}]}).encode()

    def test_groq_strict_format_is_sent_and_exact_cli_quote_is_still_required(self):
        env = {"AI_PROVIDER": "groq", "AI_ENABLED": "1", "AI_MODEL": "openai/gpt-oss-120b",
               "GROQ_API_KEY": "synthetic"}
        app = FastAPI()
        install_engineering_ai(app)
        client = TestClient(app)
        body = {"module": "CLI_ANALYSIS", "vendor": "Cisco IOS-XE", "language": "en",
                "task": "report", "evidence": EVIDENCE, "reviewFormat": "evidence-claims-v1"}
        with patch.dict(os.environ, env, clear=True), patch(
                "engineering_ai.urllib.request.build_opener") as opener:
            response = opener.return_value.open.return_value.__enter__.return_value
            response.read.return_value = self._response_json()
            result = client.post("/api/ai/analyze", json=body)
            self.assertEqual(result.status_code, 200)
            self.assertFalse(result.json()["engineeringVerified"])
            self.assertEqual(result.json()["claimReviewStatus"],
                             "SOURCE_QUOTES_VALIDATED_HYPOTHESES_UNVERIFIED")
            request = opener.return_value.open.call_args.args[0]
            outgoing = json.loads(request.data)
            self.assertTrue(outgoing["response_format"]["json_schema"]["strict"])
            self.assertIn("if_refuted", json.dumps(outgoing["response_format"]))
            self.assertNotIn("PASSWORD_MUST_NOT_LEAK", json.dumps(outgoing))
        with patch.dict(os.environ, {**env, "AI_MODEL": "unsupported"}, clear=True):
            self.assertFalse(client.get("/api/ai/status").json()["structuredClaimsSupported"])
            with patch("engineering_ai.generate") as model:
                refused = client.post("/api/ai/analyze", json=body)
                self.assertEqual(refused.status_code, 422)
                model.assert_not_called()

    def test_openai_responses_text_format_and_unverified_status(self):
        env = {"AI_PROVIDER": "openai", "AI_ENABLED": "1", "AI_MODEL": "test-model",
               "OPENAI_API_KEY": "synthetic"}
        payload = {"model": "test-model", "max_output_tokens": 1800, "store": False,
                   "instructions": "Classify CLI only", "input": "Synthetic evidence",
                   "structured_claim_review": True}
        with patch.dict(os.environ, env, clear=True), patch(
                "engineering_ai.urllib.request.build_opener") as opener:
            response = opener.return_value.open.return_value.__enter__.return_value
            response.read.return_value = json.dumps({"status": "completed", "output": [{
                "type": "message", "content": [{
                    "type": "output_text", "text": json.dumps(good())
                }]
            }]}).encode()
            generated = generate(payload)
            self.assertEqual(json.loads(generated)["schema"], "network-ai-claim-review-v1")
            request = opener.return_value.open.call_args.args[0]
            outgoing = json.loads(request.data)
            self.assertTrue(outgoing["text"]["format"]["strict"])
            self.assertNotIn("structured_claim_review", outgoing)
            self.assertEqual(request.full_url, "https://api.openai.com/v1/responses")

    def test_non_structured_existing_provider_calls_are_unchanged(self):
        env = {"AI_PROVIDER": "groq", "AI_ENABLED": "1", "AI_MODEL": "openai/gpt-oss-120b",
               "GROQ_API_KEY": "synthetic"}
        with patch.dict(os.environ, env, clear=True), patch(
                "engineering_ai.urllib.request.build_opener") as opener:
            response = opener.return_value.open.return_value.__enter__.return_value
            response.read.return_value = json.dumps({"choices": [{
                "finish_reason": "stop", "message": {"content": "Draft, not proof"}
            }]}).encode()
            generate(dict(model=env["AI_MODEL"], max_output_tokens=300, instructions="Review", input="CLI"))
            outbound = json.loads(opener.return_value.open.call_args.args[0].data)
            self.assertNotIn("response_format", outbound)


if __name__ == "__main__":
    unittest.main()
