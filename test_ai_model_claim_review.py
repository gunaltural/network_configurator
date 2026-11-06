"""Adversarial structured hypothesis gate for independent AI Analysis only."""
import copy
import json
import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_model_claim_review import (
    SCHEMA, ClaimReviewInvalid, validate_claim_review, render_claim_review
)
from engineering_ai import install_engineering_ai

EVIDENCE = [{
    "id": "ce-bgp",
    "text": (
        "Device: CE1\nCommand: show ip bgp summary\n"
        "L3: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n"
        "L4: 192.0.2.2 4 65002 0 0 0 0 0 never Idle\n"
        "L5: username admin secret PASSWORD_MUST_NOT_LEAK"
    )
}]


def good():
    return {
        "schema": SCHEMA,
        "findings": [{
            "technology": "BGP",
            "observations": [{
                "id": "ce-bgp", "line": 4,
                "quote": "192.0.2.2 4 65002 0 0 0 0 0 never Idle"
            }],
            "hypotheses": [{
                "statement": "TCP transport or reachability may prevent establishment",
                "supporting_citations": [{"id": "ce-bgp", "line": 4}],
                "potential_counterevidence": [],
                "verification_command": "show ip bgp neighbors 192.0.2.2",
                "if_supported": "Neighbor reports failed transport attempts",
                "if_refuted": "Successful TCP transport is observed"
            }, {
                "statement": "Local or remote peer configuration may be inconsistent",
                "supporting_citations": [],
                "potential_counterevidence": [],
                "verification_command": "show running-config",
                "if_supported": "Peer address or neighbor AS settings differ from intended values",
                "if_refuted": "Both peers match intended addressing and ASN"
            }],
            "conditional_impact": "If this is an intended active peer, route exchange may be impaired."
        }]
    }


