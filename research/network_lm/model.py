"""Randomly initialized byte-level causal Transformer; research, NOT production."""
from dataclasses import asdict, dataclass
import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass(frozen=True)
class LMConfig:
    block_size: int = 512
    width: int = 64
    layers: int = 2
    heads: int = 4
    vocab_size: int = 258   # bytes, BOS=256, EOS=257

    def validate(self):
        if self.block_size < 8 or self.width < 8 or self.layers < 1 or self.heads < 1 or self.width % self.heads or self.vocab_size != 258:
            raise ValueError("Invalid model dimensions")


class ByteTokenizer:
    bos_id, eos_id = 256, 257

    def encode(self, text, bos=False, eos=False):
        return ([self.bos_id] if bos else []) + list(text.encode('utf-8')) + ([self.eos_id] if eos else [])

    def decode(self, tokens):
        return bytes(i for i in tokens if 0 <= i < 256).decode('utf-8', errors='replace')


class CausalAttention(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.heads = config.heads
        self.qkv = nn.Linear(config.width, config.width * 3)
        self.proj = nn.Linear(config.width, config.width)

    def forward(self, x):
        batch, steps, dim = x.shape
        heads = self.heads
        q, k, v = self.qkv(x).chunk(3, dim=-1)
        q, k, v = (a.reshape(batch, steps, heads, dim // heads).transpose(1, 2) for a in (q, k, v))
        y = F.scaled_dot_product_attention(q, k, v, is_causal=True, dropout_p=0.0)
        return self.proj(y.transpose(1, 2).contiguous().reshape(batch, steps, dim))


class Block(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.ln1 = nn.LayerNorm(config.width)
        self.attn = CausalAttention(config)
        self.ln2 = nn.LayerNorm(config.width)
        self.mlp = nn.Sequential(nn.Linear(config.width, config.width * 4), nn.GELU(), nn.Linear(config.width * 4, config.width))

    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        return x + self.mlp(self.ln2(x))


class ScratchNetworkLM(nn.Module):
    def __init__(self, config):
        super().__init__()
        config.validate()
        self.config = config
        self.token_embedding = nn.Embedding(config.vocab_size, config.width)
        self.position_embedding = nn.Embedding(config.block_size, config.width)
        self.blocks = nn.ModuleList(Block(config) for _ in range(config.layers))
        self.final_norm = nn.LayerNorm(config.width)
        self.head = nn.Linear(config.width, config.vocab_size, bias=False)
        self.apply(self._init_weights)

    @staticmethod
    def _init_weights(module):
        if isinstance(module, (nn.Embedding, nn.Linear)):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if isinstance(module, nn.Linear) and module.bias is not None:
                nn.init.zeros_(module.bias)

    def encode(self, tokens):
        """Expose causal hidden states for research-only supervised probes.

        The language-model head, original token loss and generation are unchanged.
        """
        if tokens.dtype != torch.long or tokens.ndim != 2 or not 1 <= tokens.size(1) <= self.config.block_size:
            raise ValueError('Input must be long tensor [batch, 1..block_size]')
        positions = torch.arange(tokens.size(1), device=tokens.device)
        x = self.token_embedding(tokens) + self.position_embedding(positions)[None, :, :]
        for layer in self.blocks:
            x = layer(x)
        return self.final_norm(x)

    def forward(self, tokens, labels=None):
        logits = self.head(self.encode(tokens))
        loss = None
        if labels is not None:
            if labels.shape != tokens.shape:
                raise ValueError('Incorrect label shape')
            loss = F.cross_entropy(logits.reshape(-1, self.config.vocab_size), labels.reshape(-1), ignore_index=-100)
        return logits, loss

    @torch.no_grad()
    def complete(self, token_ids, max_new_tokens=24):
        self.eval()
        ids = torch.tensor([token_ids], dtype=torch.long, device=next(self.parameters()).device)
        for _ in range(max_new_tokens):
            logits, _ = self(ids[:, -self.config.block_size:])
            next_id = int(torch.argmax(logits[0, -1]).item())
            ids = torch.cat([ids, torch.tensor([[next_id]], device=ids.device)], dim=1)
            if next_id == ByteTokenizer.eos_id:
                break
        return ids[0].tolist()
