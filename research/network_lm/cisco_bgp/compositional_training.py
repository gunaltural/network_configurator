"""Read-only, train-only composition corpus from our BGP simulator.

The output of the original engine is supervision, not a fallback inference
implementation. No simulation calls occur during scratch model generation.
"""
from hashlib import sha256
from pathlib import Path
import json
import re
import subprocess

from ..data import Example, SECRET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = HERE / "compositional_scenarios.mjs"

def load_compositional_cases(*, expected_source_sha):
    response = subprocess.run(
        ["node", str(SOURCE)], cwd=ROOT, check=True, capture_output=True,
        text=True, encoding="utf-8", timeout=30,
    )
    rows = [json.loads(l) for l in response.stdout.splitlines() if l.strip()]
    if len(rows) != 16 * 12 * 5:
        raise ValueError("Unexpected number of composed causal examples")
    seen_ids, seen_inputs, groups, examples = set(), set(), set(), []
    for record in rows:
        required = {"id", "scenario_id", "split", "input", "completion", "provenance"}
        if not isinstance(record, dict) or set(record) != required:
            raise ValueError("Malformed simulator-derived causal curriculum")
        if (record["split"] != "train" or not all(
                type(record[k]) is str and record[k].strip()
                for k in ("id", "scenario_id", "input", "completion"))):
            raise ValueError("Only original train-only causal samples are permitted")
        if not record["id"].startswith("compose-"):
            raise ValueError("Unexpected train-only composition identifier")
        if (record["id"] in seen_ids or
                record["input"] in seen_inputs):
            raise ValueError("Repeated composition case")
        seen_ids.add(record["id"])
        seen_inputs.add(record["input"])
        groups.add(record["scenario_id"])
        meta = record["provenance"]
        if (not isinstance(meta, dict)
                or meta.get("source_sha256") != expected_source_sha
                or meta.get("source") != "synthetic-bgp.js"
                or meta.get("live_verification") is not False
                or meta.get("direct_candidate_verified_with_engine") is not True
                or meta.get("alternate_candidate_verified_with_engine") is not True):
            raise ValueError("Causal corpus is not verified against original engine")
        if ("LIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING" not in record["completion"]
                or SECRET.search(record["input"]+"\n"+record["completion"])):
            raise ValueError("Unsafe or unjustified simulated evidence")
        if not (record["completion"].startswith("RESULT=")
                or record["completion"].startswith("CE1_DIRECT_WAN1=")):
            raise ValueError("Unexpected causal training target")
        examples.append(Example(
            record["id"], record["scenario_id"], "train",
            record["input"], record["completion"],
        ))
    if len(groups) != 16:
        raise ValueError("Missing independent train-only failure groups")
    fingerprint = sha256(response.stdout.encode("utf-8")).hexdigest()
    return examples, fingerprint
