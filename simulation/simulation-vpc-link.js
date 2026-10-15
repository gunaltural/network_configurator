(function(){'use strict';
const ID='vpcMlagSimLaunch';
function sync(){
 const api=window.NetworkWorkspaceProject;
 const scope=typeof api?.diagnosticScope==='function'?api.diagnosticScope():null;
 const host=document.getElementById('topologyControls')||document.getElementById('topologyArea');
 if(!host)return;
 let button=document.getElementById(ID);
 if(scope?.module!=='VPC'||/iStack/i.test(scope?.platform||'')){if(button)button.remove();return;}
 if(!button){button=document.createElement('button');button.id=ID;button.type='button';button.textContent='Test vPC / MLAG Failures →';
 button.style.cssText='margin:9px;padding:10px 14px;border:1px solid #3898c8;border-radius:10px;background:#163a51;color:#e1f5ff;font-weight:700;cursor:pointer';
 host.append(button);}
 button.onclick=()=>{
 const vendor=scope.platform||'Cisco NX-OS';
 const mapped=/Arista/i.test(vendor)?'Arista EOS':/Huawei.*CE|CloudEngine/i.test(vendor)?'Huawei CloudEngine':/StackWise|IOS-XE/i.test(vendor)?'Cisco_StackWise':'Cisco NX-OS';
 sessionStorage.setItem('networkConfigurator.mlagSimulation.vendor',mapped);
 try{
   const report=typeof api.diagnosticDesign==='function'?api.diagnosticDesign():null;
   if(report?.source?.module==='VPC'&&Array.isArray(report.devices)){
     sessionStorage.setItem('networkConfigurator.mlagSimulation.design',JSON.stringify({
       name:String(report.name||'').slice(0,100),vendor:mapped,technology:report.technology,
       devices:report.devices.map(({id,hostname,tier})=>({id,hostname,tier})),
       links:(report.links||[]).map(({id,a,b,upperPort,lowerPort,detail})=>({id,a,b,upperPort,lowerPort,detail})),
       specialLinks:(report.specialLinks||[]).map(({kind,a,b,aPort,bPort,detail})=>({kind,a,b,aPort,bPort,detail}))
     }));
   }else sessionStorage.removeItem('networkConfigurator.mlagSimulation.design');
 }catch(error){sessionStorage.removeItem('networkConfigurator.mlagSimulation.design');}
 location.assign('/vpc-mlag-simulation');
 };
}
// Existing workspace render rebuilds controls; do not mutate original render functions.
document.addEventListener('click',e=>{if(e.target.closest?.('[data-tech],.tech,#v3Dashboard'))queueMicrotask(sync);});
document.addEventListener('change',()=>queueMicrotask(sync));
setInterval(sync,1200);
sync();
})();