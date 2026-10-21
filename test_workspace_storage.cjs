const assert=require('node:assert/strict'),{pack,unpack}=require('./workspace-storage.js');
const cases=['','hello','~NC-LZW1~literal',JSON.stringify({text:'Cisco vPC · İstanbul 中文 🚀\n'.repeat(20000)}),'\ud800\udfff\u0000\uffff'.repeat(10000)];let seed=12345;for(const n of [8192,70000,300000]){let text='';for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;text+=String.fromCharCode(n===300000?seed>>>24:seed>>>16);}cases.push(text);}
for(const text of cases)assert.equal(unpack(pack(text)),text);
const oversized='x'.repeat(33554433);assert.equal(pack(oversized),oversized);
const svg='<svg><g><text>LEAF-1 Ethernet1/1 172.16.16.1</text></g></svg>'.repeat(20000);assert.ok(pack(svg).length<svg.length/5);assert.equal(unpack(pack(svg)),svg);assert.throws(()=>unpack('~NC-LZW1~123:bad'));
console.log('Workspace storage codec: Unicode, lone surrogates, dictionary saturation, high entropy, reserved prefix, corruption and repeated topology roundtrips passed.');
