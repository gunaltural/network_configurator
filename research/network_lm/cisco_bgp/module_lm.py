"""Teach the independent scratch BGP language model using our OWN modules.

Source 1: Design/traffic policy facts (original, line-traceable paraphrases).
Source 2: actual synthetic-bgp.js evaluation of controlled failures.
Both are research-only: failure outputs are SIMULATIONS, never live evidence.
Separate failure-group holdouts prevent the model from seeing the exact
incident combination during optimizer updates. This is a controlled ablation,
not a Cisco-certified technical diagnosis.
"""
from argparse import ArgumentParser
from dataclasses import asdict
from hashlib import sha256
from pathlib import Path
import json
import random
import re
import subprocess

import torch

from ..data import Example, encode_example, SECRET
from ..model import LMConfig, ScratchNetworkLM
from ..train import batch, validate
from .tokenizer import train_bpe
from .compositional_training import load_compositional_cases

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
GENERATOR = HERE / "module_scenarios.mjs"
KNOWLEDGE = HERE / "internal_module_knowledge.json"
FIELDS = ("CE1_EXIT", "CE1_PREFIX_INBOUND", "SHARED_LAN_INBOUND",
          "CLIENT_OUTBOUND", "LIMITATION")


def load_owned_module_cases():
    """Re-evaluate the existing JS engine; do not take predicted states on faith."""
    result = subprocess.run(
        ["node", str(GENERATOR)], cwd=ROOT, capture_output=True,
        text=True, encoding="utf-8", check=True, timeout=30,
    )
    records = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    expected_count = {"train": 192, "val": 10, "test": 24}
    ids, text_hashes, groups, src_hashes = set(), set(), {}, set()
    grouped = {"train": [], "val": [], "test": []}
    for row in records:
        if (not isinstance(row, dict)
                or set(row) != {"id", "scenario_id", "split", "input",
                                "completion", "provenance"}
                or row["split"] not in grouped
                or any(type(row[k]) is not str or not row[k] for k in
                       ("id", "scenario_id", "input", "completion"))
                or SECRET.search(row["input"] + "\n" + row["completion"])):
            raise ValueError("Invalid module-derived research case")
        if (row["id"] in ids or
                sha256(row["input"].encode()).hexdigest() in text_hashes):
            raise ValueError("Duplicate simulation research case")
        ids.add(row["id"])
        text_hashes.add(sha256(row["input"].encode()).hexdigest())
        if (row["scenario_id"] in groups and groups[row["scenario_id"]] != row["split"]):
            raise ValueError("Scenario group leaked across splits")
        groups[row["scenario_id"]] = row["split"]
        origin = row["provenance"]
        if (origin.get("source") != "synthetic-bgp.js"
                or origin.get("live_verification") is not False
                or origin.get("engine") != "Synthetic BGP design model v4"):
            raise ValueError("Source must be original synthetic simulation")
        src_hashes.add(origin.get("source_sha256"))
        for field in FIELDS:
            if not re.search(r"(?m)^" + field + r"=[A-Z0-9_]+$", row["completion"]):
                raise ValueError("Invalid model-generated teaching target")
        grouped[row["split"]].append(
            Example(row["id"], row["scenario_id"], row["split"],
                    row["input"], row["completion"]))
    if {key: len(rows) for key, rows in grouped.items()} != expected_count:
        raise ValueError("Unexpected source fixture counts")
    actual_sha = sha256((ROOT / "synthetic-bgp.js").read_bytes()).hexdigest()
    if src_hashes != {actual_sha}:
        raise ValueError("Source implementation changed under the research dataset")
    for lhs in ("train", "val", "test"):
        for rhs in ("train", "val", "test"):
            if lhs != rhs and {
                x.scenario_id for x in grouped[lhs]
            }.intersection(x.scenario_id for x in grouped[rhs]):
                raise ValueError("Split leakage of failure combinations")
    return grouped, actual_sha


