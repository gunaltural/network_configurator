const fs=require('fs'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div id="v3RecentProjects"></div>',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window;
 let design={schema:'network-configurator-v3',project:{id:'design-bgp',name:'BGP project'},workspace:{technology:'BGP',platform:'Cisco NX-OS'},fields:{localPreference:'200'}};
 w.NetworkWorkspaceProject={snapshot:()=>JSON.parse(JSON.stringify(design)),apply:value=>{design=JSON.parse(JSON.stringify(value));},rename:name=>{design.project.name=name;}};
 const records=new Map(),calls=[];let sequence=0,stamp=0;
 w.fetch=async(url,options={})=>{calls.push({url,method:options.method||'GET'});let data;
 if(url==='/auth/status')data={username:'engineer'};
 else if(url==='/api/projects/status')data={available:true};
 else if(options.method==='POST'||options.method==='PUT'){const payload=JSON.parse(options.body),id=options.method==='POST'?'saved-'+(++sequence):url.split('/').at(-1);const record={id,name:payload.document.name,version:1,updated_at:'stamp-'+(++stamp),has_design:true,document:payload.document};records.set(id,record);data=record;}
 else if(url.startsWith('/api/projects?'))data={projects:[...records.values()].reverse(),total:records.size};
 else data=records.get(url.split('/').at(-1));
 return {ok:true,json:async()=>JSON.parse(JSON.stringify(data))};};
 w.eval(fs.readFileSync('project-library.js','utf8'));await new Promise(r=>setTimeout(r,10));
 await w.NetworkProjects.saveCurrent();assert.equal(records.size,1);
 design.fields.localPreference='250';await w.NetworkProjects.saveCurrent();assert.equal(records.size,1);assert.equal(records.get('saved-1').version,1);assert.equal(records.get('saved-1').document.design.fields.localPreference,'250');
 design.project.name='vPC project';design.workspace.technology='VPC';await w.NetworkProjects.saveCurrent();
 assert.equal(records.size,2);assert.equal(records.get('saved-1').name,'BGP project');assert.equal(records.get('saved-1').document.design.workspace.technology,'BGP');assert.equal(records.get('saved-2').name,'vPC project');assert.notEqual(records.get('saved-1').document.design.project.id,records.get('saved-2').document.design.project.id);
 assert.equal(w.document.querySelectorAll('#ncRecentSavedProjects .nc-library-row').length,2);
 const bgp=[...w.document.querySelectorAll('#ncRecentSavedProjects .nc-library-row')].find(row=>row.querySelector('strong').textContent==='BGP project');bgp.querySelector('button').click();await new Promise(r=>setTimeout(r,10));assert.equal(design.workspace.technology,'BGP');assert.equal(design.project.name,'BGP project');
 await w.NetworkProjects.saveCurrent();assert.equal(records.size,2);assert.ok(calls.some(c=>c.url==='/api/projects/saved-1'&&c.method==='PUT'));
 const key='networkConfigurator.library.context',legacy=JSON.parse(w.sessionStorage.getItem(key));delete legacy.name;w.sessionStorage.setItem(key,JSON.stringify(legacy));design.project.name='Separate OSPF project';design.workspace.technology='OSPF';await w.NetworkProjects.saveCurrent();assert.equal(records.size,3);assert.equal(records.get('saved-1').name,'BGP project');
 console.log('Same-name Save updates without revision change; renamed designs remain independent, both appear in Recent Projects, reopening and legacy session handling passed');w.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
