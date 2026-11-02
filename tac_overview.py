"""Evidence-based inventory of selected CLI blocks. No inference from missing output."""
import ipaddress
import re
from collections import defaultdict
from bgp_cli_evidence import summary_rows, render, correlate
from bgp_diagnostic_rules import diagnose_neighbor
from bgp_route_cli_evidence import route_diagnostic_text

# category, command family, line signature, interpretation (EN/TR).
RULES = [
 ('Management',r'show ntp status',r'^Clock is (?:un)?synchronized\b', 'Reported clock state', 'Bildirilen saat durumu'),
 ('Interfaces',r'show ip interface brief',r'^\S+\s+(?:[\d.]+|unassigned)\s+YES\s+\S+\s+(?:administratively down|up|down)\s+(?:up|down)$','Interface and line-protocol snapshot','Arayüz ve hat protokolü durumu'),
 ('OSPF',r'show ip ospf neighbor',r'^[\d.]+\s+\d+\s+(?:FULL|EXSTART|EXCHANGE|2WAY|INIT|LOADING)/','OSPF adjacency state','OSPF komşuluk durumu'),
 ('STP',r'show spanning-tree(?: vlan \d+)?',r'^\S+\s+Altn\s+BLK\b','Alternate port blocked; consistent with loop prevention','Alternate port bloklu; döngü önlemeyle uyumlu'),
 ('STP',r'show spanning-tree inconsistentports',r'^VLAN\d+\s+\S+\s+Root Inconsistent','Root inconsistency; check the source of superior BPDUs','Root tutarsızlığı; üstün BPDU kaynağını kontrol edin'),
 ('vPC',r'show vpc peer-keepalive',r'^vPC keep-alive status\s*:', 'Keepalive observation only; compare peer-link and both roles','Yalnızca keepalive durumu; peer-link ve iki eşin rolüyle karşılaştırın'),
 ('vPC',r'show vpc brief',r'^(?:vPC role\s*:|\d+\s+Po\d+\s+(?:up|down)\b)','Local vPC role or port-channel state','Yerel vPC rolü veya port-channel durumu'),
 ('MLAG',r'show mlag(?: interfaces)?',r'^(?:peer-link status\s*:|.*\bactive-(?:full|partial)\s*$)','Local MLAG peer-link or member state','Yerel MLAG peer-link veya üye durumu'),
 ('StackWise',r'show stackwise-virtual dual-active-detection',r'^\d+\s+\S+\s+(?:up|down)$','DAD port status; not proof of dual-active','DAD port durumu; dual-active kanıtı değil'),
 ('StackWise',r'show stackwise-virtual link',r'^\d+\s+\d+\s+\S+\s+\S+\s+\S+$','SVL member snapshot','SVL üye durumu'),
 ('EVPN/VXLAN',r'show nve (?:vni|peers)',r'^nve\d+\s+\S+\s+.*\b(?:Up|Down)\b','Local VNI or NVE peer state','Yerel VNI veya NVE eş durumu'),
 ('SD-WAN',r'diagnose sys sdwan health-check',r'^Seq\(\d+ [^)]+\):\s*state\((?:dead|alive)\)','Probe/member measurement; not the application path','Prob/üye ölçümü; uygulamanın yolunu göstermez'),
]
def overview(blocks, vendor, language):
    tr = language == 'tr'
    groups, used, routes = defaultdict(list), set(), defaultdict(dict)
    cisco = vendor in ('Cisco IOS-XE','Cisco NX-OS')
    visible = {}
    vty_filters, acl_entries = [], defaultdict(list)
    def add(group,msg,ref):
        groups[group].append(f'{msg} [{ref}]')
    for b in blocks:
        lines = b['text'].splitlines()
        if len(lines)<2 or not lines[0].startswith('Device: ') or not lines[1].startswith('Command: '): continue
        dev,cmd=lines[0][8:],lines[1][9:].lower().removesuffix(' (continued)')
        eid=b['id']
        visible[eid]=f'{dev} · {cmd}'
        scope=None; qos_class=None; acl=None
        rib=re.fullmatch(r'show ip route(?: vrf (\S+))?(?: static)?',lines[1][9:].removesuffix(' (continued)'),re.I)
        for row in lines[2:]:
            m=re.fullmatch(r'L(\d+): (.*)',row)
            if not m: continue
            num,raw=m.groups(); val=raw.strip()
            ref=f'{dev}; {eid}, L{num}; {cmd}'
            if not val or '[REDACTED]' in val: continue
            def record(group,msg):
                add(group,msg,ref);used.add(eid)
            for group,cf,lf,en,turkish in RULES:
                allowed = {'SD-WAN':vendor=='FortiGate','MLAG':vendor=='Arista EOS','vPC':vendor=='Cisco NX-OS','StackWise':vendor=='Cisco IOS-XE'}.get(group,cisco or vendor=='Arista EOS')
                if allowed and re.fullmatch(cf,cmd) and re.match(lf,val,re.I):
                    record(group,(turkish if tr else en)+': '+val)
            if cisco and cmd=='show running-config':
                if not raw.startswith((' ','\t')): scope=val if val.startswith('line vty ') else None
                match=re.fullmatch(r'ip route (?:vrf (\S+) )?([\d.]+) ([\d.]+) ([\d.]+)(?: .*)?',val)
                if match:
                    try:
                        vrf,net,mask,hop=match.groups(); prefix=str(ipaddress.IPv4Network((net,mask))); hop=str(ipaddress.IPv4Address(hop))
                    except ValueError: continue
                    key=(dev,vrf or 'default',prefix,hop)
                    routes[key]['cfg']=ref
                    record('Static routes',('Yapılandırılmış' if tr else 'Configured')+f': VRF {key[1]} · {prefix} → {hop}')
                if scope and re.fullmatch(r'(?:transport input (?:ssh|telnet|none|all)(?: (?:ssh|telnet))*|access-class [\w.-]+ (?:in|out)(?: vrf-also)?|login (?:local|authentication [\w.-]+))',val):
                    msg=scope+': '+val
                    if val.startswith('transport input') and ('telnet' in val or val.endswith(' all')):
                        msg+=(' — Telnet yapılandırmada izinli; dışarıdan erişim kanıtlanmadı.' if tr else ' — Telnet permitted by config; external reachability unverified.')
                    record('Management security',msg)
                    if val.startswith('access-class '):
                        _, name, direction, *_ = val.split()
                        vty_filters.append((dev,scope,name,direction,ref))
            if cisco and rib and (rib[1] or '').lower() != 'all':
                m2=re.match(r'^S\*?\s+([\d./]+)\s+\[\d+/\d+\]\s+via ([\d.]+)\b',val)
                if m2:
                    try: prefix=str(ipaddress.IPv4Network(m2[1]));hop=str(ipaddress.IPv4Address(m2[2]))
                    except ValueError: continue
                    key=(dev,rib[1] or 'default',prefix,hop);routes[key]['rib']=ref
                    record('Static routes',('RIB kaydı' if tr else 'Installed RIB entry')+f': VRF {key[1]} · {prefix} → {hop}')
            if cisco and cmd in ('show access-lists','show ip access-lists'):
                if re.match(r'^(Extended|Standard) IP access list ',val): acl=val.split()[-1]
                elif acl and re.match(r'^\d+\s+(permit|deny)\s+',val):
                    acl_entries[(dev,acl)].append(ref)
                    record('ACL',f'{acl}: {val}'+(' — Kural sırası ve uygulandığı yön incelenmeli.' if tr else ' — Verify ordering, attachment and direction.'))
            if cisco and cmd.startswith('show policy-map interface '):
                if val.startswith('Class-map:'):qos_class=val.split(':',1)[1].split('(')[0].strip()
                if qos_class and re.fullmatch(r'\(queue depth/total drops/no-buffer drops\)\s+\d+/\d+/\d+',val):
                    record('QoS',f'{qos_class}: {val}'+(' — Birikimli sayaç.' if tr else ' — Cumulative counters.'))
    for (dev,vrf,prefix,hop),refs in routes.items():
        if dev!='Unidentified' and 'cfg' in refs and 'rib' in refs:
            add('Static routes',('Konfigürasyon ve RIB eşleşiyor' if tr else 'Configuration and RIB match')+f': {vrf} · {prefix} → {hop}',refs['cfg']+'; '+refs['rib'])
    for dev,scope,name,direction,ref in vty_filters:
        entries=acl_entries.get((dev,name))
        if dev!='Unidentified' and entries:
            add('Management security',f'{scope} · ACL {name} ({direction}): '+('Kural listesi aynı cihazda görüldü; etkin erişim ayrıca doğrulanmalı.' if tr else 'Rule list observed on this device; effective access requires verification.'),ref+'; '+entries[0])
    rows=[r for b in blocks if cisco for r in summary_rows(b)]
    if rows:
        groups['BGP'].append(render(rows,language));used.update(r[5] for r in rows)
        for device, command, peer, asn, state, eid, line in rows:
            diagnosis = diagnose_neighbor(state)
            if diagnosis['hypotheses']:
                ref = f'{device}; {eid}, L{line}; {command}; {peer}'
                label = 'Olası nedenler (doğrulanmadı)' if tr else 'Possible causes (unverified)'
                next_label = 'Sonraki salt-okunur kontroller' if tr else 'Next read-only checks'
                add('BGP', label + ': ' + '; '.join(diagnosis['hypotheses']), ref)
                add('BGP', next_label + ': ' + '; '.join(diagnosis['next_read_only_checks']), ref)
        events=correlate(rows,blocks)
        for e in events:
            add('BGP',f"{e['device']} · {e['peer']} · {e['event']} {e['reason']}",f"{e['evidence']}, L{e['line']}; show logging")
            used.add(e['evidence'])
        if events: groups['BGP'].append('Log olayı ve anlık durum ara FSM geçişlerini kanıtlamaz.' if tr else 'A recorded event and a snapshot do not prove the intervening FSM transitions.')
    route_reports = route_diagnostic_text(blocks, language) if cisco else []
    if route_reports:
        groups['BGP routes'].extend(route_reports)
        for block in blocks:
            if any(f'{block["id"]}, L' in report for report in route_reports):
                used.add(block['id'])
    if not groups: return None
    missing=[f'{b["id"]} ({visible.get(b["id"],"?")})' for b in blocks if b['id'] not in used]
    parts=[('Seçili CLI kanıtı' if tr else 'Selected CLI evidence')]
    for group,items in groups.items():
        parts.append(group+'\n'+'\n'.join(items[:12]))
        if len(items)>12: parts.append((f'{len(items)-12} ek kayıt gösterilmedi.' if tr else f'{len(items)-12} additional observations omitted.'))
    if missing: parts.append(('Otomatik yorumlanmayan bloklar: ' if tr else 'Blocks not automatically interpreted: ')+', '.join(missing))
    parts.append('Kanıt yokluğu sağlıklı durum veya kural yokluğu anlamına gelmez.' if tr else 'Missing evidence does not establish health or absence of configuration.')
    return '\n\n'.join(parts),list(groups)
