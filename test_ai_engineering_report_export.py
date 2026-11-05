"""Layout-preserving report exporter regression tests.

This test deliberately checks report sections/status layout, not just a valid
.pdf/.docx header: the old flat text converter passed that weak test.
"""
import io
import unittest

from docx import Document
from pypdf import PdfReader

from ai_engineering_report_export import export_report, prepare_report


class EngineeringExportTests(unittest.TestCase):
    REPORT = '''<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>Network Report</title><style>
    .stp-design-paper{background:white;color:#1b2933;font-family:Arial;padding:30px}
    .summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .metric{border:1px solid #cad6df;padding:9px}
    .decision{background:#f5f9fc;border-left:5px solid #c72d39;padding:12px}
    table{width:100%;border-collapse:collapse} td,th{border:1px solid #cbd6df;padding:8px}
    </style></head><body><div id="stpCTOView" class="cto-view">
    <article class="paper stp-design-paper"><header><h1>STP Engineering Assessment Report</h1></header>
    <h2>1 · Technology-level Engineering Findings</h2>
    <div class="summary-grid"><div class="metric"><b>2</b><span>Risk</span></div>
      <div class="metric"><b>1</b><span>Good</span></div>
      <div class="metric"><b>3</b><span>Verification needed</span></div></div>
    <section class="decision engineering-finding" data-finding-id="STP-ROOT-CONTAINMENT"
       data-finding-status="RISK" style="border-left:5px solid #c72d39">
       <div class="cto-finding-head"><strong>STP · Root bridge containment</strong>
         <span class="choice" style="color:#9b1f2a">RISK · HIGH</span></div>
       <p><strong>Expected behavior:</strong> Root Guard should protect mapped Core-to-Access ports.</p>
       <p><strong>Observed configuration / state:</strong> Guard missing on configured downstream trunk.</p>
       <p><strong>Potential network impact:</strong> Access bridge can influence STP root selection.</p>
       <p><strong>Recommended action:</strong> Verify downstream designated roles and enable Root Guard.</p>
       <details><summary>CLI evidence, verification and vendor references</summary>
          <pre>show spanning-tree root
DO_NOT_EXPORT_COLLAPSED_CLI
LAB-CORE-A config L17</pre>
       </details>
    </section>
    <h2>2 · Network Consistency</h2>
    <table><thead><tr><th>Device</th><th>Root Priority</th><th>Result</th></tr></thead>
     <tbody><tr><td>LAB-CORE-A</td><td>4096</td><td>Good</td></tr>
            <tr><td>LAB-CORE-B</td><td>8192</td><td>Verify</td></tr></tbody></table>
    <button>Upload CLI</button><script>DO_NOT_INCLUDE_JS</script>
    </article></div></body></html>'''

    def test_prepared_html_preserves_visual_structure_but_skips_collapsed_cli(self):
        tree = prepare_report(self.REPORT)
        article = tree.select_one("article.stp-design-paper")
        self.assertIsNotNone(article)
        self.assertIsNotNone(tree.select_one(".summary-grid"))
        self.assertIsNotNone(tree.select_one('[data-finding-status="RISK"]'))
        self.assertIsNotNone(tree.select_one("table tr th"))
        self.assertNotIn("DO_NOT_EXPORT_COLLAPSED_CLI", tree.get_text(" ", strip=True))
        self.assertIn("CLI evidence, verification", tree.get_text(" ", strip=True))
        self.assertNotIn("DO_NOT_INCLUDE_JS", tree.get_text(" ", strip=True))
        self.assertNotIn("Upload CLI", tree.get_text(" ", strip=True))

    def test_real_pdf_preserves_headings_status_and_tables(self):
        data = export_report(self.REPORT, "pdf")
        self.assertTrue(data.startswith(b"%PDF"))
        self.assertGreater(len(data), 4500)
        reader = PdfReader(io.BytesIO(data))
        self.assertGreaterEqual(len(reader.pages), 1)
        self.assertLess(len(reader.pages), 5, "Collapsed evidence must not produce a long flat-text PDF")
        text = "\n".join(page.extract_text() for page in reader.pages)
        for field in ("STP Engineering Assessment Report", "Technology-level Engineering Findings",
                      "Root bridge containment", "RISK", "Network Consistency",
                      "LAB-CORE-A", "Root Priority"):
            self.assertIn(field, text)
        self.assertNotIn("DO_NOT_EXPORT_COLLAPSED_CLI", text)

    def test_word_contains_native_cards_kpis_and_table_not_flat_paragraphs(self):
        data = export_report(self.REPORT, "word")
        self.assertTrue(data.startswith(b"PK"))
        doc = Document(io.BytesIO(data))
        self.assertGreaterEqual(len(doc.tables), 3, "Metrics, finding cards and data table should be real Word tables")
        summary = "\n".join(p.text for p in doc.paragraphs)
        details = "\n".join(cell.text for table in doc.tables for row in table.rows for cell in row.cells)
        text = summary + "\n" + details
        self.assertIn("Technology-level Engineering Findings", text)
        self.assertIn("Root bridge containment", text)
        self.assertIn("RISK · HIGH", text)
        self.assertIn("LAB-CORE-A", text)
        self.assertNotIn("DO_NOT_EXPORT_COLLAPSED_CLI", text)
        self.assertNotIn("Upload CLI", text)
        # The risk card has a real shaded Word cell, not an unstyled text run.
        risk_cell = next(c for t in doc.tables for row in t.rows for c in row.cells
                         if "Root bridge containment" in c.text)
        self.assertIn("FBE9EB", risk_cell._tc.xml)

    def test_expanded_cli_is_included_in_both_formats(self):
        source = self.REPORT.replace("<details>", "<details open>")
        doc = Document(io.BytesIO(export_report(source, "word")))
        doc_text = "\n".join(cell.text for table in doc.tables for row in table.rows for cell in row.cells)
        self.assertIn("DO_NOT_EXPORT_COLLAPSED_CLI", doc_text)
        pdf = PdfReader(io.BytesIO(export_report(source, "pdf")))
        self.assertIn("DO_NOT_EXPORT_COLLAPSED_CLI",
                      "\n".join(page.extract_text() for page in pdf.pages))

    def test_oversized_report_rejected(self):
        with self.assertRaises(ValueError):
            export_report("<p>" + "a"*1_500_001 + "</p>", "pdf")


if __name__ == "__main__":
    unittest.main()
