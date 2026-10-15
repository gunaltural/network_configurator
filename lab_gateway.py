"""Authenticated application-to-central-lab gateway; no browser service credentials."""
import json,os,re,urllib.request,urllib.error
from fastapi import HTTPException,Request
from pydantic import BaseModel,Field
from network_lab import Lab

def central(path,payload=None):
    url=os.getenv('LAB_SERVICE_URL','').rstrip('/');token=os.getenv('LAB_SERVICE_TOKEN','')
    if not url or len(token)<32:raise HTTPException(503,'Central emulation service is not configured.')
    if not url.startswith(('https://','http://')):raise HTTPException(503,'Invalid central service configuration.')
    request=urllib.request.Request(url+path,data=None if payload is None else json.dumps(payload).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=200 if path=='/labs' else 130) as r:return json.load(r)
    except urllib.error.HTTPError as e:
        try:detail=json.load(e).get('detail','Central lab request failed.')
        except Exception:detail='Central lab request failed.'
        raise HTTPException(e.code if e.code in (404,409,422,503) else 502,detail)
    except (OSError,ValueError):raise HTTPException(502,'Central emulation service is unreachable or returned an invalid response.')
class Command(BaseModel):
    node:str=Field(pattern=r'^(ce[12]|isp[12])$')
    commands:list[str]=Field(min_length=1,max_length=20)
class Fault(BaseModel):
    link:str=Field(pattern=r'^[a-zA-Z0-9_-]{1,40}$')
    up:bool

def install_lab_gateway(app):
    def owner(request):return getattr(request.state,'user',None) or 'local-development'
    def valid(id):
        if not re.fullmatch('[a-f0-9]{24}',id):raise HTTPException(404,'Lab not found.')
    @app.get('/api/network-lab/runtime/status')
    def status():
        if not os.getenv('LAB_SERVICE_URL') or len(os.getenv('LAB_SERVICE_TOKEN',''))<32:return {'state':'not_configured','liveCli':False,'message':'Central emulation service is not configured. You can transfer your design and inspect configurations; starting devices requires the central service.'}
        return central('/health')
    @app.get('/api/network-lab/runtime/current')
    def current(request:Request):return central('/current',{'owner':owner(request)})
    @app.post('/api/network-lab/runtime/labs')
    def start(lab:Lab,request:Request):return central('/labs',{'owner':owner(request),'lab':lab.model_dump()})
    @app.post('/api/network-lab/runtime/labs/{id}/stop')
    def stop(id:str,request:Request):valid(id);return central('/labs/'+id+'/stop',{'owner':owner(request)})
    @app.post('/api/network-lab/runtime/labs/{id}/commands')
    def commands(id:str,p:Command,request:Request):valid(id);return central('/labs/'+id+'/commands',{'owner':owner(request),**p.model_dump()})
    @app.post('/api/network-lab/runtime/labs/{id}/link')
    def link(id:str,p:Fault,request:Request):valid(id);return central('/labs/'+id+'/link',{'owner':owner(request),**p.model_dump()})
