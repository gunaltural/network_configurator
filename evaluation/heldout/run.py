"""Run every blind synthetic engineering case and report independent failures.

Neither holdout answers nor expected phrases are sent to inference. Passing this
automated proxy is necessary, but insufficient, for expert engineering sign-off.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient
from engineering_ai import install_engineering_ai
from evaluation.heldout.grade import grade_response

assert (
    (os.environ.get("AI_PROVIDER") == "local" and
     os.environ.get("AI_BASE_URL") == "http://127.0.0.1:18081/v1") or
    (os.environ.get("AI_PROVIDER") == "groq" and
     os.environ.get("GROQ_API_KEY") and
     os.environ.get("AI_MODEL") == "openai/gpt-oss-120b")
), "Use an approved local endpoint or explicit Groq test credential."

app = FastAPI()
install_engineering_ai(app)
client = TestClient(app)
cases = json.loads(Path(__file__).with_name("cases.json").read_text())
suite = sys.argv[1] if len(sys.argv) > 1 else ""
selected = [c for c in cases if c["tech"] == suite and "acceptance" in c]
assert selected, "No independent acceptance cases selected; refusing false-green result."

capability = client.get("/api/ai/status").json()
structured = bool(capability.get("structuredClaimsSupported"))
print("EVALUATION_PROFILE " + json.dumps({
    "suite": suite, "provider": capability.get("provider"),
    "structured_claims": structured, "case_count": len(selected),
    "engineering_correctness_preaccepted": False
}), flush=True)

failures = []
for case in selected:
    evidence = json.loads(subprocess.check_output([
        "node", "-e",
        "require('./show-analysis.js'); const a=ShowAnalysis;"
        "console.log(JSON.stringify(a.evidence(a.parse("
        "require('fs').readFileSync(0,'utf8')))))"
    ], input=case["raw"], text=True))
    request = {
        "module": "CLI_ANALYSIS", "vendor": case["vendor"],
        "language": "tr", "task": "report", "evidence": evidence,
        "reviewFormat": "evidence-claims-v1" if structured else "text"
    }
    start = time.monotonic()
    response = client.post("/api/ai/analyze", json=request)
    try:
        body = response.json()
    except ValueError:
        body = {}
    # Only synthetic diagnostic evidence: no customer device data in logs.
    print("CASE_RESULT " + json.dumps({
        "id": case["id"], "status": response.status_code,
        "seconds": round(time.monotonic() - start, 2),
        "mode": body.get("mode"), "claimReviewStatus": body.get("claimReviewStatus")
    }, ensure_ascii=False), flush=True)
    grade = grade_response(response.status_code, body, evidence, case["acceptance"],
                           structured=structured)
    print("ACCEPTANCE_RESULT " + json.dumps({"id": case["id"], **grade},
                                            ensure_ascii=False), flush=True)
    if not grade["passed"]:
        failures.append({"id": case["id"], "categories": grade["failure_categories"]})

print("SUITE_RESULT " + json.dumps({
    "suite": suite, "passed": len(selected) - len(failures),
    "total": len(selected), "failed": failures,
    "accepted": not failures and len(selected) > 0,
    "expert_signoff": False
}, ensure_ascii=False), flush=True)
if failures:
    raise SystemExit("Engineering reasoning acceptance FAILED: " + suite)
