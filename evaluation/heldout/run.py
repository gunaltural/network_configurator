"""Record actual responses (including failures). No rubric or hints sent to inference."""
import json, os, subprocess, sys, time
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from engineering_ai import install_engineering_ai
assert (os.environ.get('AI_PROVIDER') == 'local' and os.environ.get('AI_BASE_URL') == 'http://127.0.0.1:18081/v1') or (os.environ.get('AI_PROVIDER') == 'groq' and os.environ.get('GROQ_API_KEY') and os.environ.get('AI_MODEL') == 'openai/gpt-oss-120b'), 'Use an approved local endpoint or an explicit Groq test credential.'
app=FastAPI()
install_engineering_ai(app)
cases=json.loads(Path(__file__).with_name('cases.json').read_text())
for c in cases:
    if c['tech']!=sys.argv[1]: continue
    evidence=json.loads(subprocess.check_output(['node','-e',"require('./show-analysis.js');const a=ShowAnalysis;console.log(JSON.stringify(a.evidence(a.parse(require('fs').readFileSync(0,'utf8')))))"],input=c['raw'],text=True))
    start=time.monotonic()
    response=TestClient(app).post('/api/ai/analyze',json=dict(module='CLI_ANALYSIS',vendor=c['vendor'],language='tr',task='report',evidence=evidence))
    print('CASE_RESULT '+json.dumps(dict(id=c['id'],status=response.status_code,seconds=round(time.monotonic()-start,2),response=response.json()),ensure_ascii=False),flush=True)
    if 'acceptance' in c:
        rules=c['acceptance']
        body=response.json() if response.status_code==200 else {}
        output=str(body.get('text','')).lower()
        import re
        missing=[term for term in rules.get('must_mention',[]) if term.lower() not in output]
        unsupported=[term for term in rules.get('must_not_claim',[]) if term.lower() in output]
        # Validate citations against actual submitted CLI lines, not just syntax.
        available = {}
        for item in evidence:
            if isinstance(item, dict):
                available[str(item.get('id', '')).lower()] = {
                    int(number) for number in re.findall(r'(?m)^L(\d+):', str(item.get('text', '')))
                }
        references = [(match.group(1), int(match.group(2)))
                      for match in re.finditer(r'\[([\w-]+),\s*L(\d+)\]', output, re.I)]
        invalid_citations = [f'{evidence_id}:L{line}' for evidence_id, line in references
                             if line not in available.get(evidence_id.lower(), set())]
        citations = len(references) - len(invalid_citations)
        minimum=rules.get('minimum_line_citations',0)
        distinct_evidence_ids = len({evidence_id.lower() for evidence_id, line in references if line in available.get(evidence_id.lower(), set())})
        minimum_distinct = rules.get('minimum_distinct_evidence_ids', 0)
        passed=response.status_code==200 and not missing and not unsupported and citations>=minimum and distinct_evidence_ids>=minimum_distinct and not invalid_citations and body.get('mode')=='model-evidence-cited-draft'
        print('ACCEPTANCE_RESULT '+json.dumps(dict(id=c['id'],passed=passed,missing_terms=missing,unsupported_claims=unsupported,valid_citation_count=citations,distinct_evidence_ids=distinct_evidence_ids,expected_minimum_distinct=minimum_distinct,invalid_citations=invalid_citations,expected_minimum=minimum,mode=body.get('mode')),ensure_ascii=False),flush=True)
        if not passed:
            raise SystemExit(f"Engineering reasoning acceptance FAILED: {c['id']}")

