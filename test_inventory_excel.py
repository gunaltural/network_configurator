import io
import unittest
import zipfile
from xml.sax.saxutils import escape
from inventory_excel import parse_inventory_xlsx


def fixture(rows, formula=False):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as z:
        z.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        content = ''.join('<row r="%s">%s</row>' % (n, ''.join('<c r="%s%s" t="inlineStr"><is><t>%s</t></is>%s</c>' % (chr(65+i), n, escape(value), '<f>1+1</f>' if formula and n == 2 and i == 0 else '') for i, value in enumerate(row))) for n, row in enumerate(rows, 1))
        z.writestr('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+content+'</sheetData></worksheet>')
    return stream.getvalue()


class InventoryExcelTests(unittest.TestCase):
    headers = ['Device ID', 'Hostname', 'Serial Number', 'Software Version', 'Product Model']

    def test_text_identifiers_and_blank_values(self):
        rows = parse_inventory_xlsx(fixture([self.headers, ['upper-1', 'SW-01', '0000123', '17.9.5', 'C9300'], ['upper-2', 'SW-02', '', '', '']]))
        self.assertEqual(rows[0]['serial'], '0000123')
        self.assertEqual(rows[1]['softwareVersion'], '')

    def test_optional_id(self):
        self.assertNotIn('id', parse_inventory_xlsx(fixture([self.headers[1:], ['SW-01', 'SN1', '1.0', 'Model']]))[0])

    def test_ssh_targets(self):
        headers = ['Device ID', 'Hostname', 'SSH Target', 'Port', 'Username', 'Platform']
        data = fixture([headers, ['', 'SW1', 'device.example.com', '2222', 'engineer', 'Arista EOS']])
        row = parse_inventory_xlsx(data, mode='ssh')[0]
        self.assertEqual(row['target'], 'device.example.com')
        self.assertEqual(row['port'], '2222')
        self.assertEqual(row['platform'], 'Arista EOS')
        from fastapi.testclient import TestClient
        from app import app
        client = TestClient(app)
        self.assertEqual(client.post('/api/reporting/inventory-excel?mode=ssh', content=data).json()['rows'][0]['username'], 'engineer')
        self.assertEqual(client.post('/api/reporting/inventory-excel?mode=ssh', content=fixture([self.headers, ['upper-1', 'SW1', 'SN1', '1', 'Model']])).status_code, 400)

    def test_four_column_ssh_template(self):
        data = fixture([['SSH Target', 'Port', 'Username', 'Password'], ['device.example.com', '', 'engineer', ' test-only ']])
        row = parse_inventory_xlsx(data, mode='ssh')[0]
        self.assertEqual(row['password'], ' test-only ')
        self.assertEqual(row['port'], '')
        self.assertNotIn('hostname', row)
        from fastapi.testclient import TestClient
        from app import app
        response = TestClient(app).post('/api/reporting/inventory-excel?mode=ssh', content=data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['rows'][0]['password'], ' test-only ')

    def test_invalid_uploads(self):
        for data in [b'invalid', fixture([['Hostname'], ['SW1']]), fixture([self.headers]), fixture([self.headers, ['x', 'SW1', 'S', '1', 'M']], formula=True), fixture([self.headers, ['x', 'SW1', 'S'*101, '1', 'M']])]:
            with self.subTest(size=len(data)), self.assertRaises(ValueError):
                parse_inventory_xlsx(data)

    def test_upload_endpoint(self):
        from fastapi.testclient import TestClient
        from app import app
        client = TestClient(app)
        response = client.post('/api/reporting/inventory-excel', content=fixture([self.headers, ['upper-1', 'SW1', 'SN1', '1.0', 'Model']]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['rows'][0]['id'], 'upper-1')
        self.assertEqual(client.post('/api/reporting/inventory-excel', content=b'invalid').status_code, 400)

    def test_imported_inventory_in_word(self):
        from fastapi.testclient import TestClient
        from app import app
        row = parse_inventory_xlsx(fixture([self.headers, ['upper-1', 'ACTUAL-SW1', '0000123', '17.9.5', 'C9300']]))[0]
        payload = dict(name='Inventory test', vendor='Cisco IOS-XE', architecture='module', technology='System', techPlacement='upper', upperCount=1, lowerCount=0, scope='', links=[], devices=[dict(id=row['id'], tier='upper', index=1, hostname='Planned-SW1', model=row['model'], serial=row['serial'], softwareVersion=row['softwareVersion'], observedHostname=row['hostname'], modelSource='manual', serialSource='manual', softwareSource='manual')])
        payload['devices'].extend(dict(id=f'inv-{i}', inventoryOnly=True, tier='upper', index=1, hostname=f'Extra-{i}', model='Extra model', serial=f'Extra-SN-{i}', softwareVersion='4.32', modelSource='manual', serialSource='manual') for i in range(20))
        client = TestClient(app)
        for language in ['tr', 'en']:
            payload['language'] = language
            response = client.post('/api/reporting/word', json=payload)
            self.assertEqual(response.status_code, 200)
            with zipfile.ZipFile(io.BytesIO(response.content)) as doc:
                xml = doc.read('word/document.xml').decode()
                for value in ['Planned-SW1', 'ACTUAL-SW1', '0000123', '17.9.5', 'C9300', 'Extra-19', 'Extra-SN-19', 'Envanter cihazı' if language == 'tr' else 'Inventory device']:
                    self.assertIn(value, xml)
                root = __import__('xml.etree.ElementTree', fromlist=['']).fromstring(xml)
                text = [''.join(p.itertext()) for p in root.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')]
                tier_line = next(x for x in text if 'tier:' in x)
                self.assertNotIn('Extra-', tier_line)


if __name__ == '__main__':
    unittest.main()
