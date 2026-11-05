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
        for source in doc["sources"]:
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
