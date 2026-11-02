"""Conservative Cisco IPv4 BGP per-prefix CLI evidence extraction.

Only positive presence is inferred from a matching route row. Missing rows never
establish absence because captures may be truncated, filtered or incomplete.
"""
import ipaddress
import re

from bgp_route_diagnostic_rules import diagnose_route

_ROUTE = re.compile(r"^(?:[*>sdhrS ]{1,5})?\s*(\d{1,3}(?:\.\d{1,3}){3}/\d{1,2})\s+(\d{1,3}(?:\.\d{1,3}){3})\b")
_COMMAND = re.compile(
    r"show (?:ip bgp|bgp ipv4 unicast)"
    r"(?: neighbors? (\d{1,3}(?:\.\d{1,3}){3}) (advertised-routes|routes))?"
    r"(?: (\d{1,3}(?:\.\d{1,3}){3}/\d{1,2}))?$", re.I
)


def extract_route_evidence(blocks):
    """Return evidence keyed by (device, peer or None, prefix)."""
    found = {}
    for block in blocks:
        lines = block["text"].splitlines()
        if len(lines) < 3 or not lines[0].startswith("Device: ") or not lines[1].startswith("Command: "):
            continue
        device = lines[0][8:].strip()
        command = lines[1][9:].strip().removesuffix(" (continued)")
        match = _COMMAND.fullmatch(command)
        if not match:
            continue
        peer, kind, requested_prefix = match.groups()
        if peer:
            try:
                peer = str(ipaddress.IPv4Address(peer))
            except ValueError:
                continue
        for line in lines[2:]:
            m = re.fullmatch(r"L([1-9]\d*):\s*(.*)", line)
            if not m:
                continue
            line_no, raw = m.groups()
            route = _ROUTE.match(raw)
            if not route:
                continue
            try:
                prefix = str(ipaddress.IPv4Network(route[1], strict=False))
                next_hop = str(ipaddress.IPv4Address(route[2]))
            except ValueError:
                continue
            if requested_prefix and prefix != requested_prefix:
                continue
            key = (device, peer, prefix)
            entry = found.setdefault(key, {"device": device, "peer": peer, "prefix": prefix, "observations": {}, "references": []})
            property_name = "prefix_advertised" if kind == "advertised-routes" else "prefix_received" if kind == "routes" else "prefix_in_local_bgp"
            entry["observations"][property_name] = True
            entry["references"].append(f'{block["id"]}, L{line_no}; {command}')
            entry.setdefault("next_hops", []).append(next_hop)
    return list(found.values())


def route_diagnostic_text(blocks, language="en"):
    """Report positive route observations without guessing missing-route failures."""
    tr = language == "tr"
    reports = []
    for item in extract_route_evidence(blocks):
        diagnosis = diagnose_route(**item["observations"])
        observed = ", ".join(k + "=true" for k in item["observations"])
        prefix = item["prefix"]
        peer = item["peer"] or ("yerel BGP tablosu" if tr else "local BGP table")
        report = f'{item["device"]} · {prefix} · {peer}: {observed} [{", ".join(item["references"])}]'
        if diagnosis["hypotheses"]:
            report += ("\nOlası nedenler (doğrulanmadı): " if tr else "\nPossible causes (unverified): ") + "; ".join(diagnosis["hypotheses"])
        reports.append(report)
    return reports
