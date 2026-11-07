"""No test-label leakage in field-prefix conditioned BGP Transformer training."""
from tempfile import TemporaryDirectory
from pathlib import Path
import unittest

import torch

from ..model import ByteTokenizer, LMConfig, ScratchNetworkLM
from ..cisco_bgp.tokenizer import train_bpe
from .curriculum import FIELDS, cases as known_cases, tasks as known_tasks
from .abstention_curriculum import cases as uncertain_cases, field_tasks
from .field_scaffold import (
    _requested_field, scaffold_prefix, encode_scaffold_example,
    FieldPrefixAdapter,
)


class BGPFieldScaffoldTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rows=known_tasks(known_cases()["train"])[:16]
        cls.known=rows
        cls.unknown=field_tasks(uncertain_cases()["train"])[:12]
        cls.tokenizer=train_bpe(
            [x.prompt+"\nEngineering review:\n"+x.id.rsplit("-",1)[-1]+"="
             for x in rows+cls.unknown] +
            [x.completion.split("=",1)[1] for x in rows+cls.unknown],
            vocab_size=340,
        )

    def test_only_requested_field_is_used_not_target_evidence(self):
        for example in self.known+self.unknown:
            field=_requested_field(example)
            tokens=scaffold_prefix(example,self.tokenizer)
            decoded=self.tokenizer.decode(tokens)
            self.assertTrue(decoded.endswith("Engineering review:\n"+field+"="))
            self.assertNotIn(example.completion,decoded)
            x,y=encode_scaffold_example(example,self.tokenizer,1024)
            self.assertEqual(len(x),len(y))
            self.assertEqual(len([v for v in y if v!=-100]),
                             len(self.tokenizer.encode(
                                 example.completion.split("=",1)[1],eos=True)))
            self.assertNotIn(-100,y[len(tokens)-1:])

    def test_different_requested_fields_preserve_unique_targets(self):
        source=known_tasks(known_cases()["train"])[:4]
        self.assertEqual({x.id.rsplit("-",1)[-1] for x in source},set(FIELDS))
        for x in source:
            self.assertEqual(_requested_field(x),x.id.rsplit("-",1)[-1])
        self.assertEqual(len(set(scaffold_prefix(x,self.tokenizer).__str__()
                                 for x in source)),4)

    def test_adapter_can_only_inject_request_field_never_correct_value(self):
        token=self.tokenizer
        class SyntheticModel:
            config=type("Cfg",(),{"block_size":4096})()
            def eval(self):return self
            def complete(self,prefix,max_new_tokens=100):
                return prefix+token.encode("WRONG_MODEL_GENERATED_VALUE")
        wrapper=FieldPrefixAdapter(SyntheticModel(),token)
        for ex in self.known[:4]:
            user_prompt=token.encode(
                "Network observation:\n"+ex.prompt+"\nEngineering review:\n",bos=True)
            generated=wrapper.complete(user_prompt)
            value=token.decode(generated[len(user_prompt):])
            expected_field=ex.id.rsplit("-",1)[-1]
            self.assertEqual(value,expected_field+"=WRONG_MODEL_GENERATED_VALUE")
            self.assertNotEqual(value,ex.completion)
        with self.assertRaisesRegex(ValueError,"one"):
            wrapper.complete(token.encode("no field",bos=True))

    def test_scaffold_rejects_wrong_completion_format(self):
        from dataclasses import replace
        sample=self.known[0]
        modified=replace(sample,completion="WRONG_KEY=not evidence")
        with self.assertRaisesRegex(ValueError,"disagree"):
            encode_scaffold_example(modified,self.tokenizer,1024)
        with self.assertRaisesRegex(ValueError,"exceeds model context"):
            encode_scaffold_example(sample,self.tokenizer,8)


if __name__=="__main__":
    unittest.main()
