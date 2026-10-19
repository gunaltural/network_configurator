/* MAC learning evidence parser. No physical adjacency or switchport mode is inferred. */
(function(root){'use strict';
const normalize=mac=>String(mac).replace(/[^0-9a-f]/gi,'').toUpperCase();
function textFromRtf(raw){
 if(!/^\s*\{\\rtf/i.test(raw))return raw;
 let out='',stack=[],skip=false,uc=1;
 for(let i=0;i<raw.length;){let c=raw[i++];if(c==='{'){stack.push([skip,uc]);continue;}if(c==='}'){[skip,uc]=stack.pop()||[false,1];continue;}if(c!=='\\'){if(!skip&&c!=='\r'&&c!=='\n')out+=c;continue;}
 c=raw[i];if(c==='\r'||c==='\n'){if(c==='\r'&&raw[i+1]==='\n')i++;i++;if(!skip)out+='\n';continue;}if(/[{}\\]/.test(c)){i++;if(!skip)out+=c;continue;}if(c==="'"){const code=parseInt(raw.slice(i+1,i+3),16);if(!skip&&Number.isFinite(code))out+=String.fromCharCode(code);i+=3;continue;}if(c==='*'){skip=true;i++;continue;}const m=raw.slice(i).match(/^([a-z]+)(-?\d+)? ?/i);if(!m){i++;continue;}i+=m[0].length;const word=m[1].toLowerCase(),n=Number(m[2]);if(['fonttbl','colortbl','stylesheet','info','pict','object','header','footer','filetbl'].includes(word))skip=true;if(word==='uc')uc=n;if(word==='bin'){i+=Math.max(0,n);continue;}if(skip)continue;if(['par','line'].includes(word))out+='\n';if(word==='tab')out+='\t';if(word==='u'){out+=String.fromCharCode(n<0?n+65536:n);i+=uc;}
 }return out;
}
function parse(raw){
 if(typeof raw!=='string'||raw.length>3000000)throw Error('Use a text or RTF capture smaller than 3 MB.');
 const text=textFromRtf(raw),rows=[],warnings=[],seen=new Set();let macLines=0,skipped=0,duplicates=0;
 const lines=text.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').split(/\r?\n/);
 const macRE=/\b(?:[0-9a-f]{4}[.\-]){2}[0-9a-f]{4}\b|\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/ig;
 for(let index=0;index<lines.length;index++){
  const line=lines[index],m=[...line.matchAll(macRE)][0];if(!m)continue;macLines++;const mac=normalize(m[0]),before=line.slice(0,m.index).trim(),after=line.slice(m.index+m[0].length),typeMatch=after.match(/\b(dynamic|static|sticky|secure|blackhole|permanent)\b/i);
  let vlan=before.match(/(?:^|\s)(\d{1,4}|---|All)\s*$/i)?.[1];if(vlan===undefined&&before==='')vlan=after.match(/^\s+(\d{1,4})(?:\/\S+)?\s/)?.[1];
  if(vlan===undefined||!typeMatch){skipped++;continue;}vlan=/^\d+$/.test(vlan)?Number(vlan):null;if(vlan!==null&&(vlan<1||vlan>4094)){skipped++;continue;}
  const ports=after.match(/\b(?:GigabitEthernet|TenGigabitEthernet|FastEthernet|Port-channel|Eth-Trunk|Bridge-Aggregation|Ethernet|100GE|40GE|25GE|10GE|XGE|GE|Gi|Te|Fa|Hu|Fo|Eth|Po|ae|ge-|xe-|et-)[\d][\w./:\-]*/gi)||[];
  const type=typeMatch[1].toLowerCase(),system=/\b(?:Router|Switch|Stby-Switch|CPU|Drop)\b/i.test(after)&&!ports.length;
  const first=parseInt(mac.slice(0,2),16),kind=first&1?'Multicast':/^00000C07AC|^00000C9FF|^00005E000[12]/.test(mac)?'Virtual gateway':system?'Local/system':first&2?'Locally administered':'Unicast';
  if(!ports.length&&!system&&kind!=='Multicast'&&type!=='blackhole'){skipped++;continue;}
  const destinations=kind==='Multicast'?['Multicast group']:ports.length?ports:[system?'Local/system':'No physical port'];
  for(const port of destinations){const key=[vlan,mac,port,type].join('|');if(seen.has(key)){duplicates++;continue;}seen.add(key);rows.push({vlan,mac,port,type,kind,line:index+1,raw:line.trim()});}
 }
 if(skipped)warnings.push(skipped+' MAC-bearing lines could not be mapped; review the capture format.');if(duplicates)warnings.push(duplicates+' repeated records were collapsed.');if(!rows.length)throw Error('No supported MAC table rows found. Import Cisco IOS/NX-OS, Arista EOS or Huawei VRP MAC output.');
 return {rows,warnings,macLines,skipped,duplicates};
}
function organization(mac,db){mac=normalize(mac);if(parseInt(mac.slice(0,2),16)&3)return null;for(const size of [9,7,6])if(db?.[mac.slice(0,size)])return db[mac.slice(0,size)];return null;}
const display=mac=>normalize(mac).match(/.{2}/g)?.join(':')||String(mac);
function groups(sources,db){const result=[];for(const source of sources){const ports=new Map();for(const row of source.rows){if(['Multicast','Virtual gateway','Local/system'].includes(row.kind)||['blackhole'].includes(row.type))continue;if(!ports.has(row.port))ports.set(row.port,[]);ports.get(row.port).push({...row,vendor:organization(row.mac,db)||'Unknown',sourceId:source.id,device:source.device});}for(const [port,rows]of ports)result.push({id:source.id+'|'+port,sourceId:source.id,device:source.device,port,rows,macCount:new Set(rows.map(r=>r.mac)).size,vlans:[...new Set(rows.map(r=>r.vlan).filter(x=>x!==null))].sort((a,b)=>a-b),mode:'Unknown',attachment:'Learned via port; direct attachment not established'});}return result.sort((a,b)=>b.macCount-a.macCount||a.port.localeCompare(b.port,undefined,{numeric:true}));}
const api={parse,textFromRtf,organization,groups,display,normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.PortMappingCore=api;
})(typeof window!=='undefined'?window:globalThis);
