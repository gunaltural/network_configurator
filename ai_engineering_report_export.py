"""Network Configurator AI Analysis HTML report -> downloadable PDF / Word.
Uses only local Python libraries, never fetches external content, persists nothing.
The same sanitized, reviewer-visible HTML document feeds both formats.
"""
from __future__ import annotations
from html.parser import HTMLParser
from html import escape
from io import BytesIO
from typing import NamedTuple
import re

from docx import Document
from docx.shared import Inches as DocxInches, Pt as DocxPt, RGBColor
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

MAX_DOCUMENT = 1_500_000
MAX_BLOCKS = 2500
MAX_BLOCK_TEXT = 11000

class Block(NamedTuple):
    kind: str
    text: str

class ReportReader(HTMLParser):
    """Extract visible report prose/headers/table rows. No CSS, scripts or URLs."""
    BLOCKS = {'h1', 'h2', 'h3', 'h4', 'p', 'li', 'pre', 'summary', 'tr'}
    IGNORE = {'script', 'style', 'svg', 'iframe', 'button', 'noscript'}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks: list[Block] = []
        self.stack: list[list] = []
        self.ignore_depth = 0
        self.depth = 0
    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in self.IGNORE:
            self.ignore_depth += 1
        if self.ignore_depth:
            return
        if tag in self.BLOCKS:
            if len(self.blocks) + len(self.stack) >= MAX_BLOCKS:
                return
            self.stack.append([tag, []])
        elif tag in ('td', 'th') and self.stack and self.stack[-1][0] == 'tr':
            self.stack[-1][1].append(' | ')
        elif tag == 'br' and self.stack:
            self.stack[-1][1].append('\n')
    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in self.IGNORE:
            self.ignore_depth = max(0, self.ignore_depth - 1)
            return
        if self.ignore_depth or not self.stack:
            return
        if tag in self.BLOCKS and self.stack[-1][0] == tag:
            kind, chunks = self.stack.pop()
            raw = ''.join(chunks)
            content = (raw.strip() if kind == 'pre' else re.sub(r'\s+', ' ', raw).strip())
            content = content.strip(' |')
            if content:
                text = content[:MAX_BLOCK_TEXT]
                if self.stack:
                    self.stack[-1][1].append(text+' ')
                else:
                    self.blocks.append(Block(kind,text))
    def handle_data(self, data):
        if not self.ignore_depth and self.stack:
            self.stack[-1][1].append(data[:MAX_BLOCK_TEXT])
    def parse(self, source: str):
        if len(source) > MAX_DOCUMENT:
            raise ValueError('HTML report exceeds the 1.5 MB export limit.')
        self.feed(source)
        self.close()
        if not self.blocks:
            raise ValueError('HTML report contains no readable content.')
        return self.blocks

def _plain(blocks):
    for item in blocks:
        txt = item.text.replace('\x00',' ').strip()
        if txt:
            yield Block(item.kind,txt)

def _word(blocks, title: str) -> bytes:
    doc = Document()
    section = doc.sections[0]
    section.top_margin = DocxInches(.8)
    section.bottom_margin = DocxInches(.75)
    section.left_margin = DocxInches(.85)
    section.right_margin = DocxInches(.85)
    normal = doc.styles['Normal']
    normal.font.name = 'Aptos'
    normal.font.size = DocxPt(9)
    normal.font.color.rgb = RGBColor(36, 56, 71)
    normal.paragraph_format.space_after = DocxPt(5)
    doc.core_properties.title = title[:200]
    heading_seen = False
    for b in _plain(blocks):
        text = b.text[:MAX_BLOCK_TEXT]
        if b.kind in ('h1','h2','h3','h4'):
            level={'h1':0,'h2':1,'h3':2,'h4':3}[b.kind]
            if level == 0 and not heading_seen:
                doc.add_heading(text,0);heading_seen=True
            else:
                doc.add_heading(text,level if level>0 else 1)
        elif b.kind == 'li':
            doc.add_paragraph(text,style='List Bullet')
        else:
            para = doc.add_paragraph()
            if b.kind == 'summary':
                para.add_run(text).bold=True
            elif b.kind == 'pre':
                run=para.add_run(text)
                run.font.name='Consolas'
                run.font.size=DocxPt(7)
            else:
                para.add_run(text)
    footer = section.footer.paragraphs[0]
    footer.text='Network Configurator · Engineering Assessment · exported snapshot'
    footer.style='Caption'
    b=BytesIO();doc.save(b);return b.getvalue()

def _pdf(blocks, title: str) -> bytes:
    output=BytesIO()
    page_w,page_h=A4
    document=SimpleDocTemplate(output,pagesize=A4,
        leftMargin=18*mm,rightMargin=18*mm,topMargin=18*mm,bottomMargin=18*mm,
        title=title[:200],author='Network Configurator')
    base=dict(fontName='Helvetica',textColor=colors.HexColor('#253b4c'),
        leading=13,spaceAfter=6,alignment=TA_LEFT,wordWrap='CJK')
    styles={
      'h1':ParagraphStyle('nc_h1',**{**base,'fontName':'Helvetica-Bold','fontSize':19,'leading':23,'spaceBefore':9,'spaceAfter':12}),
      'h2':ParagraphStyle('nc_h2',**{**base,'fontName':'Helvetica-Bold','fontSize':13,'leading':17,'spaceBefore':16,'spaceAfter':8}),
      'h3':ParagraphStyle('nc_h3',**{**base,'fontName':'Helvetica-Bold','fontSize':11,'leading':15,'spaceBefore':11}),
      'h4':ParagraphStyle('nc_h4',**{**base,'fontName':'Helvetica-Bold','fontSize':10,'leading':14,'spaceBefore':8}),
      'p':ParagraphStyle('nc_p',**{**base,'fontSize':9}),
      'li':ParagraphStyle('nc_li',**{**base,'fontSize':9,'leftIndent':13}),
      'pre':ParagraphStyle('nc_pre',**{**base,'fontName':'Courier','fontSize':7,'leading':10}),
      'tr':ParagraphStyle('nc_row',**{**base,'fontSize':8,'leftIndent':8,'spaceAfter':3}),
      'summary':ParagraphStyle('nc_sum',**{**base,'fontName':'Helvetica-Bold','fontSize':9,'spaceBefore':7}),
    }
    story=[]
    for block in _plain(blocks):
        kind=block.kind
        content=escape(block.text[:MAX_BLOCK_TEXT]).replace('\n','<br/>')
        if not content:continue
        # Split very long CLI evidence paragraphs so PDF rendering stays bounded.
        pieces=[content[i:i+4000] for i in range(0,len(content),4000)]
        for p in pieces:
            story.append(Paragraph(p,styles.get(kind,styles['p'])))
        if kind=='h1':
            story.append(HRFlowable(width='100%',thickness=1,color=colors.HexColor('#94b4c8')))
    if not story:
        raise ValueError('Empty report.')
    def footer(canvas,doc):
        canvas.saveState()
        canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#657b8b'))
        canvas.drawString(18*mm,12*mm,'Network Configurator | Engineering Assessment')
        canvas.drawRightString(page_w-18*mm,12*mm,str(doc.page))
        canvas.restoreState()
    document.build(story,onFirstPage=footer,onLaterPages=footer)
    return output.getvalue()

def export_report(source_html: str, report_format: str, title='Network Engineering Assessment') -> bytes:
    if report_format not in ('pdf','word'):
        raise ValueError('Unsupported report format.')
    blocks=ReportReader().parse(source_html)
    return _pdf(blocks,title) if report_format=='pdf' else _word(blocks,title)
