"""Render a single Network Configurator HTML report as styled PDF or editable DOCX.

The HTML View DOM is the source of truth. PDF uses a CSS-aware paged renderer,
while DOCX preserves its headings, metrics, status cards, tables and visible
evidence as native Word elements. No remote resources are loaded.
"""
from __future__ import annotations

from io import BytesIO
import re

from bs4 import BeautifulSoup, NavigableString, Tag
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from weasyprint import HTML

MAX_DOCUMENT = 1_500_000
MAX_TEXT = 22000

_PALETTE = {
    "RISK": ("C72D39", "FBE9EB"),
    "GOOD": ("198754", "E7F5EA"),
    "VERIFY": ("CE8B19", "FFF2D9"),
    "NA": ("7D8892", "EFF1F3"),
}
_PRINT_CSS = """
@page {
  size: A4;
  margin: 16mm 13mm 18mm;
  @bottom-left {
    content: "Network Configurator | Engineering Assessment";
    font: 8pt "DejaVu Sans", sans-serif;
    color: #607688;
  }
  @bottom-right {
    content: counter(page) " / " counter(pages);
    font: 8pt "DejaVu Sans", sans-serif;
    color: #607688;
  }
}
html,body { width: auto !important; min-width: 0 !important; }
body { background: white !important; margin: 0 !important; padding: 0 !important;
       font-family: "DejaVu Sans", Arial, sans-serif !important;
       print-color-adjust: exact; }
#stpCTOView,.cto-view { margin: 0 !important; }
.paper,.stp-design-paper { padding: 0 !important; margin: 0 !important;
       box-shadow: none !important; border: none !important;
       min-height: 0 !important; max-width: none !important; }
.stp-design-paper h1 { font-size: 20pt !important; }
.stp-design-paper h2 { font-size: 13pt !important; }
.stp-design-paper p,.stp-design-paper td,.stp-design-paper li { font-size: 9pt !important; }
.stp-design-paper .report-meta { font-size: 8pt !important; }
.stp-design-paper .summary-grid { display: flex !important; flex-wrap: wrap !important;
  gap: 8px !important; }
.stp-design-paper .summary-grid>.metric { min-width: 105px !important;
  flex: 1 1 105px !important; }
.decision,.engineering-finding,.metric { break-inside: avoid-page; }
table { width: 100%; border-collapse: collapse; }
tr { break-inside: avoid-page; }
pre,code { white-space: pre-wrap !important; overflow-wrap: anywhere !important; }
.report-details-caption { font-size: 8pt; color: #526779; margin-top: 8px; }
a { color: #115984; }
"""

def _no_remote_fetch(url, *args, **kwargs):
    raise ValueError("External URL and file access are disabled in report export.")


def prepare_report(source_html: str) -> BeautifulSoup:
    """Keep the same DOM as HTML View, excluding controls and collapsed details."""
    if not isinstance(source_html, str) or len(source_html) > MAX_DOCUMENT:
        raise ValueError("HTML report exceeds the 1.5 MB limit.")
    soup = BeautifulSoup(source_html, "html.parser")
    for tag in list(soup.find_all(["script", "iframe", "object", "embed",
                                   "form", "button", "svg", "video", "audio",
                                   "link", "meta"])):
        tag.decompose()
    for tag in list(soup.find_all(attrs={"data-evidence-upload": True})):
        tag.decompose()
    for tag in list(soup.find_all("details")):
        summary = tag.find("summary", recursive=False)
        if not tag.has_attr("open"):
            if summary:
                summary.name = "p"
                summary["class"] = ["report-details-caption"]
                summary.attrs.pop("style", None)
                tag.replace_with(summary)
            else:
                tag.decompose()
        else:
            if summary:
                summary.name = "p"
                summary["class"] = ["report-details-caption"]
            tag.unwrap()
    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            if attr.lower().startswith("on"):
                tag.attrs.pop(attr, None)
            if attr == "style":
                style = tag.attrs[attr]
                if isinstance(style, str):
                    tag.attrs[attr] = re.sub(r"url\s*\([^)]*\)", "none", style, flags=re.I)
    for style in soup.find_all("style"):
        raw = style.string or style.get_text()
        raw = re.sub(r"@import\b[^;]*;", "", raw, flags=re.I)
        raw = re.sub(r"url\s*\([^)]*\)", "none", raw, flags=re.I)
        style.string = raw
    article = soup.select_one("article.stp-design-paper") or soup.select_one("article.paper")
    if article is None:
        if not soup.body or not soup.body.get_text(" ", strip=True):
            raise ValueError("HTML report contains no visible report content.")
    elif not article.get_text(" ", strip=True):
        raise ValueError("HTML report body is empty.")
    return soup


