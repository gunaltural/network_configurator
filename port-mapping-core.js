/* Imported MAC evidence and neighbor/port correlation. Missing facts remain explicit. */
(function (root) {
  "use strict";
  const normalize = (mac) =>
    String(mac)
      .replace(/[^0-9a-f]/gi, "")
      .toUpperCase();
  function textFromRtf(raw) {
    if (!/^\s*\{\\rtf/i.test(raw)) return raw;
    let out = "",
      stack = [],
      skip = false,
      uc = 1;
    for (let i = 0; i < raw.length;) {
      let c = raw[i++];
      if (c === "{") {
        stack.push([skip, uc]);
        continue;
      }
      if (c === "}") {
        [skip, uc] = stack.pop() || [false, 1];
        continue;
      }
      if (c !== "\\") {
        if (!skip && c !== "\r" && c !== "\n") out += c;
        continue;
      }
      c = raw[i];
      if (c === "\r" || c === "\n") {
        if (c === "\r" && raw[i + 1] === "\n") i++;
        i++;
        if (!skip) out += "\n";
        continue;
      }
      if (/[{}\\]/.test(c)) {
        i++;
        if (!skip) out += c;
        continue;
      }
      if (c === "'") {
        const code = parseInt(raw.slice(i + 1, i + 3), 16);
        if (!skip && Number.isFinite(code)) out += String.fromCharCode(code);
        i += 3;
        continue;
      }
      if (c === "*") {
        skip = true;
        i++;
        continue;
      }
      const m = raw.slice(i).match(/^([a-z]+)(-?\d+)? ?/i);
      if (!m) {
        i++;
        continue;
      }
      i += m[0].length;
      const word = m[1].toLowerCase(),
        n = Number(m[2]);
      if (
        [
          "fonttbl",
          "colortbl",
          "stylesheet",
          "info",
          "pict",
          "object",
          "header",
          "footer",
          "filetbl",
        ].includes(word)
      )
        skip = true;
      if (word === "uc") uc = n;
      if (word === "bin") {
        i += Math.max(0, n);
        continue;
      }
      if (skip) continue;
      if (["par", "line"].includes(word)) out += "\n";
      if (word === "tab") out += "\t";
      if (word === "u") {
        out += String.fromCharCode(n < 0 ? n + 65536 : n);
        i += uc;
      }
    }
    return out;
  }
  function parse(raw) {
    if (typeof raw !== "string" || raw.length > 3000000)
      throw Error("Use a text or RTF capture smaller than 3 MB.");
    const text = textFromRtf(raw),
      rows = [],
      warnings = [],
      seen = new Set();
    let macLines = 0,
      skipped = 0,
      duplicates = 0;
    const lines = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").split(/\r?\n/);
    const macRE =
      /\b(?:[0-9a-f]{4}[.\-]){2}[0-9a-f]{4}\b|\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index],
        m = [...line.matchAll(macRE)][0];
      if (!m) continue;
      macLines++;
      const mac = normalize(m[0]),
        before = line.slice(0, m.index).trim(),
        after = line.slice(m.index + m[0].length),
        typeMatch = after.match(
          /\b(dynamic|static|sticky|secure|blackhole|permanent)\b/i,
        );
      let vlan = before.match(/(?:^|\s)(\d{1,4}|---|All)\s*$/i)?.[1];
      if (vlan === undefined && before === "")
        vlan = after.match(/^\s+(\d{1,4})(?:\/\S+)?\s/)?.[1];
      if (vlan === undefined || !typeMatch) {
        skipped++;
        continue;
      }
      vlan = /^\d+$/.test(vlan) ? Number(vlan) : null;
      if (vlan !== null && (vlan < 1 || vlan > 4094)) {
        skipped++;
        continue;
      }
      const ports =
        after.match(
          /\b(?:GigabitEthernet|TenGigabitEthernet|FastEthernet|Port-channel|Eth-Trunk|Bridge-Aggregation|Ethernet|100GE|40GE|25GE|10GE|XGE|GE|Gi|Te|Fa|Hu|Fo|Eth|Et|Po|ae|ge-|xe-|et-|nve|vxlan)[\d][\w./:\-]*/gi,
        ) || [];
      const type = typeMatch[1].toLowerCase(),
        system =
          /\b(?:Router|Switch|Stby-Switch|CPU|Drop)\b/i.test(after) &&
          !ports.length;
      const first = parseInt(mac.slice(0, 2), 16),
        kind =
          first & 1
            ? "Multicast"
            : /^00000C07AC|^00000C9FF|^00005E000[12]/.test(mac)
              ? "Virtual gateway"
              : system
                ? "Local/system"
                : first & 2
                  ? "Locally administered"
                  : "Unicast";
      if (
        !ports.length &&
        !system &&
        kind !== "Multicast" &&
        type !== "blackhole"
      ) {
        skipped++;
        continue;
      }
      const destinations =
        kind === "Multicast"
          ? ["Multicast group"]
          : ports.length
            ? ports
            : [system ? "Local/system" : "No physical port"];
      for (const port of destinations) {
        const key = [vlan, mac, port, type].join("|");
        if (seen.has(key)) {
          duplicates++;
          continue;
        }
        seen.add(key);
        rows.push({
          vlan,
          mac,
          port,
          type,
          kind,
          line: index + 1,
          raw: line.trim(),
        });
      }
    }
    if (skipped)
      warnings.push(
        skipped +
          " MAC-bearing lines could not be mapped; review the capture format.",
      );
    if (duplicates)
      warnings.push(duplicates + " repeated records were collapsed.");
    if (
      !rows.length &&
      !/total\s+(?:mac\s+)?(?:addresses|entries|macs)[^\n]*?\b0\b|no\s+mac\s+(?:address|entries)/i.test(
        text,
      )
    )
      throw Error(
        "No supported MAC table rows found. Import Cisco IOS/NX-OS, Arista EOS or Huawei VRP MAC output.",
      );
    return { rows, warnings, macLines, skipped, duplicates };
  }
  function organization(mac, db) {
    mac = normalize(mac);
    if (parseInt(mac.slice(0, 2), 16) & 3) return null;
    for (const size of [9, 7, 6])
      if (db?.[mac.slice(0, size)]) return db[mac.slice(0, size)];
    return null;
  }
  const display = (mac) =>
    normalize(mac).match(/.{2}/g)?.join(":") || String(mac);
  function extractSupport(raw, meta = {}) {
    if (typeof raw !== "string" || raw.length > 50000000)
      throw Error("Diagnostic text limit is 50 MB.");
    const text = textFromRtf(raw).replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""),
      lines = text.split(/\r?\n/),
      blocks = [],
      warnings = [],
      promptNames = new Set();
    let block = null,
      localName = "";
    // Boundaries include unsupported commands so their output never leaks into a supported section.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i],
        m = line.match(
          /^\s*(?:(?:[-=*#~]{2,}\s*)|(?:[\w.\-/():]+[#>]\s*)|(?:<[^>]+>\s*)|(?:\d+[.)]\s*))?(?:\[\s*)?((?:show|display)\s+[a-z][a-z0-9 _./:|\-]*?)(?:\s*\])?(?:\s*[-=*#~]{2,})?\s*$/i,
        );
      if (m) {
        if (block) {
          block.end = i;
          blocks.push(block);
        }
        const prompt =
          line.match(/^\s*([\w.\-]+)[#>]\s*(?:show|display)/i) ||
          line.match(/^\s*<([^>]+)>\s*display/i);
        if (prompt) {
          promptNames.add(prompt[1]);
          if (!localName) localName = prompt[1];
        }
        block = {
          command: m[1].trim().replace(/\s+/g, " "),
          start: i + 2,
          lines: [],
        };
      } else if (block) block.lines.push(line);
    }
    if (block) {
      block.end = lines.length;
      blocks.push(block);
    }
    if (promptNames.size > 1)
      throw Error(
        "This capture contains multiple device prompts. Import one diagnostic file per device to preserve port ownership.",
      );
    if (blocks.length < 2)
      throw Error(
        "No multi-command diagnostic sections recognized. Use show tech-support text, or import the individual command output.",
      );
    const version = blocks
      .filter((b) => /^(?:show|display) version\b/i.test(b.command))
      .map((b) => b.lines.join("\n"))
      .join("\n");
    const config = blocks.filter((b) =>
      /^(?:show (?:running|startup)-config|display current-configuration)/i.test(
        b.command,
      ),
    );
    if (!localName)
      for (const b of config) {
        const m = b.lines
          .join("\n")
          .match(/^\s*(?:hostname|sysname)\s+(\S+)\s*$/m);
        if (m) {
          localName = m[1];
          break;
        }
      }
    let platform = meta.platform || "Cisco IOS-XE";
    if (/Arista|EOS (?:version|Software)/i.test(version))
      platform = "Arista EOS";
    else if (/NX-OS|Nexus Operating/i.test(version)) platform = "Cisco NX-OS";
    else if (/Huawei|Versatile Routing Platform/i.test(version))
      platform = platform === "Huawei iStack" ? platform : "Huawei_CE_SW";
    else if (/Cisco IOS|IOS XE/i.test(version)) platform = "Cisco IOS-XE";
    const sections = [];
    let skipped = 0;
    for (const b of blocks) {
      const original = b.command,
        command = original.toLowerCase(),
        body = b.lines.join("\n").trim();
      let kind = "",
        canonical = command,
        vrf = meta.vrf || "";
      if (
        /^show mac[ -]address[ -]table\b|^display mac-address\b/.test(
          command,
        ) &&
        !/(?:count|aging|notification|move|learning)\b/.test(command)
      )
        kind = "mac";
      else if (/^(?:show|display) lldp neighbou?rs?\b/.test(command))
        kind = "lldp";
      else if (/^show cdp neighbors\b/.test(command)) kind = "cdp";
      else if (/^show (?:ip arp|arp)\b|^display arp\b/.test(command))
        kind = "arp";
      else if (
        /^show ipv6 neighbors\b|^display ipv6 neighbou?rs?\b/.test(command)
      )
        kind = "nd";
      else if (/^show interfaces?\b/.test(command)) {
        kind = "interfaces";
        const base =
          platform === "Cisco NX-OS" ? "show interface" : "show interfaces";
        canonical = /\bswitchport\b/.test(command)
          ? base + " switchport"
          : /\bstatus\b/.test(command)
            ? base + " status"
            : /\bdescription\b/.test(command)
              ? base + " description"
              : /\btrunk\b/.test(command)
                ? base + " trunk"
                : base;
      } else if (/^show (?:etherchannel|port-channel) summary/.test(command)) {
        kind = "interfaces";
        canonical =
          platform === "Cisco IOS-XE"
            ? "show etherchannel summary"
            : "show port-channel summary";
      } else if (/^display (?:interface|port vlan|eth-trunk)\b/.test(command)) {
        kind = "interfaces";
        canonical = /^display port vlan/.test(command)
          ? "display port vlan"
          : /^display eth-trunk/.test(command)
            ? "display eth-trunk"
            : /\bbrief\b/.test(command)
              ? "display interface brief"
              : "display interface";
      }
      if (!kind) {
        skipped++;
        continue;
      }
      if (!body) {
        warnings.push(command + ": section is empty.");
        continue;
      }
      if (body.length > 3000000) {
        warnings.push(
          command + ": section exceeds 3 MB; import a smaller scoped capture.",
        );
        continue;
      }
      if (/--More--|---- More ----/.test(body))
        warnings.push(
          command + ": pagination marker found; capture may be incomplete.",
        );
      const vrfMatch = original.match(/\bvrf\s+(\S+)/i);
      if (vrfMatch) vrf = vrfMatch[1];
      sections.push({
        ...meta,
        device: localName || meta.device || "Imported switch",
        platform,
        kind,
        command: canonical,
        originalCommand: original,
        vrf,
        raw: body,
        filename:
          (meta.filename || "Diagnostic capture") +
          " · " +
          original +
          " · lines " +
          b.start +
          "–" +
          b.end,
      });
    }
    const found = new Set(sections.map((s) => s.kind)),
      missing = ["lldp / cdp", "mac", "interfaces", "arp / nd"].filter(
        (x) => !x.split(" / ").some((k) => found.has(k)),
      );
    return {
      sections,
      warnings,
      missing,
      skipped,
      device: localName || meta.device,
      platform,
      commandCount: blocks.length,
    };
  }
  function groups(sources, db) {
    const result = [];
    for (const source of sources) {
      const ports = new Map();
      for (const row of source.rows) {
        if (
          ["Multicast", "Virtual gateway", "Local/system"].includes(row.kind) ||
          ["blackhole"].includes(row.type)
        )
          continue;
        if (!ports.has(row.port)) ports.set(row.port, []);
        ports.get(row.port).push({
          ...row,
          vendor: organization(row.mac, db) || "Unknown",
          sourceId: source.id,
          device: source.device,
        });
      }
      for (const [port, rows] of ports)
        result.push({
          id: source.id + "|" + port,
          sourceId: source.id,
          device: source.device,
          port,
          rows,
          macCount: new Set(rows.map((r) => r.mac)).size,
          vlans: [
            ...new Set(rows.map((r) => r.vlan).filter((x) => x !== null)),
          ].sort((a, b) => a - b),
          mode: "Unknown",
          attachment: "Learned via port; direct attachment not established",
        });
    }
    return result.sort(
      (a, b) =>
        b.macCount - a.macCount ||
        a.port.localeCompare(b.port, undefined, { numeric: true }),
    );
  }
  function portKey(value) {
    return String(value || "")
      .replace(/\s/g, "")
      .toLowerCase()
      .replace(/^tengigabitethernet/, "te")
      .replace(/^gigabitethernet/, "gi")
      .replace(/^fastethernet/, "fa")
      .replace(/^port-channel/, "po")
      .replace(/^ethernet/, "eth")
      .replace(/^et(?=\d)/, "eth");
  }
  function correlate(sources, evidence, db = {}, annotations = {}) {
    const latest = new Map();
    for (const s of sources) {
      const key = [
        s.site || "Default",
        s.device.toLowerCase(),
        s.target || "",
        s.kind || "mac",
        s.originalCommand || s.command || "",
        s.vrf || "",
      ].join("|");
      if (
        !latest.has(key) ||
        Date.parse(s.importedAt) >= Date.parse(latest.get(key).importedAt)
      )
        latest.set(key, s);
    }
    const graph = evidence?.graph || { devices: [], links: [], warnings: [] },
      devices = graph.devices.map((d) => ({
        ...d,
        interfaces: { ...d.interfaces },
      })),
      links = graph.links.map((l) => ({ ...l })),
      bindings = evidence?.bindings || {},
      active = new Set(
        evidence?.activeSourceIds || [...latest.values()].map((s) => s.id),
      ),
      portGroups = new Map(),
      issues = [...(graph.warnings || [])],
      endpoints = new Map();
    const deviceById = new Map(devices.map((d) => [d.id, d]));
    function bound(s) {
      if (bindings[s.id]) return bindings[s.id];
      const id = "local-" + (s.site || "Default") + "|" + s.device;
      if (!deviceById.has(id)) {
        const d = {
          id,
          hostname: s.device,
          site: s.site || "Default",
          vendor: s.platform || "Unknown",
          managementAddresses: s.target ? [s.target] : [],
          interfaces: {},
          role: "Unknown",
          seed: true,
        };
        devices.push(d);
        deviceById.set(id, d);
      }
      return id;
    }
    for (const s of sources.filter(
      (s) => (!s.kind || s.kind === "mac") && active.has(s.id),
    )) {
      const deviceId = bound(s),
        d = deviceById.get(deviceId);
      for (const r of s.rows || []) {
        if (
          ["Multicast", "Virtual gateway", "Local/system"].includes(r.kind) ||
          r.type === "blackhole"
        )
          continue;
        const id = deviceId + "|" + portKey(r.port);
        if (!portGroups.has(id)) {
          const detail =
            Object.values(d.interfaces || {}).find(
              (x) => portKey(x.port) === portKey(r.port),
            ) || {};
          portGroups.set(id, {
            id,
            sourceId: s.id,
            sourceIds: [],
            deviceId,
            device: d.hostname,
            site: d.site || "Default",
            port: detail.port || r.port,
            detail,
            rows: [],
            neighbors: [],
            mode: detail.mode || "Unknown",
          });
        }
        const g = portGroups.get(id);
        if (!g.sourceIds.includes(s.id)) g.sourceIds.push(s.id);
        const row = {
          ...r,
          sourceId: s.id,
          device: d.hostname,
          site: d.site || "Default",
          vendor: organization(r.mac, db) || "Unknown",
          vrf: s.vrf || "default",
          observedAt: s.importedAt,
        };
        if (
          !g.rows.some(
            (x) =>
              x.mac === row.mac && x.vlan === row.vlan && x.type === row.type,
          )
        )
          g.rows.push(row);
      }
    }
    // A configured interface or discovered neighbor remains inspectable without a MAC capture.
    for (const d of devices)
      for (const detail of Object.values(d.interfaces || {})) {
        const id = d.id + "|" + portKey(detail.port);
        if (!portGroups.has(id))
          portGroups.set(id, {
            id,
            deviceId: d.id,
            device: d.hostname,
            site: d.site,
            port: detail.port,
            detail,
            rows: [],
            sourceIds: [],
            neighbors: [],
            mode: detail.mode || "Unknown",
          });
      }
    function ensurePort(did, port) {
      const id = did + "|" + portKey(port);
      if (!portGroups.has(id)) {
        const d = deviceById.get(did);
        portGroups.set(id, {
          id,
          deviceId: did,
          device: d.hostname,
          site: d.site,
          port,
          detail: {},
          rows: [],
          sourceIds: [],
          neighbors: [],
          mode: "Unknown",
        });
      }
      return portGroups.get(id);
    }
    for (const l of links)
      for (const [side, other] of [
        ["a", "b"],
        ["b", "a"],
      ]) {
        const g = ensurePort(l[side], l[side + "Port"]);
        g.neighbors.push({
          deviceId: l[other],
          port: l[other + "Port"],
          linkId: l.id,
          state: l.state,
          protocols: l.protocols,
        });
      }
    for (const g of portGroups.values()) {
      const members = Object.values(
        deviceById.get(g.deviceId).interfaces || {},
      ).filter((x) => portKey(x.portChannel) === portKey(g.port));
      g.members = members;
      const parent = g.detail.portChannel
        ? portGroups.get(g.deviceId + "|" + portKey(g.detail.portChannel))
        : null;
      if (parent)
        for (const n of g.neighbors)
          if (
            !parent.neighbors.some(
              (x) => x.deviceId === n.deviceId && x.port === n.port,
            )
          )
            parent.neighbors.push({ ...n, viaMember: g.port });
    }
    const chassis = new Map();
    for (const d of devices) {
      const mac = normalize(d.chassisId);
      if (mac.length === 12) {
        const id = (d.site || "Default") + "|" + mac;
        if (!chassis.has(id)) chassis.set(id, []);
        chassis.get(id).push(d);
      }
    }
    for (const g of portGroups.values()) {
      g.macCount = new Set(g.rows.map((r) => r.mac)).size;
      g.vlans = [
        ...new Set(g.rows.map((r) => r.vlan).filter((v) => v !== null)),
      ].sort((a, b) => a - b);
      const peerGroups = [
        g,
        ...g.members
          .map((m) => portGroups.get(g.deviceId + "|" + portKey(m.port)))
          .filter(Boolean),
      ];
      const peers = peerGroups
        .flatMap((p) => p.neighbors)
        .map((n) => deviceById.get(n.deviceId))
        .filter(Boolean);
      g.infrastructure = peers.some(
        (d) => d.seed || /Switch|Router/.test(d.role),
      );
      g.remote = /^(?:nve|vxlan)/i.test(g.port);
      g.attachment = g.remote
        ? "Remote overlay learning"
        : g.infrastructure
          ? "Transit toward discovered network device"
          : g.neighbors.length
            ? "Neighbor observed; additional MACs may be behind it"
            : "Edge candidate; direct attachment unconfirmed";
      g.issues = [];
      if (new Set(g.neighbors.map((n) => n.deviceId)).size > 1)
        g.issues.push(
          "Multiple advertised neighbors on this port; inspect shared media or conflicting snapshots.",
        );
      if (
        /down|notconnect|disabled|suspend/i.test(g.detail.status || "") &&
        g.macCount
      )
        g.issues.push(
          "MAC learning and port-down evidence coexist; compare capture times.",
        );
      for (const r of g.rows) {
        const id = [g.site, r.vlan ?? "unknown", r.mac].join("|");
        if (!endpoints.has(id))
          endpoints.set(id, {
            id,
            site: g.site,
            mac: r.mac,
            vlan: r.vlan,
            vendor: r.vendor,
            observations: [],
            locations: [],
            addresses: [],
            type: "Unknown",
            typeEvidence: "MAC registry identifies organization only",
            hostname: "",
            notes: "",
          });
        const e = endpoints.get(id);
        e.observations.push({
          groupId: g.id,
          deviceId: g.deviceId,
          device: g.device,
          port: g.port,
          sourceId: r.sourceId,
          line: r.line,
          observedAt: r.observedAt,
          vrf: r.vrf,
          remote: g.remote,
        });
        if (
          !g.infrastructure &&
          !g.remote &&
          !g.detail.portChannel &&
          !e.locations.includes(g.id)
        )
          e.locations.push(g.id);
      }
    }
    for (const e of endpoints.values()) {
      const identity = chassis.get(e.site + "|" + e.mac) || [];
      if (identity.length === 1) {
        e.neighborId = identity[0].id;
        e.type = identity[0].role;
        e.hostname = identity[0].hostname;
        e.typeEvidence = "Neighbor chassis ID and advertised capabilities";
      }
      const addressRows = (evidence?.addresses || []).filter(
        (a) =>
          a.site === e.site &&
          a.mac === e.mac &&
          (a.vlan === null || e.vlan === null || a.vlan === e.vlan),
      );
      for (const a of addressRows) {
        e.addresses.push({
          ...a,
          scope:
            a.vlan === null
              ? "VLAN not reported"
              : e.vlan === null
                ? "MAC VLAN not reported"
                : "VLAN matched",
        });
      }
      const override = annotations[e.id];
      if (override) {
        e.hostname = String(override.hostname || e.hostname).slice(0, 200);
        e.type = String(override.type || e.type).slice(0, 100);
        e.notes = String(override.notes || "").slice(0, 1000);
        e.typeEvidence = "Engineer annotation";
      }
      e.placement =
        e.locations.length === 1
          ? "Edge candidate"
          : e.locations.length > 1
            ? "Multiple edge candidates — dual attachment or movement requires review"
            : "Downstream / remote — final access port unresolved";
      if (e.locations.length > 1)
        issues.push(
          display(e.mac) + " VLAN " + e.vlan + ": multiple edge candidates.",
        );
    }
    for (const l of links) {
      const a = ensurePort(l.a, l.aPort),
        b = ensurePort(l.b, l.bPort);
      l.issues = [];
      if (
        a.detail.vlan &&
        b.detail.vlan &&
        a.detail.vlan !== b.detail.vlan &&
        /access/i.test(a.mode) &&
        /access/i.test(b.mode)
      )
        l.issues.push("Reported access VLAN mismatch");
      if (
        a.detail.nativeVlan &&
        b.detail.nativeVlan &&
        a.detail.nativeVlan !== b.detail.nativeVlan
      )
        l.issues.push("Reported native VLAN mismatch");
      l.aggregate = a.detail.portChannel || b.detail.portChannel || "";
      l.speed = a.detail.speed || b.detail.speed || "";
      l.status =
        [a.detail.status, b.detail.status].filter(Boolean).join(" / ") ||
        "Not collected";
      issues.push(
        ...l.issues.map(
          (issue) =>
            a.device +
            " " +
            a.port +
            " ↔ " +
            b.device +
            " " +
            b.port +
            ": " +
            issue,
        ),
      );
    }
    for (const g of portGroups.values()) g.endpointIds = [];
    for (const e of endpoints.values())
      for (const id of new Set(e.observations.map((o) => o.groupId)))
        portGroups.get(id).endpointIds.push(e.id);
    for (const g of portGroups.values())
      issues.push(...g.issues.map((x) => g.device + " " + g.port + ": " + x));
    return {
      devices,
      links,
      groups: [...portGroups.values()].sort(
        (a, b) =>
          b.macCount - a.macCount ||
          a.port.localeCompare(b.port, undefined, { numeric: true }),
      ),
      endpoints: [...endpoints.values()],
      issues: [...new Set(issues)],
      generatedAt: graph.generatedAt,
    };
  }
  function trace(model, endpoint) {
    const targets = new Set(
        endpoint.locations
          .map((id) => model.groups.find((g) => g.id === id)?.deviceId)
          .filter(Boolean),
      ),
      linkIds = new Set(),
      deviceIds = new Set(endpoint.observations.map((o) => o.deviceId));
    for (const origin of deviceIds) {
      if (targets.has(origin)) continue;
      const queue = [{ id: origin, path: [] }],
        seen = new Set([origin]);
      while (queue.length) {
        const q = queue.shift();
        if (targets.has(q.id)) {
          q.path.forEach((id) => linkIds.add(id));
          break;
        }
        for (const l of model.links) {
          const next = l.a === q.id ? l.b : l.b === q.id ? l.a : null;
          if (next && !seen.has(next)) {
            seen.add(next);
            queue.push({ id: next, path: [...q.path, l.id] });
          }
        }
      }
    }
    return [...linkIds];
  }
  const api = {
    parse,
    textFromRtf,
    organization,
    groups,
    display,
    normalize,
    portKey,
    correlate,
    trace,
    extractSupport,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PortMappingCore = api;
})(typeof window !== "undefined" ? window : globalThis);
