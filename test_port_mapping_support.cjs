const assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process"),
  C = require("./port-mapping-core.js");
const capture = `CORE#show tech-support
---------------- show version ----------------
Cisco IOS XE Software, Version 17.12
---------------- show running-config ----------------
hostname CORE
username admin secret MUST-NOT-BE-RETAINED
---------------- show cdp neighbors ----------------
Device ID Local Intrfce Holdtme Capability Platform Port ID
ACCESS Gig 1/0/1 120 S I C9300 Gig 1/0/48
---------------- show mac address-table ----------------
10 0050.5684.1234 dynamic Gi1/0/1
---------------- show interfaces Gi1/0/1 ----------------
GigabitEthernet1/0/1 is up, line protocol is up
  Description: UPLINK-TO-ACCESS
  0 input errors, 0 CRC
---------------- show interfaces Gi1/0/2 ----------------
GigabitEthernet1/0/2 is down, line protocol is down
  Description: UNUSED
---------------- show interfaces trunk ----------------
Port Mode Encapsulation Status Native vlan
Gi1/0/1 on 802.1q trunking 10
Port Vlans allowed on trunk
Gi1/0/1 10,20
---------------- show ip arp vrf BLUE ----------------
Internet 192.0.2.101 0 0050.5684.1234 ARPA Vlan10
---------------- show logging ----------------
MUST-NOT-BE-RETAINED-LOG
`;
const result = C.extractSupport(capture, {
  device: "Wrong fallback",
  filename: "CORE-tech.txt",
  importedAt: "2026-10-19T15:00:00Z",
});
assert.equal(result.device, "CORE");
assert.equal(result.platform, "Cisco IOS-XE");
assert.equal(result.sections.length, 6);
assert.deepEqual(result.missing, []);
assert.ok(!JSON.stringify(result.sections).includes("MUST-NOT-BE"));
assert.equal(result.sections.find((s) => s.kind === "arp").vrf, "BLUE");
const sources = result.sections.map((s, i) => ({
  ...s,
  id: "source-" + i,
  site: "Default",
  target: "",
  rows: s.kind === "mac" ? C.parse(s.raw).rows : [],
}));
const evidence = JSON.parse(
  execFileSync(
    "python",
    [
      "-c",
      "import json,sys;from port_mapping import analyze; print(json.dumps(analyze(json.load(sys.stdin))))",
    ],
    { input: JSON.stringify(sources), encoding: "utf8" },
  ),
);
const model = C.correlate(sources, evidence);
assert.equal(model.links.length, 1);
assert.equal(
  model.devices.find((d) => d.hostname === "ACCESS").role,
  "Switch / bridge",
);
const core = model.devices.find((d) => d.hostname === "CORE");
assert.equal(core.interfaces["gi1/0/1"].description, "UPLINK-TO-ACCESS");
assert.equal(
  core.interfaces["gi1/0/2"].description,
  "UNUSED",
  "Per-interface sections share a parser but retain their snapshot identity",
);
assert.equal(core.interfaces["gi1/0/1"].nativeVlan, "10");
assert.equal(core.interfaces["gi1/0/1"].allowedVlans, "10,20");
assert.equal(model.endpoints[0].addresses[0].vrf, "BLUE");
const hw = C.extractSupport(
  "<CE-01>display diagnostic-information\n===============display version===============\nHuawei Versatile Routing Platform Software\n===============display current-configuration===============\nsysname CE-01\nlocal-user secret DO-NOT-KEEP\n===============display lldp neighbor brief===============\nLocal Intf Neighbor Dev Neighbor Intf Exptime(s)\n10GE1/0/1 CE-02 10GE1/0/2 120\n===============display mac-address===============\n0050-5684-1234 10/-/- 10GE1/0/1 dynamic\n",
  { filename: "huawei.txt" },
);
assert.equal(hw.platform, "Huawei_CE_SW");
assert.equal(hw.device, "CE-01");
assert.equal(hw.sections.length, 2);
assert.ok(!JSON.stringify(hw.sections).includes("DO-NOT-KEEP"));
const hwSources = hw.sections.map((s, i) => ({
  ...s,
  id: "hw-" + i,
  site: "Default",
  target: "",
  importedAt: "2026-10-19T15:00:00Z",
}));
const hwEvidence = JSON.parse(
  execFileSync(
    "python",
    [
      "-c",
      "import json,sys;from port_mapping import analyze; print(json.dumps(analyze(json.load(sys.stdin))))",
    ],
    { input: JSON.stringify(hwSources), encoding: "utf8" },
  ),
);
assert.equal(hwEvidence.graph.links.length, 1);
const eos = C.extractSupport(
  "------------- show version -------------\nArista Networks EOS version 4.28.13.1M\n------------- show lldp neighbors -------------\nPort Neighbor Device ID Neighbor Port ID TTL\nEt1 CORE-01 Ethernet1/1 120\n------------- show mac address-table -------------\n10 0050.5684.1234 DYNAMIC Et2\n",
  { device: "EOS-01" },
);
assert.equal(eos.platform, "Arista EOS");
assert.equal(eos.sections.length, 2);
assert.throws(
  () =>
    C.extractSupport(
      "A#show version\nCisco IOS\nB#show mac address-table\n10 0050.5684.1234 dynamic Gi1/1",
    ),
  /multiple device prompts/,
);
assert.throws(() => C.extractSupport("random text"), /No multi-command/);
const fs = require("node:fs");
const sampleSources = [];
for (const filename of [
  "CORE-01-show-tech-support.txt",
  "ACCESS-01-show-tech-support.txt",
]) {
  const extracted = C.extractSupport(
    fs.readFileSync("samples/port-mapping/" + filename, "utf8"),
    { filename, site: "Default", importedAt: "2026-10-19T18:00:00Z" },
  );
  for (const s of extracted.sections)
    sampleSources.push({
      ...s,
      id: "sample-" + sampleSources.length,
      rows: s.kind === "mac" ? C.parse(s.raw).rows : [],
    });
}
const sampleEvidence = JSON.parse(
  execFileSync(
    "python",
    [
      "-c",
      "import json,sys;from port_mapping import analyze;print(json.dumps(analyze(json.load(sys.stdin))))",
    ],
    { input: JSON.stringify(sampleSources), encoding: "utf8" },
  ),
);
const sampleModel = C.correlate(sampleSources, sampleEvidence);
assert.equal(sampleModel.devices.length, 4);
assert.equal(sampleModel.links.length, 3);
assert.equal(
  sampleModel.links.filter((l) => l.state === "Both ends observed").length,
  1,
);
assert.equal(sampleModel.endpoints.length, 4);
assert.ok(sampleModel.endpoints.every((e) => e.observations.length === 2));
assert.ok(
  sampleModel.endpoints
    .find((e) => e.mac === "005056841234")
    .addresses.some((a) => a.ip === "2001:db8:10::101"),
);
module.exports = { capture };
console.log(
  "Diagnostic bundles: Cisco/Arista/Huawei headers, platform/hostname detection, summary neighbors, per-port snapshots, trunk VLANs, original line provenance, VRF case and unrelated configuration/log exclusion passed.",
);
