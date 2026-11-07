"""Audit synthetic BGP training reproducibility without leaking heldout answers.

This is model-training instrumentation, never a BGP inference/diagnostic rule.
Initial and final tensors are hashed in deterministic named tensor order,
including dtype and shape, to detect numerical divergence across CI runners.
"""
from hashlib import sha256
import json
import platform

import torch


def model_fingerprint(model):
    h = sha256()
    for name, tensor in sorted(model.state_dict().items()):
        data = tensor.detach().cpu().contiguous()
        metadata = json.dumps({
            "name": name,
            "dtype": str(data.dtype),
            "shape": list(data.shape),
        }, sort_keys=True, separators=(",", ":")).encode("utf-8")
        h.update(len(metadata).to_bytes(4, "big"))
        h.update(metadata)
        # CPU-only research runner has no NumPy dependency. Reinterpret the
        # contiguous tensor bytes directly through PyTorch; preserve dtype
        # and shape in the separately hashed metadata above.
        payload = bytes(data.reshape(-1).view(torch.uint8).tolist())
        h.update(len(payload).to_bytes(8, "big"))
        h.update(payload)
    return h.hexdigest()


def runtime_info():
    return {
        "torch_version": torch.__version__,
        "python_version": platform.python_version(),
        "machine": platform.machine(),
        "cpu_threads": torch.get_num_threads(),
        "deterministic_algorithms": torch.are_deterministic_algorithms_enabled(),
        "mkldnn_enabled": torch.backends.mkldnn.enabled,
        "cpu_capability": torch._C._get_cpu_capability(),
    }


def compact_batch_fingerprint(indices):
    h = sha256()
    for item in indices:
        if type(item) is not int or item < 0:
            raise ValueError("Training indices must be non-negative integers")
        h.update(item.to_bytes(8, "big"))
    return h.digest()
