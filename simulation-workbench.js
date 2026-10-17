(function(){'use strict';
const $=id=>document.getElementById(id),workspace=$('labWorkspace'),viewport=$('wbViewport'),camera=$('wbCamera'),inspector=$('labControlPane');
let zoom=1,x=0,y=0,active='',drag=null,signature='';
const names={failures:'Failures',policies:'Traffic policies',results:'Results & reports'};
function bounds(){const r=viewport.getBoundingClientRect();return {width:r.width||940,height:r.height||600};}
function apply(){camera.style.transform=`translate(${x}px, ${y}px) scale(${zoom})`;$('wbZoomValue').value=Math.round(zoom*100)+'%';}
function fit(){const b=bounds(),box=$('labMap').getAttribute('viewBox').split(/\s+/).map(Number),height=940*box[3]/box[2],width=Math.max(240,b.width-(active&&b.width>950?378:0));zoom=Math.max(.2,Math.min(1,(width-48)/940,(b.height-180)/height));x=(width-940*zoom)/2;y=48+Math.max(0,(b.height-180-height*zoom)/2);apply();}
function changeZoom(next,cx=bounds().width/2,cy=bounds().height/2){next=Math.min(2.5,Math.max(.2,next));x=cx-(cx-x)*next/zoom;y=cy-(cy-y)*next/zoom;zoom=next;apply();}
function panel(name){active=name||'';inspector.hidden=!active;workspace.classList.toggle('inspector-open',!!active);for(const tab of document.querySelectorAll('[data-workbench-tab]')){const selected=tab.dataset.workbenchTab===active;tab.setAttribute('aria-selected',String(selected));$(tab.getAttribute('aria-controls')).hidden=!selected;}if(active){$('wbInspectorTitle').textContent=names[active];$('wbInspectorBody').scrollTop=0;}fit();}
for(const tab of document.querySelectorAll('[data-workbench-tab]'))tab.onclick=()=>panel(active===tab.dataset.workbenchTab?'':tab.dataset.workbenchTab);
$('wbCloseInspector').onclick=()=>{const previous=active;panel('');document.querySelector(`[data-workbench-tab="${previous}"]`)?.focus();};
$('wbZoomOut').onclick=()=>changeZoom(zoom/1.2);$('wbZoomIn').onclick=()=>changeZoom(zoom*1.2);$('wbFit').onclick=fit;$('wbActualSize').onclick=()=>changeZoom(1);
$('wbFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(workspace.requestFullscreen)await workspace.requestFullscreen();else $('syntheticStatus').textContent='Full screen is unavailable in this browser. Use the browser full-screen control.';}catch(e){$('syntheticStatus').textContent='Full screen unavailable: '+e.message;}};
viewport.tabIndex=0;
viewport.addEventListener('wheel',event=>{event.preventDefault();const r=viewport.getBoundingClientRect();changeZoom(zoom*Math.exp(-event.deltaY*.0015),event.clientX-r.left,event.clientY-r.top);},{passive:false});
const selectable=target=>target.closest?.('[data-bgp-device],[data-device],[data-bgp-connection],[data-bgp-interconnect],[data-lab-link],[data-lab-links]');
viewport.addEventListener('pointerdown',event=>{if(event.button!==0||selectable(event.target))return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,originX:x,originY:y};viewport.setPointerCapture?.(event.pointerId);viewport.classList.add('is-panning');});
viewport.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;x=drag.originX+event.clientX-drag.x;y=drag.originY+event.clientY-drag.y;apply();});
function stop(){drag=null;viewport.classList.remove('is-panning');}viewport.addEventListener('pointerup',stop);viewport.addEventListener('pointercancel',stop);
viewport.addEventListener('click',event=>{
 const node=selectable(event.target);if(!node)return;
 const device=node.dataset.bgpDevice||node.dataset.device;
 const link=node.dataset.bgpConnection?'wan'+node.dataset.bgpConnection:node.hasAttribute('data-bgp-interconnect')?'interconnect':node.dataset.labLink;
 let values=device?[device]:link?[link]:[];
 if(!device&&node.dataset.labLinks){try{const ids=JSON.parse(node.dataset.labLinks);if(Array.isArray(ids))values=ids.filter(id=>typeof id==='string');}catch{return;}}
 const select=$(device?'syntheticNode':'syntheticLink'),available=new Set([...select.options].map(o=>o.value));values=values.filter(id=>available.has(id));if(!values.length)return;
 panel('failures');for(const option of select.options)option.selected=values.includes(option.value);
 select.dispatchEvent(new Event('change'));$(device?'nodeFault':'linkFault').scrollIntoView?.({block:'nearest'});
});
viewport.addEventListener('keydown',event=>{if(event.target!==viewport)return;const keys={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]};if(keys[event.key]){event.preventDefault();x+=keys[event.key][0];y+=keys[event.key][1];apply();}else if(event.key==='Home'){event.preventDefault();fit();}else if(['+','=','-'].includes(event.key)){event.preventDefault();changeZoom(zoom*(event.key==='-'?1/1.2:1.2));}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active)$('wbCloseInspector').click();});
function count(){$('wbRecordCount').textContent=window.NetworkLab.scenarioRecords().length;}document.addEventListener('network-lab-scenarios-updated',count);
function resize(){const top=workspace.getBoundingClientRect().top;workspace.style.setProperty('--wb-top',Math.max(0,top)+'px');fit();}window.addEventListener('resize',resize);document.addEventListener('fullscreenchange',resize);
document.addEventListener('network-lab-updated',()=>{const next=JSON.stringify(window.NetworkLab.model());if(next!==signature){signature=next;fit();}count();});
signature=JSON.stringify(window.NetworkLab.model());count();resize();if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>fit()).observe(viewport);
window.SimulationWorkbench={fit,open:panel,camera:()=>({x,y,zoom})};
})();
