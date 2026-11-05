"""Curated, release-scoped manufacturer source metadata retrieval.

This is a versioned index of questions/URLs, NOT fetched document text or a
verified citation-to-claim RAG implementation. Source URLs are not opened by
the model backend, and relevance is not proof of platform applicability.
"""
from __future__ import annotations
import json
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

SOURCE_PATH = Path(__file__).resolve().parent / "knowledge" / "engineering_sources_v1.json"

@lru_cache(maxsize=1)
def catalog() -> dict:
    obj = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    if obj.get("schema") != "network-configurator-source-index-v1":
        raise ValueError("Invalid source index schema")
    seen = set()
    for item in obj.get("sources", []):
        uri = urlparse(item.get("url", ""))
        if (not item.get("id") or item["id"] in seen or
            uri.scheme != "https" or not uri.hostname or uri.username or
            uri.password or not item.get("releaseScope") or
            not item.get("questions") or not item.get("platforms")):
            raise ValueError("Invalid manufacturer source metadata")
        seen.add(item["id"])
    if not seen:
        raise ValueError("Empty manufacturer source index")
    return obj

_TECH_CONTEXT_PATTERNS = {
    "BGP": re.compile(r"(?i)\\bbgp\\b|\\bremote-as\\b|\\bpeer\\s+\\S+\\s+as-number\\b"),
    "OSPF": re.compile(r"(?i)\\bospf\\b|\\bexstart\\b|\\bexchange\\b(?=/|\\s|$)"),
    "EVPN": re.compile(r"(?i)\\bevpn\\b|\\bvxlan\\b|\\bvni\\b|\\bnve\\b|route-target|route[ -]?type\\s*[:= -]?\\s*[25]\\b"),
    "VPC": re.compile(r"(?i)\\bvpc\\b|\\bmlag\\b|peer-link|peer-gateway"),
    "SDWAN": re.compile(r"(?i)\\bsdwan\\b|\\bsd-wan\\b|health-check|\\bservice4\\b"),
    "STP": re.compile(r"(?i)\\bstp\\b|spanning-tree|\\bbpdu\\b|loop-guard|root-guard"),
}

def evidence_technologies(text: str) -> set[str]:
    """Recognize technologies using distinctive protocol context, not generic
    terms such as 'neighbor', 'peer', 'prefix' or 'active'. A multi-command
    show-tech may legitimately contain evidence for multiple technologies.
    """
    return {
        tech for tech, pattern in _TECH_CONTEXT_PATTERNS.items()
        if pattern.search(text)
    }


def retrieve_sources(evidence: list[dict], vendor: str, *, max_items: int = 5) -> list[dict]:
    """Select release-scoped source metadata only when evidence fits.

    Generic vendor='Mixed' alone never authorizes a Cisco/Arista/Fortinet guide.
    A named vendor in device-scoped evidence may extend the candidate platforms.
    """
    if max_items <= 0:
        return []
    doc = catalog()
    default_vendor = vendor.strip().lower() if vendor.strip().lower() not in {"mixed", "unknown", ""} else ""
    scored = {}
    for evidence_item in evidence:
        text = str(evidence_item.get("text", ""))
        # Source relevance is device/evidence scoped.  A 'Mixed' topology
        # cannot authorize Cisco guidance for an unrelated Arista BGP output.
        explicit_vendors = [
            m.group(1).strip().lower()
            for m in re.finditer(r"(?im)^Vendor:\s*([^\r\n]+)", text)
        ]
        vendors = explicit_vendors or ([default_vendor] if default_vendor else [])
        if not vendors:
            continue
        # Multiple vendor headings in one narrative are ambiguous; do not
        # transfer evidence or keyword hits across device boundaries.
        if len(set(vendors)) != 1:
            continue
        local_vendor = vendors[0]
        corpus = text.lower()
        technologies = evidence_technologies(text)
        for source in doc["sources"]:
            # Source metadata is relevant only when the supplied capture
            # actually establishes that protocol context. 'Neighbor' can
            # appear in BGP and OSPF and cannot authorize either alone.
            if source["technology"] not in technologies:
                continue
            if not any(alias.lower() in local_vendor for alias in source["platforms"]):
                continue
            hits = sum(
                bool(re.search(r"(?<![a-z])" + re.escape(word.lower()) + r"(?![a-z])", corpus))
                for word in source["keywords"]
            )
            if hits:
                previous = scored.get(source["id"])
                if previous is None or hits > previous[0]:
                    scored[source["id"]] = (hits, source)
    candidate = list(scored.values())
    candidate.sort(key=lambda result: (-result[0], result[1]["id"]))
    return [
        {
            "id": source["id"], "technology": source["technology"],
            "title": source["title"], "url": source["url"],
            "platforms": source["platforms"], "release_scope": source["releaseScope"],
            "questions": source["questions"],
            "provenance": "curated_metadata_not_fetched_text",
            "source_index_version": doc["version"],
        }
        for _, source in candidate[:min(max_items, 8)]
    ]
