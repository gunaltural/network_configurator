"""Constrain only the grammar of a finding; model STILL chooses the class.

A random-initialized scratch causal BGP Transformer assigns autoregressive
conditional likelihood to each allowed FINDING label given the *actual CLI
prompt*. This is model scoring, not an if/else diagnostic rules engine, not
a classifier checkpoint and not target-label insertion. After choosing the
highest normalized LM likelihood, the SAME LM freely generates WHY,
NOT_PROVEN and CHECK. It may remain wrong or invent evidence, so this is
research only. In particular this cannot establish Cisco root cause.
"""
from argparse import ArgumentParser
from pathlib import Path
import json

import torch
import torch.nn.functional as F

from ..model import LMConfig, ScratchNetworkLM
from .multicli_curriculum import KINDS, TARGET, dataset
from .multicli_lm import evaluate
from .multicli_abstraction import abstract_record
from .multicli_views import v3_view
from .tokenizer import ScratchBPE


ALLOWED_FINDINGS = tuple(TARGET[k][0].split("=", 1)[1] for k in KINDS)
if len(set(ALLOWED_FINDINGS)) != len(ALLOWED_FINDINGS):
    raise ValueError("Duplicate research BGP finding label")


@torch.no_grad()
def label_log_prob(model, tok, input_tokens, label):
    if label not in ALLOWED_FINDINGS:
        raise ValueError("Unsupported synthetic finding label")
    fixed = tok.encode("FINDING=")
    answer = tok.encode(label + "\n")
    prefix = input_tokens + fixed
    if len(prefix) + len(answer) - 1 > model.config.block_size:
        raise ValueError("BGP evidence longer than model context")
    full_input = torch.tensor(
        [prefix + answer[:-1]], dtype=torch.long,
        device=next(model.parameters()).device,
    )
    logits, _ = model(full_input)
    completion_logits = logits[0, len(prefix) - 1:len(prefix) - 1 + len(answer)]
    log_probs = F.log_softmax(completion_logits, dim=-1)
    selected = log_probs.gather(
        1, torch.tensor(answer, dtype=torch.long, device=logits.device)[:, None]
    ).squeeze(1)
    # Length-normalized likelihood: otherwise a shorter label can win purely
    # by containing fewer tokens. This is a fixed model decoding policy.
    return float(selected.mean().item())


@torch.no_grad()
def choose_finding(model, tok, prompt):
    model.eval()
    scores = {
        label: label_log_prob(model, tok, prompt, label)
        for label in ALLOWED_FINDINGS
    }
    return max(ALLOWED_FINDINGS, key=lambda label: (scores[label], -ALLOWED_FINDINGS.index(label)))


class LearnedFindingGrammar:
    """Optional output grammar wrapper for the SAME scratch LM weights."""

    def __init__(self, model, tokenizer):
        self.model = model
        self.tokenizer = tokenizer
        self.config = model.config

    def eval(self):
        self.model.eval()
        return self

    @torch.no_grad()
    def complete(self, prompt, max_new_tokens=160):
        label = choose_finding(self.model, self.tokenizer, prompt)
        initial = self.tokenizer.encode("FINDING=" + label + "\n")
        if len(initial) >= max_new_tokens:
            raise ValueError("Insufficient decoding budget for BGP grammar")
        return self.model.complete(
            prompt + initial,
            max_new_tokens=max_new_tokens - len(initial),
        )


def restore_checkpoint(path):
    saved = torch.load(path, map_location="cpu", weights_only=True)
    manifest = saved["manifest"]
    if (manifest.get("status") != "CISCO_BGP_MULTI_CLI_GENERATIVE_RESEARCH_ONLY"
            or manifest.get("production_ready") is not False
            or manifest.get("engineering_verified") is not False):
        raise ValueError("Not a research-only scratch Cisco BGP checkpoint")
    if manifest.get("abstract_identities") is not True:
        raise ValueError("Requires peer-scoped identity abstraction")
    config = LMConfig(**saved["config"])
    config.validate()
    tokenizer = ScratchBPE.from_manifest(saved["tokenizer"])
    if (tokenizer.vocab_size != config.vocab_size
            or tokenizer.fingerprint() != manifest["tokenizer_sha256"]):
        raise ValueError("Cisco BGP checkpoint tokenizer mismatch")
    network = ScratchNetworkLM(config)
    network.load_state_dict(saved["weights"], strict=True)
    if sum(p.numel() for p in network.parameters()) != manifest["parameter_count"]:
        raise ValueError("Cisco BGP checkpoint architecture mismatch")
    network.eval()
    return network, tokenizer, manifest


def compare(path):
    model, tokenizer, manifest = restore_checkpoint(path)
    original = dataset()
    third = [abstract_record(v3_view(r)) for r in original["test"]]
    # Never use reference labels while scoring the model's own candidate
    # token probabilities. They are visible only to the final evaluation.
    greedy = evaluate(model, tokenizer, third)
    constrained = evaluate(LearnedFindingGrammar(model, tokenizer), tokenizer, third)
    if greedy["total"] != 96 or constrained["total"] != 96:
        raise ValueError("Unexpected constrained evaluation count")
    result = {
        "status": "BGP_GRAMMAR_DECODING_RESEARCH_ONLY",
        "seed": manifest["seed"],
        "training_sha256": manifest["train_sha256"],
        "third_cli_holdout_sha256": manifest["third_cli_holdout_sha256"],
        "tokenizer_sha256": manifest["tokenizer_sha256"],
        "method": "same-scratch-decoder-model-scores-valid-finding-labels",
        "greedy": greedy,
        "constrained": constrained,
        "limitations": (
            "Constrained output labels are drawn from an authored finite list. "
            "This does not demonstrate learned open-ended Cisco CLI semantics; "
            "only the generative LM can choose label likelihoods and freely "
            "generate subsequent explanation text. Synthetic research only."
        ),
        "engineering_verified": False, "production_ready": False,
    }
    print(json.dumps({
        "mode": result["status"], "seed": result["seed"],
        "greedy_finding": greedy["finding_correct"],
        "constrained_finding": constrained["finding_correct"],
        "greedy_full": greedy["exact_explanation"],
        "constrained_full": constrained["exact_explanation"],
        "greedy_pairs": greedy["paired_contrasts"]["both_correct"],
        "constrained_pairs": constrained["paired_contrasts"]["both_correct"],
        "total": constrained["total"], "not_for_live_network": True,
    }), flush=True)
    return result


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--output", default="/tmp/cisco-bgp-constrained.metrics.json")
    args = parser.parse_args()
    result = compare(args.checkpoint)
    Path(args.output).write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
