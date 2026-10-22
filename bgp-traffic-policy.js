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
    // A zero prepend is a no-op unless it provides an exception inside an active policy.
    const changesAttributes = row => row.localPreference !== undefined || row.med !== undefined || Number(row.prependCount) > 0 || row.communities?.length;
    return rows.some(changesAttributes) ? rows : [];
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
    const d=root.document,data=d.getElementById('bgpTrafficPoliciesData'),out=d.getElementById('bgpOutboundPolicyRows'),inn=d.getElementById('bgpInboundPolicyRows');
    if(!data||!out||!inn)return;
    const signature=data.value+JSON.stringify(connections)+['Outbound','Inbound'].map(s=>d.getElementById('bgpTe'+s+'Enable')?.checked!==false).join();
    if(out.dataset.signature===signature)return;out.dataset.signature=signature;
    let rows;try{rows=JSON.parse(data.value||'[]');if(!Array.isArray(rows)||rows.some(r=>!r||typeof r!=='object'))return;}catch{return;}
    const save=(redraw=false)=>{data.value=JSON.stringify(rows);if(redraw)delete out.dataset.signature;else{out.dataset.signature=data.value+JSON.stringify(connections)+['Outbound','Inbound'].map(s=>d.getElementById('bgpTe'+s+'Enable')?.checked!==false).join();refresh();}onChange();};
    out.replaceChildren();inn.replaceChildren();
    for(const [direction,side,host,buttonId]of [['import','Outbound',out,'bgpAddTrafficPolicy'],['export','Inbound',inn,'bgpAddInboundPolicy']]){
      const add=d.getElementById(buttonId);if(!add)continue;
      add.disabled=rows.length>=64||!connections.length||d.getElementById('bgpTe'+side+'Enable')?.checked===false;
      add.onclick=()=>{if(rows.length>=64)return;const connection=connections.find(c=>!rows.some(r=>r.enabled!==false&&r.direction===direction&&String(r.connection)===String(c.id)&&!split(r.prefixes).length))||connections[0];if(!connection)return;const preferred=d.getElementById(direction==='import'?'bgpTeOutboundPreferredIsp':'bgpTeInboundPreferredIsp')?.value,isPreferred=String(connection.id)===preferred;rows.push({enabled:true,connection:String(connection.id),direction,prefixes:'',localPreference:direction==='import'?(d.getElementById(isPreferred?'bgpTeLocalPrefValue':'bgpTeBackupLocalPref')?.value||'100'):'',prependCount:direction==='export'?(isPreferred?'0':d.getElementById('bgpTePrependCount')?.value||'3'):'',med:'',communities:''});save(true);const row=host.querySelector('[data-traffic-policy="'+(rows.length-1)+'"]');row?.scrollIntoView?.({block:'nearest'});row?.querySelector('[data-policy-field="'+(direction==='import'?'localPreference':'prependCount')+'"]')?.focus();};
      const siblings=rows.map((r,i)=>(r.direction||'import')===direction?i:-1).filter(i=>i>=0);
      siblings.forEach((index,ordinal)=>{
        const r=rows[index],line=d.createElement('div');line.className='bgp-policy-line';line.dataset.trafficPolicy=String(index);line.dataset.policyDirection=direction;host.append(line);
        const header=d.createElement('div');header.className='bgp-policy-line-head';const title=d.createElement('strong');title.textContent='Policy '+(ordinal+1);header.append(title);line.append(header);
        const main=d.createElement('div');main.className='bgp-policy-line-main';line.append(main);
        const paused=d.getElementById('bgpTe'+side+'Enable')?.checked===false;
        function field(key,labelText,target=main,options){const label=d.createElement('label');label.textContent=labelText;const input=d.createElement(options?'select':'input');input.dataset.policyField=key;input.setAttribute('aria-label',side+' policy '+(ordinal+1)+' · '+labelText);if(options)for(const [value,text]of options){const option=d.createElement('option');option.value=value;option.textContent=text;input.append(option);}if(key==='enabled'){label.className='bgp-policy-active';input.type='checkbox';input.checked=r.enabled!==false;}else input.value=r[key]??'';if(['localPreference','prependCount','med'].includes(key)){input.type='number';input.min='0';input.max=key==='prependCount'?'10':'4294967295';}if(key==='prefixes')input.placeholder='Optional · blank matches all IPv4 routes';if(key==='communities')input.placeholder='65001:100, 65001:200';input.disabled=paused;input.addEventListener(options||key==='enabled'?'change':'input',()=>{r[key]=key==='enabled'?input.checked:input.value;save();});label.append(input);target.append(label);}
        field('enabled','Use',header);
        field('connection','Connection',main,[...connections.map(c=>[String(c.id),c.name]),['all','All enabled connections'],...(!connections.some(c=>String(c.id)===String(r.connection))&&r.connection!=='all'?[[String(r.connection),'Unavailable connection '+r.connection]]:[])]);
        field(direction==='import'?'localPreference':'prependCount',direction==='import'?'Local Preference':'AS-path prepend');
        const optional=d.createElement('details'),summary=d.createElement('summary'),extra=d.createElement('div');optional.className='bgp-policy-optional';optional.open=split(r.prefixes).length>0||r.med!==''&&r.med!=null||split(r.communities).length>0;summary.textContent='Prefix / MED / communities · optional';extra.className='bgp-policy-extra';optional.append(summary,extra);line.append(optional);field('prefixes','IPv4 prefixes · optional',extra);field('med','MED · optional',extra);field('communities','Communities · optional',extra);
        const status=d.createElement('p');status.className='bgp-policy-status';status.setAttribute('role','status');line.append(status);
        for(const [offset,text]of [[-1,'↑'],[1,'↓'],[0,'Remove']]){const button=d.createElement('button');button.type='button';button.className='btn';button.textContent=text;button.setAttribute('aria-label',side+' policy '+(ordinal+1)+' · '+(offset<0?'Move up':offset>0?'Move down':'Remove'));const other=siblings[ordinal+offset];button.disabled=paused||offset!==0&&other===undefined;button.onclick=()=>{if(offset===0)rows.splice(index,1);else if(other!==undefined)[rows[index],rows[other]]=[rows[other],rows[index]];save(true);};header.append(button);}
      });
      if(!siblings.length){const empty=d.createElement('p');empty.className='note';empty.textContent='No connection policies. The default values above apply.';host.append(empty);}
    }
    function refresh(){rows.forEach((r,index)=>{const line=d.querySelector('[data-traffic-policy="'+index+'"]'),status=line?.querySelector('.bgp-policy-status');if(!status)return;let state='active',text='';if(r.enabled===false||d.getElementById(r.direction==='export'?'bgpTeInboundEnable':'bgpTeOutboundEnable')?.checked===false){state='paused';text='Paused';}else try{const rule=read(JSON.stringify([r]),connections.map(c=>c.id))[0],covered=rows.slice(0,index).some(p=>{const prefixes=split(p.prefixes);return p.enabled!==false&&(p.direction||'import')===rule.direction&&(p.connection==='all'||String(p.connection)===rule.connection)&&(!prefixes.length||rule.prefixes.length&&rule.prefixes.every(v=>prefixes.includes(v)));});if(covered){state='warning';text='An earlier policy already matches this scope. Change connection/prefixes or move this policy up.';}else text=rule.prefixes.length?'Matches '+rule.prefixes.join(', '):'Matches all IPv4 routes';}catch(error){state='error';text=error.message;}line.dataset.policyState=state;status.textContent=text;});}
    refresh();
  }
  const api = { read, plan, emit, resolve, summary, mount, prefix };
  root.BgpTrafficPolicy = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
