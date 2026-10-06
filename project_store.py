"""Provider-independent PostgreSQL project documents and explicit save revisions."""
import json
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from typing import Any
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

MAX_DOCUMENT_BYTES = 4 * 1024 * 1024
SECRET_KEY = re.compile(r'password|passwd|secret|token|private.?key|credential', re.I)


def clean_document(value, depth=0):
    if depth > 60:
        raise ValueError('Project nesting exceeds the supported limit.')
    if isinstance(value, dict):
        return {key: clean_document(item, depth+1) for key,item in value.items() if not SECRET_KEY.search(key)}
    if isinstance(value, list):
        return [clean_document(item, depth+1) for item in value]
    return value


def normalize_document(value):
    if value.get('schema') != 'network-configurator-project-v1':
        raise ValueError('Unsupported project document format.')
    design, report = value.get('design'), value.get('reporting')
    if not design and not report:
        raise ValueError('Add a design or report before saving.')
    if design and (not isinstance(design,dict) or design.get('schema') != 'network-configurator-v3'):
        raise ValueError('Invalid technology workspace document.')
    if report and (not isinstance(report,dict) or report.get('schema') != 'network-configurator-report-v1'):
        raise ValueError('Invalid reporting document.')
    for part, keys in ((design,('workspace','moduleStates','fields')),(report,('source','projectDetails'))):
        if part:
            for key in keys:
                if key in part and not isinstance(part[key],dict) and not (key == 'source' and part[key] is None):
                    raise ValueError('Invalid project structure.')
    if report:
        for key in ('devices','moduleReports','inventoryDeviceIds'):
            if key in report and not isinstance(report[key],list): raise ValueError('Invalid project structure.')
        if any(not isinstance(row,dict) for key in ('devices','moduleReports') for row in report.get(key,[])):
            raise ValueError('Invalid project structure.')
        if any(not isinstance(item,str) for item in report.get('inventoryDeviceIds',[])):
            raise ValueError('Invalid project structure.')
    name = str(value.get('name','')).strip()
    if not name or len(name) > 120:
        raise ValueError('Enter a project name of at most 120 characters.')
    document = clean_document({'schema':value['schema'],'name':name,'design':design,'reporting':report})
    encoded = json.dumps(document,ensure_ascii=False,separators=(',',':'))
    if len(encoded.encode()) > MAX_DOCUMENT_BYTES:
        raise ValueError('Project exceeds the 4 MB document limit. Export it to a file instead.')
    return document, encoded


