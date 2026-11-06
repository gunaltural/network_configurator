"""Scratch Transformer state-recognition probe, NOT a troubleshooting model.

Train the very same randomly initialized causal Transformer on original
synthetic observation labels. This auxiliary task asks whether the architecture
can distinguish states at all before tackling natural-language explanations.
Accuracy below is narrow synthetic state recognition, never engineering skill.
"""
from argparse import ArgumentParser
from dataclasses import asdict
from pathlib import Path
import hashlib
import json
import random

import torch
import torch.nn as nn
import torch.nn.functional as F

from .model import LMConfig, ScratchNetworkLM, ByteTokenizer
from .curriculum import _STATE_PAIRS, CURRICULUM_VERSION, curriculum_examples, curriculum_digest

STATES = tuple(state for state, _, _ in _STATE_PAIRS)
STATE_INDEX = {state: i for i, state in enumerate(STATES)}

# Independently written phrasings. They are not training examples or copied
# vendor documentation; they assess small out-of-template surface transfer.
TRANSFER_CASES = (
    ("bgp-active", "Router CE-A: the BGP peer 203.0.113.8 is Active and has not reached Established."),
    ("bgp-established", "Router CE-A: BGP session is Established; received route count 15."),
    ("ospf-drotwo", "R1: OSPF adjacency is 2WAY/DROTHER on the Ethernet broadcast segment."),
    ("ospf-exstart", "R1: OSPF neighbor has remained in EXSTART/DR."),
    ("evpn-type2", "Leaf A: EVPN Type 2 MAC/IP entry advertised in the overlay control plane."),
    ("evpn-type5", "Leaf A: EVPN Type 5 IP Prefix entry appears in the overlay control plane."),
    ("sdwan-probe-dead", "FortiGate: wan1 health-check response dead with packet loss 100 percent."),
    ("sdwan-probe-alive", "FortiGate: wan1 SLA probe alive with packet loss zero."),
    ("mlag-link-up", "Switch A: MLAG peer-link operational status is Up."),
    ("mlag-link-down", "Switch A: MLAG peer-link operational status is Down."),
    ("stp-alt-block", "VLAN37: STP interface Ethernet1 is Alternate Blocking."),
    ("stp-root-forward", "VLAN37: STP interface Ethernet1 is Root Forwarding."),
    ("system-ntp-sync", "EDGE-A clock NTP synchronized at stratum three."),
    ("system-ntp-unsync", "EDGE-A clock NTP unsynchronized at stratum sixteen."),
    ("dci-peer-up", "DC interconnect: NVE remote VTEP peer 192.0.2.22 reports Up."),
    ("dci-peer-down", "DC interconnect: NVE remote VTEP peer 192.0.2.22 reports Down."),
)


