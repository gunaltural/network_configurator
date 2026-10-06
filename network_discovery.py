"""Read-only neighbor discovery normalization; imported CLI is never executed."""
import hashlib
import ipaddress
import re
from datetime import datetime, timezone

PLATFORMS = ('Cisco IOS-XE', 'Cisco NX-OS', 'Arista EOS', 'Huawei_CE_SW', 'Huawei iStack')
COMMANDS = {
    'Cisco IOS-XE': {'lldp': 'show lldp neighbors detail', 'cdp': 'show cdp neighbors detail'},
    'Cisco NX-OS': {'lldp': 'show lldp neighbors detail', 'cdp': 'show cdp neighbors detail'},
    'Arista EOS': {'lldp': 'show lldp neighbors detail'},
    'Huawei_CE_SW': {'lldp': 'display lldp neighbor'},
    'Huawei iStack': {'lldp': 'display lldp neighbor'},
}
ERROR = re.compile(r'invalid (?:input|command)|unrecognized command|unknown command|incomplete command|error:|not enabled|disabled', re.I)


def uid(value):
    return hashlib.sha256(value.encode()).hexdigest()[:18]


def port(value):
    value = str(value or '').strip().strip('"')
    value = re.sub(r'\s+', '', value)
    for name, short in [('TenGigabitEthernet', 'Te'), ('GigabitEthernet', 'Gi'), ('FastEthernet', 'Fa'), ('Ethernet', 'Eth'), ('Port-Channel', 'Po')]:
        if value.lower().startswith(name.lower()):
            return short + value[len(name):]
    return value


def ips(value):
    result = []
    for token in re.findall(r'[0-9a-fA-F:.]+', value):
        try:
            address = ipaddress.ip_address(token.strip('.'))
            if not address.is_unspecified and not address.is_multicast and str(address) not in result:
                result.append(str(address))
        except ValueError:
            pass
    return result


def label(line):
    m = re.match(r'\s*[-*]?\s*([^:]{1,65})\s*:\s*(.*)', line)
    return (re.sub(r'[^a-z0-9]', '', m[1].lower()), m[2].strip().strip('"')) if m else ('', '')


def parse_neighbors(platform, protocol, output):
    """Detail formats only. Preserve gaps rather than guessing a local port."""
    if platform not in COMMANDS or protocol not in COMMANDS[platform]:
        raise ValueError('Unsupported platform / neighbor protocol.')
    output = output.replace('\r', '').replace('\x1b', '')
    records, warnings, current = [], [], {}
    mgmt = False

    def flush():
        nonlocal current
        if current.get('remotePort') and (current.get('hostname') or current.get('chassisId')):
            if current.get('localPort'):
                current['localPort'] = port(current['localPort'])
                current['remotePort'] = port(current['remotePort'])
                current.setdefault('managementAddresses', [])
                records.append(current)
            else:
                warnings.append('A neighbor record had no local interface and was excluded from links.')
        current = {}

    for line in output.splitlines():
        # Arista and Huawei introduce each local interface before its neighbors.
        intro = re.match(r'\s*(?:Interface\s+)?([\w./-]+(?:\s+[0-9/]+)?)\s+(?:has|detected)\s+\d+\s+(?:LLDP\s+)?neighbors?', line, re.I)
        if intro:
            flush(); current['localPort'] = intro[1]; mgmt = False; continue
        k, v = label(line)
        if protocol == 'cdp' and k == 'deviceid':
            flush(); current['hostname'] = v; mgmt = False; continue
        if protocol == 'lldp' and k in ('localintf', 'localinterface', 'localportid', 'localport'):
            flush(); current['localPort'] = v; mgmt = False; continue
        if protocol == 'lldp' and k == 'neighborindex' and current.get('remotePort'):
            local = current.get('localPort'); flush(); current['localPort'] = local
        if protocol == 'cdp' and k == 'interface':
            match = re.match(r'(.+?),\s*Port ID\s*\(outgoing port\)\s*:\s*(.+)', v, re.I)
            if match:
                current['localPort'], current['remotePort'] = match.groups()
        elif k in ('portid', 'neighborportid', 'remoteportid'):
            current['remotePort'] = v
        elif k in ('systemname', 'sysname'):
            current['hostname'] = v
        elif k in ('chassisid', 'neighborchassisid'):
            # A second neighbor on the same local port starts another record.
            if current.get('remotePort'):
                local = current.get('localPort'); flush(); current['localPort'] = local
            current['chassisId'] = v
        elif k == 'platform' and protocol == 'cdp':
            current['description'] = v.split(',')[0].strip()
        elif k in ('systemdescription', 'sysdescription'):
            current['description'] = v
        if k in ('managementaddress', 'managementaddresses', 'mgmtaddress', 'mgmtaddresses', 'entryaddresses', 'managementaddressvalue'):
            mgmt = True
            for address in ips(v):
                if address not in current.setdefault('managementAddresses', []): current['managementAddresses'].append(address)
        elif mgmt and k in ('ipaddress', 'ipv4address', 'ipv6address', 'ip', 'ipv4', 'ipv6', ''):
            for address in ips(v if k else line):
                if address not in current.setdefault('managementAddresses', []): current['managementAddresses'].append(address)
        elif k and k not in ('managementaddresssubtype', 'addresssubtype'):
            mgmt = False
    flush()
    if not records:
        if ERROR.search(output): warnings.append('Neighbor command reported an error or discovery protocol is disabled.')
        elif not re.search(r'0\s+(?:LLDP\s+)?neighbors?|no\s+(?:LLDP\s+|CDP\s+)?neighbors?|total\s+(?:entries|neighbors)\s*:?\s*0|total.*displayed\s*:\s*0', output, re.I):
            warnings.append('No supported detailed neighbor records were parsed. This does not establish that the device has no neighbors.')
    return records, list(dict.fromkeys(warnings))


