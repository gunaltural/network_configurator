const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div class="v3-topbar"></div><section data-nc-group="projects"><div></div></section>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;
 const design={schema:'network-configurator-v3',project:{id:'p_lab',name:'Synthetic lab'},workspace:{platform:'Cisco NX-OS',technology:'VPC'},fields:{sshPassword:'synthetic-only'}};
 const report={schema:'network-configurator-report-v1',name:'Synthetic lab',source:{projectId:'p_lab'},devices:[{id:'lab1',hostname:'LAB-1'}],inventoryDeviceIds:['lab1']};
 w.NetworkWorkspaceProject={snapshot:()=>JSON.parse(JSON.stringify(design)),apply:d=>{w.applied=d;}};
 w.sessionStorage.setItem('networkConfigurator.report.current',JSON.stringify(report));
 let saved,requests=[];
 w.fetch=async(url,options={})=>{requests.push({url,options});let data;if(url==='/auth/status')data={username:'engineer'};else if(url==='/api/projects/status')data={available:true,configured:true};else if(options.method==='POST'||options.method==='PUT'){saved=JSON.parse(options.body);data={id:'123',version:options.method==='PUT'?2:1,name:saved.document.name};}else data={projects:[],total:0};return {ok:true,json:async()=>data};};
 w.eval(fs.readFileSync('project-library.js','utf8'));await new Promise(r=>setTimeout(r,15));
 assert.equal(w.NetworkProjects.available,true);w.NetworkProjects.show();await new Promise(r=>setTimeout(r,15));
 w.document.querySelector('#ncLibraryName').value='Saved synthetic lab';await w.NetworkProjects.save();
 assert.equal(saved.document.name,'Saved synthetic lab');assert.equal(saved.document.reporting.name,'Saved synthetic lab');assert.equal(saved.document.design.fields.sshPassword,undefined);assert.equal(saved.document.reporting.inventoryDeviceIds[0],'lab1');
 await w.NetworkProjects.save();assert.equal(requests.at(-2)?.options.method==='PUT'||requests.some(r=>r.options.method==='PUT'),true);
 const current=w.sessionStorage.getItem('networkConfigurator.library.context');assert.throws(()=>w.NetworkProjects.openFile({schema:'bad'}));assert.equal(w.sessionStorage.getItem('networkConfigurator.library.context'),current);
 w.NetworkProjects.openFile(saved.document);assert.equal(w.sessionStorage.getItem('networkConfigurator.library.context'),null);assert.equal(w.applied.project.name,'Saved synthetic lab');assert.notEqual(w.applied.project.id,'p_lab');
 assert.equal(JSON.parse(w.sessionStorage.getItem('networkConfigurator.report.current')).source.projectId,w.applied.project.id);
 console.log('Project Library: bundle, credential exclusion, create/update and working-copy restore passed');dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
