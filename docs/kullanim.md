# Keyvotion Console — nasıl kullanılır?

Bu rehber, uygulamayı **açmaktan** bir uygulamayı **bağlayıp Votion'a kullandırmaya** kadar
her adımı anlatır. Her sayı bu makinede ölçülmüştür.

---

## 1. Açma

Proje kökünde **`start.cmd`** dosyasına çift tıkla.

Elle:

```powershell
cd %USERPROFILE%\Keyvotion\src
npm.cmd start
```

> `npm` bu makinede yalnız `npm.cmd` olarak çalışır.
> `start.cmd` electron'u bulamazsa sana `cd src; npm.cmd install` komutunu söyler (tek bağımlılık: electron 45.2.1).

Pencere açılır, sol menüde **23 ekran** görürsün. Hepsi menüden gezilebilir, hiçbiri boş değil
(duman testi: 23/23 gezildi, exception 0).

---

## 2. Sol menü — ne nerede?

| Menü | Ne işe yarar |
|---|---|
| **Sohbet** | Votion asistanıyla konuşma |
| **Ekip / Ekipler / Komut / Pano** | Ajan ekibini yönet, görev ver, panoyu izle |
| **Planlar / Projeler / Raporlar** | Plan, proje ve rapor kayıtları |
| **Dosyalar / Bağlamlar / Hafıza** | Proje dosyaları, bağlam parçaları, hafıza kayıtları |
| **Modeller / Sağlayıcılar** | Model atama, sağlayıcı ayarları |
| **Tarayıcı / Uzaktan** | Gömülü tarayıcı, uzak masaüstü görünümü |
| **Ayarlar / Yönetim** | Uygulama ayarları, yönetici görünümü |
| **Entegrasyonlar** | Bağladığın servislerin listesi ve yetenekleri |
| **MCP Sunucuları** | Kurulu MCP sunucuları ve araçları |
| **Katalog** | 64 entegrasyon + 60 MCP şablonunun tam listesi |
| **⭐ Hazır Bağlantılar** | **Yeni:** 124 hazır kurulum — buradan başla |
| **Denetim** | Her yazma işleminin kaydı (`op`, `capabilityId`, `status`) |
| **Rehber** | Uygulama içi kullanım rehberi |

---

## 3. Bir uygulamayı bağlamak (asıl iş)

**Hazır Bağlantılar** ekranı, 124 servisi (64 entegrasyon + 60 MCP) tek yerden kurmak için var.
Hiçbir şeyi elle yazman gerekmez; her alanın nasıl alınacağı yazılıdır.

### 3.1 Bul
1. Arama kutusuna **en az 2 karakter** yaz (ör. `github`, `slack`, `notion`).
2. Sayaç anında güncellenir: `"124 bağlantı"` → `"2 sonuç"`.
3. İstersen **tür** (Entegrasyon / MCP) ve **kategori** ile daralt.

### 3.2 Seç
Karta tıkla. Sağ panelde üç şey gelir:

- **Özet** — servis ne işe yarar.
- **Nasıl alınır** — numaralı adımlar (`1) … 2) … 3) …`), her adımda doğrudan tıklanabilir bağlantı.
- **Alanlar** — sadece gerekenler. Sır alanları `•••` olarak açılır, yanındaki **göster** ile açabilirsin.

Kartın durumu **yazıyla** yazar: `Hazır` · `Alan eksik` · `Kurulu` · `Bağlı` · `Hata`.

### 3.3 Doldur
- Zorunlu alan boşsa "Bağlan" **çalışmaz**; alanın altında "Zorunlu alan boş — bu alanı doldurun."
  ve sonuç satırında `[E_PRESET_MISSING_FIELDS]` görürsün.
- Sır değerleri **hiçbir yere yazılmaz**: ne log'a, ne denetime, ne ekrana geri döner.

### 3.4 Bağlan
**Bağlan**'a bas → onay penceresi çıkar → onayla. Sonuç üç yoldan biri:

| Preset türü | Ne olur |
|---|---|
| `oauth2` (ör. Google, GitHub OAuth) | Tarayıcıda onay bağlantısı açılır — **anahtar yazmazsın** |
| `token` / `basic` (çoğu servis) | Bağlantı kaydedilir, değer `safeStorage` ile şifrelenir |
| MCP `install` | Sunucu kurulur, araçları Votion'a açılır |

