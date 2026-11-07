"""Research-only peer/prefix identity abstraction, NOT diagnosis or inference.

Preserves *which* peer is target, which peer is unrelated, whether a prefix
is the target, whether a next-hop has a route, received prefix counts,
BGP FSM, shutdown state and actual CLI evidence. Only the literal synthetic
names/addresses are standardized within the same rendered observation.
Never use this to strip identifiers from real IOS-XE evidence automatically.
"""
from dataclasses import replace
import re

from .multicli_curriculum import MultiCliExample

_PEER = re.compile(r"(?m)^TARGET_NEIGHBOR=(192\.0\.2\.([0-9]{1,3}))$")
_PREFIX = re.compile(r"(?m)^TARGET_PREFIX=(10\.[0-9]{1,3}\.1\.0/24)$")


def abstract_cli(prompt):
    if not isinstance(prompt, str) or not prompt:
        raise ValueError("Missing synthetic Cisco BGP CLI evidence")
    peer = _PEER.search(prompt)
    prefix = _PREFIX.search(prompt)
    if peer is None or prefix is None:
        raise ValueError("Expected target peer and prefix within synthetic test subnet")
    literal_peer, octet = peer.group(1), peer.group(2)
    literal_other = "198.51.100." + octet
    literal_next_hop = "203.0.113." + octet
    replacement = {
        literal_peer: "PEER_TARGET",
        literal_other: "PEER_DISTRACTOR",
        literal_next_hop: "TARGET_NEXT_HOP",
        prefix.group(1): "TARGET_IPV4_PREFIX",
    }
    for old, new in sorted(replacement.items(), key=lambda pair: -len(pair[0])):
        prompt = prompt.replace(old, new)
    # Remote ASN appears as a standalone field or remote-as. Do not alter
    # Cisco's unchanged local AS 65010.
    prompt = re.sub(r"\b645(?:[1-8][0-9]|9[0-3])\b", "AS_REMOTE", prompt)
    if (prompt.count("PEER_TARGET") < 1
            or "TARGET_NEIGHBOR=PEER_TARGET" not in prompt
            or "TARGET_PREFIX=TARGET_IPV4_PREFIX" not in prompt
            or "192.0.2." in prompt
            or literal_next_hop in prompt):
        raise ValueError("Synthetic peer identity was not fully normalized")
    return prompt


def abstract_record(record):
    if not isinstance(record, MultiCliExample):
        raise TypeError("Expected original synthetic BGP evidence record")
    return replace(record, example=replace(
        record.example, prompt=abstract_cli(record.example.prompt)
    ))
