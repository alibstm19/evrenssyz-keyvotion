# Keyvotion Console — Tur 6 Kullanım Rehberi

Bu belge, uygulamanın içindeki **Rehber** ekranının yazılı hâlidir. Votion aynı
adımları sesli anlatır; istediğiniz an **Atla** ile çıkabilirsiniz. Rehber
tamamlandığında bir daha açılışta gösterilmez (Ayarlar → Sistem → *Rehberi
sıfırla* ile geri gelir).

## 1. Parola ve kasa (DPAPI)

- Sunucu parolası **asla düz metin** yazılmaz. Windows DPAPI ile şifrelenip
  `%APPDATA%\Keyvotion Console\secrets.bin` ve `keys.bin` dosyalarına gider.
- `config.json` yalnız sunucu adresi, proje dizini, tema gibi sır olmayan
  tercihleri taşır.
- Parolayı **Ayarlar → Bağlantı** kartından girin. Kaydetme işlemi onay
  anahtarı ister (`confirmToken`); anahtar tek kullanımlıktır ve 5 dakikada
  dolar.
- Parolayı unuttuysanız yeni bir sunucu parolası belirleyip kaydedin. Eski
  anahtar dosyaları silinmez; üzerine yazılmaz, yeni kayıt eklenir.

## 2. Yerel sunucu bağlantısı

1. **Ayarlar → Sunucu** kartında adresi görün (`http://127.0.0.1:<port>`).
2. **Başlat** düğmesi `opencode serve` sürecini başlatır ve parolayı kendisi
   üretir. Süreç ayaktaysa ama bağlantı yoksa durum **“Ayakta, bağlantı yok”**
   yazar; bu bir hata değil, dürüst durumdur.
3. Bağlı durumda üst çubuktaki rozet **Çevrim içi** olur ve ekip seansları
   yüklenir.
4. Sunucu kapalıyken konsol **çevrim dışı** kalır; hiçbir ekran sahte veri
   üretmez. Panoda satır yoksa “Pano bulunamadı”, sohbette anahtar yoksa
   “Sağlayıcı API anahtarı yok” yazar.

> Not: `opencode.exe` her `serve` başlangıcında **yeni rastgele bir parola**
> üretir. Konsol bu parolayı yakalar; siz yalnız **Başlat** demelisiniz. Dış
> süreç kullanıyorsanız parolayı elle girmeniz gerekir.

## 3. Telefondan kontrol

1. **Uzaktan Erişim** ekranında **Başlat**’a basın. Port varsayılan **7788**.
2. Ekranda **10 haneli eşleşme kodu** ve `http://<LAN-IP>:7788` adresi görünür.
3. Telefonda aynı Wi-Fi ağındayken tarayıcıda adresi açın, kodu girin.
4. Telefon istemcisi tek dosyadır (`remote-page.html`), dış istek yapmaz.
   Bağlandıktan sonra **Pano**, **Komut**, **Rapor**, **Hafıza** ve **Durum**
   sekmeleri açılır.
5. **Durdur** deyince erişim anında biter; eski kod geçersizdir.

Güvenlik: kod token’ı yalnız bu bilgisayardan telefona gider; state/health
uçları jetonsuz çağrıda **401** döner. Kod sabit zamanlı karşılaştırılır.

## 4. Hafıza ve zihin haritası

- Her komut, sohbet ve açılıştan sonra çıkarımlar hafızaya **kendiliğinden**
  eklenir (`kv:memory:auto`, append-only).
- **Hafıza** ekranındaki zihin haritasında her nokta bir kayıttır. Üzerine
  gelince kısa özet görünür; noktalar kapsam/role göre kümelenir.
- Amaç: ajan yeni göreve başlarken tüm geçmişi okumaz; ilgili çıkarımı
  hafızadan alır. Bu, uzun oturumlarda bağlam maliyetini düşürür.

## 5. Tarayıcı sekmesini özetle

1. **Tarayıcı** ekranında bir adres açın.
2. **Özetle** düğmesi o an açık sayfayı okur (`kv:browser:summarize`).
3. Özet iki katmanlıdır:
   - **Sezgisel katman** her zaman çalışır; anahtar gerekmez (ana cümleler +
     anahtar kelimeler).
   - **Model katmanı** yalnız API anahtarı varsa devreye girer; hata olursa
     sessizce sezgisel sonuca döner.
4. Sonuç paneli başlık, özet, maddeler ve anahtar kelimeleri gösterir.

## 6. Votion — Türkçe sesli asistan

- Sağ alttaki dalga düğmesi paneli açar. Soru yazabilir veya mikrofona
  basabilirsiniz.
- Ses tanıma ve konuşma **cihaz üzerinde** çalışır (Web Speech API); ağ isteği
  yapılmaz.
- Örnek sorular:
  - “Pano durumu ne?”
  - “Ekip ne yapıyor?”
  - “Son raporları özetle.”
  - “Bu sayfayı özetle.”
  - “Sunucu çevrim içi mi?”
- Ses motoru yoksa panel **yazma moduna** düşer; hata göstermez.

## 7. Lider masası

**Sohbet** ekranında rol olarak **Lider (LDR)** seçip yazın. Aynı sohbet
altyapısı kullanılır; ayrı bir kanal açılmaz. Lider masası ekranı, liderle
konuşmayı ve ekibin son hareketlerini tek yerde gösterir.

## 8. Kişiselleştirme ve kısayollar

- **Ayarlar → Görünüm**: tema (koyu/açık), yoğunluk, yazı boyutu.
- **Ayarlar → Sistem**: rehberi sıfırla, bildirimleri aç/kapat.
- Kısayollar: `Ctrl+1…9` ekranlar, `Ctrl+K` komut paleti, `?` kısayol
  sayfası, `Ctrl+H` komut geçmişi.

## 9. Bilinen sınırlar (ölçülmüş)

- Gerçek model yanıtı ve model katmanlı özet, **API anahtarı eklenene kadar**
  çalışmaz; sezgisel özet çalışır.
- Sunucu “bağlı” olması için gerçek bir `opencode serve` süreci ve eşleşen
  parola gerekir.
- Telefon düzeni gerçek cihazda ayrıca denenmelidir; otomatik denetim yalnız
  yapıyı (sekme, oturum, 401) ölçer.
- Sürüm kontrolü **açık** (`git 2.56.0.windows.4`, dal `master`); push ve sürüm etiketi
  kullanıcı kararıdır. Yedekler `work/backups/` altında zaman damgasıyla tutulur.
