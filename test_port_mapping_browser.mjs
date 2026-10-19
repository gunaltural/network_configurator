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
  await page.locator("#pmClientRows button").click();
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
    6,
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(window.PortMapping.sources()).includes("MUST-NOT-BE"),
    ),
    false,
  );
  assert.match(
    await page.locator("#pmSupportCoverage").textContent(),
    /6 sections/,
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
