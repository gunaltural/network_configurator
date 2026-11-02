"""Read-only, evidence-bound BGP neighbor diagnostic recommendations.

This module does not execute commands, modify devices, or assert root causes.
"""
from __future__ import annotations

from typing import Any

KNOWN_STATES = {"Idle", "Active", "Connect", "OpenSent", "OpenConfirm", "Idle (Admin)"}


def diagnose_neighbor(state: str, vendor: str = "cisco", evidence: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Produce conservative hypotheses and next checks from an observed FSM state.

    A numeric State/PfxRcd column is evidence of an Established session in
    Cisco-style BGP summary output; it is not an FSM state name.
    """
    state = str(state).strip()
    vendor = str(vendor).strip().lower()
    if state not in KNOWN_STATES and not state.isdecimal():
        raise ValueError("Unrecognized BGP summary state")
    observations = [{"claim": f"BGP summary reports {state}", "source": "bgp_summary"}]
    supplied = list(evidence or [])
    hypotheses: list[str] = []
    checks: list[str] = []
    if state == "Idle (Admin)":
        hypotheses = ["Neighbor may be administratively disabled; check intended state"]
        checks = ["Inspect neighbor shutdown configuration and change intent"]
    elif state in {"Idle", "Active", "Connect"}:
        hypotheses = [
            "Transport or peer reachability issue",
            "Peer configuration or source-address mismatch",
            "TCP/179 filtering or authentication mismatch",
        ]
        checks = [
            "Inspect neighbor detail and relevant logs",
            "Verify peer reachability in the correct VRF and source context",
            "Check interface state, routing and TCP/179 policy",
            "Compare local and remote AS, source, multihop and authentication",
        ]
    elif state in {"OpenSent", "OpenConfirm"}:
        hypotheses = ["BGP OPEN negotiation or session stability issue"]
        checks = ["Inspect neighbor detail, notifications and logs", "Compare AS, capabilities, authentication and timers"]
    else:
        checks = ["Inspect received, advertised and installed routes if a routing issue is reported"]
    return {
        "vendor": vendor,
        "state": "Established" if state.isdecimal() else state,
        "received_prefix_count": int(state) if state.isdecimal() else None,
        "observations": observations + supplied,
        "hypotheses": hypotheses,
        "next_read_only_checks": checks,
        "root_cause": None,
        "configuration_change_authorized": False,
        "live_verification_performed": False,
    }