def focused_cases(examples):
    """Teach one modeled outcome at a time; no answer enters the prompt."""
    tasks = []
    for ex in examples:
        expected = dict(line.split("=", 1) for line in ex.completion.splitlines())
        for field in FIELDS[:4]:
            tasks.append(Example(
                ex.id + "-" + field, ex.scenario_id, ex.split,
                ex.prompt + "\nRequested simulator outcome: " + field + ".",
                "RESULT=" + expected[field]
                + "\nLIMITATION=SIMULATION_NOT_LIVE_BGP_OR_FORWARDING",
            ))
    return tasks


def design_teaching_examples(repetitions=5):
    """Original explanations from curated project source, never Cisco body text."""
    obj = json.loads(KNOWLEDGE.read_text(encoding="utf-8"))
    if obj.get("version") != "bgp-internal-module-knowledge-2026-11-06-v1":
        raise ValueError("Unknown research knowledge catalog")
    result = []
    for fact in obj["facts"]:
        if (not fact.get("id") or not fact.get("src") or not fact.get("loc")
                or not all(fact.get(k) for k in
                           ("topic", "observation", "verify", "not_proven"))):
            raise ValueError("Incomplete original knowledge fact")
        source_path = ROOT / fact["src"]
        if not source_path.is_file():
            raise ValueError("Knowledge source module missing")
        for n in range(repetitions):
            prompt = (
                "BGP Design question: " + fact["topic"] + "\n"
                + ("Use the proposed design, NOT actual network telemetry.\n"
                   if n % 2 else "Explain the scoped design parameter cautiously.\n")
                + "Source domain: Cisco IOS/IOS-XE synthetic planning."
            )
            answer = (
                "DESIGN_OBSERVATION=" + fact["observation"] + "\n"
                "READ_ONLY_CHECK=" + fact["verify"] + "\n"
                "NOT_PROVEN=" + fact["not_proven"] + "\n"
                "LIMITATION=DESIGN_CHECK_NOT_LIVE_NETWORK"
            )
            if SECRET.search(prompt + answer):
                raise ValueError("Sensitive content in source-derived teaching")
            result.append(Example("design-" + fact["id"] + "-" + str(n),
                                  "design-" + fact["id"], "train", prompt, answer))
    return result


def prompt_tokens(example, tok):
    return tok.encode(
        "Network observation:\n" + example.prompt + "\nEngineering review:\n",
        bos=True,
    )


@torch.no_grad()
def grade_simulation(model, tok, examples, *, max_new_tokens=160):
    model.eval()
    fields_correct = {field: 0 for field in FIELDS}
    full = 0
    all_four = 0
    previews = []
    for example in examples:
        prefix = prompt_tokens(example, tok)
        if len(prefix) > model.config.block_size:
            raise ValueError("Heldout evidence exceeds model context")
        generated = model.complete(prefix, max_new_tokens=max_new_tokens)
        decoded = tok.decode(generated[len(prefix):]).strip()
        expected = dict(line.split("=", 1) for line in example.completion.splitlines())
        parsed = {}
        for line in decoded.splitlines():
            if "=" in line:
                key, value = line.split("=", 1)
                if key in FIELDS and key not in parsed:
                    parsed[key] = value.strip()
        for field in FIELDS:
            fields_correct[field] += parsed.get(field) == expected[field]
        all_four += all(parsed.get(k) == expected[k] for k in FIELDS[:4])
        full += decoded == example.completion
        if len(previews) < 6:
            previews.append({"case": example.id, "expected": expected,
                             "generated": decoded[:300],
                             "all_four_correct": all(
                                 parsed.get(k) == expected[k] for k in FIELDS[:4])})
    return {
        "cases": len(examples),
        "exact_canonical": full,
        "all_four_outcomes_correct": all_four,
        "field_correct": fields_correct,
        "first_six": previews,
        "engineering_verified": False,
        "production_ready": False,
    }


