'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('show-analysis.js','utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const parse = context.globalThis.ShowAnalysis.parse;
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
assert.equal(blocks[0].command, 'show version');
assert.equal(blocks[1].command, 'show running-config');
assert.equal(blocks[2].command, 'show ip route');
assert.throws(() => parse('x'.repeat(5000001)), /5 MB/);
console.log('PASS: 2MB+ support capture parsed, command delimiters preserved, 5MB limit enforced');
