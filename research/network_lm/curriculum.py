"""Original, synthetic-only network observation curriculum for scratch training.

No vendor documentation, customer CLI or pretrained weights are ingested.
These are repeated *templates*, not independent engineering knowledge.
Every generated record stays in TRAIN; pre-existing held-out groups stay unseen.
"""
from dataclasses import asdict
from hashlib import sha256
import json
import random

from .data import Example

CURRICULUM_VERSION = "original-synthetic-protocol-states-v1"

# Each response is intentionally conditional: a state observation never certifies
# service impact, a root cause or end-to-end connectivity.
_STATE_PAIRS = (
    ("bgp-active", "BGP neighbor {peer} on {host}: session state Active; 0 prefixes received.",
     "Observed BGP Active, not Established. Verify transport and peer intent; no root cause is proven."),
    ("bgp-established", "BGP neighbor {peer} on {host}: Established for 00:12:30; 15 prefixes received.",
     "Observed BGP Established with 15 prefixes received. Policy and forwarding remain unverified."),
    ("ospf-drotwo", "OSPF neighbor {peer} on {host} in broadcast segment: 2WAY/DROTHER.",
     "Observed OSPF 2WAY/DROTHER. This can be expected on broadcast media; check DR and BDR roles."),
    ("ospf-exstart", "OSPF neighbor {peer} on {host}: EXSTART/DR, interface Ethernet1.",
     "Observed OSPF EXSTART/DR. Adjacency is unfinished; MTU and negotiation are hypotheses, not proven causes."),
    ("evpn-type2", "EVPN on {host}: Route Type 2 MAC/IP advertisement, RT 65001:1000.",
     "Observed EVPN Type-2 control-plane advertisement; neither Type-5 status nor tenant reachability is proven."),
    ("evpn-type5", "EVPN on {host}: Route Type 5 IP Prefix 10.220.0.0/16, RT 65001:1000.",
     "Observed EVPN Type-5 IP prefix in control plane; RIB/FIB installation and service access are unverified."),
    ("sdwan-probe-dead", "SD-WAN on {host}: health-check member wan1 state(dead), loss 100%.",
     "Observed SD-WAN probe failure for wan1; service outage and actual path selection are not proven."),
    ("sdwan-probe-alive", "SD-WAN on {host}: health-check member wan1 state(alive), loss 0%.",
     "Observed SD-WAN probe alive for wan1; selected service rule and end-user experience remain unverified."),
    ("mlag-link-up", "MLAG on {host}: peer-link status Up, local-int status Up.",
     "Observed MLAG peer-link Up; peer consistency, redundancy and failover still require corroboration."),
    ("mlag-link-down", "MLAG on {host}: peer-link status Down, local-int status Up.",
     "Observed MLAG peer-link Down. Check peer keepalive and consistency before asserting split brain."),
    ("stp-alt-block", "STP VLAN 37 on {host}: Ethernet1 role Alternate, status Blocking.",
     "Observed STP Alternate Blocking; not proof of a failed cable or a forwarding loop."),
    ("stp-root-forward", "STP VLAN 37 on {host}: Ethernet1 role Root, status Forwarding.",
     "Observed STP Root Forwarding on Ethernet1; confirm bridge/root intent and topology separately."),
    ("system-ntp-sync", "System status on {host}: NTP synchronized, stratum 3.",
     "Observed local NTP synchronization; timestamps and reachability of every peer are not verified."),
    ("system-ntp-unsync", "System status on {host}: NTP unsynchronized, stratum 16.",
     "Observed unsynchronized NTP state. Check clock source and time scope; root cause not established."),
    ("dci-peer-up", "DCI on {host}: NVE peer {peer} Up via control plane.",
     "Observed NVE peer Up; cross-site tenant forwarding and route installation remain unverified."),
    ("dci-peer-down", "DCI on {host}: NVE peer {peer} Down via control plane.",
     "Observed NVE peer Down; underlay, peer and overlay state need independent verification."),
)


def curriculum_examples(per_state=0, seed=42):
    if type(per_state) is not int or not 0 <= per_state <= 64:
        raise ValueError("curriculum_per_state must be an integer 0..64")
    if type(seed) is not int:
        raise ValueError("curriculum seed must be an integer")
    rng = random.Random(seed)
    records = []
    for name, prompt, response in _STATE_PAIRS:
        for i in range(per_state):
            # Documentation prefixes only. Different IPs/hostnames test literal
            # variation, *not* genuinely independent network reasoning.
            address = f"192.0.2.{(i * 11 + 17) % 254 + 1}"
            host = f"LAB-{(i * 7 + seed) % 997:03d}"
            variant = rng.choice((
                "Explain only what is observed.",
                "Distinguish evidence from possible root causes.",
                "Give a conditional engineering review.",
            ))
            records.append(Example(
                id=f"curr-{name}-{i:03d}",
                scenario_id=f"curriculum-{name}",
                split="train",
                prompt=prompt.format(peer=address, host=host) + " " + variant,
                completion=response,
            ))
    rng.shuffle(records)
    return records


def curriculum_digest(examples):
    payload = "\n".join(json.dumps(asdict(e), sort_keys=True, ensure_ascii=False,
                                  separators=(",", ":")) for e in examples)
    return sha256(payload.encode("utf-8")).hexdigest()
