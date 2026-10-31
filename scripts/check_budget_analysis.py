"""Acceptance check against the running resource-limited app, with synthetic evidence only."""
import concurrent.futures
import json
import time
import urllib.request

BASE = 'http://127.0.0.1:18100'
EVIDENCE = {'id':'cli-1','text':'Device: CE1\nCommand: show ip bgp summary\nL4: Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\nL5: 192.0.2.2 4 65002 0 0 0 0 0 never Idle'}

def analyze(lang):
    data = dict(module='CLI_ANALYSIS', vendor='Cisco IOS-XE', language=lang, task='report', evidence=[EVIDENCE])
    req = urllib.request.Request(BASE+'/api/ai/analyze', data=json.dumps(data).encode(), headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=50) as response:
        draft = json.load(response)
    assert draft['mode']=='observations-and-model-selection', draft
    assert '192.0.2.2 · AS 65002 · Idle [cli-1, L5' in draft['text'], draft

with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
    for language in ('en','tr'):
        start=time.monotonic()
        work=pool.submit(analyze,language)
        while not work.done():
            with urllib.request.urlopen(BASE+'/healthz', timeout=5) as response:
                assert json.load(response)['ok'] is True
            time.sleep(0.25)
        work.result()
        print(f'{language}: verified real inference; application health remained available; {time.monotonic()-start:.2f}s')