class ProjectRepository:
    def __init__(self, database_url=None, connect_factory=None):
        self.database_url = database_url if database_url is not None else os.getenv('DATABASE_URL','')
        self.connect_factory = connect_factory
        self.ready = False
        self.lock = threading.Lock()

    @property
    def configured(self):
        return bool(self.database_url or self.connect_factory)

    def connect(self):
        if self.connect_factory:
            return self.connect_factory()
        if not self.database_url:
            raise RuntimeError('Database is not configured.')
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(self.database_url, connect_timeout=8, row_factory=dict_row)

    def ensure_schema(self):
        if self.ready:
            return
        with self.lock:
            if self.ready:
                return
            with self.connect() as db:
                db.execute('''CREATE TABLE IF NOT EXISTS nc_projects (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    version INTEGER NOT NULL, payload TEXT NOT NULL)''')
                db.execute('CREATE INDEX IF NOT EXISTS nc_projects_owner ON nc_projects(owner, updated_at)')
                db.execute('''CREATE TABLE IF NOT EXISTS nc_project_revisions (
                    project_id TEXT NOT NULL REFERENCES nc_projects(id), revision INTEGER NOT NULL,
                    created_at TEXT NOT NULL, note TEXT NOT NULL, payload TEXT NOT NULL,
                    PRIMARY KEY (project_id, revision))''')
            self.ready = True

    @staticmethod
    def metadata(row):
        payload=json.loads(row['payload'])
        design=payload.get('design') or {}; report=payload.get('reporting') or {}
        text=lambda value: value if isinstance(value,str) else ''
        vendors=set(filter(None,[text(design.get('workspace',{}).get('platform')),text(report.get('vendor'))]))
        for module in report.get('moduleReports',[]):
            if text(module.get('vendor')): vendors.add(module['vendor'])
        modules=set(design.get('moduleStates',{}))
        if text(design.get('workspace',{}).get('technology')): modules.add(design['workspace']['technology'])
        modules.update(m.get('module') for m in report.get('moduleReports',[]) if text(m.get('module')))
        inventory_ids=set(report.get('inventoryDeviceIds',[]))
        return {'id':row['id'],'name':row['name'],'version':row['version'],'created_at':row['created_at'],
                'updated_at':row['updated_at'],'vendors':sorted(vendors),'modules':sorted(modules),
                'has_design':bool(design),'has_reporting':bool(report),
                'inventory_count':sum(text(d.get('id')) in inventory_ids for d in report.get('devices',[])),
                'document_bytes':len(row['payload'].encode())}

    def listing(self, owner, query='', offset=0):
        self.ensure_schema()
        with self.connect() as db:
            # LIKE wildcards remain literal user search input.
            pattern='%'+query.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
            where="owner = %s AND LOWER(name) LIKE LOWER(%s) ESCAPE '\\'"
            total=db.execute('SELECT COUNT(*) AS total FROM nc_projects WHERE '+where,(owner,pattern)).fetchone()['total']
            rows=db.execute('SELECT * FROM nc_projects WHERE '+where+' ORDER BY updated_at DESC, id LIMIT 50 OFFSET %s',(owner,pattern,offset)).fetchall()
        return {'projects':[self.metadata(row) for row in rows],'total':total,'offset':offset,'limit':50}

    def get(self, owner, project_id):
        self.ensure_schema()
        with self.connect() as db:
            row=db.execute('SELECT * FROM nc_projects WHERE owner=%s AND id=%s',(owner,project_id)).fetchone()
        if not row:
            raise HTTPException(404,'Project not found.')
        return {**self.metadata(row),'document':json.loads(row['payload'])}

    def save(self, owner, document, project_id=None, version=None, note='', create_revision=False, expected_updated_at=None):
        new_project=project_id is None
        document, encoded=normalize_document(document)
        self.ensure_schema()
        now=datetime.now(timezone.utc).isoformat()
        with self.connect() as db:
            if project_id:
                row=db.execute('SELECT * FROM nc_projects WHERE owner=%s AND id=%s',(owner,project_id)).fetchone()
                if not row: raise HTTPException(404,'Project not found.')
                if row['version'] != version or row['updated_at'] != expected_updated_at:
                    raise HTTPException(409,'This project changed in another session. Open the latest record or save a new copy.')
                next_version=version+1 if create_revision else version
                updated=db.execute('UPDATE nc_projects SET name=%s,updated_at=%s,version=%s,payload=%s WHERE owner=%s AND id=%s AND version=%s AND updated_at=%s',(document['name'],now,next_version,encoded,owner,project_id,version,expected_updated_at))
                if updated.rowcount != 1:
                    raise HTTPException(409,'This project changed in another session. Open the latest record or save a new copy.')
                created=row['created_at']
                if not create_revision:
                    db.execute('UPDATE nc_project_revisions SET created_at=%s,note=%s,payload=%s WHERE project_id=%s AND revision=%s',(now,note.strip(),encoded,project_id,next_version))
            else:
                project_id=str(uuid.uuid4());next_version=1;created=now
                db.execute('INSERT INTO nc_projects(id,owner,name,created_at,updated_at,version,payload) VALUES(%s,%s,%s,%s,%s,%s,%s)',(project_id,owner,document['name'],now,now,1,encoded))
            if new_project or create_revision:
                db.execute('INSERT INTO nc_project_revisions(project_id,revision,created_at,note,payload) VALUES(%s,%s,%s,%s,%s)',(project_id,next_version,now,note.strip(),encoded))
        return self.metadata({'id':project_id,'name':document['name'],'created_at':created,'updated_at':now,'version':next_version,'payload':encoded})

    def delete(self, owner, project_id, confirmed, expected_updated_at):
        self.ensure_schema()
        with self.connect() as db:
            row=db.execute('SELECT * FROM nc_projects WHERE owner=%s AND id=%s',(owner,project_id)).fetchone()
            if not row: raise HTTPException(404,'Project not found.')
            if not confirmed:
                raise HTTPException(400,'Confirm project deletion.')
            if expected_updated_at != row['updated_at']:
                raise HTTPException(409,'Project changed. Refresh the list before deleting.')
            # Claim the current record before removing its history, in the same transaction.
            claim=db.execute('UPDATE nc_projects SET updated_at=%s WHERE owner=%s AND id=%s AND updated_at=%s',(datetime.now(timezone.utc).isoformat(),owner,project_id,expected_updated_at))
            if claim.rowcount != 1: raise HTTPException(409,'Project changed. Refresh before deleting.')
            db.execute('DELETE FROM nc_project_revisions WHERE project_id=%s',(project_id,))
            db.execute('DELETE FROM nc_projects WHERE owner=%s AND id=%s',(owner,project_id))
        return {'deleted':True,'id':project_id}

    def delete_revision(self, owner, project_id, revision, confirmed):
        if not confirmed: raise HTTPException(400,'Confirm revision deletion.')
        self.ensure_schema()
        with self.connect() as db:
            row=db.execute('SELECT * FROM nc_projects WHERE owner=%s AND id=%s',(owner,project_id)).fetchone()
            if not row: raise HTTPException(404,'Project not found.')
            if revision >= row['version']:
                raise HTTPException(400,'The current revision is protected and cannot be deleted separately.')
            # Lock the parent without changing its edit timestamp or current content.
            claim=db.execute('UPDATE nc_projects SET version=version WHERE owner=%s AND id=%s AND version=%s',(owner,project_id,row['version']))
            if claim.rowcount != 1: raise HTTPException(409,'Project changed. Refresh its history.')
            deleted=db.execute('DELETE FROM nc_project_revisions WHERE project_id=%s AND revision=%s',(project_id,revision))
            if deleted.rowcount != 1: raise HTTPException(404,'Revision not found.')
        return {'deleted':True,'id':project_id,'revision':revision}

    def revisions(self, owner, project_id):
        project=self.get(owner,project_id)
        with self.connect() as db:
            rows=db.execute('SELECT revision,created_at,note FROM nc_project_revisions WHERE project_id=%s ORDER BY revision DESC LIMIT 100',(project_id,)).fetchall()
        return {'current_revision':project['version'],'revisions':[dict(row) for row in rows]}

    def revision(self, owner, project_id, revision):
        self.get(owner,project_id)
        with self.connect() as db:
            row=db.execute('SELECT payload,created_at,note FROM nc_project_revisions WHERE project_id=%s AND revision=%s',(project_id,revision)).fetchone()
        if not row: raise HTTPException(404,'Revision not found.')
        return {'document':json.loads(row['payload']),'revision':revision,'created_at':row['created_at'],'note':row['note']}


