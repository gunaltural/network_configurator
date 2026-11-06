"""Strict model claim review for independent AI Analysis.

Only exact CLI quotes are source-anchored. Competing hypotheses remain
unverified even if every reference points at a real CLI line.
"""
import json
import re
from typing import Any

SCHEMA = "network-ai-claim-review-v1"
_READ_ONLY = re.compile(r"^(?:show|display|get|diagnose)\s+\S+", re.I)
_CITATION_LINES = re.compile(r"^L([1-9]\d*):\s?(.*)$")

# These commands are report recommendations, not execution. Reject shell
# operators and state-changing diagnostic commands, not just bad prefixes.
_UNSAFE_TOKENS = re.compile(r"(?i)\b(?:clear|delete|reset|flush|enable|disable|kill|execute|"
                            r"shutdown|configure|conf|write|erase|reboot|format|stop|start|"
                            r"debug|set|unset|restore|factoryreset|tftp|scp|ftp)\b")
_SHELL_OPERATORS = re.compile(r"[;&|$\x60\\\r\n{}()\x00-\x1f]")
_PLACEHOLDER = re.compile(r"<[a-z][a-z0-9_-]{0,30}>", re.I)


def validate_readonly_command(command: str, vendor: str | None = None) -> str:
    command = _str(command, "verification command", 170)
    filtered = _PLACEHOLDER.sub("PEER", command)
    if (_SHELL_OPERATORS.search(filtered) or _UNSAFE_TOKENS.search(filtered)
            or "<" in filtered or ">" in filtered or "'" in filtered
            or '"' in filtered or "#" in filtered or not re.fullmatch(
                r"[A-Za-z0-9 _.:/\-]+", filtered)):
        raise ClaimReviewInvalid("Unsafe verification command syntax")
    low, platform = filtered.lower(), (vendor or "").lower()
    if not re.match(r"^(?:show|display|get|diagnose)\s+\S+", low):
        raise ClaimReviewInvalid("Command is not a read-only query")
    if "cisco" in platform or "arista" in platform:
        permitted = low.startswith("show ")
    elif "huawei" in platform:
        permitted = low.startswith("display ")
    elif "forti" in platform:
        permitted = low.startswith("get ") or low.startswith("diagnose ")
    else:
        permitted = True
    if not permitted:
        raise ClaimReviewInvalid("CLI syntax does not match supplied vendor")
    if low.startswith("diagnose "):
        allowed = (
            r"^diagnose sys sdwan (?:service4|member|health-check|intf|zone)(?:\s+\S+)*$",
            r"^diagnose vpn ike gateway list(?:\s+\S+)*$",
            r"^diagnose vpn tunnel list(?:\s+\S+)*$",
            r"^diagnose sys session list(?:\s+\S+)*$",
        )
        if not any(re.fullmatch(pattern, low) for pattern in allowed):
            raise ClaimReviewInvalid("Diagnostic action is not on the read-only allowlist")
    return command


_SENSITIVE = re.compile(r"(?i)(?:\bpassword\b|\bpasswd\b|\bsecret\b|\bprivate.key\b|\bauthorization\b|snmp[-\s]?server\s+community|pre-shared-key|set\s+psksecret|crypto\s+isakmp\s+key)")


class ClaimReviewInvalid(ValueError):
    pass


def _str(value: Any, name: str, max_len: int = 400) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > max_len:
        raise ClaimReviewInvalid("Invalid " + name)
    return value.strip()


def _arr(value: Any, name: str, minimum: int = 0, maximum: int = 5) -> list:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise ClaimReviewInvalid("Invalid " + name)
    return value


def _sources(evidence: list[dict]) -> dict:
    result = {}
    for item in evidence:
        key = item.get("id")
        if not isinstance(key, str) or key in result:
            raise ClaimReviewInvalid("Duplicate evidence ID")
        rows = {}
        for raw in item.get("text", "").splitlines():
            m = _CITATION_LINES.match(raw)
            if m:
                n = int(m.group(1))
                if n in rows:
                    raise ClaimReviewInvalid("Duplicate CLI line")
                rows[n] = m.group(2).strip()
        result[key] = rows
    return result


def _cite(citation: Any, lines: dict, with_quote: bool = False) -> dict:
    required = {"id", "line", "quote"} if with_quote else {"id", "line"}
    if not isinstance(citation, dict) or set(citation) != required:
        raise ClaimReviewInvalid("Invalid citation schema")
    eid, number = citation["id"], citation["line"]
    if not isinstance(eid, str) or type(number) is not int or number < 1:
        raise ClaimReviewInvalid("Invalid source coordinate")
    original = lines.get(eid, {}).get(number, "")
    if not original or original == "[REDACTED]" or _SENSITIVE.search(original):
        raise ClaimReviewInvalid("Missing or redacted cited line")
    if with_quote:
        quote = _str(citation["quote"], "CLI quotation", 220)
        if len(quote) < 8 or quote not in original or "[REDACTED]" in quote:
            raise ClaimReviewInvalid("Fabricated or nonverbatim observation")
        return {"id": eid, "line": number, "quote": quote, "sourceValidated": True}
    return {"id": eid, "line": number}


