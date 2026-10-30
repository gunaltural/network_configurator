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
root.NetworkAIEvidence={build};
})(typeof window==='undefined'?globalThis:window);
