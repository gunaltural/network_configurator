"""Original-synthetic BGP evidence sufficiency, no operational root-cause claims.

Five structurally different uncertainty cases:
  OTHER_PEER_ONLY: target never appears in the CLI
  BGP_PREFIX_ONLY: BGP prefix shown, next-hop RIB lookup absent
  IP_ROUTE_ONLY: IP next-hop route shown, associated BGP path absent
  CONTRADICTORY_PEER: same purported snapshot gives conflicting peer FSM
  WRONG_PREFIX_RIB: a route for a different prefix cannot establish target RIB

These are deliberately incomplete: the ONLY justified requested diagnosis is
EVIDENCE_INSUFFICIENT. Root cause is NOT claimed even if a different status
would be consistent with some observations. Never create operational Cisco
diagnoses from these synthetic snippets alone.
"""
from dataclasses import dataclass
from hashlib import sha256
import json

from ..data import Example, SECRET
from .curriculum import SPLIT_CONTEXTS, ALL_CONTEXTS, FIELDS, digest

VERSION = "bgp-missing-and-contradictory-evidence-v1"
UNKNOWN_KIND = "EVIDENCE_INSUFFICIENT"
GAPS = (
    "OTHER_PEER_ONLY",
    "BGP_PREFIX_ONLY",
    "IP_ROUTE_ONLY",
    "CONTRADICTORY_PEER",
    "WRONG_PREFIX_RIB",
)
WHY = {
    "OTHER_PEER_ONLY":
        "Only an unrelated BGP peer is shown; no target peer state is established.",
    "BGP_PREFIX_ONLY":
        "The BGP prefix appears but target next-hop IP route evidence is absent.",
    "IP_ROUTE_ONLY":
        "An IP route is shown but no BGP path for the target prefix is provided.",
    "CONTRADICTORY_PEER":
        "Target summary and neighbor detail disagree within the alleged snapshot.",
    "WRONG_PREFIX_RIB":
        "The available IP route belongs to a different prefix than the target.",
}
CHECK = {
    "OTHER_PEER_ONLY": "Collect target-peer BGP summary and neighbor details.",
    "BGP_PREFIX_ONLY": "Check the BGP next hop in the target IP routing table.",
    "IP_ROUTE_ONLY": "Inspect the BGP entry and next hop for the target prefix.",
    "CONTRADICTORY_PEER": "Repeat target-peer commands within one synchronized capture.",
    "WRONG_PREFIX_RIB": "Get target-prefix IP RIB and BGP path evidence.",
}
NOT_PROVEN = (
    "Target-specific BGP state or forwarding root cause is not proven."
)


@dataclass(frozen=True)
class AbstentionCase:
    example: Example
    gap: str
    context_id: int


