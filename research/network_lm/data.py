"""Synthetic-only research corpus; no customer CLI or copied vendor text."""
from dataclasses import dataclass
from pathlib import Path
import hashlib
import json
import re
from .model import ByteTokenizer

SECRET = re.compile(r'(?i)(?:password|passwd|secret|private.key|api.key|psksecret|pre.shared.key|authorization)\s*[:= ]\s*\S+')


@dataclass(frozen=True)
class Example:
    id: str
    scenario_id: str
    split: str
    prompt: str
    completion: str


def load_corpus(path):
    result = {'train': [], 'val': []}
    seen_ids, scenario_split, hashes = set(), {}, set()
    for number, raw in enumerate(Path(path).read_text(encoding='utf-8').splitlines(), 1):
        if not raw.strip():
            continue
        try:
            value = json.loads(raw)
        except ValueError as exc:
            raise ValueError(f'Invalid JSON row {number}') from exc
        fields = {'id', 'scenario_id', 'split', 'origin', 'prompt', 'completion'}
        if not isinstance(value, dict) or set(value) != fields:
            raise ValueError('Invalid corpus schema')
        if value['origin'] != 'original-synthetic' or value['split'] not in result:
            raise ValueError('Only explicitly synthetic records are permitted')
        if any(not isinstance(value[k], str) or not value[k].strip() for k in fields):
            raise ValueError('Empty corpus field')
        example = Example(**{k: value[k] for k in ('id', 'scenario_id', 'split', 'prompt', 'completion')})
        if example.id in seen_ids:
            raise ValueError('Duplicate example ID')
        seen_ids.add(example.id)
        if example.scenario_id in scenario_split and scenario_split[example.scenario_id] != example.split:
            raise ValueError('Train/validation data leakage: same scenario')
        scenario_split[example.scenario_id] = example.split
        text = example.prompt + '\n' + example.completion
        if SECRET.search(text):
            raise ValueError('Possible credential in research corpus')
        hashed = hashlib.sha256(text.encode()).hexdigest()
        if hashed in hashes:
            raise ValueError('Duplicate corpus text')
        hashes.add(hashed)
        result[example.split].append(example)
    if not result['train'] or not result['val']:
        raise ValueError('Both train and held-out data required')
    return result


def encode_example(example, tokenizer: ByteTokenizer, block_size):
    prefix = tokenizer.encode('Network observation:\n' + example.prompt + '\nEngineering review:\n', bos=True)
    target = tokenizer.encode(example.completion, eos=True)
    tokens = prefix + target
    if len(tokens) > block_size + 1:
        raise ValueError('Example exceeds context, truncation is forbidden')
    x = tokens[:-1]
    labels = [-100] * (len(prefix) - 1) + target
    if len(labels) != len(x):
        raise ValueError('Unexpected target alignment')
    return x, labels
