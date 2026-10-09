const fs=require('fs'),assert=require('assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
let resolveParse;
const dom=new JSDOM(fs.readFileSync('network-discovery.html','utf8'),{url:'https://test.invalid/network-discovery',runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(w){w.confirm=()=>true;w.fetch=()=>new Promise(resolve=>resolveParse=resolve);}});
const w=dom.window,d=w.document;w.eval(fs.readFileSync('network-discovery.js','utf8'));
(async()=>{try{
 d.getElementById('discoveryLocalName').value='OLD-SW';d.getElementById('discoveryImportOutput').value='saved CLI';d.getElementById('discoveryParse').click();
 d.getElementById('discoveryClearTop').click();assert.equal(d.getElementById('discoveryImportOutput').value,'');assert.equal(d.getElementById('discoveryLocalName').value,'');assert.equal(d.getElementById('discoveryParse').disabled,false);
 resolveParse({ok:true,json:async()=>({sources:[],graph:{devices:[],links:[],warnings:[]}})});await new Promise(r=>setTimeout(r,10));
 assert.match(d.getElementById('discoveryStatus').textContent,/Topology cleared/);const snapshot=w.NetworkDiscovery.snapshot();assert.equal(snapshot.sources.length,0);assert.equal(snapshot.graph.devices.length,0);assert.equal(snapshot.graph.links.length,0);assert.deepEqual(JSON.parse(JSON.stringify(snapshot.positions)),{});
 assert.equal(JSON.parse(w.sessionStorage.getItem('networkConfigurator.workflow.design')).networkDiscovery.graph.devices.length,0,'Reopening must not resurrect the previous topology');
 d.getElementById('discoveryImportOutput').value='keep if cancelled';w.confirm=()=>false;d.getElementById('discoveryClearMap').click();assert.equal(d.getElementById('discoveryImportOutput').value,'keep if cancelled');
 console.log('Prominent topology clearing, saved empty graph, CLI cleanup, confirmation and ignored late parse results passed.');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
