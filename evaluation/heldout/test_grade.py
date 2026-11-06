"""Isolated audit tests with deliberately misleading model results."""
import unittest
from evaluation.heldout.grade import grade_response

EVIDENCE = [
    {"id": "cli-1-0", "text": "L4: 192.0.2.2 4 65002 never Idle (Admin)"},
    {"id": "cli-2-1", "text": "L7: Peer-link status : Up"},
]
RULES = {
    "must_mention": ["idle", "admin"],
    "minimum_line_citations": 2,
    "minimum_distinct_evidence_ids": 2,
    "must_not_claim": ["tcp failure confirmed"],
}


def model(text, **extra):
    return {"mode": "model-evidence-cited-draft", "text": text, **extra}


class HeldOutAuditTests(unittest.TestCase):
    def test_duplicate_citation_does_not_fake_coverage(self):
        result = grade_response(200, model(
            "Idle Admin [cli-1-0, L4] [cli-1-0, L4]"),
            EVIDENCE, RULES)
        self.assertFalse(result["passed"])
        self.assertEqual(result["valid_citation_count"], 1)
        self.assertIn("INSUFFICIENT_EVIDENCE_DIVERSITY", result["failure_categories"])
        self.assertIn("SOURCE_CITATION_FAILURE", result["failure_categories"])

    def test_all_cases_are_source_checked_without_answer_key_to_model(self):
        result = grade_response(200, model(
            "Idle Admin [cli-1-0, L4] peer-link Up [cli-2-1, L7]"),
            EVIDENCE, RULES)
        self.assertTrue(result["passed"])
        self.assertEqual(result["valid_citation_count"], 2)

    def test_invented_and_disallowed_claims_fail(self):
        result = grade_response(200, model(
            "Idle Admin; TCP failure confirmed [cli-1-0, L88] "
            "peer link [cli-2-1, L7]"), EVIDENCE, RULES)
        self.assertFalse(result["passed"])
        self.assertIn("UNSUPPORTED_CLAIM", result["failure_categories"])
        self.assertIn("cli-1-0:L88", result["invalid_citations"])

    def test_fallback_and_empty_structured_findings_are_not_success(self):
        output = "Idle Admin [cli-1-0, L4] [cli-2-1, L7]"
        fallback = grade_response(200, {
            "text": output, "mode": "evidence-only-no-model-findings",
        }, EVIDENCE, RULES)
        self.assertFalse(fallback["passed"])
        empty = grade_response(200, model(
            output, claimReviewStatus="NO_SOURCE_ANCHORED_FINDINGS",
            claimReview={"engineeringVerified": False, "findings": []}),
            EVIDENCE, RULES, structured=True)
        self.assertFalse(empty["passed"])
        self.assertIn("NO_ACCEPTED_MODEL_REVIEW", empty["failure_categories"])

    def test_positive_structured_citation_contract_still_needs_engineer(self):
        output = "Idle Admin [cli-1-0, L4] peer-link Up [cli-2-1, L7]"
        result = grade_response(200, model(
            output, claimReviewStatus="SOURCE_QUOTES_VALIDATED_HYPOTHESES_UNVERIFIED",
            claimReview={"engineeringVerified": False, "findings": [{"technology": "BGP"}]}),
            EVIDENCE, RULES, structured=True)
        self.assertTrue(result["passed"])
        self.assertTrue(result["structured_requested"])


if __name__ == "__main__":
    unittest.main()
