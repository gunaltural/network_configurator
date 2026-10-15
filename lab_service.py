"""Central Containerlab service. Run on a dedicated Linux host, never on Render."""
import hashlib,hmac,io,json,os,re,secrets,subprocess,threading,zipfile
from pathlib import Path
from fastapi import FastAPI,HTTPException,Request
from pydantic import BaseModel,Field
from network_lab import Lab,build

service=FastAPI(docs_url=None,redoc_url=None);lock=threading.RLock()
ROOT=Path(os.getenv('LAB_DATA_DIR','/var/lib/network-configurator/labs'))
class Start(BaseModel):
    owner:str=Field(min_length=1,max_length=200)
    lab:Lab
class Action(BaseModel):
    owner:str=Field(min_length=1,max_length=200)
    node:str=Field(default='ce1',pattern=r'^(ce[12]|isp[12])$')
    commands:list[str]=Field(default_factory=list,max_length=20)
    link:str=Field(default='',max_length=40)
    up:bool=True

def execute(args,timeout=90):
    try:r=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    except (subprocess.TimeoutExpired,OSError):raise HTTPException(502,'Lab host command failed or timed out; inspect the central service.')
    return {'returncode':r.returncode,'output':(r.stdout+r.stderr)[-200000:]}
def record(id,owner):
    if not re.fullmatch(r'[a-f0-9]{24}',id):raise HTTPException(404,'Lab not found.')
    try:d=json.loads((ROOT/id/'runtime.json').read_text())
    except (OSError,ValueError):raise HTTPException(404,'Lab not found.')
    if not hmac.compare_digest(d['owner'],owner):raise HTTPException(404,'Lab not found.')
    return d
@service.middleware('http')
async def authenticate(request:Request,call_next):
    token=os.getenv('LAB_SERVICE_TOKEN','')
    from fastapi.responses import JSONResponse
    if len(token)<32:return JSONResponse({'detail':'Set a LAB_SERVICE_TOKEN of at least 32 characters.'},status_code=503)
    if not hmac.compare_digest(request.headers.get('authorization',''),'Bearer '+token):return JSONResponse({'detail':'Unauthorized'},status_code=401)
    return await call_next(request)
@service.get('/health')
def health():
    import shutil
    if not shutil.which('docker') or not shutil.which('containerlab'):raise HTTPException(503,'Docker or Containerlab is missing on the central host.')
    r=execute(['docker','info','--format','{{.ServerVersion}}'],10)
    if r['returncode']:raise HTTPException(503,'Docker is not available.')
    return {'state':'ready','liveCli':True,'consoleMode':'command','message':'Central FRR service connected. Command console is available; an interactive TTY is not included in this release.'}
@service.post('/labs')
def start(p:Start):
    with lock:
        ROOT.mkdir(parents=True,exist_ok=True)
        active=[f for f in ROOT.glob('*/runtime.json') if json.loads(f.read_text()).get('state')!='stopped']
        if len(active)>=int(os.getenv('LAB_MAX_ACTIVE','2')):raise HTTPException(409,'Central host lab limit reached. Stop an existing lab first.')
        if any(json.loads(f.read_text())['owner']==p.owner for f in active):raise HTTPException(409,'You already have an active or failed lab. Stop it before starting another.')
        # Pilot execution uses the reviewed fixed FRR image, never arbitrary user images.
        if p.lab.image!='quay.io/frrouting/frr:10.7.1':raise HTTPException(422,'Central pilot only supports the reviewed FRR 10.7.1 image.')
        original,manifest=build(p.lab);id=secrets.token_hex(12);folder=ROOT/id;folder.mkdir()
        with zipfile.ZipFile(io.BytesIO(original)) as z:z.extractall(folder)
        topology=json.loads((folder/'lab.clab.yml').read_text());topology['name']='nc-'+id
        for node in topology['topology']['nodes'].values():
            node['memory']='256MiB';node['cpu']=1
            node['binds']=[str(folder/entry.split(':')[0])+':'+entry.split(':',1)[1] for entry in node['binds']]
        (folder/'lab.clab.yml').write_text(json.dumps(topology))
        r={'id':id,'owner':p.owner,'state':'starting','fingerprint':manifest['fingerprint'],'name':topology['name']}
        (folder/'runtime.json').write_text(json.dumps(r))
        result=execute(['containerlab','deploy','-t',str(folder/'lab.clab.yml')],180)
        r['state']='running' if result['returncode']==0 else 'failed';r['output']=result['output'];(folder/'runtime.json').write_text(json.dumps(r))
        return {k:v for k,v in r.items() if k!='owner'}
@service.post('/current')
def current(p:Action):
    with lock:
        for f in ROOT.glob('*/runtime.json'):
            d=json.loads(f.read_text())
            if d['owner']==p.owner and d['state']!='stopped':
                m=json.loads((f.parent/'manifest.json').read_text())
                return {'id':d['id'],'state':d['state'],'fingerprint':d['fingerprint'],'model':m['lab'],'linkUp':d.get('linkUp',True)}
    return None
@service.post('/labs/{id}/stop')
def stop(id:str,p:Action):
    with lock:
        d=record(id,p.owner);result=execute(['containerlab','destroy','-t',str(ROOT/id/'lab.clab.yml')],120)
        d['state']='stopped' if result['returncode']==0 else 'failed';(ROOT/id/'runtime.json').write_text(json.dumps(d));return {'id':id,'state':d['state'],**result}
@service.post('/labs/{id}/commands')
def commands(id:str,p:Action):
    with lock:
        d=record(id,p.owner)
        if d['state']!='running':raise HTTPException(409,'Lab is not running.')
        if not p.commands or any(not c.strip() or len(c)>500 or re.search(r'[\x00-\x1f]|\b(shell|bash|zsh|exec|write|copy)\b|[!`]',c,re.I) for c in p.commands):raise HTTPException(422,'Use up to 20 FRR commands; shell and file operations are excluded.')
        args=['docker','exec','clab-'+d['name']+'-'+p.node,'vtysh']
        for c in p.commands:args+=['-c',c]
        result=execute(args,30)
        from datetime import datetime,timezone
        return {'node':p.node,'commands':p.commands,'observedAt':datetime.now(timezone.utc).isoformat(),**result}
@service.post('/labs/{id}/link')
def link(id:str,p:Action):
    with lock:
        d=record(id,p.owner)
        if d['state']!='running':raise HTTPException(409,'Lab is not running.')
        m=json.loads((ROOT/id/'manifest.json').read_text())
        if p.link!=m['failure']['link']:raise HTTPException(422,'Only the prepared failure link may be changed.')
        f=m['failure'];result=execute(['docker','exec','clab-'+d['name']+'-'+f['node'],'ip','link','set','dev',f['interface'],'up' if p.up else 'down'],10)
        if result['returncode']==0:
            d['linkUp']=p.up;(ROOT/id/'runtime.json').write_text(json.dumps(d))
        return {'link':p.link,'up':p.up,**result}
