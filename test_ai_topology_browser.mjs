import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const base=process.env.SMOKE_URL||'http://127.0.0.1:8125';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 const response=await page.goto(base+'/ai-topology');
 assert.equal(response.status(),200);
 await page.locator('#chooseBuild').click();
 await page.locator('#legacyTemplates').evaluate(el=>{el.open=true;});
 await page.locator('#connectionEditor').evaluate(el=>{el.open=true;});
 await page.locator('#template').selectOption('vpc');
 await page.locator('#applyTemplate').click();
 assert.match(await page.locator('#overview').innerText(),/2 devices · 2 links/);
 await page.locator('#deviceId').fill('fw-1');
 await page.locator('#hostname').fill('FW-1');
 await page.locator('#vendor').fill('FortiGate');
 await page.locator('#role').fill('edge');
 await page.locator('#saveDevice').click();
 assert.match(await page.locator('#overview').innerText(),/3 devices/);
 await page.locator('#linkId').fill('fw-uplink');
 await page.locator('#linkKind').fill('Ethernet');
 await page.locator('#linkA').selectOption('n9k-a');
 await page.locator('#linkB').selectOption('fw-1');
 await page.locator('#saveLink').click();
 assert.match(await page.locator('#overview').innerText(),/3 links/);
 await page.locator('#wizardNext').click();
 assert.equal(await page.locator('#workflowStep2').isVisible(),true,'Config stage follows topology');
 await page.locator('#configDevice').selectOption('fw-1');
 await page.locator('#configuration').fill('hostname FW-1\nsnmp-server community dont-send-me RO\nset community 65000:1 additive');
 await page.locator('#saveConfig').click();
 await page.locator('#wizardNext').click();
 assert.equal(await page.locator('#workflowStep3').isVisible(),true,'Analysis follows configuration');
 assert.equal(await page.locator('#preview').isVisible(),false,'Internal prepare button is hidden');
 assert.equal(await page.locator('#evidenceDetails').isVisible(),false,'Internal evidence preview is hidden');
 await page.locator('#preview').evaluate(x=>x.click());
 const review=await page.locator('#evidencePreview').textContent();
 assert.ok(review.includes('65000:1 additive'),'Routing community survives client redaction');
 assert.ok(!review.includes('dont-send-me'),'Credentials are not present in review payload');
 assert.equal(await page.locator('#analyze').isDisabled(),false);
 assert.ok(!errors.length,'No browser JS errors: '+errors.join(','));

 // Real application-to-AI bridge: consume the existing current Design report,
 // not an artificial topology or prewritten simulator answer.
 const designPage=await browser.newPage({viewport:{width:1280,height:900}});
 try{
  await designPage.goto(base+'/?workspace=VPC',{waitUntil:'domcontentloaded'});
  await designPage.locator('#ncSidebar details[data-nc-group="design"]').evaluate(el=>{el.open=true;});
  const openReview=designPage.locator('#ncSidebar button').filter({hasText:'Analyze Design with AI (optional)'});
  await designPage.waitForFunction(()=>window.__designWorkspaceOpened===true,{timeout:15000});
  await designPage.waitForFunction(()=>!!window.NetworkWorkspaceProject?.diagnosticDesign, {timeout:10000});
  await openReview.evaluate(el=>el.click()); // The VPC sidebar subgroup may be collapsed in CI; verify the handoff handler.
  await designPage.waitForURL('**/ai-topology',{timeout:15000});
  await designPage.waitForLoadState('domcontentloaded');
  await designPage.waitForFunction(()=>document.getElementById('overview')?.textContent.includes('devices'),null,{timeout:15000});
  const importStatus=await designPage.locator('#status').innerText();
  const summary=await designPage.locator('#designReviewSummary').innerText();
  console.log('AI_REAL_DESIGN_IMPORT '+JSON.stringify({status:importStatus,summary,overview:await designPage.locator('#overview').innerText()}));
  assert.match(summary,/configuration proposals/,'Import actual generated configurations');
  assert.match(summary,/engineering parameters/,'Import selected Design parameters');
  assert.match(summary,/original input checks/,'Import existing Design Checks');
  assert.ok(!(await designPage.locator('#designReviewPanel').isHidden()),'Original checks shown separately from AI output');
  assert.equal(await designPage.locator('#workflowStep2').isVisible(),true,'Imported Design enters evidence review stage');
  await designPage.locator('#wizardNext').click();
  await designPage.locator('#preview').evaluate(x=>x.click());
  const evidence=await designPage.locator('#evidencePreview').textContent();
  assert.ok(evidence.includes('Command: proposed configuration'),'Generated configs clearly labeled as proposals');
  assert.ok(evidence.includes('Command: deterministic input checks'),'Deterministic controls are reused, not copied as AI findings');
  assert.ok(evidence.includes('Command: parameter choices'),'Design parameters feed AI review');
 }finally{await designPage.close();}


 // Optional 2 Core + 1 Access fixture uses the same browser, parser and report pipeline.
 await page.locator('#workflowNav [data-workflow-step="1"]').click();
 assert.equal(await page.locator('#loadSTPLab').isVisible(),true,'LAB launch is visible');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#loadSTPLab').click();
 assert.match(await page.locator('#overview').textContent(),/3 devices · 3 links/);
 assert.equal(await page.locator('#showTechDeviceList .evidence-device').count(),3);
 assert.match(await page.locator('#showTechDeviceList').innerText(),/SYNTHETIC LAB/);
 assert.equal(await page.locator('#workflowStep2').isVisible(),true,'LAB lands in per-device config / verification stage');
 await page.locator('#wizardNext').click();
 assert.equal(await page.locator('#analyze').isVisible(),true,'Single Analyze Selected Devices button is visible');
 await page.locator('#analyze').click();
 await page.waitForFunction(()=>!document.getElementById('viewSTPCTO').disabled,{timeout:12000});
 await page.locator('#viewSTPCTO').click();
 assert.equal(await page.locator('#stpCTOView').isVisible(),true);
 const labReport=await page.locator('#stpCTOView').innerText();
 assert.match(labReport,/SYNTHETIC LAB/);
 assert.match(labReport,/17\.12\.04/);
 assert.match(labReport,/LAB-CORE-A/);
 assert.match(labReport,/LAB-CORE-B/);
 assert.match(labReport,/LAB-ACCESS-A/);
 assert.match(await page.locator('#stpCTOView').textContent(),/ROOT_ID_MATCH/,'Collapsed operational root correlation remains available in report details');
 assert.match(labReport,/STP-018/);
 assert.match(labReport,/Verification commands/);
 assert.match(labReport,/show version or show tech-support/);
 assert.equal(await page.locator('[data-evidence-upload="lab-core-a"]').count(),18);
 // Every criterion uploads to the owning device. Genuine evidence supersedes synthetic fixtures.
 const chooser=page.waitForEvent('filechooser');
 await page.locator('[data-evidence-upload="lab-core-a"]').first().click();
 const fileChooser=await chooser;
 await fileChooser.setFiles({name:'live-core-a-show-version.txt',mimeType:'text/plain',
  buffer:Buffer.from('===== show version =====\nCisco IOS XE Software, Version 17.15.07\nModel Number : C9500-24Y4C')});
 await page.waitForFunction(()=>document.getElementById('showTechStatus')?.textContent.includes('live-core-a-show-version.txt'),{timeout:12000});
 assert.match(await page.locator('#showTechDeviceList').textContent(),/live-core-a-show-version\.txt/);
 assert.match(await page.locator('#showTechDeviceList').textContent(),/LAB-CORE-B/);
 assert.ok(!(await page.locator('#showTechDeviceList').textContent()).includes('lab-core-a-synthetic-showtech.txt'),
  'Real capture replaces that device synthetic evidence rather than mixing it');
 assert.match(await page.locator('#stpCTOView').innerText(),/17\.15\.07/);
 assert.equal(await page.locator('#showTechFile').getAttribute('accept'),null,'File picker must not grey out CLI extensions');
 assert.equal(await page.locator('#showTechFile').getAttribute('multiple'),'','Multiple show commands can be selected at once');
 await page.locator('#workflowNav [data-workflow-step="2"]').click();
 await page.locator('#showTechDevice').selectOption('lab-core-b');
 await page.locator('#showTechFile').setInputFiles([
  {name:'show_version.out',mimeType:'text/plain',buffer:Buffer.from('===== show version =====\nCisco IOS XE Software, Version 17.15.09\nModel Number : C9500-24Y4C')},
  {name:'show_udld',mimeType:'application/octet-stream',buffer:Buffer.from('===== show udld interface =====\nTenGigabitEthernet1/0/1 aggressive bidirectional')}
 ]);
 await page.waitForFunction(()=>document.getElementById('showTechStatus')?.textContent.includes('show_udld'),{timeout:12000});
 const evidenceList=await page.locator('#showTechDeviceList').textContent();
 assert.match(evidenceList,/show_version\.out/,'CLI .out file accepted');
 assert.match(evidenceList,/show_udld/,'Extensionless command output accepted');
 assert.ok(!evidenceList.includes('lab-core-b-synthetic-showtech.txt'),'Real CLI replaces synthetic evidence per device');
 await page.locator('#showTechDevice').selectOption('lab-access-a');
 await page.locator('#showTechPastePanel').evaluate(el=>{el.open=true;});
 await page.locator('#showTechPasteName').fill('show-spanning-tree-root');
 await page.locator('#showTechPasteText').fill('===== show spanning-tree root =====\nVLAN0010 4106 0011.2200.0001 4 TenGigabitEthernet1/0/1');
 await page.locator('#attachShowTechPaste').click();
 await page.waitForFunction(()=>document.getElementById('showTechStatus')?.textContent.includes('show-spanning-tree-root'),{timeout:12000});
 assert.match(await page.locator('#showTechDeviceList').textContent(),/show-spanning-tree-root/,'CLI can be pasted for a specific device');


 // End-to-end acceptance of the Report stage: HTML, reviewer notes, local save and read-only reopen.
 await page.locator('#workflowNav [data-workflow-step="3"]').click();
 await page.locator('#analyze').click();
 await page.waitForFunction(()=>document.getElementById('workflowStep4')?.hidden===false,{timeout:12000});
 assert.equal(await page.locator('#workflowStep4').isVisible(),true);
 assert.equal(await page.getByText('Editable engineering draft').count(),0,'No legacy draft field in report flow');
 assert.equal(await page.locator('#internalAnalysisCapture').isVisible(),false,'Internal model text stays hidden');
 assert.match(await page.locator('#stpCTOView').textContent(),/Verification task/,'VERIFY next steps remain visible inside existing findings');
 assert.equal(await page.locator('#downloadEngineeringPDF').isEnabled(),true,'PDF download is enabled after analysis');
 assert.equal(await page.locator('#downloadEngineeringWord').isEnabled(),true,'Word download is enabled after analysis');
 assert.equal(await page.locator('#editEngineeringReport').isEnabled(),true);
 assert.equal(await page.locator('#saveEngineeringReport').isEnabled(),true);
 await page.locator('#viewSTPCTO').click();
 const pdfDownload=page.waitForEvent('download');
 await page.locator('#downloadEngineeringPDF').click();
 const pdf=await pdfDownload;
 assert.match(pdf.suggestedFilename(),/\.pdf$/,'PDF is downloadable');
 const pdfBytes=await (await import('node:fs/promises')).readFile(await pdf.path());
 assert.equal(pdfBytes.subarray(0,4).toString('utf8'),'%PDF','Export is an actual PDF');
 const wordDownload=page.waitForEvent('download');
 await page.locator('#downloadEngineeringWord').click();
 const word=await wordDownload;
 assert.match(word.suggestedFilename(),/\.docx$/,'Word is downloadable');
 const wordBytes=await (await import('node:fs/promises')).readFile(await word.path());
 assert.equal(wordBytes.subarray(0,2).toString('utf8'),'PK','Export is a real DOCX archive');

 await page.locator('#editEngineeringReport').click();
 await page.locator('#reviewExecutiveComment').fill('Executive note authored by reviewer: confirm upstream failover.');
 await page.locator('#reviewEngineeringNotes').fill('Engineering recommendation: validate root port role per VLAN.');
 await page.locator('#applyReportEdits').click();
 assert.match(await page.locator('#stpCTOView').textContent(),/Executive note authored by reviewer/);
 assert.match(await page.locator('#stpCTOView').textContent(),/Engineering recommendation/);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#saveEngineeringReport').click();
 assert.ok(await page.locator('#reportSavedList option').count()>0,'Report is saved in local browser list');
 await page.locator('#openSavedReport').click();
 assert.equal(await page.locator('#savedReportPreview').isVisible(),true,'Saved HTML is displayed as a read-only snapshot');
 assert.equal(await page.locator('#savedReportPreview').getAttribute('sandbox'),'');
 assert.match(await page.locator('#savedReportPreview').getAttribute('srcdoc'),/Executive note authored by reviewer/);

 assert.ok(!errors.length,'No UI script errors after synthetic LAB and operational upload: '+errors.join(','));
 console.log('AI topology Chromium: templates, mixed-vendor edits, link, configuration, reviewed evidence and routes passed.');
}finally{await browser.close();}
