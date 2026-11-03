"""Read-only vPC engineering rules for CLI Analysis.

Rules evaluate both presence and absence of design features, but never infer
operational failure from missing optional configuration. All findings cite
the supplied evidence IDs and line numbers. No device changes.
"""
import re


def assess_vpc(evidence, language="tr"):
    sections = []
    for item in evidence:
        text = item["text"]
        header = re.search(r"(?im)^Command:\s*(.+)$", text)
        command = header.group(1).strip().lower() if header else ""
        if "vpc" not in command and not re.search(r"(?im)^L\d+:\s*(?:feature vpc|vpc domain \d+)", text):
            continue
        sections.append((item["id"], command, text))
    if not sections:
        return None

    tr = language == "tr"
    config = [(eid, text) for eid, cmd, text in sections if "running-config" in cmd and "vpc" in cmd]
    operational = [(eid, text) for eid, cmd, text in sections if re.match(r"show vpc(?:\s|$)", cmd)]
    # Missing-command checks require a complete, identifiable domain stanza.
    config_text = "\n".join(t for _, t in config)
    domain = re.search(r"(?im)^L(\d+):\s*vpc domain\s+(\d+)\s*$", config_text)
    if not domain:
        return None
    evidence_ids = [eid for eid, _ in config]
    cfg_lines = config_text.splitlines()
    domain_line = int(domain.group(1))
    domain_number = domain.group(2)
    domain_stanza = []
    started = False
    for line in cfg_lines:
        m = re.match(r"^L\d+:\s*(.*)$", line)
        if not m:
            continue
        value = m.group(1)
        if re.match(r"^vpc domain\s+\d+\s*$", value):
            started = True
            continue
        if started and value and not value[0].isspace():
            break
        if started:
            domain_stanza.append(value.strip())
    def has(name):
        return any(re.match(r"^" + re.escape(name) + r"(?:\s|$)", x) for x in domain_stanza)
    def operational_value(label):
        pattern = re.compile(r"(?im)^L(\d+):\s*" + re.escape(label) + r"\s*:\s*(.*?)\s*$")
        for eid, text in operational:
            m = pattern.search(text)
            if m:
                return m.group(2), eid + ":L" + m.group(1)
        return None, None
    cfg_ref = evidence_ids[0] + ":L" + str(domain_line)
    findings = []
    def add(key, status, title_tr, title_en, body_tr, body_en, reference):
        findings.append("### " + key + " — " + (title_tr if tr else title_en) + " [" + status + "]\n" + (body_tr if tr else body_en) + "\nEvidence: " + reference)

    if not has("peer-switch"):
        add("VPC-DESIGN-001", "REVIEW",
            "peer-switch yapılandırılmamış", "peer-switch not configured",
            "STP açısından ortak bridge identity davranışı sağlanmayabilir. STP root yerleşimi ve topology-change/convergence davranışı tasarıma bağlıdır. Komutun yokluğu tek başına loop veya arıza kanıtı değildir. Doğrula: show spanning-tree root; show spanning-tree vlan <id>.",
            "The peers may not share the peer-switch STP bridge identity. Root placement and convergence depend on topology; absence alone does not prove a loop or outage. Verify: show spanning-tree root; show spanning-tree vlan <id>.",
            cfg_ref)
    else:
        add("VPC-DESIGN-001", "PRESENT", "peer-switch mevcut", "peer-switch present",
            "STP root davranışı operasyonel STP çıktısıyla ayrıca doğrulanmalıdır.",
            "Verify the intended root behavior using operational STP output.", cfg_ref)

    gateway, gw_ref = operational_value("Peer Gateway")
    if not has("peer-gateway"):
        state = "REVIEW" if gateway else "NOT VERIFIED"
        add("VPC-DESIGN-002", state, "peer-gateway açıkça yapılandırılmamış",
            "peer-gateway not explicitly configured",
            ("Operasyonel çıktı Peer Gateway = " + gateway + " gösteriyor. " if gateway else "Operasyonel durum sağlanan kanıtlarda doğrulanmadı. ") +
            "Özellik gerçekten devre dışıysa peer router MAC adresine yöneltilen belirli L3-over-vPC akışlarında peer-link bağımlılığı ve forwarding riski oluşabilir. Komut yokluğundan özelliğin devre dışı olduğu sonucu çıkarılamaz. Doğrula: show running-config vpc; show vpc.",
            ("Operational output reports Peer Gateway = " + gateway + ". " if gateway else "Operational state is not verified. ") +
            "If actually disabled, traffic to a peer router MAC may rely on peer-link forwarding in certain L3-over-vPC designs. Missing config alone does not prove it is disabled. Verify: show running-config vpc; show vpc.",
            cfg_ref + (", " + gw_ref if gw_ref else ""))
    else:
        add("VPC-DESIGN-002", "PRESENT", "peer-gateway mevcut", "peer-gateway present",
            "Operasyonel durum ayrıca kontrol edilmelidir.", "Check operational state independently.", cfg_ref)

    for label, key, good in (
        ("Peer status", "VPC-OPER-001", "peer adjacency formed ok"),
        ("vPC keep-alive status", "VPC-OPER-002", "peer is alive"),
        ("Configuration status", "VPC-OPER-003", "success"),
        ("Per-vlan consistency status", "VPC-OPER-004", "success"),
    ):
        value, ref = operational_value(label)
        if value is not None:
            status = "PASS" if good in value.lower() else "REVIEW"
            add(key, status, label, label, value, value, ref)
    heading = ("# vPC Mühendislik Analizi — Domain " if tr else "# vPC Engineering Assessment — Domain ") + domain_number
    note = ("\n\n**Kapsam:** Konfigürasyon boşlukları, riskler ve operasyonel korelasyon. Fiziksel yedeklilik, STP root ve gerçek failover ölçülmedi. Bu çıktı mevcut vPC modülünün tüm kontrollerinin çalıştırıldığı anlamına gelmez."
            if tr else "\n\n**Scope:** Configuration gaps, risk and operational correlation. Physical redundancy, STP root and failover were not measured. This does not claim execution of every existing vPC module check.")
    return heading + "\n\n" + "\n\n".join(findings) + note
