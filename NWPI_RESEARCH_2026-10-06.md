# Network-Wide Path Insight: araştırma ve uygulamamıza uyarlama

İnceleme tarihi: 6 Ekim 2026. Bu belge araştırma/öneridir; NWPI veya Path Diagnostics henüz uygulamaya eklenmemiştir. Config Compare ve rapor geliştirmeleri ayrı olarak 5.19.0/5.19.1 sürümlerinde yayınlanmıştır.

## Değerlendirme

Bizim için değerli yaklaşım, ağ cihazlarını ayrı ayrı kontrol etmekten uygulama akışını uçtan uca değerlendirmeye geçmektir. Mevcut Verification, Troubleshooting, Inventory, topology ve rapor kanıtlarını aynı olay bağlamında ilişkilendirebiliriz. Cisco NWPI'nin cihaz içi telemetry altyapısını yalnız CLI komutlarıyla yeniden üretebileceğimizi iddia etmemeliyiz.

Önerilen ilk geliştirme: **mevcut Troubleshooting içinde Path Diagnostics**. Yeni büyük bir workspace veya zorunlu proje adımı açmak yerine akış bilgisi, beklenen yol, gözlenen kanıt ve sonraki kontrolü aynı yerde sunmak.

## Cisco NWPI ne sağlıyor?

### Temel özellik ve ön koşullar

