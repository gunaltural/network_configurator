"""Provider JSON schema for independently reviewed network engineering hypotheses.

Output formatting helps completion, NOT truth. The independent exact-source
validator in ai_model_claim_review.py is still mandatory and fail-closed.
"""
from copy import deepcopy

def _obj(properties):
    return {
        "type": "object", "properties": properties,
        "required": list(properties), "additionalProperties": False,
    }

_CITATION = _obj({
    "id": {"type": "string"},
    "line": {"type": "integer"},
})
_OBSERVATION = _obj({
    "id": {"type": "string"},
    "line": {"type": "integer"},
    "quote": {"type": "string"},
})
_HYPOTHESIS = _obj({
    "statement": {"type": "string"},
    "supporting_citations": {"type": "array", "items": _CITATION},
    "potential_counterevidence": {"type": "array", "items": _CITATION},
    "verification_command": {"type": "string"},
    "if_supported": {"type": "string"},
    "if_refuted": {"type": "string"},
})
_FINDING = _obj({
    "technology": {
        "type": "string",
        "enum": ["BGP", "OSPF", "STP", "VPC", "EVPN", "SDWAN", "SYSTEM", "DCI"]
    },
    "observations": {"type": "array", "items": _OBSERVATION},
    "hypotheses": {"type": "array", "items": _HYPOTHESIS},
    "conditional_impact": {"type": "string"},
})
CLAIM_REVIEW_SCHEMA = _obj({
    "schema": {"type": "string", "enum": ["network-ai-claim-review-v1"]},
    "findings": {"type": "array", "items": _FINDING},
})

# Currently documented strict-mode Groq models. If model support changes,
# use fail-closed evidence-only fallback rather than silently downgrade.
GROQ_STRICT_MODELS = frozenset({
    "openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b",
})


def has_structured_output_support(provider, model, local_profile=None):
    if provider == "openai":
        return True  # Account/model must still accept the Responses API request.
    if provider == "groq":
        return model in GROQ_STRICT_MODELS
    return provider == "local" and local_profile == "full"


def add_structured_response_format(payload, provider):
    """Build a new provider-specific request; do not mutate the caller's data."""
    request = dict(payload)
    schema = deepcopy(CLAIM_REVIEW_SCHEMA)
    if provider == "groq":
        if request.get("model") not in GROQ_STRICT_MODELS:
            raise ValueError("Groq model is not on the documented strict-schema allowlist")
        request["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "network_ai_claim_review", "strict": True, "schema": schema},
        }
    elif provider == "openai":
        request["text"] = {
            "format": {"type": "json_schema", "name": "network_ai_claim_review",
                       "strict": True, "schema": schema},
        }
    elif provider == "local":
        # llama.cpp /v1/chat/completions accepts this native schema-constrained
        # response format. It constrains syntax, not engineering correctness.
        request["response_format"] = {"type": "json_schema", "schema": schema}
    else:
        raise ValueError("Structured provider format is unsupported")
    return request
