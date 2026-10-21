/* Lossless session-storage encoding. Only this application's keys are encoded;
   callers and exported project documents continue to receive their original text. */
(function(root){'use strict';
const MAGIC='~NC-LZW1~',LIMIT=65535,THRESHOLD=8192;
function pack(text){
 text=String(text);if(text.length<THRESHOLD&&!text.startsWith(MAGIC))return text;
 const dictionary=new Map(),codes=[];let next=256,previous=-1;
 for(let i=0;i<text.length*2;i++){
  const unit=text.charCodeAt(i>>1),byte=i&1?unit>>>8:unit&255;
  if(previous<0){previous=byte;continue;}
  const pair=previous*256+byte,known=dictionary.get(pair);
  if(known!==undefined)previous=known;
  else{codes.push(previous);if(next<LIMIT)dictionary.set(pair,next++);previous=byte;}
 }
 if(previous>=0)codes.push(previous);
 let payload='';for(let i=0;i<codes.length;i+=8192)payload+=String.fromCharCode(...codes.slice(i,i+8192));
 const encoded=MAGIC+text.length+':'+payload;
 return encoded.length<text.length||text.startsWith(MAGIC)?encoded:text;
}
function unpack(value){
 if(value===null||!value.startsWith(MAGIC))return value;
 const split=value.indexOf(':',MAGIC.length),length=Number(value.slice(MAGIC.length,split));
 if(split<0||!Number.isSafeInteger(length)||length<0||length>33554432)throw Error('Invalid workspace storage header.');
 const prefixes=new Uint16Array(LIMIT),suffixes=new Uint8Array(LIMIT),bytes=new Uint8Array(length*2),stack=[];let used=0,next=256,previous=-1;
 function emit(code){stack.length=0;let steps=0;while(code>=256){if(code>=next||++steps>LIMIT)throw Error('Invalid workspace storage code.');stack.push(suffixes[code]);code=prefixes[code];}const first=code;stack.push(code);for(let i=stack.length-1;i>=0;i--){if(used>=bytes.length)throw Error('Invalid workspace storage length.');bytes[used++]=stack[i];}return first;}
 for(let i=split+1;i<value.length;i++){
  const code=value.charCodeAt(i);let first;
  if(code<next)first=emit(code);
  else if(code===next&&previous>=0){first=emit(previous);if(used>=bytes.length)throw Error('Invalid workspace storage length.');bytes[used++]=first;}
  else throw Error('Invalid workspace storage sequence.');
  if(previous>=0&&next<LIMIT){prefixes[next]=previous;suffixes[next]=first;next++;}previous=code;
 }
 if(used!==bytes.length)throw Error('Incomplete workspace storage value.');
 let result='';for(let i=0;i<length;i+=8192){const units=[];for(let j=i;j<Math.min(i+8192,length);j++)units.push(bytes[j*2]|bytes[j*2+1]<<8);result+=String.fromCharCode(...units);}return result;
}
function install(){
 if(root.NetworkWorkspaceStorage)return;
 let storage;try{storage=root.sessionStorage;}catch{return;}
 if(!storage||!root.Storage)return;
 const proto=root.Storage.prototype,get=proto.getItem,set=proto.setItem,cache=new Map();
 const owned=key=>typeof key==='string'&&key.startsWith('networkConfigurator.');
 function compact(){let reclaimed=0;for(const key of Object.keys(storage)){if(!owned(key))continue;const raw=get.call(storage,key);if(!raw||raw.startsWith(MAGIC)||raw.length<THRESHOLD)continue;try{const encoded=pack(raw);if(encoded.length<raw.length){set.call(storage,key,encoded);cache.set(key,{raw:encoded,value:raw});reclaimed+=raw.length-encoded.length;}}catch{/* Keep the original record if compaction cannot complete. */}}return reclaimed;}
 Object.defineProperty(proto,'getItem',{...Object.getOwnPropertyDescriptor(proto,'getItem'),value:function(key){key=String(key);const raw=get.call(this,key);if(this!==storage||!owned(key)||raw===null)return raw;const hit=cache.get(key);if(hit?.raw===raw)return hit.value;const value=unpack(raw);cache.set(key,{raw,value});return value;}});
 Object.defineProperty(proto,'setItem',{...Object.getOwnPropertyDescriptor(proto,'setItem'),value:function(key,value){key=String(key);value=String(value);if(this!==storage||!owned(key))return set.call(this,key,value);const raw=pack(value);try{set.call(this,key,raw);}catch(error){if(error.name!=='QuotaExceededError')throw error;compact();set.call(this,key,raw);}cache.set(key,{raw,value});}});
 compact();root.NetworkWorkspaceStorage={pack,unpack,compact};
}
if(typeof module==='object'&&module.exports)module.exports={pack,unpack,install};else install();
})(typeof window==='undefined'?globalThis:window);
