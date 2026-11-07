"""Genuinely random-init BGP evidence model trained on factorial CLI observations.

Four independent short-form language generation tasks are taught from the
same original synthetic evidence: FINDING, WHY, NOT_PROVEN, CHECK. There are
no model-time diagnostic rules, template answer injection or vendor-LLM APIs.

Important: this is NOT real IOS-XE/TAC incident reasoning. No live product
integration or operational safety approval.
"""
from argparse import ArgumentParser
from collections import Counter, defaultdict
from dataclasses import asdict
from pathlib import Path
import json
import random

import torch

from ..data import encode_example
from ..model import LMConfig, ScratchNetworkLM
from ..train import batch, validate
from ..cisco_bgp.tokenizer import train_bpe
from .curriculum import (
    VERSION, FIELDS, KINDS, SPLIT_CONTEXTS, cases, tasks, digest, report,
)
from .abstention_curriculum import (
    VERSION as ABSTENTION_VERSION, UNKNOWN_KIND, GAPS,
    cases as abstention_cases, field_tasks as abstention_tasks,
    audit as abstention_audit,
)

CONTRASTS = (
    ("ACTIVE_TARGET", "ACTIVE_WRONG_PEER"),
    ("ZERO_PREFIX", "POSITIVE_PREFIX"),
    ("NEXT_HOP_MISSING", "NEXT_HOP_PRESENT"),
)


def prompt_tokens(tok, prompt):
    return tok.encode(
        "Network observation:\n" + prompt + "\nEngineering review:\n",
        bos=True,
    )


@torch.no_grad()
def test_model_generation(model, tok, records, *, limit=100):
    model.eval()
    correct_first = Counter()
    correct_exact = Counter()
    counts = Counter()
    snippets = []
    per_incident = defaultdict(dict)
    for sample in records:
        field = sample.id.rsplit("-", 1)[-1]
        if field not in FIELDS:
            raise ValueError("Unsupported evidence research field")
        prompt = prompt_tokens(tok, sample.prompt)
        if len(prompt) >= model.config.block_size:
            raise ValueError("Heldout CLI evidence exceeds scratch context")
        all_tokens = model.complete(prompt, max_new_tokens=limit)
        decoded = tok.decode(all_tokens[len(prompt):]).strip()
        first = decoded.splitlines()[0].strip() if decoded.splitlines() else ""
        first_correct = first == sample.completion
        correct_first[field] += int(first_correct)
        correct_exact[field] += int(decoded == sample.completion)
        counts[field] += 1
        incident_id = sample.id.rsplit("-", 1)[0]
        per_incident[incident_id][field] = (first_correct, first)
        if len(snippets) < 8:
            snippets.append({
                "case": sample.id,
                "expected": sample.completion,
                "generated": decoded[:200],
                "first_line_correct": first_correct,
            })
    if len(per_incident) * len(FIELDS) != len(records):
        raise ValueError("Heldout field tasks were not grouped as four distinct requirements")
    full = sum(all(per_incident[k][field][0] for field in FIELDS)
               for k in per_incident)
    paired = []
    for cid in SPLIT_CONTEXTS["test"]:
        for left,right in CONTRASTS:
            first = per_incident.get("factor-test-" + str(cid).zfill(2)
                                     + "-" + left)
            second = per_incident.get("factor-test-" + str(cid).zfill(2)
                                      + "-" + right)
            if first is None or second is None:
                continue
            paired.append({
                "context": cid, "left": left, "right": right,
                "both_correct": first["FINDING"][0] and second["FINDING"][0],
                "changed_prediction": (
                    first["FINDING"][1] != second["FINDING"][1]
                ),
            })
    expected_total = len(SPLIT_CONTEXTS["test"]) * len(CONTRASTS)
    if len(paired) != expected_total:
        raise ValueError("Wrong paired counterfactual coverage")
    return {
        "field_tasks": len(records),
        "incidents": len(per_incident),
        "by_field": {
            field: {
                "first_line_correct": correct_first[field],
                "exact_canonical": correct_exact[field],
                "total": counts[field],
            } for field in FIELDS
        },
        "all_four_fields_correct": full,
        "counterfactual_finding": {
            "total_pairs": len(paired),
            "both_correct": sum(x["both_correct"] for x in paired),
            "prediction_changed": sum(x["changed_prediction"] for x in paired),
        },
        "samples": snippets,
        "engineering_verified": False,
        "production_ready": False,
    }


