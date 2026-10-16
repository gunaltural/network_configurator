"""Structured synthetic simulation scenarios shared by standalone and design reports."""
import base64
from io import BytesIO
from typing import Annotated, Literal
from pydantic import BaseModel, Field
from docx import Document
from docx.shared import Inches, Pt
from PIL import Image

Short = Annotated[str, Field(max_length=300)]
class SimulationPolicy(BaseModel):
    connection: Short
    localPreference: int = Field(ge=0, le=4294967295)
    prependCount: int = Field(ge=0, le=10)
class SimulationScenario(BaseModel):
    module: str = Field(default='', max_length=30)
    vendor: Short = ''
    technology: Short = ''
    sourceDevice: Short = ''
    targetDevice: Short = ''
    modelScope: str = Field(default='', max_length=3000)
    modelStatus: Short = ''
    findings: list[Short] = Field(default_factory=list, max_length=128)
    id: str = Field(max_length=200)
    createdAt: str = Field(max_length=40)
    direction: Literal['outbound', 'inbound']
    clientPrefix: str = Field(max_length=50)
    internetEntry: Short = ''
    preferredGateway: Short
    activeGateway: Short = ''
    backupGateway: Short = ''
    failedDevices: list[Short] = Field(default_factory=list, max_length=128)
    failedLinks: list[Short] = Field(default_factory=list, max_length=512)
    baselinePath: str = Field(max_length=3000)
    currentPath: str = Field(max_length=3000)
    reachable: bool
    pathChanged: bool
    gatewayChanged: bool
    policies: list[SimulationPolicy] = Field(default_factory=list, max_length=8)
    topologyPng: str = Field(default='', max_length=1500000)
class SimulationExport(BaseModel):
    name: str = Field(default='BGP simulation', min_length=1, max_length=120)
    language: Literal['en', 'tr'] = 'en'
    scenarios: list[SimulationScenario] = Field(min_length=1, max_length=40)

def _table(doc, rows):
    table = doc.add_table(rows=0, cols=2)
    table.style = 'Light Shading Accent 1'
    for label, value in rows:
        cells = table.add_row().cells
        cells[0].text, cells[1].text = str(label), str(value)
    doc.add_paragraph()

def _path(value, tr):
    if not tr: return value
    names = {'Client': 'İstemci', 'Shared LAN': 'Ortak LAN', 'No modeled path': 'Modellenen yol yok', 'No gateway': 'Ağ geçidi yok', 'Source device unavailable': 'Kaynak cihaz kullanılamıyor'}
    return ' → '.join(names.get(x, x) for x in value.split(' → '))

