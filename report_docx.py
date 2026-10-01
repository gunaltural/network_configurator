"""Create an editable network design report from a planned project."""

from datetime import datetime, timezone
from io import BytesIO
import base64
import binascii

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


def _shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def _border(cell):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right"):
        element = OxmlElement(f"w:{edge}")
        element.set(qn("w:val"), "single")
        element.set(qn("w:color"), "D9D9D9")
        element.set(qn("w:sz"), "4")
        borders.append(element)


def _padding(cell):
    tc_pr = cell._tc.get_or_add_tcPr()
    margins = OxmlElement("w:tcMar")
    for edge in ("top", "start", "bottom", "end"):
        node = OxmlElement(f"w:{edge}")
        node.set(qn("w:w"), "95")
        node.set(qn("w:type"), "dxa")
        margins.append(node)
    tc_pr.append(margins)


def _table(doc, columns, widths, rows):
    table = doc.add_table(rows=1, cols=len(columns))
    table.autofit = False
    for index, (label, width) in enumerate(zip(columns, widths)):
        cell = table.rows[0].cells[index]
        cell.width = Inches(width)
        cell.text = label
    header = table.rows[0]
    header._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
    for cell in header.cells:
        _shade(cell, "E6EFF6")
        for run in cell.paragraphs[0].runs:
            run.bold = True
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        for index, value in enumerate(values):
            cells[index].width = Inches(widths[index])
            cells[index].text = str(value)
            if row_index % 2:
                _shade(cells[index], "F7FAFC")
    for row in table.rows:
        row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        for cell in row.cells:
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            _border(cell)
            _padding(cell)
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_after = Pt(0)
                for run in paragraph.runs:
                    run.font.size = Pt(9)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return table


def _technology_text(project, placement):
    descriptions = {
        "vPC": "The design plans Cisco NX-OS virtual port channel redundancy. Assign device pairs, peer links, keepalive paths and member port channels before deployment.",
        "MLAG": "The design plans Arista MLAG redundancy. Assign device pairs, peer links and downstream port channels before deployment.",
        "M-LAG": "The design plans Huawei M-LAG redundancy using DFS and Eth-Trunk. Assign device pairs, peer links and heartbeat paths before deployment.",
        "STP": "The design uses spanning tree for loop prevention. Engineer root placement, link roles and edge-port protection before deployment.",
        "EVPN/VXLAN": "The design plans an EVPN/VXLAN fabric. Engineer underlay reachability, VTEPs, VNI mappings and BGP EVPN adjacencies separately.",
        "SD-WAN": "The SD-WAN edge design does not yet include a selected router configuration. Complete the router details in Technology Workspaces and reopen the report.",
        "None": "A redundancy or overlay technology has not yet been selected.",
    }
    text = descriptions.get(project["technology"], "The selected technology requires detailed engineering before deployment.")
    if project["technology"] != "None":
        text += f" Planned placement: {placement} tier."
    return text


