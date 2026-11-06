"""Independent V4 evaluation-only Cisco BGP topology shift.

This module must never supply train_bpe(...) or optimizer batches. It
re-evaluates an unchanged original simulator and validates SHA provenance.
"""
from hashlib import sha256
from pathlib import Path
import json
import re
import subprocess

from ..data import Example, SECRET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
V4_GENERATOR = HERE / "novel_topologies_v4.mjs"


def load_v4_holdout(*, source_sha):
    process = subprocess.run(
        ["node", str(V4_GENERATOR)], cwd=ROOT, capture_output=True,
        text=True, encoding="utf-8", check=True, timeout=30,
    )
    source_actual = sha256((ROOT / "synthetic-bgp.js").read_bytes()).hexdigest()
    if source_sha != source_actual:
        raise ValueError("V4 source checksum mismatch")
    seen_ids, seen_inputs, scenarios, cases = set(), set(), set(), []
    for line in process.stdout.splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict) or set(row) != {
            "id", "scenario_id", "split", "input", "completion", "provenance"
        }:
            raise ValueError("Unexpected V4 record schema")
        if row["split"] != "test" or any(
            not isinstance(row[k], str) or not row[k]
            for k in ("id", "scenario_id", "input", "completion")
        ):
            raise ValueError("V4 records are evaluation-only")
        if row["id"] in seen_ids or row["input"] in seen_inputs:
            raise ValueError("Duplicate V4 examples")
        seen_ids.add(row["id"])
        seen_inputs.add(row["input"])
        scenarios.add(row["scenario_id"])
        meta = row["provenance"]
        if (not isinstance(meta, dict)
                or meta.get("source") != "synthetic-bgp.js"
                or meta.get("source_sha256") != source_sha
                or meta.get("live_verification") is not False
                or meta.get("kind") != "evaluation-only-independent-topology-v4"
                or not isinstance(meta.get("ce_as"), int)
                or meta.get("ce_as") < 65120
                or not str(meta.get("owner_prefix", "")).startswith("172.")
                or SECRET.search(row["input"] + "\n" + row["completion"])):
            raise ValueError("V4 must have original synthetic provenance")
        if (not re.fullmatch(
                r"RESULT=[A-Z0-9_]+\n"
                r"LIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING",
                row["completion"],
            )):
            raise ValueError("Unsupported V4 target")
        cases.append(Example(
            row["id"], row["scenario_id"], "test",
            row["input"], row["completion"],
        ))
    if len(cases) != 144 or len(scenarios) != 6:
        raise ValueError("Invalid V4 independent topology coverage")
    return cases, sha256(process.stdout.encode("utf-8")).hexdigest()
