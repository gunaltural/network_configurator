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


if __name__ == '__main__':
    unittest.main()
