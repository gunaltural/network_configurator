"""Field-prefix conditioning for a RANDOM-INIT autoregressive BGP decoder.

The field name (FINDING/WHY/NOT_PROVEN/CHECK) is known from the request.
Prefixing the response with that requested field is output formatting, not
answer injection: the causal Transformer must generate every value token.
The correct value is NEVER appended to a test prompt or selected by a rule.
"""
from ..cisco_bgp.tokenizer import ScratchBPE
from .curriculum import FIELDS


def _requested_field(example):
    field = example.id.rsplit("-", 1)[-1]
    if field not in FIELDS:
        raise ValueError("Invalid BGP requested evidence field")
    if (not example.prompt.endswith("REQUESTED_EVIDENCE_FIELD="+field)
            or not example.completion.startswith(field+"=")):
        raise ValueError("BGP scaffold field and original supervision disagree")
    return field


def scaffold_prefix(example, tokenizer):
    field = _requested_field(example)
    return tokenizer.encode(
        "Network observation:\n"+example.prompt+
        "\nEngineering review:\n"+field+"=",
        bos=True,
    )


def encode_scaffold_example(example, tokenizer, block_size):
    field = _requested_field(example)
    prefix = scaffold_prefix(example, tokenizer)
    # Keep only value in the loss target. The field is supplied from user task,
    # not from the reference answer. The model produces all remaining bytes.
    target = tokenizer.encode(example.completion[len(field)+1:], eos=True)
    if len(prefix)+len(target) > block_size+1:
        raise ValueError("BGP evidence scaffold exceeds model context")
    x=(prefix+target)[:-1]
    y=[-100]*(len(prefix)-1)+target
    if len(x)!=len(y):
        raise ValueError("Misaligned BGP generated value loss")
    return x,y


class FieldPrefixAdapter:
    """Evaluation-only wrapper for honest scoring of model-generated values."""

    def __init__(self, model, tokenizer):
        self.model=model
        self.tokenizer=tokenizer
        self.config=model.config

    def eval(self):
        self.model.eval()
        return self

    def complete(self, prompt, max_new_tokens=100):
        decoded=self.tokenizer.decode(prompt)
        if decoded.count("REQUESTED_EVIDENCE_FIELD=")!=1:
            raise ValueError("Only one user-requested evidence field is permitted")
        field=decoded.rsplit("REQUESTED_EVIDENCE_FIELD=",1)[-1].splitlines()[0]
        if field not in FIELDS:
            raise ValueError("Invalid BGP user-requested field")
        if not decoded.endswith("\nEngineering review:\n"):
            raise ValueError("Unexpected BGP research task prompt structure")
        # Scaffold only the *known requested output key*, never a value.
        # Encode the entire visible prefix as one string, matching training.
        # BPE merges may otherwise cross the field-name boundary differently.
        full_prefix=self.tokenizer.encode(decoded+field+"=",bos=True)
        generated=self.model.complete(full_prefix,max_new_tokens=max_new_tokens)
        # The user-visible field name is known from the request; all value
        # tokens still come exclusively from the scratch Transformer.
        field_tokens=self.tokenizer.encode(field+"=")
        return prompt+field_tokens+generated[len(full_prefix):]