def _pdf(source_html: str) -> bytes:
    soup = prepare_report(source_html)
    style = soup.new_tag("style")
    style.string = _PRINT_CSS
    if soup.head:
        soup.head.append(style)
    else:
        soup.insert(0, style)
    return HTML(string=str(soup), url_fetcher=_no_remote_fetch).write_pdf()


def _fill(cell, value: str):
    pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), value)
    pr.append(shd)


def _left_border(cell, value: str):
    pr = cell._tc.get_or_add_tcPr()
    borders = pr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        pr.append(borders)
    el = OxmlElement("w:left")
    el.set(qn("w:val"), "single")
    el.set(qn("w:sz"), "24")
    el.set(qn("w:color"), value)
    borders.append(el)


def _t(node) -> str:
    if isinstance(node, NavigableString):
        return str(node)
    if isinstance(node, Tag):
        return node.get_text(" ", strip=True)
    return ""


def _inline(par, node, bold=False, code=False):
    if isinstance(node, NavigableString):
        if str(node):
            run = par.add_run(str(node))
            run.bold = bold
            if code:
                run.font.name = "Consolas"
                run.font.size = Pt(8)
        return
    if not isinstance(node, Tag):
        return
    is_bold = bold or node.name in ("strong", "b", "th")
    is_code = code or node.name == "code"
    for child in node.children:
        _inline(par, child, is_bold, is_code)


def _set_paragraph(target, node, style=None):
    p = target.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.keep_together = True
    _inline(p, node)
    return p


