"""Portable FRR pilot lab; lab execution never occurs on the web server."""
import io,json,ipaddress,zipfile,hashlib
from pathlib import Path
from pydantic import BaseModel,Field,model_validator
from fastapi.responses import HTMLResponse,Response,StreamingResponse
from fastapi import HTTPException
from simulation_report import SimulationExport,build_simulation_docx

class Router(BaseModel):
    id: str=Field(pattern=r'^(ce[12]|isp[12])$')
    hostname: str=Field(min_length=1,max_length=64,pattern=r'^[a-zA-Z0-9][a-zA-Z0-9_.-]*$')
    asn: int=Field(ge=1,le=4294967295)
    prefix: str
class Link(BaseModel):
    id: str=Field(pattern=r'^[a-zA-Z0-9_-]{1,40}$')
    a: str
    b: str
    aIp: str
    bIp: str
    localPreference: int=Field(default=100,ge=0,le=4294967295)
class Lab(BaseModel):
    name: str=Field(default='bgp-pilot',pattern=r'^[a-z][a-z0-9-]{0,30}$')
    nodes: list[Router]=Field(min_length=4,max_length=4)
    links: list[Link]=Field(min_length=4,max_length=5)
    failureLink: str
    image: str=Field(default='quay.io/frrouting/frr:10.7.1',pattern=r'^[a-zA-Z0-9][a-zA-Z0-9./_:@-]{0,200}$')
    source: str=Field(default='Standalone pilot',max_length=200)
    @model_validator(mode='after')
    def validate_lab(self):
        ids=[n.id for n in self.nodes]
        if set(ids)!={'ce1','ce2','isp1','isp2'} or len(set(n.hostname for n in self.nodes))!=4:raise ValueError('Use ce1, ce2, isp1, isp2 and unique hostnames.')
        nodes={n.id:n for n in self.nodes}; subnets=[];pairs=set()
        if nodes['ce1'].asn!=nodes['ce2'].asn:raise ValueError('CE routers must share the customer AS.')
        if nodes['isp1'].asn==nodes['ce1'].asn or nodes['isp2'].asn==nodes['ce1'].asn:raise ValueError('Upstreams must use an external AS.')
        prefixes={n.id:ipaddress.IPv4Network(n.prefix,strict=True) for n in self.nodes}
        if prefixes['isp1']!=prefixes['isp2']:raise ValueError('Both upstreams must advertise the same pilot test prefix.')
        if any(prefixes[c].overlaps(prefixes[i]) for c in ['ce1','ce2'] for i in ['isp1','isp2']):raise ValueError('Customer and test prefixes must not overlap.')
        if prefixes['ce1'].overlaps(prefixes['ce2']):raise ValueError('CE advertised prefixes must not overlap.')
        for n in self.nodes:
            net=prefixes[n.id]
            if net.prefixlen==0:raise ValueError('Default prefixes are not supported in this pilot.')
        for l in self.links:
            if l.a not in nodes or l.b not in nodes or l.a==l.b:raise ValueError('Invalid link endpoints.')
            pair=tuple(sorted([l.a,l.b]))
            if pair in pairs:raise ValueError('Parallel links are outside this pilot scope.')
            pairs.add(pair)
            a,b=ipaddress.IPv4Interface(l.aIp),ipaddress.IPv4Interface(l.bIp)
            if a.network!=b.network or a.ip==b.ip or a.network.prefixlen not in (30,31):raise ValueError('Link endpoints require unique addresses in one /30 or /31 subnet.')
            if any(x.ip in (x.network.network_address,x.network.broadcast_address) for x in (a,b)) and a.network.prefixlen==30:raise ValueError('Network/broadcast addresses cannot be endpoints.')
            if any(a.network.overlaps(s) for s in subnets) or any(a.network.overlaps(p) for p in prefixes.values()):raise ValueError('Link subnets must not overlap links or advertised prefixes.')
            subnets.append(a.network)
        expected={tuple(sorted([c,i])) for c in ['ce1','ce2'] for i in ['isp1','isp2']}
        if not expected.issubset(pairs) or pairs-expected-{('ce1','ce2')}:raise ValueError('Pilot requires four CE–ISP links and an optional CE interconnect.')
        if len({l.id for l in self.links})!=len(self.links) or self.failureLink not in {l.id for l in self.links if l.a.startswith('ce') and l.b.startswith('isp') or l.b.startswith('ce') and l.a.startswith('isp')}:raise ValueError('Select a unique external failure link.')
        return self