def case(split, context_id, gap):
    if split not in SPLIT_CONTEXTS or context_id not in SPLIT_CONTEXTS[split]:
        raise ValueError("Abstention evidence must stay within frozen context group")
    if gap not in GAPS:
        raise ValueError("Unexpected insufficient-evidence type")
    other_fsm, other_route, order, reset = ALL_CONTEXTS[context_id]
    suffix = 18 + context_id
    peer = "192.0.2." + str(suffix)
    other = "198.51.100." + str(suffix)
    prefix = "10." + str(20+context_id) + ".0.0/24"
    unrelated_prefix = "10." + str(120+context_id) + ".0.0/24"
    nh = "203.0.113." + str(suffix)
    header = [
        "Original synthetic Cisco IOS-XE-style BGP evidence; incomplete or inconsistent.",
        "TARGET_NEIGHBOR="+peer,
        "TARGET_PREFIX="+prefix,
        "PEER_SCOPE=Use only evidence actually associated with the target.",
    ]
    if gap == "OTHER_PEER_ONLY":
        commands = [
            "CE# show ip bgp summary",
            "Neighbor  AS  Up/Down  State/PfxRcd",
            other+" 64550 00:02:10 "+other_fsm,
            "CE# show ip bgp neighbors "+other,
            "BGP neighbor is "+other,
            "BGP state = "+other_fsm,
        ]
    elif gap == "BGP_PREFIX_ONLY":
        commands = [
            "CE# show ip bgp "+prefix,
            "BGP table entry for "+prefix,
            "  Path via next hop "+nh+"; IP RIB observation not provided",
            "CE# show ip bgp neighbors "+other,
            "BGP neighbor is "+other,
            "BGP state = "+other_fsm,
        ]
    elif gap == "IP_ROUTE_ONLY":
        commands = [
            "CE# show ip route "+nh,
            "Routing entry for 203.0.113.0/24",
            "Known via connected, GigabitEthernet0/0",
            "CE# show ip bgp neighbors "+other,
            "BGP neighbor is "+other,
            "BGP state = "+other_fsm,
        ]
    elif gap == "CONTRADICTORY_PEER":
        commands = [
            "CAPTURE_ID=one-unverified-snapshot",
            "CE# show ip bgp summary",
            "Neighbor  AS  Up/Down  State/PfxRcd",
            peer+" 64512 00:15:20 8",
            "CE# show ip bgp neighbors "+peer,
            "BGP neighbor is "+peer,
            "BGP state = Active",
            "Observation times unknown; no synchronized timestamp proof.",
        ]
    else:
        commands = [
            "CE# show ip bgp "+prefix,
            "BGP table entry for "+prefix,
            "  Path via next hop "+nh+"; RIB decision not shown",
            "CE# show ip route "+unrelated_prefix,
            "Routing entry for "+unrelated_prefix,
            "Known via static, distance 1, via 10.10.10.1",
        ]
    # Two independently varied distractor dimensions present in all five
    # ambiguity categories, without implying the correct result.
    distractors = [
        "UNRELATED_ROUTING=" + other_route,
        "RESET_HISTORY=" + reset,
    ]
    if order:
        lines = header + distractors + commands
    else:
        lines = header + commands + distractors
    prompt = "\n".join(lines)
    completion = "\n".join([
        "FINDING="+UNKNOWN_KIND,
        "WHY="+WHY[gap],
        "NOT_PROVEN="+NOT_PROVEN,
        "CHECK="+CHECK[gap],
    ])
    if SECRET.search(prompt+"\n"+completion):
        raise ValueError("Unsafe authored synthetic BGP abstention evidence")
    return AbstentionCase(
        example=Example(
            id="uncertain-"+split+"-"+str(context_id).zfill(2)+"-"+gap,
            scenario_id="factor-"+split+"-"+str(context_id).zfill(2),
            split=split, prompt=prompt, completion=completion,
        ),
        gap=gap, context_id=context_id,
    )


def cases():
    return {
        split: [case(split, cid, gap) for cid in ids for gap in GAPS]
        for split, ids in SPLIT_CONTEXTS.items()
    }


def field_tasks(records):
    result=[]
    for record in records:
        fields=dict(line.split("=",1)
                    for line in record.example.completion.splitlines())
        if set(fields)!=set(FIELDS):
            raise ValueError("Unexpected BGP abstention schema")
        for name in FIELDS:
            e=record.example
            result.append(Example(
                id=e.id+"-"+UNKNOWN_KIND+"-"+name,
                scenario_id=e.scenario_id,
                split=e.split,
                prompt=e.prompt+"\nREQUESTED_EVIDENCE_FIELD="+name,
                completion=name+"="+fields[name],
            ))
    return result


def audit():
    groups=cases()
    split={name: field_tasks(records) for name, records in groups.items()}
    for a,b in (("train","val"),("train","test"),("val","test")):
        if {e.prompt for e in split[a]} & {e.prompt for e in split[b]}:
            raise ValueError("Insufficient evidence cases leaked between splits")
    if any(len({e.prompt for e in rows}) != len(rows)
           for rows in split.values()):
        raise ValueError("Repeated synthetic abstention prompts")
    return {
        "version":VERSION,
        "gaps":list(GAPS),
        "records":{s:len(v) for s,v in groups.items()},
        "field_tasks":{s:len(v) for s,v in split.items()},
        "sha256":{s:digest(v) for s,v in split.items()},
        "note":"Research-only five authored evidence-gaps; not real BGP root cause.",
        "engineering_verified":False,
        "production_ready":False,
    }


if __name__ == "__main__":
    print(json.dumps(audit(),ensure_ascii=False,indent=2))
