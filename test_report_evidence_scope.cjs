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

// Combined reports must keep module and platform evidence separate, even when
// devices are shared across module designs.
let combinedChecks = 0;
for (const language of ['en', 'tr']) {
  const vendor = 'Cisco IOS-XE';
  const modules = ['BGP', 'OSPF', 'STP', 'VPC', 'SDWAN', 'QOS', 'EVPN', 'BASIC'];
  const devices = [{id: 'core', hostname: 'Core1', vendor}];
  const state = {
    language, vendor, devices,
    configurations: [{deviceId: 'core', text: 'router bgp 65001\nrouter ospf 1\nspanning-tree mode mst\nstackwise-virtual\nntp server 192.0.2.1'}],
    moduleReports: modules.map(module => ({module, vendor, technology: module === 'VPC' ? 'StackWise Virtual' : module, design: {devices}})),
    simulationScenarios: modules.flatMap(module => [
      {id: module, module, vendor, scenarioName: `OWN_${module}_EVIDENCE`, failedDevices: ['Core1'], failedLinks: ['ISP1 WAN peer-link SVL'], metrics: [{metric: 'Offered traffic', current: 100}]},
      {id: 'foreign-'+module, module, vendor: 'Arista EOS', scenarioName: `FOREIGN_${module}_EVIDENCE`, failedDevices: ['Core1'], failedLinks: ['WAN peer-link'], metrics: [{metric: 'Offered traffic', current: 100}]}
    ])
  };
  const before = JSON.stringify(state);
  const sections = build(state).sections;
  assert.equal(sections.length, modules.length);
  for (const [index, section] of sections.entries()) {
    const evidence = section.scenarios.map(s => s.evidence).join('\n');
    assert.ok(evidence.includes(`OWN_${modules[index]}_EVIDENCE`), modules[index]+' own evidence is retained');
    assert.ok(!evidence.includes('FOREIGN_'), 'other platform evidence is excluded');
    for (const other of modules.filter(m => m !== modules[index])) {
      assert.ok(!evidence.includes(`OWN_${other}_EVIDENCE`), other+' must not enter '+modules[index]);
    }
    combinedChecks += 9;
  }
  assert.equal(JSON.stringify(state), before, 'combined report must not mutate saved designs');
  combinedChecks += 2;
}
console.log(`Combined report evidence: ${combinedChecks} assertions passed across 8 modules and TR/EN`);
