"""Curated, versioned engineering questions for model retrieval.

This is a small local retrieval corpus backed by existing application modules.
It does not claim to fetch or quote external vendor documentation. Knowledge
describes *what to reason about*, never a rule that a particular CLI token must
exist. Vendor literature may be added with provenance in future iterations.
"""
from __future__ import annotations

import re

# Knowledge is declarative: no command-specific missing-token assertions.
_CATALOG = (
    {
        "id": "multi-chassis-redundancy",
        "title": "Multi-chassis L2 redundancy and forwarding",
        "platforms": ("Cisco NX-OS", "Arista EOS"),
        "terms": ("vpc", "mlag", "peer-link", "peer-keepalive", "port-channel"),
        "questions": (
            "What topology and failure domain is intended, and which peer roles are observed?",
            "How do peer reachability, independent health detection, and consistency checks interact?",
            "Does the spanning-tree and gateway-forwarding design match the redundancy intent?",
            "Do configuration evidence and operational forwarding observations contradict each other?",
            "Which observations from both peers would distinguish a fault from an expected state?",
        ),
        "origin": "simulation/vendor-failure-engine.mjs",
        "origin_kind": "existing_application_module",
    },
    {
        "id": "bgp-control-plane",
        "title": "BGP session and policy reasoning",
        "platforms": (),
        "terms": ("bgp", "neighbor", "route-map", "prefix-list", "as-path"),
        "questions": (
            "Distinguish configured BGP intent from the actual FSM session and prefix state.",
            "Correlate last-reset reasons, TCP reachability, authentication, address family, and policy evidence where available.",
            "Separate a session problem from route selection, import/export filtering, or a forwarding problem.",
            "What additional read-only observations discriminate between competing failure hypotheses?",
        ),
        "origin": "docs/bgp-troubleshooting-agent-v1.md",
        "origin_kind": "existing_application_module",
    },
    {
        "id": "evpn-control-and-data-plane",
        "title": "EVPN/VXLAN fabric behavior",
        "platforms": (),
        "terms": ("evpn", "vxlan", "nve", "vni", "route-target"),
        "questions": (
            "What is the underlay/overlay reachability model and expected tenant isolation?",
            "Do VNI, route import/export, next-hop, and endpoint observations agree?",
            "Which differences are design choices versus evidenced control-plane/data-plane faults?",
        ),
        "origin": "simulation/test_protocol_report.cjs",
        "origin_kind": "existing_application_module",
    },
    {
        "id": "stp-l2-topology",
        "title": "Spanning-tree topology and loop prevention",
        "platforms": (),
        "terms": ("spanning-tree", "stp", "bridge-id", "root bridge", "rstp"),
        "questions": (
            "Is the intended root placement evidenced for each VLAN or instance?",
            "Do port roles, physical links, redundant paths and reported topology changes agree?",
            "Is a blocked alternate port expected, or is there evidence of a disruptive inconsistency?",
        ),
        "origin": "test_stp_root_browser.mjs",
        "origin_kind": "existing_application_module",
    },
    {
        "id": "routing-and-management",
        "title": "Routing, interface state, and management security",
        "platforms": (),
        "terms": ("ospf", "static", "ip route", "interface", "acl", "snmp", "sdwan", "sd-wan"),
        "questions": (
            "Which management, routing, and forwarding dependencies are actually observable?",
            "Do configured static or dynamic routes match the operational RIB and interface states?",
            "Distinguish a security policy's presence from proof of traffic impact or external exposure.",
        ),
        "origin": "tac_overview.py",
        "origin_kind": "existing_application_module",
    },
)


def retrieve_knowledge(evidence: list[dict], vendor: str, *, max_items: int = 4) -> list[dict]:
    """Return relevant engineering dimensions with traceable repository origins."""
    corpus = "\n".join(item.get("text", "") for item in evidence).lower()
    selected = []
    for item in _CATALOG:
        if item["platforms"] and vendor not in item["platforms"]:
            continue
        hits = sum(bool(re.search(r"(?<![a-z])" + re.escape(term) + r"(?![a-z])", corpus)) for term in item["terms"])
        if hits:
            selected.append((hits, item))
    selected.sort(key=lambda pair: -pair[0])
    return [
        {key: val for key, val in entry.items() if key not in ("terms", "platforms")}
        for _, entry in selected[:max_items]
    ]
