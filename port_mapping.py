"""Correlate imported neighbor/interface/address evidence without contacting devices."""
import ipaddress
import re
from datetime import datetime, timezone
from network_discovery import COMMANDS, build_graph, parse_neighbors, advertised_vendor, uid, port
from discovery_details import PARSE_COMMANDS, enrich_graph, key, PORT_RE

MAC = re.compile(r'\b(?:[0-9a-f]{4}[.\-]){2}[0-9a-f]{4}\b|\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b', re.I)


def cdp_events(raw):
    """Extract both link endpoints from complete CDP diagnostic events."""
    records = {}
    for number, line in enumerate(raw.splitlines(), 1):
        m = re.search(r'%CDP-\d+-(?:DUPLEX|NATIVE_VLAN)_MISMATCH:.*?discovered on (\S+)\s*\([^)]*\),\s*with (\S+)\s+(\S+)\s*\(', line, re.I)
        if not m:
            continue
        local, remote = port(m[1]), port(m[3])
        if not re.fullmatch(PORT_RE, local) or not re.fullmatch(PORT_RE, remote):
            continue
        records[(local, m[2].lower(), remote)] = {'localPort':local, 'remotePort':remote, 'hostname':m[2],
            'managementAddresses':[], 'raw':line.strip(), 'line':number,
            'eventTime':line.split('%CDP-',1)[0].strip()}
    return list(records.values())


def enrich_facts(device, source):
    provenance = {'command':source.get('originalCommand') or source.get('command',''), 'sourceId':source['id'], 'observedAt':source['importedAt']}
    def interface(name):
        return device['interfaces'].setdefault(key(name), {'port':name, 'evidence':[]})
    if source['kind'] == 'vlans':
        current, table = None, False
        vlans = {}
        for number, line in enumerate(source['raw'].splitlines(), 1):
            if re.match(r'^\s*VLAN\s+Name\s+Status\s+Ports', line, re.I):table=True;continue
            if not table:continue
            m = re.match(r'^\s*(\d{1,4})\s+(.+?)\s+(active|act/\S+|suspend\S*|shutdown)\s*(.*)$', line, re.I)
            if m and 1 <= int(m[1]) <= 4094:
                current = {'id':int(m[1]), 'name':m[2].strip(), 'status':m[3], 'ports':[], **provenance, 'line':number}
                for detail in device['interfaces'].values():
                    detail['vlanMembership']=[v for v in detail.get('vlanMembership',[]) if v['id']!=current['id']]
                vlans[str(current['id'])] = current
                ports = m[4]
            elif current and re.match(r'^\s+\S',line) and all(re.fullmatch(PORT_RE,p.strip()) for p in line.strip().split(',')):
                ports = line
            elif not line.strip() or re.match(r'^\s*-+',line):continue
            else:table=False;current=None;continue
            for name in ports.split(','):
                name=name.strip()
                if not name or not re.fullmatch(PORT_RE,name):continue
                if name not in current['ports']:current['ports'].append(name)
                detail=interface(name)
                detail.setdefault('vlanMembership',[]).append({'id':current['id'],'name':current['name'],'status':current['status']})
                if provenance not in detail['evidence']:detail['evidence'].append(provenance)
        device.setdefault('vlans',{}).update(vlans)
    elif source['kind'] == 'stp':
        current=None
        for number,line in enumerate(source['raw'].splitlines(),1):
            m=re.match(r'^\s*(VLAN\d+|MST\d+)\s*$',line,re.I)
            if m:
                scope=m[1].upper();current={'instance':scope, 'root':False, 'ports':[], **provenance}
                for detail in device['interfaces'].values():
                    detail['spanningTree']=[s for s in detail.get('spanningTree',[]) if s['instance']!=scope]
                device.setdefault('spanningTree',{})[scope]=current;continue
            if not current:continue
            if 'This bridge is the root' in line:current['root']=True
            m=re.match(r'^\s*('+PORT_RE+r')\s+(Root|Desg|Altn|Back|Mstr|Master|Alternate|Designated)\s+(FWD|BLK|LRN|LIS|DIS|BKN\S*)\s+(\d+)\s+\S+\s*(.*)',line,re.I)
            if m:
                row={'instance':current['instance'],'role':m[2],'state':m[3],'cost':int(m[4]),'type':m[5].strip(),'line':number, **provenance}
                current['ports'].append({'port':m[1],**row});detail=interface(m[1]);detail.setdefault('spanningTree',[]).append(row)
                if provenance not in detail['evidence']:detail['evidence'].append(provenance)
    elif source['kind'] == 'identity':
        output=source['raw']
        if 'inventory' in source.get('command','') or re.search(r'NAME\s*:.*\n.*PID\s*:',output):
            blocks=re.split(r'(?=\bNAME\s*:)',output,flags=re.I)
            chassis=next((b for b in blocks if re.search(r'NAME\s*:\s*[\"\x27](?:Chassis|Switch|Router)\b',b,re.I)),'')
            m=re.search(r'PID\s*:\s*([^,\r\n]+).*?SN\s*:\s*([^,\r\n]+)',chassis,re.I|re.S)
            if m:device['model'],device['serial']=m[1].strip(),m[2].strip()
        else:
            for pattern,field in [(r'(?im)^\s*cisco\s+(\S+)\s+\([^\r\n]*\)\s+processor','model'),(r'(?im)^\s*Processor board ID\s+(\S+)','serial'),(r'(?im)^.*(?:Cisco IOS Software.*?Version|IOS \(tm\).*?Version|Cisco IOS XE Software, Version|NXOS: version|system: version)\s+([^,\s]+)','softwareVersion')]:
                m=re.search(pattern,output)
                if m and not device.get(field):device[field]=m[1]
        device.setdefault('identityEvidence',[]).append(provenance)


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
        batch = sorted((s for s in latest.values() if s.get('site','Default')==site),key=lambda s:stamp(s['importedAt']))
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
            if s['kind']=='cdp-log':
                discovery[-1].update(protocol='cdp',neighborRecords=cdp_events(s['raw']),eventDerived=True,evidenceCommand=s.get('command','')+' · CDP events',origin='CDP diagnostic event')
        g = enrich_graph(build_graph(discovery), discovery)
        prefix = uid(site)+'-'
        for d in g['devices']:
            d['id'] = prefix+d['id'];d['site']=site;d['capabilities']=[];d['role']='Unknown'
            if not d['seed'] and d.get('sources')==['CDP diagnostic event']:d['identitySource']='CDP diagnostic event'
        for edge in g['links']:
            edge['id']=prefix+edge['id'];edge['a']=prefix+edge['a'];edge['b']=prefix+edge['b']
            for obs in edge['observations']:
                obs['device']=prefix+obs['device']
        for s in batch:
            candidates=[d for d in g['devices'] if (s.get('target') and s['target'] in d['managementAddresses']) or (d['hostname'].lower()==s['device'].lower() and (not s.get('target') or not d['managementAddresses'] or s['target'] in d['managementAddresses']))]
            if len(candidates)!=1:
                graph['warnings'].append(s['device']+': capture identity is ambiguous; supply a unique device name and management IP.');continue
            local=candidates[0];bindings[s['id']]=local['id'];active_ids.append(s['id'])
            if s['kind'] in ('vlans','stp','identity'):enrich_facts(local,s)
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
