"""Check that the actual local model runs the current engineering-review API.

These are transport and safety checks, NOT a benchmark claiming the small
model can independently find all design defects.
"""
import json
import os
import subprocess
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from engineering_ai import install_engineering_ai

MODES = {'model-evidence-cited-draft', 'model-unverified-draft'}

def require_real_review(client, payload):
    start = time.monotonic()
    response = client.post('/api/ai/analyze', json=payload)
    response.raise_for_status()
    data = response.json()
    mode = data.get('mode')
    assert mode in MODES, f'Expected an actual model draft, got {mode}: {data}'
    assert data.get('reviewRequired') is True
    assert isinstance(data.get('text'), str) and data['text'].strip()
    print(json.dumps({
        'mode': mode, 'seconds': round(time.monotonic() - start, 2),
        'knowledgeIds': data.get('knowledgeIds', []),
        'evidenceIds': data.get('evidenceIds', []),
        'preview': data['text'][:500],
    }, ensure_ascii=False), flush=True)
    return data

def main():
    if os.environ.get('AI_PROVIDER') != 'local' or os.environ.get('AI_BASE_URL') != 'http://127.0.0.1:18081/v1':
        raise SystemExit('This evaluation only runs against the loopback model server.')
    app = FastAPI()
    install_engineering_ai(app)
    client = TestClient(app)
    evidence = [{
        'id': 'cli-1-0',
        'text': 'Device: CE1\nCommand: show ip bgp summary\nL4: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\nL5: 192.0.2.2 4 65002 0 0 0 0 0 never Idle',
    }]
    for lang in ('en', 'tr'):
        result = require_real_review(client, {
            'module': 'CLI_ANALYSIS', 'vendor': 'Cisco IOS-XE',
            'language': lang, 'task': 'report', 'evidence': evidence,
        })
        assert 'bgp-control-plane' in result.get('knowledgeIds', []), result

    sample = Path('samples/analysis/tac-review.txt').read_text()
    parsed = subprocess.check_output(
        ['node', '-e', "require('./show-analysis.js');console.log(JSON.stringify(ShowAnalysis.evidence(ShowAnalysis.parse(require('fs').readFileSync(0,'utf8')))))"],
        input=sample, text=True)
    evidence = json.loads(parsed)
    result = require_real_review(client, {
        'module':'CLI_ANALYSIS', 'vendor':'Cisco IOS-XE',
        'language':'tr', 'task':'report', 'evidence':evidence,
    })
    assert result.get('knowledgeIds'), 'Relevant engineering knowledge was not retrieved'
    print('Real local model returned a draft; engineering correctness requires separate held-out evaluation.', flush=True)

if __name__ == '__main__':
    main()
