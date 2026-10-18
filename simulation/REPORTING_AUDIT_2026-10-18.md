# Raporlama akışı kontrolü — 18 Ekim 2026

Başlangıç sürümü 5.48.0 (`c1d379744a3f171b150aeff2f5009669122b09ce`). Teknoloji modülündeki topoloji; cihaz kimliği, portlar, bağlantılar ve çizim yerleşimi için esas alınmıştır.

## Doğrulanan sorunlar ve 5.48.1 düzeltmesi

| Bulgu | Yeniden üretim / etki | Düzeltme |
|---|---|---|
| Nihai rapor yanlış sekmede açılıyor | vPC/MLAG → senaryo kaydı → Open final report; URL yalnız `from=simulation`, seçili sekme Inventory | Design Guide and Reporting sekmesine ve simülasyon bölümüne açık yönlendirme |
| Ortak simülasyon aktarımı eski import işaretini bırakıyor | Rapor açılışında eski `report.import` kaydı, yeni senaryolu rapor yerine yeniden işlenebiliyor | Başarılı kayıt sonrası eski import temizlenir; proje kimliğine bağlı rapor teslim işareti yazılır |
| Ayrıntılı senaryolar dar editör sütununda sıkışıyor | 1500 px masaüstünde rapor genişliği yaklaşık 517 px; görseller figure kenar boşluklarıyla yaklaşık 369 px | Simülasyondan açılan raporda geniş önizleme; düzenleyiciye tek düğmeyle dönüş; rapor verisi ve form girdileri korunur |
| Mobil tablolar kelimeleri bölüyor | Beş sütunlu bileşen tablosunda durum, hostname ve port değerleri birkaç harfte bir bölünüyor | Rapor tablosu kendi alanında yatay kaydırılır; sayfanın tamamı yatay taşmaz; baskıda kaydırma kısıtı kaldırılır |

Nihai raporun PDF baskı kontrolünde sayfa sonunda yalnız kalan senaryo başlığı da düzeltildi; başlık takip eden içerikle birlikte taşınır. Senaryo kayıt şeması ve simülasyon motoru değiştirilmemiştir. Önizleme genişletmesi yalnız ekran düzenidir; Word içeriğinin kaynağı aynı rapor verisidir.

## Kontrol kapsamı

- Tasarım konfigürasyonu, notları, doğrulama ve troubleshooting; sekiz modülde 32 vendor/modül eşleşmesi.
- BGP kaynak aktarımı, ortak istemci LAN'ı, yedek yol, politikalar ve devre sayısı.
- Beş çift-cihaz platformunda 127 katalog senaryosu; rol, koruma, arıza sırası, restore ve topoloji geometrisi.
- Senaryo kaydı → Open final report → doğru sekme, aynı proje ve senaryo kimliği; eski/farklı proje importunun etkisizleştirilmesi.
- Düzenleyici/geniş önizleme geçişi; TR/EN; proje adı düzenlemesi; yenileme sonrasında senaryonun korunması; yinelenen senaryo oluşturulmaması.
- Gerçek tarayıcıda bağımsız ve nihai Word istekleri, önce/sonra görselleri, HTML/PDF; mobil tablo kaydırması.
- Mevcut proje, envanter, rapor ve uygulama servis regresyonları. SSH ve keşif servis testleri mock tabanlıdır; gerçek müşteri cihazlarına bağlanılmamıştır.

## Araştırmadan çıkan geliştirme önerileri

Bunlar bu düzeltmede uygulanmış özellikler değildir. Harici lab entegrasyonu önerilmemektedir.

| Öncelik | Öneri | Resmî örnek ve uygulamaya çıkarım | Kabul ölçütü |
|---|---|---|---|
| P1 | Değişim özeti ve etkilenen bileşenler | Batfish karşılaştırmalı sorguları iki snapshot arasındaki davranış farklarını inceler. Bizde aynı topolojide önce/sonra yol, rol ve koruma farklarını öne çıkarmak uygundur. | Değişmeyen bileşenler ayrıntıda korunur; özet yalnız gerçek kayıt farklarından üretilir. |
| P1 | Senaryo kapsam seçimi ve senaryo dizini | NetBrain rapor oluştururken cihaz kapsamı ve filtreler seçtirir. Bizde modül, senaryo ve sonuç durumuna göre rapor kapsamı seçilebilir. | Hariç tutma kaydı silmez; Word/PDF ve önizleme aynı seçimi kullanır. |
| P1 | Kaydın tasarım ve model sürümüne bağlanması | Batfish açık referans snapshot seçimi kullanır. Bizim senaryo tarihi/kimliği yanında kaynak tasarım revizyonu ve model sürümü de görünmelidir. | Eski kayda yeni revizyon uydurulmaz; kaynak değişirse geçmiş kayıt değişmez. |
| P2 | Topoloji, protokol ve servis etkisinin raporda ayrılması | NetBrain sağlık raporu temel bilgi, canlı erişim, topoloji ve yol durumlarını ayrı inceler. | Fiziksel UP, başarılı protokol koordinasyonu ve servis erişimi tek başarılı etiketi altında birleştirilmez. |
| P2 | Bağlamsal ayrıntı ve rapor notu | Cisco CML Workbench seçilen öğenin ayrıntılarını tek bağlamsal alanda sunar. Bizde cihaz/hat seçiminin açıklaması senaryoya bağlanabilir. | Seçim mevcut topoloji kimliğini kullanır; açıklama ve mühendis notu aynı senaryo kaydına aittir. |
| P2 | Dil ve mobil araç çubuğu tutarlılığı | Kontrolde bazı ham durum terimlerinin TR raporda İngilizce kaldığı ve mobil üst araç çubuğunun fazla yer kapladığı görüldü. | Teknik kimlikler korunur; kullanıcıya dönük durum açıklamaları TR/EN tutarlıdır; mobilde rapor alanı kullanılabilir kalır. |

Karşılaştırma resmî dokümanlar üzerinden yapılmıştır; ilgili ürünler kurulup çalıştırılmamıştır. Batfish'in gerçek konfigürasyon analizi yetenekleri uygulamamızda varmış gibi değerlendirilmemiştir.

## Kaynaklar

- NetBrain, Device Health Report: https://www.netbrain.com/docs/12ne3wy0aw/help/HTML/device-health-report.html
- Batfish, Differential Questions: https://batfish.readthedocs.io/en/latest/notebooks/differentialQuestions.html
- Cisco, CML 2.6 Workbench Revamp (2023 arayüz tasarım örneği): https://blogs.cisco.com/learning/blog-cisco-inside-the-cml-2-6-workbench-revamp

## Yerel doğrulama sonucu

- Mevcut `npm test` ve 46 ek Node test komutu başarılı; yeni dört rapor/motor regresyon testi de başarılı.
- İzole Python test çalıştırmalarında 99 test başarılı.
- Chromium: 32 modül/vendor kombinasyonu, beş platformda 127 çift-cihaz senaryosu ve eski BGP akışı başarılı.
- Rapor tarayıcı kontrolü: bağımsız HTML/PDF ve Word, gerçek nihai rapor yönlendirmesi, eski import koruması, önizleme/düzenleyici, TR/EN nihai Word, mobil görünüm ve yenilemede senaryo koruma başarılı.

Canlı doğrulama sürüm/servis hazırlığını denetler. Oturum gerektiren arayüz kontrolleri yerel uygulama ve CI tarayıcısında yapılır; Render oturumuna giriş yapıldığı iddia edilmez.