def build_report_docx(project):
    """Return a Word file in memory with planned topology and configuration."""
    language = "tr" if project.get("language") == "tr" else "en"
    words = {
        "tr": {"subtitle":"Ağ tasarımı ve cihaz envanteri","draft":"Taslak rapor","overview":"Proje özeti","scope":"Proje kapsamı ve tasarım amacı mühendis tarafından girilmelidir.","topology":"Planlanan topoloji","upper":"Üst katman","lower":"Alt katman","schedule":"Bağlantı çizelgesi","device":"Cihaz","port":"Port","connection":"Bağlantı / hız","none":"Fiziksel bağlantı modellenmedi","special":"Özel bağlantılar ve kontrol yolları","type":"Tür","endpoint_a":"Uç A / port","endpoint_b":"Uç B / port","details":"Detaylar","logical":"mantıksal","logical_note":"Mantıksal kontrol yolları uçları gösterir; doğrudan fiziksel kablo anlamına gelmez.","approach":"Teknoloji yaklaşımı","intent":"Bu bölüm tasarım amacını gösterir; operasyonel durum henüz doğrulanmamıştır.","decisions":"Teknoloji kararları ve ağa etkileri","decision_note":"Mimari ve operasyonel davranış seçilen tasarımı yansıtır. Gerçek trafik iletimi eş cihaz konfigürasyonu ve cihaz durumuna bağlıdır.","assumptions":"Tasarım varsayımları ve uygulama notları","inventory":"Cihaz envanteri","role":"Rol","model":"Model","serial":"Seri numarası","source":"Kaynak","pending":"Atama bekliyor","external":"Harici","planned":"Planlandı","confirm":"Doğrulanacak hususlar","appendix":"Ek · Planlanan cihaz konfigürasyonları","config_note":"Üretilen konfigürasyonlar tasarım girdilerini yansıtır ve cihaz üzerinde doğrulanmamıştır. Kullanımdan önce hedef model ve yazılım sürümüyle karşılaştırılmalıdır."},
        "en": {"subtitle":"Network design and device inventory","draft":"Draft report","overview":"Project overview","scope":"Project scope and design intent await engineer input.","topology":"Planned topology","upper":"Upper tier","lower":"Lower tier","schedule":"Connection schedule","device":"Device","port":"Port","connection":"Connection / speed","none":"No physical links modeled","special":"Special connections and control paths","type":"Type","endpoint_a":"Endpoint A / port","endpoint_b":"Endpoint B / port","details":"Details","logical":"logical","logical_note":"Logical control paths identify endpoints; they do not imply a direct physical cable.","approach":"Technology approach","intent":"Design intent only; operational state has not been verified.","decisions":"Technology decisions and network impact","decision_note":"Architecture and operational behavior reflect the selected design. Actual forwarding depends on peer configuration and device state.","assumptions":"Design assumptions and implementation notes","inventory":"Device inventory","role":"Role","model":"Model","serial":"Serial","source":"Source","pending":"Awaiting assignment","external":"External","planned":"Planned","confirm":"Items to confirm","appendix":"Appendix · Planned device configurations","config_note":"Generated configurations reflect design inputs and have not been validated on a device. Review against the target model and software release before use."}
    }[language]
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.left_margin = section.right_margin = Inches(.7)
    section.top_margin = section.bottom_margin = Inches(.7)

    styles = doc.styles
    styles["Normal"].font.name = "Arial"
    styles["Normal"].font.size = Pt(10)
    styles["Normal"].paragraph_format.space_after = Pt(7)
    for style_name, size in (("Title", 21), ("Heading 1", 13), ("Heading 2", 12)):
        style = styles[style_name]
        style.font.name = "Arial"
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.space_before = Pt(14 if style_name == "Heading 1" else 0)
        style.paragraph_format.space_after = Pt(8)
    title_style = styles["Title"].element
    title_properties = title_style.pPr
    if title_properties is not None:
        border = title_properties.find(qn("w:pBdr"))
        if border is not None:
            title_properties.remove(border)
    styles["Subtitle"].font.name = "Arial"
    styles["Subtitle"].font.size = Pt(12)
    styles["Subtitle"].font.italic = False
    styles["Subtitle"].font.color.rgb = RGBColor(0, 0, 0)

    name = project["name"].strip()
    title = doc.add_paragraph(name, style="Title")
    title.paragraph_format.keep_with_next = True
    doc.add_paragraph(words["subtitle"], style="Subtitle")
    roles = project.get("roles") or {}
    upper = roles.get("upper") or ("Core" if project["architecture"] == "core-access" else "Spine")
    lower = roles.get("lower") or ("Access" if project["architecture"] == "core-access" else "Leaf")
    if language == "tr":
        role_names = {"Device":"Cihaz", "Peer":"Eş cihaz", "Router":"Yönlendirici", "CE router":"CE yönlendirici", "ISP router":"ISP yönlendirici", "Network device": "Ağ cihazı", "Managed device": "Yönetilen cihaz", "Edge router": "Uç yönlendirici", "External endpoint": "Harici uç", "DC-1 node": "DC-1 düğümü", "DC-2 node": "DC-2 düğümü"}
        upper, lower = role_names.get(upper, upper), role_names.get(lower, lower)
    vendor = "Huawei CloudEngine" if project["vendor"] == "Huawei_CE_SW" else project["vendor"]
    now = datetime.now(timezone.utc)
    months_tr = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
    report_date = f"{now.day} {months_tr[now.month-1]} {now.year}" if language == "tr" else now.strftime("%d %B %Y")
    doc.add_paragraph(f"{words['draft']}  |  {report_date}  |  {vendor}")

    doc.add_heading(words["overview"], level=1)
    architecture = ("Module topology" if project["architecture"] == "module" else
                    "Core Access" if project["architecture"] == "core-access" else "Spine Leaf")
    if language == "tr":
        architecture = {"Module topology": "Modül topolojisi", "Core Access": "Core–Access", "Spine Leaf": "Spine–Leaf"}[architecture]
    if language == "tr":
        overview = (f"Planlanan {architecture} mimarisinde {project['upperCount']} {upper}"
                    + (f" ve {project['lowerCount']} {lower}" if project["lowerCount"] else "")
                    + f" bulunur; kullanılan teknoloji {project['technology']} olarak seçilmiştir.")
    else:
        overview = (f"The planned {architecture} has {project['upperCount']} {upper.lower()} "
                    + ("device" if project["upperCount"] == 1 else "devices")
                    + (f" and {project['lowerCount']} {lower.lower()} "
                       + ("device" if project["lowerCount"] == 1 else "devices") if project["lowerCount"] else "")
                    + f" and uses {project['technology']}.")
    doc.add_paragraph(overview)
    doc.add_paragraph(project["scope"].strip() or words["scope"])
    if project.get("projectInformation"):
        doc.add_heading("Proje bilgileri ve gereksinimler" if language == "tr" else "Project information and requirements", level=2)
        for item in project["projectInformation"]:
            paragraph = doc.add_paragraph()
            paragraph.add_run(item["label"] + "\n").bold = True
            paragraph.add_run(item.get("impact") or item.get("value", ""))

    devices = {device["id"]: device for device in project["devices"]}
    active = [link for link in project["links"] if link["enabled"]]
    device_name = lambda device: device["hostname"] or f"{upper if device['tier'] == 'upper' else lower}-{device['index']:02d}"

    doc.add_heading(words["topology"], level=1)
    doc.add_paragraph(
        f"{upper} {'katmanı' if language == 'tr' else 'tier'}: " + ", ".join(device_name(d) for d in project["devices"] if not d.get("inventoryOnly") and d["tier"] == "upper")
    )
    if project["lowerCount"]:
        doc.add_paragraph(
            f"{lower} {'katmanı' if language == 'tr' else 'tier'}: " + ", ".join(device_name(d) for d in project["devices"] if not d.get("inventoryOnly") and d["tier"] == "lower")
        )
    def add_topology_image(topology_png):
        if not topology_png:
            return
        prefix = "data:image/png;base64,"
        if not topology_png.startswith(prefix):
            raise ValueError("Invalid topology image format")
        try:
            picture = base64.b64decode(topology_png[len(prefix):], validate=True)
        except binascii.Error as exc:
            raise ValueError("Invalid topology image encoding") from exc
        if len(picture) > 2250000 or not picture.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Invalid topology PNG")
        doc.add_picture(BytesIO(picture), width=Inches(6.9))
    if project.get("moduleReports"):
        for module in project["moduleReports"]:
            doc.add_heading(module["title"] + " · " + ("Huawei CloudEngine" if module["vendor"] == "Huawei_CE_SW" else module["vendor"]), level=2)
            add_topology_image(module.get("topologyPng", ""))
    else:
        add_topology_image(project.get("topologyPng", ""))
    doc.add_heading(words["schedule"], level=1)
    _table(
        doc,
        [f"{upper} {words['device'].lower()}", words["port"], f"{lower} {words['device'].lower()}", words["port"], words["connection"]],
        [1.55, 1.1, 1.55, 1.1, 1.65],
        [[device_name(devices[l["a"]]), l["upperPort"] or ("Belirlenecek" if language == "tr" else "TBD"), device_name(devices[l["b"]]), l["lowerPort"] or ("Belirlenecek" if language == "tr" else "TBD"), " · ".join(filter(None, [l.get("detail"), l["speed"]])) or "TBD"] for l in active]
        or [[words["none"], "", "", "", ""]],
    )
    if project.get("specialLinks"):
        doc.add_heading(words["special"], level=2)
        _table(
            doc,
            [words["type"], words["endpoint_a"], words["endpoint_b"], words["details"]],
            [1.25, 1.8, 1.8, 2.1],
            [[link["kind"] + (f" ({words['logical']})" if link["logical"] else ""),
              device_name(devices[link["a"]]) + " · " + (link["aPort"] or ("Belirlenecek" if language == "tr" else "TBD")),
              device_name(devices[link["b"]]) + " · " + (link["bPort"] or ("Belirlenecek" if language == "tr" else "TBD")), link["detail"]]
             for link in project["specialLinks"]],
        )
        doc.add_paragraph(words["logical_note"])

    doc.add_heading(words["approach"], level=1)
    placement = upper if project["techPlacement"] == "upper" else lower
    doc.add_paragraph(
        (f"Planlanan {project['technology']} tasarımı {vendor} platformunu kullanır. Cihaz konfigürasyon önerileri ekte sunulmuştur."
         if project.get("configurations") else f"Seçilen {project['technology']} teknolojisi devreye alma öncesinde ayrıntılı mühendislik ve arıza senaryosu doğrulaması gerektirir.")
        if language == "tr" else
        (f"The planned {project['technology']} design uses {vendor}. Device configuration proposals are included in the appendix."
         if project.get("configurations") else _technology_text(project, placement))
    )
    doc.add_paragraph(words["intent"])
    decisions = [item for item in project.get("parameters", []) if item["value"] != "Design boundary"]
    design_notes = [item for item in project.get("parameters", []) if item["value"] == "Design boundary"]
    if decisions:
        doc.add_heading(words["decisions"], level=2)
        doc.add_paragraph(words["decision_note"])
        for item in decisions:
            paragraph = doc.add_paragraph()
            paragraph.paragraph_format.keep_together = True
            paragraph.add_run(f"{item['label']} · {item['value']}\n").bold = True
            paragraph.add_run(item.get("impact") or "This saved project predates design explanations; reopen the Technology Workspace to regenerate this decision.")
    if design_notes:
        doc.add_heading(words["assumptions"], level=2)
        for item in design_notes:
            paragraph = doc.add_paragraph()
            paragraph.paragraph_format.keep_together = True
            paragraph.add_run(f"{item['label']}\n").bold = True
            paragraph.add_run(item.get("impact") or "")

    doc.add_page_break()
    doc.add_heading(words["inventory"], level=1)
    inventory_ids = project.get("inventoryDeviceIds")
    inventory = [d for d in project["devices"] if inventory_ids is None or d["id"] in inventory_ids]
    source = lambda value: (("Cihazdan doğrulandı" if value == "device" else "Mühendis girişi" if value == "manual" else "Atama bekliyor") if language == "tr" else ("Verified from device" if value == "device" else "Engineer entry" if value == "manual" else "Awaiting assignment"))
    inventory_table = _table(
        doc,
        [words["device"], words["role"], words["model"], words["serial"], "Yazılım sürümü" if language == "tr" else "Software version", words["source"]],
        [1.4, .7, 1.3, 1.2, 1.1, 1.4],
        [[device_name(d) + ("\n" + d["observedHostname"] if d.get("observedHostname") and d["observedHostname"] != device_name(d) else ""), ("Envanter cihazı" if language == "tr" else "Inventory device") if d.get("inventoryOnly") else upper if d["tier"] == "upper" else lower, d["model"] or (words["external"] if d.get("external") else words["pending"]), d["serial"] or (words["external"] if d.get("external") else words["pending"]), d.get("softwareVersion") or words["pending"],
          ("Harici eş" if language == "tr" else "External peer") if d.get("external") else " / ".join(dict.fromkeys(source(d.get(k)) for k in ("modelSource", "serialSource", "softwareSource") if d.get(k))) if d["modelSource"] or d["serialSource"] else words["planned"]]
         for d in inventory] or [["Henüz envanter kaydı yok; Inventory modülünden veri ekleyin." if language == "tr" else "No inventory records yet; add data in Inventory.", "", "", "", "", ""]],
    )

    if not inventory:
        cell = inventory_table.rows[1].cells[0].merge(inventory_table.rows[1].cells[-1])
        cell.text = "Henüz envanter kaydı yok; Inventory modülünden veri ekleyin." if language == "tr" else "No inventory records yet; add data in Inventory."
        for run in cell.paragraphs[0].runs:
            run.font.size = Pt(9)

    doc.add_heading(words["confirm"], level=1)
    if project.get("maintenanceNotes"):
        doc.add_heading("Bakım değerlendirmesi ve upgrade planı" if language == "tr" else "Maintenance assessment and upgrade plan", level=1)
        for item in project["maintenanceNotes"]:
            doc.add_heading(item["label"], level=2)
            doc.add_paragraph(item["value"])
            doc.add_paragraph(item.get("impact") or "")
    incomplete = sum(not d.get("external") and (not d["model"] or not d["serial"]) for d in inventory)
    missing_ports = sum(not l["upperPort"] or not l["lowerPort"] for l in active)
    doc.add_paragraph(
        ((f"{incomplete} cihaz için model veya seri numarası tamamlanmalıdır. " if incomplete else "Tüm cihaz modelleri ve seri numaraları doldurulmuştur. " if inventory else "Henüz envanter kaydı yok; model ve seri numarası doğrulanmamıştır. ")
         + (f"{missing_ports} aktif bağlantının bir veya iki ucunda port bilgisi eksiktir. " if missing_ports else "Tüm aktif bağlantı uçlarının portları atanmıştır. " if active else "Fiziksel bağlantı modellenmedi; port eşlemesi doğrulanmamıştır. ")
         + "Cihazdan okunan envanter proje kapanışından önce planlanan malzeme listesiyle karşılaştırılmalıdır.")
        if language == "tr" else
        ((f"{incomplete} {'device still needs' if incomplete == 1 else 'devices still need'} a model or serial number. " if incomplete else "All device models and serial numbers are populated. " if inventory else "No inventory records yet; model and serial numbers have not been verified. ")
         + (f"{missing_ports} active {'link still needs' if missing_ports == 1 else 'links still need'} a port at one or both ends. " if missing_ports else "All active link endpoint ports are assigned. " if active else "No physical links modeled; port mapping is unverified. ")
         + "Compare device-sourced inventory with the intended bill of materials before closeout.")
    )
    if project.get("configurations"):
        doc.add_page_break()
        doc.add_heading(words["appendix"], level=1)
        doc.add_paragraph(words["config_note"])
        configurations = {config["deviceId"]: config for config in project["configurations"]}
        configured_devices = [device for device in project["devices"] if device["id"] in configurations]
        for index, device in enumerate(configured_devices):
            config = configurations[device["id"]]
            doc.add_heading(device_name(device), level=2)
            doc.add_paragraph(config["source"])
            for line in config["text"].splitlines():
                paragraph = doc.add_paragraph(style="Normal")
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.line_spacing = 1.0
                run = paragraph.add_run(line or " ")
                run.font.name = "Courier New"
                run.font.size = Pt(8)
            if index < len(configured_devices) - 1:
                doc.add_page_break()
    doc.core_properties.title = name
    doc.core_properties.author = "Network Configurator"
    output = BytesIO()
    doc.save(output)
    output.seek(0)
    return output
