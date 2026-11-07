"""Factorial, source-scoped Cisco BGP evidence curriculum, research only.

Unlike the first multi-CLI corpus (19 abstracted prompts after peer/ASN masking),
this corpus deliberately crosses independent *observed* dimensions: other
peer's FSM, unrelated routing evidence, command order and reset history.
The kind is NEVER in a prompt. We keep the same hypothetical target peer/
prefix identity in a counterfactual pair and change only relevant evidence.

All cases are manually authored SYNTHETIC CLI-like fixtures; they are NOT
Cisco TAC logs, customer telemetry, vendor-copied CLI or complete BGP behavior.
No rule in this file executes during neural-model inference.
"""
from dataclasses import dataclass
from hashlib import sha256
from itertools import product
import json
import random

from ..data import Example, SECRET
from ..cisco_bgp.multicli_curriculum import KINDS, TARGET, SOURCE_IDS

VERSION = "factorial-bgp-evidence-v1"
FIELDS = ("FINDING", "WHY", "NOT_PROVEN", "CHECK")
ALTERNATE_FSM = ("Established", "Active", "Idle", "Connect")
UNRELATED_ROUTE = ("connected", "static", "not-installed")
COMMAND_ORDER = (0, 1)
RESET_HISTORY = ("No recent BGP reset recorded", "Last reset: peer closed TCP connection")
ALL_CONTEXTS = tuple(product(ALTERNATE_FSM, UNRELATED_ROUTE, COMMAND_ORDER, RESET_HISTORY))
assert len(ALL_CONTEXTS) == 48
rng = random.Random(260711)
shuffled = list(range(len(ALL_CONTEXTS)))
rng.shuffle(shuffled)
SPLIT_CONTEXTS = {
    "train": tuple(shuffled[:28]),
    "val": tuple(shuffled[28:36]),
    "test": tuple(shuffled[36:]),
}


@dataclass(frozen=True)
class EvidenceCase:
    example: Example
    kind: str
    context_id: int
    source_ids: tuple[str, ...]


def _other_route(context):
    if context == "connected":
        return "Known via connected, directly connected, GigabitEthernet0/1"
    if context == "static":
        return "Known via static, distance 1, via 10.255.10.1"
    return "% Network not in table"


def _summary_line(address, state, *, remote_as):
    if isinstance(state, int):
        state = str(state)
    return address + "  " + str(remote_as) + "  00:18:34  " + state


def make_case(kind, split, context_id):
    if kind not in KINDS or split not in SPLIT_CONTEXTS:
        raise ValueError("Unexpected research-only BGP kind/split")
    if context_id not in SPLIT_CONTEXTS[split]:
        raise ValueError("Factorial context must remain in its frozen split")
    other_fsm, other_route, order, reset = ALL_CONTEXTS[context_id]

    # Addresses are from TEST-NET space and fixed *across classes* in one
    # context, so a model must attend to evidence rather than class-specific
    # customer values. Test splits do have distinct suffixes, but the
    # evidence fields below are independent of those numeric suffixes.
    suffix = 18 + context_id
    target = "192.0.2." + str(suffix)
    other = "198.51.100." + str(suffix)
    prefix = "10." + str(20 + context_id) + ".0.0/24"
    nh = "203.0.113." + str(suffix)

    if kind == "ADMIN_DOWN":
        target_state = "Idle (Admin)"
    elif kind in ("ACTIVE_TARGET", "ACTIVE_WRONG_PEER"):
        target_state = "Active"
    else:
        target_state = 0 if kind == "ZERO_PREFIX" else 3 + context_id % 14

    header = [
        "Original synthetic IOS XE-style evidence: no real device, no root cause confirmed.",
        "TARGET_NEIGHBOR=" + target,
        "TARGET_PREFIX=" + prefix,
        "PEER_SCOPE=Evaluate TARGET_NEIGHBOR; do not borrow the other peer's state.",
    ]
    distractor = (
        "CE# show ip route 198.51.100.99\n"
        + ("Unrelated route: " + _other_route(other_route))
    )
    summary = (
        "CE# show ip bgp summary\n"
        "Neighbor   AS   Up/Down   State/PfxRcd\n"
        + ("\n".join((
            _summary_line(other, other_fsm, remote_as=64550),
            _summary_line(target, target_state, remote_as=64512),
        )) if order else "\n".join((
            _summary_line(target, target_state, remote_as=64512),
            _summary_line(other, other_fsm, remote_as=64550),
        )))
    )

    if kind == "ADMIN_DOWN":
        second = (
            "CE# show running-config | section router bgp\n"
            "router bgp 65010\n"
            "neighbor " + target + " remote-as 64512\n"
            "neighbor " + target + " shutdown"
        )
    elif kind in ("ACTIVE_TARGET", "ACTIVE_WRONG_PEER", "ZERO_PREFIX", "POSITIVE_PREFIX"):
        inspected_peer = other if kind == "ACTIVE_WRONG_PEER" else target
        peer_state = other_fsm if kind == "ACTIVE_WRONG_PEER" else (
            "Active" if kind == "ACTIVE_TARGET" else "Established"
        )
        second = (
            "CE# show ip bgp neighbors " + inspected_peer + "\n"
            "BGP neighbor is " + inspected_peer + "\n"
            "BGP state = " + peer_state + "\n"
            + reset
        )
        if kind in ("ZERO_PREFIX", "POSITIVE_PREFIX"):
            second += (
                "\nFor address family IPv4 Unicast, received prefixes "
                + str(target_state)
            )
    else:
        summary = (
            "CE# show ip bgp " + prefix + "\n"
            "BGP table entry for " + prefix + "\n"
            "  Path via next hop " + nh + "; BGP-to-RIB selection not shown"
        )
        if kind == "NEXT_HOP_MISSING":
            second = "CE# show ip route " + nh + "\n% Network not in table"
        elif kind == "NEXT_HOP_PRESENT":
            second = (
                "CE# show ip route " + nh + "\n"
                "Routing entry for 203.0.113.0/24\n"
                "Known via connected, directly connected, GigabitEthernet0/0"
            )
        else:
            second = (
                "CE# show ip route " + prefix + "\n"
                "Routing entry for " + prefix + "\n"
                "Known via static, distance 1, via 10.10.10.1"
            )

    blocks = [summary, second, distractor]
    # Change both order and unrelated peer/route context; all changes are
    # visible in the input and never depend on the correct label's identity.
    if order:
        blocks = [distractor, second, summary]

    prompt = "\n".join(header + blocks)
    if "FINDING=" in prompt or "WHY=" in prompt or "CHECK=" in prompt:
        raise ValueError("Supervision accidentally present in evidence")
    completion = "\n".join(TARGET[kind])
    if SECRET.search(prompt + "\n" + completion):
        raise ValueError("Sensitive synthetic training data")
    return EvidenceCase(
        example=Example(
            id="factor-" + split + "-" + str(context_id).zfill(2) + "-" + kind,
            scenario_id="factor-" + split + "-" + str(context_id).zfill(2),
            split=split, prompt=prompt, completion=completion,
        ),
        kind=kind,
        context_id=context_id,
        source_ids=SOURCE_IDS[kind],
    )


