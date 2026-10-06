# Rapor içeriği için kaynak ve örnek değerlendirmesi

İnceleme tarihi: 6 Ekim 2026. Bu belge araştırma ve geliştirme değerlendirmesidir. 5.19.1 sürümünde A/B önerilerinin ilk uygulaması olan teknolojiye özgü işletim değerlendirmesi ve arıza/kabul matrisi eklendi. Adresleme/hizmet planı genişletmesi sonraki aşamadır. Mevcut Reporting yapısı korunmaktadır.

## Önerilen yön

Rapor, müşterinin kendi tasarımını açıklamalıdır. Genel teknoloji bilgisi, seçilen mimariyi anlamaya yardımcı olduğu ölçüde kullanılmalıdır. Her input için mekanik açıklama yerine hizmet sürekliliği, trafik yönü, izolasyon, kapasite ve işletim üzerindeki mühendislik etkisi anlatılmalıdır.

İçerik üretiminin temeli şu ilişki olmalıdır:

**Proje gereksinimi → seçilen tasarım kararı → beklenen ağ davranışı → arıza etkisi → kabul kriteri → doğrulama kanıtı.**

Bu yapı bütün vendor ve modüllere uygulanabilir. Teknik mekanizmalar ve komutlar ise platform, teknoloji ve hedef sürüme göre ayrı seçilmelidir. Cisco vPC davranışını Huawei M-LAG veya iStack raporuna taşımak doğru değildir.

## İncelenen kaynaklar ve toplanan örnekler

### 1. Arista AVD: gerçek üretilmiş dokümanlar

