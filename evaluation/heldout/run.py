"""Record actual responses (including failures). No rubric or hints sent to inference."""
import json, os, subprocess, sys, time
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from engineering_ai import install_engineering_ai
assert os.environ['AI_BASE_URL']=='http://127.0.0.1:18081/v1' and os.environ['AI_PROVIDER']=='local'
app=FastAPI()
install_engineering_ai(app)
cases=json.loads(Path(__file__).with_name('cases.json').read_text())
for c in cases:
    if c['tech']!=sys.argv[1]: continue
    evidence=json.loads(subprocess.check_output(['node','-e',"require('./show-analysis.js');const a=ShowAnalysis;console.log(JSON.stringify(a.evidence(a.parse(require('fs').readFileSync(0,'utf8')))))"],input=c['raw'],text=True))
    start=time.monotonic()
    response=TestClient(app).post('/api/ai/analyze',json=dict(module='CLI_ANALYSIS',vendor=c['vendor'],language='tr',task='report',evidence=evidence))
    print('CASE_RESULT '+json.dumps(dict(id=c['id'],status=response.status_code,seconds=round(time.monotonic()-start,2),response=response.json()),ensure_ascii=False),flush=True)