def cases():
    return {
        split: [
            make_case(kind, split, cid)
            for cid in ids for kind in KINDS
        ]
        for split, ids in SPLIT_CONTEXTS.items()
    }


def tasks(records):
    examples = []
    for record in records:
        target = dict(line.split("=", 1) for line in record.example.completion.splitlines())
        for field in FIELDS:
            examples.append(Example(
                id=record.example.id + "-" + field,
                scenario_id=record.example.scenario_id,
                split=record.example.split,
                prompt=record.example.prompt + "\nREQUESTED_EVIDENCE_FIELD=" + field,
                completion=field + "=" + target[field],
            ))
    return examples


def digest(rows):
    raw = "\n".join(json.dumps(
        {"id": r.id, "scenario": r.scenario_id, "prompt": r.prompt,
         "completion": r.completion},
        sort_keys=True, ensure_ascii=False,
    ) for r in rows)
    return sha256(raw.encode("utf-8")).hexdigest()


def report():
    source = cases()
    grouped = {split: tasks(records) for split, records in source.items()}
    if len({x.prompt for x in grouped["train"]}) != len(grouped["train"]):
        raise ValueError("Normalized training collapsed distinct evidence unexpectedly")
    context_groups = {split: {r.context_id for r in records}
                      for split, records in source.items()}
    if any(context_groups[a] & context_groups[b] for a,b
           in (("train","val"),("train","test"),("val","test"))):
        raise ValueError("Factorial context leaked across splits")
    return {
        "status": "SYNTHETIC_FACTORIAL_BGP_DIVERSITY_AUDIT",
        "version": VERSION,
        "context_dimensions": {
            "other_neighbor_states": len(ALTERNATE_FSM),
            "unrelated_route_states": len(UNRELATED_ROUTE),
            "cli_block_orders": len(COMMAND_ORDER),
            "reset_history_forms": len(RESET_HISTORY),
        },
        "total_contexts": len(ALL_CONTEXTS),
        "cases": {s: len(v) for s,v in source.items()},
        "unique_case_prompts": {
            s: len({r.example.prompt for r in records})
            for s,records in source.items()
        },
        "field_tasks": {s:len(v) for s,v in grouped.items()},
        "unique_field_prompts": {
            s:len({x.prompt for x in records})
            for s,records in grouped.items()
        },
        "train_sha256": digest(grouped["train"]),
        "val_sha256": digest(grouped["val"]),
        "test_sha256": digest(grouped["test"]),
        "note": "Factorially novel combinations, NOT independent vendor TAC cases or a novel protocol; copied no vendor CLI bodies. The eight labels remain authored.",
        "engineering_verified": False,
        "production_ready": False,
    }


if __name__ == "__main__":
    print(json.dumps(report(), ensure_ascii=False, indent=2))
