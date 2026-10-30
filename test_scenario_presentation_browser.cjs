const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent('<main id="report"></main>');await page.addScriptTag({content:fs.readFileSync('simulation-report.js','utf8')});
 for(const language of ['en','tr']){
 await page.evaluate(language=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#edf4fa"/><text x="30" y="90">CE-1 — ISP-1</text></svg>';
 const data=[1,2].map(i=>({module:'BGP',scenarioName:'Circuit fail '+i,baselinePath:'CE-1 → ISP-1',currentPath:'CE-1 → ISP-2',failedLinks:['ISP-1'],baselineTopologySvg:svg,topologySvg:svg.replace('ISP-1','ISP-2')}));
 document.querySelector('#report').innerHTML=SimulationReport.html(data,language);
 },language);
 const panels=page.locator('.scenario-topology-view'),first=panels.nth(0),second=panels.nth(1);
 assert.equal(await first.locator('figure:visible').count(),2);
 await first.locator('input[value="before"]').check();assert.equal(await first.locator('figure:visible').count(),1);assert.equal(await second.locator('figure:visible').count(),2);
 await first.locator('input[value="after"]').check();assert.ok(await first.locator('figure').nth(1).isVisible());assert.ok(!await first.locator('figure').nth(0).isVisible());
 await page.emulateMedia({media:'print'});assert.equal(await first.locator('figure:visible').count(),2);assert.ok(!await first.locator('fieldset').isVisible());await page.emulateMedia({media:'screen'});
 await first.locator('input[value="both"]').check();await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 }
 console.log('Browser: TR/EN compare/before/after, scenario isolation, print and mobile width passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
