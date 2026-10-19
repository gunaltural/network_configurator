const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { execFileSync } = require("node:child_process"),
  { JSDOM } = require("jsdom"),
  C = require("./port-mapping-core.js");
const w = new JSDOM(fs.readFileSync("port-mapping.html", "utf8"), {
  url: "https://test.invalid/port-mapping",
  runScripts: "outside-only",
}).window;
w.fetch = async () => ({
  ok: true,
  json: async () => ({ prefixes: {}, metadata: {} }),
});
w.eval(fs.readFileSync("port-mapping-core.js", "utf8"));
w.eval(fs.readFileSync("port-mapping.js", "utf8"));
const demo = JSON.parse(JSON.stringify(w.PortMapping.demoSources()));
w.close();
function analyze(sources) {
  return JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        "import json,sys; from port_mapping import analyze; print(json.dumps(analyze(json.load(sys.stdin))))",
      ],
      { input: JSON.stringify(sources), encoding: "utf8" },
    ),
  );
}
let evidence = analyze(demo),
  model = C.correlate(demo, evidence, { "005056": "VMware" });
assert.equal(model.devices.length, 4);
assert.equal(model.links.length, 3);
assert.equal(
  model.links.filter((l) => l.state === "Both ends observed").length,
  1,
);
assert.equal(
  model.endpoints.length,
  4,
  "Upstream and access observations consolidate without duplicate clients",
);
const user = model.endpoints.find((e) => e.mac === "005056841234");
assert.equal(user.observations.length, 2);
assert.equal(user.locations.length, 1);
assert.match(user.locations[0], /eth1$/);
assert.equal(user.addresses[0].ip, "192.0.2.101");
assert.equal(C.trace(model, user).length, 1);
assert.equal(
  model.devices.find((d) => d.hostname === "PHONE-01").role,
  "Phone",
);
assert.equal(
  model.devices.find((d) => d.hostname === "AP-01").role,
  "Access point",
);
assert.equal(
  model.endpoints.find((e) => e.mac === "001B63010203").type,
  "Phone",
);
const access = model.groups.find(
  (g) => g.device === "ACCESS-01" && g.port === "Eth2",
);
assert.equal(access.detail.voiceVlan, "20");
assert.equal(access.macCount, 2);
assert.equal(access.mode, "static access");
assert.equal(
  model.groups.find((g) => g.device === "CORE-01" && g.port === "Eth1/1")
    .infrastructure,
  true,
);
const annotated = C.correlate(
  demo,
  evidence,
  {},
  {
    [user.id]: {
      hostname: "DESKTOP-01",
      type: "PC / workstation",
      notes: "Verified by engineer",
    },
  },
);
assert.equal(
  annotated.endpoints.find((e) => e.id === user.id).hostname,
  "DESKTOP-01",
);
function source(device, kind, raw, platform = "Cisco IOS-XE", extra = {}) {
  return {
    id: Math.random().toString(),
    device,
    site: "Default",
    target: "",
    platform,
    kind,
    raw,
    command: "",
    importedAt: "2026-10-19T13:00:00Z",
    rows: kind === "mac" ? C.parse(raw).rows : [],
    ...extra,
  };
}
const aggregate = [
  source(
    "CORE",
    "lldp",
    "Chassis id: 0011.2200.0002\nPort id: Ethernet49\nLocal Port id: Ethernet1/1\nSystem Name: ACCESS\nSystem Capabilities: B,R",
  ),
  source(
    "CORE",
    "interfaces",
    "1 Po10(SU) LACP Eth1/1(P) Eth1/2(P)",
    "Cisco IOS-XE",
    { command: "show etherchannel summary" },
  ),
  source("CORE", "mac", "10 0050.5684.1234 dynamic Po10"),
  source("ACCESS", "mac", "10 0050.5684.1234 dynamic Gi1/1"),
];
let agg = C.correlate(aggregate, analyze(aggregate));
assert.equal(
  agg.links.length,
  1,
  "Actual NX-OS chassis/remote/local ordering parses",
);
assert.equal(agg.groups.find((g) => g.port === "Po10").members.length, 2);
assert.equal(agg.groups.find((g) => g.port === "Po10").infrastructure, true);
assert.equal(agg.endpoints[0].locations.length, 1);
const multi = [
  source("A", "mac", "10 0050.5684.1234 dynamic Gi1/1"),
  source("B", "mac", "10 0050.5684.1234 dynamic Gi1/2"),
  source("VTEP", "mac", "10 0050.5684.1234 dynamic nve1(192.0.2.8)"),
];
let dual = C.correlate(multi, analyze(multi));
assert.equal(dual.endpoints.length, 1);
assert.equal(dual.endpoints[0].locations.length, 2);
assert.ok(dual.endpoints[0].observations.some((o) => o.remote));
assert.ok(dual.issues.some((s) => s.includes("multiple edge candidates")));
const other = source(
  "A",
  "mac",
  "10 0050.5684.1234 dynamic Gi1/8",
  "Cisco IOS-XE",
  { site: "Other" },
);
assert.equal(
  C.correlate([...multi, other], analyze([...multi, other])).endpoints.length,
  2,
  "Separate sites do not collapse identical MAC/VLAN",
);
const old = source("A", "mac", "10 0050.5684.1234 dynamic Gi1/1"),
  newer = source("A", "mac", "Total Mac Addresses: 0", "Cisco IOS-XE", {
    importedAt: "2026-10-19T14:00:00Z",
  });
assert.equal(
  C.correlate([old, newer], analyze([old, newer])).endpoints.length,
  0,
  "Empty newest full table removes stale learning",
);
assert.equal(C.correlate([old, newer], null).endpoints.length, 0);
const address = [
  source("A", "mac", "10 0050.5684.1234 dynamic Gi1/1"),
  source("A", "arp", "192.0.2.1 0 0050.5684.1234 Vlan20"),
  source("A", "nd", "2001:db8::1 0050.5684.1234 REACH Eth1", "Cisco IOS-XE", {
    vrf: "BLUE",
  }),
];
const addressModel = C.correlate(address, analyze(address));
assert.equal(addressModel.endpoints[0].addresses.length, 1);
assert.equal(addressModel.endpoints[0].addresses[0].vrf, "BLUE");
assert.equal(addressModel.endpoints[0].addresses[0].scope, "VLAN not reported");
for (const platform of ["Huawei_CE_SW", "Huawei iStack"]) {
  const s = source(
    "HW",
    "lldp",
    "10GE1/0/1 has 1 neighbor(s):\nChassis ID: 0011-2200-0003\nPort ID: Eth1\nSystem name: PEER\nSystem capabilities enabled: bridge",
    platform,
  );
  assert.equal(analyze([s]).graph.links.length, 1);
}
const cdp = source(
  "CISCO",
  "cdp",
  "Device ID: ACCESS\nPlatform: cisco C9300, Capabilities: Switch\nInterface: GigabitEthernet1/0/1, Port ID (outgoing port): GigabitEthernet1/0/48",
);
assert.equal(
  analyze([cdp]).graph.devices.find((d) => d.hostname === "ACCESS").role,
  "Switch / bridge",
);
console.log(
  "Port topology: reciprocal and one-sided neighbors, real NX-OS ordering, five switch platforms, port-channel transit, phone/AP roles, client dedup/path, IP/VRF, dual attachment, overlay, site isolation, annotations and newest empty snapshot passed.",
);