def grade_focused(model, tokenizer, examples, *, max_new_tokens=100):
    """Score generated individual results, not just the presence of headers."""
    model.eval()
    by_field = {field: {"correct": 0, "total": 0} for field in FIELDS[:4]}
    full, previews = 0, []
    for ex in examples:
        field = ex.id.rsplit("-", 1)[-1]
        if field not in by_field:
            raise ValueError("Unknown focused BGP task")
        prefix = prompt_tokens(ex, tokenizer)
        if len(prefix) > model.config.block_size:
            raise ValueError("Focused heldout exceeds model context")
        with torch.no_grad():
            produced = tokenizer.decode(
                model.complete(prefix, max_new_tokens=max_new_tokens)[len(prefix):]
            ).strip()
        correct_line = ex.completion.splitlines()[0]
        observed = next(
            (line for line in produced.splitlines() if line.startswith("RESULT=")),
            None,
        )
        good = observed == correct_line
        by_field[field]["correct"] += int(good)
        by_field[field]["total"] += 1
        full += produced == ex.completion
        if len(previews) < 6:
            previews.append({"case": ex.id, "expected": ex.completion,
                             "generated": produced[:200], "result_correct": good})
    return {
        "cases": len(examples),
        "correct_single_outcome": sum(x["correct"] for x in by_field.values()),
        "exact_canonical": full, "by_field": by_field,
        "first_six": previews, "engineering_verified": False,
        "production_ready": False,
    }


