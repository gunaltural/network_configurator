'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('show-analysis.js','utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const parse = context.globalThis.ShowAnalysis.parse;
const evidenceBatches = context.globalThis.ShowAnalysis.evidenceBatches;
const fixture = [
  '------------------ show version ------------------',
  'Cisco IOS Software',
  '------------------ show running-config ------------------',
  'hostname TEST-SW',
  '------------------ show ip route ------------------',
  'Gateway of last resort is not set'
].join('\n');
const raw = fixture + '\n' + 'status line\n'.repeat(220000);
assert.ok(raw.length > 2000000 && raw.length < 5000000);
const blocks = parse(raw);
assert.equal(blocks.length, 3);
const batches = evidenceBatches(blocks);
assert.ok(batches.length > 30, 'large capture must split into bounded requests');
for (const batch of batches) { assert.ok(batch.length <= 30); assert.ok(JSON.stringify(batch).length <= 35000); }
assert.match(batches[0][0].text, /Command: show version/);
assert.ok(batches.flat().every(item => /^cli-\d+-\d+$/.test(item.id)));
assert.equal(new Set(batches.flat().map(item => item.id)).size, batches.flat().length, 'chunk ids must be unique');
assert.equal(blocks[0].command, 'show version');
assert.equal(blocks[1].command, 'show running-config');
assert.equal(blocks[2].command, 'show ip route');
assert.throws(() => parse('x'.repeat(5000001)), /5 MB/);
console.log('PASS: 2MB+ support capture parsed, command delimiters preserved, 5MB limit enforced');
