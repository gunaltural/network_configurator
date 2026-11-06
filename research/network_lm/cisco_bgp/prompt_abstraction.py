"""BGP research-only identity normalization without deciding route outcomes.

ASN and owned-prefix identity do NOT determine the simplified simulator's
binary link availability. CE versus ISP roles and every failure, Local
Preference, prepend, gateway preference and requested outcome are retained.
This is prompt abstraction, not an inference engine or live CLI parser.
"""
from dataclasses import replace
import re


_ASN = re.compile(r"\b(CE1|CE2|ISP1|ISP2)-AS([0-9]{1,10})\b")
_OWNER = re.compile(
    r"(?<=owns prefix )"
    r"(?:[0-9]{1,3}\.){3}[0-9]{1,3}/(?:[0-9]|[12][0-9]|3[0-2])"
)
_AS_MAP = {
    "CE1": "CE_AS", "CE2": "CE_AS",
    "ISP1": "UPSTREAM1_AS", "ISP2": "UPSTREAM2_AS",
}


def abstract_prompt(prompt):
    if not isinstance(prompt, str) or not prompt:
        raise ValueError("Expected an original BGP research prompt")
    if "Synthetic 2CE/2ISP BGP Design scenario." not in prompt:
        # Project-owned freeform Design knowledge is not in the 2CE schema
        # and must remain untouched by this specific normalizer.
        return prompt
    identifiers = _ASN.findall(prompt)
    if len(identifiers) != 4 or [name for name, _ in identifiers] != [
        "CE1", "ISP1", "CE2", "ISP2"
    ]:
        # The actual source text orders CE1, ISP1, CE2, ISP2.
        raise ValueError("Unexpected 2CE/2ISP BGP source schema")
    if identifiers[0][1] != identifiers[2][1]:
        raise ValueError("Both CEs must share one internal AS in this model")
    owner_matches = _OWNER.findall(prompt)
    if len(owner_matches) != 1:
        raise ValueError("Expected exactly one CE-owned original prefix")
    normalized = _ASN.sub(
        lambda m: m.group(1) + "-AS_" + _AS_MAP[m.group(1)],
        prompt,
    )
    normalized = _OWNER.sub("OWNED_IPV4_PREFIX", normalized)
    # Do not touch failure status, policy numbers or requested answers.
    if "Failed devices:" not in normalized or "Failed links:" not in normalized:
        raise ValueError("Missing explicit BGP simulation failures")
    return normalized


def abstract_examples(rows):
    return [replace(example, prompt=abstract_prompt(example.prompt))
            for example in rows]
