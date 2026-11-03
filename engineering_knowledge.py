"""Curated, versioned engineering questions for model retrieval.

This is a small local retrieval corpus backed by existing application modules
and explicitly attributed manufacturer engineering guidance. No live retrieval
or full-document ingestion is claimed. Knowledge
describes *what to reason about*, never a rule that a particular CLI token must
exist. Vendor literature must carry a source URI and release applicability.
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
        "id": "cisco-nxos-vpc-design",
        "title": "Cisco Nexus 9000 vPC STP root and gateway forwarding design",
        "platforms": ("Cisco NX-OS",),
        "terms": ("vpc", "peer-link", "peer-keepalive", "peer-switch", "peer-gateway"),
        "questions": (
            "Cisco peer-switch is a design option allowing both vPC peers to appear as one STP root; evaluate need using the intended STP root placement and both peers' bridge priorities, rather than treating its absence as proof of a fault.",
            "Cisco peer-gateway is a forwarding optimization for packets addressed to a peer's router MAC; compare running-config scope with reported operational Peer Gateway state before deciding whether it is active or missing.",
            "Check platform release and feature prerequisites; absence of configuration is not proof a capability is unavailable or disabled.",
        ),
        "origin": "Cisco Nexus 9000 NX-OS Interfaces Configuration Guide 10.2(x), Configuring vPCs",
        "origin_kind": "manufacturer_documentation",
        "source_uri": "https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/102x/configuration/interfaces/cisco-nexus-9000-nx-os-interfaces-configuration-guide-102x.pdf",
        "release_scope": "Nexus 9000 NX-OS 10.2(x); verify device platform/release",
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
    # A topology workspace may contain multiple vendors; retrieve platform
    # guidance only when an explicit vendor field in the supplied evidence
    # identifies it. The string is a retrieval hint, not verified device fact.
    platforms = {vendor}
    named = {platform for entry in _CATALOG for platform in entry["platforms"]}
    for observed in evidence:
        for line in observed.get("text", "").splitlines():
            if re.search(r"(?i)(?:^Vendor:\\s*|\\bvendor=)", line):
                platforms.update(p for p in named if p.lower() in line.lower())
    for item in _CATALOG:
        if item["platforms"] and not platforms.intersection(item["platforms"]):
            continue
        hits = sum(bool(re.search(r"(?<![a-z])" + re.escape(term) + r"(?![a-z])", corpus)) for term in item["terms"])
        if hits:
            selected.append((hits, item))
    selected.sort(key=lambda pair: -pair[0])
    return [
        {key: val for key, val in entry.items() if key not in ("terms", "platforms")}
        for _, entry in selected[:max_items]
    ]
