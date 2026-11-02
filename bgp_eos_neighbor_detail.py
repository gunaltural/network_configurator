"""Strict, read-only extraction of explicitly reported Arista BGP neighbor details."""
import ipaddress
import re

_COMMAND = re.compile(r"show (?:ip bgp|bgp ipv4 unicast) neighbors? (\d{1,3}(?:\.\d{1,3}){3})(?: detail)?$", re.I)
_REMOTE_AS = re.compile(r"\bremote AS\s+(\d{1,10})\b", re.I)
_STATE = re.compile(r"\bBGP state is\s+(Idle|Active|Connect|OpenSent|OpenConfirm|Established)\b", re.I)


def eos_neighbor_details(blocks):
    """Return only positively observed state/AS evidence; never infer from absence."""
    results = []
    for block in blocks:
        lines = block.get("text", "").splitlines()
        if len(lines) < 3 or not lines[0].startswith("Device: ") or not lines[1].startswith("Command: "):
            continue
        device = lines[0][8:].strip()
        cmd = lines[1][9:].strip().removesuffix(" (continued)")
        match = _COMMAND.fullmatch(cmd)
        if not device or device == "Unidentified" or not match:
            continue
        try:
            peer = str(ipaddress.IPv4Address(match.group(1)))
        except ValueError:
            continue
        for row in lines[2:]:
            m = re.fullmatch(r"L([1-9]\d*):\s*(.*)", row)
            if not m:
                continue
            line_no, raw = m.groups()
            state = _STATE.search(raw)
            remote_as = _REMOTE_AS.search(raw)
            if not state and not remote_as:
                continue
            if remote_as and not 1 <= int(remote_as.group(1)) <= 4294967295:
                continue
            results.append({"device": device, "peer": peer, "state": state.group(1) if state else None,
                            "remote_as": remote_as.group(1) if remote_as else None,
                            "id": block["id"], "line": line_no})
    return results