### 3.5 Votion'a izin ver
Formun altındaki **"Votion bu bağlantıyı kullanabilir"** anahtarını işaretle.
İşaretlemezsen bağlantı kurulur ama asistan onu kullanamaz.

> Görsel kutu 20px, tıklama alanı **36px** — küçük hedef kalmadı (ölçüldü: 36px altı hedef 0).

---

## 4. Votion asistanına ne öğrettik?

Votion artık **kurulu olan her bağlantıyı** kullanabilir:

- **195 yetenek** (64 sağlayıcı) + **60 MCP aracı** tek manifestte toplanır.
- Manifest **22 306 B**, asistan bağlam bloğu **14 799 B** — sınır 24 000 B, sığıyor.
- Çağrı **yeni bir ağ katmanı açmaz**; mevcut entegrasyon/MCP yoluna gider.
- **Her çağrı denetime yazılır:** yalnız `{op, capabilityId, status}` — **parametre ve sır yazılmaz**.
- **Rol sınırı yok:** ödeme/satış bağlantıları dahil **bütün sağlayıcılar her kullanıcıda görünür**
  (görünüm rolü T-209 ile kaldırıldı). Yazma yine `confirmToken` + izin matrisinden geçer;
  görünürlük yetki vermez.

Yani: "Slack'e mesaj at", "GitHub'da issue aç", "Notion'a sayfa ekle" gibi istekleri
**senin bağladığın hesaplarla** yapabilir.

---

## 5. Denetim (ne yaptığını gör)

**Denetim** ekranı her yazma işlemini listeler. Satırda `op`, `capabilityId`, `status` var;
**gönderdiğin parametreler ve sırlar yok** (bu bir güvenlik kuralı, eksiklik değil).
Limit seçilebilir (50/100/200/500), satırlar klavyeyle seçilebilir.

---

## 6. Sağlığı kontrol etme

```powershell
cd %USERPROFILE%\Keyvotion
node work\tap-count.js tests   # 307 / 307 / 0
node tools\doctor.js           # 0 FAIL / 0 WARN
node tools\k3.js               # PASSED
node work\html-check.js        # DENGELI
node work\ldr-smoke.js         # uygulamayı açar, 23 ekranı gezer, 124 kart sayar
```

`ldr-smoke.js` gerçek Electron'u açar, menüdeki 23 ekranı tek tek gezer, `connect` ekranında
124 kartı sayar, sonra kapatır. Çıktısı `DUMAN TESTI: GECTI` olmalı.

---

## 7. Sık karşılaşılanlar

| Belirti | Sebep / çözüm |
|---|---|
| `npm` çalışmıyor | Bu makinede yalnız `npm.cmd` çalışır |
| `start.cmd` electron bulamıyor | Bir kez `cd src; npm.cmd install` |
| Kart "Alan eksik" diyor | Zorunlu alan boş; adımları izleyip doldurun |
| "Bağlan" tepki vermiyor | Zorunlu alan boş — alan altındaki kırmızı metne bakın |
| Bağlantı kuruldu ama Votion kullanmıyor | "Votion bu bağlantıyı kullanabilir" anahtarı kapalı |
| Ödeme bağlantısı görünmüyor | Katalogda `commerce` kategorisini seçin; sağlayıcılar her kullanıcıda görünür |

---

## 8. Bilinen sınırlar (dürüst liste)

- Sürüm kontrolü **açık**: `git 2.56.0.windows.4`, dal `master`. **Push / sürüm etiketi** hâlâ
  bakımcı kararıdır; onaysız yapılmaz (`docs/release.md` §4).
- **Paket hazır (ölçüldü):** `dist\Keyvotion Console\Keyvotion Console.exe` **238,2 MB**
  ve `dist\Keyvotion-Console-win32-x64-v3.4.0.zip` **162,7 MB** (v3.4.0). Güncel ZIP
  özeti `dist\SHA256SUMS.txt` içindedir. Arşiv **yeniden üretilebilir**: aynı `src/`
  ağacından üretilen her paket **aynı** SHA-256'yı verir; özeti kendin üretip
  doğrulayabilirsin.
- `build\Keyvotion Console\resources\app\` **eski 0.1.0** kopyası — kullanma;
  güncel çalıştırma `src/`, güncel paket `dist/`.
- Votion'un **gerçek mikrofon** uçtan uca testi bu donanımda ölçülemedi.
- Uçtan uca `safeStorage` disk testi (T-151) ertelendi; işlev `presets.test.js` + `votion-tools.test.js`
  (16/16) ve CDP ile kanıtlı.

