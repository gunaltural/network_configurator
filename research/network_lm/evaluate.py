"""Held-out generation smoke for scratch checkpoints; not engineering acceptance.

Uses unseen scenario prompts and independent lexical sanity checks. A pass
is NEVER a verified network diagnosis; a failure is reported explicitly.
"""
from argparse import ArgumentParser
from pathlib import Path
import hashlib
import json
import torch
from .data import load_corpus
from .model import ByteTokenizer, LMConfig, ScratchNetworkLM

EXPECTATIONS = {
    'holdout-bgp-admin': ('admin', 'idle'),
    'holdout-vpc-gateway': ('enabled', 'peer'),
}


def evaluate(checkpoint_path, corpus_path, max_new_tokens=56):
    if max_new_tokens < 1 or max_new_tokens > 256:
        raise ValueError('Bound generation length to 1..256')
    corpus = load_corpus(corpus_path)
    ckpt = torch.load(checkpoint_path, map_location='cpu', weights_only=True)
    manifest = ckpt['manifest']
    if manifest.get('status') != 'EXPERIMENTAL_RANDOM_WEIGHTS_NOT_ENGINEERING_VALIDATED':
        raise ValueError('Only scratch research checkpoints accepted')
    if manifest['corpus_sha256'] != hashlib.sha256(Path(corpus_path).read_bytes()).hexdigest():
        raise ValueError('Corpus/weights mismatch')
    heldout = {x.scenario_id for x in corpus['val']}
    if heldout != set(manifest['heldout_scenarios']):
        raise ValueError('Held-out split differs from checkpoint manifest')
    if heldout.intersection(manifest['train_scenarios']):
        raise ValueError('Train/held-out scenario leakage')
    model = ScratchNetworkLM(LMConfig(**ckpt['config']))
    model.load_state_dict(ckpt['weights'], strict=True)
    model.eval()
    tokenizer = ByteTokenizer()
    results = []
    for example in corpus['val']:
        prompt = tokenizer.encode('Network observation:\n' + example.prompt + '\nEngineering review:\n', bos=True)
        output = model.complete(prompt, max_new_tokens=max_new_tokens)
        generated = tokenizer.decode(output[len(prompt):]).lower()
        expected = EXPECTATIONS.get(example.scenario_id)
        passed = bool(expected) and all(token in generated for token in expected)
        results.append({'scenario_id': example.scenario_id, 'lexical_proxy_pass': passed,
                        'produced_bytes': len(output) - len(prompt),
                        'generated_preview': generated[:140]})
    report = {'status': 'EXPERIMENTAL_HELDOUT_NOT_ENGINEERING_ACCEPTANCE',
              'checkpoint': str(checkpoint_path), 'heldout_cases': len(results),
              'lexical_proxy_pass_count': sum(item['lexical_proxy_pass'] for item in results),
              'per_case': results, 'engineering_verified': False, 'production_ready': False}
    target = Path(checkpoint_path).with_suffix('.evaluation.json')
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
    return report


def parser():
    ap = ArgumentParser(description=__doc__)
    ap.add_argument('--checkpoint', required=True)
    ap.add_argument('--corpus', default=str(Path(__file__).with_name('synthetic_corpus.jsonl')))
    ap.add_argument('--max-new-tokens', type=int, default=56)
    return ap


if __name__ == '__main__':
    args = parser().parse_args()
    evaluate(args.checkpoint, args.corpus, args.max_new_tokens)
