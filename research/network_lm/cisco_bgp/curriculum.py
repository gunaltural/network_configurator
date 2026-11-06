"""Independent Cisco IOS/IOS-XE BGP synthetic curriculum.

Own-original examples only. Cisco public documentation is consulted for
technical validation but NEVER scraped/copied into model training inputs.
"""
import hashlib
import json
import random
from dataclasses import dataclass

DATA_VERSION = "cisco-bgp-fsm-synthetic-v1"
CLASSES = (
    "IDLE_ADMIN", "IDLE", "CONNECT", "ACTIVE", "OPENSENT", "OPENCONFIRM",
    "ESTABLISHED_ZERO", "ESTABLISHED_ROUTES",
)
GROUPS = {
    "IDLE_ADMIN": (
        "CE{node}# show ip bgp summary: neighbor {peer}, Up/Down never, State/PfxRcd Idle (Admin).",
        "Router {node} BGP peer {peer}: FSM Idle (Admin); administratively shut down.",
        "IOS-XE node CE{node}: bgp {peer} neighbor state Idle (Admin), no peering attempts.",
        "show bgp ipv4 unicast summary CE{node}: remote {peer} Idle (Admin), messages 0.",
    ),
    "IDLE": (
        "CE{node}# show ip bgp summary: neighbor {peer}, Up/Down never, State/PfxRcd Idle.",
        "Router {node} BGP peer {peer}: FSM Idle; no established neighbor session.",
        "IOS-XE node CE{node}: bgp {peer} neighbor state Idle, reason undetermined.",
        "show bgp ipv4 unicast summary CE{node}: remote {peer} Idle; session not up.",
    ),
    "CONNECT": (
        "CE{node}# show ip bgp summary: neighbor {peer}, Up/Down never, State/PfxRcd Connect.",
        "Router {node} BGP peer {peer}: FSM Connect; awaiting TCP session establishment.",
        "IOS-XE node CE{node}: bgp {peer} neighbor state Connect, peer not Established.",
        "show bgp ipv4 unicast summary CE{node}: remote {peer} Connect, TCP negotiation pending.",
    ),
    "ACTIVE": (
        "CE{node}# show ip bgp summary: neighbor {peer}, Up/Down never, State/PfxRcd Active.",
        "Router {node} BGP peer {peer}: FSM Active; retrying the transport session.",
        "IOS-XE node CE{node}: bgp {peer} neighbor state Active, not Established.",
        "show bgp ipv4 unicast summary CE{node}: remote {peer} Active, retry is in progress.",
    ),
    "OPENSENT": (
        "CE{node}# show ip bgp summary: neighbor {peer}, Up/Down 00:00:03, State/PfxRcd OpenSent.",
        "Router {node} BGP peer {peer}: FSM OpenSent; OPEN negotiation not finished.",
        "IOS-XE node CE{node}: bgp {peer} neighbor state OpenSent, waiting for peer OPEN.",
        "show bgp ipv4 unicast summary CE{node}: remote {peer} OpenSent, session incomplete.",
    ),
    "OPENCONFIRM": (
        "CE{node}# show ip bgp summary: neighbor {peer}, Up/Down 00:00:04, State/PfxRcd OpenConfirm.",
        "Router {node} BGP peer {peer}: FSM OpenConfirm; keepalive confirmation pending.",
        "IOS-XE node CE{node}: bgp {peer} neighbor state OpenConfirm, not yet Established.",
        "show bgp ipv4 unicast summary CE{node}: remote {peer} OpenConfirm, awaiting keepalive.",
    ),
    "ESTABLISHED_ZERO": (
        "CE{node}# show ip bgp summary: neighbor {peer}, Up/Down 01:23:45, State/PfxRcd 0.",
        "Router {node} BGP peer {peer}: Established; 0 prefixes received in IPv4 unicast.",
        "IOS-XE CE{node}: bgp {peer} session Established, received prefix count zero.",
        "show bgp ipv4 unicast summary CE{node}: remote {peer} Established; prefix counter 0.",
    ),
    "ESTABLISHED_ROUTES": (
        "CE{node}# show ip bgp summary: neighbor {peer}, Up/Down 01:23:45, State/PfxRcd {routes}.",
        "Router {node} BGP peer {peer}: Established; {routes} prefixes received in IPv4 unicast.",
        "IOS-XE CE{node}: bgp {peer} session Established, received prefix count {routes}.",
        "show bgp ipv4 unicast summary CE{node}: remote {peer} Established; prefix counter {routes}.",
    ),
}
# The interpretation is deliberately conditional: a BGP status observation
# is not proof of impact, a verified peer configuration, or a root cause.
INTERPRETATIONS = {
    "IDLE_ADMIN": ("Administrative shutdown indicated by the status. Confirm intended "
                   "maintenance and neighbor shutdown configuration before declaring an incident."),
    "IDLE": ("Session not established. No cause or administrative intent is proven "
             "by this single observation."),
    "CONNECT": ("Session is not established; TCP negotiation is pending. Do not "
                "assert ACL, routing or remote-peer failure without corroboration."),
    "ACTIVE": ("Session is not established and is retrying TCP establishment. "
               "Transport cause requires independent checks."),
    "OPENSENT": ("BGP OPEN exchange is incomplete. Confirm peer capabilities, "
                 "AS parameters and notifications rather than assuming a cause."),
    "OPENCONFIRM": ("BGP is waiting for keepalive confirmation. Check neighbor "
                    "history and notifications before asserting the cause."),
    "ESTABLISHED_ZERO": ("BGP session is established but this AF has zero received "
                         "prefixes. Route policy and expected advertisements are not proven."),
    "ESTABLISHED_ROUTES": ("BGP session is established and this AF has received prefixes. "
                           "Best-path selection, RIB/FIB installation and service are not proven."),
}
READ_ONLY_CHECKS = (
    "show ip bgp summary",
    "show ip bgp neighbors",
    "show ip route",
)
assert set(GROUPS) == set(CLASSES) == set(INTERPRETATIONS)

