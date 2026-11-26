# K3 Kalite Kapısı (Quality Gate)

K3 kapısı, uygulama yayına çıkmadan veya bir sonraki aşamaya geçmeden önce sistemin sağlık, güvenlik ve standartlara uygunluk denetimini gerçekleştiren otomatik kontrol mekanizmasıdır.

## Neyi Kontrol Eder?

### 1. Sistem Doktoru (`tools/doctor.js`)
- **Ortam Doğrulama:** Node.js versiyonu ($\ge$ 20) ve İşletim Sistemi (Win32) kontrol edilir.
- **Binary Mevcudiyeti:** Electron executable dosyasının doğru konumda olup olmadığına bakılır.
- **Bağımlılık Hijyeni:** `package.json` içerisinde izinsiz paket bulunmadığı, yalnızca `electron` yüklü olduğu doğrulanır.
- **Statik Analiz:** Kaynak kodlardaki sözdizimi hataları (`node --check`) taranır.
- **IPC Kanal Senkronizasyonu:** Sabit kanal isimlerinin Main ve Preload katmanlarında tutarlı olduğu kontrol edilir.
- **HTML Standartları:** CSP ayarları, ekran sayısı (6 adet) ve stil dosyalarının fiziksel varlığı denetlenir.
- **Güvenlik Sızıntıları:** Renderer katmanında yasaklı fonksiyonlar (`fetch`, `require`), API anahtarları ve inline stiller aranır.
- **Ekip Politikaları:** Yasaklı model referansları (`opencode/`) ve ekip dökümanlarının erişilebilirliği kontrol edilir.
- **Hassas Veriler:** AppData üzerindeki konfigürasyon dosyasında düz metin şifre/token taraması yapılır.

### 2. Fonksiyonel Testler
- `tests/` dizini altındaki tüm unit/integration testleri `node --test` ile çalıştırılır.

## Nasıl Çalıştırılır?

Terminal üzerinden aşağıdaki komut verilerek tüm süreç başlatılır:

```bash
node tools/k3.js
```

## Sonuçların İncelenmesi

Çalıştırma sonucunda detaylı rapor şurada oluşur:
`work/k3-report.txt`

- **PASS (0):** Tüm kontroller başarılı. İşlem onaylanmıştır.
- **FAIL (1):** Bir veya birden fazla kontrol başarısız oldu.

## FAIL Durumunda Ne Yapılır?

1. `work/k3-report.txt` dosyasındaki hata mesajları okunur.
2. Eğer hata **"Doctor"** kısmındaysa, ilgili dosyadaki ihlal (örn. yasaklı paket kullanımı veya IPC uyuşmazlığı) düzeltilir.
3. Eğer hata **"Tests"** kısmındaysa, bozulan test senaryoları incelenir ve kod düzeltmeleri yapılır.
4. Düzelttikten sonra `node tools/k3.js` tekrar çalıştırılarak yeşil ışık alınır.
