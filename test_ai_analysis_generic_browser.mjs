import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1365,height:880},acceptDownloads:true});
const base=process.env.SMOKE_URL||'http://127.0.0.1:8125';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const nodes=['CORE-01','CORE-02','ACCESS-01','ACCESS-02','ACCESS-03','ACCESS-04'];
const design={
 vendor:'Cisco IOS-XE',source:{module:'BGP'},links:[],specialLinks:[],
 devices:nodes.map((hostname,i)=>({id:'node-'+i,hostname,tier:i<2?'upper':'lower'})),
 parameters:[{label:'Local preference',value:'200 / 150',impact:'Prefer core-1, core-2 as failover'}],
 configurations:nodes.map((hostname,i)=>({deviceId:'node-'+i,text:
  'hostname '+hostname+'\nrouter bgp 65001\n neighbor 192.0.2.'+(i+1)+' remote-as 65002'+
  '\nusername admin secret DONT_EXPOSE_REPORT_SECRET'+
  '\n-----BEGIN RSA PRIVATE KEY-----\nDONT_EXPOSE_PEM_BODY\n-----END RSA PRIVATE KEY-----'})),
 designChecks:{evaluated:35,errors:0,warnings:0,issues:[]}
};
try{
 await page.goto(base+'/ai-topology');
 await page.evaluate(data=>sessionStorage.setItem('networkConfigurator.aiTopology.pending',JSON.stringify(data)),design);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#designReviewSummary')?.textContent.includes('6 Design configuration proposals'),null,{timeout:15000});
 assert.equal(await page.locator('#workflowStep2').isVisible(),true,'Design handoff starts at configuration/evidence stage');
 const deviceRows=await page.locator('#showTechDeviceList').innerText();
 assert.match(deviceRows,/CORE-01 · Design \/ attached configuration available/);
 assert.doesNotMatch(deviceRows,/No operational CLI/);
 await page.locator('#showTechDevice').selectOption('node-0');
 await page.locator('#showTechPastePanel').evaluate(x=>{x.open=true;});
 await page.locator('#showTechPasteName').fill('show-bgp-summary.out');
 await page.locator('#showTechPasteText').fill(
  'CORE-01#show ip bgp summary\nNeighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd\n192.0.2.1 4 65002 0 0 1 0 0 never Active');
 await page.locator('#attachShowTechPaste').click();
 await page.waitForFunction(()=>document.querySelector('#showTechDeviceList')?.textContent.includes('show-bgp-summary.out'));
 await page.locator('#wizardNext').click();
 assert.equal(await page.locator('#workflowStep3').isVisible(),true,'Evidence moves into analysis');
 await page.locator('#analyze').click();
 await page.waitForFunction(()=>document.querySelector('#workflowStep4')?.hidden===false,{timeout:15000});
 await page.locator('#viewSTPCTO').waitFor({state:'attached'});
 const contents=await page.locator('#stpCTOView').textContent();
 assert.match(contents,/LOCAL EVIDENCE SUMMARY — NO AI MODEL EXECUTED/);
 assert.match(contents,/6 \/ 6/);
 assert.match(contents,/Local preference200 \/ 150/);
 assert.match(contents,/Observed BGP neighbor FSM/);
 assert.match(contents,/192\.0\.2\.1 reports Active/);
 assert.match(contents,/show-bgp-summary\.out · L3/);
 assert.doesNotMatch(contents,/DONT_EXPOSE_REPORT_SECRET|DONT_EXPOSE_PEM_BODY/,'No secrets in HTML and export source');
 assert.equal(await page.locator('#downloadEngineeringPDF').isEnabled(),true);
 assert.equal(await page.locator('#downloadEngineeringWord').isEnabled(),true);
 const [html]=await Promise.all([page.waitForEvent('download'),page.locator('#exportSTPCTO').click()]);
 const htmlData=await readFile(await html.path(),'utf8');
 assert.match(htmlData,/Observed BGP neighbor FSM/);
 assert.doesNotMatch(htmlData,/DONT_EXPOSE_REPORT_SECRET|DONT_EXPOSE_PEM_BODY/);
 const [pdf]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadEngineeringPDF').click()]);
 const pdfBytes=await readFile(await pdf.path());
 assert.equal(pdfBytes.subarray(0,4).toString('utf8'),'%PDF');
 assert.ok(pdfBytes.length>3000,'Substantive PDF generated');
 const [word]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadEngineeringWord').click()]);
 const docxBytes=await readFile(await word.path());
 assert.equal(docxBytes.subarray(0,2).toString(),'PK','Real DOCX ZIP generated');
 assert.equal(errors.length,0,'No browser exceptions: '+errors.join(' | '));
 console.log('AI_ANALYSIS_GENERIC_BROWSER_E2E_PASS: 6 Design devices, BGP evidence, offline report, secure HTML/PDF/DOCX');
}finally{await browser.close();}
