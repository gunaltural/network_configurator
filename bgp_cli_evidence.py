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

def is_summary(block):
    lines = block['text'].splitlines()
    if len(lines) < 2 or not lines[1].startswith('Command: '):
        return False
    return lines[1][9:].lower().removesuffix(' (continued)') in COMMANDS

def correlate(rows, blocks):
    """Only correlate exact router/peer matches in IOS adjacency logs."""
    keys = {(r[0], r[2]) for r in rows if r[0] and r[0] != 'Unidentified'}
    events = []
    for block in blocks:
        lines = block['text'].splitlines()
        if len(lines) < 3 or not lines[0].startswith('Device: ') or lines[1].lower() not in ('command: show logging', 'command: show logging (continued)'):
            continue
        device = lines[0][8:]
        for line in lines[2:]:
            m = re.fullmatch(r'L([1-9]\d*): [^\n]*?%BGP-5-ADJCHANGE:\s+neighbor (\S+) (Down|Up)(?: (.*))?', line)
            if m and (device, m[2]) in keys:
                events.append(dict(device=device, peer=m[2], event=m[3], reason=(m[4] or '')[:180],
                                   evidence=block['id'], line=m[1]))
    return events

def summarize_capture(blocks, language):
    if not any(is_summary(b) for b in blocks):
        return None
    rows, skipped = [], []
    for block in blocks:
        parsed = summary_rows(block)
        if parsed:
            rows.extend(parsed)
        else:
            skipped.append(block['id'])
    text = render(rows, language) if rows else ('BGP tablosu doğrulanamadı.' if language == 'tr' else 'BGP table could not be verified.')
    events = correlate(rows, blocks)
    tr = language == 'tr'
    for e in events:
        text += f"\n{e['device']} · {e['peer']} · {e['event']} {e['reason']} [{e['evidence']}, L{e['line']}; show logging]"
    if events:
        text += ('\nÖzet anlık oturum durumunu, log kayıtlı olayı gösterir. Aradaki FSM geçişleri veya kök neden bu iki kayıttan belirlenemez.'
                 if tr else '\nThe summary is a snapshot; the log records an event. These do not establish the intervening FSM transitions or root cause.')
        skipped = [eid for eid in skipped if eid not in {e['evidence'] for e in events}]
    if skipped:
        text += ('\nYorumlanmayan kanıt: ' if language == 'tr' else '\nEvidence not interpreted: ') + ', '.join(skipped)
    return rows, text
