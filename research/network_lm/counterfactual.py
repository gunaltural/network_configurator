"""Paired counterfactual research probe: tests whether altered observations change output.

These are original synthetic contrast pairs, not production validation, an
answer key for training, or independent expert adjudication.
"""
from argparse import ArgumentParser
from pathlib import Path
import json
from .evaluate import load_verified_checkpoint

PAIRS = (
    {
        "id": "bgp-admin-vs-established",
        "left": "Cisco IOS-XE show ip bgp summary: neighbor 203.0.113.9 never Idle (Admin). What is observed?",
        "right": "Cisco IOS-XE show ip bgp summary: neighbor 203.0.113.9 00:15:10 12 prefixes received. What is observed?",
        "left_signals": ("idle", "administrative"),
        "right_signals": ("established", "session up", "12 prefixes"),
    },
    {
        "id": "ospf-two-way-vs-exstart",
        "left": "Cisco OSPF broadcast neighbor 10.0.0.3 state 2WAY/DROTHER. What is observed?",
        "right": "Cisco OSPF broadcast neighbor 10.0.0.3 state EXSTART/DR. What is observed?",
        "left_signals": ("2way", "2-way"),
        "right_signals": ("exstart",),
    },
    {
        "id": "evpn-type2-vs-type5",
        "left": "NX-OS show bgp l2vpn evpn: Route Type: 2, MAC/IP Advertisement. What is evidenced?",
        "right": "NX-OS show bgp l2vpn evpn: Route Type: 5, IP Prefix. What is evidenced?",
        "left_signals": ("type 2", "type-2", "type: 2"),
        "right_signals": ("type 5", "type-5", "type: 5"),
    },
)


def score_pair_output(left_text, right_text, pair):
    """Deliberately conservative lexical proxy; not a diagnosis truth judge."""
    left, right = left_text.lower(), right_text.lower()
    first = any(x in left for x in pair["left_signals"]) and not any(
        x in left for x in pair["right_signals"])
    second = any(x in right for x in pair["right_signals"]) and not any(
        x in right for x in pair["left_signals"])
    return bool(first and second and left != right)


def evaluate_counterfactual(checkpoint_path, corpus_path, max_new_tokens=64):
    if not 1 <= max_new_tokens <= 256:
        raise ValueError("Bound counterfactual generation length to 1..256")
    model, tokenizer, _ = load_verified_checkpoint(checkpoint_path, corpus_path)

    def generate(prompt):
        # No answer keys, expected labels or target completions enter the prompt.
        prefix = tokenizer.encode("Network observation:\n" + prompt +
                                  "\nEngineering review:\n", bos=True)
        output = model.complete(prefix, max_new_tokens=max_new_tokens)
        return tokenizer.decode(output[len(prefix):])

    cases = []
    for pair in PAIRS:
        left, right = generate(pair["left"]), generate(pair["right"])
        cases.append({
            "id": pair["id"],
            "lexical_contrast_pass": score_pair_output(left, right, pair),
            "changed_generated_text": left != right,
            "left_generated_bytes": len(left.encode("utf-8")),
            "right_generated_bytes": len(right.encode("utf-8")),
        })
    report = {
        "status": "RESEARCH_COUNTERFACTUAL_PROXY_NOT_ENGINEERING_ACCEPTANCE",
        "pair_count": len(cases),
        "lexical_contrast_pass_count": sum(x["lexical_contrast_pass"] for x in cases),
        "pairs": cases, "engineering_verified": False, "production_ready": False,
        "limitation": "Lexical contrast is a conservative sensitivity check; it cannot establish factual network-engineering reasoning.",
    }
    out = Path(checkpoint_path).with_suffix(".counterfactual.json")
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
    return report


def parser():
    ap = ArgumentParser(description=__doc__)
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--corpus", default=str(Path(__file__).with_name("synthetic_corpus.jsonl")))
    ap.add_argument("--max-new-tokens", type=int, default=64)
    return ap


if __name__ == "__main__":
    args = parser().parse_args()
    evaluate_counterfactual(args.checkpoint, args.corpus, args.max_new_tokens)
