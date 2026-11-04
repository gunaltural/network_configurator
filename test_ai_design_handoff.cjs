'use strict';
const assert=require('node:assert/strict');
require('./ai-evidence.js');require('./ai-topology-workspace.js');require('./design-checks.js');
const E=global.NetworkAIEvidence,W=global.NetworkAITopology,C=global.NetworkDesignChecks;
const report={
 source:{module:'VPC',generatedAt:'2026-11-03T00:00:00Z'},vendor:'Cisco NX-OS',
 devices:[{id:'upper-1',hostname:'N9K-A',tier:'upper'},{id:'upper-2',hostname:'N9K-B',tier:'upper'}],
 links:[{id:'peer',a:'upper-1',b:'upper-2',upperPort:'Eth1/1',lowerPort:'Eth1/1',kind:'peer-link'}],
 parameters:[{label:'vPC Domain',value:'100',impact:'Shared domain identifier'},
             {label:'BGP community',value:'65000:1',impact:'Import policy use'}],
 configurations:[
 {deviceId:'upper-1',text:'hostname N9K-A\nsnmp-server community TopSecret RO\nroute-map POLICY permit 10\n set community 65000:1 additive\nvpc domain 100'},
 {deviceId:'upper-2',text:'hostname N9K-B\nvpc domain 100\nusername admin secret MoreSecret'}
 ]
};
const validation=C.evaluate({module:'VPC',platform:'Cisco NX-OS',fields:{vpcDomain:'100'}});
const handoff=E.designHandoff(report,validation);
assert.equal(handoff.configurations.length,2);
assert.equal(handoff.parameters.length,2);
assert.equal(handoff.designChecks.source,'existing-design-checks');
assert.equal(handoff.designChecks.evaluated,validation.evaluated);
assert.ok(!JSON.stringify(handoff).includes('TopSecret')&&!JSON.stringify(handoff).includes('MoreSecret'));
assert.ok(JSON.stringify(handoff).includes('65000:1 additive'),'Routing communities are not SNMP secrets');
const workspace=W.fromDesign(handoff);
assert.equal(workspace.configs.length,2);
assert.equal(workspace.designReview.parameters.length,2);
assert.equal(workspace.designReview.edited,false);
assert.equal(workspace.designReview.checks.evaluated,validation.evaluated);
const input=W.analysisEvidenceBatches(workspace).flat();
const joined=JSON.stringify(input);
assert.ok(input.some(x=>x.id.startsWith('design-intent')),'Design parameters are sent as explicitly labeled intent');
assert.ok(input.some(x=>x.id.startsWith('design-check')),'Existing checker findings are identified as deterministic');
assert.ok(input.some(x=>x.id.startsWith('config-')),'Generated configuration is included in AI evidence');
assert.ok(joined.includes('L4:  set community 65000:1 additive'),'CLI line number is preserved after secret redaction');
assert.ok(!joined.includes('TopSecret')&&!joined.includes('MoreSecret'));
assert.ok(joined.includes('NOT deployed'),'Generator output cannot be mistaken for operational evidence');
const altered=W.addDevice(workspace,{id:'firewall',hostname:'FW-1',vendor:'FortiGate'});
assert.equal(altered.designReview.edited,true);
assert.equal(workspace.designReview.edited,false,'Original snapshot must not be mutated');
assert.ok(JSON.stringify(W.analysisEvidenceBatches(altered)).includes('workspace has since been edited'));
assert.ok(!JSON.stringify(W.analysisManifest(workspace)).includes('TopSecret'),'Manifest never includes configs');
assert.throws(()=>E.designHandoff({...report,source:{module:'COMBINED'}},null),/individual module/);
assert.throws(()=>E.designHandoff({...report,configurations:[{deviceId:'upper-1',text:'x'.repeat(150001)}]},null),/150 KB/);
// A manually attached CLI proposal must remain design intent, not observed state.
// Regression: editing a design-derived workspace invalidates the original check snapshot.
const manuallyEdited=W.setConfiguration(workspace,'upper-1',
 'hostname N9K-A\nusername engineer secret ManualSecret\nfeature vpc\nvpc domain 100');
assert.equal(manuallyEdited.designReview.edited,true);
assert.equal(workspace.designReview.edited,false,'Manual config edits cannot mutate imported Design');
const editedEvidence=JSON.stringify(W.analysisEvidenceBatches(manuallyEdited));
assert.ok(!editedEvidence.includes('ManualSecret'),'Manually attached secrets must be redacted');
assert.ok(editedEvidence.includes('STALE AFTER WORKSPACE EDITS'),'Original checker findings must be marked stale');
assert.ok(editedEvidence.includes('NOT deployed'),'Manual configuration must not become operational evidence');
assert.ok(editedEvidence.includes('L3: feature vpc'),'Manual CLI lines retain citation coordinates');
// Regression: deterministic Design checker diagnostics can contain credentials; never forward them to AI.\nconst withSensitiveCheck=W.fromDesign({...handoff,designChecks:{...handoff.designChecks,issues:[{code:'CONFIG',severity:'warning',message:'username admin secret LeakedCheckerPassword'}]}});\nconst checkEvidence=JSON.stringify(W.analysisEvidenceBatches(withSensitiveCheck));\nassert.ok(!checkEvidence.includes('LeakedCheckerPassword'),'Design checker diagnostics must be redacted before AI export');\nassert.ok(checkEvidence.includes('[REDACTED]'),'Sensitive checker diagnostic is explicitly redacted');\nconsole.log('AI Design Review: generator proposals, input checker, intent provenance, original line numbers, redaction and stale source controls passed.');
