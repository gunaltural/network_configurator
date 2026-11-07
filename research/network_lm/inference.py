"""Offline, fail-closed inference for the independently trained scratch state probe.

A label is an unverified research candidate, never a root-cause diagnosis.
Requires a locally generated, manifest-verified checkpoint; no external calls.
"""
from dataclasses import asdict
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
import json
import re

import torch

from .curriculum import CURRICULUM_VERSION, curriculum_digest, curriculum_examples
from .data import SECRET
from .model import ByteTokenizer, LMConfig
from .state_probe import (
    CHALLENGE_PATH, STATES, TRANSFER_CASES, ScratchStateProbe
)

MAX_OBSERVATION_BYTES = 480
# Not a comprehensive DLP solution. Reject suspicious CLI rather than sending
# customer credentials or claiming to have redacted all possible secrets.
_SENSITIVE = re.compile(
    r"(?i)(?:\b(?:password|passwd|secret|authorization|api[_-]?key|"
    r"psksecret|private[_ .-]?key)\b|snmp[- ]server\s+community|"
    r"BEGIN [A-Z ]*PRIVATE KEY|Bearer\s+\S+)"
)

def validate_observation(raw):
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("An observation is required")
    if "\x00" in raw or "\r" in raw or "\n" in raw:
        raise ValueError("Only one observation line is supported, not full Show-Tech")
    value = raw.strip()
    if not value.isprintable():
        raise ValueError("Control characters are not allowed")
    if len(value.encode("utf-8")) > MAX_OBSERVATION_BYTES:
        raise ValueError("Observation exceeds the research byte limit")
    if _SENSITIVE.search(value) or SECRET.search(value):
        raise ValueError("Potential secret in observation; input rejected")
    return value


def _manifest_matches(checkpoint, *, trusted_path):
    """Require evidence that the local checkpoint matches repository-owned data.

    torch.load(weights_only=True) is used solely on a locally generated,
    trusted research checkpoint. Do not expose this loader to remote uploads.
    """
    if checkpoint.get("states") != STATES:
        raise ValueError("Checkpoint state vocabulary mismatch")
    manifest = checkpoint.get("manifest")
    if not isinstance(manifest, dict):
        raise ValueError("Missing research manifest")
    if (manifest.get("status") != "SCRATCH_STATE_RECOGNITION_RESEARCH_ONLY"
            or manifest.get("engineering_verified") is not False
            or manifest.get("production_ready") is not False):
        raise ValueError("Checkpoint is not an unverified scratch state probe")
    if manifest.get("curriculum_version") != CURRICULUM_VERSION:
        raise ValueError("Curriculum version mismatch")
    count = manifest.get("train_cases")
    seed = manifest.get("seed")
    if type(count) is not int or count < 16 or count > 1024 or count % len(STATES):
        raise ValueError("Invalid curriculum sample count")
    if type(seed) is not int:
        raise ValueError("Invalid checkpoint seed")
    examples = curriculum_examples(count // len(STATES), seed=seed)
    heldout = curriculum_examples(3, seed=seed + 401)
    if (manifest.get("curriculum_train_digest") != curriculum_digest(examples)
            or manifest.get("curriculum_holdout_digest") != curriculum_digest(heldout)):
        raise ValueError("Checkpoint training or holdout provenance mismatch")
    source = sha256(CHALLENGE_PATH.read_bytes()).hexdigest()
    if manifest.get("challenge_sha256") != source:
        raise ValueError("Frozen evaluation source differs from checkpoint")
    transfer = sha256(json.dumps(TRANSFER_CASES, ensure_ascii=False).encode()).hexdigest()
    if manifest.get("transfer_sha256") != transfer:
        raise ValueError("Transfer evaluation source differs from checkpoint")
    if not isinstance(checkpoint.get("config"), dict):
        raise ValueError("Missing Transformer config")
    config = LMConfig(**checkpoint["config"])
    config.validate()
    if manifest.get("architecture") != asdict(config):
        raise ValueError("Checkpoint architecture mismatch")
    model = ScratchStateProbe(config)
    if manifest.get("parameter_count") != sum(p.numel() for p in model.parameters()):
        raise ValueError("Parameter count mismatch")
    model.load_state_dict(checkpoint["weights"], strict=True)
    return model


def load_probe(path):
    """No implicit training or downloading; path must exist on trusted local disk."""
    local = Path(path)
    if not local.is_file():
        raise FileNotFoundError("Locally generated research checkpoint was not found")
    ckpt = torch.load(local, map_location="cpu", weights_only=True)
    model = _manifest_matches(ckpt, trusted_path=local)
    model.eval()
    return model, ByteTokenizer()


def predict(model, tokenizer, observation, *, abstain_score=0.90, abstain_margin=0.30):
    """Model logits -> *uncalibrated* softmax, never evidence of correct diagnosis.

    Even a high-scoring result is a candidate, not accepted engineering analysis.
    """
    value = validate_observation(observation)
    encoded = tokenizer.encode("Observed CLI:\n" + value, bos=True)
    if len(encoded) > model.backbone.config.block_size:
        raise ValueError("Input exceeds model context; never truncate evidence")
    with torch.inference_mode():
        tensor = torch.tensor([encoded], dtype=torch.long, device="cpu")
        logits = model(tensor, torch.tensor([len(encoded)], dtype=torch.long))
        scores = torch.softmax(logits[0], dim=-1)
        values, indices = scores.topk(3)
    top = [{"label": STATES[int(i)], "uncalibrated_score": round(float(s), 6)}
           for s, i in zip(values.tolist(), indices.tolist())]
    score, margin = float(values[0]), float(values[0] - values[1])
    # Thresholds are conservative engineering guardrails, NOT empirically
    # calibrated selective-accuracy bounds. Never label scores "confidence".
    abstain = score < abstain_score or margin < abstain_margin
    return {
        "mode": "offline-scratch-state-probe",
        "decision": "ABSTAIN" if abstain else "RESEARCH_CANDIDATE_ONLY",
        "candidate_label": None if abstain else top[0]["label"],
        "uncalibrated_score": round(score, 6),
        "uncalibrated_margin": round(margin, 6),
        "top_candidates": top,
        "observed_text": value,
        "engineering_verified": False, "root_cause_verified": False,
        "production_ready": False,
        "limitations": [
            "16 original-synthetic state labels only; not a general Show-Tech analysis",
            "No CLI-line provenance, peer correlation or root-cause verification",
            "Softmax is not a calibrated probability of correctness",
            "Never use this result to make network configuration or outage decisions",
        ],
    }
