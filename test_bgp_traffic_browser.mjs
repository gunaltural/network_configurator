import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];
const base=process.env.SMOKE_URL||'http://127.0.0.1:8147';
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/');
 await page.locator('#v3TechGrid button').filter({has:page.locator('h3',{hasText:'BGP'})}).click();
 assert.equal(await page.locator('[data-bgp-design-tab]').count(),0);
 assert.equal(await page.locator('#bgpAddTrafficPolicy').count(),0);
 for(const vendor of ['Cisco IOS-XE','Cisco NX-OS','Arista EOS','Huawei_CE_SW','FortiGate']){
  await page.locator('#platform').selectOption(vendor);
  for(const id of ['bgpCustomerAs','bgpInternal','bgpBfd','bgpNextHop','bgpSendCommunity','bgpMaxPrefix','bgpTeOutboundPreferredIsp','bgpTeLocalPrefValue','bgpTeBackupLocalPref','bgpTeInboundPreferredIsp','bgpTePrependCount'])assert.equal(await page.locator('#'+id).isVisible(),true,vendor+' restored '+id);
  await page.locator('#bgpMaxPrefix').check();await page.locator('#bgpMaxPrefixValue').fill('15000');
  await page.waitForFunction(()=>/(?:maximum-prefix|maximum-routes|route-limit) 15000/.test(document.getElementById('output').textContent));
  await page.locator('#bgpMaxPrefix').uncheck();assert.equal(await page.locator('#bgpMaxPrefixValue').isDisabled(),true);
  assert.ok(!/maximum-prefix|maximum-routes|route-limit/.test(await page.locator('#output').textContent()));
  await page.locator('#bgpTeLocalPrefValue').fill('333');await page.locator('#bgpTeBackupLocalPref').fill('222');await page.locator('#bgpTePrependCount').selectOption('5');
  const config=await page.locator('#output').textContent();assert.match(config,/(?:local-preference|set-local-preference) 333/);assert.match(config,/(?:local-preference|set-local-preference) 222/);assert.match(config,/(?:prepend|as-path|aspath).*65001 65001 65001 65001 65001/);
 }
 await page.locator('#platform').selectOption('Cisco IOS-XE');await page.locator('#bgpAddUpstream').click();
 await page.locator('[data-bgp-device="isp3"][data-bgp-connected="false"]').waitFor();assert.equal(await page.locator('[data-bgp-connection]').count(),2);
 const displayed=await page.locator('#output').textContent();await page.locator('#outputCompare').click();await page.waitForURL('**/config-compare');assert.equal(await page.locator('#leftText').inputValue(),displayed);assert.equal(await page.locator('#rightText').inputValue(),'');
 await page.goto(base+'/?resume=1');await page.locator('#bgpTeLocalPrefValue').waitFor();assert.equal(await page.locator('#bgpTeLocalPrefValue').inputValue(),'333');
 await page.locator('#bgpOutboundTeCard').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/bgp-restored-parameters.png'});
 await page.evaluate(()=>window.NetworkWorkspaceProject.prepareWorkspaceSimulation());
 await page.goto(base+'/network-lab?workspace=1');await page.locator('#wbPolicies').click();
 const outbound=page.locator('#syntheticOutboundPanel input[data-policy="localPreference"]').first();assert.equal(await outbound.inputValue(),'333');
 await outbound.fill('777');await page.locator('#syntheticApplyOutbound').click();assert.match(await page.locator('#labMap [data-path-decision="BGP"]').textContent(),/777/);
 await page.locator('#syntheticInboundTab').click();const inbound=page.locator('#syntheticInboundPanel input').first(),original=await inbound.inputValue();await inbound.fill('4');await page.locator('#syntheticApplyInbound').click();await page.locator('#syntheticDefaultInbound').click();assert.equal(await inbound.inputValue(),original);
 await page.locator('#syntheticOutboundTab').click();assert.equal(await outbound.inputValue(),'777');await page.locator('#syntheticDefaultOutbound').click();assert.equal(await outbound.inputValue(),'333');
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.goto(base+'/network-lab?from=design');await page.locator('#wbPolicies').click();
 const legacy=page.locator('#syntheticOutboundPolicies input[data-link="wan1"]'),legacyDefault=await legacy.inputValue();await legacy.fill('888');await page.locator('#syntheticApplyOutbound').click();assert.equal(await page.evaluate(()=>window.SyntheticLab.evaluate().routes[0].selected.localPreference),888);await page.locator('#syntheticDefaultOutbound').click();assert.equal(await legacy.inputValue(),legacyDefault);
 assert.deepEqual(errors,[]);console.log('Restored Oct18 BGP parameters: five-vendor Advanced/TE controls, optional max-prefix, topology, exact Compare, reload and both preserved simulation engines with Design-derived apply/defaults passed.');
}finally{await browser.close();}
