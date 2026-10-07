import io
import unittest
from openpyxl import Workbook
from fastapi.testclient import TestClient
from sdwan_excel import parse_sdwan_excel
from app import app

HEADERS=['LOKASYON','Router Hostname','System-ip','Site-id','VPN0-ROUTER-TT','VPN0-ROUTER-VF','VPN512-ROUTER']

def workbook():
    book=Workbook();book.active.title='Instructions';book.active.append(['Read me'])
    sheet=book.create_sheet('IP Adres Planlaması');sheet.append(['Planning']);sheet.append([]);sheet.append(HEADERS)
    sheet.append(['Ankara','ANK-CE-1','10.10.10.1',100,'192.0.2.2/30','198.51.100.2/30','10.20.0.2/24'])
    sheet.append(['Ankara','ANK-CE-2','10.10.10.2',100,'192.0.2.6/30','198.51.100.6/30','10.20.0.3/24'])
    stream=io.BytesIO();book.save(stream);return stream.getvalue()

class ExcelTests(unittest.TestCase):
    def test_template_sheet_title_and_numeric_id(self):
        parsed=parse_sdwan_excel(workbook());self.assertEqual(parsed['sheet'],'IP Adres Planlaması')
        self.assertEqual(len(parsed['rows']),2);self.assertEqual(parsed['rows'][0]['Site-id'],'100')
        self.assertEqual(parsed['rows'][1]['Router Hostname'],'ANK-CE-2')
    def test_upload_api(self):
        response=TestClient(app).post('/api/sdwan/excel',content=workbook(),headers={'Content-Type':'application/octet-stream'})
        self.assertEqual(response.status_code,200);self.assertEqual(len(response.json()['rows']),2)
    def test_legacy_xls_reader(self):
        # Exercise the legacy workbook branch with the installed xlrd adapter.
        from unittest.mock import patch, Mock
        sheet=Mock(nrows=2,ncols=7)
        sheet.row_values.side_effect=[HEADERS,['Ankara','ANK-CE-1','10.10.10.1',100.0,'192.0.2.2/30','198.51.100.2/30','10.20.0.2/24']]
        book=Mock();book.sheet_names.return_value=['IP Adres Planlaması'];book.sheet_by_name.return_value=sheet
        with patch('xlrd.open_workbook',return_value=book):
            parsed=parse_sdwan_excel(b'\xd0\xcf\x11\xe0test')
        self.assertEqual(parsed['rows'][0]['Site-id'],'100');book.release_resources.assert_called_once()

    def test_invalid_and_oversized(self):
        for data in [b'',b'not excel',b'x'*5000001]:
            with self.assertRaises(ValueError):parse_sdwan_excel(data)
        self.assertEqual(TestClient(app).post('/api/sdwan/excel',content=b'bad').status_code,400)

if __name__=='__main__':unittest.main()
