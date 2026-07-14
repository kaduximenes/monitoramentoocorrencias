import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import json

files = sorted(Path(r'c:\repos_github\Planilhas').glob('*.xlsx'))
ns_main = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
ns_rel = {'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

for path in files:
    print('===', path.name, '===')
    with zipfile.ZipFile(path) as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall('a:si', ns_main):
                parts = []
                for t in si.iterfind('.//a:t', ns_main):
                    parts.append(t.text or '')
                shared_strings.append(''.join(parts))
        print('shared_strings', len(shared_strings))

        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        rel_map = {rel.attrib['Id']: rel.attrib['Target'] for rel in rels}
        sheet = wb.find('a:sheets/a:sheet', ns_main)
        rel_id = sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        target = rel_map[rel_id]
        if not target.startswith('xl/'):
            target = 'xl/' + target.lstrip('/')
        print('sheet target', target)
        sheet_xml = ET.fromstring(z.read(target))
        rows = []
        for row in sheet_xml.find('a:sheetData', ns_main):
            vals = []
            for c in row.findall('a:c', ns_main):
                t = c.attrib.get('t')
                v = c.find('a:v', ns_main)
                if v is None:
                    val = ''
                else:
                    val = v.text
                if t == 's' and val is not None:
                    val = shared_strings[int(val)]
                vals.append(val)
            rows.append(vals)
        for row in rows[:15]:
            print(row)
        print('rows count', len(rows))
        print()