def build(lab):
    nodes={n.id:n for n in lab.nodes};ports={n:[] for n in nodes};links=[]
    for l in lab.links:
        pa=f'eth{len(ports[l.a])+1}';pb=f'eth{len(ports[l.b])+1}'
        ports[l.a].append((pa,l.aIp,l.b,l.bIp,l.localPreference,l.id));ports[l.b].append((pb,l.bIp,l.a,l.aIp,l.localPreference,l.id))
        links.append({'endpoints':[f'{l.a}:{pa}',f'{l.b}:{pb}']})
    topology={'name':lab.name,'topology':{'nodes':{n:{'kind':'linux','image':lab.image,'binds':[f'configs/{n}/frr.conf:/etc/frr/frr.conf',f'configs/{n}/daemons:/etc/frr/daemons',f'configs/{n}/vtysh.conf:/etc/frr/vtysh.conf'],'exec':['sysctl -w net.ipv4.ip_forward=1']} for n in nodes},'links':links}}
    files={'lab.clab.yml':json.dumps(topology,indent=2)}
    for id,n in nodes.items():
        net=ipaddress.IPv4Network(n.prefix);lo=str(net.network_address if net.prefixlen==32 else net.network_address+1)
        config=['frr defaults traditional',f'hostname {n.hostname}','service integrated-vtysh-config','interface lo',f' ip address {lo}/{net.prefixlen}','!']
        for port,addr,*_ in ports[id]:config += [f'interface {port}',f' ip address {addr}','!']
        config += [f'router bgp {n.asn}',f' bgp router-id {lo}',' no bgp ebgp-requires-policy',' no bgp network import-check']
        for port,addr,peer,peerip,lp,lid in ports[id]:
            ip=str(ipaddress.IPv4Interface(peerip).ip);config += [f' neighbor {ip} remote-as {nodes[peer].asn}',f' neighbor {ip} timers 3 9']
            if id.startswith('ce') and peer.startswith('ce'):config += [f' neighbor {ip} next-hop-self']
        config += [' address-family ipv4 unicast',f'  network {n.prefix}']
        for port,addr,peer,peerip,lp,lid in ports[id]:
            if id.startswith('ce') and peer.startswith('isp'):config += [f'  neighbor {ipaddress.IPv4Interface(peerip).ip} route-map LP-{lid} in']
        config += [' exit-address-family','!']
        for port,addr,peer,peerip,lp,lid in ports[id]:
            if id.startswith('ce') and peer.startswith('isp'):config += [f'route-map LP-{lid} permit 10',f' set local-preference {lp}','!']
        files[f'configs/{id}/frr.conf']='\n'.join(config)+'\n';files[f'configs/{id}/vtysh.conf']='service integrated-vtysh-config\n'
        files[f'configs/{id}/daemons']='zebra=yes\nbgpd=yes\nstaticd=no\nvtysh_enable=yes\n'
    selected=next(l for l in lab.links if l.id==lab.failureLink);ce=selected.a if selected.a.startswith('ce') else selected.b
    port=next(x[0] for x in ports[ce] if x[-1]==selected.id)
    model=lab.model_dump();digest=hashlib.sha256(json.dumps(model,sort_keys=True).encode()).hexdigest()
    manifest={'schema':'network-lab-v1','lab':model,'fingerprint':digest,'failure':{'node':ce,'interface':port,'link':selected.id},'expectedPeers':{n:len(ports[n]) for n in nodes},'probes':[{'node':c,'source':str(ipaddress.IPv4Network(nodes[c].prefix).network_address if ipaddress.IPv4Network(nodes[c].prefix).prefixlen==32 else ipaddress.IPv4Network(nodes[c].prefix).network_address+1),'prefix':nodes['isp1'].prefix,'destination':str(ipaddress.IPv4Network(nodes['isp1'].prefix).network_address if ipaddress.IPv4Network(nodes['isp1'].prefix).prefixlen==32 else ipaddress.IPv4Network(nodes['isp1'].prefix).network_address+1)} for c in ['ce1','ce2']]}
    files['manifest.json']=json.dumps(manifest,indent=2)
    files['runner.py']=Path(__file__).with_name('lab_runner.py').read_text()
    files['README.txt']='''Network Configurator — FRR BGP pilot
Requires a Linux lab host, Docker, Containerlab, Python 3 and access to the selected FRR image.
Review manifest.json and use an isolated lab host. These commands create/delete only this named lab.
Run from this directory:
  sudo python3 runner.py start
  sudo python3 runner.py baseline
  sudo python3 runner.py fail
  sudo python3 runner.py restore
  sudo python3 runner.py stop
Upload results.json back into Network Lab & Simulation; each measurement includes raw CLI evidence.
The fail command captures a baseline, disables the selected CE interface, measures the failed-link state,
and restores the interface in a finally block. Run restore manually after a process/host interruption.
FRR tests protocol behavior only, not original Cisco/Arista/Huawei CLI, ASIC performance or production convergence.
Only AS, advertised prefixes, selected link IPs and Local Preference are modeled.
Optional CE interconnect uses direct iBGP peers with next-hop-self; production loopback peering is not reproduced.
BFD, filtering, prepend, MED, communities, maximum-prefix, VRFs, authentication and other features are not imported.
Results describe observed polling samples, not exact convergence time. A failed precondition blocks the fault test.
'''
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for name,data in files.items():z.writestr(name,data)
    return out.getvalue(),manifest

