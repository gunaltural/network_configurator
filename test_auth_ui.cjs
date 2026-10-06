const fs=require('fs'),assert=require('assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
(async()=>{
 const calls=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync('login.html','utf8'),{url:'https://test.invalid/login?next=%2Freporting',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.fetch=async(url,options)=>{calls.push({url,options});return url==='/auth/status'?{json:async()=>({enabled:true,configured:true})}:{ok:false,json:async()=>({detail:'Invalid username or password.'})};};}});
 const w=dom.window,d=w.document;await new Promise(r=>setTimeout(r,10));
 d.getElementById('username').value='synthetic-engineer';d.getElementById('password').value='Synthetic-secret-only';
 d.getElementById('showPassword').click();assert.equal(d.getElementById('password').type,'text');d.getElementById('showPassword').click();assert.equal(d.getElementById('password').type,'password');
 d.getElementById('loginForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await new Promise(r=>setTimeout(r,10));
 assert.equal(calls.at(-1).url,'/auth/login');assert.equal(JSON.parse(calls.at(-1).options.body).next,'/reporting');assert.equal(d.getElementById('password').value,'');assert.equal(d.getElementById('message').textContent,'Invalid username or password.');assert.equal(d.getElementById('signIn').disabled,false);assert.deepEqual(errors,[]);w.close();console.log('Login UI: show/hide, request, return path and failed-login recovery passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
