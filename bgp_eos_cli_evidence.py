"""Read-only Arista EOS BGP summary extraction with strict evidence attribution."""
import ipaddress
import re

from bgp_diagnostic_rules import diagnose_neighbor

_COMMANDS = {"show ip bgp summary", "show bgp ipv4 unicast summary"}
_STATES = {"Idle", "Active", "Connect", "OpenSent", "OpenConfirm"}
_HEADER = "neighbor v as msgrcvd msgsent tblver inq outq up/down state/pfxrcd".split()
_HEADER_ALT = "neighbor v as msgrcvd msgsent inq outq up/down state/pfxrcd".split()


def eos_summary_rows(block):
    lines = block.get("text", "").splitlines()
    if len(lines) < 4 or not lines[0].startswith("Device: ") or not lines[1].startswith("Command: "):
        return []
    device = lines[0][8:].strip()
    command = lines[1][9:].strip().lower().removesuffix(" (continued)")
    if not device or device == "Unidentified" or command not in _COMMANDS:
        return []
    in_table = False
    rows = []
    for line in lines[2:]:
        match = re.fullmatch(r"L([1-9]\d*):\s*(.*)", line)
        if not match:
            return []
        line_no, raw = match.groups()
        cols = raw.split()
        if [part.lower() for part in cols] in (_HEADER, _HEADER_ALT):
            in_table = True
            continue
        if not in_table:
            continue
        if raw.lower().startswith(("total number of neighbors", "total number of peers")):
            break
        if len(cols) not in (9, 10) or cols[1] != "4" or not all(x.isascii() and x.isdecimal() for x in cols[2:-2]):
            return []
        try:
            peer = str(ipaddress.IPv4Address(cols[0]))
        except ValueError:
            return []
        state = cols[-1]
        if state not in _STATES and not (state.isascii() and state.isdecimal()):
            return []
        rows.append((device, command, peer, cols[2], state, block["id"], line_no))
    return rows


def eos_summary_text(blocks, language="en"):
    tr = language == "tr"
    reports = []
    for block in blocks:
        for device, command, peer, asn, state, evidence_id, line_no in eos_summary_rows(block):
            d = diagnose_neighbor(state, vendor="arista eos")
            label = "Alınan prefix" if tr else "Received prefixes"
            status = f"Established ({label}: {state})" if state.isdecimal() else state
            report = f"{device} · {peer} · AS {asn} · {status} [{evidence_id}, L{line_no}; {command}]"
            if d["hypotheses"]:
                report += ("\nOlası nedenler (doğrulanmadı): " if tr else "\nPossible causes (unverified): ") + "; ".join(d["hypotheses"])
            reports.append(report)
    return reports