@torch.no_grad()
def evaluate_insufficient_evidence(model, tok, records, *, limit=100):
    """Grade whether the *model*, not a parser, admits it lacks proof."""
    model.eval()
    right=Counter()
    count=Counter()
    snippets=[]
    by_incident=defaultdict(dict)
    for record in records:
        field=record.id.rsplit("-",1)[-1]
        if field not in FIELDS:
            raise ValueError("Unsupported insufficiency evaluation field")
        prefix=prompt_tokens(tok,record.prompt)
        if len(prefix)>=model.config.block_size:
            raise ValueError("Insufficient evidence exceeds scratch context")
        predicted=tok.decode(model.complete(prefix,max_new_tokens=limit)[len(prefix):]).strip()
        first=predicted.splitlines()[0].strip() if predicted else ""
        correct=(first==record.completion)
        right[field]+=int(correct)
        count[field]+=1
        incident=record.id.rsplit("-",2)[0]
        by_incident[incident][field]=correct
        if len(snippets)<8:
            snippets.append({"case":record.id,"expected":record.completion,
                             "generated":predicted[:220],"correct":correct})
    if len(by_incident)*len(FIELDS)!=len(records):
        raise ValueError("Four separate abstention fields required per incident")
    return {
        "field_tasks":len(records),
        "incidents":len(by_incident),
        "by_field":{k:{"correct":right[k],"total":count[k]} for k in FIELDS},
        "all_four_correct":sum(
            all(v.get(k,False) for k in FIELDS)
            for v in by_incident.values()
        ),
        "samples":snippets,
        "engineering_verified":False,
        "production_ready":False,
    }


class BalancedEvidenceSampler:
    """Cycle through four requested output fields and cover all eight findings.

    Each optimizer batch includes exactly one example for each of the eight
    evidence classes. The field task rotates deterministically, so short runs
    cannot accidentally starve a finding class or requested engineering field.
    This is *training sampling*, not hardcoded inference behavior.
    """

    def __init__(self, training, *, seed, include_unknown=False):
        self.rng = random.Random(seed)
        self.include_unknown = include_unknown
        self.kinds = KINDS + ((UNKNOWN_KIND,) if include_unknown else ())
        self.buckets = {}
        self.cursors = {}
        for field in FIELDS:
            for kind in self.kinds:
                matches = [
                    index for index,x in enumerate(training)
                    if x.id.endswith("-" + kind + "-" + field)
                ]
                required=len(SPLIT_CONTEXTS["train"])
                if ((not include_unknown and len(matches)!=required)
                        or (include_unknown and len(matches)<required)
                        or (kind!=UNKNOWN_KIND and len(matches)!=required)):
                    raise ValueError("Training data missing balanced BGP classes")
                self.rng.shuffle(matches)
                self.buckets[(field,kind)] = matches
                self.cursors[(field,kind)] = 0

    def indices(self, step):
        if not isinstance(step, int) or step < 0:
            raise ValueError("Invalid BGP training batch index")
        # Both curricula rotate FINDING/WHY/NOT_PROVEN/CHECK *every step*.
        # Holding a field for nine updates biases the decoder toward the
        # most recent field and made both nine-class models collapse.
        field = FIELDS[step % len(FIELDS)]
        selection = []
        # In 9-class mode, choose 8 of 9 classes per batch. The skipped
        # class rotates; across nine optimizer updates each class is sampled
        # eight times. Batch size and model architecture stay unchanged.
        excluded = (step%len(self.kinds)) if self.include_unknown else -1
        for idx,kind in enumerate(self.kinds):
            if idx == excluded:
                continue
            key = (field,kind)
            cursor = self.cursors[key]
            if cursor == len(self.buckets[key]):
                self.rng.shuffle(self.buckets[key])
                cursor = 0
            selection.append(self.buckets[key][cursor])
            self.cursors[key] = cursor + 1
        return selection


