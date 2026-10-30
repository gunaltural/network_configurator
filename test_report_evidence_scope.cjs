const assert = require('node:assert/strict');
require('./engineering-report.js');
const build = globalThis.NetworkEngineeringReport.build;
let checks = 0;
for (const vendor of ['Cisco NX-OS', 'Cisco IOS-XE', 'Arista EOS', 'Huawei_CE_SW', 'FortiGate']) {
  for (const language of ['en', 'tr']) {
    const state = {
      language, vendor, technology: 'BGP', source: {module: 'BGP'},
      devices: [{id: 'ce', hostname: 'CE1', vendor}],
      configurations: [{deviceId: 'ce', text: 'router bgp 65001'}],
      simulationScenarios: [{id: 'unscoped', vendor, scenarioName: 'Unscoped failure', failedDevices: ['CE1']}]
    };
    const before = JSON.stringify(state);
    const rows = build(state).sections[0].scenarios;
    assert.ok(rows.every(r => !r.evidence.includes('Unscoped failure')), `${vendor}/${language}: unknown module must not prove BGP acceptance`);
    assert.equal(JSON.stringify(state), before, 'report analysis must preserve source data');
    for (const identity of [{module: 'BGP'}, {moduleKey: 'BGP'}, {technology: 'BGP'}]) {
      state.simulationScenarios = [{id: 'bgp', vendor, scenarioName: 'BGP circuit fail', failedLinks: ['ISP1'], ...identity}];
      assert.ok(build(state).sections[0].scenarios[0].evidence.includes('BGP circuit fail'), 'explicit and legacy technology identities remain usable');
      checks++;
    }
    for (const identity of [{module: 'OSPF'}, {technology: 'STP'}, {module: 'UNSUPPORTED', technology: 'BGP'}]) {
      state.simulationScenarios = [{id: 'other', vendor, scenarioName: 'Other module', failedDevices: ['CE1'], ...identity}];
      assert.ok(build(state).sections[0].scenarios.every(r => !r.evidence.includes('Other module')));
      checks++;
    }
    checks += 2;
  }
}
console.log(`Report evidence scope: ${checks} assertions passed across 5 vendors and TR/EN`);
