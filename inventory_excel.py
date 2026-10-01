"""Bounded, read-only XLSX inventory import (no formulas evaluated)."""
import io
import zipfile
import xml.etree.ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
HEADERS = {'deviceid': 'id', 'hostname': 'hostname', 'serialnumber': 'serial',
           'softwareversion': 'softwareVersion', 'productmodel': 'model',
           'sshtarget': 'target', 'managementaddress': 'target', 'ipaddress': 'target',
           'port': 'port', 'username': 'username', 'password': 'password', 'platform': 'platform'}


def parse_inventory_xlsx(data, mode='manual'):
    if len(data) > 5_000_000:
        raise ValueError('Excel file must be smaller than 5 MB.')
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > 300 or sum(x.file_size for x in entries) > 20_000_000:
                raise ValueError('Excel workbook is too large when expanded.')
            def xml(path):
                raw = archive.read(path)
                if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
                    raise ValueError('Unsupported XML declarations.')
                return ET.fromstring(raw)
            strings = []
            if 'xl/sharedStrings.xml' in archive.namelist():
                strings = [''.join(x.itertext()) for x in xml('xl/sharedStrings.xml').findall('s:si', NS)]
            workbook = xml('xl/workbook.xml')
            sheet = workbook.find('s:sheets/s:sheet', NS)
            if sheet is None:
                raise ValueError('Workbook has no worksheets.')
            rid = sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            rels = xml('xl/_rels/workbook.xml.rels')
            target = next((r.get('Target') for r in rels if r.get('Id') == rid and r.get('TargetMode') != 'External'), None)
            if not target:
                raise ValueError('Could not read the first worksheet.')
            path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            rows = xml(path).findall('s:sheetData/s:row', NS)
            if len(rows) > 1001:
                raise ValueError('Maximum 1,000 inventory rows allowed.')
            decoded = []
            for row in rows:
                cells = {}
                for cell in row.findall('s:c', NS):
                    ref = cell.get('r', '')
                    col = ''.join(c for c in ref if c.isalpha())
                    if cell.find('s:f', NS) is not None:
                        raise ValueError('Replace formulas with text values before importing.')
                    value = cell.find('s:v', NS)
                    text = value.text or '' if value is not None else ''
                    if cell.get('t') == 's':
                        text = strings[int(text)]
                    elif cell.get('t') == 'inlineStr':
                        text = ''.join(cell.find('s:is', NS).itertext())
                    cells[col] = text
                if any(cells.values()):
                    decoded.append((row.get('r'), cells))
            if not decoded:
                raise ValueError('Workbook is empty.')
            mapping = {}
            for col, text in decoded[0][1].items():
                key = HEADERS.get(''.join(c.lower() for c in text if c.isalnum()))
                if key:
                    if key in mapping.values():
                        raise ValueError('Duplicate column: ' + text)
                    mapping[col] = key
            required = {'target', 'username'} if mode == 'ssh' else {'hostname', 'serial', 'softwareVersion', 'model'}
            if not required <= set(mapping.values()):
                raise ValueError('SSH template columns: SSH Target, Port, Username, Password. SSH Target and Username are required.' if mode == 'ssh' else 'Required headers: Hostname, Serial Number, Software Version, Product Model. Device ID is optional.')
            result = []
            for number, cells in decoded[1:]:
                record = {key: cells.get(col, '') if key == 'password' else cells.get(col, '').strip() for col, key in mapping.items()}
                if not any(record.values()):
                    continue
                if any(len(v) > (255 if key == 'target' else 100) for key, v in record.items()):
                    raise ValueError('Row ' + str(number) + ': values must be at most 100 characters.')
                result.append({'row': number, **record})
            if not result:
                raise ValueError('No inventory data rows found.')
            return result
    except (zipfile.BadZipFile, KeyError, IndexError, ET.ParseError, TypeError) as exc:
        raise ValueError('Invalid XLSX workbook. Upload an .xlsx file with text inventory values.') from exc