def advertised_vendor(description):
    d = description.lower()
    return 'Huawei_CE_SW' if 'huawei' in d else 'Arista EOS' if 'arista' in d else 'Cisco NX-OS' if 'nx-os' in d or 'nexus' in d or re.search(r'\bn[3579]k[- ]', d) else 'Cisco IOS-XE' if 'cisco' in d else ''


def build_graph(sources):
    devices, edges, aliases, warnings = {}, {}, {}, []

    def add(name='', addresses=None, chassis='', platform='', seed=False, identity=None, observed='', origin='CLI import'):
        addresses = addresses or []
        keys = ([f'ip:{a}' for a in addresses] + ([f'chassis:{chassis.lower()}' ] if chassis else []))
        # Hostname can reconcile a seed without an advertised management IP only
        # when its known address doesn't conflict with the advertisement.
        name_key = 'name:' + name.lower().rstrip('.') if name else ''
        candidate = next((aliases[k] for k in keys if k in aliases), None)
        if not candidate and name_key in aliases:
            existing = devices[aliases[name_key]]
            if not addresses or not existing['managementAddresses'] or set(addresses) & set(existing['managementAddresses']): candidate = existing['id']
        key = keys[0] if keys else name_key
        if not key: key = 'unknown:' + str(len(devices))
        ident = candidate or 'nd-' + uid(key)
        if ident not in devices:
            devices[ident] = {'id':ident,'hostname':name or chassis or (addresses[0] if addresses else 'Unknown neighbor'),'managementAddresses':[], 'chassisId':chassis,'vendor':platform,'seed':False,'model':'','serial':'','softwareVersion':'','observedAt':observed,'identitySource':'Neighbor advertisement','sources':[]}
        d = devices[ident]
        d['seed'] = d['seed'] or seed
        if platform and not d['vendor']: d['vendor'] = platform
        if chassis and not d['chassisId']: d['chassisId'] = chassis
        d['managementAddresses'] = list(dict.fromkeys(d['managementAddresses'] + addresses))
        if identity:
            for field, source in [('hostname','hostname'),('model','model'),('serial','serial'),('softwareVersion','software_version')]:
                if identity.get(source): d[field] = identity[source]
            d['identitySource'] = origin
        if seed and origin == 'CLI import': d['identitySource'] = 'Local label supplied by engineer'
        if origin not in d['sources']: d['sources'].append(origin)
        if observed > d['observedAt']: d['observedAt'] = observed
        for k in keys: aliases[k] = ident
        if name_key and name_key not in aliases: aliases[name_key] = ident
        return ident

    for s in sources:
        add(s['deviceName'], ips(s.get('target','')), platform=s['platform'], seed=True, identity=s.get('identity'), observed=s.get('observedAt',''), origin=s.get('origin','CLI import'))
    for s in sources:
        origin = s.get('origin','CLI import'); timestamp = s.get('observedAt','')
        local = add(s['deviceName'], ips(s.get('target','')), platform=s['platform'], seed=True, identity=s.get('identity'), observed=timestamp, origin=origin)
        records, issues = parse_neighbors(s['platform'], s['protocol'], s['output'])
        warnings.extend(f"{s['deviceName']} · {s['protocol'].upper()}: {x}" for x in issues)
        for r in records:
            remote = add(r.get('hostname',''), r['managementAddresses'], r.get('chassisId',''), advertised_vendor(r.get('description','')), observed=timestamp, origin=s['protocol'].upper()+' advertisement')
            if remote == local:
                warnings.append(f"{s['deviceName']}: self-referencing neighbor was excluded."); continue
            endpoints = sorted([(local,r['localPort']), (remote,r['remotePort'])])
            ident = 'link-' + uid(str(endpoints))
            e = edges.setdefault(ident, {'id':ident,'a':endpoints[0][0],'aPort':endpoints[0][1],'b':endpoints[1][0],'bPort':endpoints[1][1],'protocols':[],'observations':[],'state':'One-sided observation'})
            if s['protocol'].upper() not in e['protocols']: e['protocols'].append(s['protocol'].upper())
            e['observations'].append({'device':local,'command':COMMANDS[s['platform']][s['protocol']], 'observedAt':timestamp,'origin':origin})
            if {x['device'] for x in e['observations']} == {e['a'],e['b']}: e['state'] = 'Both ends observed'
    if len(devices)>500 or len(edges)>2000: raise ValueError('Discovery exceeds 500 devices / 2000 links. Reduce the scope.')
    return {'devices':list(devices.values()),'links':list(edges.values()),'warnings':list(dict.fromkeys(warnings)), 'generatedAt':datetime.now(timezone.utc).isoformat()}
