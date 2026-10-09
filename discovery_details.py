"""Normalize observed interface data without inferring missing network facts."""
import re
from network_discovery import port

DETAIL_COMMANDS = {
    'Cisco IOS-XE': ('show interfaces status', 'show interfaces description', 'show interfaces switchport', 'show etherchannel summary'),
    'Cisco NX-OS': ('show interface status', 'show interface description', 'show interface switchport', 'show port-channel summary'),
    'Arista EOS': ('show interfaces status', 'show interfaces description', 'show interfaces switchport', 'show port-channel summary'),
    'Huawei_CE_SW': ('display interface brief', 'display interface', 'display port vlan', 'display eth-trunk'),
    'Huawei iStack': ('display interface brief', 'display interface', 'display port vlan', 'display eth-trunk'),
}
PORT_RE = r'(?:[0-9]*[A-Za-z][A-Za-z0-9-]*\d+(?:[/.:]\d+)*|Port-Channel\d+|Eth-Trunk\d+)'

def key(value):
    value = port(value).lower()
    value = re.sub(r'^et(?=\d)', 'eth', value)
    value = re.sub(r'^ge(?=\d)', 'gi', value)
    for full, short in [('xgigabitethernet','xge'),('hundredgige','100ge'),('fortygige','40ge'),('tengigabitethernet','te'),('port-channel','po')]:
        if value.startswith(full): return short + value[len(full):]
    return value


def parse_interfaces(platform, evidence):
    records, warnings = {}, []
    for item in evidence:
        command, output = item['command'], item['output'].replace('\r', '')
        evidence_platform = item.get('platform') or platform
        if command not in DETAIL_COMMANDS[evidence_platform]:
            raise ValueError('Unsupported interface evidence command for this platform.')
        if re.search(r'invalid (?:input|command)|unrecognized command|unknown command|incomplete command|(?:^|\n)\s*(?:%|Error:)', output, re.I):
            warnings.append(command + ': command output reported an error; interface fields were not inferred.')
            continue
        current, accepted, aggregate = None, 0, None
        def record(name):
            nonlocal accepted
            accepted += 1
            r = records.setdefault(key(name), {'port':port(name),'evidence':[]})
            provenance = {'command':command,'observedAt':item.get('observedAt',''),'origin':item.get('origin','CLI import')}
            if provenance not in r['evidence']: r['evidence'].append(provenance)
            return r
        for line in output.splitlines():
            # IOS/NX-OS/EOS status table, descriptions may contain spaces.
            m = re.match(r'^\s*('+PORT_RE+r')\s+(.*?)\s+(connected|notconnect|disabled|err-disabled|inactive|monitoring|sfpAbsent|xcvrAbsen|routed|up|down)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+.*)?$', line, re.I)
            if m and 'status' in command:
                r=record(m[1]);r.update(description=m[2].strip(),status=m[3],vlan=m[4],duplex=m[5],speed=m[6]);continue
            m=re.match(r'^\s*('+PORT_RE+r')\s+(admin down|administratively down|up|down|deleted)\s+(up|down)\s*(.*)$',line,re.I)
            if m and ('description' in command or 'brief' in command):
                r=record(m[1]);r.update(status=m[2],protocol=m[3]);
                if 'description' in command:r['description']=m[4].strip()
                continue
            # Detailed interface blocks / switchport blocks.
            m=re.match(r'^\s*('+PORT_RE+r')\s+is\s+(.+?)(?:,\s*line protocol is (.+))?$',line,re.I)
            if not m:m=re.match(r'^\s*('+PORT_RE+r')\s+current state\s*:\s*(.+)$',line,re.I)
            if m:
                current=record(m[1]);current['status']=m[2].strip()
                if m.lastindex and m.lastindex>=3 and m[3]:current['protocol']=m[3].strip()
                continue
            m=re.match(r'^\s*(?:Name|Interface)\s*:\s*('+PORT_RE+r')\s*$',line,re.I)
            if m:current=record(m[1]);continue
            if current:
                for pattern, field in [(r'^\s*Description\s*:\s*(.*)$','description'),(r'^\s*Operational Mode\s*:\s*(.*)$','mode'),(r'^\s*(?:Access Mode VLAN|Port default VLAN|PVID)\s*:\s*(\S+).*','vlan'),(r'^\s*(?:Trunking VLANs Enabled|Trunk VLANs Allowed|Trunk VLANs)\s*:\s*(.*)$','allowedVlans'),(r'^\s*Speed\s*:\s*(.*)$','speed'),(r'^\s*Line protocol current state\s*:\s*(.*)$','protocol')]:
                    x=re.match(pattern,line,re.I)
                    if x:current[field]=x[1].strip()
                x=re.search(r'(\S+)\s+duplex,\s+(\S+(?:\s*[GMK]b/s)?)',line,re.I)
                if x:current['duplex'],current['speed']=x[1],x[2]
            # IOS/NX-OS/EOS port-channel membership.
            if 'summary' in command:
                m=re.match(r'^\s*\d+\s+(Po\d+|Port-Channel\d+)\([^)]*\)\s+.*',line,re.I)
                if m:aggregate=port(m[1])
                if aggregate:
                    member_text=line[m.end(1):] if m else line
                    for member in re.findall(r'('+PORT_RE+r')\([A-Za-z]+\)',member_text):record(member)['portChannel']=aggregate
            if command=='display port vlan':
                m=re.match(r'^\s*('+PORT_RE+r')\s+(access|trunk|hybrid)\s+(\d+)\s*(.*)$',line,re.I)
                if m:
                    r=record(m[1]);r.update(mode=m[2],vlan=m[3],allowedVlans=m[4].strip())
            if command=='display eth-trunk':
                m=re.match(r'^\s*(Eth-Trunk\d+)\s*(?:\x27s)?\s*(?:state|current state).*',line,re.I)
                if m:current={'portChannel':m[1]}
                m=re.match(r'^\s*('+PORT_RE+r')\s+(?:Selected|Unselected|Up|Down)\b',line,re.I)
                if m and current and current.get('portChannel'):record(m[1])['portChannel']=current['portChannel']
        if output.strip() and not accepted:warnings.append(command+': no supported interface rows were parsed. Keep the raw output and review its format.')
    return records, warnings


def enrich_graph(graph, sources):
    for d in graph['devices']:d['interfaces']={}
    for s in sources:
        evidence=s.get('interfaceEvidence') or []
        if not evidence:continue
        candidates=[d for d in graph['devices'] if (s.get('target') and s['target'] in d['managementAddresses']) or d['hostname'].lower()==s['deviceName'].lower()]
        if len(candidates)!=1:
            graph['warnings'].append(s['deviceName']+': interface evidence could not be matched to one device.');continue
        rows,warnings=parse_interfaces(s['platform'],evidence)
        graph['warnings'].extend(s['deviceName']+': '+w for w in warnings)
        device=candidates[0]
        for k,row in rows.items():
            previous=device['interfaces'].get(k,{})
            # Keep newest evidence for a repeated field, not stale previous values.
            if not previous or max((x.get('observedAt','') for x in row['evidence']),default='')>=max((x.get('observedAt','') for x in previous.get('evidence',[])),default=''):
                device['interfaces'][k]={**previous,**row}
    byid={d['id']:d for d in graph['devices']}
    for e in graph['links']:
        for side in ('a','b'):e[side+'Details']=byid[e[side]]['interfaces'].get(key(e[side+'Port']),{})
    graph['warnings']=list(dict.fromkeys(graph['warnings']))
    return graph
