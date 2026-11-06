"""Original train-only byte-pair tokenizer for the independent Cisco BGP LM.

No pretrained vocabulary or external model. All merges are derived exclusively
from original-synthetic *training* prompts/targets (never validation/holdout).
UTF-8 byte fallback retains lossless encoding for genuinely unseen CLI text.
"""
from collections import Counter
from hashlib import sha256
import json

TOKENIZER_VERSION = "scratch-byte-bpe-v1"
BOS_ID, EOS_ID, FIRST_MERGE_ID = 256, 257, 258
MAX_MERGES = 1536


def _merge_once(tokens, left, right, new_id):
    out = []
    cursor = 0
    while cursor < len(tokens):
        if (cursor + 1 < len(tokens)
                and tokens[cursor] == left and tokens[cursor + 1] == right):
            out.append(new_id)
            cursor += 2
        else:
            out.append(tokens[cursor])
            cursor += 1
    return out


class ScratchBPE:
    """Versioned BPE merges, with fixed BOS/EOS and lossless byte fallback."""

    bos_id = BOS_ID
    eos_id = EOS_ID

    def __init__(self, merges):
        if not isinstance(merges, (list, tuple)) or len(merges) > MAX_MERGES:
            raise ValueError("Invalid BPE merge manifest")
        expanded = [bytes([i]) for i in range(256)]
        expanded.extend((b"", b""))  # BOS=256, EOS=257 are not text
        clean = []
        known = set()
        for offset, pair in enumerate(merges):
            if (not isinstance(pair, (list, tuple)) or len(pair) != 2
                    or any(type(i) is not int or i < 0 or i >= FIRST_MERGE_ID + offset
                           or i in (BOS_ID, EOS_ID) for i in pair)):
                raise ValueError("Invalid BPE merge definition")
            pair = tuple(pair)
            if pair in known:
                raise ValueError("Duplicate BPE merge definition")
            known.add(pair)
            left, right = pair
            merged = expanded[left] + expanded[right]
            if not merged or len(merged) > 1024:
                raise ValueError("Invalid or oversized BPE token")
            expanded.append(merged)
            clean.append(pair)
        self.merges = tuple(clean)
        self._expanded = tuple(expanded)
        self.vocab_size = FIRST_MERGE_ID + len(clean)

    def encode(self, text, bos=False, eos=False):
        if not isinstance(text, str):
            raise TypeError("BPE encoder expects UTF-8 text")
        tokens = list(text.encode("utf-8"))
        for i, (left, right) in enumerate(self.merges):
            tokens = _merge_once(tokens, left, right, FIRST_MERGE_ID + i)
        return ([BOS_ID] if bos else []) + tokens + ([EOS_ID] if eos else [])

    def decode(self, tokens):
        if any(type(i) is not int or i < 0 or i >= self.vocab_size for i in tokens):
            raise ValueError("Out-of-vocabulary BPE token")
        return b"".join(
            self._expanded[i] for i in tokens if i not in (BOS_ID, EOS_ID)
        ).decode("utf-8", errors="replace")

    def to_manifest(self):
        return {
            "version": TOKENIZER_VERSION,
            "vocab_size": self.vocab_size,
            "merges": [list(pair) for pair in self.merges],
        }

    @classmethod
    def from_manifest(cls, data):
        if (not isinstance(data, dict)
                or set(data) != {"version", "vocab_size", "merges"}
                or data["version"] != TOKENIZER_VERSION):
            raise ValueError("Unsupported or invalid BPE tokenizer manifest")
        instance = cls(data["merges"])
        if type(data["vocab_size"]) is not int or data["vocab_size"] != instance.vocab_size:
            raise ValueError("BPE tokenizer size mismatch")
        return instance

    def fingerprint(self):
        doc = json.dumps(self.to_manifest(), sort_keys=True, separators=(",", ":"))
        return sha256(doc.encode("utf-8")).hexdigest()


def train_bpe(texts, *, vocab_size=448, min_frequency=3):
    """Deterministic BPE, fitted ONLY to explicitly supplied training strings.

    Treat each text as an independent document; pair counts never cross its
    boundaries. Ties are deterministic (count descending then token IDs).
    """
    if (type(vocab_size) is not int
            or not FIRST_MERGE_ID <= vocab_size <= FIRST_MERGE_ID + MAX_MERGES):
        raise ValueError("BPE vocabulary size out of bounds")
    if type(min_frequency) is not int or min_frequency < 2:
        raise ValueError("BPE minimum frequency must be >= 2")
    if not isinstance(texts, (list, tuple)) or not texts:
        raise ValueError("BPE requires train-only text samples")
    if any(not isinstance(t, str) or not t for t in texts):
        raise ValueError("Invalid BPE training text")
    sequences = [list(t.encode("utf-8")) for t in texts]
    merges = []
    while len(merges) < vocab_size - FIRST_MERGE_ID:
        counts = Counter(
            (left, right) for tokens in sequences
            for left, right in zip(tokens, tokens[1:])
        )
        candidates = [
            (frequency, -left, -right, left, right)
            for (left, right), frequency in counts.items()
            if frequency >= min_frequency
        ]
        if not candidates:
            break
        _, _, _, left, right = max(candidates)
        new_id = FIRST_MERGE_ID + len(merges)
        sequences = [_merge_once(t, left, right, new_id) for t in sequences]
        merges.append([left, right])
    return ScratchBPE(merges)