def append_simulation_scenarios(doc, scenarios, language='en'):
    if not scenarios: return
    tr = language == 'tr'
    doc.add_heading('Simülasyon ve failover senaryoları' if tr else 'Simulation and failover scenarios', level=1)
    doc.add_paragraph('Sentetik model sonuçlarıdır; gerçek cihaz, paket, kayıp veya yakınsama süresi ölçümü ve üretim kabul kanıtı değildir.' if tr else 'Synthetic model results; no real devices, packets, loss or convergence times are measured. These scenarios are not production acceptance evidence.')
    if not any((s.model_dump() if isinstance(s, BaseModel) else s).get("module") for s in scenarios):
        doc.add_paragraph('Her iki CE ortak istemci LAN’ına doğrudan bağlıdır. VRRP istemci çıkış ağ geçidini seçer; gelen trafik BGP politikasına göre yedek CE’den de geçebilir. Aktif CE arızasında sağlıklı yedek devralır; tercih edilen CE geri geldiğinde tekrar aktif olur. WAN izleme ve zamanlayıcılar modellenmez. Internet bulutu seçilen ISP sınırını gösterir; sağlayıcı transit ağı veya Internet genelinde yol seçimi modellenmez. ISP politikası prepend etkisini değiştirebilir.' if tr else 'Both CEs directly attach to the shared client LAN. VRRP selects the client outbound gateway; inbound BGP traffic may enter through the backup CE. Device failure promotes the healthy backup and restoration preempts to the preferred CE. WAN tracking and timers are not modeled. The Internet cloud represents the selected ISP boundary, not provider transit or Internet-wide route selection. Provider policy can override prepend.')
    for index, raw in enumerate(scenarios, 1):
        s = raw.model_dump() if isinstance(raw, BaseModel) else raw
        doc.add_heading(('Senaryo ' if tr else 'Scenario ') + str(index), level=2)
        if s.get('module'):
            _table(doc, [
                ('Modül / platform' if tr else 'Module / platform', s.get('technology', s['module']) + ' · ' + s.get('vendor', '')),
                ('Kaynak / hedef' if tr else 'Source / destination', s.get('sourceDevice','') + ' → ' + s.get('targetDevice','')),
                ('Model sonucu' if tr else 'Model result', s.get('modelStatus','')),
                ('Model kapsamı' if tr else 'Model scope', s.get('modelScope','')),
                ('Bulgular' if tr else 'Findings', '; '.join(s.get('findings',[])) or '—'),
            ])
        outcome = ('Erişilebilir' if s['reachable'] else 'Yol yok') if tr else ('Reachable' if s['reachable'] else 'No path')
        if s.get('module'):
            _table(doc, [
                ('Kayıt zamanı' if tr else 'Recorded at', s['createdAt']),
                ('Arızalı cihazlar' if tr else 'Failed devices', ', '.join(s['failedDevices']) or '—'),
                ('Arızalı bağlantılar' if tr else 'Failed connections', ', '.join(s['failedLinks']) or '—'),
                ('Başlangıç yolu' if tr else 'Baseline path', _path(s['baselinePath'],tr)),
                ('Senaryo yolu' if tr else 'Scenario path', _path(s['currentPath'],tr)),
            ])
        else:
            _table(doc, [
                ('Kayıt zamanı' if tr else 'Recorded at', s['createdAt']),
                ('Trafik yönü' if tr else 'Traffic direction', ('Çıkış · İstemci → Internet' if s['direction']=='outbound' else 'Giriş · Internet → İstemci') if tr else ('Outbound · Client → Internet' if s['direction']=='outbound' else 'Inbound · Internet → Client')),
                ('İstemci LAN prefix’i' if tr else 'Client LAN prefix', s['clientPrefix']),
                ('Internet girişi' if tr else 'Internet entry', s.get('internetEntry') or '—'),
                ('Tercih edilen / aktif / yedek VRRP' if tr else 'Preferred / active / backup VRRP', ' / '.join(s.get(k) or '—' for k in ['preferredGateway','activeGateway','backupGateway'])),
                ('Arızalı cihazlar' if tr else 'Failed devices', ', '.join(s['failedDevices']) or '—'),
                ('Devre dışı bağlantılar' if tr else 'Disabled connections', ', '.join(s['failedLinks']) or '—'),
                ('Arızasız başlangıç yolu' if tr else 'No-fault baseline path', _path(s['baselinePath'],tr)),
                ('Senaryo yolu' if tr else 'Scenario path', _path(s['currentPath'],tr)),
                ('Model sonucu' if tr else 'Model result', outcome),
                ('Yol değişimi / ağ geçidi değişimi' if tr else 'Path change / gateway change', ' / '.join(('Evet' if flag else 'Hayır') if tr else ('Yes' if flag else 'No') for flag in [s['pathChanged'],s['gatewayChanged']])),
            ])
        if s.get('topologyPng'):
            encoded=s['topologyPng']
            if not encoded.startswith('data:image/png;base64,'): raise ValueError('Invalid simulation topology image.')
            data=base64.b64decode(encoded.split(',',1)[1],validate=True)
            if not data.startswith(b'\x89PNG\r\n\x1a\n'): raise ValueError('Invalid simulation topology image.')
            image=Image.open(BytesIO(data))
            if image.width>2400 or image.height>2400: raise ValueError('Simulation topology image is too large.')
            doc.add_picture(BytesIO(data),width=Inches(6.5))
        doc.add_heading('Uygulanan sentetik politikalar' if tr else 'Applied synthetic policies', level=3)
        table=doc.add_table(rows=1,cols=3);table.style='Light Shading Accent 1'
        for cell, label in zip(table.rows[0].cells, ['Bağlantı' if tr else 'Connection','Local Preference','Ek AS kopyası' if tr else 'Extra AS copies']):cell.text=label
        for p in s['policies']:
            cells=table.add_row().cells
            for cell,value in zip(cells,[p['connection'],p['localPreference'],p['prependCount']]):cell.text=str(value)

def build_simulation_docx(payload):
    doc=Document();doc.sections[0].left_margin=doc.sections[0].right_margin=Inches(.7);doc.styles['Normal'].font.name='Arial';doc.styles['Normal'].font.size=Pt(10)
    doc.add_heading(payload['name'],0)
    append_simulation_scenarios(doc,payload['scenarios'],payload.get('language','en'))
    out=BytesIO();doc.save(out);out.seek(0);return out