class ScratchStateProbe(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.backbone = ScratchNetworkLM(config)
        self.classifier = nn.Linear(config.width, len(STATES))

    def forward(self, tokens, lengths):
        hidden = self.backbone.encode(tokens)
        positions = lengths - 1
        if (positions < 0).any() or (lengths > tokens.size(1)).any():
            raise ValueError("Invalid observation length")
        pooled = hidden[torch.arange(tokens.size(0), device=tokens.device), positions]
        return self.classifier(pooled)


def encode_records(rows, tokenizer, context):
    encoded = []
    for state, prompt in rows:
        if state not in STATE_INDEX:
            raise ValueError("Unknown state class")
        tokens = tokenizer.encode("Observed CLI:\n" + prompt, bos=True)
        if len(tokens) > context:
            raise ValueError("Probe input exceeds context; truncation forbidden")
        encoded.append((tokens, STATE_INDEX[state]))
    return encoded


def batch(examples, indices, device):
    length = max(len(examples[i][0]) for i in indices)
    tokens = torch.zeros((len(indices), length), dtype=torch.long, device=device)
    sizes = torch.zeros(len(indices), dtype=torch.long, device=device)
    labels = torch.zeros(len(indices), dtype=torch.long, device=device)
    for j, index in enumerate(indices):
        token_ids, label = examples[index]
        tokens[j, :len(token_ids)] = torch.tensor(token_ids, dtype=torch.long, device=device)
        sizes[j] = len(token_ids)
        labels[j] = label
    return tokens, sizes, labels


@torch.no_grad()
def accuracy(model, examples, device):
    model.eval()
    correct, classifications = 0, []
    for index in range(len(examples)):
        tokens, sizes, labels = batch(examples, [index], device)
        predicted = int(model(tokens, sizes)[0].argmax())
        target = int(labels[0])
        correct += (predicted == target)
        classifications.append({"expected": STATES[target], "predicted": STATES[predicted],
                                "correct": predicted == target})
    return {"correct": correct, "total": len(examples),
            "accuracy": round(correct / len(examples), 4) if examples else 0.0,
            "per_case": classifications}


def train_probe(*, steps=240, samples_per_state=12, seed=42, context=512,
                width=64, layers=2, heads=4, batch_size=8, lr=0.001,
                threads=2, output="/tmp/network-state-probe.pt"):
    if steps < 1 or batch_size < 1 or threads < 1:
        raise ValueError("Positive steps, batch and threads are required")
    torch.set_num_threads(threads)
    torch.manual_seed(seed)
    rng = random.Random(seed)
    config = LMConfig(block_size=context, width=width, layers=layers, heads=heads)
    config.validate()
    tokenizer = ByteTokenizer()
    examples = curriculum_examples(samples_per_state, seed=seed)
    evaluation = curriculum_examples(3, seed=seed + 401)
    train_rows = [(x.scenario_id.removeprefix("curriculum-"), x.prompt) for x in examples]
    eval_rows = [(x.scenario_id.removeprefix("curriculum-"), x.prompt) for x in evaluation]
    template_rows = list(TRANSFER_CASES)
    train_prompts = {x.prompt for x in examples}
    if (train_prompts.intersection(x.prompt for x in evaluation) or
            train_prompts.intersection(prompt for _, prompt in template_rows)):
        raise ValueError("Probe has exact training/evaluation overlap")
    training = encode_records(train_rows, tokenizer, context)
    surface = encode_records(eval_rows, tokenizer, context)
    transfer = encode_records(template_rows, tokenizer, context)

    device = torch.device("cpu")
    model = ScratchStateProbe(config).to(device)  # Zero pretrained weights
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    initial_surface = accuracy(model, surface, device)
    initial_transfer = accuracy(model, transfer, device)
    order = list(range(len(training)))
    rng.shuffle(order)
    pointer = 0
    loss_first, loss_last = None, None
    for _ in range(steps):
        selected = []
        for _ in range(batch_size):
            if pointer >= len(order):
                rng.shuffle(order)
                pointer = 0
            selected.append(order[pointer])
            pointer += 1
        tokens, sizes, targets = batch(training, selected, device)
        model.train()
        optimizer.zero_grad(set_to_none=True)
        logits = model(tokens, sizes)
        loss = F.cross_entropy(logits, targets)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if loss_first is None:
            loss_first = round(float(loss.item()), 6)
        loss_last = round(float(loss.item()), 6)
    final_train = accuracy(model, training, device)
    final_surface = accuracy(model, surface, device)
    final_transfer = accuracy(model, transfer, device)
    manifest = {
        "status": "SCRATCH_STATE_RECOGNITION_RESEARCH_ONLY",
        "architecture": asdict(config),
        "parameter_count": sum(p.numel() for p in model.parameters()),
        "curriculum_version": CURRICULUM_VERSION,
        "curriculum_train_digest": curriculum_digest(examples),
        "curriculum_holdout_digest": curriculum_digest(evaluation),
        "transfer_sha256": hashlib.sha256(
            json.dumps(TRANSFER_CASES, ensure_ascii=False).encode()).hexdigest(),
        "seed": seed, "steps": steps, "train_cases": len(training),
        "surface_heldout_cases": len(surface), "template_transfer_cases": len(transfer),
        "loss_first": loss_first, "loss_last": loss_last,
        "train_result": {k: v for k, v in final_train.items() if k != "per_case"},
        "surface_before": {k: v for k, v in initial_surface.items() if k != "per_case"},
        "surface_after": {k: v for k, v in final_surface.items() if k != "per_case"},
        "template_before": {k: v for k, v in initial_transfer.items() if k != "per_case"},
        "template_after": final_transfer,
        "limitation": "Only supervised synthetic state recognition; not root cause reasoning, vendor expertise or independent operational evidence.",
        "engineering_verified": False, "production_ready": False,
    }
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"weights": model.state_dict(), "config": asdict(config),
                "states": STATES, "manifest": manifest}, path)
    path.with_suffix(".metrics.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"checkpoint": str(path), **manifest}, ensure_ascii=False), flush=True)
    return manifest


def parser():
    ap = ArgumentParser(description=__doc__)
    ap.add_argument("--steps", type=int, default=240)
    ap.add_argument("--samples-per-state", type=int, default=12)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--context", type=int, default=512)
    ap.add_argument("--width", type=int, default=64)
    ap.add_argument("--layers", type=int, default=2)
    ap.add_argument("--heads", type=int, default=4)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--lr", type=float, default=0.001)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--output", default="/tmp/network-state-probe.pt")
    return ap


if __name__ == "__main__":
    args = parser().parse_args()
    train_probe(steps=args.steps, samples_per_state=args.samples_per_state,
                seed=args.seed, context=args.context, width=args.width,
                layers=args.layers, heads=args.heads, batch_size=args.batch_size,
                lr=args.lr, threads=args.threads, output=args.output)