class SaveProjectRequest(BaseModel):
    document: dict[str, Any]
    version: int | None = Field(default=None,ge=1)
    note: str = Field(default='',max_length=500)
    create_revision: bool = False
    expected_updated_at: str | None = Field(default=None,max_length=64)


class DeleteRevisionRequest(BaseModel):
    confirmed: bool = False


class DeleteProjectRequest(DeleteRevisionRequest):
    expected_updated_at: str = Field(max_length=64)


def install_project_store(app, repository=None):
    repository=repository or ProjectRepository()
    app.state.project_repository=repository

    def owner(request):
        user=getattr(request.state,'user',None)
        if user: return user
        if not app.state.authentication.enabled: return 'local-development'
        raise HTTPException(401,'Sign in required.')

    def run(operation):
        try: return operation()
        except HTTPException: raise
        except ValueError as error: raise HTTPException(400,str(error)) from None
        except Exception: raise HTTPException(503,'Project database unavailable. Your local project and file export remain available.') from None

    @app.get('/api/projects/status')
    def status(request: Request):
        owner(request)
        if not repository.configured: return {'configured':False,'available':False,'document_limit_bytes':MAX_DOCUMENT_BYTES}
        try:
            repository.ensure_schema()
            with repository.connect() as db: db.execute('SELECT 1')
            return {'configured':True,'available':True,'document_limit_bytes':MAX_DOCUMENT_BYTES}
        except Exception: return {'configured':True,'available':False,'document_limit_bytes':MAX_DOCUMENT_BYTES}

    @app.get('/api/projects')
    def listing(request: Request, q: str='', offset: int=0):
        if len(q)>120 or offset<0: raise HTTPException(400,'Invalid search or page.')
        return run(lambda:repository.listing(owner(request),q,offset))

    @app.post('/api/projects',status_code=201)
    def create(data: SaveProjectRequest, request: Request):
        return run(lambda:repository.save(owner(request),data.document,note=data.note))

    @app.get('/api/projects/{project_id}')
    def get(project_id: uuid.UUID,request: Request):
        return run(lambda:repository.get(owner(request),str(project_id)))

    @app.put('/api/projects/{project_id}')
    def save(project_id: uuid.UUID,data: SaveProjectRequest,request: Request):
        return run(lambda:repository.save(owner(request),data.document,str(project_id),data.version,data.note,data.create_revision,data.expected_updated_at))

    @app.delete('/api/projects/{project_id}')
    def delete(project_id: uuid.UUID,data: DeleteProjectRequest,request: Request):
        return run(lambda:repository.delete(owner(request),str(project_id),data.confirmed,data.expected_updated_at))

    @app.get('/api/projects/{project_id}/revisions')
    def history(project_id: uuid.UUID,request: Request):
        return run(lambda:repository.revisions(owner(request),str(project_id)))

    @app.delete('/api/projects/{project_id}/revisions/{revision}')
    def delete_revision(project_id: uuid.UUID,revision: int,data: DeleteRevisionRequest,request: Request):
        return run(lambda:repository.delete_revision(owner(request),str(project_id),revision,data.confirmed))

    @app.get('/api/projects/{project_id}/revisions/{revision}')
    def revision(project_id: uuid.UUID,revision: int,request: Request):
        return run(lambda:repository.revision(owner(request),str(project_id),revision))

    return repository
