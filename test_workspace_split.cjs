const fs=require('fs'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const html='<div class="grid"><section class="card"><div id="params"></div></section><section class="card"><pre id="output"></pre></section></div>';
const d=new JSDOM(html,{url:'https://test.invalid/',runScripts:'outside-only'}),w=d.window,doc=w.document;
// Minimal existing shell surfaces; no module or report data is involved.
const header=doc.createElement('div');header.className='v3-topbar';doc.body.prepend(header);
let width=1000,frameWidth=1400;
Object.defineProperty(w,'innerWidth',{get:()=>frameWidth});
const grid=doc.querySelector('.grid'),pane=doc.querySelector('.card');
grid.getBoundingClientRect=()=>({width,left:10});pane.getBoundingClientRect=()=>({width:parseFloat(grid.style.getPropertyValue('--nc-param-width'))||0});
w.eval(fs.readFileSync('corporate-shell.js','utf8'));
const split=doc.querySelector('[role="separator"]');assert.ok(split);assert.equal(split.getAttribute('aria-orientation'),'vertical');assert.equal(parseFloat(grid.style.getPropertyValue('--nc-param-width')),491);
split.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft'}));assert.equal(parseFloat(grid.style.getPropertyValue('--nc-param-width')),481);assert.ok(Number(w.localStorage.getItem('nc-workspace-pane-share'))<.5);
split.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home'}));assert.equal(parseFloat(grid.style.getPropertyValue('--nc-param-width')),360);
split.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End'}));assert.equal(parseFloat(grid.style.getPropertyValue('--nc-param-width')),622);
split.dispatchEvent(new w.MouseEvent('dblclick'));assert.equal(parseFloat(grid.style.getPropertyValue('--nc-param-width')),491);
split.dispatchEvent(new w.MouseEvent('pointerdown',{button:0,clientX:510}));split.dispatchEvent(new w.MouseEvent('pointermove',{clientX:580}));split.dispatchEvent(new w.MouseEvent('pointerup'));assert.equal(parseFloat(grid.style.getPropertyValue('--nc-param-width')),561);assert.ok(!doc.body.classList.contains('nc-pane-resizing'));
frameWidth=800;width=600;w.dispatchEvent(new w.Event('resize'));assert.ok(split.hidden);assert.ok(grid.classList.contains('nc-panes-stacked'));
frameWidth=1400;width=1000;w.dispatchEvent(new w.Event('resize'));assert.ok(!split.hidden);assert.equal(parseFloat(grid.style.getPropertyValue('--nc-param-width')),561);
w.close();console.log('Workspace splitter: keyboard, pointer, reset, persistence, pane minimums and narrow-screen stacking passed');
