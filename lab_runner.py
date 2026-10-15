#!/usr/bin/env python3
"""Run only the generated lab on an isolated Linux lab host."""
import argparse,json,subprocess,time,datetime
from pathlib import Path

def command(args):
    r=subprocess.run(args,capture_output=True,text=True,timeout=180)
    return {'command':args,'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
def container(m,node):return f'clab-{m["lab"]["name"]}-{node}'
def cli(m,node,line):return command(['docker','exec',container(m,node),'vtysh','-c',line])
def measure(m,phase):
    evidence={};checks=[]
    for n,expected in m['expectedPeers'].items():
        raw=cli(m,n,'show bgp ipv4 unicast summary json');evidence[n]=[raw,cli(m,n,'show ip route'),cli(m,n,'show bgp ipv4 unicast')]
        try:
            data=json.loads(raw['stdout']);peers=data.get('ipv4Unicast',{}).get('peers',{});established=sum(p.get('state')=='Established' for p in peers.values())
            remaining=expected-(1 if phase=='failure' and any(n==l[k] for l in m['lab']['links'] if l['id']==m['failure']['link'] for k in ('a','b')) else 0)
            checks.append({'check':n+' BGP established peers','expected':remaining,'observed':established,'passed':raw['returncode']==0 and established==remaining})
        except (ValueError,TypeError,AttributeError):checks.append({'check':n+' BGP summary parsed','passed':False})
    for p in m['probes']:
        route=cli(m,p['node'],'show bgp ipv4 unicast '+p['prefix']+' json');evidence.setdefault(p['node'],[]).append(route)
        try:
            paths=json.loads(route['stdout']).get('paths',[]);best=next(x for x in paths if x.get('bestpath',{}).get('overall'))
            interconnected=any(l['a'].startswith('ce') and l['b'].startswith('ce') for l in m['lab']['links'])
            candidates=[l['localPreference'] for l in m['lab']['links'] if (l['a'].startswith('isp') or l['b'].startswith('isp')) and (interconnected or p['node'] in [l['a'],l['b']]) and not (phase=='failure' and l['id']==m['failure']['link'])]
            expected=max(candidates);observed=best.get('localpref',100)
            checks.append({'check':p['node']+' best-path Local Preference','expected':expected,'observed':observed,'passed':route['returncode']==0 and observed==expected})
        except (ValueError,TypeError,AttributeError,StopIteration):checks.append({'check':p['node']+' valid best path','passed':False})
        r=command(['docker','exec',container(m,p['node']),'ping','-I',p['source'],'-c','3','-W','2',p['destination']]);evidence.setdefault(p['node'],[]).append(r);checks.append({'check':p['node']+' reachability to '+p['destination'],'passed':r['returncode']==0})
    return {'phase':phase,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':checks,'evidence':evidence,'passed':all(c['passed'] for c in checks)}
def wait_measure(m,phase):
    samples=[]
    for _ in range(12):
        sample=measure(m,phase);samples.append(sample)
        if sample['passed']:break
        time.sleep(5)
    sample['pollCount']=len(samples);return sample

def interface(m,up):
    f=m['failure'];return command(['docker','exec',container(m,f['node']),'ip','link','set','dev',f['interface'],'up' if up else 'down'])
def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['start','baseline','fail','restore','stop']);a=p.parse_args()
    root=Path(__file__).resolve().parent
    import os
    os.chdir(root);m=json.loads(Path('manifest.json').read_text());results={'schema':'network-lab-results-v1','fingerprint':m['fingerprint'],'labName':m['lab']['name'],'engine':'FRR / Containerlab','runs':[]}
    if a.action in ('start','stop'):
        r=command(['containerlab','deploy' if a.action=='start' else 'destroy','-t','lab.clab.yml']);print(r['stdout'],r['stderr']);raise SystemExit(r['returncode'])
    if a.action=='restore':
        r=interface(m,True);print(r);raise SystemExit(r['returncode'])
    try:
        baseline=wait_measure(m,'baseline');results['runs'].append(baseline)
        if a.action=='fail':
            if not baseline['passed']:results['blocked']='Baseline failed; no interface disabled.'
            else:
                try:
                    operation=interface(m,False);results['faultOperation']=operation
                    if operation['returncode']:raise RuntimeError('Could not disable selected interface.')
                    results['runs'].append(wait_measure(m,'failure'))
                finally:
                    results['restoreOperation']=interface(m,True)
                results['runs'].append(wait_measure(m,'restored'))
    except Exception as e:results['error']=str(e)
    finally:
        Path('results.json').write_text(json.dumps(results,indent=2));print('Evidence saved to results.json')
    raise SystemExit(0 if results['runs'] and all(r['passed'] for r in results['runs']) and not results.get('error') and not results.get('blocked') else 1)
if __name__=='__main__':main()