def _train(*, seed=42, steps=900, width=96, layers=2, heads=4,
           context=768, vocab_size=512, batch_size=8,
           balanced_batches=False, teach_abstention=False,
           output="/tmp/bgp-factorial-scratch.pt", threads=2):
    if (type(seed) is not int or not 1 <= steps <= 4000
            or not 1 <= batch_size <= 24 or not 1 <= threads <= 8
            or type(balanced_batches) is not bool
            or type(teach_abstention) is not bool):
        raise ValueError("Invalid scratch BGP research training parameters")
    if teach_abstention and not balanced_batches:
        raise ValueError("Safety curriculum requires balanced class coverage")
    if balanced_batches and batch_size != len(KINDS):
        raise ValueError("Balanced batches require one sample per BGP class")
    torch.set_num_threads(threads)
    torch.use_deterministic_algorithms(True)
    torch.manual_seed(seed)
    rng = random.Random(seed)
    groups = cases()
    audit = report()
    split = {name: tasks(rows) for name,rows in groups.items()}
    uncertain_split = {name: abstention_tasks(rows)
                       for name,rows in abstention_cases().items()}
    if teach_abstention:
        for name in ("train","val"):
            split[name].extend(uncertain_split[name])
    training = split["train"]
    # Only training examples contribute to the BPE merges; neither validation
    # nor test prompts, nor even their model output targets are read by BPE.
    sources = [
        text for sample in training for text in (
            "Network observation:\n" + sample.prompt + "\nEngineering review:\n",
            sample.completion,
        )
    ]
    tokenizer = train_bpe(sources, vocab_size=vocab_size)
    config = LMConfig(
        block_size=context, width=width, layers=layers, heads=heads,
        vocab_size=tokenizer.vocab_size,
    )
    config.validate()
    train_encoded = [encode_example(x, tokenizer, context) for x in training]
    val_encoded = [encode_example(x, tokenizer, context) for x in split["val"]]
    net = ScratchNetworkLM(config)
    random_model_val_loss = validate(net, val_encoded, torch.device("cpu"))
    optimizer = torch.optim.AdamW(net.parameters(), lr=0.001)
    order = list(range(len(train_encoded)))
    rng.shuffle(order)
    cursor = 0
    balanced_sampler = (
        BalancedEvidenceSampler(training, seed=seed,
                                include_unknown=teach_abstention)
        if balanced_batches else None
    )
    initial, last = None, None
    for step in range(steps):
        if balanced_sampler is not None:
            sampled = balanced_sampler.indices(step)
        else:
            sampled = []
            for _ in range(batch_size):
                if cursor == len(order):
                    cursor = 0
                    rng.shuffle(order)
                sampled.append(order[cursor])
                cursor += 1
        x,y = batch(train_encoded, sampled, torch.device("cpu"))
        net.train()
        optimizer.zero_grad(set_to_none=True)
        _,loss = net(x,y)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0)
        optimizer.step()
        if initial is None:
            initial = round(float(loss.item()), 6)
        last = round(float(loss.item()), 6)
    val_loss = validate(net, val_encoded, torch.device("cpu"))
    results = test_model_generation(net, tokenizer, split["test"])
    unknown_score = evaluate_insufficient_evidence(
        net, tokenizer, uncertain_split["test"]
    )
    if (unknown_score["incidents"] != 60
            or unknown_score["field_tasks"] != 240):
        raise ValueError("Abstention evaluation coverage incomplete")
    if results["field_tasks"] != 384 or results["incidents"] != 96:
        raise ValueError("Incorrect factorial research evaluation size")

    # A finite eight-label majority baseline is 12/96 because each finding
    # is represented equally among twelve unseen context combinations.
    count_labels = Counter(
        e.completion for e in split["train"]
        if e.id.startswith("factor-") and e.id.endswith("-FINDING")
    )
    majority = max(sorted(count_labels), key=lambda k: count_labels[k])
    majority_accuracy = sum(
        e.completion == majority
        for e in split["test"] if e.id.endswith("-FINDING")
    )
    report_data = {
        "status": "FACTORIAL_CISCO_BGP_SCRATCH_RESEARCH_ONLY",
        "curriculum_version": VERSION,
        "model_config": asdict(config),
        "params": sum(p.numel() for p in net.parameters()),
        "seed": seed, "steps": steps, "batch_size": batch_size,
        "balanced_evidence_batches": balanced_batches,
        "teach_abstention": teach_abstention,
        "abstention_curriculum_version": ABSTENTION_VERSION,
        "torch_version": torch.__version__,
        "deterministic_algorithms": torch.are_deterministic_algorithms_enabled(),
        "train_cases": audit["cases"]["train"] + (
            len(abstention_cases()["train"]) if teach_abstention else 0
        ),
        "val_cases": audit["cases"]["val"] + (
            len(abstention_cases()["val"]) if teach_abstention else 0
        ),
        "test_cases": audit["cases"]["test"],
        "train_field_tasks": len(split["train"]),
        "val_field_tasks": len(split["val"]),
        "test_field_tasks": len(split["test"]),
        "train_sha256": digest(training),
        "val_sha256": digest(split["val"]),
        "test_sha256": audit["test_sha256"],
        "unknown_test_sha256": digest(uncertain_split["test"]),
        "unknown_test_cases":60,
        "unknown_test_field_tasks":240,
        "tokenizer_sha256": tokenizer.fingerprint(),
        "train_loss_first": initial, "train_loss_last": last,
        "val_loss_random": random_model_val_loss,
        "val_loss_trained": val_loss,
        "majority_reference_correct": majority_accuracy,
        "majority_reference_total": len(SPLIT_CONTEXTS["test"]) * len(KINDS),
        "heldout_generated": results,
        "abstention_generated": unknown_score,
        "source": "ORIGINAL_SYNTHETIC_CLI_NOT_VENDOR_COPY",
        "unknown_gap_types":list(GAPS),
        "unknown_supplementary_training":teach_abstention,
        "note": (
            "This tests heldout combinations of the same four authored context "
            "factors and eight findings, not out-of-distribution vendor TAC "
            "cases or root cause. The number of unique evidence prompts is "
            "audited independently of the field-task row count."
        ),
        "engineering_verified": False, "production_ready": False,
    }
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "config": asdict(config),
        "weights": net.state_dict(),
        "tokenizer": tokenizer.to_manifest(),
        "manifest": {
            "status": report_data["status"],
            "seed": seed,
            "balanced_evidence_batches": balanced_batches,
            "teach_abstention": teach_abstention,
            "train_sha256": digest(training),
            "test_sha256": audit["test_sha256"],
            "unknown_test_sha256":digest(uncertain_split["test"]),
            "tokenizer_sha256": tokenizer.fingerprint(),
            "engineering_verified": False, "production_ready": False,
        },
    }, path)
    path.with_suffix(".metrics.json").write_text(
        json.dumps(report_data, indent=2) + "\n", encoding="utf-8",
    )
    print(json.dumps({
        "status": report_data["status"],
        "seed": seed, "balanced_evidence_batches": balanced_batches,
        "teach_abstention":teach_abstention,
        "unknown_findings":unknown_score["by_field"]["FINDING"]["correct"],
        "unknown_total":60,
        "train_cases": report_data["train_cases"],
        "train_field_tasks": report_data["train_field_tasks"],
        "test_cases": report_data["test_cases"],
        "test_field_tasks": report_data["test_field_tasks"],
        "correct_findings": results["by_field"]["FINDING"]["first_line_correct"],
        "correct_why": results["by_field"]["WHY"]["first_line_correct"],
        "correct_not_proven": results["by_field"]["NOT_PROVEN"]["first_line_correct"],
        "correct_check": results["by_field"]["CHECK"]["first_line_correct"],
        "full_four": results["all_four_fields_correct"],
        "paired_both": results["counterfactual_finding"]["both_correct"],
        "majority_findings": majority_accuracy,
        "validated_for_live": False,
    }), flush=True)
    return report_data


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--steps", type=int, default=900)
    parser.add_argument("--width", type=int, default=96)
    parser.add_argument("--layers", type=int, default=2)
    parser.add_argument("--heads", type=int, default=4)
    parser.add_argument("--context", type=int, default=768)
    parser.add_argument("--vocab-size", type=int, default=512)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--balanced-batches", action="store_true")
    parser.add_argument("--teach-abstention", action="store_true")
    parser.add_argument("--output", default="/tmp/bgp-factorial-scratch.pt")
    args = parser.parse_args()
    _train(seed=args.seed, steps=args.steps, width=args.width,
           layers=args.layers, heads=args.heads, context=args.context,
           vocab_size=args.vocab_size, batch_size=args.batch_size,
           balanced_batches=args.balanced_batches,
           teach_abstention=args.teach_abstention,
           threads=args.threads, output=args.output)


if __name__ == "__main__":
    main()