class ClaimReviewTests(unittest.TestCase):
    def test_genuine_line_and_two_alternatives_are_source_anchored_not_diagnosed(self):
        result = validate_claim_review(json.dumps(good()), EVIDENCE)
        self.assertEqual(result["claimReviewStatus"], "SOURCE_QUOTES_VALIDATED_HYPOTHESES_UNVERIFIED")
        self.assertTrue(result["findings"][0]["observations"][0]["sourceValidated"])
        self.assertFalse(result["engineeringVerified"])
        self.assertFalse(result["rootCauseVerified"])
        self.assertTrue(all(h["status"] == "UNVERIFIED_HYPOTHESIS"
                            for h in result["findings"][0]["hypotheses"]))
        self.assertIn("[ce-bgp, L4]", render_claim_review(result, "en"))
        self.assertIn("KÖK NEDEN", render_claim_review(result, "tr"))

    def test_empty_structured_response_is_abstention_not_accepted_analysis(self):
        empty = {"schema": SCHEMA, "findings": []}
        validated = validate_claim_review(json.dumps(empty), EVIDENCE)
        self.assertEqual(validated["claimReviewStatus"], "NO_SOURCE_ANCHORED_FINDINGS")
        self.assertFalse(validated["engineeringVerified"])
        self.assertFalse(validated["rootCauseVerified"])
        self.assertIn("does not establish network health",
                      render_claim_review(validated, "en"))

        app = FastAPI()
        install_engineering_ai(app)
        client = TestClient(app)
        env = {"AI_PROVIDER": "openai", "AI_MODEL": "synthetic",
               "AI_ENABLED": "1", "OPENAI_API_KEY": "synthetic"}
        with patch.dict(os.environ, env, clear=True), patch(
                "engineering_ai.generate", return_value=json.dumps(empty)):
            for language, expected in [
                ("en", "does not demonstrate network health"),
                ("tr", "ağın sağlıklı olduğunu göstermez"),
            ]:
                response = client.post("/api/ai/analyze", json={
                    "module": "CLI_ANALYSIS", "vendor": "Cisco IOS-XE",
                    "language": language, "task": "report",
                    "evidence": EVIDENCE, "reviewFormat": "evidence-claims-v1"
                })
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["mode"], "evidence-only-no-model-findings")
                self.assertEqual(data["claimReviewStatus"], "NO_SOURCE_ANCHORED_FINDINGS")
                self.assertEqual(data["evidenceIds"], [])
                self.assertFalse(data["engineeringVerified"])
                self.assertTrue(data["reviewRequired"])
                self.assertIn(expected, data["text"])
                self.assertNotIn("PASSWORD_MUST_NOT_LEAK", data["text"])

    def test_adversarial_rejections(self):
        def reject(change):
            data = good()
            change(data["findings"][0])
            with self.assertRaises(ClaimReviewInvalid):
                validate_claim_review(json.dumps(data), EVIDENCE)

        reject(lambda f: f["observations"][0].update(quote="BGP Established confirmed"))
        reject(lambda f: f["observations"][0].update(line=93))
        reject(lambda f: f["observations"][0].update(id="unknown"))
        reject(lambda f: f["observations"][0].update(quote="Idle"))
        reject(lambda f: f["observations"][0].update(line=5, quote="username admin secret"))
        reject(lambda f: f["hypotheses"].pop())
        reject(lambda f: f["hypotheses"][1].update(statement=f["hypotheses"][0]["statement"]))
        reject(lambda f: f["hypotheses"][0].update(
            supporting_citations=[{"id": "ce-bgp", "line": 3}]))
        reject(lambda f: f["hypotheses"][0].update(
            potential_counterevidence=[{"id": "ce-bgp", "line": 99}]))
        reject(lambda f: f["hypotheses"][0].update(verification_command="configure terminal"))
        reject(lambda f: f["hypotheses"][0].update(verification_command="show ip bgp; delete all"))
        reject(lambda f: f["hypotheses"][0].update(verification_command="show ip bgp | redirect tftp"))
        reject(lambda f: f["hypotheses"][0].update(if_refuted=""))
        reject(lambda f: f.update(compliancePass=True))
        reject(lambda f: f.update(technology="UNSUPPORTED"))
        with self.assertRaises(ClaimReviewInvalid):
            validate_claim_review(json.dumps(good())[:-12], EVIDENCE)

    def test_vendor_aware_readonly_commands_and_diagnostic_safety(self):
        from ai_model_claim_review import validate_readonly_command
        valid = [
            ("show ip bgp neighbors <peer>", "Cisco IOS-XE"),
            ("show bgp l2vpn evpn", "Cisco NX-OS"),
            ("show mlag", "Arista EOS"),
            ("display bgp peer", "Huawei CloudEngine VRP8"),
            ("get router info bgp summary", "FortiGate FortiOS 7.4"),
            ("diagnose sys sdwan health-check", "FortiGate FortiOS 7.4"),
            ("diagnose sys sdwan service4", "FortiGate FortiOS 7.4"),
            ("diagnose vpn ike gateway list", "FortiGate FortiOS 7.4"),
        ]
        for command, vendor in valid:
            with self.subTest(command=command, vendor=vendor):
                self.assertEqual(validate_readonly_command(command, vendor), command)
        invalid = [
            ("show ip bgp > /tmp/output", "Cisco IOS-XE"),
            ("show ip bgp && configure terminal", "Cisco IOS-XE"),
            ("show ip route <peer> > file", "Cisco IOS-XE"),
            ("show ip route $(rm -rf /)", "Cisco IOS-XE"),
            ("display bgp peer", "Cisco NX-OS"),
            ("show bgp summary", "Huawei CloudEngine VRP8"),
            ("show ip route", "FortiGate FortiOS"),
            ("diagnose sys session clear", "FortiGate FortiOS"),
            ("diagnose debug enable", "FortiGate FortiOS"),
            ("diagnose sys sdwan member clear", "FortiGate FortiOS"),
            ("diagnose sys sdwan service4 | grep down", "FortiGate FortiOS"),
        ]
        for command, vendor in invalid:
            with self.subTest(command=command, vendor=vendor):
                with self.assertRaises(ClaimReviewInvalid):
                    validate_readonly_command(command, vendor)

        draft = good()
        draft["findings"][0]["hypotheses"][0]["verification_command"] = "display bgp peer"
        with self.assertRaises(ClaimReviewInvalid):
            validate_claim_review(json.dumps(draft), EVIDENCE, vendor="Cisco IOS-XE")
        draft["findings"][0]["hypotheses"][0]["verification_command"] = "show ip bgp summary"
        self.assertFalse(validate_claim_review(json.dumps(draft), EVIDENCE,
                                               vendor="Cisco IOS-XE")["engineeringVerified"])

    def test_redacted_original_line_is_not_usable_as_observation(self):
        sample = copy.deepcopy(EVIDENCE)
        sample[0]["text"] = sample[0]["text"].replace(
            "L4: 192.0.2.2 4 65002 0 0 0 0 0 never Idle", "L4: [REDACTED]")
        with self.assertRaises(ClaimReviewInvalid):
            validate_claim_review(json.dumps(good()), sample)

    def test_api_opt_in_accepts_only_quote_matched_hypotheses(self):
        app = FastAPI()
        install_engineering_ai(app)
        client = TestClient(app)
        body = {"module": "CLI_ANALYSIS", "vendor": "Cisco IOS-XE",
                "language": "en", "task": "report", "evidence": EVIDENCE,
                "reviewFormat": "evidence-claims-v1"}
        env = {"AI_PROVIDER": "openai", "AI_MODEL": "synthetic",
               "AI_ENABLED": "1", "OPENAI_API_KEY": "synthetic"}
        with patch.dict(os.environ, env, clear=True), patch(
                "engineering_ai.generate", return_value=json.dumps(good())) as generate:
            self.assertTrue(client.get("/api/ai/status").json()["structuredClaimsSupported"])
            response = client.post("/api/ai/analyze", json=body)
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["mode"], "model-evidence-cited-draft")
            self.assertEqual(data["claimReviewStatus"], "SOURCE_QUOTES_VALIDATED_HYPOTHESES_UNVERIFIED")
            self.assertFalse(data["engineeringVerified"])
            self.assertIn("Competing hypotheses", data["text"])
            self.assertNotIn("PASSWORD_MUST_NOT_LEAK", generate.call_args.args[0]["input"])
            self.assertIn("network-ai-claim-review-v1", generate.call_args.args[0]["instructions"])

        for mutant in [
            '{"schema":"network-ai-claim-review-v1","findings":[}',
            json.dumps({**good(), "findings": [{
                **good()["findings"][0],
                "observations": [{"id": "ce-bgp", "line": 4,
                                   "quote": "BGP established with 1200 prefixes"}]
            }]}),
            "CLI observation is definitely Established [ce-bgp, L4]."
        ]:
            with patch.dict(os.environ, env, clear=True), patch(
                    "engineering_ai.generate", return_value=mutant):
                data = client.post("/api/ai/analyze", json=body).json()
                self.assertEqual(data["mode"], "model-unverified-draft")
                self.assertEqual(data["claimReviewStatus"], "REJECTED_UNBOUND_MODEL_CLAIMS")
                self.assertFalse(data["engineeringVerified"])
                self.assertNotIn("definitely Established", data["text"])
                self.assertNotIn("PASSWORD_MUST_NOT_LEAK", data["text"])

    def test_compact_local_model_does_not_advertise_structured_acceptance(self):
        app = FastAPI()
        install_engineering_ai(app)
        client = TestClient(app)
        env = {"AI_PROVIDER": "local", "AI_ENABLED": "1",
               "AI_MODEL": "tiny", "AI_BASE_URL": "http://127.0.0.1:18081/v1"}
        with patch.dict(os.environ, env, clear=True), patch("engineering_ai.generate") as model:
            self.assertFalse(client.get("/api/ai/status").json()["structuredClaimsSupported"])
            response = client.post("/api/ai/analyze", json={
                "module": "CLI_ANALYSIS", "vendor": "Cisco IOS-XE",
                "language": "en", "task": "report", "evidence": EVIDENCE,
                "reviewFormat": "evidence-claims-v1"
            })
            self.assertEqual(response.status_code, 422)
            model.assert_not_called()


if __name__ == "__main__":
    unittest.main()
