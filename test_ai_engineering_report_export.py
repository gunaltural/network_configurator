import io
import unittest
from docx import Document
from ai_engineering_report_export import export_report, ReportReader


class EngineeringExportTests(unittest.TestCase):
    REPORT = '''<!doctype html><html><head><title>Network Report</title><style>.fake{color:red}</style></head><body>
    <main><article><h1>Network Engineering Assessment</h1>
    <h2>1 · Technology-level Engineering Findings</h2>
    <section><strong>STP · Root placement</strong><span> VERIFY </span>
    <p>Expected behavior: Designated core links retain the intended root placement.</p>
    <p>Observed: Real operational CLI is missing.</p>
    <p>Verification task: Network Operations · collect show spanning-tree root.</p>
    <details><summary>CLI evidence</summary><pre>show spanning-tree root
VLAN0010 4096 0011.2233.4455</pre></details></section>
    <script>DO NOT INCLUDE MALICIOUS SCRIPT IN EXPORT</script>
    <button>Upload CLI</button>
    </article></main></body></html>'''

    def test_parser_keeps_report_not_interactive_controls(self):
        parsed=ReportReader().parse(self.REPORT)
        text=' '.join(i.text for i in parsed)
        self.assertIn('Technology-level Engineering Findings',text)
        self.assertIn('show spanning-tree root',text)
        self.assertNotIn('DO NOT INCLUDE MALICIOUS',text)
        self.assertNotIn('Upload CLI',text)

    def test_word_contains_same_engineering_content(self):
        blob=export_report(self.REPORT,'word')
        self.assertTrue(blob.startswith(b'PK'))
        doc=Document(io.BytesIO(blob))
        paragraphs='\n'.join(p.text for p in doc.paragraphs)
        self.assertIn('Network Engineering Assessment',paragraphs)
        self.assertIn('Verification task',paragraphs)
        self.assertIn('show spanning-tree root',paragraphs)
        self.assertNotIn('MALICIOUS',paragraphs)

    def test_pdf_valid_and_nonempty(self):
        blob=export_report(self.REPORT,'pdf')
        self.assertTrue(blob.startswith(b'%PDF'))
        self.assertGreater(len(blob),2000)

    def test_oversized_document_fails_closed(self):
        with self.assertRaises(ValueError):
            export_report('<p>'+'a'*1_500_001+'</p>','pdf')


if __name__=='__main__':
    unittest.main()
