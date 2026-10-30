(function(root){'use strict';
function parse(raw){
 if(raw.length>2000000)throw Error('Maximum input size is 2 MB.');
 const lines=raw.replace(/\r\n?/g,'\n').split('\n'),blocks=[];let current=null;
 for(let i=0;i<lines.length;i++){
  const line=lines[i],match=line.match(/^(?:(\S+)[#>]\s*)?((?:show|display|get|diagnose)\s+.+?)\s*$/i)||line.match(/^[-=]{3,}\s*((?:show|display|get|diagnose)\s+.+?)\s*[-=]{3,}$/i);
  if(match){const command=match.length===3?match[2]:match[1];current={id:'cli-'+(blocks.length+1),device:match.length===3?(match[1]||'Unidentified'):'Unidentified',command:command.replace(/\s*[-=]+$/,''),line:i+1,lines:[]};blocks.push(current);}
  else if(current)current.lines.push({line:i+1,text:line});
 }
 return blocks.map(b=>({...b,lines:b.lines.filter(x=>x.text.trim()).map(x=>({...x,text:/password|passwd|secret|community|private.?key|api.?key|authorization|sk-[a-zA-Z0-9_-]+/i.test(x.text)?'[REDACTED]':x.text}))}));
}
function evidence(blocks){const result=[];for(const b of blocks){let text='Device: '+b.device+'\nCommand: '+b.command+'\n';for(const line of b.lines){const next='L'+line.line+': '+line.text+'\n';if(text.length+next.length>2900){result.push({id:b.id+'-'+result.length,text});text='Device: '+b.device+'\nCommand: '+b.command+' (continued)\n';}if(next.length>2700)throw Error('A CLI line exceeds the analysis limit.');text+=next;}result.push({id:b.id+'-'+result.length,text});}if(result.length>30||JSON.stringify(result).length>35000)throw Error('Select fewer command blocks for this analysis.');return result;}
root.ShowAnalysis={parse,evidence};
})(typeof window==='undefined'?globalThis:window);
