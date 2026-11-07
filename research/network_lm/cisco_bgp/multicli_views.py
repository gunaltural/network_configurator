"""Train-only equivalent CLI views: command order and IOS XE display dialect.

This is original-synthetic input augmentation, never a source of predictions.
All generated outputs and their engineering uncertainty boundaries are kept
unchanged. The original training case contains two read-only CLI blocks.
"""
from dataclasses import replace
import re

from .multicli_curriculum import MultiCliExample


def _sections(prompt):
    parts = re.split(r"(?=^CE# )", prompt, flags=re.MULTILINE)
    if len(parts) != 3:
        raise ValueError("Expected two original synthetic CLI command blocks")
    header = parts[0].rstrip("\n")
    first, second = (p.rstrip("\n") for p in parts[1:])
    return header, first, second


def _af_command(text):
    return text.replace(
        "CE# show ip bgp summary",
        "CE# show bgp ipv4 unicast summary",
    ).replace(
        "CE# show ip bgp neighbors ",
        "CE# show bgp ipv4 unicast neighbors ",
    ).replace(
        "CE# show ip bgp ",
        "CE# show bgp ipv4 unicast ",
    )


def train_views(record):
    """Several semantically unchanged presentations of one TRAIN observation."""
    if not isinstance(record, MultiCliExample) or record.example.split != "train":
        raise ValueError("CLI augmentation may use training records only")
    e = record.example
    header, first, second = _sections(e.prompt)
    prompts = (
        e.prompt,
        header + "\n" + second + "\n" + first,
        "Observation: synthetic IPv4 unicast BGP CLI.\n"
        + header + "\n" + _af_command(first) + "\n" + _af_command(second),
        "Evidence captured in reverse order, read-only CLI.\n"
        + header + "\n" + _af_command(second) + "\n" + _af_command(first),
    )
    if len(set(prompts)) != len(prompts):
        raise ValueError("Training view augmentation duplicates evidence")
    return [
        replace(record, example=replace(
            e, id=e.id + "-style" + str(i), prompt=prompt
        ))
        for i, prompt in enumerate(prompts)
    ]


def v3_view(record):
    """New third-style, evaluation-only reversed command blocks.

    New view uses the documented IOS-XE 'show ip bgp all summary' variant,
    followed by command blocks in different order. It is generated after
    the earlier V2 zero-score result and is NOT an independent TAC benchmark.
    """
    if not isinstance(record, MultiCliExample) or record.example.split != "test":
        raise ValueError("Third-format evaluation is test-only")
    e = record.example
    header, first, second = _sections(e.prompt)
    def special(command):
        if "CE# show ip bgp summary" in command:
            return command.replace(
                "CE# show ip bgp summary",
                "CE# show ip bgp all summary",
            )
        return _af_command(command)
    new_prompt = (
        "Read-only BGP evidence packet for a synthetic IOS-XE node.\n"
        + header + "\n"
        + special(second) + "\n" + special(first)
    )
    return replace(record, example=replace(
        e, prompt=new_prompt,
        scenario_id=e.scenario_id.replace("evidence-test-", "evidence-v3-test-"),
    ))
