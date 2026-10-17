# Simülasyon arayüzü ve rapor tasarım kararları

17 Ekim 2026. Ana referans Technology Workspace topolojisidir. Bu belge arayüz önerilerini, uygulanan rapor geliştirmesinden ayırır.

## Korunacak temel

Cihaz kimliği, hostname, port, bağlantı uçları ve çizim yerleşimi Technology Workspace’ten gelir. Simülasyon yeni bir topoloji çizmez. Arıza, koruma, operasyonel rol ve trafik yolu bu çizime eklenen durum katmanlarıdır. Raporun önce/sonra görselleri aynı yerleşimi kullanır. Başlangıç karşılaştırması aynı kaynak/hedef için tasarım parametreleri ve arızasız durumla hesaplanır. Sadece senaryoda bulunan fiziksel ve mantıksal bağımlılıklar gösterilir.

## İncelenen resmî örnekler

| Referans | Belgelenen yaklaşım | Uygulamaya çıkarım |
|---|---|---|
| Cisco CML 2.6 Workbench | Seçilen öğeye göre özellik alanı, toplu seçim, bağlama göre işlemler ve gizlenebilir çalışma alanları | Seçim ile arıza uygulamayı ayırmak; cihaz/port ayrıntısını tek bağlamsal alanda toplamak |
| GNS3 Web UI proje topolojisi | Ana proje haritası; görünür/gizlenebilir topoloji özeti; seçim, pan ve zoom kontrolleri | Çizim merkezde kalmalı; özet liste çizimle aynı cihazları ve bağlantıları seçmeli |
| Containerlab GUI | Düğüm/arayüz arama ve filtreleme; TopoViewer üzerinde özellikler, etiketler ve gruplar | Büyük tasarımlarda arama ve ayrıntı seviyeleri; fiziksel hat ile bundle seçimini açıkça ayırmak |
| NetBrain Device Health Report | Cihaz sağlığını temel bilgi, topoloji ve yol kategorilerinde inceleme | Cihazın açık olması, protokol koordinasyonu ve servis yolunu ayrı durumlar olarak sunmak |

Bu ürünlerin lab/telemetri çalışma biçimleri bu kapsamın parçası değildir. Karşılaştırma resmî arayüz belgeleri üzerinden yapılmıştır; bütün ürünler kurulup kullanılmamıştır.

## Önerilen arayüz öncelikleri

1. **Önce / Senaryo / Karşılaştır görünümü.** Aynı topoloji geometrisiyle durumlar arasında geçiş. Yan yana görünüm yalnız yeterli ekran alanında; aynı zoom ve merkez korunarak. Rapor aynı iki görüntüyü kullanır.
2. **Tek bağlamsal seçim alanı.** Cihaz seçildiğinde rol, fiziksel durum, etkilenmiş portlar ve kaynak/hedef bilgisi; hat seçildiğinde iki uç, portlar, bundle üyeliği ve operasyonel durum. Toplu seçimde kapsanan cihaz ve bağlantı sayısı yazılır.
3. **Olay adımları.** Başlangıç, ilk arıza, ikinci arıza ve restore adımları okunabilir sırada. Gerçek süre ölçülmüyorsa adımlar süre grafiği gibi sunulmaz. Her adım ayrı rapor kaydına bağlanabilir.
4. **Kısa etki özeti.** Kullanılabilir yol sayısı, koruma/koordinasyon ve rol değişimi. Fiziksel UP durumu güvenli servis iletimiyle eşitlenmez. Split-brain’de yerel yollar açık kalsa da servis doğrulanmamış gösterilir.
5. **Ayrıntı seviyesi ve arama.** Varsayılan görünümde hostname, roller ve seçili yol; port/IP ayrıntıları seçim veya görünüm kontrolüyle açılır. Tasarımda bulunmayan bağlantı ya da endpoint üretilmez.
6. **Tutarlı durum dili.** Arıza için kırmızı ve çarpı, koruma için sarı ve açık durum metni, doğrulanmamış durum için ayrı etiket; seçili yol için yön işareti. Anlam yalnız renge bağlı kalmaz. Baskıda da okunur.
7. **Rapor kaydına başlık ve mühendis notu.** Seçilen adımın önce/sonra topolojisi, olay sırası, parametreleri, teknik açıklaması ve kontrol planı tek kayda bağlanır. Ölçülmeyen süre/kayıp veya çalıştırılmamış komut için PASS üretilmez.
8. **Mobil kullanım.** Kontrol alanı kapatıldığında topoloji görünür kalır. Küçük ekranda tek durum veya tek görsel gösterilir; karşılaştırma bir geçişle yapılır. Ana çizim yeniden düzenlenmez.

## 5.47.0 kapsamında uygulanan rapor katkısı

- Başlangıç ve senaryo topolojisinin ayrı, değişmez SVG görüntüleri; Word için aynı oranı koruyan PNG dönüşümü.
- Bileşenlerin başlangıç/senaryo durum tablosu, tasarım/what-if parametreleri ve karşılaştırmalı göstergeler.
- TR/EN teknik değerlendirme, hizmet etkisi, geri dönüş planı ve kanıt sınırları.
- Aktif vendor/modül tasarımından alınan salt-okunur doğrulama komutları; yürütülmemiş olarak açık etiketleme.
- HTML/PDF, bağımsız Word ve birleşik raporda aynı yapılandırılmış senaryo verisinin korunması.
- Eski kayıtta bulunmayan başlangıç görseli veya bileşen envanteri için sonradan durum uydurmama.

Yukarıdaki sekiz arayüz önerisi bu sürümde bütünüyle uygulanmış sayılmaz. Yeni bir topoloji editörü veya bağımsız yeniden çizim önerilmemektedir.

## Kabul ölçütleri

Yerleşim ve port/hostname eşleşmesi aktarımda değişmemeli. Arıza, restore ve kayıt sonrasında seçili senaryo durumu korunmalı. Başlangıç görüntüsünde senaryo arızaları görünmemeli. Raporun gösterge ve bileşen tabloları kaydedilen model sonucuyla eşleşmeli. Degraded servis yolu ile split-brain belirsizliği ayrı tutulmalı. Dokuz ve desteklenen üst sınırdaki BGP devreleri rapor üretimini bozmamalı. Karma kayıtlar BGP politikası veya gateway bilgisini kaybetmemeli.

## Kaynaklar

- Cisco Workbench: https://blogs.cisco.com/learning/blog-cisco-inside-the-cml-2-6-workbench-revamp
- GNS3 Web UI: https://docs.gns3.com/docs-3.1-en/web-ui/project-topology
- Containerlab GUI: https://containerlab.dev/manual/gui/
- NetBrain sağlık raporu: https://www.netbraintech.com/docs/ie100/help/viewing-device-health-report.htm
