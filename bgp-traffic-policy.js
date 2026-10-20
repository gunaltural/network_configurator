/* Shared BGP policy rules: configuration, saved projects and synthetic paths. */
(function (root) {
  'use strict';
  const split = value => [...new Set(String(value || '').trim().split(/[,\s]+/).filter(Boolean))];
  function prefix(value) {
    const m = String(value).match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
    if (!m || m[1].split('.').some(n => +n > 255) || +m[2] > 32) throw Error('Use IPv4 network prefixes, for example 203.0.113.0/24.');
    const address = m[1].split('.').reduce((a, b) => a * 256 + +b, 0), size = 2 ** (32 - +m[2]);
    if (address % size) throw Error(value + ': enter the network address.');
    return { address, length: +m[2], text: m[1].split('.').map(Number).join('.') + '/' + +m[2] };
  }
  function read(raw = '[]', connections) {
    let items;
    try { items = JSON.parse(raw || '[]'); } catch { throw Error('Traffic policy data could not be read. Restore the saved project or correct the policy rows.'); }
    if (!Array.isArray(items) || items.length > 64) throw Error('Use at most 64 traffic policy rules.');
    return items.filter(r => r?.enabled !== false).map((r, i) => {
      if (!r || typeof r !== 'object') throw Error('Invalid traffic policy row.');
      const direction = r.direction || 'import', connection = String(r.connection || 'all');
      if (!['import', 'export'].includes(direction)) throw Error('Choose route import or export.');
      if (connection !== 'all' && (!/^\d+$/.test(connection) || connections && !connections.map(String).includes(connection))) throw Error('Policy ' + (i + 1) + ': choose an enabled connection.');
      const number = (key, max) => {
        if (r[key] === '' || r[key] === undefined || r[key] === null) return undefined;
        if (!/^\d+$/.test(String(r[key])) || +r[key] > max) throw Error('Policy ' + (i + 1) + ': ' + key + ' must be between 0 and ' + max + '.');
        return +r[key];
      };
      const localPreference = number('localPreference', 4294967295), prependCount = number('prependCount', 10), med = number('med', 4294967295);
      if (direction === 'export' && localPreference !== undefined) throw Error('Local Preference applies to imported routes.');
      if (direction === 'import' && prependCount !== undefined) throw Error('AS-path prepend applies to exported routes.');
      const communities = split(r.communities);
      if (communities.length > 32 || communities.some(c => !/^\d{1,5}:\d{1,5}$/.test(c) || c.split(':').some(n => +n > 65535))) throw Error('Use standard communities in ASN:value format (0–65535 per field).');
      if (localPreference === undefined && prependCount === undefined && med === undefined && !communities.length) throw Error('Policy ' + (i + 1) + ': enter at least one attribute.');
      const prefixes = split(r.prefixes).map(p => prefix(p).text);
      if (prefixes.length > 64) throw Error('Use at most 64 prefixes per rule.');
      return { id: i + 1, direction, connection, prefixes, localPreference, prependCount, med, communities };
    });
  }
  function plan(rules, connection, direction, baseline = {}) {
    const selected = rules.filter(r => r.direction === direction && (r.connection === 'all' || r.connection === String(connection)));
    const attributes = r => ({ ...baseline, ...Object.fromEntries(Object.entries(r).filter(([k, v]) => ['localPreference', 'prependCount', 'med'].includes(k) && v !== undefined)), communities: [...new Set([...(baseline.communities || []), ...(r.communities || [])])] });
    const rows = selected.map((r, i) => ({ ...r, sequence: (i + 1) * 10, ...attributes(r) }));
    if (rows.length || Object.values(baseline).some(v => Array.isArray(v) ? v.length : v !== undefined)) rows.push({ sequence: rows.length ? 65000 : 10, prefixes: [], ...baseline });
    return rows;
  }
  function emit(vendor, name, rows, asn) {
    if (!rows.length) return '';
    const lists = [], entries = [], huawei = vendor === 'Huawei_CE_SW', forti = vendor === 'FortiGate';
    for (const row of rows) {
      const list = 'PL-' + name + '-' + row.sequence;
      if (row.prefixes.length) {
        if (forti) lists.push('config router prefix-list\n edit "' + list + '"\n  config rule\n' + row.prefixes.map((p, i) => { const bits = +p.split('/')[1], mask = bits ? (0xffffffff << (32 - bits)) >>> 0 : 0; return '   edit ' + (i + 1) + '\n    set action permit\n    set prefix ' + p.split('/')[0] + ' ' + [24,16,8,0].map(s => (mask >>> s) & 255).join('.') + '\n   next'; }).join('\n') + '\n  end\n next\nend');
        else lists.push(row.prefixes.map((p, i) => huawei ? 'ip ip-prefix ' + list + ' index ' + ((i + 1) * 10) + ' permit ' + p.replace('/', ' ') : 'ip prefix-list ' + list + ' seq ' + ((i + 1) * 10) + ' permit ' + p).join('\n'));
      }
      const actions = [], prepend = Array(row.prependCount || 0).fill(asn).join(' ');
      if (row.localPreference !== undefined) actions.push(huawei ? ' apply local-preference ' + row.localPreference : forti ? '    set set-local-preference ' + row.localPreference : ' set local-preference ' + row.localPreference);
      if (prepend) actions.push(huawei ? ' apply as-path ' + prepend + ' additive' : forti ? '    set set-aspath "' + prepend + '"' : ' set as-path prepend ' + prepend);
      if (row.med !== undefined) actions.push(huawei ? ' apply cost ' + row.med : forti ? '    set set-metric ' + row.med : ' set metric ' + row.med);
      if (row.communities?.length) actions.push(huawei ? ' apply community ' + row.communities.join(' ') + ' additive' : forti ? '    set set-community ' + row.communities.map(c => '"' + c + '"').join(' ') + '\n    set set-community-additive enable' : ' set community ' + row.communities.join(' ') + ' additive');
      const match = !row.prefixes.length ? '' : huawei ? '\n if-match ip-prefix ' + list : forti ? '\n    set match-ip-address "' + list + '"' : '\n match ip address prefix-list ' + list;
      entries.push(forti ? '   edit ' + row.sequence + '\n    set action permit' + match + (actions.length ? '\n' + actions.join('\n') : '') + '\n   next' : (huawei ? 'route-policy ' + name + ' permit node ' : 'route-map ' + name + ' permit ') + row.sequence + match + (actions.length ? '\n' + actions.join('\n') : ''));
    }
    return [...lists, forti ? 'config router route-map\n edit "' + name + '"\n  config rule\n' + entries.join('\n') + '\n  end\n next\nend' : entries.join('\n\n')].join('\n\n');
  }
  function resolve(link, direction, route) {
    const base = { localPreference: link.localPreference ?? 100, prependCount: link.prependCount ?? 0, med: link.med, communities: link.communities || [] };
    const rows = link.trafficPolicies?.length ? read(JSON.stringify(link.trafficPolicies)) : [];
    for (const row of rows) if (row.direction === direction && (!row.prefixes.length || row.prefixes.includes(route))) {
      return { ...base, ...Object.fromEntries(['localPreference', 'prependCount', 'med'].filter(k => row[k] !== undefined).map(k => [k, row[k]])), communities: [...new Set([...base.communities, ...(row.communities || [])])] };
    }
    return base;
  }
  function summary(rules, label = x => x) {
    return rules.map((r, i) => 'Rule ' + (i + 1) + ' · ' + (r.connection === 'all' ? 'All enabled connections' : label(+r.connection)) + ' · route ' + r.direction + ' · ' + (r.prefixes.join(', ') || 'all IPv4 routes') + ' · ' + [r.localPreference !== undefined ? 'Local Preference ' + r.localPreference : '', r.prependCount !== undefined ? 'AS-path prepend ×' + r.prependCount : '', r.med !== undefined ? 'MED ' + r.med : '', r.communities.length ? 'communities ' + r.communities.join(', ') : ''].filter(Boolean).join(' · ')).join('\n');
  }
  function mount({ connections, onChange }) {
    const d = root.document, data = d.getElementById('bgpTrafficPoliciesData'), host = d.getElementById('bgpTrafficPolicyRows'), add = d.getElementById('bgpAddTrafficPolicy');
    if (!data || !host || !add) return;
    const environment = JSON.stringify(connections) + ['Outbound', 'Inbound'].map(side => d.getElementById('bgpTe' + side + 'Enable')?.checked !== false).join();
    const signature = data.value + environment;
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;
    let rows; try { rows = JSON.parse(data.value || '[]'); if (!Array.isArray(rows)) return; } catch { return; }
    const save = (redraw = false) => { data.value = JSON.stringify(rows); if (!redraw) { host.dataset.signature = data.value + environment; refreshStatus(); } else delete host.dataset.signature; onChange(); };
    const outbound = d.getElementById('bgpOutboundPolicyRows'), inbound = d.getElementById('bgpInboundPolicyRows'), addInbound = d.getElementById('bgpAddInboundPolicy');
    if (outbound && inbound) { outbound.replaceChildren(); inbound.replaceChildren(); } else host.replaceChildren();
    function addRule(direction) {
      if (rows.length >= 64) return;
      const nextConnection = connections.find(c => !rows.some(r => r.enabled !== false && r.direction === direction && String(r.connection) === String(c.id) && !r.prefixes?.length)) || connections[0];
      rows.push({ enabled: true, connection: String(nextConnection?.id || 'all'), direction, prefixes: '', localPreference: direction === 'import' ? (d.getElementById('bgpTeLocalPrefValue')?.value || '250') : '', prependCount: direction === 'export' ? (d.getElementById('bgpTePrependCount')?.value || '3') : '', med: '', communities: '' });
      save(true);
      const input = host.querySelector('[data-traffic-policy="' + (rows.length - 1) + '"] input[data-policy-field="' + (direction === 'import' ? 'localPreference' : 'prependCount') + '"]');
      input?.scrollIntoView?.({block:'nearest'}); input?.focus();
    }
    add.disabled = rows.length >= 64 || !connections.length; add.onclick = () => addRule('import');
    if (addInbound) { addInbound.disabled = rows.length >= 64 || !connections.length; addInbound.onclick = () => addRule('export'); }
    const ordinals = {import: 0, export: 0};
    rows.forEach((r, index) => {
      const direction = r.direction === 'export' ? 'export' : 'import', ordinal = ++ordinals[direction];
      const card = d.createElement('div'); card.className = 'bgp-device-card bgp-policy-rule'; card.dataset.trafficPolicy = String(index); card.dataset.policyDirection = direction;
      const header = d.createElement('div'); header.className = 'bgp-rule-header'; card.append(header);
      const title = d.createElement('h4'); title.textContent = (direction === 'export' ? 'Inbound' : 'Outbound') + ' rule ' + ordinal; header.append(title);
      const grid = d.createElement('div'); grid.className = 'param-grid'; card.append(grid);
      function field(key, text, options, target = grid) {
        const label = d.createElement('label'); label.textContent = text;
        const control = d.createElement(options ? 'select' : 'input'); control.dataset.policyField = key; control.setAttribute('aria-label', text + ' · Policy ' + (index + 1));
        if (options) for (const [value, text] of options) { const option = d.createElement('option'); option.value = value; option.textContent = text; control.append(option); }
        if (key === 'enabled') { control.type = 'checkbox'; control.checked = r.enabled !== false; label.className = 'bgp-rule-toggle'; } else control.value = r[key] ?? '';
        if (key === 'prefixes') control.placeholder = 'Optional · blank matches all IPv4 routes';
        if (key === 'communities') control.placeholder = '65001:100, 65001:200';
        if (['localPreference', 'prependCount', 'med'].includes(key)) { control.type = 'number'; control.min = '0'; control.max = key === 'prependCount' ? '10' : '4294967295'; }
        if (key === 'localPreference' && r.direction === 'export' || key === 'prependCount' && r.direction !== 'export') control.disabled = true;
        control.addEventListener(options || key === 'enabled' ? 'change' : 'input', () => {
          r[key] = key === 'enabled' ? control.checked : control.value;
          save();
        });
        label.append(control); if (key === 'prefixes') { const hint = d.createElement('small'); hint.className = 'bgp-field-hint'; hint.textContent = 'Optional. Use one or more exact IPv4 prefixes, separated by commas. Leave blank for all routes.'; label.append(hint); } target.append(label);
      }
      field('enabled', 'Active', undefined, header);
      field('connection', 'Connection', [['all', 'All enabled connections'], ...connections.map(c => [String(c.id), c.name]), ...(!connections.some(c => String(c.id) === String(r.connection)) && r.connection !== 'all' ? [[String(r.connection), 'Unavailable connection ' + r.connection]] : [])]);
      field('prefixes', 'IPv4 prefixes · optional'); if (direction === 'export') field('prependCount', 'AS-path prepend · extra copies'); else field('localPreference', 'Local Preference');
      const advanced = d.createElement('details'), summary = d.createElement('summary'), advancedGrid = d.createElement('div');
      advanced.className = 'bgp-rule-advanced'; advanced.open = r.med !== '' && r.med != null || split(r.communities).length > 0;
      summary.textContent = 'MED & communities · optional'; advancedGrid.className = 'param-grid'; advanced.append(summary, advancedGrid); card.append(advanced);
      field('med', 'MED', undefined, advancedGrid); field('communities', 'Standard communities', undefined, advancedGrid);
      const status = d.createElement('p'); status.className = 'bgp-rule-status'; status.setAttribute('role', 'status'); card.append(status);
      const actions = d.createElement('div'); actions.className = 'bgp-rule-actions'; card.append(actions);
      const remove = d.createElement('button'); remove.type = 'button'; remove.className = 'btn'; remove.textContent = 'Remove policy'; remove.setAttribute('aria-label', 'Remove ' + title.textContent); remove.onclick = () => { rows.splice(index, 1); save(true); }; actions.append(remove); (direction === 'export' ? inbound || host : outbound || host).append(card);
      const siblings = rows.map((r, i) => r.direction === direction ? i : -1).filter(i => i >= 0), position = siblings.indexOf(index);
      for (const [offset, text] of [[-1, 'Move up'], [1, 'Move down']]) { const move = d.createElement('button'); move.type = 'button'; move.className = 'btn'; move.textContent = text; const other = siblings[position + offset]; move.disabled = other === undefined; move.onclick = () => { if (other === undefined) return; [rows[index], rows[other]] = [rows[other], rows[index]]; save(true); }; actions.append(move); }
    });
    function refreshStatus() {
      rows.forEach((r, index) => {
        const card = host.querySelector('[data-traffic-policy="' + index + '"]'), status = card?.querySelector('.bgp-rule-status'); if (!status) return;
        let state = 'active', text;
        const directionEnabled = d.getElementById(r.direction === 'export' ? 'bgpTeInboundEnable' : 'bgpTeOutboundEnable')?.checked !== false;
        if (r.enabled === false || !directionEnabled) { state = 'paused'; text = 'Paused · saved settings are retained and not applied.'; }
        else try {
          const rule = read(JSON.stringify([r]), connections.map(c => c.id))[0];
          const covered = rows.slice(0, index).filter(p => p.enabled !== false && p.direction === r.direction).some(p => {
            const prefixSet = split(p.prefixes);
            return (p.connection === 'all' || String(p.connection) === rule.connection) && (!prefixSet.length || rule.prefixes.length && rule.prefixes.every(v => prefixSet.includes(v)));
          });
          if (covered) { state = 'warning'; text = 'Shadowed by an earlier rule. Change its connection/prefixes or move this rule up.'; }
          else text = 'Active · ' + (rule.prefixes.length ? rule.prefixes.length + ' exact prefix' + (rule.prefixes.length === 1 ? '' : 'es') : 'all IPv4 routes') + ' · ' + (rule.localPreference !== undefined ? 'Local Preference ' + rule.localPreference : rule.prependCount !== undefined ? 'prepend +' + rule.prependCount : 'custom attributes');
        } catch (error) { state = 'error'; text = error.message; }
        card.dataset.policyState = state; status.textContent = text;
      });
      for (const [direction, target] of [['import', outbound], ['export', inbound]]) {
        if (!target || target.children.length) continue;
        const empty = d.createElement('p'); empty.className = 'bgp-policy-empty'; empty.textContent = connections.length ? 'No additional rules. All routes use the baseline above.' : 'Add an enabled external connection in Topology & peering before creating rules.'; target.append(empty);
      }
    }
    refreshStatus();
  }
  const api = { read, plan, emit, resolve, summary, mount, prefix };
  root.BgpTrafficPolicy = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
