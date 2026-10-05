(function(){
 'use strict';
 const reporting=!!document.getElementById('reportLanguage');
 const icons={
 home:'<path d="M3 10 12 3l9 7v10H4V10"/><path d="M9 20v-7h6v7"/>',
 network:'<rect x="8" y="2" width="8" height="6" rx="1"/><rect x="2" y="16" width="7" height="6" rx="1"/><rect x="15" y="16" width="7" height="6" rx="1"/><path d="M12 8v5M5 16v-3h14v3"/>',
 report:'<path d="M6 2h9l4 4v16H6zM14 2v5h5M9 12h7M9 16h7"/>',
 inventory:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18M3 9h18M3 15h18"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
 lifecycle:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 upgrade:'<path d="m7 10 5-5 5 5M12 5v12M4 17v4h16v-4"/>'
 };
 const svg=key=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[key]+'</svg>';
 const modules=[['BASIC','System and Management'],['BGP','BGP'],['OSPF','OSPF'],['STP','STP'],['VPC','vPC / MLAG'],['EVPN','EVPN / VXLAN'],['SDWAN','SD-WAN'],['QOS','QoS']];
 const maintenance=[['inventory','Inventory','inventory'],['design','Design Guide and Reporting','report'],['lifecycle','Lifecycle and Software','lifecycle'],['upgrade','Upgrade Planning','upgrade']];
 const sidebar=document.createElement('aside');sidebar.className='nc-sidebar';sidebar.id='ncSidebar';
 sidebar.innerHTML='<a class="nc-brand" href="/"><span class="nc-brand-mark">NC</span><span>Network<br>Configurator<small>Engineering workspace</small></span></a><nav class="nc-menu" aria-label="Main navigation"><a href="/" class="nc-nav-item" data-nc-home>'+svg('home')+'<span>Dashboard</span></a><div class="nc-menu-label">Technology Workspaces</div>'+modules.map(([key,label])=>'<a class="nc-nav-item" href="/?workspace='+key+'" data-nc-module="'+key+'">'+svg(key==='BASIC'?'settings':'network')+'<span>'+label+'</span></a>').join('')+'<div class="nc-menu-label">Documentation &amp; operations</div><a href="/reporting" class="nc-nav-item" data-nc-maintenance>'+svg('report')+'<span>Maintenance and Reporting</span></a>'+(reporting?maintenance.map(([key,label,icon])=>'<button type="button" class="nc-nav-item nc-nav-sub" data-nc-view="'+key+'">'+svg(icon)+'<span>'+label+'</span></button>').join(''):'')+'</nav><div class="nc-sidebar-foot">Network Configurator<br>Design · Configure · Verify · Report</div>';
 document.body.prepend(sidebar);
 const header=document.querySelector(reporting?'.shell>.nav':'.v3-topbar');
 if(header){
   const toggle=document.createElement('button');toggle.type='button';toggle.className='nc-menu-toggle';toggle.setAttribute('aria-label','Toggle navigation');toggle.setAttribute('aria-controls','ncSidebar');toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';header.prepend(toggle);
   const metadata=document.createElement('div');metadata.className='nc-header-meta';const date=document.createElement('time');date.dateTime=new Date().toISOString().slice(0,10);date.textContent=new Intl.DateTimeFormat('en-GB').format(new Date()).replaceAll('/','.');metadata.append(date);
   const avatar=document.createElement('span');avatar.className='nc-avatar';avatar.textContent='NC';const caption=document.createElement('span');caption.className='nc-app-caption';caption.textContent='Network Engineering';metadata.append(avatar,caption);header.append(metadata);
   const small=()=>window.innerWidth<=800;
   const updateToggle=()=>toggle.setAttribute('aria-expanded',String(small()?document.body.classList.contains('nc-menu-open'):!document.body.classList.contains('nc-menu-collapsed')));
   toggle.onclick=()=>{document.body.classList.toggle(small()?'nc-menu-open':'nc-menu-collapsed');updateToggle();};
   window.addEventListener('resize',updateToggle);updateToggle();
   document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.classList.remove('nc-menu-open');updateToggle();}});
   document.addEventListener('click',e=>{if(small()&&document.body.classList.contains('nc-menu-open')&&!sidebar.contains(e.target)&&!toggle.contains(e.target)){document.body.classList.remove('nc-menu-open');updateToggle();}});
 }
 const dashboard=document.getElementById('v3Dashboard');
 if(dashboard){const heading=document.createElement('div');heading.className='nc-dashboard-heading';heading.innerHTML='<h1>Dashboard</h1><p>Network design, device configuration and project documentation.</p>';dashboard.prepend(heading);}
 function openModule(key){
   if(reporting)return;
   const index=modules.findIndex(([id])=>id===key),card=document.querySelectorAll('#v3TechGrid>.v3-card')[index];if(card)card.click();
   document.body.classList.remove('nc-menu-open');sync();
 }
 sidebar.querySelectorAll('[data-nc-module]').forEach(link=>link.onclick=e=>{if(!reporting){e.preventDefault();openModule(link.dataset.ncModule);}});
 const home=sidebar.querySelector('[data-nc-home]');
 if(!reporting)home.onclick=e=>{e.preventDefault();document.getElementById('v3DashboardBtn').click();document.body.classList.remove('nc-menu-open');sync();};
 sidebar.querySelectorAll('[data-nc-view]').forEach(button=>button.onclick=()=>{document.querySelector('[data-view="'+button.dataset.ncView+'"]').click();document.body.classList.remove('nc-menu-open');sync();});
 function sync(){
   const onDashboard=!!dashboard?.classList.contains('show'),activeModule=document.querySelector('.tech.active')?.dataset.tech;
   const view=document.querySelector('.maintenance-tabs [aria-selected="true"]')?.dataset.view;
   sidebar.querySelectorAll('.nc-nav-item').forEach(item=>{
     const active=item.hasAttribute('data-nc-home')?onDashboard:item.hasAttribute('data-nc-module')?!reporting&&!onDashboard&&item.dataset.ncModule===activeModule:item.hasAttribute('data-nc-view')?reporting&&item.dataset.ncView===view:reporting;
     if(active&&item.getAttribute('aria-current')!=='page')item.setAttribute('aria-current','page');else if(!active&&item.hasAttribute('aria-current'))item.removeAttribute('aria-current');
   });
 }
 const observer=new MutationObserver(sync);
 if(dashboard)observer.observe(dashboard,{attributes:true,attributeFilter:['class']});
 document.querySelectorAll('.tech').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class']}));
 document.querySelectorAll('.maintenance-tabs [data-view]').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['aria-selected']}));
 sync();
 if(!reporting){const requested=new URLSearchParams(location.search).get('workspace');if(modules.some(([key])=>key===requested))openModule(requested);}
})();
