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
 const item=(label,icon,attrs='',href='#')=>'<a class="nc-nav-item nc-nav-sub" href="'+href+'" '+attrs+'>'+svg(icon)+'<span>'+label+'</span></a>';
 const planned=label=>'<button type="button" class="nc-nav-item nc-nav-sub nc-planned" disabled><span>'+label+'</span><small>Planned</small></button>';
 const group=(label,icon,key,content)=>'<details class="nc-nav-group" data-nc-group="'+key+'"><summary>'+svg(icon)+'<span>'+label+'</span><span class="nc-chevron">›</span></summary><div>'+content+'</div></details>';
 const viewItem=(key,label,icon)=>item(label,icon,'data-nc-view="'+key+'"','/reporting?view='+key);
 const tabItem=(key,label,icon)=>item(label,icon,'data-nc-tab="'+key+'"','/?workspace=BASIC&tab='+key);
 sidebar.innerHTML='<a class="nc-brand" href="/"><span class="nc-brand-mark">NC</span><span>Network<br>Configurator<small>Engineering workspace</small></span></a><nav class="nc-menu" aria-label="Main navigation"><a href="/" class="nc-nav-item" data-nc-home>'+svg('home')+'<span>Dashboard</span></a>'
 +group('Network Design','network','design','<div class="nc-menu-label">Technology Workspaces</div>'+modules.map(([key,label])=>item(label,key==='BASIC'?'settings':'network','data-nc-module="'+key+'"','/?workspace='+key)).join('')+planned('Topology Library'))
 +group('Inventory','inventory','inventory',viewItem('inventory','Device Inventory','inventory')+item('SSH Collection','network','data-nc-collection="automatic"','/reporting?view=inventory&collection=automatic')+item('Manual / Excel Import','inventory','data-nc-collection="manual"','/reporting?view=inventory&collection=manual')+planned('Network Discovery'))
 +group('Configuration','settings','configuration',tabItem('config','Device Configuration','settings')+tabItem('deploy','Deploy Configuration','upgrade')+planned('Configuration Backups')+planned('Configuration Comparison'))
 +group('Verification','lifecycle','verification',tabItem('verify','Verification Workspace','lifecycle')+item('CLI Evidence','report','data-nc-evidence','/reporting?view=design')+planned('Acceptance Tests'))
 +group('Troubleshooting','settings','troubleshooting',tabItem('trouble','Troubleshooting Workspace','settings')+planned('Diagnostic History'))
 +group('Reports','report','reports',viewItem('design','Design Guide and Reporting','report')+tabItem('notes','Design Notes','report')+planned('Report Archive'))
 +group('Maintenance','upgrade','maintenance',viewItem('lifecycle','Lifecycle and Software','lifecycle')+viewItem('upgrade','Upgrade Planning','upgrade'))
 +group('Automations','lifecycle','automation',planned('Scheduled Jobs')+planned('Network Workflows'))
 +group('Projects','inventory','projects',item('Recent Projects','inventory','data-nc-projects','/')+planned('Customers and Sites'))
 +group('Administration','settings','administration',planned('Application Settings')+planned('Users and Roles'))
 +'</nav><div class="nc-sidebar-foot">Network Configurator<br>Design · Configure · Verify · Report</div>';
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
 if(dashboard){
   const heading=document.createElement('div');heading.className='nc-dashboard-heading';heading.innerHTML='<h1>Dashboard</h1><p>Network engineering · design, configuration and project documentation.</p>';dashboard.prepend(heading);
   const overview=document.createElement('section');overview.className='nc-dashboard-overview';overview.innerHTML='<div class="nc-overview-card"><div class="nc-card-heading"><h2>Project overview</h2><span class="nc-overview-tag" id="ncProjectTag">Design</span></div><p class="nc-overview-description" id="ncProjectDescription"></p><div id="ncProjectMetrics"></div></div><div class="nc-overview-card"><h2>Engineering workflow</h2><p class="nc-overview-description">Move from network design to documented delivery.</p><button class="nc-workflow-row" type="button" data-nc-design-start><span class="nc-step">01</span><span><strong>Network Design</strong><small>Build topology and generate vendor-specific configuration.</small></span><span>›</span></button><a class="nc-workflow-row" href="/reporting?view=inventory"><span class="nc-step">02</span><span><strong>Device Inventory</strong><small>Import device records or collect them over SSH.</small></span><span>›</span></a><a class="nc-workflow-row" href="/reporting?view=design"><span class="nc-step">03</span><span><strong>Design and Reporting</strong><small>Record design decisions and selected CLI evidence.</small></span><span>›</span></a><a class="nc-workflow-row" href="/reporting?view=upgrade"><span class="nc-step">04</span><span><strong>Maintenance Planning</strong><small>Review lifecycle, software and upgrade requirements.</small></span><span>›</span></a></div>';
   heading.after(overview);
   const stats=document.createElement('section');stats.className='nc-dashboard-stats';stats.innerHTML=[['saved','Saved projects'],['topology','Topology devices'],['inventory','Inventory records'],['checks','Selected verification commands']].map(([key,label])=>'<div class="nc-overview-card"><span>'+label+'</span><b data-nc-stat="'+key+'">0</b></div>').join('');overview.after(stats);
   dashboard.querySelector('[data-nc-design-start]').onclick=()=>{sidebar.querySelector('[data-nc-group="design"]').open=true;document.getElementById('v3TechGrid').scrollIntoView({behavior:'smooth',block:'start'});};
 }
 function updateDashboard(){
   if(!dashboard)return;
   const read=(storage,key)=>{try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}};
   const project=read(sessionStorage,'networkConfigurator.report.current');
   const saved=read(localStorage,'networkConfigurator.v3.projects')||{};
   const devices=Array.isArray(project?.devices)?project.devices:[],configs=Array.isArray(project?.configurations)?project.configurations:[];
   const inventoryIds=new Set(project?.inventoryDeviceIds||[]);
   const counts={saved:Object.keys(saved).length,topology:devices.filter(d=>!d.inventoryOnly).length,inventory:devices.filter(d=>inventoryIds.has(d.id)).length,checks:(project?.verificationPlan||[]).filter(r=>r.included).length};
   Object.entries(counts).forEach(([key,value])=>dashboard.querySelector('[data-nc-stat="'+key+'"]').textContent=String(value));
   document.getElementById('ncProjectDescription').textContent=project?(project.name||'Latest design')+' · latest report project in this browser':'Choose a technology workspace to start a project.';
   document.getElementById('ncProjectTag').textContent=project?'Project':'Get started';
   const metrics=document.getElementById('ncProjectMetrics');metrics.replaceChildren();
   const rows=project?[['Technology scope',project.technology||'Design'],['Device configurations',configs.length],['Planned connections',(project.links||[]).filter(l=>l.enabled).length],['Inventory records',counts.inventory],['Selected CLI records',counts.checks]]:[['Technology workspaces',modules.length],['Vendor platforms',5],['Configuration','Per device'],['Documentation','English / Turkish']];
   for(const [label,value]of rows){const row=document.createElement('div');row.className='nc-project-metric';const key=document.createElement('span');key.textContent=label;const val=document.createElement('strong');val.textContent=String(value);row.append(key,val);metrics.append(row);}
 }
 function openModule(key){
   if(reporting)return;
   const index=modules.findIndex(([id])=>id===key),card=document.querySelectorAll('#v3TechGrid>.v3-card')[index];if(card)card.click();
   document.body.classList.remove('nc-menu-open');sync();
 }
 sidebar.querySelectorAll('[data-nc-module]').forEach(link=>link.onclick=e=>{if(!reporting){e.preventDefault();openModule(link.dataset.ncModule);}});
 const home=sidebar.querySelector('[data-nc-home]');
 if(!reporting)home.onclick=e=>{e.preventDefault();document.getElementById('v3DashboardBtn').click();document.body.classList.remove('nc-menu-open');sync();};
 function openView(key){
   const button=document.querySelector('[data-view="'+key+'"]');if(button)button.click();document.body.classList.remove('nc-menu-open');sync();
 }
 sidebar.querySelectorAll('[data-nc-view]').forEach(link=>link.onclick=e=>{if(reporting){e.preventDefault();openView(link.dataset.ncView);}});
 sidebar.querySelectorAll('[data-nc-collection]').forEach(link=>link.onclick=e=>{
   if(!reporting)return;e.preventDefault();openView('inventory');const field=document.getElementById('inventoryMode');field.value=link.dataset.ncCollection;field.dispatchEvent(new Event('change',{bubbles:true}));
 });
 sidebar.querySelectorAll('[data-nc-tab]').forEach(link=>link.onclick=e=>{
   if(reporting)return;e.preventDefault();const key=document.querySelector('.tech.active')?.dataset.tech||'BASIC';openModule(key);document.querySelector('.tab[data-tab="'+link.dataset.ncTab+'"]')?.click();sync();
 });
 sidebar.querySelector('[data-nc-evidence]').onclick=e=>{if(reporting){e.preventDefault();openView('design');document.getElementById('verificationPanel')?.scrollIntoView({behavior:'smooth',block:'start'});}};
 sidebar.querySelector('[data-nc-projects]').onclick=e=>{if(!reporting){e.preventDefault();home.click();document.getElementById('v3RecentProjects').scrollIntoView({behavior:'smooth',block:'center'});}};
 function sync(){
   const onDashboard=!!dashboard?.classList.contains('show'),activeModule=document.querySelector('.tech.active')?.dataset.tech;
   const view=document.querySelector('.maintenance-tabs [aria-selected="true"]')?.dataset.view;
   const tab=document.querySelector('.tab.active')?.dataset.tab;
   sidebar.querySelectorAll('.nc-nav-item').forEach(item=>{
     const active=item.hasAttribute('data-nc-home')?onDashboard:item.hasAttribute('data-nc-module')?!reporting&&!onDashboard&&item.dataset.ncModule===activeModule:item.hasAttribute('data-nc-view')?reporting&&item.dataset.ncView===view:item.hasAttribute('data-nc-tab')?!reporting&&!onDashboard&&item.dataset.ncTab===tab:false;
     if(active&&item.getAttribute('aria-current')!=='page')item.setAttribute('aria-current','page');else if(!active&&item.hasAttribute('aria-current'))item.removeAttribute('aria-current');
   });
   sidebar.querySelectorAll('.nc-nav-group').forEach(group=>{
     const active=!!group.querySelector('[aria-current="page"]');group.classList.toggle('nc-group-active',active);if(active)group.open=true;
   });
   if(onDashboard)updateDashboard();
 }
 const observer=new MutationObserver(sync);
 if(dashboard)observer.observe(dashboard,{attributes:true,attributeFilter:['class']});
 document.querySelectorAll('.tab').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class']}));
 document.querySelectorAll('.tech').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class']}));
 document.querySelectorAll('.maintenance-tabs [data-view]').forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['aria-selected']}));
 sync();
 const params=new URLSearchParams(location.search);
 if(reporting&&maintenance.some(([key])=>key===params.get('view'))){
   openView(params.get('view'));const collection=params.get('collection');
   if(['manual','automatic'].includes(collection)){const field=document.getElementById('inventoryMode');field.value=collection;field.dispatchEvent(new Event('change',{bubbles:true}));}
 }
 if(!reporting){const requested=new URLSearchParams(location.search).get('workspace');if(modules.some(([key])=>key===requested))openModule(requested);const tab=params.get('tab');if(['config','deploy','verify','trouble','notes'].includes(tab)){if(!requested)openModule('BASIC');document.querySelector('.tab[data-tab="'+tab+'"]')?.click();}}
})();
