"""Conservative cross-domain correlations from explicitly observed CLI evidence."""
import re
import ipaddress

def correlate_domains(blocks, vendor, language):
    """Return evidence-linked review suggestions, never a confirmed root cause."""
    if vendor not in ("Cisco IOS-XE", "Cisco NX-OS"):
        return []
    tr = language == "tr"
    states, interfaces = {}, {}
    for block in blocks:
        lines = block.get("text", "").splitlines()
        if len(lines) < 2 or not lines[0].startswith("Device: ") or not lines[1].startswith("Command: "):
            continue
        device = lines[0][8:].strip()
        command = lines[1][9:].strip().lower()
        if not device or device == "Unidentified":
            continue
        for line in lines[2:]:
            match = re.fullmatch(r"L(\d+): (.*)", line)
            if not match:
                continue
            number, value = match.groups()
            ref = f"{block['id']}, L{number}"
            if command in ("show ip bgp summary", "show bgp ipv4 unicast summary"):
                row = re.match(r"^((?:\d{1,3}\.){3}\d{1,3})\s+4\s+(\d+)\s+.*?\s+(Idle|Active|Connect|OpenSent|OpenConfirm)(?:\s*\(Admin\))?\s*$", value.strip(), re.I)
                if row:
                    try:
                        ipaddress.IPv4Address(row[1])
                    except ValueError:
                        continue
                    states.setdefault(device, []).append((row[1], row[3], ref))
            elif command == "show ip interface brief":
                row = re.match(r"^(\S+)\s+(?:[\d.]+|unassigned)\s+YES\s+\S+\s+(administratively down|down|up)\s+(down|up)\s*$", value.strip(), re.I)
                if row and (row[2].lower() != "up" or row[3].lower() != "up"):
                    interfaces.setdefault(device, []).append((row[1], ref))
    findings = []
    for device in sorted(states.keys() & interfaces.keys()):
        peers = states[device]
        down = interfaces[device]
        if not peers or not down:
            continue
        # Do not imply a specific failed interface is on the peer path.
        # Multiple failed interfaces make a single-interface suggestion misleading.
        if len(down) != 1:
            continue
        peer, state, peer_ref = peers[0]
        interface, interface_ref = down[0]
        if tr:
            message = (f"{device}: BGP komşusu {peer} {state} durumunda; {interface} arayüzü de down. "
                       "Aynı cihazdaki bu iki gözlem arasında nedensellik kanıtlanmadı. "
                       "Komşuya giden yolu, next-hop erişimini ve ilgili arayüzü salt okunur komutlarla doğrulayın.")
        else:
            message = (f"{device}: BGP peer {peer} is {state}, while interface {interface} is down. "
                       "These observations on the same device do not establish causality. "
                       "Verify the peer path, next-hop reachability and interface with read-only commands.")
        findings.append(f"{message} [{peer_ref}; {interface_ref}]")
    return findings
