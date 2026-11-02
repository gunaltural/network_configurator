"""Conservative cross-domain correlations from explicitly observed CLI evidence."""
import re
import ipaddress

def correlate_domains(blocks, vendor, language):
    """Return evidence-linked review suggestions, never a confirmed root cause."""
    if vendor not in ("Cisco IOS-XE", "Cisco NX-OS"):
        return []
    tr = language == "tr"
    states, interfaces, routes = {}, {}, {}
    for block in blocks:
        lines = block.get("text", "").splitlines()
        if len(lines) < 2 or not lines[0].startswith("Device: ") or not lines[1].startswith("Command: "):
            continue
        device = lines[0][8:].strip()
        command = lines[1][9:].strip().lower()
        if not device or device == "Unidentified":
            continue
        vrf_match = re.fullmatch(r"show ip route vrf ([\w.-]+)", command)
        bgp_vrf_match = re.fullmatch(r"show (?:ip bgp vrf|bgp vrf) ([\w.-]+) (?:ipv4 unicast )?summary", command)
        peer_vrf = bgp_vrf_match.group(1) if bgp_vrf_match else "default"
        route_vrf = vrf_match.group(1) if vrf_match else "default"
        for line in lines[2:]:
            match = re.fullmatch(r"L(\d+): (.*)", line)
            if not match:
                continue
            number, value = match.groups()
            ref = f"{block['id']}, L{number}"
            if command in ("show ip bgp summary", "show bgp ipv4 unicast summary") or bgp_vrf_match:
                row = re.match(r"^((?:\d{1,3}\.){3}\d{1,3})\s+4\s+(\d+)\s+.*?\s+(Idle|Active|Connect|OpenSent|OpenConfirm)(?:\s*\(Admin\))?\s*$", value.strip(), re.I)
                if row:
                    try:
                        ipaddress.IPv4Address(row[1])
                    except ValueError:
                        continue
                    states.setdefault(device, []).append((peer_vrf, row[1], row[3], ref))
            elif command == "show ip route" or vrf_match:
                # Only an explicit host route with an egress interface can establish
                # the peer's path; do not infer from a default or summary route.
                host = re.match(r"^\S+\s+((?:\d{1,3}\.){3}\d{1,3})/32\s+.*?\b(?:via|directly connected,?)\s+.*?,\s*(\S+)\s*$", value.strip(), re.I)
                if host:
                    try:
                        ipaddress.IPv4Address(host[1])
                    except ValueError:
                        continue
                    routes.setdefault((device, route_vrf, host[1]), []).append((host[2], ref))
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
        # A route-backed interface can be selected among multiple failures.
        # Without route evidence, only a single failed interface is reportable.
        for peer_vrf, peer, state, peer_ref in peers:
            route = routes.get((device, peer_vrf, peer), [])
            matched = [(name, ref) for name, ref in down
                       if len(route) == 1 and route[0][0] == name]
            if matched:
                interface, interface_ref = matched[0]
                path_confirmed = True
            elif route:
                continue
            elif len(down) == 1:
                interface, interface_ref = down[0]
                path_confirmed = False
            else:
                continue
            if tr:
                message = (f"{device} (VRF {peer_vrf}): BGP komşusu {peer} {state} durumunda; {interface} arayüzü de down. "
                           "Aynı cihazdaki bu iki gözlem arasında nedensellik kanıtlanmadı. "
                           "Komşuya giden yolu, next-hop erişimini ve ilgili arayüzü salt okunur komutlarla doğrulayın.")
            else:
                message = (f"{device} (VRF {peer_vrf}): BGP peer {peer} is {state}, while interface {interface} is down. "
                           "These observations on the same device do not establish causality. "
                           "Verify the peer path, next-hop reachability and interface with read-only commands.")
            if path_confirmed:
                if tr:
                    message += " RIB'de komşu için /32 yolun çıkış arayüzü aynı arayüz olarak gözlendi; bu, erişim sorununu destekler ancak kök nedeni kanıtlamaz."
                else:
                    message += " The peer's /32 RIB route explicitly uses this interface; this supports a reachability concern, not a proven root cause."
                findings.append(f"{message} [{peer_ref}; {interface_ref}; {route[0][1]}]")
            else:
                findings.append(f"{message} [{peer_ref}; {interface_ref}]")
    return findings
