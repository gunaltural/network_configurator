"""Conservative route-advertisement/installation triage.

Inputs must be observations parsed from CLI, not guesses. None means unknown.
No command execution or configuration changes occur here.
"""
from typing import Optional


def diagnose_route(
    *,
    session_established: Optional[bool] = None,
    prefix_in_local_rib: Optional[bool] = None,
    prefix_in_local_bgp: Optional[bool] = None,
    prefix_advertised: Optional[bool] = None,
    prefix_received: Optional[bool] = None,
    next_hop_reachable: Optional[bool] = None,
    prefix_installed: Optional[bool] = None,
) -> dict:
    observations = {
        "session_established": session_established,
        "prefix_in_local_rib": prefix_in_local_rib,
        "prefix_in_local_bgp": prefix_in_local_bgp,
        "prefix_advertised": prefix_advertised,
        "prefix_received": prefix_received,
        "next_hop_reachable": next_hop_reachable,
        "prefix_installed": prefix_installed,
    }
    for key, value in observations.items():
        if value is not None and not isinstance(value, bool):
            raise TypeError(f"{key} must be bool or None")
    findings, hypotheses, checks = [], [], []
    if session_established is False:
        findings.append("BGP session not established")
        checks.append("Verify neighbor FSM and transport before diagnosing route advertisement")
    if prefix_in_local_rib is False and prefix_in_local_bgp is False:
        findings.append("Prefix absent from local RIB and local BGP table")
        hypotheses.append("Local origination or redistribution prerequisites may be unmet")
        checks.append("Verify exact prefix, network statements, redistribution and aggregate conditions")
    elif prefix_in_local_bgp is True and prefix_advertised is False:
        findings.append("Prefix exists in local BGP table but is not advertised to peer")
        hypotheses.append("Outbound policy, AF activation or advertisement eligibility may suppress prefix")
        checks.append("Inspect neighbor advertised-routes, AF configuration and outbound policies")
    if prefix_received is True and prefix_installed is False:
        findings.append("Prefix received but not installed in forwarding RIB")
        hypotheses.append("Next-hop resolution, best-path selection or RIB policy may prevent installation")
        checks.append("Inspect route detail, next-hop resolution, best path and routing table")
    if next_hop_reachable is False:
        findings.append("Observed BGP next hop is unreachable")
        checks.append("Inspect next-hop recursion in the correct VRF and address family")
    if not findings:
        checks.append("Collect per-prefix local BGP, advertised/received and installed-route evidence")
    return {
        "observations": {k: v for k, v in observations.items() if v is not None},
        "findings": findings,
        "hypotheses": hypotheses,
        "next_read_only_checks": list(dict.fromkeys(checks)),
        "root_cause": None,
        "configuration_change_authorized": False,
        "live_verification_performed": False,
    }
