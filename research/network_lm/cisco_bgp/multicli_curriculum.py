"""Original, short Cisco IOS-XE-style multi-command BGP evidence curriculum.

No copied Cisco CLI pages or real customer logs. This *synthetic* curriculum
teaches distinction between observations, plausible hypotheses, and a
defensible next verification step. Generated answers are NOT backed by a
rule engine at inference; deterministic labels are supervision only.

Reference concepts from Cisco's public source docs (do not import bodies):
- BGP FSM/State-PfxRcd: cisco.com/.../220604-understand-basic-bgp-troubleshoot.html
- Peer diagnosis: cisco.com/.../218027-troubleshoot-border-gateway-protocol-bas.html
- IOS XE display command guide: cisco.com/.../m_irg-bgp4.html
- Advertisement and next-hop checks: cisco.com/.../19345-bgp-noad.html
"""
from dataclasses import dataclass
from hashlib import sha256
import json

from ..data import Example, SECRET

CURRICULUM_VERSION = "cisco-bgp-multicli-original-synthetic-v1"
KINDS = (
    "ADMIN_DOWN", "ACTIVE_TARGET", "ACTIVE_WRONG_PEER", "ZERO_PREFIX",
    "POSITIVE_PREFIX", "NEXT_HOP_MISSING", "NEXT_HOP_PRESENT",
    "RIB_STATIC_WINS",
)
TARGET = {
    "ADMIN_DOWN": (
        "FINDING=ADMIN_DISABLED",
        "WHY=The target BGP peer is administratively disabled.",
        "NOT_PROVEN=Why the shutdown was requested is unknown.",
        "CHECK=Confirm operator intent and peer configuration.",
    ),
    "ACTIVE_TARGET": (
        "FINDING=TARGET_SESSION_DOWN",
        "WHY=The target peer is Active in summary and neighbor detail.",
        "NOT_PROVEN=TCP path, ACL and remote configuration causes are unverified.",
        "CHECK=Verify peer reachability and TCP port 179 from both ends.",
    ),
    "ACTIVE_WRONG_PEER": (
        "FINDING=TARGET_EVIDENCE_INCOMPLETE",
        "WHY=The neighbor detail belongs to a different peer.",
        "NOT_PROVEN=The target neighbor failure cause remains unknown.",
        "CHECK=Collect neighbor details for the target peer.",
    ),
    "ZERO_PREFIX": (
        "FINDING=SESSION_UP_NO_PREFIX",
        "WHY=The target peer is Established but has zero IPv4 prefixes.",
        "NOT_PROVEN=Remote advertisement and inbound filtering are unverified.",
        "CHECK=Inspect target peer routes and inbound route policy.",
    ),
    "POSITIVE_PREFIX": (
        "FINDING=SESSION_UP_PREFIXES",
        "WHY=The target peer is Established and has IPv4 prefixes.",
        "NOT_PROVEN=Route installation and packet forwarding are unverified.",
        "CHECK=Inspect BGP best paths and matching IP routes.",
    ),
    "NEXT_HOP_MISSING": (
        "FINDING=NEXTHOP_NOT_RESOLVED",
        "WHY=The BGP prefix has a next hop with no matching IP route.",
        "NOT_PROVEN=Device-wide forwarding impact is not established.",
        "CHECK=Verify next-hop reachability and underlying IGP or static routes.",
    ),
    "NEXT_HOP_PRESENT": (
        "FINDING=NEXTHOP_ROUTE_PRESENT",
        "WHY=The BGP prefix next hop has a matching IP route.",
        "NOT_PROVEN=Selected RIB entry, FIB and service are not established.",
        "CHECK=Inspect the prefix in the IP routing and forwarding tables.",
    ),
    "RIB_STATIC_WINS": (
        "FINDING=BGP_NOT_SELECTED_IN_RIB",
        "WHY=BGP has the prefix, but the IP routing table selects a static route.",
        "NOT_PROVEN=Reason for the RIB preference and FIB state need verification.",
        "CHECK=Compare route validity and administrative distance.",
    ),
}
assert tuple(TARGET) == KINDS

# Reference the exact Cisco source IDs used in source_catalog.json.
SOURCE_IDS = {
    "ADMIN_DOWN": ("CISCO-BGP-02", "CISCO-BGP-03"),
    "ACTIVE_TARGET": ("CISCO-BGP-02", "CISCO-BGP-03"),
    "ACTIVE_WRONG_PEER": ("CISCO-BGP-03", "CISCO-BGP-05"),
    "ZERO_PREFIX": ("CISCO-BGP-02", "CISCO-BGP-05"),
    "POSITIVE_PREFIX": ("CISCO-BGP-05", "CISCO-BGP-13"),
    "NEXT_HOP_MISSING": ("CISCO-BGP-03", "CISCO-BGP-13"),
    "NEXT_HOP_PRESENT": ("CISCO-BGP-05", "CISCO-BGP-13"),
    "RIB_STATIC_WINS": ("CISCO-BGP-05", "CISCO-BGP-13"),
}


@dataclass(frozen=True)
class MultiCliExample:
    example: Example
    kind: str
    source_ids: tuple[str, ...]


