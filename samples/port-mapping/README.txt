PORT MAPPING - SYNTHETIC MULTI-SWITCH TEST PACKAGE

Bu dosyalar ornek/test amaciyla uretilmistir. Gercek bir musteri veya agdan
alinmamistir. Uretici cihazindan alinmis eksiksiz bir show tech-support
dosyasi olduklari iddia edilmez; uygulamanin destekledigi bolumleri
gosteren temsili sentetik ciktidir.

KULLANIM
1. ZIP paketini acin.
2. Inventory > MAC Port Mapping sayfasini acin.
3. Evidence type secenegini otomatik algilamada birakin.
4. Iki TXT dosyasini birlikte yukleyin. Cihaz adi ve platform, dosyalardan
   otomatik algilanir. Komutlari tek tek ayirmaniz gerekmez.
5. Haritadaki switch, baglanti ve port gruplarina tiklayin.

BEKLENEN SONUC
- 4 komsu cihaz: CORE-01, ACCESS-01, PHONE-01, AP-01.
- 3 baglanti; CORE-01 <-> ACCESS-01 iki uctan dogrulanmis olmali.
- 4 konsolide MAC/VLAN kimligi; core ve access kayitlari 8 ayri istemci
  olusturmamali. Her kimlikte iki switch gozlemi bulunmali.
- VLAN 10 / 00:50:56:84:12:34: ACCESS-01 Ethernet1; IP 192.0.2.101,
  IPv6 2001:db8:10::101; VRF USERS.
- VLAN 10 / 00:50:56:AB:CD:EF: ACCESS-01 Ethernet2; IP 192.0.2.102.
- VLAN 20 / 00:1B:63:01:02:03: PHONE-01; access port Ethernet2;
  IP 192.0.2.120. Data VLAN 10 ve voice VLAN 20 birlikte incelenebilir.
- VLAN 30 / 00:11:22:00:00:44: ACCESS-01 Ethernet3 uzerinden ogrenilmis
  istemci; IP 192.0.2.144. AP-01 komsulugu ayni porttadir. Ilave kanit
  olmadiginda istemcinin kablosuz oldugu kesinlestirilmemelidir.
- Uplink Ethernet49 / Ethernet1/1; trunk native VLAN 10,
  allowed VLAN 10,20,30,40.

DENEMELER
- Yalniz CORE-01 dosyasini yukleyin: access switch arkasindaki MAC'ler
  gorunmeli; son erisim portu bilinmiyor olarak kalmali.
- ACCESS-01 dosyasini ekleyin: kimlikler cogalmadan erisim portlari bulunmali.
- 192.0.2.101 veya MAC adresini arayin; ilgili gozlemleri inceleyin.
- Bir istemciye hostname / tur notu ekleyip sayfayi yeniden acin.
- JSON kaydedip geri yukleyin; notlar ve konsolide kayitlar korunmali.
- Port CSV, istemci CSV ve topoloji SVG ciktilarini alin.

NOTLAR
MAC uretici bilgisi cihaz turunu tek basina belirlemez. Telefon/AP turleri
LLDP yeteneklerinden gelir; diger istemciler ilave kanit olmadan Unknown
kalabilir. Harita gozlemlenen topoloji iliskilerini gosterir; trafik olcumu
veya kesin STP forwarding yolu degildir.

English: Extract this ZIP and upload both TXT files to /port-mapping.
All contents are synthetic, representative test data using documentation
IP ranges. Expected: 4 neighbor devices, 3 links, 4 MAC/VLAN identities,
8 learning observations and one reciprocal core/access connection.
