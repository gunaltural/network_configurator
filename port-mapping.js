(() => {
  "use strict";
  const C = window.PortMappingCore,
    $ = (id) => document.getElementById(id),
    ns = "http://www.w3.org/2000/svg",
    DRAFT = "networkConfigurator.portMapping.v2",
    PAGE = 24,
    ROWS = 100;
  const commands = {
    "Cisco IOS-XE": [
      "show interfaces status",
      "show interfaces description",
      "show interfaces switchport",
      "show etherchannel summary",
      "show interfaces",
      "show interfaces trunk",
      "show running-config",
    ],
    "Cisco NX-OS": [
      "show interface status",
      "show interface description",
      "show interface switchport",
      "show port-channel summary",
      "show interface",
      "show interface trunk",
      "show running-config",
    ],
    "Arista EOS": [
      "show interfaces status",
      "show interfaces description",
      "show interfaces switchport",
      "show port-channel summary",
      "show interfaces",
      "show interfaces trunk",
      "show running-config",
    ],
    Huawei_CE_SW: [
      "display interface brief",
      "display interface",
      "display port vlan",
      "display eth-trunk",
    ],
    "Huawei iStack": [
      "display interface brief",
      "display interface",
      "display port vlan",
      "display eth-trunk",
    ],
  };
  let sources = [],
    db = {},
    baseDb = {},
    customDb = {},
    registry = {},
    annotations = {},
    importReports = [],
    evidence = null,
    model = C.correlate([], null),
    groups = [],
    selected = "",
    selectionType = "port",
    page = 0,
    rowPage = 0,
    clientPage = 0,
    working = false,
    revision = 0;
  const node = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  function status(text, error = false) {
    $("pmStatus").textContent = text;
    $("pmStatus").classList.toggle("error", error);
  }
  function hint() {
    const platform = $("pmPlatform").value,
      kind = $("pmKind").value;
    $("pmCommandLabel").hidden = kind !== "interfaces";
    const prior = $("pmCommand").value;
    $("pmCommand").replaceChildren(
      ...commands[platform].map((c) => new Option(c, c)),
    );
    if (commands[platform].includes(prior)) $("pmCommand").value = prior;
    $("pmCommandHint").textContent = platform.startsWith("Huawei")
      ? "Recommended: display lldp neighbor · display mac-address · display port vlan · display eth-trunk · display arp / display ipv6 neighbors"
      : "Recommended: show lldp neighbors detail" +
        (platform.startsWith("Cisco") ? " / show cdp neighbors detail" : "") +
        " · show mac address-table · " +
        commands[platform][2] +
        " · " +
        commands[platform][3] +
        " · show ip arp / show ipv6 neighbors";
  }
  function detect(raw) {
    if (/^\s*VLAN\s+Name\s+Status\s+Ports/im.test(raw)) return "vlans";
    if (/^\s*(?:VLAN\d+|MST\d+)\s*$/im.test(raw) && /Spanning tree enabled/i.test(raw)) return "stp";
    if (/%CDP-\d+-(?:DUPLEX|NATIVE_VLAN)_MISMATCH:/i.test(raw)) return "cdp-log";
    if (/^\s*Protocol\s+Address\s+Age.*Hardware/im.test(raw)) return "arp";
    if (/Device ID\s+Local Intrfce/i.test(raw)) return "cdp";
    if (/Device ID\s*:|Port ID\s*\(outgoing port\)/i.test(raw)) return "cdp";
    if (
      /Chassis\s*(?:id|ID)|LLDP neighbou?r|Local (?:Intf|Port id):/i.test(raw)
    )
      return "lldp";
    return "mac";
  }
  function normalizeSource(item) {
    if (
      !item ||
      typeof item.raw !== "string" ||
      typeof item.device !== "string" ||
      item.raw.length > 3000000 ||
      !item.device.trim()
    )
      throw Error(
        "Capture must contain a device name and at most 3 MB of text.",
      );
    const s = {
      id: crypto.randomUUID(),
      device: item.device.trim().slice(0, 120),
      filename: String(item.filename || "Imported capture").slice(0, 200),
      importedAt: item.importedAt || new Date().toISOString(),
      site:
        String(item.site || "Default")
          .trim()
          .slice(0, 100) || "Default",
      target: String(item.target || "")
        .trim()
        .slice(0, 253),
      platform: item.platform || "Cisco IOS-XE",
      kind: item.kind && item.kind !== "auto" ? item.kind : detect(item.raw),
      command: String(item.command || "").slice(0, 100),
      vrf: String(item.vrf || "")
        .trim()
        .slice(0, 100),
      raw: C.textFromRtf(item.raw),
    };
    if (s.kind === "interfaces" && s.command === "show running-config") s.raw = C.interfaceConfig(s.raw);
    s.originalCommand = String(item.originalCommand || "").slice(0, 300);
    s.sampleId =
      item.sampleId === "embedded-tech-support-v1" ? item.sampleId : "";
    if (
      !commands[s.platform] ||
      !["mac", "lldp", "cdp", "interfaces", "arp", "nd", "vlans", "stp", "cdp-log", "identity"].includes(s.kind) ||
      !Number.isFinite(Date.parse(s.importedAt))
    )
      throw Error("Invalid capture platform, type or time.");
    if (s.kind === "interfaces" && !commands[s.platform].includes(s.command))
      throw Error("Select the port command used for this capture.");
    if (s.kind === "cdp" && !s.platform.startsWith("Cisco"))
      throw Error("Use LLDP for this platform.");
    if (s.kind === "mac") {
      Object.assign(s, C.parse(s.raw));
      if (s.rows.length > 50000)
        throw Error("Limit each MAC source to 50,000 parsed records.");
    } else s.rows = [];
    return s;
  }
  function currentSource(raw, device, filename) {
    const captured = $("pmCapturedAt").value;
    return normalizeSource({
      raw,
      device,
      filename,
      platform: $("pmPlatform").value,
      site: $("pmSite").value,
      target: $("pmTarget").value,
      kind: $("pmKind").value,
      command: $("pmKind").value === "interfaces" ? $("pmCommand").value : "",
      vrf: $("pmVrf").value,
      importedAt: captured
        ? new Date(captured).toISOString()
        : new Date().toISOString(),
    });
  }
  function bundle() {
    return {
      schema: "mac-port-mapping-v2",
      registry,
      organizationPrefixes: customDb,
      annotations,
      importReports,
      sources: sources.map(
        ({
          device,
          filename,
          importedAt,
          raw,
          site,
          target,
          platform,
          kind,
          command,
          originalCommand,
          sampleId,
          vrf,
        }) => ({
          device,
          filename,
          importedAt,
          raw,
          site,
          target,
          platform,
          kind,
          command,
          originalCommand,
          sampleId,
          vrf,
        }),
      ),
    };
  }
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT, JSON.stringify(bundle()));
      return true;
    } catch {
      return false;
    }
  }
  async function analyze(next = sources, { persist = true } = {}) {
    if (working)
      throw Error("Wait for the current evidence analysis to complete.");
    if (
      next.length > 100 ||
      next.reduce((n, s) => n + s.raw.length, 0) > 10000000
    )
      throw Error("Workspace limit: 100 sources / 10 MB of text.");
    working = true;
    revision++;
    const generation = revision;
    for (const id of ["pmAnalyze", "pmFiles", "pmTopologyExample", "pmExample"])
      $(id).disabled = true;
    try {
      let result = null;
      if (next.some((s) => s.kind !== "mac")) {
        const response = await fetch("/api/port-mapping/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sources: next.map(
              ({
                id,
                device,
                site,
                target,
                platform,
                kind,
                command,
                originalCommand,
                vrf,
                importedAt,
                raw,
              }) => ({
                id,
                device,
                site,
                target,
                platform,
                kind,
                command,
                originalCommand,
                vrf,
                importedAt,
                raw,
              }),
            ),
          }),
        });
        let data;
        try {
          data = await response.json();
        } catch {
          throw Error("Unable to read topology analysis response.");
        }
        if (!response.ok)
          throw Error(
            typeof data.detail === "string"
              ? data.detail
              : "Evidence was rejected. Check capture size and fields.",
          );
        result = data;
      }
      if (generation !== revision) return;
      sources = next;
      evidence = result;
      model = C.correlate(sources, evidence, db, annotations);
      selected = "";
      page = rowPage = clientPage = 0;
      render();
      const saved = !persist || saveDraft();
      status(
        sources.length +
          " captures · " +
          model.devices.length +
          " devices · " +
          model.links.length +
          " neighbor links · " +
          model.endpoints.length +
          " consolidated MAC/VLAN identities." +
          (!saved
            ? " Browser draft storage is full; use Save workspace JSON to retain this work."
            : ""),
      );
    } finally {
      working = false;
      for (const id of [
        "pmAnalyze",
        "pmFiles",
        "pmTopologyExample",
        "pmExample",
      ])
        $(id).disabled = false;
      $("pmSources")
        .querySelectorAll("button")
        .forEach((b) => (b.disabled = false));
    }
  }
  async function add(raw, device, filename = "Pasted output") {
    raw = C.textFromRtf(raw);
    if (
      $("pmKind").value === "support" ||
      /(?:sh(?:o(?:w)?)? tech[ -]?support|display diagnostic-information)|[-=*]{3,}\s*(?:sh(?:o(?:w)?)?|display)\s/i.test(
        raw,
      )
    ) {
      const extracted = C.extractSupport(raw, {
          device,
          filename,
          platform: $("pmPlatform").value,
          site: $("pmSite").value,
          target: $("pmTarget").value,
          vrf: $("pmVrf").value,
          importedAt: $("pmCapturedAt").value
            ? new Date($("pmCapturedAt").value).toISOString()
            : new Date().toISOString(),
        }),
        incoming = [],
        warnings = [...extracted.warnings];
      for (const s of extracted.sections) {
        try {
          incoming.push(normalizeSource(s));
        } catch (e) {
          warnings.push(s.command + ": " + e.message);
        }
      }
      if (!incoming.length)
        throw Error("No usable topology sections found. " + warnings.join(" "));
      const importedKinds = new Set(incoming.map((s) => s.kind));
      const missing = ["lldp / cdp", "mac", "interfaces", "arp / nd"].filter(
        (category) =>
          !category.split(" / ").some((kind) => importedKinds.has(kind)),
      );
      const report = {
        filename,
        device: extracted.device,
        platform: extracted.platform,
        commands: extracted.commandCount,
        imported: incoming.length,
        skipped: extracted.skipped,
        missing,
        warnings,
      };
      const old = importReports;
      importReports = [...importReports, report].slice(-30);
      try {
        await analyze([...sources, ...incoming]);
      } catch (e) {
        importReports = old;
        throw e;
      }
      status(
        filename +
          ": " +
          incoming.length +
          " topology sections imported from " +
          extracted.commandCount +
          " commands. Missing: " +
          (missing.join(", ") || "none") +
          (warnings.length
            ? " · " + warnings.length + " notes; open import coverage."
            : ""),
      );
      return;
    }
    return analyze([...sources, currentSource(raw, device, filename)]);
  }
  function endpointMatches(e) {
    const q = $("pmSearch").value.trim().toLowerCase(),
      v = $("pmVlan").value;
    if (v && String(e.vlan) !== v) return false;
    const macQuery = C.normalize(q);
    return (
      !q ||
      [
        e.hostname,
        e.mac,
        C.display(e.mac),
        e.vendor,
        e.type,
        e.site,
        ...(e.vlanNames || []),
        ...e.addresses.flatMap((a) => [a.ip, a.vrf]),
        ...e.observations.flatMap((o) => [o.device, o.port]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q) ||
      (/^[0-9a-f:.\-\s]+$/i.test(q) &&
        macQuery.length >= 4 &&
        e.mac.includes(macQuery))
    );
  }
  function visibleEndpoints() {
    return model.endpoints.filter(endpointMatches);
  }
  function filteredGroups() {
    const ids = new Set(visibleEndpoints().map((e) => e.id)),
      q = $("pmSearch").value.trim().toLowerCase(),
      v = $("pmVlan").value;
    return model.groups
      .map((g) => ({
        ...g,
        rows: g.rows.filter((r) =>
          ids.has([g.site, r.vlan ?? "unknown", r.mac].join("|")),
        ),
      }))
      .filter(
        (g) =>
          (!q && !v) ||
          g.rows.length ||
          (v && !q && (g.detail.vlanMembership || []).some((x) => String(x.id) === v)) ||
          (!v &&
            [
              g.device,
              g.port,
              g.detail.description,
              ...(g.detail.vlanMembership || []).map((v) => v.name),
              ...g.neighbors.map(
                (n) => model.devices.find((d) => d.id === n.deviceId)?.hostname,
              ),
            ]
              .join(" ")
              .toLowerCase()
              .includes(q)),
      );
  }
  function render() {
    $("pmResults").hidden = !sources.length;
    $("pmSources").replaceChildren();
    const active = new Set(
      evidence?.activeSourceIds || sources.map((s) => s.id),
    );
    for (const s of sources) {
      const div = node("div"),
        edit = node("input"),
        label = node(
          "span",
          " · " +
            s.kind.toUpperCase() +
            " · " +
            s.filename +
            " · " +
            new Date(s.importedAt).toLocaleString() +
            (active.has(s.id) ? "" : " · superseded / unresolved"),
          "pm-source-meta",
        ),
        remove = node("button", "Remove");
      edit.value = s.device;
      edit.maxLength = 120;
      edit.setAttribute("aria-label", "Device label for " + s.filename);
      edit.onchange = () =>
        analyze(
          sources.map((x) =>
            x.id === s.id ? { ...x, device: edit.value.trim() || s.device } : x,
          ),
        ).catch((e) => {
          status(e.message, true);
          edit.value = s.device;
        });
      remove.disabled = working;
      remove.onclick = () =>
        analyze(sources.filter((x) => x.id !== s.id)).catch((e) =>
          status(e.message, true),
        );
      div.append(edit, label, remove);
      $("pmSources").append(div);
    }
    const prior = $("pmVlan").value,
      vlans = [
        ...new Set(
          [...model.endpoints.map((e) => e.vlan), ...model.devices.flatMap((d) => Object.keys(d.vlans || {}).map(Number))].filter((v) => v !== null),
        ),
      ].sort((a, b) => a - b);
    $("pmVlan").replaceChildren(
      new Option("All observed VLANs", ""),
      ...vlans.map((v) => {
        const names = [...new Set(model.devices.map((d) => d.vlans?.[v]?.name).filter(Boolean))];
        return new Option("VLAN " + v + (names.length ? " · " + names.join(" / ") : ""), String(v));
      }),
    );
    $("pmVlan").value = vlans.includes(Number(prior)) ? prior : "";
    const focus = $("pmFocus").value;
    $("pmFocus").replaceChildren(
      new Option("All devices", ""),
      ...model.devices.map(
        (d) => new Option(d.hostname + " · " + d.site, d.id),
      ),
    );
    $("pmFocus").value = model.devices.some((d) => d.id === focus) ? focus : "";
    groups = filteredGroups();
    page = Math.min(page, Math.max(0, Math.ceil(groups.length / PAGE) - 1));
    $("pmCounts").replaceChildren();
    for (const [value, label] of [
      [model.devices.length, "Observed devices"],
      [model.links.length, "Neighbor links"],
      [model.endpoints.length, "MAC / VLAN identities"],
      [model.groups.length, "Observed ports"],
    ]) {
      const el = node("div", undefined, "pm-metric");
      el.append(node("strong", String(value)), node("span", label));
      $("pmCounts").append(el);
    }
    $("pmHealth").replaceChildren();
    for (const t of [
      model.links.filter((l) => l.state === "Both ends observed").length +
        " links confirmed at both ends",
      model.endpoints.filter((e) => e.locations.length > 1).length +
        " clients with multiple edge candidates",
      model.issues.length + " review notes",
    ])
      $("pmHealth").append(node("span", t));
    $("pmSupportCoverage").replaceChildren();
    for (const report of importReports) {
      const d = node("details");
      d.append(
        node(
          "summary",
          report.filename +
            " · " +
            report.device +
            " · " +
            report.imported +
            " sections / " +
            report.commands +
            " commands",
        ),
        node(
          "p",
          "Missing evidence: " +
            (report.missing?.join(", ") || "none") +
            " · " +
            report.skipped +
            " unrelated sections omitted.",
        ),
      );
      for (const note of report.warnings || [])
        d.append(node("p", note, "pm-warning"));
      $("pmSupportCoverage").append(d);
    }
    draw();
    inspect();
    table();
    clientTable();
    excluded();
  }
  function svg(tag, attrs, text, parent = $("pmMap")) {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    parent.append(el);
    return el;
  }
  function clickable(el, fn) {
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.onclick = fn;
    el.onkeydown = (e) => {
      if (["Enter", " "].includes(e.key)) {
        e.preventDefault();
        fn();
      }
    };
  }
  function select(id, type = "port") {
    selected = id;
    selectionType = type;
    rowPage = clientPage = 0;
    draw();
    inspect();
    table();
    clientTable();
  }
  function portBox(g, x, y, parent = $("pmMap")) {
    const active = selected === g.id,
      box = svg(
        "g",
        {
          "data-group": g.id,
          "aria-label":
            g.device + " " + g.port + " " + g.macCount + " learned MACs",
        },
        undefined,
        parent,
      );
    svg(
      "rect",
      {
        x,
        y,
        width: 190,
        height: 76,
        rx: 8,
        fill: active ? "#d9f0f4" : "#fff",
        stroke: active ? "#167b90" : "#acc6d7",
        "stroke-width": active ? 2 : 1,
      },
      undefined,
      box,
    );
    svg(
      "text",
      {
        x: x + 12,
        y: y + 20,
        "font-size": 12,
        "font-weight": "bold",
        fill: "#224a63",
      },
      g.displayTitle || g.port,
      box,
    );
    svg(
      "text",
      { x: x + 12, y: y + 40, "font-size": 11, fill: "#47687e" },
      g.macCount + " MACs · VLAN " + (g.vlans.join(",") || "—").slice(0, 23),
      box,
    );
    svg(
      "text",
      { x: x + 12, y: y + 60, "font-size": 10, fill: "#70603b" },
      g.mode +
        " · " +
        (g.remote
          ? "overlay"
          : g.infrastructure
            ? "transit"
            : "edge candidate"),
      box,
    );
    clickable(box, () => select(selected === g.id ? "" : g.id));
    return box;
  }
  function drawPorts(localTopology = false) {
    const focus = $("pmFocus").value,
      available = groups.filter((g) => (!focus || g.deviceId === focus) && (!localTopology || g.macCount)),
      map = $("pmMap");
    page = Math.min(page, Math.max(0, Math.ceil(available.length / PAGE) - 1));
    const subset = localTopology && $("pmClients").value === "no" ? [] : available.slice(page * PAGE, (page + 1) * PAGE),
      ids = subset.length ? [...new Set(subset.map((g) => g.deviceId))] : model.devices.filter((d) => !focus || d.id === focus).map((d) => d.id),
      height = 180 + Math.max(1, Math.ceil(subset.length / 4)) * 110;
    map.setAttribute("viewBox", "0 0 1000 " + height);
    const centers = new Map(
      ids.map((id, i) => [id, (1000 * (i + 1)) / (ids.length + 1)]),
    );
    if (ids.length <= 5)
      for (const id of ids) {
        const x = centers.get(id);
        const device = model.devices.find((d) => d.id === id),
          box = svg("g", { "data-device": id, "aria-label": device.hostname });
        svg("rect", {
          x: x - 75,
          y: 15,
          width: 150,
          height: 55,
          rx: 8,
          fill: "#dceaf4",
          stroke: "#2b607d",
        }, undefined, box);
        svg(
          "text",
          {
            x,
            y: 46,
            "text-anchor": "middle",
            "font-size": 12,
            fill: "#214860",
          },
          device.hostname.slice(0, 22),
          box,
        );
        clickable(box, () => select(id, "device"));
      }
    for (const [i, g] of subset.entries()) {
      const x = 25 + (i % 4) * 245,
        y = 120 + Math.floor(i / 4) * 110;
      if (ids.length <= 5)
        svg("path", {
          d: localTopology
            ? `M ${centers.get(g.deviceId)} 70 V 95 H ${x + 45} V ${y + 15} H ${x + 80}`
            : `M ${centers.get(g.deviceId)} 70 V 95 H ${x + 95} V ${y}`,
          stroke: "#8aa5b8",
          "stroke-dasharray": "3 5",
          fill: "none",
        });
      if (localTopology) {
        const group = svg("g", { "data-group": g.id, "aria-label": g.port + " · " + g.macCount + " learned MACs" });
        svg("rect", { x: x + 8, y: y - 2, width: 174, height: 75, fill: "transparent", "pointer-events": "all" }, undefined, group);
        svg("circle", { cx: x + 95, cy: y + 15, r: 15, fill: selected === g.id ? "#cceaf1" : "#dceaf4", stroke: "#467794" }, undefined, group);
        svg("text", { x: x + 95, y: y + 19, "text-anchor": "middle", "font-size": 11, fill: "#214860" }, String(g.macCount), group);
        svg("text", { x: x + 95, y: y + 48, "text-anchor": "middle", "font-size": 12, fill: "#214860" }, g.port, group);
        svg("text", { x: x + 95, y: y + 66, "text-anchor": "middle", "font-size": 10, fill: "#526f83" }, g.mode + " · VLAN " + (g.vlans.join(",") || "—").slice(0, 23), group);
        svg("title", {}, g.macCount + " learned MACs; select for clients and original evidence. Remote device identity is not established by MAC learning.", group);
        clickable(group, () => select(g.id));
      } else portBox(g, x, y);
    }
    $("pmPrev").hidden = $("pmNext").hidden = false;
    $("pmPage").textContent =
      page +
      1 +
      " / " +
      Math.max(1, Math.ceil(available.length / PAGE)) +
      " · " +
      available.length +
      " matching ports";
    $("pmPrev").disabled = !page;
    $("pmNext").disabled = (page + 1) * PAGE >= available.length;
  }
  function draw() {
    const map = $("pmMap");
    map.replaceChildren();
    $("pmTopologyEvidence").textContent = !model.links.length && sources.length
      ? "Local learning topology: " + model.devices.length + " device(s), " + model.groups.filter((g) => g.macCount).length + " ports with learned MACs. No CDP/LLDP neighbor links were found. Dotted branches show local port learning, not verified remote devices. Import neighbor output to connect switches."
      : model.links.some((l) => l.eventDerived)
        ? "Topology combines neighbor tables and CDP diagnostic events. Select links for source evidence; select devices for VLAN, STP, ports and clients."
        : "Neighbor topology from imported CDP/LLDP evidence. Select a device to inspect its ports and clients.";
    if ($("pmView").value === "ports" || !model.links.length) {
      drawPorts($("pmView").value !== "ports");
      return;
    }
    $("pmPrev").hidden = $("pmNext").hidden = true;
    const focus = $("pmFocus").value,
      depth = Number($("pmDepth").value),
      included = new Set(focus ? [focus] : model.devices.map((d) => d.id));
    let frontier = focus ? [focus] : [];
    for (let step = 0; step < depth; step++) {
      const next = [];
      for (const l of model.links) {
        if (frontier.includes(l.a) && !included.has(l.b)) {
          included.add(l.b);
          next.push(l.b);
        }
        if (frontier.includes(l.b) && !included.has(l.a)) {
          included.add(l.a);
          next.push(l.a);
        }
      }
      frontier = next;
    }
    const endpoints = visibleEndpoints(),
      relevant = new Set(
        endpoints.flatMap((e) => e.observations.map((o) => o.deviceId)),
      ),
      q = $("pmSearch").value.trim().toLowerCase();
    let devices = model.devices.filter((d) => included.has(d.id));
    const vlanFilter = $("pmVlan").value;
    if (vlanFilter) for (const d of model.devices) if (d.vlans?.[vlanFilter]) relevant.add(d.id);
    if (q || $("pmVlan").value)
      devices = devices.filter(
        (d) =>
          relevant.has(d.id) ||
          ([d.hostname, d.vendor, d.site].join(" ").toLowerCase().includes(q) &&
            !$("pmVlan").value),
      );
    const limit = 60;
    devices = devices.slice(0, limit);
    const visible = new Set(devices.map((d) => d.id)),
      positions = new Map(),
      connectedLinks = model.links.filter(
        (l) => visible.has(l.a) && visible.has(l.b),
      );
    const remaining = new Set(devices.map((d) => d.id));
    let row = 0;
    while (remaining.size) {
      const root =
        focus && remaining.has(focus)
          ? focus
          : [...remaining].sort(
              (a, b) =>
                model.links.filter((l) => l.a === b || l.b === b).length -
                model.links.filter((l) => l.a === a || l.b === a).length,
            )[0];
      let layer = [root];
      remaining.delete(root);
      while (layer.length) {
        for (let chunk = 0; chunk < layer.length; chunk += 4) {
          const part = layer.slice(chunk, chunk + 4);
          part.forEach((id, i) =>
            positions.set(id, {
              x: (1000 * (i + 1)) / (part.length + 1),
              y: 85 + row * 250,
            }),
          );
          row++;
        }
        const next = [];
        for (const id of layer)
          for (const l of connectedLinks) {
            const peer = l.a === id ? l.b : l.b === id ? l.a : null;
            if (peer && remaining.has(peer)) {
              remaining.delete(peer);
              next.push(peer);
            }
          }
        layer = next;
      }
    }
    const height = Math.max(360, row * 250 + 90);
    map.setAttribute("viewBox", "0 0 1000 " + height);
    const selectedEndpoint =
        selectionType === "client"
          ? model.endpoints.find((e) => e.id === selected)
          : null,
      highlighted = new Set(
        (selectedEndpoint
          ? [selectedEndpoint]
          : q
            ? endpoints.slice(0, 30)
            : []
        ).flatMap((e) => C.trace(model, e)),
      );
    const endpointById = new Map(model.endpoints.map((e) => [e.id, e]));
    const displayGroups = groups
      .filter((g) => g.macCount)
      .map((g) => {
        const peers = [...new Set(g.neighbors.filter((n) => !n.eventDerived).map((n) => n.deviceId))],
          peer =
            peers.length === 1
              ? model.devices.find((d) => d.id === peers[0])
              : null;
        if (g.infrastructure) {
          const unresolved = g.endpointIds
            .map((id) => endpointById.get(id))
            .filter((e) => e && e.locations.length === 0);
          if (!peer || !unresolved.length) return null;
          return {
            ...g,
            anchorId: peer.id,
            macCount: new Set(unresolved.map((e) => e.mac)).size,
            displayTitle: "via " + g.device + " " + g.port,
          };
        }
        if (peer && ["Phone", "Access point"].includes(peer.role)) {
          const downstream = g.endpointIds
            .map((id) => endpointById.get(id))
            .filter((e) => e && e.neighborId !== peer.id);
          if (!downstream.length) return null;
          return {
            ...g,
            anchorId: peer.id,
            macCount: new Set(downstream.map((e) => e.mac)).size,
            displayTitle: "via " + g.port + " · " + g.device,
          };
        }
        return { ...g, anchorId: g.deviceId };
      })
      .filter(Boolean);
    for (const l of connectedLinks) {
      const a = positions.get(l.a),
        b = positions.get(l.b),
        active = selected === l.id || highlighted.has(l.id),
        line = svg("g", {
          "data-link": l.id,
          "aria-label": l.aPort + " to " + l.bPort,
        });
      const same = a.y === b.y,
        path = same
          ? `M ${a.x} ${a.y - 25} Q ${(a.x + b.x) / 2} ${a.y - 110} ${b.x} ${b.y - 25}`
          : `M ${a.x} ${a.y + 30} L ${b.x} ${b.y - 30}`;
      svg(
        "path",
        { d: path, stroke: "transparent", "stroke-width": 18, fill: "none" },
        undefined,
        line,
      );
      svg(
        "path",
        {
          d: path,
          stroke: active ? "#db8b18" : l.issues.length ? "#b84957" : "#5790ab",
          "stroke-width": active ? 4 : 2,
          "stroke-dasharray": l.state === "Both ends observed" ? "" : "7 5",
          fill: "none",
        },
        undefined,
        line,
      );
      const label =
        l.aPort +
        " ↔ " +
        l.bPort +
        (l.aggregate ? " · " + l.aggregate : "") +
        (l.speed ? " · " + l.speed : "");
      svg("title", {}, label, line);
      svg(
        "text",
        {
          x: (a.x + b.x) / 2,
          y: same ? a.y - 65 : (a.y + b.y) / 2 - 12,
          "text-anchor": "middle",
          "font-size": 10,
          fill: "#3c6178",
          stroke: "#f5f9fc",
          "stroke-width": 4,
          "paint-order": "stroke",
        },
        label.slice(0, 64),
        line,
      );
      clickable(line, () => select(l.id, "link"));
    }
    for (const d of devices) {
      const p = positions.get(d.id),
        box = svg("g", {
          "data-device": d.id,
          "aria-label": d.hostname + " " + d.role,
        });
      svg(
        "rect",
        {
          x: p.x - 90,
          y: p.y - 30,
          width: 180,
          height: 60,
          rx: 10,
          fill: selected === d.id ? "#cceaf1" : d.seed ? "#dceaf4" : "#eaf0e5",
          stroke: "#467794",
          "stroke-width": selected === d.id ? 3 : 1,
        },
        undefined,
        box,
      );
      svg(
        "text",
        {
          x: p.x,
          y: p.y - 4,
          "text-anchor": "middle",
          "font-size": 12,
          "font-weight": "bold",
          fill: "#214860",
        },
        d.hostname.slice(0, 25),
        box,
      );
      svg(
        "text",
        {
          x: p.x,
          y: p.y + 16,
          "text-anchor": "middle",
          "font-size": 10,
          fill: "#526f83",
        },
        (d.vendor || d.role || "Neighbor") + " · " + d.site,
        box,
      );
      svg(
        "title",
        {},
        d.hostname + " · " + (d.description || d.role || ""),
        box,
      );
      clickable(box, () => select(d.id, "device"));
      // Keep topology nodes and links unobstructed. Port/client evidence
      // is available in the existing interactive device inspector.
      if ($("pmClients").value === "yes") {
        const local = displayGroups.filter((g) => g.anchorId === d.id);
        if (local.length) {
          svg("title", {}, local.length + " learned port groups · select device for details", box);
        }
      }
    }
    $("pmPage").textContent =
      devices.length +
      " devices · " +
      connectedLinks.length +
      " links" +
      (model.devices.length > limit
        ? " · first 60 shown; use Focus device"
        : "");
  }
  function field(root, label, value) {
    const cell = node("div");
    cell.append(
      node("strong", label),
      node(
        "p",
        value === undefined || value === null || value === ""
          ? "Not collected"
          : String(value),
      ),
    );
    root.append(cell);
  }
  function action(root, label, fn) {
    const b = node("button", label);
    b.type = "button";
    b.onclick = fn;
    root.append(b);
    return b;
  }
  function portDetails(root, g) {
    const grid = node("div", undefined, "pm-detail-grid"),
      d = g.detail;
    for (const [label, value] of [
      ["Switch / site", g.device + " / " + g.site],
      ["Local port", g.port],
      ["Description", d.description],
      ["Operational status", d.status],
      ["Protocol status", d.protocol],
      [
        "Switchport mode",
        g.mode === "Unknown"
          ? "Unknown — switchport/trunk output required"
          : g.mode,
      ],
      ["Access / PVID", d.vlan],
      ["Native VLAN", d.nativeVlan],
      ["Voice VLAN", d.voiceVlan],
      ["Allowed VLANs", d.allowedVlans],
      ["Observed VLANs", g.vlans.join(", ")],
      ["VLAN names / membership", (d.vlanMembership || []).map((v) => v.id + " " + v.name + " (" + v.status + ")").join(", ")],
      ["Configured mode / access VLAN", [d.configuredMode, d.configuredAccessVlan].filter(Boolean).join(" / ")],
      ["Configured native / allowed VLANs", [d.configuredNativeVlan, d.configuredAllowedVlans].filter(Boolean).join(" / ")],
      ["Configured administration", d.configuredAdminState],
      ["Local interface addresses", (d.addresses || []).join(", ")],
      ["Configured addresses / VRF", [...(d.configuredAddresses || []), d.vrf].filter(Boolean).join(" / ")],
      ["Speed / duplex", [d.speed, d.duplex].filter(Boolean).join(" / ")],
      ["Aggregation", d.portChannel || g.members.map((m) => m.port).join(", ")],
      ["PoE", d.power],
      [
        "Input / CRC / output errors",
        [d.inputErrors, d.crcErrors, d.outputErrors]
          .filter((x) => x !== undefined)
          .join(" / "),
      ],
      ["Learning", g.attachment],
      ["Distinct learned MACs", g.macCount],
    ])
      field(grid, label, value);
    root.append(grid);
    if (d.spanningTree?.length) {
      root.append(node("h3", "Spanning-tree evidence by VLAN / instance"));
      for (const stp of d.spanningTree) root.append(node("p", stp.instance + " · " + stp.role + " / " + stp.state + " · cost " + stp.cost + " · " + stp.type));
    }
    for (const n of g.neighbors) {
      const peer = model.devices.find((d) => d.id === n.deviceId);
      action(
        root,
        "Neighbor: " + peer.hostname + " / " + n.port + " · " + n.state,
        () => select(peer.id, "device"),
      );
    }
    if (g.members.length) {
      root.append(node("h3", "Physical members"));
      for (const m of g.members)
        action(root, m.port + " · " + (m.status || "state not collected"), () =>
          select(g.deviceId + "|" + C.portKey(m.port)),
        );
    }
    for (const note of g.issues) root.append(node("p", note, "pm-warning"));
    const clients = visibleEndpoints().filter((e) =>
      e.observations.some((o) => o.groupId === g.id),
    );
    root.append(
      node(
        "h3",
        (g.infrastructure
          ? "Learned through this connection"
          : "Clients / learned identities") +
          " · " +
          clients.length,
      ),
    );
    for (const e of clients.slice(0, 100)) clientCard(root, e);
    if (clients.length > 100)
      root.append(node("p", "First 100 shown. Use search or VLAN filters."));
    const details = node("details");
    details.append(node("summary", "Original evidence"));
    for (const r of g.rows.slice(0, 30)) {
      const source = sources.find((s) => s.id === r.sourceId);
      details.append(
        node(
          "pre",
          (source?.filename || "Capture") +
            " · " +
            r.observedAt +
            " · line " +
            r.line +
            "\n" +
            r.raw,
          "pm-evidence",
        ),
      );
    }
    for (const e of d.evidence || [])
      details.append(node("p", e.command + " · " + e.observedAt));
    root.append(details);
  }
  function clientCard(root, e) {
    const card = node("div", undefined, "pm-client");
    card.append(
      node("strong", e.hostname || C.display(e.mac)),
      node(
        "p",
        "VLAN " + (e.vlan ?? "unknown") + " · " + e.vendor + " · " + e.type,
      ),
    );
    card.append(
      node(
        "p",
        e.addresses.map((a) => a.ip + " [" + a.vrf + "]").join(", ") ||
          "IP not collected",
      ),
    );
    card.append(node("p", e.placement));
    action(card, "Inspect client & observed path", () =>
      select(e.id, "client"),
    );
    root.append(card);
  }
  function inspect() {
    const root = $("pmInspector");
    root.replaceChildren();
    if (!selected) {
      $("pmInspectorTitle").textContent = "Topology evidence";
      root.append(
        node(
          "p",
          "Select a switch, connection or port. Search highlights matching clients and their observed topology relationships.",
        ),
      );
      return;
    }
    if (selectionType === "device") {
      const d = model.devices.find((x) => x.id === selected);
      if (!d) return;
      $("pmInspectorTitle").textContent = d.hostname;
      const grid = node("div", undefined, "pm-detail-grid");
      for (const [k, v] of [
        ["Site", d.site],
        ["Platform / organization", d.vendor],
        ["Advertised role", d.role],
        ["Management addresses", d.managementAddresses.join(", ")],
        ["Chassis ID", d.chassisId],
        ["Description", d.description],
        ["Identity source", d.identitySource],
        ["Model / serial", [d.model, d.serial].filter(Boolean).join(" / ")],
        ["Software version", d.softwareVersion],
        ["VLAN database", Object.values(d.vlans || {}).map((v) => v.id + " " + v.name + " (" + v.status + ")").join(", ")],
        ["STP root instances", Object.values(d.spanningTree || {}).filter((s) => s.root).map((s) => s.instance).join(", ")],
      ])
        field(grid, k, v);
      root.append(grid);
      action(root, "Focus this device", () => {
        $("pmFocus").value = d.id;
        draw();
      });
      root.append(node("h3", "Ports"));
      for (const g of groups.filter((g) => g.deviceId === d.id))
        action(root, g.port + " · " + g.macCount + " MACs · " + g.mode, () =>
          select(g.id),
        );
      return;
    }
    if (selectionType === "link") {
      const l = model.links.find((x) => x.id === selected);
      if (!l) return;
      $("pmInspectorTitle").textContent = "Connection evidence";
      const a = model.devices.find((d) => d.id === l.a),
        b = model.devices.find((d) => d.id === l.b);
      root.append(
        node(
          "p",
          a.hostname + " " + l.aPort + " ↔ " + b.hostname + " " + l.bPort,
        ),
        node("p", l.state + " · " + l.protocols.join(" + ")),
        node("p", "Status: " + l.status),
      );
      for (const note of l.issues) root.append(node("p", note, "pm-warning"));
      for (const side of ["a", "b"])
        action(
          root,
          "Inspect " +
            model.devices.find((d) => d.id === l[side]).hostname +
            " " +
            l[side + "Port"],
          () => select(l[side] + "|" + C.portKey(l[side + "Port"])),
        );
      for (const o of l.observations)
        root.append(
          node(
            "p",
            model.devices.find((d) => d.id === o.device)?.hostname +
              " · " +
              o.command +
              " · " +
              o.observedAt,
            "pm-source-meta",
          ),
        );
      for (const o of l.observations.filter((o) => o.eventDerived)) {
        root.append(node("p", "Source: CDP diagnostic event · " + (o.eventTime || o.command)));
        root.append(node("pre", o.raw || "", "pm-raw"));
      }
      return;
    }
    if (selectionType === "client") {
      const e = model.endpoints.find((x) => x.id === selected);
      if (!e) return;
      $("pmInspectorTitle").textContent = e.hostname || C.display(e.mac);
      const grid = node("div", undefined, "pm-detail-grid");
      for (const [k, v] of [
        ["MAC", C.display(e.mac)],
        ["Site / VLAN", e.site + " / " + (e.vlan ?? "unknown")],
        ["VLAN name", (e.vlanNames || []).join(" / ")],
        ["Organization", e.vendor],
        ["Type", e.type],
        ["Type evidence", e.typeEvidence],
        ["Attachment assessment", e.placement],
      ])
        field(grid, k, v);
      root.append(grid);
      for (const a of e.addresses)
        root.append(
          node(
            "p",
            a.ip +
              " · VRF " +
              a.vrf +
              " · " +
              a.scope +
              " · " +
              a.device +
              " · " +
              a.observedAt,
          ),
        );
      if (e.neighborId)
        action(root, "Open discovered neighbor", () =>
          select(e.neighborId, "device"),
        );
      root.append(node("h3", "All switch observations"));
      for (const o of e.observations) {
        action(
          root,
          o.device +
            " / " +
            o.port +
            " · " +
            (o.remote
              ? "remote overlay"
              : e.locations.includes(o.groupId)
                ? "edge candidate"
                : "transit / aggregation"),
          () => select(o.groupId),
        );
        root.append(
          node(
            "p",
            o.observedAt + " · MAC capture VRF " + o.vrf,
            "pm-source-meta",
          ),
        );
      }
      const form = node("form", undefined, "pm-annotation");
      form.append(node("h3", "Engineer annotation"));
      const name = node("input"),
        type = node("select"),
        notes = node("textarea");
      name.value = annotations[e.id]?.hostname || e.hostname;
      name.maxLength = 200;
      name.setAttribute("aria-label", "Client hostname");
      name.placeholder = "Client hostname";
      for (const value of [
        "Unknown",
        "PC / workstation",
        "Server / VM",
        "Phone",
        "Access point",
        "Printer",
        "Camera",
        "Switch / bridge",
        "Router",
        "Firewall",
        "Other",
      ])
        type.add(new Option(value, value));
      type.value = annotations[e.id]?.type || e.type;
      if (!type.value) type.value = "Unknown";
      type.setAttribute("aria-label", "Client device type");
      notes.value = annotations[e.id]?.notes || "";
      notes.maxLength = 1000;
      notes.setAttribute("aria-label", "Client notes");
      const save = node("button", "Save annotation");
      save.type = "submit";
      form.append(name, type, notes, save);
      form.onsubmit = (event) => {
        event.preventDefault();
        annotations[e.id] = {
          hostname: name.value,
          type: type.value,
          notes: notes.value,
        };
        model = C.correlate(sources, evidence, db, annotations);
        saveDraft();
        render();
      };
      root.append(form);
      return;
    }
    const g = model.groups.find((x) => x.id === selected);
    if (g) {
      $("pmInspectorTitle").textContent = g.device + " · " + g.port;
      portDetails(root, g);
    }
  }
  function table() {
    let scoped = groups;
    if (selectionType === "port" && selected)
      scoped = groups.filter((g) => g.id === selected);
    else if (selectionType === "device" && selected)
      scoped = groups.filter((g) => g.deviceId === selected);
    else if (selectionType === "client" && selected) {
      const e = model.endpoints.find((e) => e.id === selected);
      scoped = groups.map((g) => ({
        ...g,
        rows: g.rows.filter((r) => r.mac === e?.mac && r.vlan === e?.vlan),
      }));
    }
    const rows = scoped.flatMap((g) => g.rows);
    rowPage = Math.min(rowPage, Math.max(0, Math.ceil(rows.length / ROWS) - 1));
    $("pmTableScope").textContent =
      rows.length +
      " MAC/VLAN learning observations · selected scope and filters apply.";
    $("pmRows").replaceChildren();
    for (const r of rows.slice(rowPage * ROWS, (rowPage + 1) * ROWS)) {
      const tr = node("tr");
      for (const v of [
        r.device + " / " + r.port,
        r.vlan ?? "Not reported",
        C.display(r.mac),
        r.vendor,
        r.kind + " / " + r.type,
      ])
        tr.append(node("td", String(v)));
      $("pmRows").append(tr);
    }
    $("pmRowPage").textContent =
      rowPage + 1 + " / " + Math.max(1, Math.ceil(rows.length / ROWS));
    $("pmRowPrev").disabled = !rowPage;
    $("pmRowNext").disabled = (rowPage + 1) * ROWS >= rows.length;
  }
  function clientTable() {
    let rows = visibleEndpoints();
    if (selectionType === "port" && selected)
      rows = rows.filter((e) =>
        e.observations.some((o) => o.groupId === selected),
      );
    if (selectionType === "device" && selected)
      rows = rows.filter((e) =>
        e.observations.some((o) => o.deviceId === selected),
      );
    clientPage = Math.min(
      clientPage,
      Math.max(0, Math.ceil(rows.length / ROWS) - 1),
    );
    $("pmClientRows").replaceChildren();
    for (const e of rows.slice(clientPage * ROWS, (clientPage + 1) * ROWS)) {
      const tr = node("tr"),
        name = node("td");
      const b = action(
        name,
        (e.hostname ? e.hostname + " · " : "") + C.display(e.mac),
        () => select(e.id, "client"),
      );
      b.className = "pm-table-action";
      tr.append(name);
      for (const text of [
        e.addresses.map((a) => a.ip + " [" + a.vrf + "]").join(", ") ||
          "Not collected",
        e.vlan ?? "Unknown",
        e.vendor + " / " + e.type,
        e.locations.length
          ? e.locations
              .map((id) => {
                const g = model.groups.find((g) => g.id === id);
                return g.device + " / " + g.port;
              })
              .join(", ")
          : e.placement,
        e.observations.length + " observations",
      ])
        tr.append(node("td", String(text)));
      $("pmClientRows").append(tr);
    }
    $("pmClientPage").textContent =
      clientPage +
      1 +
      " / " +
      Math.max(1, Math.ceil(rows.length / ROWS)) +
      " · " +
      rows.length +
      " identities";
    $("pmClientPrev").disabled = !clientPage;
    $("pmClientNext").disabled = (clientPage + 1) * ROWS >= rows.length;
  }
  function excluded() {
    const root = $("pmExcluded");
    root.replaceChildren();
    for (const note of model.issues) root.append(node("p", note, "pm-warning"));
    for (const s of sources) {
      const counts = {};
      for (const r of s.rows)
        if (
          ["Multicast", "Virtual gateway", "Local/system"].includes(r.kind) ||
          r.type === "blackhole"
        )
          counts[r.kind] = (counts[r.kind] || 0) + 1;
      const details = node("details");
      details.append(
        node(
          "summary",
          s.device +
            " · " +
            s.kind.toUpperCase() +
            " · " +
            s.filename +
            " · " +
            (Object.entries(counts)
              .map(([k, v]) => k + " " + v)
              .join(" · ") || "Evidence retained") +
            " · " +
            (s.skipped || 0) +
            " unmatched MAC-bearing lines",
        ),
        node("pre", s.raw, "pm-evidence"),
      );
      for (const warning of s.warnings || [])
        details.append(node("p", warning, "pm-warning"));
      root.append(details);
    }
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })),
      a = node("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csv(value) {
    value = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(value)) value = "'" + value;
    return '"' + value.replace(/"/g, '""') + '"';
  }
  function exportCsv(name, rows) {
    download(
      name,
      "\ufeff" + rows.map((r) => r.map(csv).join(",")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }
  async function restore(data) {
    if (
      ![
        "mac-port-mapping-v1",
        "mac-port-mapping-v2",
        "network-discovery-v1",
      ].includes(data.schema) ||
      !Array.isArray(data.sources) ||
      data.sources.length > 100
    )
      throw Error("This is not a supported port mapping workspace.");
    let next = [];
    if (data.schema === "network-discovery-v1") {
      for (const s of data.sources) {
        next.push(
          normalizeSource({
            device: s.deviceName,
            raw: s.output,
            platform: s.platform,
            kind: s.protocol,
            target: s.target,
            filename: "Discovery " + s.protocol,
            importedAt: s.observedAt || new Date().toISOString(),
          }),
        );
        for (const d of s.interfaceEvidence || [])
          next.push(
            normalizeSource({
              device: s.deviceName,
              target: s.target,
              platform: d.platform || s.platform,
              kind: "interfaces",
              command: d.command,
              raw: d.output,
              filename: "Discovery " + d.command,
              importedAt:
                d.observedAt || s.observedAt || new Date().toISOString(),
            }),
          );
      }
    } else next = data.sources.map(normalizeSource);
    const overrides = data.organizationPrefixes || {};
    if (
      Object.keys(overrides).length > 60000 ||
      Object.entries(overrides).some(
        ([k, v]) =>
          !/^(?:[0-9A-F]{6}|[0-9A-F]{7}|[0-9A-F]{9})$/.test(k) ||
          typeof v !== "string" ||
          v.length > 300,
      )
    )
      throw Error("Invalid saved organization registry.");
    const notes = data.annotations || {};
    if (
      typeof notes !== "object" ||
      Array.isArray(notes) ||
      JSON.stringify(notes).length > 2000000 ||
      Object.values(notes).some(
        (v) =>
          !v ||
          typeof v !== "object" ||
          ["hostname", "type", "notes"].some(
            (k) => v[k] !== undefined && typeof v[k] !== "string",
          ),
      )
    )
      throw Error("Invalid client annotations.");
    const oldAnnotations = annotations,
      oldDb = customDb,
      oldReports = importReports;
    try {
      annotations = { ...notes };
      customDb = { ...overrides };
      importReports = Array.isArray(data.importReports)
        ? data.importReports
            .slice(-30)
            .filter(
              (r) =>
                r &&
                typeof r.filename === "string" &&
                Array.isArray(r.warnings) &&
                Array.isArray(r.missing),
            )
        : [];
      db = { ...baseDb, ...customDb };
      await analyze(next);
    } catch (e) {
      annotations = oldAnnotations;
      customDb = oldDb;
      importReports = oldReports;
      db = { ...baseDb, ...customDb };
      throw e;
    }
  }
  async function loadFiles(files) {
    for (const file of files) {
      try {
        if (file.size > 50000000)
          throw Error("Diagnostic file limit is 50 MB.");
        let raw;
        if (/\.gz$/i.test(file.name)) {
          const reader = file
              .stream()
              .pipeThrough(new DecompressionStream("gzip"))
              .getReader(),
            chunks = [];
          let bytes = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > 50000000) {
              await reader.cancel();
              throw Error("Expanded diagnostic file exceeds 50 MB.");
            }
            chunks.push(value);
          }
          raw = await new Blob(chunks).text();
        } else raw = await file.text();
        if (/\.json$/i.test(file.name)) await restore(JSON.parse(raw));
        else
          await add(
            raw,
            $("pmDevice").value.trim() &&
              $("pmDevice").value !== "Imported switch"
              ? $("pmDevice").value
              : file.name.replace(/\.(?:txt|log|rtf|gz)$/i, "").split("__")[0],
            file.name,
          );
      } catch (e) {
        status(file.name + ": " + e.message, true);
      }
    }
    $("pmFiles").value = "";
  }
  function demoSources() {
    const at = "2026-10-19T12:00:00Z",
      make = (device, platform, kind, raw, command = "") =>
        normalizeSource({
          device,
          platform,
          kind,
          raw,
          command,
          filename: "Synthetic demonstration · " + kind,
          importedAt: at,
          site: "Demo",
        });
    return [
      make(
        "CORE-01",
        "Cisco NX-OS",
        "lldp",
        "Local Port id: Ethernet1/1\nChassis id: 001c.7300.0010\nPort id: Ethernet49\nSystem Name: ACCESS-01\nSystem Description: Arista Networks EOS\nEnabled Capabilities: Bridge\nManagement Address: 192.0.2.11",
      ),
      make(
        "ACCESS-01",
        "Arista EOS",
        "lldp",
        "Interface Ethernet49 detected 1 LLDP neighbors:\n - Chassis ID: 0011.2200.0001\n - Port ID: Ethernet1/1\n - System Name: CORE-01\n - System Description: Cisco Nexus NX-OS\n - Enabled Capabilities: Bridge, Router\n - Management Address: 192.0.2.10\nInterface Ethernet2 detected 1 LLDP neighbors:\n - Chassis ID: 001b.6301.0203\n - Port ID: eth0\n - System Name: PHONE-01\n - Enabled Capabilities: Telephone\nInterface Ethernet3 detected 1 LLDP neighbors:\n - Chassis ID: 0011.2200.0030\n - Port ID: eth0\n - System Name: AP-01\n - Enabled Capabilities: WLAN Access Point",
      ),
      make(
        "CORE-01",
        "Cisco NX-OS",
        "mac",
        "10 0050.5684.1234 dynamic Eth1/1\n20 001b.6301.0203 dynamic Eth1/1\n10 0050.56ab.cdef dynamic Eth1/1\n30 0011.2200.0044 dynamic Eth1/1",
      ),
      make(
        "ACCESS-01",
        "Arista EOS",
        "mac",
        "10 0050.5684.1234 dynamic Et1\n20 001b.6301.0203 dynamic Et2\n10 0050.56ab.cdef dynamic Et2\n30 0011.2200.0044 dynamic Et3",
      ),
      make(
        "ACCESS-01",
        "Arista EOS",
        "interfaces",
        "Name: Ethernet1\nOperational Mode: static access\nAccess Mode VLAN: 10\nName: Ethernet2\nOperational Mode: static access\nAccess Mode VLAN: 10\nVoice VLAN: 20\nName: Ethernet3\nOperational Mode: trunk\nTrunking Native Mode VLAN: 30\nTrunking VLANs Enabled: 30,40\nName: Ethernet49\nOperational Mode: trunk\nTrunking VLANs Enabled: 10,20,30,40",
        "show interfaces switchport",
      ),
      make(
        "ACCESS-01",
        "Arista EOS",
        "interfaces",
        "Et1 USER-01 connected 10 a-full a-1000 10/100/1000\nEt2 PHONE-PC connected 10 a-full a-1000 10/100/1000\nEt3 ACCESS-POINT connected trunk full 1G 1000BASE-T\nEt49 CORE-UPLINK connected trunk full 10G 10GBASE-SR",
        "show interfaces status",
      ),
      make(
        "CORE-01",
        "Cisco NX-OS",
        "arp",
        "192.0.2.101 00:00:20 0050.5684.1234 Vlan10\n192.0.2.102 00:00:20 0050.56ab.cdef Vlan10\n192.0.2.120 00:00:20 001b.6301.0203 Vlan20\n192.0.2.144 00:00:20 0011.2200.0044 Vlan30",
      ),
    ];
  }
  $("pmFiles").onchange = (e) => loadFiles(e.target.files);
  $("pmAnalyze").onclick = () =>
    add($("pmRaw").value, $("pmDevice").value).catch((e) =>
      status(e.message, true),
    );
  let loadingExample = false;
  async function useExampleFiles() {
    if (working || loadingExample) return;
    loadingExample = true;
    $("pmTopologyExample").disabled = true;
    let previousReports = null;
    try {
      const response = await fetch("/api/port-mapping/samples");
      if (!response.ok) throw Error("Unable to load embedded example files.");
      const data = await response.json();
      if (
        data.synthetic !== true ||
        !Array.isArray(data.files) ||
        data.files.length !== 2
      )
        throw Error("Invalid example file package.");
      const sampleId = "embedded-tech-support-v1",
        incoming = [],
        reports = [];
      for (const file of data.files) {
        if (typeof file.name !== "string" || typeof file.text !== "string")
          throw Error("Example file is incomplete.");
        const extracted = C.extractSupport(file.text, {
          filename: file.name,
          site: "Synthetic example",
          importedAt: new Date().toISOString(),
        });
        for (const section of extracted.sections)
          incoming.push(normalizeSource({ ...section, sampleId }));
        reports.push({
          sampleId,
          filename: file.name,
          device: extracted.device,
          platform: extracted.platform,
          commands: extracted.commandCount,
          imported: extracted.sections.length,
          skipped: extracted.skipped,
          missing: extracted.missing,
          warnings: extracted.warnings,
        });
      }
      if (working)
        throw Error(
          "Wait for the current import to finish, then use the example files.",
        );
      previousReports = importReports;
      importReports = [
        ...importReports.filter((r) => r.sampleId !== sampleId),
        ...reports,
      ].slice(-30);
      await analyze([
        ...sources.filter((s) => s.sampleId !== sampleId),
        ...incoming,
      ]);
      status(
        "Embedded synthetic TXT examples loaded and analyzed. Existing imported evidence retained. Select a switch, link or client to explore.",
      );
    } catch (error) {
      if (previousReports) importReports = previousReports;
      status(error.message, true);
    } finally {
      loadingExample = false;
      $("pmTopologyExample").disabled = working;
    }
  }
  $("pmTopologyExample").onclick = useExampleFiles;
  $("pmExample").onclick = () =>
    analyze([
      ...sources,
      normalizeSource({
        raw: "Vlan Mac Address Type Ports\n10 0050.5684.1234 DYNAMIC Gi1/1\n20 001b.6301.0203 DYNAMIC Gi1/1\n30 0050.56ab.cdef DYNAMIC Po10\n10 0000.0c07.ac0a STATIC Router\n10 3333.0000.0001 STATIC Gi1/1",
        device: "Example switch",
        filename: "Example · demonstration only",
        kind: "mac",
      }),
    ]).catch((e) => status(e.message, true));
  for (const id of ["pmPlatform", "pmKind"]) $(id).onchange = hint;
  for (const id of ["pmSearch", "pmVlan"])
    $(id).addEventListener("input", () => {
      page = rowPage = clientPage = 0;
      selected = "";
      render();
    });
  for (const id of ["pmView", "pmFocus", "pmDepth", "pmClients"])
    $(id).onchange = draw;
  $("pmPrev").onclick = () => {
    page--;
    draw();
  };
  $("pmNext").onclick = () => {
    page++;
    draw();
  };
  $("pmRowPrev").onclick = () => {
    rowPage--;
    table();
  };
  $("pmRowNext").onclick = () => {
    rowPage++;
    table();
  };
  $("pmClientPrev").onclick = () => {
    clientPage--;
    clientTable();
  };
  $("pmClientNext").onclick = () => {
    clientPage++;
    clientTable();
  };
  $("pmClear").onclick = () => {
    if (working) return status("Wait for analysis to complete.", true);
    if (!confirm("Clear imported port mapping evidence and annotations?"))
      return;
    sources = [];
    evidence = null;
    annotations = {};
    importReports = [];
    model = C.correlate([], null);
    selected = "";
    page = rowPage = clientPage = 0;
    localStorage.removeItem(DRAFT);
    render();
    status("Workspace cleared.");
  };
  $("pmCsv").onclick = () => {
    const data = [
      [
        "Site",
        "Device",
        "Port",
        "Observed VLAN",
        "MAC",
        "Organization",
        "Switchport mode",
        "Access VLAN",
        "Native VLAN",
        "Voice VLAN",
        "Allowed VLANs",
        "Status",
        "Speed",
        "Aggregation",
        "Attachment",
        "Source",
        "Captured at",
        "VLAN name",
        "Configured mode / access VLAN",
        "STP by VLAN / instance",
        "Local addresses / VRF",
      ],
    ];
    for (const g of selectionType === "port" && selected
      ? groups.filter((g) => g.id === selected)
      : groups)
      for (const r of g.rows) {
        const s = sources.find((s) => s.id === r.sourceId);
        data.push([
          g.site,
          g.device,
          g.port,
          r.vlan,
          C.display(r.mac),
          r.vendor,
          g.mode,
          g.detail.vlan,
          g.detail.nativeVlan,
          g.detail.voiceVlan,
          g.detail.allowedVlans,
          g.detail.status,
          g.detail.speed,
          g.detail.portChannel,
          g.attachment,
          s?.filename,
          r.observedAt,
          r.vlanName,
          [g.detail.configuredMode, g.detail.configuredAccessVlan].filter(Boolean).join(" / "),
          (g.detail.spanningTree || []).map((s) => s.instance + " " + s.role + " " + s.state).join("; "),
          [...(g.detail.addresses || []), ...(g.detail.configuredAddresses || []), g.detail.vrf].filter(Boolean).join("; "),
        ]);
      }
    exportCsv("port-mapping.csv", data);
  };
  $("pmClientCsv").onclick = () =>
    exportCsv("consolidated-clients.csv", [
      [
        "Site",
        "VLAN",
        "MAC",
        "Hostname",
        "Organization",
        "Type",
        "Type evidence",
        "IP / VRF",
        "Candidate ports",
        "Placement",
        "Observed at",
        "Notes",
      ],
      ...visibleEndpoints().map((e) => [
        e.site,
        e.vlan,
        C.display(e.mac),
        e.hostname,
        e.vendor,
        e.type,
        e.typeEvidence,
        e.addresses.map((a) => a.ip + " [" + a.vrf + "] " + a.scope).join("; "),
        e.locations
          .map((id) => {
            const g = model.groups.find((g) => g.id === id);
            return g.device + " / " + g.port;
          })
          .join("; "),
        e.placement,
        e.observations.map((o) => o.observedAt).join("; "),
        e.notes,
      ]),
    ]);
  $("pmSave").onclick = () =>
    download(
      "port-mapping-workspace.json",
      JSON.stringify(bundle(), null, 2),
      "application/json",
    );
  $("pmSvg").onclick = () => {
    const copy = $("pmMap").cloneNode(true);
    copy.setAttribute("xmlns", ns);
    download(
      "network-port-topology.svg",
      new XMLSerializer().serializeToString(copy),
      "image/svg+xml",
    );
  };
  $("pmPrint").onclick = () => window.print();
  $("pmOuiFile").onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 12000000) throw Error("Registry file exceeds 12 MB.");
      let added = 0;
      for (const line of (await file.text()).split(/\r?\n/)) {
        const m = line.match(
          /^(?:MA-L|MA-M|MA-S|IAB),([0-9A-Fa-f]{6,9}),("(?:[^"]|"")*"|[^,]+)/,
        );
        if (!m || ![6, 7, 9].includes(m[1].length)) continue;
        customDb[m[1].toUpperCase()] = m[2]
          .replace(/^"|"$/g, "")
          .replace(/""/g, '"');
        added++;
      }
      if (!added)
        throw Error(
          "Use IEEE CSV with Registry, Assignment, Organization Name columns.",
        );
      db = { ...baseDb, ...customDb };
      registry = { ...registry, custom: file.name };
      model = C.correlate(sources, evidence, db, annotations);
      saveDraft();
      render();
      status(added + " organization prefixes imported.");
    } catch (err) {
      status(err.message, true);
    }
    e.target.value = "";
  };
  hint();
  fetch("/port-mapping-oui.json")
    .then((r) => {
      if (!r.ok) throw Error();
      return r.json();
    })
    .then((data) => {
      baseDb = data.prefixes;
      db = { ...baseDb, ...customDb };
      registry = data.metadata;
      $("pmDatabase").textContent =
        Object.keys(db).length +
        " organization prefixes · " +
        registry.source +
        " · " +
        registry.date +
        ". Local/randomized MACs remain unassigned.";
      model = C.correlate(sources, evidence, db, annotations);
      render();
    })
    .catch(() => {
      $("pmDatabase").textContent =
        "Bundled registry unavailable. Import IEEE CSV for organization lookup.";
    });
  window.PortMapping = {
    parse: C.parse,
    sources: () => sources,
    loadFiles,
    groups: () => groups,
    model: () => model,
    restore,
    analyze,
    demoSources,
  };
  try {
    const draft = localStorage.getItem(DRAFT);
    if (draft)
      restore(JSON.parse(draft)).catch((e) =>
        status("Saved draft retained; unable to restore: " + e.message, true),
      );
  } catch (e) {
    status(
      "Unable to read browser draft. Import a saved JSON workspace.",
      true,
    );
  }
})();
