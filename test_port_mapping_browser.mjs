import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.SMOKE_URL || "http://127.0.0.1:8144";
try {
  // This suite exercises the optional map; the implementation suite verifies it is collapsed by default.
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
    const results=document.getElementById('pmResults'),map=document.getElementById('pmMapDetails');
    if(results&&map)new MutationObserver(()=>{if(!results.hidden)map.open=true;}).observe(results,{attributes:true,attributeFilter:['hidden']});
  }));
  await page.goto(base + "/port-mapping");
  await page.waitForFunction(() =>
    document
      .getElementById("pmDatabase")
      .textContent.includes("organization prefixes"),
  );
  assert.equal(
    await page.locator("[data-nc-port-mapping]").getAttribute("aria-current"),
    "page",
  );
  await page.locator("#pmExample").click();
  assert.equal(await page.locator("#pmMap [data-group]").count(), 2);
  await page.locator("#pmMap [data-group]").first().click();
  assert.match(
    await page.locator("#pmInspector").innerText(),
    /switchport\/trunk output required/,
  );
  await page.locator("#pmSearch").fill("005056");
  assert.equal(await page.locator("#pmRows tr").count(), 2);
  await page.locator("#pmSearch").fill("");
  await page.locator("#pmVlan").selectOption("20");
  assert.equal(await page.locator("#pmRows tr").count(), 1);
  await page.locator("#pmVlan").selectOption("");
  const download = page.waitForEvent("download");
  await page.locator("#pmSave").click();
  const file = await download;
  await file.saveAs("/tmp/port-mapping-browser-workspace.json");
  page.once("dialog", (d) => d.accept());
  await page.locator("#pmClear").click();
  await page
    .locator("#pmFiles")
    .setInputFiles("/tmp/port-mapping-browser-workspace.json");
  await page.waitForFunction(() => window.PortMapping.sources().length === 1);
  assert.equal(await page.locator("#pmMap [data-group]").count(), 2);
  page.once("dialog", (d) => d.accept());
  await page.locator("#pmClear").click();
  // RTF formatting can interrupt command headers; classify the decoded text.
  await page.locator("#pmFiles").setInputFiles({
    name: "sanitized-show-tech.rtf",
    mimeType: "application/rtf",
    buffer: Buffer.from(String.raw`{\rtf1
------------------ \b show version\b0 ------------------\par
Cisco IOS Software\par
------------------ \b show running-config\b0 ------------------\par
hostname LOCAL-SW\par
username private secret NEVER-RETAIN-CONFIG\par
------------------ \b show interfaces\b0 ------------------\par
GigabitEthernet1/0/1 is up, line protocol is up\par
 Description: CLIENT-NETWORK\par
------------------ \b show mac-address-table\b0 ------------------\par
10 0050.5684.1234 dynamic Gi1/0/1\par
}`),
  });
  await page.waitForFunction(() => window.PortMapping.sources().length === 3);
  assert.equal(await page.locator("#pmMap [data-device]").count(), 1);
  assert.equal(await page.locator("#pmMap [data-group]").count(), 1);
  assert.equal(await page.locator("#pmMap [data-link]").count(), 0);
  assert.match(await page.locator("#pmTopologyEvidence").innerText(), /Local learning topology.*No CDP\/LLDP/);
  assert.equal(await page.evaluate(() => JSON.stringify(PortMapping.sources()).includes("NEVER-RETAIN-CONFIG")), false);
  await page.locator("#pmMap [data-group]").click();
  assert.match(await page.locator("#pmInspector").innerText(), /CLIENT-NETWORK/);
  if (process.env.SHOW_TECH_SAMPLE) {
    page.once("dialog", (d) => d.accept());
    await page.locator("#pmClear").click();
    await page.locator("#pmFiles").setInputFiles(process.env.SHOW_TECH_SAMPLE);
    await page.waitForFunction(() => window.PortMapping.model().endpoints.length > 1000);
    const observed = await page.evaluate(() => ({
      sources: PortMapping.sources().length,
      devices: PortMapping.model().devices.length,
      links: PortMapping.model().links.length,
      endpoints: PortMapping.model().endpoints.length,
      ports: PortMapping.model().groups.length,
      branches: document.querySelectorAll("#pmMap [data-group]").length,
    }));
    assert.deepEqual(observed, { sources: 11, devices: 3, links: 2, endpoints: 1367, ports: 379, branches: 0 });
    assert.equal(await page.locator("#pmMap [data-device]").count(), 3);
    assert.equal(await page.evaluate(() => PortMapping.model().links.every((l) => l.eventDerived)), true);
    const realFacts = await page.evaluate(() => {
      const d = PortMapping.model().devices.find((d) => d.seed);
      return { vlans: Object.keys(d.vlans).length, stp: Object.keys(d.spanningTree).length, aggregation: Object.values(d.interfaces).filter((p) => p.portChannel).length };
    });
    assert.deepEqual(realFacts, { vlans: 50, stp: 46, aggregation: 57 });
    await page.locator("#pmMap [data-link]").first().click();
    assert.match(await page.locator("#pmInspector").innerText(), /Source: CDP diagnostic event/);
    await page.locator("#pmView").selectOption("ports");
    assert.equal(await page.locator("#pmMap [data-group]").count(), 24);
    await page.reload();
    await page.waitForFunction(() => window.PortMapping.model().endpoints.length === 1367);
    assert.equal(await page.locator("#pmMap [data-device]").count(), 3);
    console.log("Actual diagnostic import and saved-workspace reload:", observed);
  }
  page.once("dialog", (d) => d.accept());
  await page.locator("#pmClear").click();
  await page.locator("#pmExample").click();
  if (process.env.PORT_MAPPING_SAMPLE) {
    page.once("dialog", (d) => d.accept());
    await page.locator("#pmClear").click();
    await page
      .locator("#pmFiles")
      .setInputFiles(process.env.PORT_MAPPING_SAMPLE);
    await page.waitForFunction(
      () => window.PortMapping.groups().length === 123,
    );
    const stats = await page.evaluate(() => ({
      dynamic: window.PortMapping.sources()[0].rows.filter(
        (r) => r.type === "dynamic",
      ).length,
      unmatched: window.PortMapping.sources()[0].skipped,
      top: window.PortMapping.groups()[0].macCount,
    }));
    assert.deepEqual(stats, { dynamic: 1371, unmatched: 0, top: 147 });
    await page.locator("#pmSearch").fill("Gi1/20");
    await page.locator("#pmMap [data-group]").first().click();
    assert.match(await page.locator("#pmInspector").innerText(), /145/);
    await page.screenshot({
      path: "/tmp/port-mapping-sample.png",
      fullPage: true,
    });
  }
  page.once("dialog", (d) => d.accept());
  await page.locator("#pmClear").click();
  await page.locator("#pmTopologyExample").click();
  await page.waitForFunction(
    () => window.PortMapping.model().links.length === 3,
  );
  assert.equal(
    await page
      .locator("#pmTopologyExample")
      .textContent()
      .then((t) => t.trim()),
    "Use example files",
  );
  assert.equal(
    await page.evaluate(() => window.PortMapping.sources().length),
    13,
    "Button parses embedded TXT files through the normal import pipeline",
  );
  await page.locator("#pmTopologyExample").click();
  await page.waitForFunction(
    () => !document.getElementById("pmTopologyExample").disabled,
  );
  assert.equal(
    await page.evaluate(() => window.PortMapping.sources().length),
    13,
    "Repeated example loads do not duplicate sources",
  );
  assert.equal(await page.locator("#pmMap [data-device]").count(), 4);
  assert.equal(await page.locator("#pmClientRows tr").count(), 4);
  assert.equal(
    await page.evaluate(() =>
      window.PortMapping.model().endpoints.every(
        (e) => e.observations.length === 2,
      ),
    ),
    true,
  );
  await page.locator("#pmSearch").fill("192.0.2.101");
  assert.equal(await page.locator("#pmClientRows tr").count(), 1);
  await page.locator("#pmView").selectOption("ports");
  await page.locator("#pmClientRows button").click();
  assert.equal(await page.locator("#pmView").inputValue(), "topology", "Endpoint selection reveals its topology trace from ports view");
  assert.equal(await page.locator("#pmMapDetails").evaluate(e => e.open), true);
  assert.ok(await page.locator('#pmMap path[stroke="#db8b18"]').count() > 0, "Selected endpoint trace is highlighted");
  assert.match(
    await page.locator("#pmInspector").innerText(),
    /Edge candidate/,
  );
  await page
    .getByRole("textbox", { name: "Client hostname", exact: true })
    .fill("DESKTOP-VERIFIED");
  await page
    .getByRole("combobox", { name: "Client device type", exact: true })
    .selectOption("PC / workstation");
  await page
    .getByRole("button", { name: "Save annotation", exact: true })
    .click();
  assert.match(
    await page.locator("#pmInspector").innerText(),
    /Engineer annotation/,
  );
  await page.locator("#pmSearch").fill("");
  await page.screenshot({
    path: "/tmp/port-topology-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await page.waitForFunction(
    () => window.PortMapping.model().links.length === 3,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.PortMapping.model().endpoints.find(
          (e) => e.mac === "005056841234",
        ).hostname,
    ),
    "DESKTOP-VERIFIED",
  );
  assert.equal(
    await page.locator("#pmRows tr").count(),
    8,
    "Clearing the search restores all learning observations",
  );
  const fullDownload = page.waitForEvent("download");
  await page.locator("#pmSave").click();
  await (await fullDownload).saveAs("/tmp/port-topology-v2.json");
  page.once("dialog", (d) => d.accept());
  await page.locator("#pmClear").click();
  await page.locator("#pmFiles").setInputFiles("/tmp/port-topology-v2.json");
  await page.waitForFunction(
    () => window.PortMapping.model().links.length === 3,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.PortMapping.model().endpoints.find(
          (e) => e.mac === "005056841234",
        ).hostname,
    ),
    "DESKTOP-VERIFIED",
  );
  page.once("dialog", (d) => d.accept());
  await page.locator("#pmClear").click();
  const { capture } = createRequire(import.meta.url)(
    "./test_port_mapping_support.cjs",
  );
  const { gzipSync } = createRequire(import.meta.url)("node:zlib");
  await page.locator("#pmFiles").setInputFiles({
    name: "CORE-show-tech.log.gz",
    mimeType: "application/gzip",
    buffer: gzipSync(Buffer.from(capture)),
  });
  await page.waitForFunction(
    () => window.PortMapping.model().links.length === 1,
  );
  assert.equal(
    await page.evaluate(() =>
      window.PortMapping.model().devices.some((d) => d.hostname === "CORE"),
    ),
    true,
  );
  assert.equal(
    await page.evaluate(() => window.PortMapping.sources().length),
    7,
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(window.PortMapping.sources()).includes("MUST-NOT-BE"),
    ),
    false,
  );
  assert.match(
    await page.locator("#pmSupportCoverage").textContent(),
    /7 sections/,
  );
  const sampleDownload = page.waitForEvent("download");
  await page
    .getByRole("link", {
      name: "Download synthetic tech-support examples (ZIP)",
    })
    .click();
  assert.equal(
    (await sampleDownload).suggestedFilename(),
    "port-mapping-synthetic-samples.zip",
  );
  page.once("dialog", (d) => d.accept());
  await page.locator("#pmClear").click();
  await page
    .locator("#pmFiles")
    .setInputFiles([
      "samples/port-mapping/CORE-01-show-tech-support.txt",
      "samples/port-mapping/ACCESS-01-show-tech-support.txt",
    ]);
  await page.waitForFunction(
    () =>
      window.PortMapping.model().devices.length === 4 &&
      window.PortMapping.model().endpoints.length === 4 &&
      window.PortMapping.model().endpoints.every(
        (e) => e.observations.length === 2,
      ),
  );
  assert.equal(await page.locator("#pmClientRows tr").count(), 4);
  await page.locator("#pmTopologyExample").click();
  await page.waitForFunction(
    () => !document.getElementById("pmTopologyExample").disabled,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.PortMapping.sources().filter((s) => s.site === "Default").length,
    ),
    13,
    "User-uploaded TXT captures stay intact when the embedded example is loaded",
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.PortMapping.sources().filter(
          (s) => s.sampleId === "embedded-tech-support-v1",
        ).length,
    ),
    13,
  );
  await page.screenshot({
    path: "/tmp/port-support-topology.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator("#pmFiles").isVisible());
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Mobile layout stays within the viewport; topology scrolls inside its frame",
  );
  await page.screenshot({
    path: "/tmp/port-topology-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Port mapping browser: preserved MAC import, multi-vendor topology, consolidated clients, IP search, annotations, draft reload, workspace v2 download/restore and mobile passed.",
  );
} finally {
  await browser.close();
}