@dataclass(frozen=True)
class Case:
    case_id: str
    label: str
    scenario: str
    split: str
    text: str


def training_cases(per_class=40, seed=42):
    if type(per_class) is not int or not 4 <= per_class <= 128:
        raise ValueError("per_class must be 4..128")
    if type(seed) is not int:
        raise ValueError("seed must be an integer")
    rows = []
    rng = random.Random(seed)
    for label in CLASSES:
        for i in range(per_class):
            # 192.0.2.0/24 is documentation-only IP space (RFC 5737).
            peer = f"192.0.2.{1 + (i * 13 + seed) % 253}"
            node = 1 + (i * 23 + seed) % 997
            routes = 5 + ((i * 17 + seed) % 80)
            pattern = GROUPS[label][i % len(GROUPS[label])]
            line = pattern.format(node=node, peer=peer, routes=routes)
            if i % 5 == 0:
                line = "Lab capture: " + line
            if i % 5 == 1:
                line += " Remote AS 64512."
            rows.append(Case(f"train-{label}-{i:03d}", label, f"train-{label}",
                             "train", line))
    rng.shuffle(rows)
    return rows


def dataset_fingerprint(rows):
    content = "\n".join(json.dumps(
        {"id": x.case_id, "label": x.label, "scenario": x.scenario,
         "split": x.split, "text": x.text},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False) for x in rows)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def load_frozen_holdout(path):
    """Separate CLI phrasings, dedicated TEST split, never fed to optimizer."""
    from pathlib import Path
    from ..data import SECRET
    records, seen = [], set()
    for ln, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        obj = json.loads(raw)
        if (not isinstance(obj, dict) or
                set(obj) != {"id", "label", "scenario", "split", "origin", "text"}
                or obj["label"] not in CLASSES or obj["split"] != "test"
                or obj["origin"] != "original-synthetic"
                or any(not isinstance(obj[k], str) or not obj[k].strip() for k in obj)
                or SECRET.search(obj["text"])):
            raise ValueError(f"Invalid synthetic holdout row {ln}")
        if obj["id"] in seen:
            raise ValueError("Repeated holdout case ID")
        seen.add(obj["id"])
        records.append(Case(obj["id"], obj["label"], obj["scenario"],
                            "test", obj["text"]))
    counts = {x: sum(c.label == x for c in records) for x in CLASSES}
    if any(v != 4 for v in counts.values()) or len(records) != 32:
        raise ValueError("Need four independently authored cases for every BGP class")
    return records
