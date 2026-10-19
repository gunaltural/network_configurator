"""Correlate imported neighbor/interface/address evidence without contacting devices."""
import ipaddress
import re
from datetime import datetime, timezone
from network_discovery import COMMANDS, build_graph, parse_neighbors, advertised_vendor, uid
from discovery_details import PARSE_COMMANDS, enrich_graph, key

MAC = re.compile(r'\b(?:[0-9a-f]{4}[.\-]){2}[0-9a-f]{4}\b|\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b', re.I)


def stamp(value):
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return result.timestamp() if result.tzinfo else float('-inf')
    except (ValueError, TypeError, AttributeError):
        return float('-inf')


def addresses(source):
    rows = []
    for number, line in enumerate(source['raw'].splitlines(), 1):
        mac = MAC.search(line)
        if not mac:
            continue
        ips = []
        for token in line.split():
            try:
                ip = ipaddress.ip_address(token.strip('(),'))
                if not ip.is_multicast and not ip.is_unspecified:
                    ips.append(str(ip))
            except ValueError:
                pass
        for ip in ips:
            # VLAN scope comes only from a reported SVI, never from an ARP age.
            vlan = re.search(r'\b(?:Vlanif|Vlan-interface|Vlan)(\d+)\b', line, re.I)
            rows.append({'mac':re.sub('[^0-9a-f]', '', mac[0].lower()).upper(), 'ip':ip,
                         'vlan':int(vlan[1]) if vlan else None, 'vrf':source.get('vrf','') or 'default',
                         'site':source.get('site','Default'), 'device':source['device'],
                         'sourceId':source['id'], 'line':number, 'raw':line.strip(),
                         'observedAt':source['importedAt']})
    return rows


def analyze(sources):
    if not sources or len(sources)>100 or sum(len(s['raw']) for s in sources)>10000000:
        raise ValueError('Use 1–100 captures with at most 10 MB total text.')
    if len({s['id'] for s in sources})!=len(sources):
        raise ValueError('Capture IDs must be unique.')
    now = datetime.now(timezone.utc).isoformat()
    # A capture supersedes the same device/command/VRF snapshot, not other commands.
    latest = {}
    for s in sources:
        identity = (s.get('site','Default'), s['device'].lower(), s.get('target',''), s['kind'], s.get('originalCommand') or s.get('command',''), s.get('vrf',''))
        if identity not in latest or stamp(s['importedAt'])>=stamp(latest[identity]['importedAt']):
            latest[identity] = s
    graph = {'devices':[], 'links':[], 'warnings':[], 'generatedAt':now}
    bindings, arp, active_ids = {}, [], []
    for site in sorted({s.get('site','Default') for s in latest.values()}):
        batch = [s for s in latest.values() if s.get('site','Default')==site]
        discovery = []
        for s in batch:
            if s['platform'] not in COMMANDS:
                raise ValueError('Unsupported platform: '+s['platform'])
            if s['kind']=='interfaces' and s['command'] not in PARSE_COMMANDS[s['platform']]:
                raise ValueError('Choose a supported port evidence command for '+s['platform'])
            discovery.append({'deviceName':s['device'], 'target':s.get('target',''), 'platform':s['platform'],
                              'protocol':s['kind'] if s['kind'] in ('lldp','cdp') else 'lldp',
                              'output':s['raw'] if s['kind'] in ('lldp','cdp') else 'Total neighbors: 0',
                              'observedAt':s['importedAt'], 'origin':'CLI import',
                              'interfaceEvidence':[{'command':s['command'], 'output':s['raw'], 'platform':s['platform'],
                                                    'observedAt':s['importedAt'], 'snapshotKey':s.get('originalCommand') or s['command'], 'origin':'CLI import'}] if s['kind']=='interfaces' else []})
        g = enrich_graph(build_graph(discovery), discovery)
        prefix = uid(site)+'-'
        for d in g['devices']:
            d['id'] = prefix+d['id'];d['site']=site;d['capabilities']=[];d['role']='Unknown'
        for edge in g['links']:
            edge['id']=prefix+edge['id'];edge['a']=prefix+edge['a'];edge['b']=prefix+edge['b']
            for obs in edge['observations']:
                obs['device']=prefix+obs['device']
        for s in batch:
            candidates=[d for d in g['devices'] if (s.get('target') and s['target'] in d['managementAddresses']) or (d['hostname'].lower()==s['device'].lower() and (not s.get('target') or not d['managementAddresses'] or s['target'] in d['managementAddresses']))]
            if len(candidates)!=1:
                graph['warnings'].append(s['device']+': capture identity is ambiguous; supply a unique device name and management IP.');continue
            local=candidates[0];bindings[s['id']]=local['id'];active_ids.append(s['id'])
            if s['kind'] in ('arp','nd'):
                rows=addresses(s);arp.extend(rows)
                if not rows:graph['warnings'].append(s['device']+': no complete IP/MAC rows parsed from '+s['kind'].upper()+'.')
            if s['kind'] in ('lldp','cdp'):
                records,_=parse_neighbors(s['platform'],s['kind'],s['raw'])
                for r in records:
                    peers=[d for d in g['devices'] if d['id']!=local['id'] and ((r.get('chassisId') and d['chassisId']==r['chassisId']) or set(r['managementAddresses']) & set(d['managementAddresses']) or (r.get('hostname') and r['hostname'].lower()==d['hostname'].lower()))]
                    if len(peers)==1:
                        peer=peers[0];peer['capabilities']=list(set(peer['capabilities']+r.get('capabilities',[])))
                        peer['description']=r.get('description','') or peer.get('description','')
                        caps=' '.join(peer['capabilities']).lower()
                        peer['role']='Phone' if 'telephone' in caps or ' t ' in ' '+caps+' ' else 'Access point' if 'wlan' in caps or ' w ' in ' '+caps+' ' else 'Switch / bridge' if 'bridge' in caps or 'switch' in caps or ' b ' in ' '+caps+' ' else 'Router' if 'router' in caps or caps=='r' else 'Unknown'
        for edge in g['links']:
            for side in ('a','b'):
                device=next(d for d in g['devices'] if d['id']==edge[side])
                edge[side+'Port']=device['interfaces'].get(key(edge[side+'Port']),{}).get('port',edge[side+'Port'])
        graph['devices'].extend(g['devices']);graph['links'].extend(g['links']);graph['warnings'].extend(g['warnings'])
        if len(graph['devices'])>500 or len(graph['links'])>2000:
            raise ValueError('Reduce topology to 500 devices / 2000 links.')
    return {'graph':graph, 'bindings':bindings, 'addresses':arp, 'activeSourceIds':active_ids,
            'supersededSourceIds':[s['id'] for s in sources if s['id'] not in active_ids]}
