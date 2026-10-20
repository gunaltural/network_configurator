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
    const signature = data.value + JSON.stringify(connections);
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;
    let rows; try { rows = JSON.parse(data.value || '[]'); if (!Array.isArray(rows)) return; } catch { return; }
    const save = (redraw = false) => { data.value = JSON.stringify(rows); if (!redraw) host.dataset.signature = data.value + JSON.stringify(connections); else delete host.dataset.signature; onChange(); };
    host.replaceChildren();
    add.disabled = rows.length >= 64;
    add.onclick = () => { rows.push({ enabled: false, connection: connections[0]?.id || 'all', direction: 'import', prefixes: '', localPreference: '', prependCount: '', med: '', communities: '' }); save(true); };
    rows.forEach((r, index) => {
      const card = d.createElement('div'); card.className = 'bgp-device-card'; card.dataset.trafficPolicy = String(index);
      const title = d.createElement('h4'); title.textContent = 'Policy ' + (index + 1); card.append(title);
      const grid = d.createElement('div'); grid.className = 'param-grid'; card.append(grid);
      function field(key, text, options) {
        const label = d.createElement('label'); label.textContent = text;
        const control = d.createElement(options ? 'select' : 'input'); control.dataset.policyField = key; control.setAttribute('aria-label', text + ' · Policy ' + (index + 1));
        if (options) for (const [value, text] of options) { const option = d.createElement('option'); option.value = value; option.textContent = text; control.append(option); }
        if (key === 'enabled') { control.type = 'checkbox'; control.checked = r.enabled !== false; } else control.value = r[key] ?? '';
        if (['localPreference', 'prependCount', 'med'].includes(key)) { control.type = 'number'; control.min = '0'; control.max = key === 'prependCount' ? '10' : '4294967295'; }
        if (key === 'localPreference' && r.direction === 'export' || key === 'prependCount' && r.direction !== 'export') control.disabled = true;
        control.addEventListener(options || key === 'enabled' ? 'change' : 'input', () => {
          r[key] = key === 'enabled' ? control.checked : control.value;
          if (key === 'direction') { if (r.direction === 'import') r.prependCount = ''; else r.localPreference = ''; }
          save(key === 'direction');
        });
        label.append(control); grid.append(label);
      }
      field('enabled', 'Use policy');
      field('connection', 'Connection', [['all', 'All enabled connections'], ...connections.map(c => [String(c.id), c.name]), ...(!connections.some(c => String(c.id) === String(r.connection)) && r.connection !== 'all' ? [[String(r.connection), 'Unavailable connection ' + r.connection]] : [])]);
      field('direction', 'Apply to', [['import', 'Route import · outbound traffic'], ['export', 'Route export · inbound traffic']]);
      field('prefixes', 'IPv4 prefixes · blank matches all'); field('localPreference', 'Local Preference · optional'); field('prependCount', 'AS-path prepend count · optional'); field('med', 'MED · optional'); field('communities', 'Communities · optional, comma separated');
      const remove = d.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove policy'; remove.onclick = () => { rows.splice(index, 1); save(true); }; card.append(remove); host.append(card);
      for (const [offset, text] of [[-1, 'Move up'], [1, 'Move down']]) { const move = d.createElement('button'); move.type = 'button'; move.textContent = text; move.disabled = index + offset < 0 || index + offset >= rows.length; move.onclick = () => { [rows[index], rows[index + offset]] = [rows[index + offset], rows[index]]; save(true); }; card.append(move); }
    });
  }
  const api = { read, plan, emit, resolve, summary, mount, prefix };
  root.BgpTrafficPolicy = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
