"""Second synthetic IOS-XE BGP CLI benchmark with alternate command forms.

Generated from the same original synthetic scenario logic but with different
read-only command spellings, grouping and role-scoped evidence headers. This
is held out from tokenizer fitting and gradient training. This benchmark
is NOT an independently authored Cisco TAC acceptance test.
"""
from dataclasses import replace
from hashlib import sha256

from .multicli_curriculum import dataset, fingerprint


def alternate_command_view(record):
    ex = record.example
    if ex.split != "test":
        raise ValueError("Alternate command suite must remain a test-only fixture")
    prompt = ex.prompt
    for before, after in (
        ("CE# show ip bgp summary", "CE# show bgp ipv4 unicast summary"),
        ("CE# show ip bgp neighbors ", "CE# show bgp ipv4 unicast neighbors "),
        ("CE# show ip bgp ", "CE# show bgp ipv4 unicast "),
        ("Neighbor        AS       Up/Down   State/PfxRcd",
         "Neighbor          AS    Up/Down    State/PfxRcd"),
        ("BGP routing table entry for ", "BGP table entry for "),
        ("BGP state = ", "BGP state is "),
    ):
        prompt = prompt.replace(before, after)
    prompt = (
        "Synthetic IOS-XE IPv4 unicast audit view. Read-only commands.\n"
        + prompt
    )
    return replace(
        record,
        example=replace(
            ex, prompt=prompt, scenario_id=ex.scenario_id.replace(
                "evidence-test-", "evidence-altcli-test-"
            ),
        ),
    )


def holdout():
    original = dataset()
    cases = [alternate_command_view(r) for r in original["test"]]
    if len(cases) != 96:
        raise ValueError("Unexpected new CLI evaluation case count")
    source = {r.example.prompt for r in original["train"] + original["val"]}
    if any(r.example.prompt in source for r in cases):
        raise ValueError("Alternate CLI evaluation leaked into teaching")
    return cases, fingerprint(cases)