def install_network_lab(app,base):
    @app.get('/network-lab',response_class=HTMLResponse)
    def page():return HTMLResponse((base/'network-lab.html').read_text(),headers={'Cache-Control':'no-store'})
    @app.get('/simulation-report.js')
    def simulation_report_script():return Response((base/'simulation-report.js').read_text(),media_type='application/javascript',headers={'Cache-Control':'no-store'})
    @app.post('/api/network-lab/simulation-word')
    def simulation_word(payload:SimulationExport):
        try: report=build_simulation_docx(payload.model_dump())
        except (ValueError,OSError) as exc: raise HTTPException(status_code=400,detail='Invalid simulation topology image.') from exc
        return StreamingResponse(report,media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',headers={'Content-Disposition':'attachment; filename="simulation-report.docx"','Cache-Control':'no-store'})
    @app.get('/synthetic-bgp.js')
    def synthetic_engine():return Response((base/'synthetic-bgp.js').read_text(),media_type='application/javascript',headers={'Cache-Control':'no-store'})
    @app.get('/synthetic-lab.js')
    def synthetic_ui():return Response((base/'synthetic-lab.js').read_text(),media_type='application/javascript',headers={'Cache-Control':'no-store'})
    @app.get('/simulation-workbench.js')
    def simulation_workbench_script():return Response((base/'simulation-workbench.js').read_text(),media_type='application/javascript',headers={'Cache-Control':'no-store'})
    @app.get('/network-lab.js')
    def script():return Response((base/'network-lab.js').read_text(),media_type='application/javascript',headers={'Cache-Control':'no-store'})
    @app.get('/api/network-lab/status')
    def status():
        return {'state':'not_configured','liveCli':False,'message':'Central emulation service is not configured. Design preparation and configuration previews are available; virtual devices cannot start yet.'}
    @app.post('/api/network-lab/preview')
    def preview(lab:Lab):
        data,manifest=build(lab)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            configurations={n.id:z.read(f'configs/{n.id}/frr.conf').decode() for n in lab.nodes}
        return {'fingerprint':manifest['fingerprint'],'state':'prepared','configurations':configurations,'failure':manifest['failure']}
    @app.post('/api/network-lab/identity')
    def identity(lab:Lab):
        _,manifest=build(lab)
        return {'fingerprint':manifest['fingerprint']}
    @app.post('/api/network-lab/package')
    def package(lab:Lab):
        data,_=build(lab)
        return Response(data,media_type='application/zip',headers={'Content-Disposition':f'attachment; filename="{lab.name}.zip"','Cache-Control':'no-store'})
