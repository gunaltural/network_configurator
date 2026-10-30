const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('simulation-report.js','utf8'),context);
let count=0;
for(const module of ['BGP','OSPF','STP','VPC','EVPN','QOS','SDWAN','BASIC'])for(const language of ['en','tr']){
const scenarios=[{module,vendor:'Cisco IOS-XE',scenarioName:'Circuit <failure>',baselinePath:'A → B',currentPath:'A → C',failedDevices:[],failedLinks:['A-B'],assessment:{[language]:{summary:'Uses surviving path',sections:[],checks:[],commands:[],references:[]}}}];
const before=JSON.stringify(scenarios),html=context.window.SimulationReport.html(scenarios,language);
assert.equal(JSON.stringify(scenarios),before);assert.ok(html.includes('scenario-change-summary'));assert.ok(html.includes('scenario-evidence'));assert.ok(html.includes('Circuit &lt;failure&gt;'));assert.ok(html.includes('A → C'));assert.ok(html.indexOf('class="simulation-topologies"')<html.indexOf('<details'));count+=6;
}
assert.equal(context.window.SimulationReport.html([]),'');
console.log(`Scenario presentation: ${count+1} checks passed across 8 modules and TR/EN`);
