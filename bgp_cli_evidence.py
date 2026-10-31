"""Extract Cisco IPv4 BGP summary rows only when column names match."""
import ipaddress
import re

HEADER = 'neighbor v as msgrcvd msgsent tblver inq outq up/down state/pfxrcd'.split()
COMMANDS = {'show ip bgp summary', 'show bgp ipv4 unicast summary'}
STATES = {'Idle', 'Active', 'Connect', 'OpenSent', 'OpenConfirm', 'Idle (Admin)'}

def summary_rows(block):
    lines = block['text'].splitlines()
    if len(lines) < 3 or not lines[0].startswith('Device: ') or not lines[1].startswith('Command: '):
        return []
    device, command = lines[0][8:], lines[1][9:]
    if command.lower() not in COMMANDS:
        return []
    rows, in_table = [], False
    for line in lines[2:]:
        match = re.fullmatch(r'L([1-9]\d*):\s*(.*)', line)
        if not match:
            return []
        lineno, value = match.groups()
        if value.lower().split() == HEADER:
            in_table = True
            continue
        if not in_table:
            continue
        cols = value.split(None, 9)
        if len(cols) != len(HEADER) or cols[1] != '4' or not all(v.isascii() and v.isdecimal() for v in cols[2:8]):
            return []
        try:
            peer = str(ipaddress.IPv4Address(cols[0]))
        except ValueError:
            return []
        if not 1 <= int(cols[2]) <= 4294967295:
            return []
        status = cols[9]
        if status not in STATES and not (status.isascii() and status.isdecimal()):
            return []
        rows.append((device, command, peer, cols[2], status, block['id'], lineno))
    return rows

def render(rows, lang):
    tr = lang == 'tr'
    result = ['Doğrulanan BGP komşuları' if tr else 'Observed BGP peers']
    for device, command, peer, asn, status, eid, line in rows:
        if status.isdecimal():
            state = ('Established; alınan önek: ' if tr else 'Established; received prefixes: ') + status
        else:
            state = status
        result.append(f'{device} · {peer} · AS {asn} · {state} [{eid}, L{line}; {command}]')
    return '\n'.join(result)