[Dual DC L3LS örnek tasarımı — AVD 5.6](https://avd.arista.com/5.6/ansible_collections/arista/avd/examples/dual-dc-l3ls/index.html)

GitHub üzerindeki aşağıdaki dosyaların içeriği doğrudan incelendi. Tekrarlanabilir inceleme için **v5.6.0 etiketi** kullanıldı; bunun en güncel sürüm olduğu iddia edilmemektedir.

- [Fabric tasarım dokümanı](https://github.com/aristanetworks/avd/blob/v5.6.0/ansible_collections/arista/avd/examples/dual-dc-l3ls/documentation/fabric/FABRIC-documentation.md)
- [Leaf cihazının teknik dokümanı](https://github.com/aristanetworks/avd/blob/v5.6.0/ansible_collections/arista/avd/examples/dual-dc-l3ls/documentation/devices/dc1-leaf1a.md)
- [Uçtan uca bağlantı ve IP planı CSV örneği](https://github.com/aristanetworks/avd/blob/v5.6.0/ansible_collections/arista/avd/examples/dual-dc-l3ls/documentation/fabric/FABRIC-p2p-links.csv)

Fabric çıktısı cihaz rolleri, yönetim adresleri, iki uçtaki portlar, point-to-point adresler ve loopback tahsislerini tablolaştırıyor. Cihaz çıktısı MLAG, VLAN, arayüz, VRF ve BGP özetlerini ilgili konfigürasyonlarla ilişkilendiriyor. Tasarım girdisinden doküman/konfigürasyon üretmek ile cihazlara deploy etmek ayrı işlemler; doküman üretimi için çalışan lab gerekmiyor.

**Bize uygunluğu:** Yüksek. Özellikle tek proje adresleme planı ve hizmet tablosu için somut örnek. Bizde tam konfigürasyon zaten cihaz ekinde bulunduğundan ana metinde her komut bloğunu tekrar etmek yerine ilgili cihaz/arayüz/hizmet kaydına referans vermek daha uygun. AVD örneğinin VLAN/IP değerleri bizim kullanıcı girdilerimize varsayılan olarak kopyalanmamalıdır.

### 2. Cisco: vPC tasarım ve arıza davranışı

[vPC Best Practices Design Guide — PDF](https://www.cisco.com/c/dam/en/us/td/docs/switches/datacenter/sw/design/vpc_design/vpc_best_practices_design_guide.pdf)

Kılavuz, peer-link ve keepalive rollerini, trafik davranışını, tasarım koşullarını ve farklı arıza sıralarının sonuçlarını birlikte ele alıyor. Özellikle son bölümlerdeki arıza senaryoları, müşteriye neden bağımsız keepalive ve yedekli peer-link tasarlandığını açıklamak için değerli.

**Bize uygunluğu:** Cisco vPC için yüksek; rapor yapısı açısından diğer teknolojilere örnek. Kaynakta eski Nexus platformları da bulunduğu için güncel cihaz komutları, varsayılanlar ve sürüm desteği bu PDF'den genellenmemeli. Mevcut `vpc-report.js` zaten daha yeni Cisco referansları içeriyor; bu çalışma onun yerine geçmiyor.

### 3. Cisco: müşteri ihtiyacından mimariye geçiş

[Cloud Campus LAN Design Guide](https://www.cisco.com/c/en/us/solutions/collateral/enterprise/design-zone-campus/cloud-campus-lan-design-guide.html)

Bu rehberde kapasite, kullanılabilirlik ve işletim ihtiyaçları mimari seçimlerle ilişkilendiriliyor.

**Bize uygunluğu:** Yönetici özeti ile gereksinim–karar tablosunun düzeni için yararlı. Ürün bağlamı cloud campus olduğu için buradaki ürün önerileri mevcut Nexus, EOS veya Huawei tasarımlarına otomatik aktarılmamalı.

### 4. Huawei: DCI hizmet sınırları

[Huawei DCI teknoloji açıklaması](https://info.support.huawei.com/info-finder/encyclopedia/en/DCI.html)

Kaynak, veri merkezleri arasındaki Layer 2 uzatma ve Layer 3 bağlantı seçeneklerini ayırıyor.

**Bize uygunluğu:** EVPN/DCI raporunda hangi hizmetlerin hangi sınırdan geçtiğini anlatmak için yararlı. Bu bir model ve sürüme özel CLI kılavuzu değildir. Huawei M-LAG/iStack özelliklerini bu sayfaya dayanarak onaylanmış göstermek doğru olmaz.

### 5. Fortinet: katmanlı tasarım ve kurulum planı

[Secure SD-WAN 7.4 Deployment Guide for MSSPs — PDF](https://fortinetweb.s3.amazonaws.com/docs.fortinet.com/v2/attachments/94c77d08-9b07-11ef-a705-1222899fa4e9/SD-WAN-7.4-Deployment_Guide_for_MSSPs.pdf)

Rehber underlay erişimi, overlay, yönlendirme ve trafik yönlendirme politikalarını ayrı sorumluluklar olarak ele alıyor. Referans tasarım ile proje şablonu ve uygulama adımları arasında bağ kuruyor.

**Bize uygunluğu:** Kurulum bağımlılıkları ve operasyon planının düzeni için yararlı. Mevcut SD-WAN modülümüz Cisco cEdge bağlamındadır; Fortinet ADVPN veya FortiManager davranışı bu modülün raporuna eklenmemelidir. Fortinet'e özel içerik ancak ilgili platform/modül desteği olduğunda kullanılmalıdır.

### Erişim sınırlamaları

Arista'nın design-guide katalog sayfası görülebildi, ancak ayrı L2LS PDF bağlantısı giriş gerektirdi. Bazı Huawei ürün kılavuzları ve Fortinet HTML sayfaları da tam okunamadı. Bunlar incelenmiş teknik referans olarak kullanılmadı. Yukarıdaki açık belgeler ve GitHub dosyaları değerlendirmeye esas alındı. Tam belge kopyaları yerine orijinal bağlantılar toplandı.

## Mevcut uygulama ile karşılaştırma

Kod incelemesi: `reporting.html`, `vpc-report.js`, `report_docx.py`.

| Konu | Mevcut durum | Önerilen geliştirme |
| --- | --- | --- |
| Proje kimliği, kapsam ve gereksinimler | Mevcut | Gereksinimlere karar ve kabul kriteri referansı eklemek |
| Tek proje mimarisi ve topoloji anlatımı | Mevcut | Her modül için yeniden giriş yazmadan hizmet akışını açıklamak |
| Port ve bağlantı çizelgesi | Mevcut | Adresleme/VRF/VLAN/VNI planını aynı veri kaynağından ilişkilendirmek |
| Teknoloji rehberi | Ayrıntılı yapı Cisco vPC ve Huawei iStack için mevcut | EOS MLAG, Huawei M-LAG ve diğer modüllerde eşdeğer derinlik sağlamak |
| Seçilen parametrelerin mühendislik etkisi | Mevcut karar/not altyapısı var | Kritik seçimleri normal trafik, arıza ve kabul davranışıyla birlikte anlatmak |
| Doğrulama planı ve manuel CLI kanıtı | Mevcut | Seçilen komutları tasarım kararları ve kabul kriterleriyle eşleştirmek |
| Cihaz konfigürasyonları | Cihaz bazında mevcut | Ana rapordan ilgili cihaz/arayüz ekine izlenebilir referans vermek |
| Kaynak gösterimi | vPC/iStack rehberinde mevcut | Diğer teknoloji içeriklerinde kaynak, kapsam ve sürüm bilgisini tutarlı hale getirmek |

## Somut rapor önerileri

### A. Projeye özel mühendislik kararları — ilk öncelik

Her önemli karar için kısa fakat teknik bir anlatım: seçilen değerler, etkilediği trafik/hizmet, tasarımın sınırı ve doğrulama yöntemi. Aşağıdakiler özgün örneklerdir; gerçek rapora yalnız kullanıcı girdileriyle eşleştiğinde üretilmelidir.

**BGP örneği:** “ISP-1 üzerinden alınan uygun rotalara 200, ISP-2 üzerinden alınan rotalara 100 Local Preference uygulanmıştır. Diğer daha öncelikli seçim koşulları eşit olduğunda çıkış trafiği ISP-1 yolunu tercih eder. Bu politika karşı ağların giriş yönündeki seçimlerini belirlemez. ISP-1 rotaları geri çekildiğinde ISP-2 üzerinden alternatif rota bulunması ve next-hop erişiminin sürmesi beklenir. Kabul testinde normal ve arızalı durumda seçilen best path ile gerçek trafik yolu karşılaştırılır.”

**EVPN örneği:** “PROD VRF için seçilen L3VNI ve route-target değerleri, bu hizmete ait uzak IP prefixlerinin hangi yönlendirme tablolarına alınacağını belirler. Rapor, PROD kapsamındaki VLAN/SVI ve ilgili VTEP kayıtlarını aynı hizmet tablosunda göstermelidir. İzolasyon kabulünde beklenen erişimlerin çalışması ve izin verilmeyen VRF geçişlerinin gerçekleşmemesi birlikte doğrulanır.”

**QoS örneği:** “Seçilen uygulama sınıfının eşleştirme kuralı, işaretleme değeri ve egress politikası birlikte açıklanır. Bir priority sınıfı seçilmesi tek başına uçtan uca gecikme garantisi oluşturmaz; politikanın uygulandığı çıkış, yoğunluk koşulu ve diğer sınıfların kaynak kullanımı kabul planına bağlanır.”

Hostname gibi kimlikler envanter ve çizelgelerde gösterilir; ayrı mühendislik gerekçesi paragrafı gerektirmez.

### B. Arıza etkisi ve kabul matrisi — ilk öncelik

| Alan | Rapora gelecek bilgi |
| --- | --- |
| Senaryo | Tasarımda gerçekten bulunan bağlantı, eş cihaz veya servis bağımlılığı |
| Beklenen davranış | Seçili mekanizmanın hangi yolu/servisi koruduğu |
| Hizmet etkisi | Etkilenen VLAN, VRF, trafik yönü veya yönetim erişimi |
| Kabul kriteri | Mühendisin belirleyeceği ölçülebilir eşik ve beklenen durum |
| Kanıt | Kullanıcının seçtiği doğrulama komutu ve sonradan dolduracağı çıktı |
| Sonuç | Test edilmedi / geçti / başarısız; test yapılmadan “geçti” üretilmez |

Kapasite ve yakınsama süresi yalnız tasarım verisi veya ölçüm varsa sayı olarak yazılmalıdır. Test ortamımız olmadığı için başlangıç çıktısı bir doğrulama planıdır; çalışmış cihaz sonucu değildir.

### C. Tek proje adresleme ve hizmet planı — ikinci öncelik

Tekrar veri girişi istemeden Technology Workspace girdilerinden üretilecek tablolar:

- Cihaz/arayüz, rol, IP/prefix, VRF, karşı cihaz/arayüz ve bağlantı amacı.
- Hizmet, VLAN, L2VNI, VRF, L3VNI, RD/RT, gateway ve hizmeti sunan cihazlar.
- BGP komşusu, yerel/uzak ASN, address-family ve giriş/çıkış politika özeti.

Alanlar ilgili teknolojiye göre gösterilir; STP tasarımına VNI sütunu eklenmez. Tasarım kimlikleri ile Inventory kayıtları mevcut eşleştirme mantığı üzerinden kullanılır; rapor için ayrı bir envanter oluşturulmaz.

### D. Kısa yönetici özeti ve kontrollü teknik ekler

İlk sayfa iş hedefi, mimari tercih, hizmet sürekliliği yaklaşımı ve teslim kapsamını özetler. Ayrıntılı teknoloji bilgisi, kabul planı ve cihaz konfigürasyonları sonraki bölümlerde kalır. Birden çok modül seçildiğinde tek projenin farklı hizmetleri anlatılır; bağımsız rapor başlangıçları tekrarlanmaz.

## Uygulama sırası ve kabul ölçütleri

1. Mevcut mühendislik notlarından kritik kararları seçerek A ve B'yi raporun mevcut bölümlerine eklemek; yeni menü veya zorunlu adım oluşturmamak.
2. C'yi mevcut parametre/topoloji verisinden üretmek; ardından diğer teknoloji rehberlerini platforma özel kaynaklarla genişletmek.
3. Aynı içerik modelinin ekran, Word ve PDF'de kullanılmasını sağlamak.

Her aşamada TR/EN tutarlılığı, vendor doğruluğu, tek proje anlatımı, kullanıcı metinlerinin korunması, Save/Open geri yükleme ve Word tablo yapısı kontrol edilmelidir. Bir parametre değiştiğinde açıklama, çizelge ve kabul planı birlikte güncellenmelidir. Ürün/model/sürüm desteği kaynakla doğrulanmadan kesin uyumluluk iddiası yazılmamalıdır.

Bu öneriler aşamalı rapor geliştirmesinin kapsamını belirlemek içindir. Kaynakların metinleri rapora topluca kopyalanmayacak; proje girdilerinden üretilecek özgün içerik için referans olarak kullanılacaktır.

## 5.19.1 uygulama notu

Sekiz modül ve desteklenen platformlar için üretilmiş konfigürasyon/model verisinden işletim açıklamaları ve kabul senaryoları oluşturulur. BGP Local Preference değerleri, ISP sayısı, OSPF area/ağ tipi, VNI sayısı, peer/stack bağlantıları ve seçili koruma ayarları açıklamayı etkiler. Mevcut parametre gerekçeleri ve kullanıcı proje metinleri korunur. Kabul matrisi yalnız seçilmiş Verification komutlarını kanıt olarak listeler; arıza testinin yapılmış olduğu iddia edilmez. Aynı veri modeli ekran/PDF görünümü ve Word tablolarında kullanılır. Yeni raporların ve rapor birleştirme ekranının varsayılan dili English'tir; açıkça kaydedilmiş Türkçe seçimi korunur.

Ek protokol/platform kaynakları: [RFC 4271](https://www.rfc-editor.org/rfc/rfc4271), [RFC 2328](https://www.rfc-editor.org/rfc/rfc2328), [RFC 2474](https://www.rfc-editor.org/rfc/rfc2474), [RFC 7432](https://www.rfc-editor.org/rfc/rfc7432), [RFC 5905](https://www.rfc-editor.org/rfc/rfc5905), [Arista MLAG](https://www.arista.com/en/um-eos/eos-multi-chassis-link-aggregation), [Huawei M-LAG](https://info.support.huawei.com/info-finder/encyclopedia/en/M-LAG.html). Protokol temeli, belirli ürün/sürüm desteğinin onayı yerine geçmez.
