/* Curated immutable project evidence. Never send raw configuration or CLI. */
(function(root){
'use strict';
const secret=/password|passwd|secret|community|credential|token|private.?key|api.?key|authorization/i;
function safe(value){
 if(Array.isArray(value))return value.map(safe);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!secret.test(key)).map(([key,v])=>[key,safe(v)]));
 return typeof value==='string'?value.split('\n').map(line=>secret.test(line)||/sk-[a-zA-Z0-9_-]+/.test(line)?'[REDACTED]':line).join('\n'):value;
}
function build(report){
 const module=report?.source?.module,vendor=report?.vendor;
 if(!module||module==='COMBINED'||!vendor)throw Error('Open an individual module design or report first.');
 const evidence=[];
 function add(id,value){const text=JSON.stringify(safe(value));if(text.length>3000)throw Error('A selected evidence item exceeds the AI limit.');evidence.push({id,text});}
 for(const [i,d]of(report.devices||[]).entries())add('device-'+i,{id:d.id,hostname:d.hostname,vendor:d.vendor,role:d.tier});
 for(const [i,l]of(report.links||[]).entries())add('link-'+i,{a:l.a,b:l.b,enabled:l.enabled,upperPort:l.upperPort,lowerPort:l.lowerPort,speed:l.speed});
 for(const [i,l]of(report.specialLinks||[]).entries())add('control-link-'+i,{kind:l.kind,a:l.a,b:l.b,aPort:l.aPort,bPort:l.bPort,logical:l.logical});
 for(const [i,p]of(report.parameters||[]).entries())if(!secret.test(p.label||''))add('parameter-'+i,{label:p.label,value:p.value,impact:p.impact});
 for(const [i,s]of(report.simulationScenarios||[]).entries())if(s.module===module&&s.vendor===vendor)add('scenario-'+i,{name:s.scenarioName,names:s.scenarioNames,failedDevices:s.failedDevices,failedLinks:s.failedLinks,baselinePath:s.baselinePath,currentPath:s.currentPath,summary:s.assessment?.[report.language==='tr'?'tr':'en']?.summary});
 if(!evidence.length)throw Error('No usable evidence in this module.');
 if(evidence.length>30||JSON.stringify(evidence).length>35000)throw Error('Project evidence exceeds the initial AI limit; nothing was sent.');
 return {module,vendor,evidence};
}

const sensitiveConfigLine=/(?:password|passwd|secret|snmp[-\s]?server\s+community|snmp\s+community|community-string|private.?key|api.?key|authorization|sk-[a-zA-Z0-9_-]+)/i;
function cleanLine(line){
 return sensitiveConfigLine.test(String(line))?'[REDACTED]':String(line);
}
function designHandoff(report,validation){
 if(!report||!Array.isArray(report.devices)||!report.devices.length)throw Error('Open an individual Design with devices.');
 if(!report.source?.module||report.source.module==='COMBINED')throw Error('Select an individual module Design.');
 const clean=s=>String(s??'').slice(0,300);
 const safeConfig=text=>String(text??'').replace(/\r\n?/g,'\n').split('\n').map(cleanLine).join('\n');
 const subset={
  vendor:clean(report.vendor),
  source:{module:clean(report.source.module)},
  devices:report.devices.map(d=>({id:clean(d.id),hostname:clean(d.hostname),vendor:clean(d.vendor||report.vendor),tier:clean(d.tier),role:clean(d.role),inventoryOnly:d.inventoryOnly===true})),
  links:(report.links||[]).map(l=>({id:clean(l.id),a:clean(l.a),b:clean(l.b),upperPort:clean(l.upperPort),lowerPort:clean(l.lowerPort),aPort:clean(l.aPort),bPort:clean(l.bPort),kind:clean(l.kind),logical:l.logical===true,enabled:l.enabled!==false})),
  specialLinks:(report.specialLinks||[]).map(l=>({id:clean(l.id),a:clean(l.a),b:clean(l.b),aPort:clean(l.aPort),bPort:clean(l.bPort),kind:clean(l.kind),logical:l.logical===true,enabled:l.enabled!==false})),
  parameters:(report.parameters||[]).map(p=>({label:clean(p.label),value:safeConfig(p.value).slice(0,1500),impact:safeConfig(p.impact).slice(0,1500)}))
   .filter(p=>!sensitiveConfigLine.test(p.label)).slice(0,120),
  configurations:(report.configurations||[]).filter(c=>c&&typeof c.text==='string').map(c=>({
    deviceId:clean(c.deviceId),text:safeConfig(c.text),source:'generated-design-configuration'
  })),
  designChecks:validation&&typeof validation==='object'?{
    source:'existing-design-checks',evaluated:Number(validation.evaluated)||0,
    errors:Number(validation.errors)||0,warnings:Number(validation.warnings)||0,
    issues:(validation.issues||[]).slice(0,50).map(i=>({
      severity:i.severity==='error'?'error':'warning',
      code:clean(i.code),fields:(i.fields||[]).map(clean),
      message:safeConfig(i.message).slice(0,500)
    }))
  }:null
 };
 if(subset.configurations.some(c=>c.text.length>150000))throw Error('Generated configuration exceeds 150 KB per device; use CLI Analysis or import smaller configurations.');
 if(JSON.stringify(subset).length>400000)throw Error('Design is too large for a secure one-time handoff. Review a smaller module.');
 return subset;
}

root.NetworkAIEvidence={build,designHandoff};
})(typeof window==='undefined'?globalThis:window);