def _identity(split, number):
    if split == "train":
        digit = 12 + number
        subnet = 51 + number
    elif split == "val":
        digit = 117 + number
        subnet = 127 + number
    elif split == "test":
        digit = 183 + number
        subnet = 211 + number
    else:
        raise ValueError("Only three research splits")
    if digit >= 253 or subnet >= 253:
        raise ValueError("Synthetic test addresses exhausted")
    return (
        "192.0.2." + str(digit),
        "198.51.100." + str(digit),
        "10." + str(subnet) + ".1.0/24",
        "203.0.113." + str(digit),
        64512 + (number % 81),
    )


def case(kind, split, number):
    if kind not in TARGET:
        raise ValueError("Unknown Cisco BGP teaching class")
    if type(number) is not int or number < 0 or number > 30:
        raise ValueError("Invalid original case number")
    target, other, prefix, nh, remote_as = _identity(split, number)
    # Same target-peer and target-prefix identities across contrast pairs:
    # only the relevant *evidence* changes.
    lines = [
        "Original synthetic Cisco IOS-XE-style BGP CLI; NOT a real device.",
        "TARGET_NEIGHBOR=" + target,
        "TARGET_PREFIX=" + prefix,
    ]
    if kind in ("ACTIVE_TARGET", "ACTIVE_WRONG_PEER"):
        lines += [
            "CE# show ip bgp summary",
            "Neighbor        AS       Up/Down   State/PfxRcd",
            target + "  " + str(remote_as) + " never Active",
        ]
        peer_to_inspect = target if kind == "ACTIVE_TARGET" else other
        lines += [
            "CE# show ip bgp neighbors " + peer_to_inspect,
            "BGP neighbor is " + peer_to_inspect,
            "BGP state = " + ("Active" if kind == "ACTIVE_TARGET" else "Established"),
        ]
    elif kind == "ADMIN_DOWN":
        lines += [
            "CE# show ip bgp summary",
            "Neighbor        AS       Up/Down   State/PfxRcd",
            target + "  " + str(remote_as) + " never Idle (Admin)",
            "CE# show running-config | section router bgp",
            "router bgp 65010",
            "neighbor " + target + " remote-as " + str(remote_as),
            "neighbor " + target + " shutdown",
        ]
    elif kind in ("ZERO_PREFIX", "POSITIVE_PREFIX"):
        count = 0 if kind == "ZERO_PREFIX" else 6 + number % 12
        lines += [
            "CE# show ip bgp summary",
            "Neighbor        AS       Up/Down   State/PfxRcd",
            target + " " + str(remote_as) + " 01:11:00 " + str(count),
            "CE# show ip bgp neighbors " + target,
            "BGP neighbor is " + target,
            "BGP state = Established",
            "For address family IPv4 Unicast, received prefixes " + str(count),
        ]
    elif kind in ("NEXT_HOP_MISSING", "NEXT_HOP_PRESENT", "RIB_STATIC_WINS"):
        lines += [
            "CE# show ip bgp " + prefix,
            "BGP routing table entry for " + prefix,
            "  65010, next hop " + nh + ", valid",
        ]
        if kind == "NEXT_HOP_MISSING":
            lines += [
                "CE# show ip route " + nh,
                "% Network not in table",
            ]
        elif kind == "NEXT_HOP_PRESENT":
            lines += [
                "CE# show ip route " + nh,
                "Routing entry for 203.0.113.0/24",
                "Known via connected, directly connected, GigabitEthernet0/0",
            ]
        else:
            lines += [
                "CE# show ip route " + prefix,
                "Routing entry for " + prefix,
                "Known via static, distance 1, via 10.10.10.1",
            ]
    # Do not leak the answer through a classifier field in the prompt.
    prompt = "\n".join(lines)
    completion = "\n".join(TARGET[kind])
    if SECRET.search(prompt + "\n" + completion):
        raise ValueError("Sensitive information in authored synthetic observation")
    identity = "evidence-" + split + "-" + str(number).zfill(2)
    return MultiCliExample(
        Example(
            id=identity + "-" + kind,
            scenario_id=identity,
            split=split,
            prompt=prompt,
            completion=completion,
        ),
        kind=kind,
        source_ids=SOURCE_IDS[kind],
    )


def dataset():
    result = {}
    for split, count in (("train", 30), ("val", 7), ("test", 12)):
        examples = [
            case(kind, split, number)
            for number in range(count)
            for kind in KINDS
        ]
        result[split] = examples
    # A raw prompt cannot appear in more than one split.
    prompts = [
        {r.example.prompt for r in result[split]}
        for split in ("train", "val", "test")
    ]
    if any(prompts[i] & prompts[j] for i in range(3) for j in range(i+1, 3)):
        raise ValueError("Multi-CLI examples overlap across splits")
    return result


def fingerprint(rows):
    raw = "\n".join(json.dumps({
        "id": r.example.id,
        "prompt": r.example.prompt,
        "completion": r.example.completion,
    }, ensure_ascii=False, sort_keys=True) for r in rows)
    return sha256(raw.encode("utf-8")).hexdigest()
