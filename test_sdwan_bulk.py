import io
import unittest
import zipfile
from fastapi.testclient import TestClient
from app import app
from sdwan_excel import parse_sdwan_excel

class BulkTests(unittest.TestCase):
    def test_template_and_archive(self):
        c=TestClient(app)
        r=c.get('/api/sdwan/template?scope=bulk');self.assertEqual(r.status_code,200)
        rows=parse_sdwan_excel(r.content)['rows'];self.assertEqual(len(rows),4)
        self.assertEqual(len({r['LOKASYON'] for r in rows}),2)
        data={'configs':[dict(site=r['LOKASYON'],siteId=r['Site-id'],hostname=r['Router Hostname'],systemIp=r['System-ip'],config='hostname '+r['Router Hostname']) for r in rows]}
        result=c.post('/api/sdwan/config-archive',json=data);self.assertEqual(result.status_code,200,result.text if result.status_code!=200 else '')
        with zipfile.ZipFile(io.BytesIO(result.content)) as z:
            self.assertEqual(len(z.namelist()),5)
            self.assertIn('101_Site-1/Site1-Router1.cfg',z.namelist())
            self.assertIn('102_Site-2/Site2-Router2.cfg',z.namelist())
            self.assertIn('manifest.csv',z.namelist())
        data['configs'][1]['systemIp']=data['configs'][0]['systemIp']
        self.assertEqual(c.post('/api/sdwan/config-archive',json=data).status_code,400)

    def test_300_sites(self):
        c=TestClient(app)
        data={'configs':[dict(site=f'Site-{s}',siteId=str(1000+s),hostname=f'Site{s}-Router{r}',systemIp=f'10.255.{s//100}.{(s%100)*2+r}',config=f'hostname Site{s}-Router{r}\nsite-id {1000+s}') for s in range(1,301) for r in (1,2)]}
        result=c.post('/api/sdwan/config-archive',json=data);self.assertEqual(result.status_code,200)
        with zipfile.ZipFile(io.BytesIO(result.content)) as z:self.assertEqual(len(z.namelist()),601)

    def test_invalid_paths_and_profiles(self):
        c=TestClient(app)
        row=dict(site='Site-1',siteId='101',hostname='../Router',systemIp='10.1.1.1',config='hostname Router')
        self.assertEqual(c.post('/api/sdwan/config-archive',json={'configs':[row]}).status_code,400)
        row['hostname']='Router1'
        other={**row,'site':'Site-2','hostname':'Router2','systemIp':'10.1.1.2'}
        self.assertEqual(c.post('/api/sdwan/config-archive',json={'configs':[row,other]}).status_code,400)

if __name__=='__main__':unittest.main()
