const fs=require('fs'),assert=require('assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
async function test(vendor){
 const devices=['CE-1','CE-2'].map((hostname,i)=>({id:'ce'+i,hostname,tier:'upper',index:i+1,vendor,model:'',serial:''}));
 const source={schema:'network-configurator-report-v1',language:'en',name:'Verification batch',vendor,technology:'BGP',architecture:'module',techPlacement:'upper',upperCount:2,lowerCount:0,roles:{upper:'CE',lower:'Peer'},devices,links:[],specialLinks:[],parameters:[],scope:'',configurations:devices.map(d=>({deviceId:d.id,text:'router bgp 65001',source:'Technology Workspaces'})),source:{module:'BGP'},verificationCommands:vendor==='Huawei_CE_SW'?['display bgp peer','display bgp routing-table']:vendor==='FortiGate'?['get router info bgp summary','get router info bgp network']:['show bgp summary','show ip route bgp']};
 const errors=[],calls=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let mock=false;
 const w=new JSDOM(fs.readFileSync('reporting.html','utf8'),{url:'https://test.invalid/reporting',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
   for(const file of ['engineering-locale.js','vpc-report.js','verification-plan.js'])w.eval(fs.readFileSync(file,'utf8'));
   w.sessionStorage.setItem('networkConfigurator.report.import',JSON.stringify(source));w.HTMLElement.prototype.scrollIntoView=function(){};
   w.fetch=async(url,opts)=>{const p=JSON.parse(opts.body);calls.push({url,p});return {ok:true,json:async()=>url.endsWith('/test')?{ok:true,message:'Connection successful'}:{ok:false,mock,results:p.command.split('\n').map((command,i)=>({command,ok:i===0,output:i===0?'peer Established':'command error',truncated:false}))}};};
 }});
 try{
 const d=w.window.document;d.getElementById('planSelectAll').click();
 assert.equal(d.querySelectorAll('[data-plan-field="output"]').length,4);
 for(const [key,value]of Object.entries({target:'device.example',username:'test-engineer',password:'test-runtime-only'})){const input=d.querySelector('[data-plan-ssh="'+key+'"]');input.value=value;input.dispatchEvent(new w.window.Event('input'));}
 d.getElementById('planTestConnection').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls[0].url,'/api/device/test');
 d.getElementById('planRunCommands').click();await new Promise(r=>setTimeout(r,0));
 assert.equal(calls[1].url,'/api/device/show');assert.equal(calls[1].p.platform,vendor);assert.equal(calls[1].p.command.split('\n').length,2);
 const state=JSON.parse(w.window.sessionStorage.getItem('networkConfigurator.report.current'));
 assert.equal(state.verificationPlan.filter(r=>r.output).length,2,'only target device receives outputs');
 assert.ok(state.verificationPlan.filter(r=>r.hostname==='CE-2').every(r=>r.output===''));
 assert.equal(state.verificationPlan[0].status,'pending');assert.equal(state.verificationPlan[1].status,'review');
 assert.equal(JSON.stringify(state).includes('test-runtime-only'),false,'credentials not persisted');
 assert.equal(d.querySelectorAll('.verification-report tbody tr').length,4);
 const outputs=[...d.querySelectorAll('[data-plan-field="output"]')];outputs[2].value='manual CE-2 output';outputs[2].dispatchEvent(new w.window.Event('input'));
 mock=true;d.getElementById('planRunCommands').click();await new Promise(r=>setTimeout(r,0));assert.ok(d.getElementById('verificationRunStatus').textContent.includes('Mock output'));
 assert.ok(d.querySelector('.verification-report').textContent.includes('manual CE-2 output'));
 d.querySelector('[data-plan-include]').checked=false;d.querySelector('[data-plan-include]').dispatchEvent(new w.window.Event('change'));
 assert.equal(d.querySelectorAll('[data-plan-field="output"]').length,3);assert.equal(d.querySelectorAll('.verification-report tbody tr').length,3);
 assert.deepEqual(errors,[]);
 }finally{w.window.close();}
}
(async()=>{for(const vendor of ['Cisco NX-OS','Cisco IOS-XE','Arista EOS','Huawei_CE_SW','FortiGate'])await test(vendor);console.log('Multi-command editors, per-device live requests, manual output, mock isolation and secret exclusion passed for five platforms');})().catch(e=>{console.error(e);process.exitCode=1;});