def experiment(*, include_design=False, focused=False, compositional=False,
               steps=360, seed=42, width=96,
               layers=2, heads=4, context=512, vocab_size=512,
               batch_size=6, threads=2, output="/tmp/bgp-module-lm.pt"):
    if (type(include_design) is not bool or type(focused) is not bool
            or type(compositional) is not bool or not 1 <= steps <= 2000):
        raise ValueError("Invalid original module experiment")
    if compositional and not focused:
        raise ValueError("Compositional BGP lessons require focused outcome training")
    if not 1 <= batch_size <= 32 or not 1 <= threads <= 8:
        raise ValueError("Invalid batch or thread count")
    torch.set_num_threads(threads)
    torch.manual_seed(seed)
    rng = random.Random(seed)
    corpus, sim_source_sha = load_owned_module_cases()
    knowledge = design_teaching_examples(5)
    if focused:
        corpus = {key: focused_cases(items) for key, items in corpus.items()}
    simulation_train = corpus["train"]
    composed, composed_digest = (
        load_compositional_cases(expected_source_sha=sim_source_sha)
        if compositional else ([], None)
    )
    original_ids = {x.id for split in corpus.values() for x in split}
    original_groups = {x.scenario_id for split in corpus.values() for x in split}
    if (any(x.id in original_ids or x.scenario_id in original_groups for x in composed)
            or any(x.split != "train" for x in composed)):
        raise ValueError("Composed Cisco BGP cases overlap existing test or validation")
    training = simulation_train + (knowledge if include_design else []) + composed
    # Same tokenizer in BOTH ablation arms: fitted only to available, original
    # TRAIN data, never validation or heldout source responses.
    combined = simulation_train + knowledge
    docs = [string for ex in combined for string in (
        "Network observation:\n" + ex.prompt + "\nEngineering review:\n",
        ex.completion)]
    tokenizer = train_bpe(docs, vocab_size=vocab_size)
    config = LMConfig(block_size=context, width=width,
                      layers=layers, heads=heads,
                      vocab_size=tokenizer.vocab_size)
    config.validate()
    encoded_train = [encode_example(ex, tokenizer, context) for ex in training]
    encoded_val = [encode_example(ex, tokenizer, context) for ex in corpus["val"]]
    model = ScratchNetworkLM(config)
    before = validate(model, encoded_val, torch.device("cpu"))
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001)
    order = list(range(len(encoded_train)))
    rng.shuffle(order)
    cursor, initial, final = 0, None, None
    for _ in range(steps):
        selected = []
        for _ in range(batch_size):
            if cursor == len(order):
                rng.shuffle(order)
                cursor = 0
            selected.append(order[cursor])
            cursor += 1
        inputs, labels = batch(encoded_train, selected, torch.device("cpu"))
        model.train()
        optimizer.zero_grad(set_to_none=True)
        _, loss = model(inputs, labels)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1)
        optimizer.step()
        if initial is None:
            initial = round(float(loss.item()), 6)
        final = round(float(loss.item()), 6)
    dev_loss = validate(model, encoded_val, torch.device("cpu"))
    outcomes = (
        grade_focused(model, tokenizer, corpus["test"]) if focused
        else grade_simulation(model, tokenizer, corpus["test"])
    )
    report = {
        "status": "SCRATCH_BGP_MODULE_KNOWLEDGE_RESEARCH_ONLY",
        "include_design_knowledge": include_design,
        "focused_training": focused,
        "compositional_training": compositional,
        "compositional_examples": len(composed),
        "compositional_groups": len({x.scenario_id for x in composed}),
        "compositional_sha256": composed_digest,
        "seed": seed, "steps": steps,
        "configuration": asdict(config),
        "parameters": sum(p.numel() for p in model.parameters()),
        "training_cases": len(training),
        "train_simulation": len(simulation_train),
        "train_design_knowledge": len(knowledge) if include_design else 0,
        "validation": len(corpus["val"]),
        "withheld_failure_groups": len({x.scenario_id for x in corpus["test"]}),
        "synthetic_simulation_source_sha256": sim_source_sha,
        "curated_design_knowledge_sha256": sha256(KNOWLEDGE.read_bytes()).hexdigest(),
        "tokenizer_sha256": tokenizer.fingerprint(),
        "tokenizer": tokenizer.to_manifest(),
        "train_loss_first": initial, "train_loss_last": final,
        "val_token_loss_before": before,
        "val_token_loss_after": dev_loss,
        "withheld_simulation": outcomes,
        "limitations": (
            "Simulator modeled assumptions and design parameter checks, not "
            "real Cisco CLI telemetry, convergence or causal root cause. "
            "No Cisco document body text or live data used."
        ),
        "engineering_verified": False,
        "production_ready": False,
    }
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"weights": model.state_dict(), "config": asdict(config),
                "tokenizer": tokenizer.to_manifest(),
                "manifest": {
                    "status": report["status"],
                    "simulation_sha256": sim_source_sha,
                    "design_sha256": report["curated_design_knowledge_sha256"],
                    "tokenizer_sha256": tokenizer.fingerprint(),
                    "training_steps": steps,
                    "include_design_knowledge": include_design,
                    "focused_training": focused,
                    "compositional_training": compositional,
                    "compositional_sha256": composed_digest,
                    "engineering_verified": False,
                    "production_ready": False,
                }}, output)
    report_path = output.with_suffix(".metrics.json")
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"], "includes_design": include_design,
        "focused_training": focused,
        "compositional_training": compositional,
        "compositional_examples": len(composed),
        "train_examples": len(training), "model_parameters": report["parameters"],
        "dev_loss": dev_loss, "withheld_cases": outcomes["cases"],
        "heldout_exact": outcomes["exact_canonical"],
        "heldout_correct": (
            outcomes["correct_single_outcome"] if focused
            else outcomes["all_four_outcomes_correct"]
        ),
        "heldout_fields": (
            outcomes["by_field"] if focused else outcomes["field_correct"]
        ),
        "production_ready": False,
    }), flush=True)
    return report


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--include-design", action="store_true")
    parser.add_argument("--focused", action="store_true")
    parser.add_argument("--compositional", action="store_true")
    parser.add_argument("--steps", type=int, default=360)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--width", type=int, default=96)
    parser.add_argument("--layers", type=int, default=2)
    parser.add_argument("--heads", type=int, default=4)
    parser.add_argument("--context", type=int, default=512)
    parser.add_argument("--vocab-size", type=int, default=512)
    parser.add_argument("--batch-size", type=int, default=6)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--output", default="/tmp/bgp-module-lm.pt")
    args = parser.parse_args()
    experiment(include_design=args.include_design, focused=args.focused,
               compositional=args.compositional,
               steps=args.steps,
               seed=args.seed, width=args.width, layers=args.layers,
               heads=args.heads, context=args.context,
               vocab_size=args.vocab_size, batch_size=args.batch_size,
               threads=args.threads, output=args.output)


if __name__ == "__main__":
    main()
