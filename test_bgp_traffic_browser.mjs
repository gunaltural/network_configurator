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
 assert.equal(await page.locator('#bgpAddTrafficPolicy').isVisible(),true);
 for(const vendor of ['Cisco IOS-XE','Cisco NX-OS','Arista EOS','Huawei_CE_SW','FortiGate']){
  await page.locator('#platform').selectOption(vendor);
  for(const id of ['bgpCustomerAs','bgpInternal','bgpBfd','bgpNextHop','bgpSendCommunity','bgpMaxPrefix','bgpTeOutboundPreferredIsp','bgpTeLocalPrefValue','bgpTeBackupLocalPref','bgpTeInboundPreferredIsp','bgpTePrependCount'])assert.equal(await page.locator('#'+id).isVisible(),true,vendor+' restored '+id);
  await page.locator('#bgpMaxPrefix').check();await page.locator('#bgpMaxPrefixValue').fill('15000');
  await page.waitForFunction(()=>/(?:maximum-prefix|maximum-routes|route-limit) 15000/.test(document.getElementById('output').textContent));
  await page.locator('#bgpMaxPrefix').uncheck();assert.equal(await page.locator('#bgpMaxPrefixValue').isDisabled(),true);
  assert.ok(!/maximum-prefix|maximum-routes|route-limit/.test(await page.locator('#output').textContent()));
  await page.locator('#bgpTeLocalPrefValue').fill('333');await page.locator('#bgpTeBackupLocalPref').fill('222');await page.locator('#bgpTePrependCount').selectOption('5');
  const config=await page.locator('#output').textContent();assert.match(config,/(?:local-preference|set-local-preference) 333/);assert.match(config,/(?:local-preference|set-local-preference) 222/);assert.match(config,/(?:prepend|as-path|aspath).*65001 65001 65001 65001 65001/);
  for(const [index,side,connection,key,value]of [[0,'Outbound','1','localPreference','300'],[1,'Outbound','2','localPreference','200'],[2,'Inbound','1','prependCount','2'],[3,'Inbound','2','prependCount','4']]){
   await page.locator(side==='Outbound'?'#bgpAddTrafficPolicy':'#bgpAddInboundPolicy').click();const row=page.locator('[data-traffic-policy="'+index+'"]');
   await row.locator('[data-policy-field="connection"]').selectOption(connection);await row.locator('[data-policy-field="'+key+'"]').fill(value);
   assert.equal(await row.locator('[data-policy-field="direction"]').count(),0);
   assert.equal(await row.locator('[data-policy-field="prefixes"]').getAttribute('required'),null);
  }
  const applied=await page.locator('#output').textContent();assert.match(applied,/(?:local-preference|set-local-preference) 300/);assert.match(applied,/(?:local-preference|set-local-preference) 200/);assert.match(applied,/(?:prepend|as-path|aspath).*65001 65001 65001 65001/);
  const resolved=await page.evaluate(()=>{const m=window.NetworkWorkspaceProject.prepareWorkspaceSimulation().bgp;return [window.BgpTrafficPolicy.resolve(m.links.find(l=>l.id==='wan1'),'import','203.0.113.0/24').localPreference,window.BgpTrafficPolicy.resolve(m.links.find(l=>l.id==='wan2'),'import','203.0.113.0/24').localPreference,window.BgpTrafficPolicy.resolve(m.links.find(l=>l.id==='wan1'),'export','10.10.0.0/16').prependCount,window.BgpTrafficPolicy.resolve(m.links.find(l=>l.id==='wan2'),'export','10.20.0.0/16').prependCount];});assert.deepEqual(resolved,[300,200,2,4]);
  for(const [index,prefix]of [[0,'203.0.113.0/24'],[1,'203.0.113.0/24'],[2,'10.10.0.0/16'],[3,'10.20.0.0/16']]){const row=page.locator('[data-traffic-policy="'+index+'"]');await row.locator('summary').click();await row.locator('[data-policy-field="prefixes"]').fill(prefix);if(index>=2){await row.locator('[data-policy-field="med"]').fill(index===2?'50':'100');await row.locator('[data-policy-field="communities"]').fill(index===2?'65001:10':'65001:20');}}
  assert.ok((await page.locator('#output').textContent()).includes('203.0.113.0'));assert.ok((await page.locator('#output').textContent()).includes('65001:20'));
  const routes=await page.evaluate(()=>{const l=window.NetworkWorkspaceProject.prepareWorkspaceSimulation().bgp.links.find(l=>l.id==='wan1');return [window.BgpTrafficPolicy.resolve(l,'import','203.0.113.0/24').localPreference,window.BgpTrafficPolicy.resolve(l,'import','198.18.255.1/32').localPreference];});assert.deepEqual(routes,[300,333]);
  if(vendor==='Cisco IOS-XE'){await page.locator('#bgpOutboundPolicyRows').screenshot({path:'/tmp/bgp-connection-policies.png'});}
  while(await page.locator('[data-traffic-policy]').count())await page.locator('[data-traffic-policy] button').filter({hasText:'Remove'}).first().click();

 }
 await page.locator('#platform').selectOption('Cisco IOS-XE');await page.locator('#bgpAddUpstream').click();
 await page.locator('[data-bgp-device="isp3"][data-bgp-connected="false"]').waitFor();assert.equal(await page.locator('[data-bgp-connection]').count(),2);
 await page.locator('#bgpAddTrafficPolicy').click();await page.locator('[data-traffic-policy="0"] [data-policy-field="localPreference"]').fill('444');
 const displayed=await page.locator('#output').textContent();await page.locator('#outputCompare').click();await page.waitForURL('**/config-compare');assert.equal(await page.locator('#leftText').inputValue(),displayed);assert.equal(await page.locator('#rightText').inputValue(),'');
 await page.goto(base+'/?resume=1');await page.locator('#bgpTeLocalPrefValue').waitFor();assert.equal(await page.locator('#bgpTeLocalPrefValue').inputValue(),'333');
 await page.locator('#bgpOutboundTeCard').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/bgp-restored-parameters.png'});
 await page.evaluate(()=>window.NetworkWorkspaceProject.prepareWorkspaceSimulation());
 await page.goto(base+'/network-lab?workspace=1');await page.locator('#wbPolicies').click();
 const outbound=page.locator('#syntheticOutboundPanel input[data-policy="localPreference"]').first();assert.equal(await outbound.inputValue(),'444');
 await outbound.fill('777');await page.locator('#syntheticApplyOutbound').click();assert.match(await page.locator('#labMap [data-path-decision="BGP"]').textContent(),/777/);
 await page.locator('#syntheticInboundTab').click();const inbound=page.locator('#syntheticInboundPanel input').first(),original=await inbound.inputValue();await inbound.fill('4');await page.locator('#syntheticApplyInbound').click();await page.locator('#syntheticDefaultInbound').click();assert.equal(await inbound.inputValue(),original);
 await page.locator('#syntheticOutboundTab').click();assert.equal(await outbound.inputValue(),'777');await page.locator('#syntheticDefaultOutbound').click();assert.equal(await outbound.inputValue(),'444');
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.goto(base+'/network-lab?from=design');await page.locator('#wbPolicies').click();
 const legacy=page.locator('#syntheticOutboundPolicies input[data-link="wan1"]'),legacyDefault=await legacy.inputValue();await legacy.fill('888');await page.locator('#syntheticApplyOutbound').click();assert.equal(await page.evaluate(()=>window.SyntheticLab.evaluate().routes[0].selected.localPreference),888);await page.locator('#syntheticDefaultOutbound').click();assert.equal(await legacy.inputValue(),legacyDefault);
 assert.deepEqual(errors,[]);console.log('Restored Oct18 BGP parameters: five-vendor Advanced/TE controls, optional max-prefix, topology, exact Compare, reload and multiple connection policies, optional prefixes, independent attributes, saved policies and both preserved simulation engines with Design-derived apply/defaults passed.');
}finally{await browser.close();}
