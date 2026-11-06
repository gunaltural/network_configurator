"""Blind held-out response audit; rubric never sent to the model.

This verifies observable output, evidence references and forbidden claims, not
semantic truth or expert-level network engineering correctness.
"""
import re

CITATION = re.compile(r"\[([A-Za-z0-9][A-Za-z0-9_.:-]{0,79}),\s*L([1-9][0-9]*)\]", re.I)


def grade_response(response_status, body, evidence, rules, *, structured=False):
    output = str(body.get("text") or "").lower()
    missing = [term for term in rules.get("must_mention", []) if term.lower() not in output]
    missing_any = [group for group in rules.get("must_mention_any", [])
                   if not any(term.lower() in output for term in group)]
    unsupported = [term for term in rules.get("must_not_claim", [])
                   if term.lower() in output]
    available = {str(item["id"]).lower(): {
        int(n) for n in re.findall(r"(?m)^L(\d+):", item.get("text", ""))
    } for item in evidence}
    references = [(eid.lower(), int(n)) for eid, n in CITATION.findall(str(body.get("text") or ""))]
    valid = {(eid, n) for eid, n in references if n in available.get(eid, set())}
    invalid = sorted({f"{eid}:L{n}" for eid, n in references
                      if n not in available.get(eid, set())})
    claim_review = body.get("claimReview") or {}
    accepted_mode = body.get("mode") == "model-evidence-cited-draft"
    if structured:
        accepted_mode = (accepted_mode and
                         body.get("claimReviewStatus") == "SOURCE_QUOTES_VALIDATED_HYPOTHESES_UNVERIFIED" and
                         isinstance(claim_review.get("findings"), list) and
                         len(claim_review["findings"]) > 0 and
                         claim_review.get("engineeringVerified") is False)
    failures = []
    if response_status != 200:
        failures.append("API_FAILURE")
    if not accepted_mode:
        failures.append("NO_ACCEPTED_MODEL_REVIEW")
    if missing or missing_any:
        failures.append("EXPECTED_OBSERVATION_MISSING")
    if unsupported:
        failures.append("UNSUPPORTED_CLAIM")
    if len(valid) < rules.get("minimum_line_citations", 0) or invalid:
        failures.append("SOURCE_CITATION_FAILURE")
    if len({eid for eid, _ in valid}) < rules.get("minimum_distinct_evidence_ids", 0):
        failures.append("INSUFFICIENT_EVIDENCE_DIVERSITY")
    return {
        "passed": not failures,
        "failure_categories": failures,
        "missing_terms": missing,
        "missing_any_groups": missing_any,
        "unsupported_claims": unsupported,
        "valid_citation_count": len(valid),
        "distinct_evidence_ids": len({eid for eid, _ in valid}),
        "expected_minimum_distinct": rules.get("minimum_distinct_evidence_ids", 0),
        "invalid_citations": invalid,
        "expected_minimum": rules.get("minimum_line_citations", 0),
        "mode": body.get("mode"),
        "claimReviewStatus": body.get("claimReviewStatus"),
        "structured_requested": structured,
    }