[Cisco NWPI temel kılavuzu — 26.x ve sonrası](https://www.cisco.com/c/en/us/td/docs/routers/sdwan/26x-later/nwpi/network-wide-path-insights-user-guide/network-wide-path-insight.html)

NWPI, Cisco IOS XE Catalyst SD-WAN cihazlarından toplanan uygulama/flow/packet bilgilerini tek görünümde ilişkilendirir. Manager'da Data Stream etkin olmalıdır. Belgede TCP/UDP ve service VPN kapsamı, örneklenmiş paketler, cihaz/tenant trace limitleri ve sürüme bağlı kısıtlar belirtilir. vEdge desteği tam cEdge desteğiyle eş tutulmaz. ISE ve ThousandEyes ek bilgileri ayrı entegrasyonlara bağlıdır; temel NWPI için hepsinin zorunlu olduğu söylenemez.

**Çıkarımımız:** Cisco'ya özgü veri toplama altyapısı ile bizim vendor bağımsız olay/kanıt modeli ayrı katmanlar olmalıdır. Bu kaynaktan belirli lisans paketinin dahil olduğu sonucu çıkarılmadı; hedef ortamın entitlement ve sürümü entegrasyon öncesinde doğrulanmalıdır.

### Trace oluşturma ve olay tetikleme

[NWPI tracing prosedürü](https://www.cisco.com/c/en/us/td/docs/routers/sdwan/26x-later/nwpi/network-wide-path-insights-user-guide/network-wide-path-insight-tracing.html)

Trace, site/VPN ve trafik filtreleriyle sınırlandırılır. Süre ve görünürlük seçenekleri seçilir. Auto-on görevleri QoS congestion veya SLA violation gibi olaylarda trace başlatabilir; daha yeni sürümlerde başka tetikleyiciler ve zamanlama bulunur. Bu seçenekler tek bir sürümden bütün sürümlere genellenmemelidir.

**Çıkarımımız:** İlk aşamada kullanıcı tarafından başlatılan, dar kapsamlı olay incelemesi uygun. Sürekli izleme ve otomatik tetikleme; gerçek veri kaynağı, zaman serisi saklama ve test ortamı sağlandıktan sonra değerlendirilmeli.

### Insight Summary: performans, policy ve hotspot

[Insight Summary](https://www.cisco.com/c/en/us/td/docs/routers/sdwan/26x-later/nwpi/network-wide-path-insights-user-guide/insight-summary.html)

NWPI; uygulama/olay özetleri, hotspot ilişkileri, upstream/downstream görünümü, loss/delay/jitter, QoS ve policy insight bilgileri sunar. Örneklenmiş flow bilgisi ile daha geniş uygulama istatistikleri farklı kapsamlar taşır. Tek trace ile çoklu trace özetinde kullanılabilen metrikler de farklı olabilir.

**Çıkarımımız:** Hop veya cihaz bulgusunu hizmet/akış etkisine bağlamak çok yararlı. Ancak ölçüm bulunmayan bir akış için latency, loss, jitter veya sağlık skoru oluşturulmamalı. Renkli bir topoloji çizgisi gerçek trafik ölçümü yerine geçmez.

### Kaydedilmiş trace ve dışa aktarım

[Traces: import/export](https://www.cisco.com/c/en/us/td/docs/routers/sdwan/network-wide-path-insight/network-wide-path-insight-user-guide/m-traces.html)

Cisco trace export'u, JSON dosyaları içeren `.tar.gz` arşivi oluşturur. Kaydedilmiş trace, geçmiş bir olayın tekrar incelenmesine imkan verir.

**Çıkarımımız:** Gerçek SD-WAN laboratuvarımız olmadan ilerlemek için iyi bir ara aşama: örnek/export trace verisini sürüm bilgisiyle içeri alıp olay kartına bağlamak. Bu kayıt geçmiş gözlemdir; ekrana aktarılması canlı izleme olarak sunulmamalıdır. İlk importer kapsamı, edinilecek gerçek ve yetkili örnek dosyalarla belirlenmelidir; şu an elimizde test edilmiş NWPI export dosyası yok.

### API olanakları ve sürüm bağımlılığı

[Cisco DevNet: Get Concurrent Data — Manager 20.16](https://developer.cisco.com/docs/sdwan/20-16/get-concurrent-data/)

Şemada flow kimliği, upstream/downstream cihaz ve hop bilgileri, NAT/policy bulguları, QoS congestion ve drop/performance alanları bulunur. Bu örnek endpoint dokümanda **deprecated** olarak işaretlidir.

**Çıkarımımız:** Tek bir eski URL'yi uygulamaya gömmek yerine hedef Manager sürümüne göre API adapter'ı ve capability kontrolü gerekir. Mevcut trace okuma ile yeni trace başlatma ayrı işlemler olmalıdır. İlk API entegrasyonu, mevcut kayıtları okuma üzerinden tasarlanmalıdır.

## Bizde ne var, ne gerekiyor?

| Konu | Mevcut uygulama | Uyarlama |
| --- | --- | --- |
| Cihaz kimliği ve yazılım | Inventory | Gözlemin cihaz/model/sürüm bağlamını bu kaynaktan almak |
| Planlanan portlar ve bağlantılar | Technology Workspace topology | Beklenen yolu göstermek; gerçek ölçülmüş yol diye etiketlememek |
| Seçilebilir komutlar ve CLI çıktısı | Verification / Troubleshooting | Bir akış/olay altında cihaz ve kontrol adımıyla ilişkilendirmek |
| Mühendis bulgusu | Troubleshooting findings | Hipotez, destekleyen kanıt, eksik kontrol ve doğrulanmış sonuç ayrımı |
| Değişiklik karşılaştırması | Config Compare | Olay öncesi/sonrası farkı kanıt olarak ilişkilendirmek; otomatik nedensellik çıkarmamak |
| Müşteri dokümanı | Reporting / Word / PDF | Olay özeti, bulgu, kanıt, düzeltme ve tekrar doğrulama kaydı |
| Flow telemetry ve hop metrikleri | Henüz yok | Import veya uygun cihaz/controller adapter'ı |
| Sürekli olay tetikleme | Henüz yok | On-prem ve gerçek veri kaynağı aşamasında değerlendirmek |

## İlk sürüm önerisi: Path Diagnostics

### Mühendisin gireceği bağlam

- Olay adı ve incelenen zaman aralığı.
- Kaynak/hedef IP, protokol ve mümkünse kaynak/hedef port.
- VRF veya service VPN; gerekli durumda VLAN ve uygulama/hizmet adı.
- İlgili Inventory cihazları ve varsa tasarımdaki hizmet/bağlantı.
- Beklenen davranış: erişim, tercih edilen çıkış, izinli tenant veya policy sonucu.

Protokol/port verilmeden bir IP çiftinin farklı ECMP, NAT veya policy davranışlarını tek flow gibi değerlendirmemeliyiz. Farklı olaylara ait CLI çıktıları da tek zaman dilimi gibi birleştirilmemelidir.

### İnceleme akışı

1. Mühendis trafik bağlamını ve ilgili cihazları seçer.
2. Uygulama ilgili teknoloji ve vendor için kontrol adımlarını önerir.
3. Mühendis gerekli komutları seçer; mevcut SSH aracıyla çalıştırır veya çıktıyı elle ekler.
4. Her kanıtta cihaz, komut, zaman, kaynak ve değerlendirme bulunur.
5. Görünüm, kanıtın desteklediği bulguyu ve eksik kalan sonraki kontrolü gösterir.
6. Mühendis olay özetini rapora dahil eder.

Bu akış test ortamı olmadan elle girilen çıktılar ve sentetik test fixture'larıyla doğrulanabilir. Sentetik kayıtlar açıkça örnek veridir; müşteri raporunda gözlenen üretim sonucu olarak kullanılmaz.

### Kanıt temelli görünüm

| Durum | Anlam |
| --- | --- |
| **Observed / Gözlenen** | Belirli zaman ve cihaz için alınmış/import edilmiş kanıt |
| **Inferred / Çıkarılan** | Konfigürasyon veya tasarımdan çıkarılan beklenen davranış |
| **Not collected / Toplanmadı** | Gerekli kanıt henüz yok |
| **Conflicting / Çelişkili** | Aynı bağlamda birlikte açıklanamayan gözlemler |

“Toplanmadı” sıfır loss veya sağlıklı cihaz anlamına gelmez. Traceroute'ta cevapsız hop bulunması da tek başına trafik drop kanıtı değildir. Planlanan fiziksel bağlantı ile gözlenen flow yolu ekranda farklı gösterilmelidir.

## Modül ve vendor bazında ilk kontrol kapsamı

Aşağıdaki tablo bizim uygulama önerimizdir; Cisco NWPI'nin bütün vendorlarda aynı şekilde çalıştığı iddiası değildir.

| Teknoloji | İncelenecek ilişki | Gerekli kanıt |
| --- | --- | --- |
| BGP | Komşuluk → kabul edilen prefix → best path → next-hop → çıkış | Peer/route/policy ve forwarding tablosu |
| OSPF | Komşuluk → area/LSDB → SPF sonucu → rota → fiziksel arayüz | Adjacency, LSDB, route ve interface |
| vPC / MLAG / M-LAG | Peer durumu → bundle üyeleri → VLAN/consistency → hizmet etkisi | Vendor'a özgü peer, bundle ve interface çıktıları |
| iStack / StackWise | Üyeler → interconnect → split koruması → bundle → hizmet etkisi | Stack/SVL, MAD/DAD ve trunk çıktıları |
| EVPN / VXLAN | Underlay → VTEP → EVPN route → RT/VNI → tenant forwarding | Route, EVPN, NVE/VXLAN, MAC/ARP kayıtları |
| STP | Root → instance/VLAN → port rolü → koruma → hizmet yolu | STP ve interface durumu |
| QoS | Match → marking/trust → bağlı policy → queue/drop | Class/policy attachment ve zamanla ilişkili sayaçlar |
| System and Management | Yönetim erişimi → AAA → NTP/log görünürlüğü | Erişim yöntemi, zaman ve logging durumu |
| Cisco SD-WAN | Service VPN → OMP → tunnel/BFD → policy → transport | İlgili cEdge çıktıları; daha sonra NWPI export/API |

Cisco IOS XE/NX-OS, Arista EOS, Huawei VRP/iStack ve FortiGate için ayrı parser/capability kapsamı gerekir. Başlangıçta her çıktıyı otomatik yorumlayan geniş bir parser yerine seçilen komut ailelerini test edilmiş fixture'larla geliştirmek daha gerçekçi.

Mevcut uygulamanın komut filtresi read-only komutları esas alır. Ping/traceroute, aktif NWPI trace veya PCAP replay bu filtreyi aşan gizli bir işlem olarak eklenmemelidir. İleride desteklenecek aktif testler ayrı yürütme yolu ve açık kullanıcı eylemiyle tasarlanmalıdır.

## Veri modeli önerisi

Bir olay kaydında: `caseId`, proje/revizyon, flow bağlamı, gözlem zamanı, cihaz/vendor/sürüm, kontrol adımı, komut veya import kaynağı, ham kanıt, yorumlanan alanlar, birim, bulgu ve mühendis sonucu.

Metric kaydında değer yanında birim, yön, ölçüm türü, zaman aralığı ve kaynak bulunmalı. Tek sayaç değerinden loss yüzdesi veya hız türetilmemeli; gerekiyorsa karşılaştırılabilir iki gözlem ve elapsed time kullanılmalı. Host saat farkları zaman korelasyonunda dikkate alınmalı.

Ham kanıt korunmalı; parser sonucu düzeltilebilir ve hangi kanıttan çıkarıldığı izlenebilir olmalı. Mevcut rapor içeriği ve cihaz konfigürasyonu olay incelemesi sırasında değiştirilmemeli. Kalıcı kayıtlar sonraki geliştirmede mevcut proje veri modeliyle ilişkilendirilmeli.

## Aşamalar

1. **Şimdi uygulanabilir:** Mevcut Troubleshooting içinde flow bağlamı, seçilebilir kontroller, manuel/SSH kanıt bağlama ve rapora olay özeti. Yeni ücretli hizmet gerekmez.
2. **Örnek veriyle:** Gerçek NWPI export örneği edinildikten sonra kontrollü importer ve geçmiş trace görüntüleme.
3. **Gerçek Cisco ortamıyla:** Hedef Manager sürümü ve yetkisi doğrulanarak mevcut NWPI kayıtlarını okuyan adapter; ardından ihtiyaç varsa kullanıcı başlatmalı trace işlemi.
4. **On-prem aşamasında:** Zaman serisi/history, seçili olay tetikleme, saklama sınırları ve tekrar eden kontroller.

Benim önerim ilk aşamayı dar tutmak: **“Bu akış için nerede hangi kanıt var ve sonraki kontrol ne?”** sorusunu iyi cevaplamak. Canlı telemetry sağlanmadan gerçek zamanlı network-wide performance ürünü görünümü sunmamak.

## Kabul ölçütleri

- Tasarım, gözlem ve çıkarım açıkça ayrılır.
- VRF/VPN, cihaz ve zaman farklılıkları kaybolmaz.
- Vendor'a uygun komut/parser kullanılır; bilinmeyen sürüm veya format desteklenmiş gibi gösterilmez.
- Başarısız komut diğer cihazların sonuçlarını silmez.
- Yalnız seçilen kanıtlar rapora aktarılır; İngilizce varsayılan ve Türkçe alternatif tutarlıdır.
- Topoloji, Inventory, mevcut konfigürasyon ve proje revizyonu değiştirilmez.
- Eksik ölçümde sayı üretilmez; mühendis doğrulamadıkça kök neden kesinleştirilmez.

Bu çalışma sonunda yeni NWPI modülü veya controller bağlantısı oluşturulmamıştır. İlk Path Diagnostics geliştirmesinin kapsamını değerlendirmek için hazırlanmıştır.
