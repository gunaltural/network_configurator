# Kör vaka değerlendirmesi · 1 Kasım 2026

[Gerçek model koşusu](https://github.com/gunaltural/network_configurator/actions/runs/41245719560) · test edilen commit: a6610f2a9a063ed3e7300105a0c48446fc958875. Sekiz yeni sentetik komut kaydı, dört teknoloji ailesi. Tarayıcıdaki ayrıştırıcı ve uygulamanın gerçek yerel model API yolu kullanıldı. Modele vaka kimliği, soru, beklenen sonuç veya puanlama anahtarı gönderilmedi. Bu bir laboratuvar koşusudur, canlı müşteri TAC doğrulaması değildir. HTTP 200 veya yeşil iş durumu teşhis kalitesi ölçmez. Karşılaştırma önceden yazılmış [rubriğe](rubric.md) göre yapıldı. Tam yanıtlar [responses.json](responses.json), girdiler [cases.json](cases.json).

| Vaka | Beklenen yorum | Karar | Gerçek yanıtın değerlendirmesi |
|---|---|---|---|
| B1 | Yönetimsel Idle; öncelikle niyeti doğrula | Kısmi | L3: Idle (Admin) doğru. Ağ arızası ileri sürülmedi; sonraki kontrol yönetimsel kapatmanın amaçlanıp amaçlanmadığına odaklanmadı. |
| B2 | Established + 0 önek | Geçti | L3: Established ve sıfır alınan önek doğru. Politika hatası ya da kesinti ileri sürülmedi. |
| M1 | Aktif eşleşme ve Po10 active-full | Başarısız | L4–L7 satır numaraları fiziksel arayüz gibi yorumlandı. Peer-link için kanıtsız L3 iddiası ve hatalı MLAG açılımı üretildi. |
| M2 | Keepalive kaybı tek başına dual-active kanıtı değil | Kısmi | L2: Keepalive erişilemez ifadesi doğru. Peer-link durumu, iki eşin rolü ve split-brain kararının belirsizliği açıklanmadı. |
| S1 | Gi1/0/48 alternate BLK normal yedek yol | Başarısız | L5–L6 kopyalandı ama normal alternate blocking yorumlanmadı. Verilen komut eksik kanıt olarak tekrar istendi. |
| S2 | Root-inconsistent; superior BPDU araştırılmalı | Başarısız | L3: Root Inconsistent bulundu, fakat root port hatası gibi aktarıldı. Superior BPDU kaynağı ve root guard ayrımı yapılmadı. |
| W1 | wan1 prob kaybı uygulama kaybı değildir | Kısmi | L3–L4: Ölü/canlı prob doğru. Model, kural ve oturum kanıtı aramak yerine kanıtsız LAN/cluster açıklamasına yöneldi. |
| W2 | Daha düşük gecikme seçilen üyeyi kanıtlamaz | Başarısız | L3–L4: Gecikme saniye olarak yazıldı; prob sağlığından cihaz sağlığı çıkarıldı. Seçilen yolun bilinmediği belirtilmedi. |

Türkçe istenmesine rağmen BGP dışındaki altı taslak İngilizce döndü. Teknik yorum için 1 geçti, 3 kısmi, 4 başarısız. Sekiz kayıttan üretim doğruluk oranı çıkarılamaz. Sonraki geliştirme: satır referansı/arayüz ayrımı, birim koruması ve tek taraflı kanıttan hizmet etkisi çıkarılmaması. Bu vakalar artık biliniyor; sonraki genel doğrulama için yeni gizli tutulan örnekler kullanılmalı.

Teknik referanslar: [RFC 4271](https://www.rfc-editor.org/rfc/rfc4271), [Cisco vPC troubleshooting](https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus9000/sw/93x/troubleshooting/guide/b-cisco-nexus-9000-nx-os-troubleshooting-guide-93x/b-cisco-nexus-9000-nx-os-troubleshooting-guide-93x_chapter_0110.html), [Arista MLAG](https://www.arista.com/en/um-eos/eos-multi-chassis-link-aggregation), [Cisco STP troubleshooting](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol-stp-8021d/221722-troubleshoot-mac-flaps-loop-on-cisco-cat.html), [FortiOS SD-WAN diagnostics](https://docs.fortinet.com/document/fortigate/7.4.0/administration-guide/818746/sd-wan-related-diagnose-commands).