def validate_claim_review(response: str, evidence: list[dict], vendor: str | None = None) -> dict:
    """Validate references and exact quotes, NEVER certify engineering correctness."""
    if not isinstance(response, str) or len(response) > 18000:
        raise ClaimReviewInvalid("Invalid model output size")
    text = response.strip()
    fence = chr(96) * 3
    if text.startswith(fence):
        match = re.fullmatch(re.escape(fence) + r"(?:json)?\s*\n(.*?)\n" +
                             re.escape(fence), text, flags=re.S | re.I)
        if not match:
            raise ClaimReviewInvalid("Incomplete JSON fence")
        text = match.group(1)
    try:
        data = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise ClaimReviewInvalid("Model did not return valid JSON") from exc
    if not isinstance(data, dict) or set(data) != {"schema", "findings"} or data["schema"] != SCHEMA:
        raise ClaimReviewInvalid("Wrong structured review schema")
    source = _sources(evidence)
    findings = []
    technologies = {"BGP", "OSPF", "STP", "VPC", "EVPN", "SDWAN", "SYSTEM", "DCI"}
    for finding in _arr(data["findings"], "findings", 0, 3):
        if not isinstance(finding, dict) or set(finding) != {
            "technology", "observations", "hypotheses", "conditional_impact"
        } or finding["technology"] not in technologies:
            raise ClaimReviewInvalid("Unsupported finding")
        observations = [_cite(x, source, with_quote=True)
                        for x in _arr(finding["observations"], "observations", 1, 5)]
        available = {(c["id"], c["line"]) for c in observations}
        hypotheses = []
        for hypothesis in _arr(finding["hypotheses"], "hypotheses", 2, 4):
            required = {"statement", "supporting_citations", "potential_counterevidence",
                        "verification_command", "if_supported", "if_refuted"}
            if not isinstance(hypothesis, dict) or set(hypothesis) != required:
                raise ClaimReviewInvalid("Incomplete hypothesis")
            support = [_cite(x, source) for x in
                       _arr(hypothesis["supporting_citations"], "supporting citations")]
            contrary = [_cite(x, source) for x in
                        _arr(hypothesis["potential_counterevidence"], "counterevidence")]
            if any((x["id"], x["line"]) not in available for x in support + contrary):
                raise ClaimReviewInvalid("Unobserved reference in hypothesis")
            command = validate_readonly_command(hypothesis["verification_command"], vendor)
            hypotheses.append({
                "statement": _str(hypothesis["statement"], "hypothesis"),
                "supportingCitations": support, "potentialCounterevidence": contrary,
                "verificationCommand": command,
                "ifSupported": _str(hypothesis["if_supported"], "supporting outcome"),
                "ifRefuted": _str(hypothesis["if_refuted"], "refuting outcome"),
                "status": "UNVERIFIED_HYPOTHESIS"
            })
        if len({h["statement"].lower() for h in hypotheses}) != len(hypotheses):
            raise ClaimReviewInvalid("Hypotheses must be distinct")
        findings.append({
            "technology": finding["technology"], "observations": observations,
            "hypotheses": hypotheses,
            "conditionalImpact": _str(finding["conditional_impact"], "conditional impact"),
            "status": "SOURCE_ANCHORED_REVIEW_ONLY",
            "engineeringVerified": False, "rootCauseVerified": False,
        })
    return {"schema": SCHEMA, "findings": findings, "reviewRequired": True,
            "engineeringVerified": False, "rootCauseVerified": False,
            "claimReviewStatus": "SOURCE_QUOTES_VALIDATED_HYPOTHESES_UNVERIFIED",
            "limitations": [
                "Exact CLI quote and line existence are checked, not causal engineering claims.",
                "Competing explanations require read-only tests and peer/time corroboration.",
                "Device-supplied text or synthetic design intent is not proof of production state."
            ]}


def render_claim_review(review: dict, language: str) -> str:
    tr = language == "tr"
    parts = ["KAYNAKLI GÖZLEM — DOĞRULANMIŞ KÖK NEDEN DEĞİL" if tr else
             "SOURCE-ANCHORED OBSERVATION — ROOT CAUSE UNVERIFIED"]
    for finding in review["findings"]:
        parts.append("\n## " + finding["technology"])
        for obs in finding["observations"]:
            parts.append(("CLI alıntısı: " if tr else "CLI quote: ") + obs["quote"] +
                         " [" + obs["id"] + ", L" + str(obs["line"]) + "]")
        parts.append("Sınanacak hipotezler:" if tr else "Competing hypotheses:")
        for item in finding["hypotheses"]:
            parts.append("- " + item["statement"] + " | " + item["verificationCommand"])
            parts.append(("Destekleyecek sonuç: " if tr else "Would support: ") + item["ifSupported"])
            parts.append(("Zayıflatacak sonuç: " if tr else "Would refute: ") + item["ifRefuted"])
        parts.append(("Koşullu risk: " if tr else "Conditional impact: ") + finding["conditionalImpact"])
    parts.append("Mühendis onayı gerekiyor; doğrulanmış teşhis değildir." if tr else
                 "Engineer review required; not a verified diagnosis.")
    return "\n".join(parts)
