"""Train the RANDOMLY initialized model on synthetic data; no model downloads.

CLI: python -m research.network_lm.train --steps 3 --output /tmp/network-mini.pt
Training loss is NOT an engineering accuracy score.
"""
from argparse import ArgumentParser
from dataclasses import asdict
from pathlib import Path
import hashlib
import json
import random
import torch
from .data import load_corpus, encode_example
from .curriculum import curriculum_examples, curriculum_digest, CURRICULUM_VERSION
from .model import LMConfig, ByteTokenizer, ScratchNetworkLM


def batch(encoded, selected, device):
    length = max(len(encoded[index][0]) for index in selected)
    features = torch.zeros((len(selected), length), dtype=torch.long, device=device)
    labels = torch.full((len(selected), length), -100, dtype=torch.long, device=device)
    for n, index in enumerate(selected):
        x, y = encoded[index]
        features[n, :len(x)] = torch.tensor(x, dtype=torch.long, device=device)
        labels[n, :len(y)] = torch.tensor(y, dtype=torch.long, device=device)
    return features, labels


@torch.no_grad()
def validate(model, encoded, device):
    model.eval()
    total_loss, total_tokens = 0.0, 0
    for index in range(len(encoded)):
        x, y = batch(encoded, [index], device)
        _, loss = model(x, y)
        count = int((y != -100).sum().item())
        total_loss += loss.item() * count
        total_tokens += count
    return round(total_loss / total_tokens, 6)


def train(args):
    if args.steps < 1 or args.batch_size < 1:
        raise ValueError('Positive train steps and batch required')
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(args.threads)
    config = LMConfig(block_size=args.context, width=args.width, layers=args.layers, heads=args.heads)
    tokenizer = ByteTokenizer()
    corpus = load_corpus(args.corpus)
    curriculum_size = getattr(args, 'curriculum_per_state', 0)
    curriculum_seed = getattr(args, 'curriculum_seed', 42)
    augmented = curriculum_examples(curriculum_size, curriculum_seed)
    if {x.scenario_id for x in augmented}.intersection(x.scenario_id for x in corpus['val']):
        raise ValueError('Curriculum scenario contamination of held-out validation')
    if {x.id for x in augmented}.intersection(x.id for split in corpus.values() for x in split):
        raise ValueError('Curriculum evidence ID collision')
    corpus['train'].extend(augmented)
    encoded = {split: [encode_example(ex, tokenizer, config.block_size) for ex in samples]
               for split, samples in corpus.items()}
    device = torch.device(args.device)
    model = ScratchNetworkLM(config).to(device)  # Fresh random initialization, no pretrained weights
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    initial_val = validate(model, encoded['val'], device)
    losses = []
    # Seeded per-epoch shuffle: unlike the old index loop, a short training run
    # is not silently biased toward the first few authored examples.
    schedule = list(range(len(encoded['train'])))
    rng = random.Random(args.seed)
    rng.shuffle(schedule)
    cursor = 0
    for step in range(args.steps):
        model.train()
        samples = []
        for _ in range(args.batch_size):
            if cursor >= len(schedule):
                rng.shuffle(schedule)
                cursor = 0
            samples.append(schedule[cursor])
            cursor += 1
        features, labels = batch(encoded['train'], samples, device)
        optimizer.zero_grad(set_to_none=True)
        _, loss = model(features, labels)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        losses.append(round(loss.item(), 6))
    heldout_loss = validate(model, encoded['val'], device)
    final_train_loss = validate(model, encoded['train'], device)
    manifest = {
        'status': 'EXPERIMENTAL_RANDOM_WEIGHTS_NOT_ENGINEERING_VALIDATED',
        'architecture': asdict(config),
        'parameter_count': sum(p.numel() for p in model.parameters()),
        'corpus_sha256': hashlib.sha256(Path(args.corpus).read_bytes()).hexdigest(),
        'train_scenarios': sorted(x.scenario_id for x in corpus['train']),
        'heldout_scenarios': sorted({x.scenario_id for x in corpus['val']}),
        'curriculum_version': CURRICULUM_VERSION,
        'curriculum_per_state': curriculum_size, 'curriculum_seed': curriculum_seed,
        'curriculum_count': len(augmented), 'curriculum_sha256': curriculum_digest(augmented),
        'train_example_count': len(corpus['train']),
        'val_example_count': len(corpus['val']),
        'steps': args.steps, 'train_loss_first': losses[0], 'train_loss_last': losses[-1],
        'train_loss_after': final_train_loss,
        'heldout_loss_before': initial_val, 'heldout_loss_after': heldout_loss,
        'engineering_verified': False, 'production_ready': False,
    }
    checkpoint = Path(args.output)
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    torch.save({'weights': model.state_dict(), 'config': asdict(config), 'manifest': manifest}, checkpoint)
    report = checkpoint.with_suffix('.metrics.json')
    report.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'checkpoint': str(checkpoint), 'metrics': str(report), **manifest}, ensure_ascii=False))
    return manifest


def parser():
    ap = ArgumentParser(description=__doc__)
    ap.add_argument('--corpus', default=str(Path(__file__).with_name('synthetic_corpus.jsonl')))
    ap.add_argument('--output', default='/tmp/network-lm-scratch.pt')
    ap.add_argument('--steps', type=int, default=3)
    ap.add_argument('--curriculum-per-state', type=int, default=0,
                    help='Original synthetic train-only variants per protocol state (0..64)')
    ap.add_argument('--curriculum-seed', type=int, default=42)
    ap.add_argument('--batch-size', type=int, default=2)
    ap.add_argument('--context', type=int, default=512)
    ap.add_argument('--width', type=int, default=64)
    ap.add_argument('--layers', type=int, default=2)
    ap.add_argument('--heads', type=int, default=4)
    ap.add_argument('--lr', type=float, default=0.0004)
    ap.add_argument('--seed', type=int, default=42)
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--device', default='cpu', choices=('cpu', 'cuda', 'mps'))
    return ap


if __name__ == '__main__':
    train(parser().parse_args())
