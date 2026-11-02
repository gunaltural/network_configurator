"""Exercise the real application model adapter against a local inference service."""
import json
import os
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient
from engineering_ai import install_engineering_ai

def main():
    if os.environ.get('AI_PROVIDER') != 'local' or os.environ.get('AI_BASE_URL') != 'http://127.0.0.1:18081/v1':
        raise SystemExit('This evaluation only runs against the loopback model server.')
    app = FastAPI()
    install_engineering_ai(app)
    client = TestClient(app)
    evidence = [{'id':'cli-1','text':'Device: CE1\nCommand: show ip bgp summary\nL4: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\nL5: 192.0.2.2 4 65002 0 0 0 0 0 never Idle'}]
    results=[]
    for lang in ('en','tr'):
        start=time.monotonic()
        response=client.post('/api/ai/analyze',json={'module':'CLI_ANALYSIS','vendor':'Cisco IOS-XE','language':lang,'task':'report','evidence':evidence})
        response.raise_for_status()
        draft=response.json()['text']
        # A single evidence area needs no model selection; multiple areas may use one.
        assert response.json().get('mode') in ('observations-only', 'observations-and-model-selection'), 'No evidence-bound analysis returned'
        assert 'AS 65002 · Idle' in draft and '192.0.2.2' in draft
        results.append({'language':lang,'seconds':round(time.monotonic()-start,2),'draft':draft,'mentions_state':'idle' in draft.lower(),'cites_evidence':'cli-1' in draft,'cites_line':'L5' in draft or 'line 5' in draft.lower() or 'satır 5' in draft.lower()})
        print(json.dumps(results[-1],ensure_ascii=False),flush=True)
    if not all(r['mentions_state'] and r['cites_evidence'] and r['cites_line'] for r in results):
        raise SystemExit('Draft lacks the observed state or its citation; engineering review required.')

    # Exercise the same parser and endpoint used for a selected mixed support capture.
    import subprocess
    from pathlib import Path
    sample = Path('samples/analysis/tac-review.txt').read_text()
    evidence = json.loads(subprocess.check_output(['node','-e',"require('./show-analysis.js');console.log(JSON.stringify(ShowAnalysis.evidence(ShowAnalysis.parse(require('fs').readFileSync(0,'utf8')))))"],input=sample,text=True))
    response=client.post('/api/ai/analyze',json=dict(module='CLI_ANALYSIS', vendor='Cisco IOS-XE',language='tr',task='report',evidence=evidence))
    response.raise_for_status()
    draft=response.json()['text']
    for expected in ('Konfigürasyon ve RIB eşleşiyor: CORP', 'ACL MGMT-IN (in)', 'AS 64520 · Idle','FULL/DR','unsynchronized'):
        assert expected in draft,expected
    assert 'Konfigürasyon ve RIB eşleşiyor: GUEST' not in draft
    assert response.json()['mode'] in ('observations-only', 'observations-and-model-selection')
    print('Mixed TAC endpoint validated:', response.json()['mode'], flush=True)

if __name__=='__main__':
    main()