def _metric_grid(target, node):
    metrics = node.select(":scope > .metric")
    if not metrics:
        return
    cols = min(4, len(metrics))
    table = target.add_table(rows=(len(metrics)+cols-1)//cols, cols=cols)
    for i, metric in enumerate(metrics):
        cell = table.cell(i//cols, i%cols)
        _fill(cell, "EDF4F9")
        cell.text = ""
        p = cell.paragraphs[0]
        num = metric.find(["b", "strong"])
        label = metric.find("span")
        r = p.add_run(_t(num) if num else metric.get_text(" ", strip=True))
        r.bold = True; r.font.size = Pt(17);r.font.color.rgb = RGBColor(23, 63, 93)
        if label:
            p2 = cell.add_paragraph(_t(label))
            p2.style = "Caption"
    target.add_paragraph().paragraph_format.space_after = Pt(2)


def _table(target, node):
    rows = node.find_all("tr")
    if not rows:
        return
    ncols = max(len(row.find_all(["th", "td"], recursive=False)) for row in rows)
    if ncols == 0:
        return
    table = target.add_table(rows=len(rows), cols=ncols)
    table.style = "Table Grid"
    for i, row in enumerate(rows):
        fields = row.find_all(["th", "td"], recursive=False)
        for j, field in enumerate(fields):
            cell = table.cell(i, j)
            if i == 0 and (field.name == "th" or not node.find("thead")):
                _fill(cell, "EAF1F6")
            cell.text = ""
            p = cell.paragraphs[0]
            _inline(p, field)
            p.paragraph_format.space_after = Pt(2)
            for run in p.runs:
                run.font.size = Pt(8)
                if field.name == "th":
                    run.bold = True
    target.add_paragraph().paragraph_format.space_after = Pt(3)


def _card(target, node):
    status = str(node.get("data-finding-status", "")).upper()
    accent, fill = _PALETTE.get(status, ("80ABC4", "F5F9FC"))
    tbl = target.add_table(rows=1, cols=1)
    cell = tbl.cell(0,0)
    _fill(cell, fill)
    _left_border(cell, accent)
    for child in list(node.children):
        _render(cell, child)
    # Native cell starts with an empty paragraph; remove only its empty text.
    target.add_paragraph().paragraph_format.space_after = Pt(1)


def _render(target, node):
    if isinstance(node, NavigableString):
        if str(node).strip():
            p = target.add_paragraph()
            p.add_run(str(node).strip())
        return
    if not isinstance(node, Tag):
        return
    name = node.name
    if name in ("script", "style", "head", "button", "link"):
        return
    classes = set(node.get("class", []))
    if "summary-grid" in classes:
        _metric_grid(target, node)
        return
    if name == "table":
        _table(target, node)
        return
    if "decision" in classes:
        _card(target, node)
        return
    if name in ("h1", "h2", "h3", "h4"):
        level = {"h1":1, "h2":2, "h3":3, "h4":4}[name]
        p = target.add_paragraph(style=f"Heading {level}")
        _inline(p,node)
        p.paragraph_format.keep_with_next = True
        return
    if name in ("p", "pre", "li", "summary"):
        style = "List Bullet" if name == "li" else "Normal"
        p = _set_paragraph(target, node, style)
        if name == "pre":
            for r in p.runs:
                r.font.name = "Consolas";r.font.size = Pt(7)
        if "report-meta" in classes or "report-muted" in classes:
            for r in p.runs:
                r.font.size = Pt(8);r.font.color.rgb = RGBColor(80, 103, 121)
        return
    if name in ("div", "section", "article", "body", "main", "header", "footer", "ol", "ul"):
        # A header row normally has a strong title and colored status label.
        if "cto-finding-head" in classes:
            p = target.add_paragraph()
            for child in node.children:
                _inline(p,child)
            return
        for child in node.children:
            _render(target, child)
        return
    if name in ("strong", "b", "span", "small", "a", "code"):
        p = target.add_paragraph()
        _inline(p,node)
        return
    for child in node.children:
        _render(target, child)


def _word(source_html: str, title: str) -> bytes:
    soup = prepare_report(source_html)
    report = soup.select_one("article.stp-design-paper") or soup.select_one("article.paper") or soup.body
    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Inches(8.27);sec.page_height = Inches(11.69)
    sec.top_margin = Inches(.72);sec.bottom_margin = Inches(.72)
    sec.left_margin = Inches(.72);sec.right_margin = Inches(.72)
    doc.core_properties.title = title[:200]
    normal = doc.styles["Normal"]
    normal.font.name = "Aptos"
    normal.font.size = Pt(9)
    normal.font.color.rgb = RGBColor(30, 49, 64)
    normal.paragraph_format.space_after = Pt(6)
    for i in range(1,5):
        h = doc.styles[f"Heading {i}"]
        h.font.name = "Aptos Display";h.font.bold = True
        h.font.color.rgb = RGBColor(23, 63, 93)
    for child in report.children:
        _render(doc,child)
    f = sec.footer.paragraphs[0]
    f.text = "Network Configurator · Engineering Assessment"
    f.style = "Caption"
    out = BytesIO();doc.save(out);return out.getvalue()


def export_report(source_html: str, report_format: str, title="Network Engineering Assessment") -> bytes:
    if report_format == "pdf":
        return _pdf(source_html)
    if report_format == "word":
        return _word(source_html, title)
    raise ValueError("Unsupported report format.")
