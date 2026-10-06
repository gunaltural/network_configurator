// Full-page design -> reporting -> database -> fresh-page restore, with synthetic data.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const copy=x=>JSON.parse(JSON.stringify(x)),pause=()=>new Promise(r=>setTimeout(r,80));
function page(file,url,checkpoint){
 let html=fs.readFileSync(file,'utf8');
 if(file==='web.html')html=html.replace(/\}\)\(\);\s*<\/script>\s*<\/body>/,'window.__audit={reportingDesign,combineReports,reportVerificationCommands};})();</script></body>');
 return new JSDOM(html,{url,runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
  for(const f of ['huawei-istack.js','engineering-locale.js','vpc-report.js','verification-plan.js'])w.eval(fs.readFileSync(f,'utf8'));
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=async()=>({ok:true,json:async()=>({platforms:{}})});
  if(checkpoint)w.sessionStorage.setItem('networkConfigurator.workflow.design',JSON.stringify(checkpoint));
 }});
}
(async()=>{
 const pages=[];
 try{
  const main=page('web.html','https://test.invalid/');pages.push(main);await pause();const w=main.window,d=w.document;
  const change=(id,value)=>{d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
  d.getElementById('v3ProjectName').value='Synthetic full project';const reports=[];
  for(const module of ['BASIC','BGP','VPC']){
   d.querySelector('.tech[data-tech="'+module+'"]').click();await pause();change('platform','Cisco NX-OS');await pause();
   if(module==='BGP'){change('bgpCustomerAs','65123');change('bgpCeCount','4');await pause();change('bgpCe4Name','AUDIT-CE-4');}
   if(module==='VPC'){change('d1host','AUDIT-SPINE-1');change('vpcLeafCount','8');await pause();}
   const generated=w.__audit.reportingDesign();generated.verificationCommands=w.__audit.reportVerificationCommands();reports.push({...generated,moduleKey:module,moduleTitle:generated.technology});
  }
  const design=w.NetworkWorkspaceProject.snapshot(),report=w.__audit.combineReports(reports);
  assert.equal(report.source.projectId,design.project.id);
  report.projectDetails={customer:'Synthetic customer',acceptance:'Synthetic acceptance evidence'};
  report.inventoryRevision=2;report.inventoryDeviceIds=['inventory-audit'];report.manualVisibleIds=['inventory-audit'];report.sshVisibleIds=[];
  report.devices.push({id:'inventory-audit',tier:'inventory',inventoryOnly:true,inventoryRecord:true,inventoryChannel:'manual',hostname:'AUDIT-ACTUAL',observedHostname:'AUDIT-ACTUAL',model:'SYNTHETIC-MODEL',serial:'SYNTHETIC-SERIAL',softwareVersion:'TEST-1',modelSource:'manual',serialSource:'manual'});
  const reporting=page('reporting.html','https://test.invalid/reporting',design);pages.push(reporting);await pause();
  reporting.window.NetworkReportProject.apply(copy(report));
  let reportState=reporting.window.NetworkReportProject.snapshot();assert.ok(reportState.verificationPlan.length);
  Object.assign(reportState.verificationPlan[0],{included:true,status:'pass',output:'SYNTHETIC CLI EVIDENCE',engineer:'Audit engineer'});
  reporting.window.NetworkReportProject.apply(reportState);
  reporting.window.fetch=async(url)=>({ok:true,json:async()=>url==='/auth/status'?{username:'engineer'}:{available:true}});
  reporting.window.eval(fs.readFileSync('project-library.js','utf8'));await pause();
  const bundle=reporting.window.NetworkProjects.collect();assert.ok(bundle.design&&bundle.reporting);
  const restored=JSON.parse(execFileSync('python3',['-c',
   'import sys,json,tempfile;from pathlib import Path;from project_store import ProjectRepository;from test_project_store import Connection;doc=json.load(sys.stdin)\nwith tempfile.TemporaryDirectory() as directory:\n repo=ProjectRepository(connect_factory=lambda:Connection(str(Path(directory)/"projects.db")));record=repo.save("engineer",doc);print(json.dumps(repo.get("engineer",record["id"])["document"]))'
  ],{input:JSON.stringify(bundle),encoding:'utf8'}));
  const freshMain=page('web.html','https://test.invalid/');pages.push(freshMain);await pause();freshMain.window.NetworkWorkspaceProject.apply(copy(restored.design));await pause();
  assert.equal(freshMain.window.document.getElementById('d1host').value,'AUDIT-SPINE-1');assert.equal(freshMain.window.document.getElementById('vpcLeafCount').value,'8');
  assert.equal(freshMain.window.NetworkWorkspaceProject.snapshot().project.id,design.project.id);
  freshMain.window.document.querySelector('.tech[data-tech="BGP"]').click();await pause();
  assert.equal(freshMain.window.document.getElementById('bgpCustomerAs').value,'65123');assert.equal(freshMain.window.document.getElementById('bgpCe4Name').value,'AUDIT-CE-4');
  const freshReport=page('reporting.html','https://test.invalid/reporting');pages.push(freshReport);await pause();freshReport.window.NetworkReportProject.apply(copy(restored.reporting));
  const reopened=freshReport.window.NetworkReportProject.snapshot();
  assert.equal(reopened.projectDetails.customer,'Synthetic customer');assert.equal(reopened.devices.find(x=>x.id==='inventory-audit').serial,'SYNTHETIC-SERIAL');
  assert.deepEqual(copy(reopened.configurations),copy(reportState.configurations));assert.deepEqual(copy(reopened.links),copy(reportState.links));
  assert.equal(reopened.verificationPlan.find(x=>x.included).output,'SYNTHETIC CLI EVIDENCE');
  assert.ok(freshReport.window.document.getElementById('reportPreview').textContent.includes('SYNTHETIC-SERIAL'));
  assert.deepEqual(errors,[]);console.log('Full project roundtrip: three-module design, dynamic parameters, inventory, configurations, links, project brief and manual CLI evidence survive database storage and fresh-page restore');
 }finally{pages.forEach(p=>p.window.close());}
})().catch(e=>{console.error(e);process.exitCode=1;});
