# Keyvotion Console — UI Sözleşmesi (T-012)

| Alan | Değer |
|---|---|
| Görev | EMİR T-012 / T-016 · T-011 öncesi ve sırasında bağlayıcı UI sözleşmesi |
| Sahip | **ARC** (tek yazar). DEV ve DSN bu dosyayı **yalnız okur**. |
| Sürüm | `3.0` · 2026-11-17 · (v1: T-012 · v2: T-016 Tur 2 · v2.1: T-022 · v2.2: T-037 S-1 + E-8 durumu · v2.2.1: T-043 6 ekran · v2.5: Tur 6 — 13 ekran, 12 stylesheet · v2.7: Tur 8 — 17 ekran, 13 stylesheet · v2.8: Tur 9 — Votion 2.0 sesi, media-src · v2.9: Tur 11 — 18 ekran, 14 stylesheet, 83 token, rol projeksiyonu · **v3.0: Tur 12 — 20 ekran, 15 stylesheet, 95 token, entegrasyon + MCP**) · **v3.4: T-201 — 19 stylesheet, Prototip alternatif tasarım dili** · **v3.5: T-203 — rol görünümü kendi geri dönüş yolunu gizlemez (`settings` her rolde açık)** |
| Üst belge | `docs/architecture.md` |
| Bağlayıcılık | DEV (markup/JS) ve DSN (CSS) bu dosyadaki adlara **aynen** uyar. |
| Değişiklik | Yalnız ARC, yeni sürüm + YM emri ile. Ajan talebi YM üzerinden gelir. |

**Okuma sırası:** §2 ekranlar → §3–4 DOM kancaları → §5 durum sözlüğü → §6 CSS değişkenleri → §10 dosya sınırı.
Her kural `UI-xx` kimliklidir ve K2'de **tek tek** denetlenir (§11).

---

## 0.4 Sürüm notu (v2.9 → v3.0 · Tur 12: Bağlantı Katmanı)

**Yıkıcı değişiklik YOK.** Hiçbir ekran kimliği, dosya adı, sınıf adı veya token adı değişmez/silinmez; yalnız ekleme vardır. Kaynak: `work/tasarim-v3.0-baglanti-katmani.md` (Lider, 2026-11-17). API tarafı: `docs/console-api-contract.md` §0.7 + §7.6.

> **v3.1 notu (T-134, Tur 13) — bu tablodan sonra geçerlidir:** ekran **20 → 22** (`+catalog, +audit`) · stylesheet **15 → 16** (`+tur13.css`) · token **95 → 101** (§6.9) · kanal/yazma **100/39 → 105/42**. Bloklar §15.5–§15.8'de, kurallar UI-143…UI-150. Ayrıntı API `§7.9` (OAuth2) + `§7.10` (MCP kataloğu).

> **v3.2 notu (T-143, Tur 14) — bu tablodan sonra geçerlidir:** kullanıcı emri: *"hazır bağlanma yerleri ekle… Votion asistanının da her şeye erişimi olabilsin."* ekran **22 → 23** (`+connect`) · stylesheet **16 → 17** (`+tur14.css`, en son) · token **101 → 107** (§6.10) · kanal/yazma **105/42 → 109/44** · domain **30 → 32** · 124 preset (64 entegrasyon + 60 MCP). Blok §15.9'da, kurallar UI-151…UI-158. Ayrıntı API `§7.11` (presetler) + `§7.12` (Votion araç erişimi).

> **v3.3 notu (T-199) — bu tablodan sonra geçerlidir:** kullanıcı emri: *"baştan aşağı yenilenmiş … alternatif aynı uygulamadan oluştur."* stylesheet **17 → 18** (`+volt.css`, **en son** katman). Ekran **23** ve kanal/yazma **109/44** **değişmez**; hiçbir ekran kimliği, sınıf adı veya token adı değişmez/silinmez — yalnız ekleme vardır. `volt.css` yalnız `[data-design="volt"]` altında konuşur; `<html data-design="classic">` (öznitelik yok) klasik görünümü aynen korur. Bu bir **geri dönüşü tek öznitelik olan alternatif tasarım dili**dir; varsayılan **klasik**tir.

> **v3.4 notu (T-201) — bu tablodan sonra geçerlidir:** kullanıcı emri: *"yeni alternatif uygulamayı oluşturmaya devam et, ismi Keyvotion Prototip; tasarımını baya geliştir."* stylesheet **18 → 19** (`+prototip.css`, **en son** katman, `volt.css`'ten sonra). Ekran **23**, kanal/yazma **109/44** ve token adları **değişmez**; yalnız ekleme vardır. Üç dil aynı anda seçilebilir: **Klasik** (varsayılan), **Volt**, **Prototip** — `data-design` özniteliği tek anahtardır, Ayarlar → Görünüm ve üst şerit düğmesi üçünü de gezer. `prototip.css` yalnız `[data-design="prototip"]` altında konuşur.

> **v3.5 notu (T-203) — bu tablodan sonra geçerlidir:** kullanıcı bildirimi: *"ayarlar bölümü kayıp, ayarlar ve bağlantı bölümünde bir şey yok."* Ölçüm: `viewRole=teacher` iken `Ayarlar` hem gezinmede hem ekranda gizliydi, oysa **rol seçicisi Ayarlar'ın içindedir** — görünüm filtresi kendi geri dönüş yolunu gizlediği için kullanıcı kilitleniyordu; ayrıca `Bağlantı` grubunun beş üyesi de admin-only olduğundan geriye boş bir grup etiketi kalıyordu. Düzeltme (ekran sayısı **23** değişmez, hiçbir ekran kimliği değişmez): (1) `settings` **her rolde açık** → `teacher` **12 → 13**, `student` **5 → 6**; (2) üyeleri bütünüyle gizlenen `kv-nav__group` **gizlenir** (boş etiket kalmaz); (3) Ayarlar'ın yönetim blokları (`roster`, `skills`, `permissions`, `votion-grants`) **kart + bölüm çipi** olarak yalnız `admin` görünümünde görünür ve **arama bunları geri getirmez**. Rol hâlâ güvenlik sınırı değildir.

> **v3.6 notu (T-205) — bu tablodan sonra geçerlidir:** kullanıcı emri: *"otomatik ekip oluşturma özelliği ekle… sunucuya bağlanılamama olmamalı… tasarım olarak Keyvotion Prototip ile açılsın."* Ekran **23**, stylesheet **19**, token adları **değişmez**; kanal/yazma **111/45**. (1) Ekip ekranına **`data-action="team-auto"`** düğmesi ve `openTeamAuto()` önizleme modalı eklendi: proje tanımı (textarea, ≥20 karakter), 3–9 kişi seçimi, `kv:team:plan` ile plan, **`kv:team:apply`** ile `confirmToken` arkasında kadroya ekleme (silme yok). Önizleme model adı ve "model seçilmedi" durumunu metinle yazar; renk tek başına anlam taşımaz (§6 erişilebilirlik ilkesi). (2) **İlk açılış tasarımı `prototip`**: kayıtlı tercih (`kv.prefs.v2`) yoksa `loadPrefs()` Prototip'i seçer; kayıtlı Klasik/Volt her zaman kazanır, hiçbir kullanıcı geri döndürülmez. (3) Açılışta bağlantı: main sunucuyu bir kez başlatır, renderer ~8 sn yeniden dener; kullanıcıya erken "bağlantı yok" gösterilmez. (4) Telefon sayfası: kalıcı hata kartı **iki üst üste** hatadan sonra açılır; ağ/HTTP/eşleme hatası ayrı cümleyle anlatılır (telefon sayfası, konsol UI sözleşmesi dışı).

| Ölçüm | v2.9 | v3.0 | Fark |
|---|---|---|---|
| Ekran (`data-screen`) | 18 | **20** (`+integrations, +mcps`) | +2 |
| Stylesheet | 14 | **15** (`+tur12.css`) | +1 |
| CSS token | 83 | **95** | +12 — §6.8 |
| Kanal / yazma | 86 / 35 | **100 / 39** | +14 / +4 |

- **§2 ekran kümesi 18 → 20:** `integrations` (Entegrasyonlar) ve `mcps` (MCP Sunucuları); bloklar §15'te.
- **§10/UI-123 zinciri 14 → 15:** `tur12.css` **en son** katman (sahibi DSN; yalnız `--kv-*` tüketir, ham renk yazmaz).
- **§6 token 83 → 95:** 12 yeni ad §6.8'de; mevcut 83 ad **aynen korunur**.
- **Rol projeksiyonu:** `integrations` ve `mcps` **admin-only**; `teacher` 12 ve `student` 5 görünümü **değişmez** (UI-133).
- **Kod tesliminden önce yazıldı (T-118):** `index.html` bugün hâlâ v2.9 sayılarını taşıyor (18 / 14); T-122 tamamlanınca `contract-derive` testi yeşile döner.

---

## 0.3 Sürüm notu (v2.8 → v2.9 · Tur 11: 2040 kimliği + Yönetim Merkezi)

**Yıkıcı değişiklik YOK.** Hiçbir ekran kimliği, dosya adı, sınıf adı veya token adı değişmez/silinmez; yalnız ekleme vardır. Ürün gerekçesi: `docs/architecture.md`. API tarafı: `docs/console-api-contract.md` §0.6 + §7.5.

| Ölçüm | v2.8 | v2.9 | Fark |
|---|---|---|---|
| Ekran (`data-screen`) | 17 | **18** (`+admin`) | +1 |
| Stylesheet | 13 | **14** (`+tur11.css`) | +1 |
| CSS token | 60 | **83** | +23 (13 renk · 3 tipografi · 1 yarıçap · 6 hareket) |
| Rol projeksiyonu | — | **`data-role="admin\|teacher\|student"`** | yeni kural (UI-133) |

- **§2 ekran kümesi 17 → 18:** `admin` (Yönetim Merkezi) eklendi; yerleşim ve bloklar §14'te.
- **§10/UI-123 zinciri 13 → 14:** `tur11.css` **en son** katman olarak eklenir (sahibi DSN; yalnız `--kv-*` tüketir, ham renk yazmaz).
- **§6 token 60 → 83:** mevcut 60 ad **aynen korunur** (yalnız değerleri 2040 paletine çekilir); 23 yeni ad §6.7'de. `tokens.css` (§6.1–6.5) + yeni tablo birlikte 83 ad eder.
- **Rol projeksiyonu (UI-133):** aynı DOM, `data-role` ile sadeleşmiş görünüm. Üç ayrı öğrenci/öğretmen/yönetici ekranı **yoktur**.
- **Kod tesliminden önce yazıldı (T-103):** `index.html` bugün 17 ekran/13 stylesheet taşıyor. Kod dilimi (T-104+) tamamlanınca `tests/tur10/contract-derive.test.js` yeşile döner; o zamana kadar kırmızı olması **beklenen** durumdur.

---

## 0.1 Sürüm notu (v2.5 → v2.6 · Tur 8)

- **§10/UI-123 stylesheet sayısı 12 → 13:** `tur8.css` en son katman olarak eklendi (sağ panel, canlı tur, sağ tık menüsü, Votion eylem çubuğu, ekip/pano/rapor/sohbet/ayar/rehber yerleşim tazelemesi).
- **Ekran kümesi DEĞİŞMEDİ: 13.** Tur 8 yeni ekran açmadı; sağ panel (`rail`) ve canlı tur (`tour`) birer **katman**, ekran değildir.
- **Yeni bileşenler (Tur 8):** `.kv-rail` (+ `.kv-rail__tab`, `.kv-rail__pane`, `.kv-rail__bar`), `.kv-tour` (+ `__scrim`, `__spot`, `__card`), `.kv-menu`, `.kv-votion__actions`/`__chip`.
- **Kural eklemeleri:** UI-128 (sağ panel kişiselleştirmesi: aç/kapat, üç sekme, üç genişlik — tercihler `kv.prefs.v2` içinde kalıcı), UI-129 (canlı tur: hedef **ölçülür**, kutu gerçek dikdörtgene oturur, hedef yoksa dürüstçe "bulunamadı" der), UI-130 (sağ tık menüsü yalnız mevcut aksiyonları çağırır, yeni iş mantığı taşımaz), UI-131 (Votion eylem çubuğu: ekran/özet/uygulama/dosya/tur; yıkıcı eylem onay ister).

## 0.2 Sürüm notu (v2.4 → v2.5 · Tur 6)

- **§2 ekran kümesi 12 → 13:** `guide` (Rehber) eklendi — Votion'un anlattığı, atlanabilir kurulum akışı. Ekran LDR kararıyla açıldı (Tur 6 kullanıcı isteği: "ilk açılış rehberi, Votion anlatsın, atlanabilsin").
- **Gezinme gruplandı:** yan menü düz liste yerine dört grup taşır — Çalışma / Bilgi / Sistem / Yardım — ve emoji yerine satır içi SVG ikon kullanır (UI-124).
- **§10/UI-123 stylesheet sayısı 11 → 12:** `tur6.css` **en son** katman olarak eklendi (Tur 6 ekranları: rehber, Voton, zihin haritası, lider masası, komut/rapor/ayar yenilemesi).
- **Yeni bileşenler (Tur 6):** `.kv-guide`, `.kv-desk`, `.kv-cmd`, `.kv-mind`, `.kv-summary--panel`, `.kv-server`, `.kv-votion__fab`/`.kv-votion__panel`, `.kv-settings__grid`.
- **Kural eklemeleri:** UI-124 (gezinme grupları + SVG ikon), UI-125 (zihin haritası tooltip sözleşmesi), UI-126 (Votion paneli), UI-127 (rehber adımı ilerleme çubuğu).

## 0. Sürüm notu (v2.1 → v2.2 · T-037)

> **v2.2.1 (T-043) notu §0.1'dedir.** v2.2 notu tarihsel kayıt olarak korunur.

**Değişti**
- **UI-123 (yeni, §10) — S-1 kapanışı:** stylesheet adları gerçek dosyalarla eşitlendi (`base/shell/screens/components/polish`); "tek giriş noktası" kuralı **kaldırıldı**, 8 dosyalık yükleme sırası **bağlayıcı** ilan edildi. Gerekçe: `src/renderer/index.html` satır 8-15 (8 `<link>`, doğrulandı) ve K3 `t06-styles` testi.

**Eklendi**
- UI-123 — dosya sınırı tablosu gerçek `src/renderer/styles/*.css` listesiyle yenilendi; yeni dosya ekleme Mimar onayına bağlandı.

**Kaldırıldı**
- §10 tablosundaki `src/renderer/styles/layout.css` satırı (dosya yok).
- §10 tablosundaki toplu `@import` giriş dosyası satırı (dosya yok; tek giriş noktası kaldırıldı).

**Not (kural değil)**
- **E-8 (autostart):** hâlâ **AÇIK**; sürüm planındaki autostart maddelerinde tanımlıdır (Startup `.lnk`, varsayılan kapalı). Yeni kural **açılmadı**; UI-97'deki pasif "yakında" etiketi geçerlidir (§12.12).

---

## 0.1 Sürüm notu (v2.2 → v2.2.1 · T-043)

Küçük ve cerrahi sürüm; kod yazılmadı, yalnız belge.

**1. UI §11 C4 — `data-screen` kimlik sayısı 5 → 6**
- Eski satır beş kimlik diyordu. Yeni: **`team, command, board, models, reports, settings`** (6). Gerekçe: §2 tablosu, `src/renderer/index.html` ve gezinme **altı** ekran taşıyor; eskisi doğrudan yanlış bilgiydi.

**2. "beş ekran" kalıntıları temizlendi**
- §12.0 değişiklik kaydı: eski "(beş kimlik)" ifadesi "v2 öncesi beş kimlik" olarak yazıldı.
- Ek (mockup çelişki tablosu): sağ sütun **"6 ekran (`team` + beş tam ekran)"**, çözüm metni "diğer beş ekran".
- UI-11: "Diğer **beş** ekran" (anlam aynı, sayı metinle yazıldı).
- Denetim: sayı + "ekran" bitişik kalıbı → **0** eşleşme (üç dosya).

**3. `cost` biçimi netleşti (S-3 ile uyum)**
- UI-113: `cost` **`null`** ise kartta **`— $`** gösterilir; `0` **uydurulmaz**. `tokens` ve `tokenTotal` her zaman sayıdır.
- Kod düzeltmesi **T-042**'de (DEV); bu belge kararı yazar.

**4. E-8 durumu değişmedi**
- Autostart hâlâ **AÇIK** (Tur 3, T3-17…T3-22). Bu sürümde kural açılmadı.

**5. §10 tablosu makine-okunur yapıldı (T-053 — biçim düzeltmesi)**
- Virgülle birleşik satırlar ayrıldı; artık **her satır tek dosya ve tam yol** taşır. `theme-dark.css` ile `theme-light.css` iki ayrı satır oldu; `screens/**` ve `platform/**` kendi satırlarına çıktı (ikisi de **planlanan** olarak işaretli, dizin henüz yok).
- **Kural değişmedi**, bu yüzden sürüm **v2.2.1 kalır** (v2.2.2 açılmadı).
- Gerekçe: `tests/t06-styles.test.js` listeyi artık sözleşmeden okuyor. Birleşik satır `styles/theme-light.css` dizesini taşımadığı için resmî K3 kapısı kırmızıydı. Test **gevşetilmedi**, sözleşme **kesinleştirildi**.

---

## 1. İlkeler ve çatışma kuralı

| # | Kural |
|---|---|
| UI-01 | Çatışmada öncelik: **bu belge > `work/console-mockup.html` > DSN taslak belgesi**. Mockup yerleşim fikridir, ad kaynağı değildir. |
| UI-02 | Ekranlar arası gezinme **tek pencere içinde** olur; yeni pencere/sekme açılmaz. |
| UI-03 | Tüm kullanıcı metinleri **Türkçe**; DOM kimlikleri, `data-*` değerleri ve CSS adları **İngilizce**. |
| UI-04 | Renderer ağ çağrısı yapmaz (K1 §3.2/S1); her veri `window.keyvotion` köprüsünden gelir. |
| UI-05 | Sabit metin markup'ta; dinamik veri **yalnız** `textContent` ile yazılır (`innerHTML` yasak). |
| UI-06 | Satır içi `style=""` yasak. Tek istisna: JS'in bir CSS değişkenini sayısal olarak set etmesi (`el.style.setProperty("--kv-value", "42%")`). |
| UI-07 | Her yeni görsel öğe, bu sözleşmede adı olan bir bileşenden (§7) türetilir; yeni bileşen = ARC onayı. |
| UI-08 | Erişilebilirlik: her etkileşimli öğe klavyeyle erişilebilir ve görünür odak halkası taşır (UI-40). |

---

## 2. Ekran kimlikleri

Yirmi **üç** ekran vardır; kimlikleri **sabittir** ve `data-screen` değeridir
(v2.1: `reports` · v2.3/Tur 4: `chat`, `memory`, `projects`, `providers`, `browser` ·
v2.4/Tur 5: `remote` · v2.5/Tur 6: `guide` · v2.7/Tur 8: `teams`, `plans`, `files`, `contexts` ·
v2.9/Tur 11: `admin` · v3.0/Tur 12: `integrations`, `mcps` · v3.1/Tur 13: `catalog`, `audit` ·
**v3.2/Tur 14: `connect`**).

| Kimlik | Ad (TR) | Amaç | Varsayılan |
|---|---|---|---|
| `team` | Ekip | Ana ekran / genel bakış: 3×3 panel ızgarası (mockup yerleşimi) | ✅ açılışta bu |
| `command` | Komut Merkezi | Hedef seç, mesaj geçmişi, gönder/durdur | — |
| `board` | Görev Panosu | `.team/board.md` aynası (yazma §12.4'te) | — |
| `models` | Model Merkezi | Havuz + `models.md` kılavuz eşlemesi | — |
| `reports` | Rapor Merkezi | Seans mesajlarından + dosyalardan RAPOR toplama | — |
| `settings` | Ayarlar | Sunucu, parola, dizin, tema, beceri, izin, kişiselleştirme | — |
| `chat` | Sohbet | Doğrudan model sohbeti (konuşma rayı + ileti dizisi + yazma alanı) — T5-2 | — |
| `memory` | Hafıza | Paylaşılan ajan hafızası + akış şeması (topla→damıt→sakla→geri çağır→enjekte) — T4-3 | — |
| `projects` | Projeler | Proje oluştur / geç / arşivle — T4-2 | — |
| `providers` | Sağlayıcılar | Sağlayıcı + çoklu API anahtarı + failover testi — T4-6 | — |
| `browser` | Tarayıcı | Uygulama içi tarayıcı (main proses `WebContentsView`) + sayfa okuma — T4-5/T5-1 | — |
| `remote` | Uzaktan Erişim | Telefondan kontrol: eşleşme kodu, adresler, aç/kapat — T5-4 | — |
| `guide` | Rehber | Atlanabilir kurulum: parola, sunucu, telefon, hafıza, Votion — T6-1 | — |
| `teams` | Ekipler | Aynı anda çok ekip: ayrı lider, üyeler, token bütçesi; silme yok, arşiv — T8-5 | — |
| `plans` | Planlar | Plan · not · zamanlanmış görev (daily/weekly/once) · görev durumu — T8-6 | — |
| `files` | Dosyalar | Proje dosyaları: salt okuma gezinme + önizleme + bağlama seçme — T8-7 | — |
| `contexts` | Bağlamlar | Seçili dosyalar + hafıza → tek bağlam paketi (kopyalanabilir) — T8-7 | — |
| `admin` | Yönetim Merkezi | Kesişen yönetim yüzeyi: ekip/ajan + yerel model kurulumu (indirme, ilerleme, kalan süre) + kanal/sağlayıcı sağlığı + disk + oturum/sürüm + denetim akışı + onaylı tehlikeli eylemler — v2.9, §14 | — |
| `integrations` | Entegrasyonlar | Katalogdan sağlayıcı seç → anahtar gir → bağlan → test → yetenek çalıştır (12 sağlayıcı, şifreli token) — **v3.0**, §15.1 | — |
| `mcps` | MCP Sunucuları | stdio/http MCP sunucusu ekle → bağlan → araç listesi → araç çağır + günlük kuyruğu — **v3.0**, §15.2 | — |
| `catalog` | Bağlantı Kataloğu | **64** entegrasyon + **60** MCP şablonu tek ızgarada: arama, kategori filtresi, sayaç, tek tuşla kur (OAuth2 dahil) — **v3.1**, §15.5 | — |
| `audit` | Denetim | `kv:audit:list` tam görünüm: op/kod/tarih filtresi, `limit ≤ 500`, sır göstermez; `admin` B6'dan ayrıldı — **v3.1**, §15.6 | — |
| `connect` | Hazır Bağlantılar | **124** preset (64 entegrasyon + 60 MCP) kart galerisi: arama, tür/kategori filtresi, sayaç, tek ekran kurulum ("Bağlan"/"Test et"), adım adım "nasıl alınır" — **v3.2**, §15.9 | — |

| # | Kural |
|---|---|
| UI-09 | Aynı anda **tek** `[data-screen]` görünür olur; diğerleri `hidden` özniteliği taşır (`display:none` yerine `hidden`, DSN `[hidden]{display:none!important}` yazar). |
| UI-10 | Ekran değişimi URL/hash kullanmaz (masaüstü uygulaması); durum `app.js` içindeki tek store'da tutulur. |
| UI-11 | `team` ekranı birleşik panodur: içinde **7 panel** bulunur (§4.1 + §12.6 rapor paneli). Diğer **beş** ekran tek modüllü tam görünümdür. |
| UI-12 | Panel başlığındaki `data-action="open-screen"` düğmesi ilgili tam ekrana geçer (`data-target` = hedef ekran kimliği). |
| UI-13 | Geri dönüş: her tam ekranın başlığında `data-action="go-home"` düğmesi `team`'e döner. |
| UI-133 | **Rol projeksiyonu (v2.9, Tur 11; v3.0'da genişledi):** `<html>` üzerinde `data-role="admin\|teacher\|student"` taşınır; **varsayılan `admin`** (mevcut davranış birebir korunur) ve değer `kv.prefs.v2` içindeki `viewRole` ile kalıcıdır. Görünürlük: `admin` **23/23** ekran · `teacher` **13** ekran (`team, command, board, plans, files, contexts, memory, reports, chat, models, remote, guide, settings`) · `student` **6** ekran (`team, board, reports, chat, guide, settings`). **v3.5: `settings` her rolde açıktır** — rol seçicisi orada yaşar; görünüm filtresi kendi geri dönüş yolunu gizleyemez. Ayarlar'ın yönetim blokları (`roster`, `skills`, `permissions`, `votion-grants`) kart ve bölüm çipi olarak yalnız `admin` görünümünde görünür; arama bunları geri getirmez. Üyeleri bütünüyle gizlenen `kv-nav__group` de gizlenir (boş grup etiketi kalmaz). **v3.0: `integrations` ve `mcps` yalnız `admin` görünümünde açıktır** — `teacher` ve `student` için gizlidir (yazma ve dış-etki yüzeyi oldukları için; bu bir *görünüm* kuralıdır, güvenlik kapısı değildir — yetki yine API'de). **v3.1: `catalog` ve `audit` de yalnız `admin` görünümündedir** (`catalog` kurulum/OAuth yazma yüzeyi, `audit` operasyon üst verisi taşır; `teacher` 12 ve `student` 5 **değişmez**). **v3.2: `connect` de yalnız `admin`'dir** (124 preset kurulum yüzeyi; `teacher` 12 ve `student` 5 **değişmez**). Gizlenen ekranın **hem** `data-nav-item` öğesi **hem** `data-screen` bölümü `hidden` + `aria-hidden="true"` taşır; gizlenen ekranın `data-action` düğmeleri **DOM'dan çıkarılır** (görünmez ama tıklanabilir düğme bırakılmaz). Rol değişimi yeniden yükleme gerektirmez, odak geçerli ekranda kalır. **Rol görünümü güvenlik sınırı değildir; yazma yine `confirmToken` + izin matrisinden geçer. Rol görünümü yetki vermez, yetki gizlemez.** |
| UI-134 | **Rol seçimi yeri (v2.9):** rol yalnız `settings` ekranının "Görünüm" bölümünde `[data-field="role-select"]` üç düğmeli segment ile değiştirilir (`data-role-set="admin\|teacher\|student"`, `aria-pressed`); başka ekranda rol değiştiren kontrol **yoktur**. Kilit perdesi (varsa) rol değişimini engellemez — kilit mahremiyet perdesidir, yetki kapısı değildir. |

---

## 3. Uygulama kabuğu — genel DOM kancaları

```html
<!-- ÖRNEK iskelet — adlar bağlayıcı, içerik değil -->
<html lang="tr" data-theme="dark">
<body>
  <div class="kv-app" data-app>
    <aside class="kv-nav" data-nav>
      <button class="kv-nav__item" data-nav-item="team" aria-current="page">Ekip</button>
      <!-- command · board · models · settings -->
    </aside>
    <header class="kv-topbar" data-topbar>
      <span class="kv-chip" data-connection data-state="connecting">Bağlanıyor…</span>
      <span class="kv-muted" data-last-sync>—</span>
    </header>
    <main class="kv-main">
      <section data-screen="team"> … </section>
      <section data-screen="command" hidden> … </section>
      <!-- board · models · settings -->
    </main>
    <div data-toast-root aria-live="polite"></div>
    <div data-modal-root></div>
  </div>
</body>
</html>
```

| Kanca | Anlam | Zorunlu öznitelikler |
|---|---|---|
| `[data-app]` | Uygulama kökü | — |
| `[data-nav]` | Yan gezinme | — |
| `[data-nav-item="<ekran>"]` | Gezinme düğmesi | `data-nav-item` = §2 kimliklerinden biri |
| `[data-screen="<ekran>"]` | Ekran bölümü | `data-screen` = §2 kimliklerinden biri |
| `[data-topbar]` | Üst şerit | — |
| `[data-connection]` | Bağlantı rozeti | `data-state` = §5 kümesi |
| `[data-last-sync]` | Son eşitleme zamanı | — |
| `[data-toast-root]` | Bildirim yığını | `aria-live="polite"` |
| `[data-modal-root]` | Modal ev sahibi | — |

| # | Kural |
|---|---|
| UI-14 | Aktif gezinme düğmesi `aria-current="page"` taşır; diğerlerinde bu öznitelik **bulunmaz**. |
| UI-15 | `data-connection` yalnız §5.1'deki 4 değeri alır; metni de aynı tablodan gelir. |
| UI-16 | `[data-last-sync]` biçimi `son eşitleme HH:mm:ss` (yerel saat, `tr-TR`) veya `—` (hiç eşitlenmedi). |
| UI-17 | Modal ve toast **yalnız** `[data-modal-root]` / `[data-toast-root]` içine eklenir; başka yerde overlay oluşturulmaz. |

---

## 4. Ekran bazlı DOM kancaları

### 4.1 `team` — Ekip (dinamik kadro, 0..n kart)

```html
<div class="kv-grid" data-team-grid>
  <article class="kv-card" data-role-card="DEV" data-role="DEV" data-state="busy">
    <h3 class="kv-card__title" data-field="role">Yazılımcı (DEV)</h3>
    <span class="kv-badge" data-field="state">Çalışıyor</span>
    <dl>
      <dt>Model</dt><dd data-field="model">opencode/flint-40b-free</dd>
      <dt>İş</dt><dd data-field="title">T-011 iskelet</dd>
      <dt>Token</dt><dd data-field="tokens">171.166 / 7.555</dd>
      <dt>Maliyet</dt><dd data-field="cost">—</dd>
      <dt>Güncellendi</dt><dd data-field="updated">00:12</dd>
    </dl>
    <button class="kv-button" data-action="open-command" data-target-session="ses_e6c8…">Komut</button>
  </article>
</div>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-team-grid]` | Kart ızgarası; kart sayısı roster satırı sayısı kadardır | UI-111 |
| `[data-role-card="<KOD>"]` + `[data-role]` | Seans kartı; `KOD` roster'dan gelir (`LDR,YM,ARC,DEV,DSN,QA,OPS` veya onaylı `DEV2` gibi) | UI-111 |
| `[data-role-card][data-state]` | Seans durumu | §5.1 kümesi |
| `[data-role-card][data-missing="true"]` | Roster'da olup sunucuda bulunmayan seans | UI-20 |
| `[data-field="role"\|"model"\|"title"\|"tokens"\|"cost"\|"updated"\|"state"]` | Kart alanları | UI-19, UI-113 |
| `[data-action="open-command"]` | Karttan komut ekranına geçiş | `data-target-session` = seans ID'si |

| # | Kural |
|---|---|
| ~~UI-18~~ | **v2.1 ile KALDIRILDI** — "team ekranı 7 kart render eder" kuralı geçersizdir; yerine **UI-111** (dinamik kadro, 0..n) geçmiştir. |
| UI-19 | `[data-field="tokens"]` biçimi `giriş / çıkış` binlik ayraçlı; veri yoksa `—`. `[data-field="updated"]` biçimi `HH:mm`; bugünden eskiyse `GG.AA HH:mm`. |
| UI-20 | `data-missing="true"` kartta `data-field="model"` yerine `kadro kaydı var, seans yok` yazar ve kart `--kv-danger` kenarlık alır. |
| ~~UI-21~~ | **v2.1 ile KALDIRILDI** — sabit `LDR,YM,ARC,DEV,DSN,QA,OPS` sırası zorunluluğu geçersizdir; yerine **UI-112** (yalnız varsayılan roster için sabit sıra) geçmiştir. |
| UI-22 | `team` ekranında komut **gönderilmez**; yalnız komut ekranına geçilir (yıkıcı eylem tek yerde). |
| UI-111 | **Dinamik kadro (C-1):** ekip ekranı kartları **roster satırlarından** üretilir; kart sayısı sabit değildir (0..n) ve `data-role-card` ile `[data-role]` ikisi de roster kodunu taşır. |
| UI-112 | Sabit sıra `LDR, YM, ARC, DEV, DSN, QA, OPS` **yalnız varsayılan roster** için geçerlidir; roster değiştiyse ek kodlar okuma (alfabetik) sırasında sona eklenir ve hiçbir kart gizlenmez. |
| UI-113 | `[data-field="cost"]` **E-1:** seans `cost` değeri **sayı** ise `$` + `Intl.NumberFormat("tr-TR",{minimumFractionDigits:2})`, **`null`/`undefined`** ise **`— $`** gösterilir; `0` uydurma değer olarak yazılmaz (API §4.1: `cost` `number\|null`, `null` = bilinmiyor). |

### 4.2 `command` — Komut Merkezi

```html
<form class="kv-command" data-command-form>
  <label class="kv-field">Hedef
    <select class="kv-input" data-field="targets" multiple>
      <option value="ses_e6c8…" data-role="DEV">DEV — Yazılımcı</option>
    </select>
  </label>
  <label class="kv-field">Mesaj
    <textarea class="kv-input" data-field="text" rows="4" maxlength="8000"></textarea>
  </label>
  <div class="kv-row">
    <button class="kv-button" type="submit" data-action="send">Gönder…</button>
    <button class="kv-button" type="button" data-action="interrupt">Durdur…</button>
    <span class="kv-muted" data-field="counter">0 / 8000</span>
  </div>
</form>

<section class="kv-log" data-command-log aria-live="polite">
  <article class="kv-message" data-message data-kind="user" data-at="2026-11-01T00:12:00Z">…</article>
</section>
```

Onay diyaloğu (`[data-modal-root]` içinde):

```html
<div class="kv-modal" data-confirm-dialog role="dialog" aria-modal="true" aria-labelledby="confirm-title">
  <h2 id="confirm-title">Komut gönderilsin mi?</h2>
  <p data-confirm-summary>DEV · opencode/flint-40b-free · 148 karakter</p>
  <div class="kv-row">
    <button class="kv-button" data-action="confirm-send">Gönder</button>
    <button class="kv-button kv-button--ghost" data-action="cancel">Vazgeç</button>
  </div>
</div>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-command-form]` | Gönderim formu | — |
| `[data-field="targets"]` | Hedef seans seçimi (çoklu) | `option[value]` = seans ID, `data-role` = rol kodu; gönderimde `string[]` |
| `[data-field="text"]` | Mesaj alanı | `maxlength="8000"` zorunlu |
| `[data-field="counter"]` | `n / 8000` sayacı | UI-26 |
| `[data-action="send"]` | Gönderim başlatır | UI-23: **onay diyaloğu açar**, doğrudan göndermez |
| `[data-action="interrupt"]` | Durdurma | UI-24: önce onay |
| `[data-command-log]` | Mesaj listesi | `aria-live="polite"` |
| `[data-message]` | Tek mesaj | `data-kind` ∈ `user\|assistant\|tool\|system`, `data-at` = ISO-8601 UTC |
| `[data-confirm-dialog]` | Onay modalı | `role="dialog"`, `aria-modal="true"`, odak tuzağı |
| `[data-confirm-summary]` | Onay özeti | UI-25 biçimi |
| `[data-action="confirm-send"]` / `[data-action="cancel"]` | Onay / vazgeç | — |

| # | Kural |
|---|---|
| UI-23 | `data-action="send"` hiçbir koşulda doğrudan IPC çağırmaz; **yalnız** `[data-confirm-dialog]` açar (K1 §3.2/S6). |
| UI-24 | `data-action="interrupt"` da onay diyaloğu ister; onay metni `"Çalışan iş durdurulsun mu?"`. |
| UI-25 | `[data-confirm-summary]` biçimi: `<ROL> · <sağlayıcı/model> · <n> karakter`. |
| UI-26 | `[data-field="counter"]` her girişte güncellenir; 7000 üzeri `--kv-warning`, 8000'de `--kv-danger` rengi. |
| UI-27 | Mesaj listesi **en yeni altta**; otomatik kaydırma yalnız kullanıcı en alttaysa yapılır. |
| UI-28 | Gönderim sürerken `[data-action="send"]` `disabled` + `aria-busy="true"`; ikinci tıklama ikinci emir üretmez. |
| UI-29 | Hedef seçiminde oturum yoksa form devre dışı; yerine `[data-field="targets"]` yanında `Bağlantı yok` metni gösterilir. |
| UI-114 | **Tekil hedef alanı (C-2):** kanonik alan `[data-field="targets"]` (`string[]` tipinde); `[data-field="target"]` yalnız kart eyleminden gelen **ön seçim** için kullanılan gizli alandır ve değeri her zaman tek elemanlı `targets` dizisine yazılır — iki alan aynı anda gönderilmez. |

### 4.3 `board` — Görev Panosu (salt-okunur)

```html
<section data-board>
  <h2 data-board-phase>Aşama 1 — Keyvotion Console MVP</h2>
  <section data-board-group="devam">
    <h3 data-board-group-title>Devam (2)</h3>
    <table class="kv-table">
      <tbody>
        <tr data-board-row data-id="T-011" data-owner="DEV" data-status="devam">
          <td data-field="id">T-011</td>
          <td data-field="title">DEV iskelet + ilk çalışan pencere</td>
          <td data-field="owner">DEV</td>
          <td><span class="kv-badge" data-field="status">devam</span></td>
          <td data-field="evidence">hedef: src/main…</td>
        </tr>
      </tbody>
    </table>
  </section>
  <section data-board-group="planlandi"><h3 data-board-group-title>Planlandı (0)</h3></section>
  <section data-board-group="inceleme"><h3 data-board-group-title>İnceleme (0)</h3></section>
  <section data-board-group="bitti"><h3 data-board-group-title>Bitti (4)</h3></section>
  <p data-board-error hidden>Pano okunamadı (satır 42). Son iyi kopya gösteriliyor.</p>
</section>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-board]` | Pano kökü | — |
| `[data-board-phase]` | Aşama başlığı | board.md `## Aşama …` satırından |
| `[data-board-group="planlandi\|devam\|inceleme\|bitti"]` | Aşama grubu kabı (E-2) | içinde o durumun `[data-board-row]` satırları |
| `[data-board-group-title]` | Grup başlığı + sayı | `başlık (n)` biçimi |
| `[data-board-row]` | Görev satırı | `data-id` (`T-\d{3}`), `data-owner`, `data-status` |
| `[data-board-row][data-status]` | Görev durumu | §5.2 kümesi — **`data-state` kullanılmaz** |
| `[data-field="id"\|"title"\|"owner"\|"status"\|"evidence"]` | Hücreler | — |
| `[data-board-error]` | Ayrıştırma hatası bandı | `hidden` varsayılan |

| # | Kural |
|---|---|
| ~~UI-30~~ | **v2.1 ile KALDIRILDI** — "pano salt-okunur, hiçbir düğme yazmaz" kuralı geçersizdir; yerine **UI-81/UI-82/UI-83** (onaylı + yedekli `kv:board:write`) geçmiştir. |
| UI-31 | Ayrıştırma hatasında son iyi kopya korunur, `[data-board-error]` görünür olur ve uygulama çökmez (K1 §3.4/C). |
| UI-32 | Durum rozeti renkleri §5.2 tablosundan gelir; bilinmeyen durum değeri `bloke` gibi nötr gri gösterilir ve `data-status="bloke"` yazılmaz, ham değer `data-status-raw` içinde tutulur. |
| UI-33 | Üst bilgi `Sıradaki ID: T-xxx` metni `[data-board-next]` içinde gösterilir (board.md başlığından). |
| UI-115 | **Pano gruplama (E-2):** her `[data-board-row]`, `data-status` değerine karşılık gelen `[data-board-group="planlandi\|devam\|inceleme\|bitti"]` kabının **içinde** render edilir; 4 grup her zaman (boş olsa da) görünür ve boş grupta satır yerine `—` yazılır. |

### 4.4 `models` — Model Merkezi (salt-okunur liste)

```html
<div class="kv-cost-summary" data-cost-summary>
  <span>Toplam token: <strong data-field="total-tokens">—</strong></span>
  <span>Toplam maliyet: <strong data-field="total-cost">—</strong></span>
  <span>Seans: <strong data-field="session-count">—</strong></span>
</div>
<section data-provider-group="evren">
  <h3 data-provider-group-title>Evren Ekibim (2)</h3>
  <table class="kv-table" data-model-table>
    <tbody>
      <tr data-model-row data-provider="evren" data-model="deepseek-v4.1-flash" data-in-pool="true">
        <td data-field="name">DeepSeek V4.1 Flash</td>
        <td data-field="capabilities">araç · metin</td>
        <td data-field="guide">Mimari, kritik karar</td>
        <td data-field="usage">12 seans · 1,2 M token</td>
        <td><span class="kv-badge" data-field="pool">havuzda</span></td>
      </tr>
    </tbody>
  </table>
</section>
<section data-provider-group="ollama">
  <h3 data-provider-group-title>Ollama (1)</h3>
  <table class="kv-table" data-model-table><tbody></tbody></table>
</section>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-cost-summary]` + `[data-field="total-tokens"\|"total-cost"\|"session-count"]` | Maliyet/token özeti (E-4) | UI-116 |
| `[data-provider-group="<providerID>"]` | Sağlayıcı grubu kabı (E-3) | UI-117 |
| `[data-provider-group-title]` | Grup başlığı + model sayısı | `ad (n)` |
| `[data-model-table]` | Model tablosu (grup içinde bir tane) | — |
| `[data-model-row]` | Tek model | `data-provider`, `data-model`, `data-in-pool="true\|false"` |
| `[data-field="name"\|"capabilities"\|"guide"\|"usage"\|"pool"]` | Hücreler | — |

| # | Kural |
|---|---|
| ~~UI-34~~ | **v2.1 ile KALDIRILDI** — "model listesi salt-okunur, değiştirme düğmesi yok" kuralı geçersizdir; yerine **UI-86/UI-87** (atama modalı + `kv:models:assign`) geçmiştir. |
| UI-35 | `data-in-pool="false"` satır `havuz dışı` rozeti taşır (K1 §4.4). |
| UI-36 | `[data-field="capabilities"]` yalnız `araç`, `metin`, `görsel` sözcüklerinden oluşur, ` · ` ile ayrılır. |
| UI-116 | **Maliyet özeti (E-4):** `[data-cost-summary]` toplam token, toplam maliyet ve seans sayısını gösterir; değer yoksa `—` yazılır, toplam **yalnız** bilinen değerlerden hesaplanır ve eksik veri `0` sayılmaz. |
| UI-117 | **Sağlayıcı gruplama (E-3):** model satırları `[data-provider-group="<providerID>"]` kapları içinde gruplanır; her grup `[data-provider-group-title]` ile `ad (model sayısı)` başlığı taşır ve sağlayıcı kapalıysa gruba `data-provider-disabled="true"` eklenir. |

### 4.5 `settings` — Ayarlar

```html
<form class="kv-form" data-settings-form>
  <label class="kv-field">Sunucu adresi
    <input class="kv-input" data-field="server-url" placeholder="http://127.0.0.1:4096">
  </label>
  <label class="kv-field">Parola
    <input class="kv-input" type="password" data-field="password" autocomplete="off" placeholder="••••••">
  </label>
  <p class="kv-muted" data-secret-state="missing">Parola kayıtlı değil.</p>
  <label class="kv-field">Proje dizini
    <input class="kv-input" data-field="project-dir" readonly>
  </label>
  <label class="kv-field">Tema
    <select class="kv-input" data-field="theme"><option value="dark">Koyu</option><option value="light">Açık</option></select>
  </label>
  <button class="kv-button" type="button" data-action="test-connection">Bağlantıyı test et</button>
  <p data-connection-result></p>
</form>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-settings-form]` | Ayar formu | — |
| `[data-field="server-url"\|"password"\|"project-dir"\|"theme"]` | Alanlar | UI-37, UI-38 |
| `[data-secret-state]` | Parola durumu | `stored\|missing\|corrupt` |
| `[data-action="test-connection"]` | Bağlantı testi | UI-39 |
| `[data-connection-result]` | Test sonucu | metin §5.3 tablosundan |

| # | Kural |
|---|---|
| UI-37 | `[data-field="password"]` **hiçbir zaman** kayıtlı parolayla doldurulmaz; boş açılır, `placeholder="••••••"` gösterir ve yalnız kullanıcı yazdığında IPC'ye gönderilir. |
| UI-38 | `[data-field="project-dir"]` kullanıcı tarafından düzenlenemez (`readonly`). |
| UI-39 | Bağlantı testi sonucu `[data-connection-result]` içine yazılır; parola hiçbir sonuç metninde görünmez. |
| UI-118 | **Tek dizin alanı (C-3):** proje dizini için tek kanonik kanca `[data-field="project-dir"]`'dir; MVP tek proje çalıştığı için alan `readonly`'dir ve ajan ekleme formunda ayrı bir dizin alanı **açılmaz** (API-62). |

---

## 5. Durum sözlüğü

### 5.1 Seans durumu — `data-state` (yalnız 4 değer)

| Değer | Anlam | Rozet metni | Renk değişkeni |
|---|---|---|---|
| `idle` | Seans boşta, iş beklemiyor | `Boşta` | `--kv-state-idle` |
| `busy` | Seans çalışıyor (tur sürüyor) | `Çalışıyor` | `--kv-state-busy` |
| `error` | Son tur hata ile bitti | `Hata` | `--kv-state-error` |
| `offline` | Sunucuya ulaşılamıyor / seans yok | `Çevrimdışı` | `--kv-state-offline` |

| # | Kural |
|---|---|
| UI-40 | `data-state` yalnız bu 4 değeri alır; başka değer yazılırsa K2'de red sebebidir. |
| UI-41 | Bağlantı yokken **tüm** kartlar `data-state="offline"` olur; son bilinen veriler soluk (`--kv-fg-subtle`) gösterilir ama silinmez. |
| UI-42 | `busy` rozeti `prefers-reduced-motion: no-preference` iken nabız animasyonu taşıyabilir; `reduce` modunda animasyon yoktur. |

### 5.2 Görev durumu — `data-status` (board.md sözlüğü)

| Değer | Anlam | Renk değişkeni |
|---|---|---|
| `planlandi` | Planlandı / bekliyor | `--kv-state-idle` |
| `devam` | Devam ediyor | `--kv-state-busy` |
| `inceleme` | İncelemede | `--kv-accent` |
| `bitti` | Bitti | `--kv-success` |
| `red` | Reddedildi | `--kv-danger` |
| `bloke` | Bloke | `--kv-warning` |

| # | Kural |
|---|---|
| UI-43 | Görev durumu `data-status`, seans durumu `data-state` ile taşınır; iki öznitelik birbirinin yerine kullanılmaz. |
| UI-44 | `planlandı/devam/…` Türkçe karşılıkları yalnız görünen metinde kullanılır; `data-status` değeri **daima** bu tablodaki ASCII değerdir (board.md ile birebir). |

### 5.3 Bağlantı durumu — `data-connection[data-state]`

| Değer | Rozet metni | Ekranda |
|---|---|---|
| `connecting` | `Bağlanıyor…` | üst şerit, nötr |
| `connected` | `Bağlı` | üst şerit, `--kv-success` nokta |
| `offline` | `Çevrimdışı · son veri HH:mm` | üst şerit, `--kv-danger` |
| `unauthorized` | `Parola geçersiz` | üst şerit, `--kv-warning` + Ayarlar bağlantısı |

Bağlantı testi sonuç metinleri: `Bağlantı kuruldu (2.2.0)`, `Parola geçersiz`, `Sunucuya ulaşılamadı`, `Beklenmeyen yanıt (kod)`.

---

## 6. CSS değişken sözleşmesi (`--kv-*`)

**Kural:** Tüm değişkenler `src/renderer/styles/tokens.css` içinde `:root` altında tanımlanır. DSN tanımlar, DEV **yalnız tüketir** (UI-45). Değişken adları dondurulmuştur; ekleme ARC onayı ister.

### 6.1 Renk — yüzey ve metin
| Değişken | Rol | Koyu tema | Açık tema |
|---|---|---|---|
| `--kv-bg` | Uygulama arka planı | `#121212` | `#f7f7f8` |
| `--kv-bg-elev-1` | Panel/kart yüzeyi | `#1e1e1e` | `#ffffff` |
| `--kv-bg-elev-2` | Başlık/input yüzeyi | `#2a2a2a` | `#f0f0f2` |
| `--kv-bg-hover` | Hover yüzeyi | `#2f2f2f` | `#e8e8ec` |
| `--kv-fg` | Ana metin | `#ffffff` | `#16161a` |
| `--kv-fg-muted` | İkincil metin | `#a8a8b3` | `#5b5b66` |
| `--kv-fg-subtle` | Üçüncül / bayat veri | `#6e6e7a` | `#8a8a96` |
| `--kv-border` | Kenarlık | `#333333` | `#dcdce2` |
| `--kv-border-strong` | Vurgulu kenarlık | `#4a4a4a` | `#c2c2cc` |
| `--kv-overlay` | Modal arka perdesi | `rgba(0,0,0,.6)` | `rgba(0,0,0,.35)` |

### 6.2 Renk — anlam
| Değişken | Rol | Koyu tema | Açık tema |
|---|---|---|---|
| `--kv-accent` | Birincil eylem | `#3b82f6` | `#2563eb` |
| `--kv-accent-hover` | Birincil hover | `#2f6fd8` | `#1d4ed8` |
| `--kv-on-accent` | Birincil üstü metin | `#ffffff` | `#ffffff` |
| `--kv-success` | Başarı | `#22c55e` | `#15803d` |
| `--kv-warning` | Uyarı | `#f59e0b` | `#b45309` |
| `--kv-danger` | Hata/yıkıcı | `#ef4444` | `#b91c1c` |
| `--kv-info` | Bilgi | `#38bdf8` | `#0369a1` |
| `--kv-focus-ring` | Odak halkası | `#93c5fd` | `#2563eb` |

### 6.3 Durum renkleri (rozet arka planı)
| Değişken | Rol |
|---|---|
| `--kv-state-idle` | `idle` / `planlandi` |
| `--kv-state-busy` | `busy` / `devam` |
| `--kv-state-error` | `error` / `red` |
| `--kv-state-offline` | `offline` / `bloke` |
| `--kv-on-state` | Rozet metin rengi (durum arka planı üstünde) |

### 6.4 Tipografi
| Değişken | Değer |
|---|---|
| `--kv-font-sans` | `"Segoe UI", system-ui, -apple-system, sans-serif` |
| `--kv-font-mono` | `"Cascadia Mono", "Consolas", monospace` |
| `--kv-fs-xs` | `12px` |
| `--kv-fs-sm` | `13px` |
| `--kv-fs-md` | `14px` |
| `--kv-fs-lg` | `16px` |
| `--kv-fs-xl` | `20px` |
| `--kv-fs-2xl` | `26px` |
| `--kv-lh-tight` | `1.25` |
| `--kv-lh-normal` | `1.5` |
| `--kv-fw-regular` | `400` |
| `--kv-fw-medium` | `500` |
| `--kv-fw-bold` | `700` |

### 6.5 Boşluk, yarıçap, gölge, hareket, katman
| Değişken | Değer |
|---|---|
| `--kv-space-1` … `--kv-space-8` | `4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px` |
| `--kv-radius-sm` | `4px` |
| `--kv-radius-md` | `8px` |
| `--kv-radius-lg` | `12px` |
| `--kv-radius-pill` | `999px` |
| `--kv-shadow-sm` | `0 1px 2px rgba(0,0,0,.20)` |
| `--kv-shadow-md` | `0 4px 8px rgba(0,0,0,.25)` |
| `--kv-shadow-focus` | `0 0 0 2px var(--kv-focus-ring)` |
| `--kv-dur-fast` | `120ms` |
| `--kv-dur-normal` | `200ms` |
| `--kv-ease` | `cubic-bezier(.2,.7,.3,1)` |
| `--kv-sidebar-w` | `184px` |
| `--kv-topbar-h` | `48px` |
| `--kv-grid-gap` | `var(--kv-space-4)` |
| `--kv-content-max` | `1440px` |
| `--kv-z-modal` | `100` |
| `--kv-z-toast` | `200` |

### 6.6 Kural seti
| # | Kural |
|---|---|
| UI-45 | DEV hiçbir CSS dosyasına yazmaz; DSN hiçbir `.js`/`.html` dosyasına yazmaz. |
| UI-46 | Hiçbir dosyada ham renk (`#hex`, `rgb()`) `tokens.css` dışında kullanılmaz. |
| UI-47 | `:root[data-theme="dark"]` varsayılan; `:root[data-theme="light"]` açık tema; `data-theme` değeri `<html>` üzerinde değişir, yeniden yükleme olmaz. |
| UI-48 | `@media (prefers-reduced-motion: reduce)` altında `--kv-dur-fast` ve `--kv-dur-normal` → `0ms`. |
| UI-49 | Font boyutu `rem/em` değil `var(--kv-fs-*)` ile verilir; ölçek büyütme tek yerden yapılabilir kalır. |
| UI-50 | `tokens.css` dışında `!important` yalnız `[hidden]{display:none}` için kullanılır. |

### 6.7 v2.9 ek tokenları (+23 — Tur 11 "2040" dili)

Mevcut 60 ad (§6.1–6.5) **aynen korunur**; aşağıdaki 23 ad **eklenir** → toplam **83**. Kural: yeni token değeri de yalnız `tokens.css` içinde tanımlanır (UI-45/46); ham renk başka dosyada yasak.

**Renk (+13)**

| Değişken | Rol | Koyu tema | Açık tema |
|---|---|---|---|
| `--kv-accent-2` | İkincil sinyal (bağlantı/seçim) | `#8aa0ff` | `#4056c8` |
| `--kv-accent-2-hover` | İkincil hover | `#a6b7ff` | `#3345ab` |
| `--kv-hairline` | 1px ayraç (kenarlıktan ayrı niyet) | `#232a31` | `#e3eaef` |
| `--kv-glass` | Cam yüzey dolgusu (**yalnız 2 katman**, UI-136) | `rgba(18,22,26,.72)` | `rgba(255,255,255,.72)` |
| `--kv-glass-border` | Cam kenarı | `rgba(255,255,255,.08)` | `rgba(14,20,24,.08)` |
| `--kv-glow-accent` | Seçili/odak halesi | `0 0 0 1px #3ddcb4, 0 0 18px rgba(61,220,180,.28)` | `0 0 0 1px #0c8f72, 0 0 14px rgba(12,143,114,.20)` |
| `--kv-chart-1` | Veri serisi 1 | `#3ddcb4` | `#0c8f72` |
| `--kv-chart-2` | Veri serisi 2 | `#8aa0ff` | `#4056c8` |
| `--kv-chart-3` | Veri serisi 3 | `#f5b544` | `#9a6206` |
| `--kv-chart-4` | Veri serisi 4 | `#f26d6d` | `#b3261e` |
| `--kv-chart-5` | Veri serisi 5 | `#56c8f5` | `#0b6e99` |
| `--kv-chart-6` | Veri serisi 6 | `#b98cff` | `#6d4bc4` |
| `--kv-progress-track` | İlerleme rayı | `#1f262e` | `#e3eaef` |

**Tipografi (+3)**

| Değişken | Değer | Kullanım |
|---|---|---|
| `--kv-fs-micro` | `0.6875rem` | Rozet, tablo başlığı, meta |
| `--kv-fs-3xl` | `2rem` | Yönetim Merkezi başlığı |
| `--kv-fs-4xl` | `2.5rem` | Yalnız KPI/metrik göstergesi |

> **Not (UI-137):** v2.9'da `--kv-fs-xs`…`--kv-fs-2xl` **değerleri px → rem** olur (`0.75 / 0.8125 / 0.875 / 1 / 1.25 / 1.625rem`). Ad değişmez; 16px kökte görsel fark yoktur, işletim sistemi ölçeklemesi çalışır. Sayısal göstergelerde `font-variant-numeric: tabular-nums` **zorunludur**.

**Geometri (+1)**

| Değişken | Değer | Kullanım |
|---|---|---|
| `--kv-radius-xl` | `20px` | Yalnız hero/KPI paneli (§14) |

**Hareket (+6)**

| Değişken | Değer | Kullanım |
|---|---|---|
| `--kv-dur-micro` | `90ms` | Hover/basış/rozet |
| `--kv-dur-enter` | `220ms` | Modal, çekmece, menü |
| `--kv-dur-screen` | `260ms` | Ekran değişimi (opaklık + 4px kayma) |
| `--kv-dur-progress` | `400ms` | İlerleme çubuğu genişliği (`linear`) |
| `--kv-ease-out` | `cubic-bezier(.16,1,.3,1)` | Giriş/hover eğrisi |
| `--kv-ease-in-out` | `cubic-bezier(.65,0,.35,1)` | Ekran geçişi |

**Yüzey/derinlik kuralı (UI-136):** 3 düzlem (`--kv-bg` → `--kv-bg-elev-1` → `--kv-bg-elev-2`) + 1 perde. Durgun hâlde **gölge yok** (1px `--kv-hairline` yeter); gölge yalnız **yüzen** katmanda (`--kv-shadow-md`). Cam yalnız **2 yerde** (yapışkan şerit, modal arkası panel); üçüncü cam katmanı yasak. Kenarlık + gölge aynı elemanda birlikte kullanılmaz.

**Erişilebilirlik tabanı (UI-138):** gövde kontrastı ≥4.5:1, büyük metin/ikon/kenar ≥3:1, odak halkası iki zeminde de ≥3:1. Dokunma hedefi **≥44×44px** (kompakt modda masaüstü işaretçide ≥36px). Odak `:focus-visible` + `--kv-glow-accent`. Durum asla yalnız renkle verilmez (nokta **+** etiket). İlerleme `aria-live="polite"` ve **yüzde metni** ile duyurulur.

### 6.8 v3.0 ek tokenları (+12 — Tur 12: bağlantı katmanı)

Mevcut **83** ad (§6.1–6.7) **aynen korunur**; aşağıdaki **12** ad eklenir → toplam **95**. Kaynak tasarım belgesi `work/tasarim-v3.0-baglanti-katmani.md` §6 yalnız modül API'lerini listelediği için **adları ARC belirledi**; sayı (12) ve toplam (95) Lider'in dondurduğu değerdir. Kural: yeni değer de yalnız `tokens.css` içinde tanımlanır (UI-45/46); `tur12.css` ham renk yazmaz.

**Renk (+6)**

| Değişken | Rol | Koyu tema | Açık tema |
|---|---|---|---|
| `--kv-linked` | Bağlı/`connected` durumu (nokta + etiket) | `#3ddcb4` | `#0c8f72` |
| `--kv-linked-soft` | Bağlı durum zemin tonu | `rgba(61,220,180,.12)` | `rgba(12,143,114,.12)` |
| `--kv-unlinked` | Bağlı değil / `untested` | `#6e6e7a` | `#8a8a96` |
| `--kv-secret` | Sır alanı (parola girişi) vurgusu | `#f5b544` | `#9a6206` |
| `--kv-log-bg` | MCP günlük kuyruğu zemini | `#0f1317` | `#f4f7f9` |
| `--kv-log-line` | Günlük satır ayracı | `#1d242b` | `#e3eaef` |

**Tipografi (+2)**

| Değişken | Değer | Kullanım |
|---|---|---|
| `--kv-fs-code` | `0.8125rem` | JSON-RPC gövdesi, araç şeması, günlük satırı |
| `--kv-lh-code` | `1.45` | Kod/günlük satır yüksekliği |

**Geometri (+2)**

| Değişken | Değer | Kullanım |
|---|---|---|
| `--kv-card-min` | `220px` | Katalog kartı en küçük genişliği (ızgara `auto-fill`) |
| `--kv-log-h` | `240px` | Günlük kuyruğu sabit yüksekliği (kaydırılır) |

**Hareket (+2)**

| Değişken | Değer | Kullanım |
|---|---|---|
| `--kv-dur-flash` | `1400ms` | Yeni günlük satırının vurgu sönümü |
| `--kv-ease-line` | `cubic-bezier(.4,0,.2,1)` | Günlük satırı giriş eğrisi |

> **Not (UI-139):** `prefers-reduced-motion: reduce` durumunda `--kv-dur-flash` ve `--kv-dur-progress` **0ms**'e düşer (UI-48); günlük satırı yine eklenir, animasyonsuz.

### 6.9 v3.1 ek tokenları (+6 — Tur 13: katalog + OAuth + denetim)

Mevcut **95** ad (§6.1–6.8) **aynen korunur**; aşağıdaki **6** ad eklenir → toplam **101**. Adlar Lider tarafından donduruldu (T-134); **ad değiştirilemez, eklenemez**. Değerler yalnız `tokens.css` içinde tanımlanır (UI-45/46); `tur13.css` ham renk yazmaz. **Kontrast değerleri ölçülmüştür** (`work/t134-contrast.js`, WCAG 2.1 bağıl parlaklık; zemin `--kv-bg` = koyu `#121212` / açık `#f7f7f8`).

**Renk (+2)**

| Değişken | Rol | Koyu tema | Açık tema | Ölçülen kontrast |
|---|---|---|---|---|
| `--kv-conn-ok` | Bağlantı "kurulu/bağlı" göstergesi (nokta, çizgi, rozet zemini) | `#3ddcb4` | `#0a6f59` | koyu **10.79:1** · açık **5.72:1** (≥4.5 ✅) |
| `--kv-conn-warn` | "Yeniden bağlan" / `expired` / `degraded` göstergesi | `#f0b03c` | `#8f5a05` | koyu **9.80:1** · açık **5.40:1** (≥4.5 ✅) |

**Geometri (+3)**

| Değişken | Değer | Kullanım |
|---|---|---|
| `--kv-catalog-card-w` | `240px` | Katalog kartı hedef genişliği (`repeat(auto-fill, minmax(...))`) |
| `--kv-catalog-badge-w` | `76px` | Kategori/transport rozeti sabit genişliği (satırlar hizalanır) |
| `--kv-oauth-step` | `24px` | OAuth adım göstergesi kutusu (kenar + iç nokta) |

**Denetim (+1)**

| Değişken | Değer | Kullanım |
|---|---|---|
| `--kv-audit-row-h` | `32px` | `audit` satır yüksekliği (kompakt, `--kv-fs-code` ile uyumlu) |

> **Ölçülmüş kusur (T-133 → UI-147/UI-148):** bugün koyu temada `--kv-on-state: #ffffff`, rozet zemini `--kv-linked #3ddcb4` üzerinde **1.74:1**, `--kv-info #38bdf8` üzerinde **2.14:1**, `--kv-danger #ef4444` üzerinde **3.76:1** — **üçü de 4.5'in altında**. Açık temada `--kv-fg-subtle #8a8a96`, `--kv-bg #f7f7f8` üzerinde **3.19:1** — **4.5'in altında**. Bu değerler v3.1'de **düzeltilir** (yeni token **eklenmez**; `--kv-on-state` ton başına ezilir, `--kv-fg-subtle` koyulaşır: `#5c5c68` → `#f7f7f8` üzerinde **6.16:1**, beyaz üzerinde **6.59:1**). Kaynak: `work/t134-contrast.js`, `work/t134-contrast2.js`.

### 6.10 v3.2 ek tokenları (+6 — Tur 14: hazır bağlantı presetleri)

Mevcut **101** ad (§6.1–6.9) **aynen korunur**; aşağıdaki **6** ad eklenir → toplam **107**. Adlar Lider tarafından donduruldu (T-143); **ad değiştirilemez, eklenemez**. Değerler yalnız `tokens.css` içinde tanımlanır (UI-45/46); `tur14.css` ham renk yazmaz. **Kontrast değerleri ölçülmüştür** (`work/t143-contrast.js`, WCAG 2.1 bağıl parlaklık; zemin `--kv-bg` = koyu `#121212` / açık `#f7f7f8`).

**Renk (+2)**

| Değişken | Rol | Koyu tema | Açık tema | Ölçülen kontrast |
|---|---|---|---|---|
| `--kv-preset-ready` | Preset kartı "hazır/kurulu" göstergesi (nokta, rozet, kenarlık) | `#37d6a8` | `#0a7358` | koyu **10.12:1** · açık **5.44:1** (≥4.5 ✅) |
| `--kv-preset-missing` | "Alan eksik" / `needs-fields` göstergesi (rozet, uyarı metni) | `#eeb143` | `#8a5604` | koyu **9.82:1** · açık **5.75:1** (≥4.5 ✅) |

**Geometri (+4)**

| Değişken | Değer | Kullanım |
|---|---|---|
| `--kv-preset-card-w` | `280px` | Preset kartı hedef genişliği (`repeat(auto-fill, minmax(...))`) |
| `--kv-preset-logo` | `28px` | Kart logosu/kutu boyu (yerel ikon/emoji; uzak görsel yüklenmez) |
| `--kv-preset-field-w` | `200px` | Form alanı hedef genişliği (B4 tek ekran kurulum ızgarası) |
| `--kv-preset-step-gap` | `12px` | "Nasıl alınır" adım listesi dikey boşluğu (B3) |

---



## 7. Bileşen sınıf adları (DSN ↔ DEV ortak)

DSN bu sınıfları stiller, DEV bu yapıyla üretir. Sınıf adı **değiştirilemez**; yeni sınıf ARC onayı ister (UI-07).

| Bileşen | Zorunlu sınıf | Gerekli yapı |
|---|---|---|
| Uygulama kökü | `.kv-app` | `display:grid; grid-template: topbar / sidebar+main` |
| Yan gezinme | `.kv-nav`, `.kv-nav__item` | buton listesi |
| Üst şerit | `.kv-topbar` | rozet + zaman |
| Ana alan | `.kv-main` | tek ekran görünür |
| Izgara | `.kv-grid` | `3×3`, `--kv-grid-gap` |
| Panel | `.kv-panel`, `.kv-panel__header`, `.kv-panel__body` | mockup paneli |
| Kart | `.kv-card`, `.kv-card__title` | seans kartı |
| Rozet | `.kv-badge` | `data-tone="idle\|busy\|error\|offline\|success\|warning\|danger\|info"` |
| Düğme | `.kv-button`, `.kv-button--ghost`, `.kv-button--danger` | `disabled` desteği |
| Alan | `.kv-field`, `.kv-input` | etiket + kontrol |
| Tablo | `.kv-table` | `board` ve `models` |
| Mesaj | `.kv-message` | `data-kind` |
| Modal | `.kv-modal` | `role="dialog"` |
| Bildirim | `.kv-toast` | `[data-toast-root]` içinde |
| Metin yardımcıları | `.kv-muted` | ikincil metin |
| Satır | `.kv-row` | yatay grup |

**Rozet tonu kuralı:** `data-tone` değeri, `--kv-*` renk değişkenine eşlenir; `data-tone` yoksa `idle` sayılır.

---

## 8. Odak ve klavye

| Kısayol | Etki | Kapsam |
|---|---|---|
| `Ctrl+1` … `Ctrl+9` | `chat, team, command, board, memory, projects, models, providers, browser` ekranına geç (v2.5 kapsamı) | global |
| `Ctrl+K` | komut paletini açar (§12.8); paletten `command` seçilirse `[data-field="text"]`'e odaklanır | global |
| `Ctrl+Enter` | `command` ekranında onay diyaloğunu aç (gönderme değil) | `command` |
| `Enter` | Onay diyaloğunda onayla | modal |
| `Esc` | Onay diyaloğunu kapat / modal kapat | modal |
| `Tab` / `Shift+Tab` | Modal açıkken yalnız modal içinde döner | modal |

| # | Kural |
|---|---|
| UI-51 | Görünür odak: `outline: 2px solid var(--kv-focus-ring); outline-offset: 2px`. `outline:none` tek başına yasak. |
| UI-52 | Modal açıkken odak tuzağı zorunlu; kapanınca odak, modalı açan öğeye döner. |
| UI-53 | Kısayollar `input`/`textarea` içinde yazarken `Ctrl+1..9` hariç tetiklenmez. |
| UI-54 | Ekran değişiminde odak `main` başlığına taşınır ve `aria-live="polite"` ile ekran adı okunur. |
| UI-55 | Hiçbir işlem yalnız renkle anlatılmaz; rozetlerde metin zorunludur (renk körlüğü). |

---

## 9. Metin ve biçim kuralları

| # | Kural |
|---|---|
| UI-56 | Tarih/saat `Intl.DateTimeFormat("tr-TR")`; veri katmanında ISO-8601 UTC saklanır. |
| UI-57 | Sayılar `Intl.NumberFormat("tr-TR")` (binlik ayraç `.`). |
| UI-58 | Boş durum metinleri: `Seans yok`, `Mesaj yok`, `Pano bulunamadı`, `Kayıtlı parola yok`. |
| UI-59 | Hata metni **ne oldu + ne yapmalı** içerir (ör. `Parola geçersiz. Ayarlar'dan yeniden girin.`). |
| UI-60 | Model adı `sağlayıcı/model` biçiminde monospace gösterilir (`opencode/flint-40b-free`). |

---

## 10. DSN ↔ DEV dosya sınırı (bağlayıcı)

| Yol | Tek yazar | Diğer taraf |
|---|---|---|
| `src/renderer/styles/tokens.css` | **DSN** | DEV okur |
| `src/renderer/styles/theme-dark.css` | **DSN** | DEV okur |
| `src/renderer/styles/theme-light.css` | **DSN** | DEV okur |
| `src/renderer/styles/base.css` | **DSN** | DEV okur |
| `src/renderer/styles/shell.css` | **DSN** | DEV okur |
| `src/renderer/styles/screens.css` | **DSN** | DEV okur |
| `src/renderer/styles/components.css` | **DSN** | DEV okur |
| `src/renderer/styles/polish.css` | **DSN** | DEV okur |
| `src/renderer/styles/themes.css` | **DSN** | DEV okur — tema + yazı tipi/boyut/yarıçap seçimi (T4-8) |
| `src/renderer/styles/tur4.css` | **DSN** | DEV okur — sohbet/hafıza/proje/sağlayıcı/tarayıcı ekran stilleri |
| `src/renderer/styles/tur5.css` | **DSN** | DEV okur — profesyonel katman: tipografi, yükseklik (elevation), sohbet/tarayıcı/uzaktan ekranları (T5-5) |
| `src/renderer/styles/tur6.css` | **LDR** (T6, DSN teslimatı ölçümü tutmadığı için devralındı) | DEV okur — Tur 6: gezinme grupları, rehber, lider masası, komut, zihin haritası, özet, Votion, ayar ızgarası |
| `src/renderer/styles/tur8.css` | **LDR** (T8) | DEV okur — Tur 8: sağ panel, canlı tur, sağ tık menüsü, Votion eylem çubuğu, yerleşim tazelemesi |
| `src/renderer/styles/tur11.css` | **DSN** (T11) | DEV okur — Tur 11: 2040 kimliği (tipografi, cam yüzey, hairline), rol görünümü sadeleşmesi, `admin` ekranı blokları (B1–B8), yerel model kartı. **Yalnız `--kv-*` tüketir; ham renk yazmaz** (UI-46) |
| `src/renderer/styles/tur12.css` | **DSN** (T12) | DEV okur — Tur 12: `integrations` (katalog kartı, bağlantı formu, yetenek listesi) + `mcps` (sunucu listesi, araç listesi, günlük kuyruğu `--kv-log-*`). Yalnız `--kv-*` tüketir, ham renk yazmaz (UI-46) |
| `src/renderer/styles/tur13.css` | **DSN** (T13) | DEV okur — Tur 13: `catalog` (katalog ızgarası `--kv-catalog-*`, kategori rozeti, kurulum düğmesi) + `audit` (kompakt tablo `--kv-audit-row-h`, filtre çubuğu) + OAuth akış adımları (`--kv-oauth-step`) + bağlantı göstergeleri (`--kv-conn-ok/-warn`). Yalnız `--kv-*` tüketir, ham renk yazmaz (UI-46) |
| `src/renderer/styles/tur14.css` | **DSN** (T14) | DEV okur — Tur 14: `connect` (preset galerisi `--kv-preset-card-w`, `--kv-preset-logo`; seçili preset ayrıntısı + "nasıl alınır" adım listesi `--kv-preset-step-gap`; form ızgarası `--kv-preset-field-w`; hazır/eksik göstergeleri `--kv-preset-ready/-missing`). Yalnız `--kv-*` tüketir, ham renk yazmaz (UI-46) |
| `src/renderer/styles/volt.css` | **DSN** (T-199) | DEV okur — Alternatif tasarım dili **"Volt"**: yalnız `[data-design="volt"]` altında konuşur, klasik görünümü **etkilemez**; palet/tipografi/yerleşim `--kv-*` üzerinden yeniden tanımlanır, `.kv-app` grid'i ve `tur6.css` sabit gezinme genişliği nötrlenir. Geri dönüş tek öznitelik. |
| `src/renderer/styles/prototip.css` | **DSN** (T-201) | DEV okur — İkinci alternatif tasarım dili **"Prototip"**: yalnız `[data-design="prototip"]` altında konuşur; yüzen güverte/tuval/panel kabuğu, menekşe + deniz yeşili kimlik, `--proto-*` yüzey yardımcıları ve 6 tema paleti. **En son katman**; geri dönüş tek öznitelik. |
| `src/renderer/index.html` | **DEV** | DSN okur, **yazmaz** |
| `src/renderer/app.js` | **DEV** | DSN okur, **yazmaz** |
| `src/renderer/screens/**` | **DEV** | DSN okur, **yazmaz** — *planlanan; dizin henüz yok (2026-11-01: `Get-ChildItem src/renderer -Directory` → yalnız `styles`)* |
| `src/renderer/platform/**` | **DEV** | DSN okur, **yazmaz** — *planlanan; dizin henüz yok (aynı ölçüm)* |
| `work/console-mockup.html` | **DSN** | DEV referans alır |
| `docs/console-ui-contract.md` | **ARC** | herkes okur |

| # | Kural |
|---|---|
| UI-61 | DSN görsel değişiklik isterse `work/console-mockup.html`'i günceller ve YM'e "DEV uyarlasın" notu bırakır; `src/renderer/*.html` dosyasına dokunmaz. |
| UI-62 | DEV yeni bir sınıf/ad gerekiyorsa ARC'ye sözleşme talebi açar; kendi başına `components.css`'e ekleme yapmaz. |
| UI-63 | İki taraf da aynı dosyayı aynı gün değiştirmek zorunda kalırsa iş durur, ARC böler (K1 §5.4/6). |
| UI-64 | Her iki taraf da yazmadan önce dosyanın `LastWriteTime` + boyutunu rapora yazar (K1 §5.4/4). |
| UI-129 | **Votion 2.0 ses yüzeyi (v2.8, Tur 9):** panelde durum rozeti (`hazır / dinliyorum /
  düşünüyorum / konuşuyorum`), seviye göstergeli ses dalgası (`--level`, JS `style.setProperty`
  ile), mikrofon düğmesi (`aria-pressed`), durdur ve sesi kapat düğmeleri, konuşma dökümü
  (`.kv-votion__meta`), ekran görüntüsü önizlemesi (`.kv-votion__shot`) bulunur. Mikrofon
  düğmesi dinlerken kırmızıya döner (`.kv-votion__mic[data-state="listening"]`).
| UI-130 | **CSP (v2.8):** `media-src 'self' blob: data:` zorunludur — Votion TTS sesi
  base64 mp3 olarak `Audio` ile çalınır; `connect-src` yine `'none'` kalır (ağ yok).
| UI-123 | **Stylesheet sırası (S-1, v2.6; v3.3'te 18, v3.4'te 19 dosya):** Tek giriş noktası (toplu `@import` dosyası) **KALDIRILDI**. Sıra **bağlayıcıdır**: token → tema → taban → kabuk → ekran → bileşen → cila → tema genişletme → Tur 4 → Tur 5 → Tur 6 → Tur 8 → Tur 11 → Tur 12 → Tur 13 → Tur 14 → Volt tasarım paketi → Prototip tasarım paketi (en son katman). `src/renderer/index.html` bu 19 dosyayı **tam olarak bu sırayla** `<link>` eder: `tokens.css → theme-dark.css → theme-light.css → base.css → shell.css → screens.css → components.css → polish.css → themes.css → tur4.css → tur5.css → tur6.css → tur8.css → tur11.css → tur12.css → tur13.css → tur14.css → volt.css → prototip.css`. `tur14.css` `connect` (preset galerisi, form, adım listesi) stillerini taşır ve önceki katmanları bilinçli olarak inceltir. `volt.css` ve `prototip.css` yalnız kendi `[data-design]` kapsamlarında konuşan alternatif tasarım dilleridir; klasik görünümü etkilemezler. Yeni dosya eklemek **Mimar onayı** ister. |
| UI-124 | **Gezinme gruplandırması (v2.5):** yan menü düz liste değildir; `.kv-nav__group` + `.kv-nav__group-label` ile dört grup taşır: **Çalışma** (`chat`, `team`, `command`, `board`) · **Bilgi** (`memory`, `reports`, `projects`) · **Sistem** (`models`, `providers`, `browser`, `remote`, `settings`) · **Yardım** (`guide`). Her öğede emoji **yasak**; ikon satır içi `<svg>` (stroke, `aria-hidden="true"`) ile verilir. Kısayol rozeti `<kbd>` ile gösterilir. |
| UI-125 | **Zihin haritası (v2.5):** `.kv-mind` içinde SVG kenar katmanı `.kv-mind__canvas` ve düğüm düğmeleri `.kv-mind__node` bulunur. Düğüm konumu **inline `left/top` ile yazılmaz** (UI-06); `--x`/`--y` CSS değişkenleri yüzde olarak yazılır ve CSS `left: var(--x)` ile tüketir. Üzerine gelme/odak `.kv-mind__tip[data-open="true"]` açar; ipucu metni `--tx`/`--ty` ile konumlanır ve %0–100 aralığına kırpılır. Hafıza metni `textContent` ile yazılır (HTML sayılmaz). Boş grafikte düğüm çizilmez, tek `.kv-mind__tip` bilgi kartı görünür. |
| UI-126 | **Votion paneli (v2.5):** sağ altta `.kv-votion__fab` düğmesi (`aria-expanded`) paneli açar/kapatır. Panel `.kv-votion__panel`, günlük `.kv-votion__log` (satır `data-who="user\|votion"`) ve besteci `.kv-votion__composer` taşır. Ses motoru yoksa panel **yazma moduna düşer**, hata göstermez. |
| UI-127 | **Rehber ekranı (v2.5):** `[data-guide-progress]` ilerleme çubuğu (`aria-valuenow` adım numarası), `[data-guide-step]` başlık/gövde, `[data-action="guide-prev\|guide-next\|guide-speak\|guide-skip"]` denetimleri. "Atla" her zaman görünür ve tek tıkla `onboarded:true, skipped:true` yazar. |
| UI-128 | **Sağ panel (v2.6):** `.kv-rail` kabuğun **üçüncü sütunudur** (`grid-area: rail`), ekran değildir. Üç sekme: `lider` · `results` · `project` (`[data-rail-tab]`, `aria-selected`). Üç genişlik: `dar`/`normal`/`genis` (`[data-rail-width]`, `aria-pressed`). Açık/kapalı durumu ve genişlik `kv.prefs.v2` içinde kalıcıdır (`railOpen`, `railWidth`, `railTab`). Kapalıyken `display:none` — grid sütunu kendiliğinden çöker, ana alan genişler. |
| UI-129 | **Canlı tur (v2.6):** `.kv-tour` sabit katmandır; `.kv-tour__scrim` girişi engeller, `.kv-tour__spot` hedefin **ölçülen** dikdörtgenine oturur (`--tour-x/y/w/h`, satır içi `style=""` yazılmaz — `style.setProperty` kullanılır). Hedef görünmüyorsa kutu gizlenir ve adım `· bulunamadı` diye işaretlenir; uydurma konum yok. Adım hedefi ekran dışındaysa `scrollIntoView` + yeniden ölçüm yapılır. `Atla`/`ESC` turu kapatır. |
| UI-130 | **Sağ tık menüsü (v2.6):** `.kv-menu` yalnız **mevcut** aksiyonları çağırır (düğümdeki `data-action` düğmesine tıklama, `navOpen*` ile sekme açma, panoya kopyalama, Votion'a sorma). Yeni iş mantığı taşımaz; menü dışına tıklama ve `ESC` kapatır. Öğeler `role="menuitem"`, kapalı öğe `aria-disabled="true"`. |
| UI-131 | **Votion eylem çubuğu (v2.6):** `.kv-votion__actions` içinde beş düğme: `screen` · `summary` · `apps` · `files` · `tour` (`[data-votion-act]`). Yıkıcı eylemler (dosya taşıma/silme, tarayıcı otomasyonu) **onay ister** (API-51e); onay yoksa eylem çalışmaz. |

---

## 11. K2 denetim listesi (mekanik, tek komutla)
| # | Denetim | Beklenen |
|---|---|---|
| C1 | `Select-String -Path src/renderer/*.html,src/renderer/**/*.js -Pattern 'innerHTML|fetch\(|require\('` | 0 eşleşme |
| C2 | `Select-String -Path src/renderer/**/* -Pattern '#[0-9a-fA-F]{3,8}\b|rgb\('` (`styles/` hariç) | 0 eşleşme |
| C3 | `Select-String -Path src/renderer -Pattern 'data-state="(?!idle\|busy\|error\|offline)'` | 0 eşleşme |
| C4 | `Select-String -Path src/renderer -Pattern 'data-screen="'` | yalnız **20** kimlik: `team, command, board, models, reports, settings, chat, memory, projects, providers, browser, remote, guide, teams, plans, files, contexts, admin, integrations, mcps` |
| C5 | `Select-String -Path src/renderer/styles/tokens.css -Pattern '--kv-'` | §6'daki adların tamamı tanımlı |
| C6 | `Select-String -Path src/renderer -Pattern 'style="'` | 0 eşleşme (UI-06) |
| C7 | `Select-String -Path src/renderer -Pattern 'apiKey\|password\|Authorization'` | yalnız `settings` alan adı `data-field="password"` (değer yok) |
| C8 | Klavye turu (elle) | `Ctrl+1..6`, `Ctrl+K`, `Esc`, `Tab` tuzakları §8'e uyuyor |
| C9 | Tema değişimi (elle) | `data-theme` değişir, yeniden yükleme yok |
| C10 | `prefers-reduced-motion: reduce` (elle) | animasyon yok |

**K2 hükmü:** C1–C7 otomatik, C8–C10 elle. Bir madde kırılırsa iş `red`, gerekçe rapora yazılır.

---

## 12. Tur 2 ekranları ve kabuk (v2)

> **v2 kapsamı:** Bu bölüm §1–§11'in **üzerine** eklenir; çelişkide §12 v2 için geçerlidir, §1–§11 o çakışan maddede "v1" sayılır.

### 12.0 v1 → v2 değişiklik kaydı

| v1 maddesi | v2'de durumu |
|---|---|
| §2 ekran tablosu (v2 öncesi beş kimlik) | **6 ekran**: `reports` eklendi (§12.1) |
| UI-11 (`team` birleşik panosu) | geçerli; panel sayısı 6 → **7** (`reports` paneli eklendi) |
| UI-12/UI-13 (ekran geçişi) | geçerli; gezinme öğesi 6'ya çıkar |
| §8 kısayollar `Ctrl+1..5` | **`Ctrl+1..6`** (sıra: team, command, board, models, reports, settings) |
| UI-34 (model listesi salt-okunur) | **kaldırıldı** → `kv:models:assign` var, onay zorunlu (§12.5) |
| UI-30 (pano salt-okunur) | **kaldırıldı** → `kv:board:write` var, onay + yedek (§12.4) |
| §6.5 sabit `--kv-sidebar-w` | geçerli; yoğunluk modu bunu **ezmez**, `--kv-density-*` kullanılır (§12.9) |

**v2.1 değişiklik kaydı (T-022):**

| v2 maddesi | v2.1'de durumu |
|---|---|
| UI-18 (7 kart) + UI-21 (sabit sıra) | **kaldırıldı** → UI-111 (dinamik kadro 0..n) + UI-112 (sabit sıra yalnız varsayılan roster) |
| §4.1 kart alanları | `[data-field="cost"]` eklendi (E-1 → UI-113) |
| §4.2 `[data-field="target"]` | kanonik `[data-field="targets"]` (`string[]`), `target` yalnız ön seçim (C-2 → UI-114) |
| §4.3 pano | `[data-board-group]` 4 aşama kabı eklendi (E-2 → UI-115) |
| §4.4 model | `[data-provider-group]` + `[data-cost-summary]` eklendi (E-3/E-4 → UI-116/UI-117) |
| §4.5 dizin | tek kanonik `[data-field="project-dir"]`, readonly (C-3 → UI-118) |
| §12.2 kadro modalı | `[data-field="agent-code"]` + `aria-invalid` + `E_DUPLICATE_ROLE` (C-6 → UI-119) |
| §12.10 gömülü görünüm | `[data-embed-panel]` (team sağ panel) + `[data-embed-tokens]` (E-5 → UI-120/UI-121) |
| §8 `Ctrl+K` | v2'de palet açıcıdır; `command` ekranına gitmek için paletten `go-command` seçilir |
| UI-30 / UI-34 | **kaldırıldı** işaretlendi; yerine UI-81…UI-83 / UI-86…UI-87 |
| E-6 iskelet | UI-122 eklendi |

### 12.1 Ekran kimlikleri (6)

| Kimlik | Ad | Sekme sırası |
|---|---|---|
| `team` | Ekip | 1 |
| `command` | Komut Merkezi | 2 |
| `board` | Görev Panosu | 3 |
| `models` | Model Merkezi | 4 |
| `reports` | Rapor Merkezi | 5 |
| `settings` | Ayarlar | 6 |

| # | Kural |
|---|---|
| UI-65 | `data-screen` yalnız bu 6 değeri alır; `reports` dışındaki 5 değer v1 ile aynıdır. |
| UI-66 | `Ctrl+1..6` sırası §12.1 tablosudur; `Ctrl+7` atanmaz (rezerve). |

### 12.2 `team` — kart eylemleri ve kadro yönetimi

Kart, v1 §4.1'e ek olarak 4 eylem düğmesi taşır:

```html
<article class="kv-card" data-role-card="DEV" data-role="DEV" data-state="busy">
  <!-- v1 alanları -->
  <div class="kv-card__actions">
    <button class="kv-button kv-button--ghost" data-action="card-command" data-target-session="ses_…">Komut</button>
    <button class="kv-button kv-button--ghost" data-action="card-stop" data-target-session="ses_…">Durdur</button>
    <button class="kv-button kv-button--ghost" data-action="card-model" data-target-session="ses_…">Model</button>
    <button class="kv-button kv-button--ghost" data-action="card-reports" data-target-session="ses_…">Raporlar</button>
  </div>
</article>
<section data-unassigned>
  <h2>Kadro dışı seanslar</h2>
  <article data-role-card="UNASSIGNED" data-role="UNASSIGNED" data-in-roster="false">…</article>
</section>

<aside class="kv-embed-panel" data-embed-panel>
  <header class="kv-embed-panel__head">
    <span data-field="embed-role">DEV</span>
    <span data-embed-tokens>—</span>
  </header>
  <section data-embed data-embed-session="ses_…" data-stream="off"></section>
</aside>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-action="card-command"]` | Komut ekranına hedef seçili geçer | UI-67 |
| `[data-action="card-stop"]` | Durdurma onayı açar | UI-68 |
| `[data-action="card-model"]` | Model atama modalı açar | UI-69 |
| `[data-action="card-reports"]` | Rapor ekranını o seansla filtreler | UI-70 |
| `[data-unassigned]` | Kadro dışı seans bölümü | UI-71 |
| `[data-in-roster="false"]` | Kadro dışı kart işareti | UI-71 |
| `[data-embed-panel]` + `[data-embed]` + `[data-embed-tokens]` | Sağ panel gömülü görünüm (E-5) | UI-120, UI-121 |

| # | Kural |
|---|---|
| UI-67 | `card-command` doğrudan göndermez; `command` ekranına geçer ve `[data-field="targets"]` ilgili seansla (tek eleman) doldurulur. |
| UI-68 | `card-stop` `[data-confirm-dialog]` açar; onay metni `"<ROL> durdurulsun mu?"`. |
| UI-69 | `card-model` `[data-model-assign-dialog]` açar; model seçilip onaylanmadan `kv:models:assign` çağrılmaz. |
| UI-70 | `card-reports` `reports` ekranına geçer ve `[data-filter="session"]` alanını o seans ID'siyle doldurur. |
| UI-71 | Kadro dışı seanslar `[data-unassigned]` içinde gösterilir ve `data-in-roster="false"` taşır; kadro kartlarıyla karışmaz. |

**Kadro yönetimi modalı** (`[data-modal-root]` içinde):

```html
<div class="kv-modal" data-team-dialog role="dialog" aria-modal="true">
  <h2>Kadro Yönetimi</h2>
  <div class="kv-row">
    <button class="kv-button" data-action="team-add">Ajan ekle</button>
    <button class="kv-button kv-button--danger" data-action="team-remove">Ajan çıkar</button>
    <button class="kv-button" data-action="set-leader">Lider değiştir</button>
  </div>
  <form data-team-add-form novalidate>
    <label class="kv-field">Rol kodu <input class="kv-input" data-field="agent-code" list="kv-role-codes" maxlength="5" required></label>
    <label class="kv-field">Ajan <select class="kv-input" data-field="new-agent"></select></label>
    <label class="kv-field">Model <select class="kv-input" data-field="new-model"></select></label>
    <label class="kv-field">Başlık <input class="kv-input" data-field="new-title" maxlength="60"></label>
    <p class="kv-error" data-field="agent-code-error" hidden>Bu rol kodu zaten kullanımda. DEV2 gibi yeni bir kod seçin.</p>
  </form>
</div>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-team-dialog]` | Kadro yönetimi modalı | UI-72 |
| `[data-action="team-add"\|"team-remove"\|"set-leader"]` | Üç yönetim eylemi | UI-72, UI-74 |
| `[data-team-add-form]` + `[data-field="agent-code"\|"new-agent"\|"new-model"\|"new-title"]` | Yeni ajan formu | UI-73, UI-119 |
| `[data-field="agent-code-error"]` | Rol kodu hata metni | UI-119 |

| # | Kural |
|---|---|
| UI-72 | Üç eylem de **önce** onay diyaloğu açar; onaysız `kv:team:*` çağrısı yapılmaz (API-41). |
| UI-73 | `team-add` formunda `agent-code` değeri `^[A-Z]{2,5}[0-9]?$` desenine uyar; varsayılan 7 kod (`LDR/YM/ARC/DEV/DSN/QA/OPS`) ve ARC onaylı ek kodlar (`DEV2` gibi) kabul edilir, başka kod reddedilir (API-95). |
| UI-74 | `set-leader` onay metni **eski ve yeni LDR seans ID'sini** birlikte gösterir; onay sonrası `backupPath` toast'ta gösterilir. |
| UI-75 | `team-remove` metni `"silinmez, arşivlenir"` ifadesini içerir (API-60). |
| UI-119 | **Rol kodu tekilliği (C-6):** `agent-code` roster'da veya `kv:team:list` sonucunda zaten varsa alan `aria-invalid="true"` + `--kv-danger` kenarlık alır, `[data-field="agent-code-error"]` görünür olur ve form **hiçbir IPC çağrısı yapmadan** gönderilmez. |
| UI-120 | **Gömülü görünüm yeri (E-5):** `[data-embed-panel]` yalnız `team` ekranında ve yalnız ≥1200px genişlikte sağ yan panel olarak görünür; dar ekranda aynı içerik modal olarak açılır ve içinde seçili seansın `[data-embed]` akışı bulunur. |
| UI-121 | `[data-embed-tokens]` seçili seansın `giriş / çıkış` token değerini gösterir; veri yoksa `—` yazılır ve sayaç yalnız `session.usage.updated` veya E03 yanıtıyla güncellenir. |

### 12.3 `command` — çoklu hedef, şablon, hızlı çubuk

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-field="targets"]` | Çoklu hedef seçimi (checkbox listesi) | UI-76 |
| `[data-template-list]` + `[data-template="durum"\|"rapor"\|"devam"]` | Slash şablonları | UI-77 |
| `[data-quick-command]` | Her ekranda görünen hızlı komut çubuğu | UI-78 |
| `[data-message][data-kind]` | v1 §4.2'deki mesaj bloğu (rol rengi) | UI-79 |
| `[data-field="delivery"]` | `steer` \| `queue` seçimi | UI-80 |

| # | Kural |
|---|---|
| UI-76 | Birden fazla hedef seçilirse gönderim `kv:command:sendMany` ile yapılır ve onay özeti `N seans · model listesi` biçiminde gösterilir. |
| UI-77 | Şablon seçimi metin alanına ön metin yazar (`/durum` → `"Durum raporu ver: …"`), göndermez. |
| UI-78 | `[data-quick-command]` yalnız `command` ekranına geçip odağı metin alanına taşır; hiçbir koşulda göndermez. |
| UI-79 | Mesaj balonu `data-kind` değerine göre rol rengi alır (`user` → `--kv-accent`, `assistant` → `--kv-bg-elev-2`, `tool` → `--kv-info`, `system` → `--kv-fg-subtle`). |
| UI-80 | `delivery="queue"` seçiliyse onay metni `"sıraya alınacak"` sözcüğünü içerir. |

### 12.4 `board` — yazma (v2)

```html
<tr data-board-row data-id="T-011" data-status="devam" data-expected-hash="a1b2…">
  <td><button class="kv-button kv-button--ghost" data-action="board-edit" data-id="T-011">Düzenle</button></td>
</tr>
<button class="kv-button" data-action="board-add">Yeni satır</button>
<aside data-board-detail><h3 data-field="detail-title"></h3></aside>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-action="board-edit"]` | Durum/sahip/kanıt düzenleme modalı | UI-81 |
| `[data-action="board-add"]` | Yeni görev satırı modalı | UI-82 |
| `[data-board-row][data-expected-hash]` | İyimser kilitleme hash'i | UI-83 |
| `[data-board-detail]` | Satır detay yan paneli | UI-84 |

| # | Kural |
|---|---|
| UI-81 | Düzenleme onay diyaloğu ister ve `expectedHash` gönderir; `E_CONFLICT` gelirse "pano değişti" uyarısı verilip veri yenilenir, yazma tekrarlanmaz. |
| UI-82 | Yeni satır `data-id` alanı `T-\d{3}` desenine uymazsa form gönderilmez (yerel doğrulama). |
| UI-83 | Her `[data-board-row]` kendi `data-expected-hash` değerini taşır; toplu yazma yoktur (tek satır = tek yazma). |
| UI-84 | Detay paneli salt-okunur gösterir; düzenleme yalnız `board-edit` modalından yapılır. |
| UI-85 | Yazma sonrası toast `Yedek: <backupPath>` metnini içerir (API-86). |

### 12.5 `models` — atama (v2)

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-model-table]` | v1 §4.4 tablosu (genişletilmiş sütunlar: bağlam, maliyet) | UI-86 |
| `[data-provider-group]` | Sağlayıcı grubu kabı (E-3) | UI-117 |
| `[data-cost-summary]` | Token/maliyet özeti (E-4) | UI-116 |
| `[data-model-assign-dialog]` | Seans model atama modalı | UI-87 |
| `[data-field="assign-session"]` / `[data-field="assign-model"]` | Atama alanları | UI-87 |
| `[data-guide-table]` | `models.md` görev tipi → model kılavuzu | UI-88 |
| `[data-pool-warning]` | Havuz dışı uyarı bandı | UI-89 |

| # | Kural |
|---|---|
| UI-86 | Model tablosu salt-okunur kalır; değişiklik **yalnız** atama modalından yapılır ve satıra tıklamak model değiştirmez. |
| UI-87 | Atama modalı seans + model seçimini ve onay özetini `"<ROL> · <eski> → <yeni>"` biçiminde gösterir. |
| UI-88 | `[data-guide-table]` yalnız `models.md`'den okunan kılavuzu gösterir, düzenlenemez. |
| UI-89 | Havuz dışı model seçildiğinde `[data-pool-warning]` görünür olur ama seçim engellenmez (API-69). |

### 12.6 `reports` — Rapor Merkezi (yeni ekran)

```html
<section data-screen="reports">
  <div class="kv-filters" data-report-filters>
    <select class="kv-input" data-filter="role"></select>
    <input class="kv-input" data-filter="taskID" placeholder="T-000">
    <select class="kv-input" data-filter="status"></select>
    <input class="kv-input" data-filter="session" type="hidden">
    <input class="kv-input" data-filter="from" type="date">
    <input class="kv-input" data-filter="to" type="date">
  </div>
  <ul data-report-list>
    <li data-report data-task="T-008" data-role="ARC" data-status="TAMAM" data-source="message">
      <button data-action="report-open" data-task="T-008" data-role="ARC">RAPOR T-008 · ARC</button>
    </li>
  </ul>
  <article data-report-detail>
    <h2 data-field="report-title"></h2>
    <dl>
      <dt>Durum</dt><dd data-field="report-status"></dd>
      <dt>Özet</dt><dd data-field="report-summary"></dd>
      <dt>Kanıt</dt><dd data-field="report-evidence"></dd>
      <dt>Değişen dosyalar</dt><dd data-field="report-files"></dd>
      <dt>Risk</dt><dd data-field="report-risk"></dd>
    </dl>
  </article>
  <p data-report-empty hidden>Rapor yok.</p>
</section>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-report-filters]` + `[data-filter="role"\|"taskID"\|"status"\|"session"\|"from"\|"to"]` | Filtreler | UI-90 |
| `[data-report-list]` + `[data-report]` | Rapor listesi | UI-91 |
| `[data-report][data-task]` / `[data-role]` / `[data-status]` / `[data-source]` | Liste öğesi işaretleri | UI-91 |
| `[data-action="report-open"]` | Detayı açar | UI-92 |
| `[data-report-detail]` + `[data-field="report-*"]` | Biçimli detay | UI-93 |
| `[data-report-empty]` | Boş durum | UI-94 |

| # | Kural |
|---|---|
| UI-90 | Filtreler **istemci tarafında** uygulanır (sunucuya filtre gitmez, API-89); `[data-filter="session"]` gizli alandır ve kart eyleminden doldurulur. |
| UI-91 | `data-status` yalnız `TAMAM\|KISMİ\|BLOKE` (veya boş) alır; `data-source` yalnız `message\|file`. |
| UI-92 | Rapor seçimi yeni sayfa/pencere açmaz; detay aynı ekranda `[data-report-detail]` içinde açılır. |
| UI-93 | Detay alanları boşsa `—` gösterilir; ham metin `textContent` ile yazılır (UI-05). |
| UI-94 | Filtre sonucu boşsa `[data-report-empty]` görünür olur, liste gizlenir. |

### 12.7 `settings` — roster ve genişletilmiş alanlar

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-roster-table]` + `[data-roster-row][data-role]` | roster görünümü | UI-95 |
| `[data-action="roster-edit"]` | Roster düzenleme modalı (onaylı yazma) | UI-95 |
| `[data-field="locale"]` / `[data-field="density"]` | Dil ve yoğunluk | UI-96 |
| `[data-field="notifications"]` | Bildirim tercihleri (checkbox grubu) | UI-96 |
| `[data-field="autostart"]` | Otomatik başlatma | UI-97 |
| `[data-discovery]` | Sunucu keşfi sonucu | UI-98 |

| # | Kural |
|---|---|
| UI-95 | Roster düzenlemesi `kv:roster:write` çağırır, `confirmToken` ve `reason` ister; yazma sonrası `backupPath` gösterilir. |
| UI-96 | `density` ve `notifications` yalnız yerel ayardır (API-92); değişiklik anında uygulanır, onay istemez. |
| UI-97 | `autostart` yalnız `config.json`'a yazılır ve işletim sistemi kaydı **Tur 3**'tedir; MVP'de düğme pasif ve `yakında` etiketlidir. |
| UI-98 | Sunucu keşfi sonucu `[data-discovery]` içinde bulunan adres + port olarak listelenir, parola asla gösterilmez. |

### 12.8 Kabuk bileşenleri (yeni)

**Komut paleti:**
```html
<div class="kv-palette" data-palette role="dialog" aria-modal="true">
  <input class="kv-input" data-field="palette-query" autocomplete="off">
  <ul data-palette-results>
    <li><button data-palette-item data-action="palette-run" data-command="go-team">Ekibe git</button></li>
  </ul>
</div>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-palette]` | Komut paleti (Ctrl+K) | UI-99 |
| `[data-field="palette-query"]` | Arama alanı | UI-100 |
| `[data-palette-results]`, `[data-palette-item]`, `[data-command]` | Sonuç listesi | UI-100 |
| `[data-command]` değerleri | `go-team,go-command,go-board,go-models,go-reports,go-settings,send,interrupt,add-agent,assign-model,open-reports` | UI-101 |

| # | Kural |
|---|---|
| UI-99 | Palet `Ctrl+K` ile açılır, `Esc` ile kapanır, odağı tuzağa alır (UI-52) ve açıkken arka plan etkileşimi engellenir. |
| UI-100 | Arama yazdıkça sonuçlar istemci tarafında süzülür; en fazla 8 sonuç gösterilir, `↑/↓` + `Enter` ile seçilir. |
| UI-101 | `data-command` yalnız §12.8 listesindeki değerleri alır; `send` ve `interrupt` paletten çalıştırılırsa **onay diyaloğu** açılır, doğrudan göndermez. |

**Bildirim merkezi ve durum çubuğu:**
```html
<button class="kv-bell" data-action="toggle-notifications" aria-expanded="false">
  <span data-notification-count>0</span>
</button>
<div class="kv-notifications" data-notifications hidden>
  <article data-notification data-tone="info" data-at="…">…</article>
</div>
<footer class="kv-statusbar" data-statusbar>
  <span data-connection data-state="connected"></span>
  <span data-field="session-count">7 seans</span>
  <span data-last-sync>—</span>
  <span data-field="app-version">v0.2.0</span>
</footer>
```

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-action="toggle-notifications"]` + `[data-notification-count]` | Zil ve sayaç | UI-102 |
| `[data-notifications]` + `[data-notification][data-tone]` | Bildirim listesi | UI-103 |
| `[data-statusbar]` + `[data-field="session-count"\|"app-version"]` | Alt durum çubuğu | UI-104 |

| # | Kural |
|---|---|
| UI-102 | Sayaç 0 iken gizlenir; 1–99 arası sayı, 100 ve üzeri `99+` gösterilir. |
| UI-103 | Bildirim `data-tone` değeri `info\|success\|warning\|error` olur; en fazla 50 bildirim tutulur, en eskisi düşer. |
| UI-104 | Durum çubuğu her ekranda görünür ve `data-connection` rozetini üst şeritten **bağımsız** ikinci kez taşımaz; tek kaynak üst şerittir, çubukta yalnız metin durumu yazılır. |

### 12.9 Yoğunluk modu

| Kanca / değer | Anlam |
|---|---|
| `[data-density="comfortable"\|"compact"]` | `<html>` üzerinde yoğunluk |
| `--kv-density-gap` | `16px` (comfortable) / `8px` (compact) |
| `--kv-density-pad` | `12px` / `8px` |
| `--kv-density-row` | `44px` / `34px` |

| # | Kural |
|---|---|
| UI-105 | `[data-density]` yalnız `<html>` üzerinde bulunur; değeri `comfortable\|compact`. |
| UI-106 | Yoğunluk yalnız 3 değişkeni değiştirir (`--kv-density-*`); diğer `--kv-*` değerleri sabittir. |
| UI-107 | Yoğunluk değişimi yeniden yükleme gerektirmez ve `config.json`'a yazılır (API-92). |

### 12.10 Gömülü görünüm (F7)

| Kanca | Anlam | Kural |
|---|---|---|
| `[data-embed]` + `[data-embed-session]` | Gömülü konuşma paneli | UI-108 |
| `[data-embed][data-stream="on"\|"off"]` | Canlı akış durumu | UI-109 |
| `[data-embed-tool]` | Araç çağrısı satırı | UI-110 |
| `[data-embed-panel]` | Sağ yan panel kabı (E-5) | UI-120 |
| `[data-embed-tokens]` | Seçili seans token sayacı (E-5) | UI-121 |

| # | Kural |
|---|---|
| UI-108 | Gömülü görünüm `webview`/`iframe` **kullanmaz**; veri `kv:command:messages` + `kv:event:*` ile gelir (sandbox kuralı). |
| UI-109 | `data-stream="on"` yalnız panel açıkken; kapandığında abonelik delta olaylarını işlemeyi bırakır (API-75). |
| UI-110 | Araç satırı yalnız araç adı + durum rozeti gösterir; araç çıktısı ham gösterilmez (API-70). |

### 12.11 Tur 2 K2 denetim ekleri

| # | Denetim | Beklenen |
|---|---|---|
| D1 | `Select-String -Path src/renderer -Pattern 'data-screen="'` | 6 kimlik (§12.1) |
| D2 | `Select-String -Path src/renderer -Pattern 'data-action="team-|set-leader|board-edit|board-add|report-open|roster-edit|assign'` | her eylem onay diyaloğundan geçer |
| D3 | `Select-String -Path src/renderer -Pattern 'webview|iframe|embed src'` | 0 eşleşme |
| D4 | `Select-String -Path src/renderer/styles -Pattern '--kv-density-'` | 3 değişken tanımlı |
| D5 | `Select-String -Path src/renderer -Pattern 'data-density'` | yalnız `<html>` üzerinde set edilir |
| D6 | Palet (`Ctrl+K`) elle | 8 sonuç sınırı, `↑/↓`, `Esc`, odak tuzağı |
| D7 | Rapor ekranı gerçek veriyle elle | en az 1 rapor, filtreler istemci tarafında çalışır |
| D8 | Yoğunluk değişimi elle | yeniden yükleme yok, 3 değişken değişir |
| D9 | `Select-String -Path src/renderer -Pattern 'data-role-card'` | kart sayısı roster satırı sayısına eşit; sabit `7` yok (UI-111) |
| D10 | `Select-String -Path src/renderer -Pattern 'agent-code'` | `aria-invalid` + `[data-field="agent-code-error"]` var (UI-119) |
| D11 | `Select-String -Path src/renderer -Pattern 'data-board-group'` | 4 değer: `planlandi,devam,inceleme,bitti` (UI-115) |
| D12 | `Select-String -Path src/renderer -Pattern 'data-embed-panel\|data-embed-tokens\|data-cost-summary\|data-provider-group\|data-field="cost"'` | beş kancanın tümü var (E-1…E-5) |
| D13 | `Select-String -Path src/shared/ipc-channels.js -Pattern 'kv:team:list'` | `{sessions, unassigned}` biçimi (API-98) |

### 12.12 v2.1 küçük notlar (E-6/E-8/E-9)

| # | Kural |
|---|---|
| UI-122 | **İskelet (E-6):** ilk veri gelene kadar `[data-skeleton]` gösterilir; değeri `card\|table\|list` olur ve veri (veya hata) geldiğinde kaldırılır — iskelet 10 sn'den uzun sürerse `[data-board-error]`/`[data-connection-result]` değil, genel `Yavaş bağlantı` metni gösterilir. |
| — | **E-8 (autostart):** hâlâ **AÇIK**; kural değil. Sürüm planındaki autostart maddelerinde tanımlıdır (Startup `.lnk`, varsayılan kapalı, kaldırma yolu yazılı). MVP'de UI-97'deki pasif `yakında` etiketi geçerlidir. |
| — | **E-9 (tema animasyonu):** mevcut `--kv-dur-normal` + `--kv-ease` değişkenleri yeterlidir; ayrı kural **açılmadı**, `prefers-reduced-motion` durumunda geçiş kapalıdır (UI-48). |

---

## 14. `admin` — Yönetim Merkezi (v2.9, Tur 11)

Tek yeni ekran. Ekran kimliği `admin`; varsayılan olarak **yalnız** `data-role="admin"` görünümünde erişilebilir (UI-133).

### 14.1 Yerleşim

`.kv-admin` kökü **3 sütunlu** ızgaradır (`grid-template-columns: minmax(320px,1fr) minmax(360px,1.2fr) minmax(300px,1fr)`; `gap: var(--kv-grid-gap)`).

| Genişlik | Davranış |
|---|---|
| **≥1400px** | 3 sütun: **sol** = B1 · **orta** = B2 + B4 · **sağ** = B3 + B5 + B6 · alt tam genişlik = B7 + B8 |
| **1024–1399px** | 2 sütun: sol = B1 + B4 · sağ = B2 + B3 + B5 · alt = B6 + B7 + B8 |
| **768–1023px** | 2 sütun daraltılmış; B2 ve B6 tam genişlik (tablo/akış taşmasın) |
| **<768px** | tek sütun; blok sırası B1→B2→B4→B3→B5→B6→B7→B8 (telefonda öncelik: durum → model) |

Kurallar: satır içi `style=""` **yok** (UI-06); bloklar `.kv-panel` + `data-admin-block="b1"` … `data-admin-block="b8"` taşır (her blok tam olarak bir kez); her blok başlığı `--kv-fs-xl`, gövde `--kv-fs-md`, meta `--kv-fs-micro`; sayısal değerler `font-variant-numeric: tabular-nums` (UI-137).

### 14.2 Bloklar — veri kaynağı, kontroller, kancalar

| Blok | Ad | Veri kaynağı (kanal) | Kontroller | `data-field` / `data-action` |
|---|---|---|---|---|
| **B1** | Ekip ve ajan durumu | `kv:team:list`, `kv:teams:list`; canlı: push `kv:event:patch` (`session.*`) | Ajan ekle/çıkar, lider değiştir, model ata, görev gönder (hepsi `confirmToken`) | `data-admin-block="b1"`, `[data-admin-agents]`, `[data-field="admin-agent-count"]`, `data-action="admin-team-add\|admin-team-remove\|admin-set-leader\|admin-assign-model\|admin-send"` |
| **B2** | Yerel model durumları | `kv:models:list` + push `kv:event:model` | Kur, iptal, doğrula, kaldır, hedef klasör seç | `data-admin-block="b2"`, `[data-admin-models]`, `[data-field="admin-model-total\|admin-model-ready\|admin-model-active"]`, `data-action="admin-model-install\|admin-model-cancel\|admin-model-verify\|admin-model-remove\|admin-model-dir"`, `data-model-job="…"` |
| **B3** | Kanal ve sağlayıcı sağlığı | `kv:app:info` (`contract`), `kv:provider:list`, `kv:server:status`; push `kv:event:connection` | Sağlayıcı testi, failover, sunucu başlat/durdur | `data-admin-block="b3"`, `[data-admin-health]`, `[data-field="admin-channel-count\|admin-write-count\|admin-api-version\|admin-server-state"]`, `data-action="admin-provider-test\|admin-provider-failover\|admin-server-start\|admin-server-stop"` |
| **B4** | Disk ve kurulum | `kv:models:list` (`disk`, `roots[]`) | Hedef kök seç; boş alan uyarısı | `data-admin-block="b4"`, `[data-admin-disk]`, `[data-field="admin-disk-free\|admin-disk-total\|admin-disk-bar"]`, `data-action="admin-disk-pick"` |
| **B5** | Oturum ve sürüm | `kv:app:info`, `kv:settings:get` | Yenile (salt okuma sayaçlar) | `data-admin-block="b5"`, `[data-admin-about]`, `[data-field="admin-app-version\|admin-schema-version\|admin-contract-version\|admin-screen-count\|admin-style-count"]`, `data-action="admin-refresh"` |
| **B6** | Denetim (audit) **özeti** | `kv:audit:list` (`limit:20`) | Yalnız **son 20** kayıt + "Denetim ekranını aç" (tam görünüm `audit`, §15.6); filtre/dışa aktarma burada **yok** | `data-admin-block="b6"`, `[data-admin-audit-summary]`, `[data-field="admin-audit-count"]`, `data-action="open-screen" data-target="audit"` |
| **B7** | Tehlikeli eylemler | Mevcut yazma kanalları + `kv:models:remove` | Üç kademe: geri alınabilir (iptal) · geri alınamaz (model kaldır) · dış etkili (sunucu durdur). Her biri onay modalı + `confirmToken` | `data-admin-block="b7"`, `[data-admin-danger]`, `data-action="admin-danger-cancel\|admin-danger-remove\|admin-danger-stop"` |
| **B8** | Yedek/snapshot durumu | `kv:files:list` → `work/backups/**` (salt okuma) | Yalnız okuma; "son yedek yaşı" rozeti (>24 sa → `warning`) | `data-admin-block="b8"`, `[data-admin-backups]`, `[data-field="admin-backup-last\|admin-backup-age"]`, `data-action="admin-backup-refresh"` |

### 14.3 Blok ayrıntı kuralları

- **B1:** satır: kod, rol, model, durum (`idle|busy|offline|error`), token, son olay zamanı. Kadro bugün **7 ajan**; sayfalama yok, kompakt satır 32px. Boş kadro → eylemli boş durum ("Ajan ekle").
- **B2:** model kartı durum sözlüğü **`absent | queued | downloading | verifying | ready | failed | paused`** (API §7.5). Kart: ad, boyut, hedef yol, `[data-admin-progress]` (`role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`), **kalan süre** `[data-field="admin-eta"]`, hız, hash rozeti. `etaSec:null` → "hesaplanıyor" yazar, **uydurma süre gösterilmez**. İlerleme metni yüzde olarak da yazılır (UI-138).
- **B3:** kanal sayacı **canlı**: `contract.channels` ile `CHANNELS` uzunluğu uyuşmazsa `data-tone="error"` "sözleşme sapması" rozeti. Sayılar sözleşmeden/`kv:app:info`'dan gelir; **sabit yazılmaz**.
- **B4:** disk çubuğu boş/toplam; indirme öncesi gereksinim `sizeBytes × 1.2` (geçici `.part` + son dosya). Yetersiz → `E_DISK_FULL` ve "hedef değiştir" eylemi.
- **B5:** sürüm satırı: uygulama sürümü, API sözleşme sürümü, **ölçülmüş** kanal/yazma/ekran/stylesheet sayıları. Hiçbiri elle yazılmaz.
- **B6:** yalnız **özet** (son 20 kayıt) + "Denetim ekranını aç" düğmesi (`data-target="audit"`). Tam liste, filtreler (`op`/`code`/`since`) ve `limit ≤ 500` **`audit` ekranındadır** (§15.6, UI-145). Denetim kaydı yalnız üst veridir (`at, op, code, target, status, idempotencyKey`); emir/rapor metni ve sır **zaten yazılmıyor** (API-30).
- **B7:** onay metni **ne kaybedileceğini** yazar (dosya yolu + boyut). Onay yoksa istek **gitmez** (`E_CONFIRM_REQUIRED`).
- **B8:** yedek **almaz**, yalnız okur (yedek OPS işi); 24 saatten eski yedek `warning` rozeti.

### 14.4 `admin` K2 denetim ekleri

| # | Denetim | Beklenen |
|---|---|---|
| C11 | `data-screen="admin"` var mı | **1** bölüm; `data-role="teacher\|student"` altında `hidden` + `aria-hidden="true"` |
| C12 | `data-admin-block` sayısı | **8** (`b1`…`b8`), her biri bir `data-field` kümesi taşır |
| C13 | Rol matrisi | `admin` **23** · `teacher` **13** · `student` **6** görünür `data-screen` (`settings` her rolde); `integrations`/`mcps`/`catalog`/`audit`/`connect` yalnız `admin`; gizli ekranın `data-action` düğmesi DOM'da **yok** |
| C14 | İlerleme erişilebilirliği | `role="progressbar"` + `aria-valuenow` + yüzde metni; `etaSec:null` iken "hesaplanıyor" |
| C15 | Token sayısı | `tokens.css` içinde **107** `--kv-*` tanımı; `tur11.css`, `tur12.css`, `tur13.css` ve `tur14.css` içinde ham renk **0** (UI-46) |

---

## 15. Bağlantı katmanı yüzeyleri — `integrations` + `mcps` (v3.0, Tur 12)

İki yeni ekran. İkisi de **yalnız `data-role="admin"`** görünümünde açıktır (UI-133); `teacher`
ve `student` için `hidden` + `aria-hidden="true"` ve `data-action` düğmeleri DOM'da **yoktur**.
API tarafı: `docs/console-api-contract.md` §7.6.

### 15.1 `integrations` — Entegrasyonlar

Yerleşim: iki sütun (`minmax(280px,1fr) minmax(380px,1.3fr)`); **≥1400px**'de sol B1+B2, sağ
B3+B4, alt tam genişlik B5; **<1024px** tek sütun (B1→B2→B3→B4→B5). Kök `.kv-integrations`.

| Blok | Ad | Veri kaynağı (kanal) | Kontroller | `data-field` / `data-action` |
|---|---|---|---|---|
| **B1** | Katalog | `kv:integration:list` (`catalog[]`) | Kategori sekmeleri (`[data-integration-category]`, `aria-selected`) + kart ızgarası | `data-integrations-block="b1"`, `[data-integration-catalog]`, `[data-field="integration-catalog-count"]`, `data-action="integration-pick"` (`data-provider-id`) |
| **B2** | Hesap listesi | `kv:integration:list` (`accounts[]`) + push `kv:event:integration` | Hesap seç / kaldır (onay) | `data-integrations-block="b2"`, `[data-integration-accounts]`, `[data-field="integration-account-state"]`, `data-action="integration-select\|integration-remove"` (`data-account-id`) |
| **B3** | Bağlantı formu | `kv:integration:save`, `kv:integration:test`; kapsam etiketleri katalogdan | Kaydet (onay) + test | `data-integrations-block="b3"`, `[data-integration-form]`, `[data-field="integration-label\|integration-token\|integration-scopes"]`, `data-action="integration-save\|integration-test"` |
| **B4** | Yetenek listesi | `kv:integration:capabilities`, `kv:integration:invoke`; push `kv:event:integration` | Yetenek çalıştır (dış etkili → onay diyaloğu) | `data-integrations-block="b4"`, `[data-integration-capabilities]`, `[data-field="integration-capability-summary"]`, `data-action="integration-invoke"` (`data-capability`) |
| **B5** | Etkinlik akışı | push `kv:event:integration` (`state`/`log`) | Yalnız okuma; temizle | `data-integrations-block="b5"`, `[data-integration-activity]` (`aria-live="polite"`), `data-action="integration-activity-clear"` |

### 15.2 `mcps` — MCP Sunucuları

Yerleşim: **≥1400px** üç sütun: sol B1+B2, orta B3, sağ B4; alt tam genişlik B5.
**<1024px** tek sütun (B1→B2→B3→B4→B5). Kök `.kv-mcps`.

| Blok | Ad | Veri kaynağı (kanal) | Kontroller | `data-field` / `data-action` |
|---|---|---|---|---|
| **B1** | Sunucu listesi | `kv:mcp:list` + push `kv:event:mcp` (`state`) | Seç / bağlan / kaldır (onay) | `data-mcp-block="b1"`, `[data-mcp-servers]`, `[data-field="mcp-server-state\|mcp-server-transport"]`, `data-action="mcp-select\|mcp-connect\|mcp-remove"` (`data-server-id`) |
| **B2** | Ekleme formu | `kv:mcp:add` | Transport seçimi (`stdio` → komut+argüman, `http` → URL), kaydet (onay) | `data-mcp-block="b2"`, `[data-mcp-form]`, `[data-field="mcp-id\|mcp-name\|mcp-transport\|mcp-command\|mcp-args\|mcp-url"]`, `data-action="mcp-add"` |
| **B3** | Araç listesi | `kv:mcp:tools`, `kv:mcp:connect` + push `kv:event:mcp` (`tools`) | Araç seç | `data-mcp-block="b3"`, `[data-mcp-tools]`, `[data-field="mcp-tool-name\|mcp-tool-description\|mcp-tool-schema"]`, `data-action="mcp-tool-pick"` (`data-tool`) |
| **B4** | Araç çağırma | `kv:mcp:call` | JSON argüman alanı (`--kv-font-mono`) + çalıştır (onay) + sonuç | `data-mcp-block="b4"`, `[data-mcp-call]`, `[data-field="mcp-call-args\|mcp-call-result"]`, `data-action="mcp-call"` |
| **B5** | Günlük kuyruğu | push `kv:event:mcp` (`log`), `state` | Yalnız okuma; 200 satır halka tampon; temizle | `data-mcp-block="b5"`, `[data-mcp-log]` (`aria-live="polite"`, `--kv-log-bg`/`--kv-log-line`, yükseklik `--kv-log-h`), `[data-field="mcp-log-count"]`, `data-action="mcp-log-clear"` |

### 15.3 Kural kimlikleri

| # | Kural |
|---|---|
| UI-140 | **Katalog kartı zorunlu alanları (v3.0):** her `[data-integration-catalog]` kartı `data-provider-id`, ad, kategori rozeti, `[data-field="integration-auth-kind"]` (auth türü), bağlantı durumu noktası **+** etiket (`untested\|connected\|degraded\|error`) taşır. Kart yalnız katalogdan gelir; renderer katalog **yazamaz**. Durum **asla yalnız renkle** verilmez (UI-138). Sağlayıcı sayısı **sabit yazılmaz**, `catalog.length` ile gösterilir. |
| UI-141 | **MCP araç listesi + günlük kuyruğu (v3.0):** `[data-mcp-tools]` her araç için `name` + açıklama + **şema özeti** (tam `inputSchema` katlanır) gösterir; şema **`textContent`** ile yazılır (HTML sayılmaz). `[data-mcp-log]` **200 satırlık halka tampondur** (en eski düşer), `aria-live="polite"`, satır ekleme `--kv-dur-flash` ile vurgulanır (`reduce` → 0ms, UI-139). Günlük **dışa aktarılmaz** ve kalıcı yazılmaz. |
| UI-142 | **Sır alanları (v3.0, ihlal = ret):** token/anahtar/parola girdileri **yalnız** `type="password"` (`autocomplete="off"`, `spellcheck="false"`); değer **hiçbir yerde** `textContent`/`innerHTML` ile gösterilmez, `data-field` düğümüne yazılmaz, log/push yüküne konmaz. "Göster" düğmesi **yoktur**. Kaydettikten sonra alan boşaltılır; maskeli önizleme de gösterilmez (API-30). Sır asla `localStorage`/`sessionStorage`'a yazılmaz. |
| UI-143 | **Katalog kartı zorunlu alanları (v3.1):** her `[data-catalog-item]` kartı **şunları** taşır: (1) `data-catalog-id` (tekil), (2) `data-catalog-kind="integration\|mcp"`, (3) görünen ad, (4) `vendor`, (5) kategori rozeti (`data-catalog-category`), (6) tür/transport etiketi (`bearer\|apiKey\|basic\|oauth2\|none` ya da `stdio\|http`), (7) durum **noktası + metin** (`[data-conn-state]`, §15.7 — **asla yalnız renk**, UI-138), (8) bağlama/doküman bağlantısı (harici tarayıcı). Kart sayısı **sabit yazılmaz**; `data-catalog-count` **görünen** sonucu, `aria-live="polite"` ile duyurur. Kurulu kartta `data-catalog-installed="true"` ve "Kurulu" etiketi bulunur. |
| UI-144 | **OAuth durum rozeti ve eylemleri (v3.1):** OAuth hesaplarında rozet `data-conn-state ∈ connected\|expired\|revoked\|pending\|error` değerini **metinle** yazar (`Bağlı · Süresi doldu · Bağlantı kesildi · Onay bekleniyor · Hata`) ve rengi `--kv-conn-ok` (bağlı) / `--kv-conn-warn` (süresi doldu, onay bekleniyor) / `--kv-danger` (hata) üzerinden alır. **`expired`** durumunda "Yeniden bağlan" (`data-action="oauth-reconnect"` → `kv:oauth:start` **aynı `accountId`** ile, `confirmToken`), **`connected`** durumunda "Bağlantıyı kes" (`data-action="oauth-revoke"` → `kv:oauth:revoke`, onay modalı) gösterilir. İki düğme **aynı anda** görünmez. Akış `pending` iken 2 sn'de bir `kv:oauth:status` yoklanır ve adım göstergesi (`--kv-oauth-step`) ilerler; akış iptal edilirse gösterge sıfırlanır. |
| UI-145 | **Denetim ekranı (v3.1):** `audit` ekranı `kv:audit:list` kullanır. Filtreler: `op` (metin, `[data-audit-filter-op]`), `code` (`[data-audit-filter-code]`), `since` (tarih, `[data-audit-filter-since]`), `limit` (seçim: 50/100/200/500 — **500 üstü yok**, `E_BAD_REQUEST`). Satır yüksekliği `--kv-audit-row-h`. **Yalnız üst veri** gösterilir (`at, op, code, target, status, idempotencyKey`); sır, gövde, argüman ve URL **gösterilmez** (zaten yazılmıyor). Dışa aktarma, kopyalama, silme **yoktur**. `truncated:true` ise `[data-audit-truncated]` görünür uyarı verir ("daha eski kayıtlar var — aralığı daralt"). Boş sonuç → eylemli boş durum ("Filtreyi temizle"). |
| UI-146 | **Katalog araması (v3.1):** arama en az **2 karakterde** çalışır (1 karakterde sonuç değişmez, "en az 2 karakter" ipucu görünür); 250 ms debounce; arama `ad + vendor + toolsHint` içinde **harf duyarsız** (Türkçe `i/İ` katlaması ile) yapılır. Sonuç **her zaman sayaçla** verilir: `[data-catalog-count]` "**N** sonuç" (N görünen kart sayısı; `aria-live="polite"`). Sonuç yoksa **boş durum metni** zorunludur: "«\<q\>» için sonuç yok — kategoriyi temizle veya farklı bir terim dene" ve "Filtreleri temizle" düğmesi (`data-action="catalog-reset"`). Sayaç sıfırken ızgara **boş** bırakılır (iskelet kart gösterilmez). |

### 15.4 `§15` K2 denetim ekleri

| # | Denetim | Beklenen |
|---|---|---|
| C16 | `data-screen="integrations"` / `"mcps"` | her biri **1** bölüm; `teacher\|student` altında gizli (UI-133) |
| C17 | Blok sayısı | `data-integrations-block` **5** (`b1`…`b5`) · `data-mcp-block` **5** (`b1`…`b5`) |
| C18 | Sır sızıntısı | `tokenCipher\|fieldsCipher` renderer'da **0**; tüm sır girdileri `type="password"` (UI-142) |
| **C19** | **(v3.1) Yeni ekranlar** | `data-screen="catalog"` **1**, `data-screen="audit"` **1**; ikisi de `teacher\|student` altında `hidden` + `aria-hidden="true"` ve `data-action` düğmeleri DOM'da **yok** (UI-133) |
| **C20** | **(v3.1) Blok sayısı** | `data-catalog-block` **5** (`b1`…`b5`) · `data-audit-block` **4** (`b1`…`b4`), her biri tam **1** kez |
| **C21** | **(v3.1) Kanca adları** | §15.7 tablosundaki **her** `data-*` kancası renderer'da **≥1** kez; adlar **birebir** (yeniden adlandırma = ret) |
| **C22** | **(v3.1) Katalog/denetimde sır** | `catalog` ve `audit` içinde `tokenCipher\|fieldsCipher\|access_token\|refresh_token\|clientSecret` **0**; `data-catalog-*` alanlarına hiçbir sır değeri yazılmaz (UI-142/API-30) |
| **C23** | **(v3.1) OAuth rozeti** | `[data-conn-state]` her değer için **metin** taşır (yalnız renk yok); "Yeniden bağlan" ve "Bağlantıyı kes" **aynı anda görünmez** (UI-144) |
| **C24** | **(v3.1) Kontrast** | `--kv-on-state` ton başına ezilir ve **her** rozet zemininde ≥**4.5:1**; `--kv-fg-subtle` **iki** temada da zeminine göre ≥**4.5:1**; ölçüm betiği `work/t134-contrast*.js` (UI-147/UI-148) |

---

### 15.5 `catalog` — Bağlantı Kataloğu (v3.1, Tur 13)

Tek ızgarada **iki** kaynak: **64** entegrasyon (`integration-catalog.json`) ve **60** MCP şablonu
(`mcp-catalog.json`). Kök `.kv-catalog`. Yalnız `data-role="admin"` (UI-133). API: §7.10
(`mcp-catalog:*`), §7.2 (`integration:*`, `oauth:*`).

Yerleşim: **≥1400px** sol B1+B2 (`minmax(260px,.8fr) minmax(420px,1.4fr)`), sağ B3+B4, alt tam
genişlik B5 · **1024–1399px** 2 sütun (sol B1+B3, sağ B2+B4, alt B5) · **<1024px** tek sütun
B1→B2→B3→B4→B5.

| Blok | Ad | Veri kaynağı (kanal) | Kontroller | `data-field` / `data-action` |
|---|---|---|---|---|
| **B1** | Arama ve filtre | `kv:mcp-catalog:list`, `kv:integration:list` (yerel süzgeç) | Arama (≥2 karakter), tür segmenti (hepsi/entegrasyon/MCP), kategori seçimi, "Kurulu" anahtarı | `data-catalog-block="b1"`, `[data-catalog-search]`, `[data-catalog-kind]`, `[data-catalog-category]`, `[data-field="catalog-installed-only"]`, `data-action="catalog-reset"` |
| **B2** | Sonuç ızgarası | aynı iki kanal | Kart seç; sayaç; boş durum | `data-catalog-block="b2"`, `[data-catalog-grid]`, `[data-catalog-item]` (`data-catalog-id`, `data-catalog-kind`), `[data-catalog-count]` (`aria-live="polite"`), `[data-catalog-empty]` |
| **B3** | Ayrıntı | seçili kartın kanal verisi | Salt okuma: vendor, kategori, tür/transport, `toolsHint`, `envKeys`, `docs` | `data-catalog-block="b3"`, `[data-catalog-detail]`, `[data-field="catalog-detail-vendor\|catalog-detail-kind\|catalog-detail-hint\|catalog-detail-env\|catalog-detail-docs"]` |
| **B4** | Kurulum | `kv:mcp-catalog:install` · `kv:integration:save` · `kv:oauth:start` | Tek tuşla kur (onay modalı + `confirmToken`); MCP'de `id` + `env`; OAuth2'de "Google/GitHub ile bağlan" | `data-catalog-block="b4"`, `[data-catalog-install-panel]`, `[data-field="catalog-install-id\|catalog-install-env"]`, `data-action="catalog-install\|catalog-oauth\|catalog-open"` |
| **B5** | Kurulum akışı | yerel olaylar + `kv:oauth:status` (akış sürerken 2 sn) | Yalnız okuma; adım göstergesi (`--kv-oauth-step`); temizle | `data-catalog-block="b5"`, `[data-catalog-flow]` (`aria-live="polite"`), `[data-field="catalog-flow-step"]`, `data-action="catalog-flow-clear"` |

**Kurulum davranışı (bağlayıcı):** kart türüne göre **tek** yol vardır —
(1) **MCP şablonu** → B4'te `id`+`env` → `kv:mcp-catalog:install` → kart `Kurulu` olur, **bağlanmaz**
(süreç yalnız `mcps` ekranındaki `kv:mcp:connect` ile başlar);
(2) **`oauth2` entegrasyonu** → `kv:oauth:start` → harici tarayıcı → callback → kart `Bağlı`;
bağlantı formuna **token yazılmaz** (API §7.6.4);
(3) **token/apiKey entegrasyonu** → `catalog-open` ile `integrations` ekranı B3'e **sağlayıcı seçili**
geçilir (sır yalnız orada, `type="password"`).
Üç yolda da **onay modalı** ve `confirmToken` zorunludur; onay yoksa istek gitmez (`E_CONFIRM_REQUIRED`).

### 15.6 `audit` — Denetim (v3.1, Tur 13)

`admin` B6'da gömülü olan denetim akışının **tam görünümü**; B6 artık yalnız özet + buraya bağlantı
(§14.2). Kök `.kv-audit`. Yalnız `data-role="admin"`. API: `kv:audit:list` (§7.2).

Yerleşim: tek sütun; B1 üstte yapışkan filtre çubuğu, B2 tablo (dikey kaydırılır), B3 sağ/salt
ayrıntı (≥1024px yanda, altında katlanır), B4 durum satırı.

| Blok | Ad | Veri kaynağı (kanal) | Kontroller | `data-field` / `data-action` |
|---|---|---|---|---|
| **B1** | Filtre çubuğu | yerel (sorgu parametreleri) | `op` metin, `code` metin, `since` tarih, `limit` (50/100/200/500), Yenile, Temizle | `data-audit-block="b1"`, `[data-audit-filter-op]`, `[data-audit-filter-code]`, `[data-audit-filter-since]`, `[data-audit-limit]`, `data-action="audit-refresh\|audit-reset"` |
| **B2** | Kayıt tablosu | `kv:audit:list` | Satır seç; satır yüksekliği `--kv-audit-row-h` | `data-audit-block="b2"`, `[data-audit-list]`, `[data-audit-row]` (`data-audit-id`), `data-action="audit-row-pick"` |
| **B3** | Satır ayrıntısı | seçili satır (aynı yanıt) | Salt okuma: `at, op, code, target, status, idempotencyKey` | `data-audit-block="b3"`, `[data-audit-detail]`, `[data-field="audit-detail-op\|audit-detail-code\|audit-detail-target\|audit-detail-status\|audit-detail-idem"]` |
| **B4** | Sayaç ve durum | aynı yanıt (`total`, `truncated`) | Yenile (salt okuma) | `data-audit-block="b4"`, `[data-audit-count]` (`aria-live="polite"`), `[data-audit-truncated]`, `data-action="audit-refresh"` |

**Sınırlar:** `limit ≤ 500` (**sabit**, kullanıcı serbest sayı giremez — API §7.2); dışa aktarma,
kopyalama, silme, düzenleme **yok**; sır/gövde/argüman/URL **gösterilmez** (zaten yazılmıyor, API-30).

### 15.7 `catalog` + `audit` — `data-*` kanca tablosu (adlar **kesin**)

DEV bu adları **birebir** uygular; yeniden adlandırma, birleştirme veya `id`'ye çevirme **ret**
sebebidir (API-46 ruhu: kanca adı = sözleşme).

| Kanca | Ekran / blok | Tip | Zorunlu nitelik / not |
|---|---|---|---|
| `data-catalog-block` | `catalog` | nitelik | `b1`…`b5`, her biri tam **1** kez |
| `data-catalog-search` | `catalog` B1 | `<input type="search">` | `aria-label` zorunlu; ≥2 karakter (UI-146) |
| `data-catalog-kind` | `catalog` B1 | segment | `aria-pressed`; değerler `all\|integration\|mcp` |
| `data-catalog-category` | `catalog` B1 | `<select>` | Kategori listesi kanaldan; kart rozeti **aynı** değeri taşır |
| `data-catalog-grid` | `catalog` B2 | kapsayıcı | `role="list"` |
| `data-catalog-item` | `catalog` B2 | kart | `role="listitem"`, `data-catalog-id`, `data-catalog-kind`, `data-catalog-installed` |
| `data-catalog-count` | `catalog` B2 | metin | `aria-live="polite"`; "N sonuç" (UI-146) |
| `data-catalog-empty` | `catalog` B2 | kapsayıcı | Yalnız sonuç 0 iken görünür; boş durum metni + `catalog-reset` |
| `data-catalog-detail` | `catalog` B3 | kapsayıcı | Seçili kart yoksa gizli |
| `data-catalog-install-panel` | `catalog` B4 | kapsayıcı | Türüne göre alan kümesi değişir |
| `data-catalog-install` | `catalog` B4 | düğme | `data-action="catalog-install"`; onay modalı + `confirmToken` |
| `data-catalog-flow` | `catalog` B5 | kapsayıcı | `aria-live="polite"`; adımlar `--kv-oauth-step` |
| `data-conn-state` | `catalog` + `integrations` | nitelik | `connected\|expired\|revoked\|pending\|error\|untested`; **metin** eşlik eder (UI-144/C23) |
| `data-oauth-reconnect` | `catalog` + `integrations` | düğme | `data-action="oauth-reconnect"`; `expired` dışında **yok** |
| `data-oauth-revoke` | `catalog` + `integrations` | düğme | `data-action="oauth-revoke"`; onay modalı; `connected` dışında **yok** |
| `data-audit-block` | `audit` | nitelik | `b1`…`b4`, her biri tam **1** kez |
| `data-audit-filter-op` | `audit` B1 | `<input type="search">` | `aria-label` zorunlu |
| `data-audit-filter-code` | `audit` B1 | `<input type="search">` | `aria-label` zorunlu |
| `data-audit-filter-since` | `audit` B1 | `<input type="date">` | `aria-label` zorunlu |
| `data-audit-limit` | `audit` B1 | `<select>` | Yalnız `50\|100\|200\|500` |
| `data-audit-list` | `audit` B2 | tablo kapsayıcısı | `.kv-table`; `--kv-audit-row-h` |
| `data-audit-row` | `audit` B2 | satır | `data-audit-id`; klavyeyle seçilebilir (`tabindex="0"` + Enter) |
| `data-audit-detail` | `audit` B3 | kapsayıcı | Yalnız üst veri (UI-145) |
| `data-audit-count` | `audit` B4 | metin | `aria-live="polite"`; `total` değeri |
| `data-audit-truncated` | `audit` B4 | uyarı | Yalnız `truncated:true` iken görünür |

### 15.8 Erişilebilirlik kuralları — T-133 bulguları (v3.1)

T-133 ölçümü üç **kanıtlı** kusur buldu; aşağıdaki maddeler bunları **bağlayıcı** kurala çevirir.
Ölçüm betiği: `work/t134-contrast.js` + `work/t134-contrast2.js` (WCAG 2.1 bağıl parlaklık).

| # | Kural |
|---|---|
| UI-147 | **Rozet metni kendi zeminine boyanamaz (v3.1):** `data-tone`/`data-conn-state` rozetinde metin **`--kv-on-state`** ile boyanır; **her ton için** `--kv-on-state` o tonun zeminine göre **ezilir** (ör. koyu temada `success` zemini `#3ddcb4` → mürekkep `#06231c` = **9.56:1**; `warning` zemini `#f0b03c` → `#3a1003` = **8.75:1**). **Kontrast ≥ 4.5:1 zorunludur.** Bugünkü tek değer (`#ffffff`) üç zeminde **başarısız** (1.74 / 2.14 / 3.76) → v3.1'de düzeltilir. Metin **her zaman** vardır; renk tek başına anlam taşımaz (UI-138). |
| UI-148 | **`--kv-fg-subtle` hiçbir zeminde < 4.5 olmaz (v3.1):** üçüncül/bayat metin **her** kullanıldığı zeminde (`--kv-bg`, `--kv-bg-elev-1`, `--kv-bg-elev-2`) ≥**4.5:1** olur. Bugünkü açık tema değeri (`#8a8a96`) `--kv-bg` üzerinde **3.19:1** — **ihlal**; v3.1'de `#5c5c68` (**6.16:1** / beyazda **6.59:1**). Zemin değişirse **yeniden ölçülür**; muafiyet yoktur. |
| UI-149 | **Etkileşim hedefleri ≥ 36px (v3.1):** her tıklanabilir öğe en az **36×36 px** (kompakt masaüstü tabanı, UI-138 ile aynı); **tek istisna** onay kutusu (`type="checkbox"`) → **20 px** ve `<label>` ile genişletilmiş tıklama alanı. Katalog kartı "kur" düğmesi, denetim satırı, filtre segmentleri bu kurala tabidir. İhlal K2'de **ret**. |
| UI-150 | **Erişilebilir ad (v3.1):** placeholder **ad yerine geçmez**; placeholder'sız **her** alanın erişilebilir adı olur (`<label for>` veya `aria-label`/`

### 15.9 `connect` — Hazır Bağlantılar (v3.2, Tur 14)

**Amaç:** kullanıcı 124 hazır preset'i (64 entegrasyon + 60 MCP) tek ekranda görsün, katalog/şema
öğrenmeden bağlansın. Kaynak veri `kv:preset:list` (API §7.11), kurulum `kv:preset:apply`.
Ekran `admin` görünümündedir (UI-133: `teacher`/`student` gizli). Beş blok:

| Blok | İçerik |
|---|---|
| **B1** | Arama kutusu (`[data-preset-search]`, ≥2 karakter), tür segmenti (`[data-preset-kind]`: `tümü\|entegrasyon\|mcp`), kategori seçici (`[data-preset-category]`), sonuç sayacı (`[data-preset-count]`, `aria-live="polite"`) |
| **B2** | Preset galerisi (`[data-preset-grid]`, `role="list"`): 124 kart (`[data-preset-item]`, `role="listitem"`, `data-preset-id`, `data-preset-kind`, `data-preset-ready`). Her kart ad + vendor + kategori + `authMode` rozeti + hazır/kurulu durumu **metinle** taşır (UI-151) |
| **B3** | Seçili preset ayrıntısı (`[data-preset-detail]`): `summary`, `docsUrl` (harici), ve **her zaman görünür** adım numaralı "nasıl alınır" listesi (`[data-preset-howto]`, UI-153) |
| **B4** | Alan formu (`[data-preset-form]`): `fields[]` → `[data-preset-field]` (`data-preset-field-key`, `data-preset-field-hint`). `secret:true` → `type="password"` + "göster" + `autocomplete="off"` (UI-152). "Bağlan" (`[data-preset-connect]`, `data-action="preset-connect"`) + "Test et" (`[data-preset-test]`). `authMode="install"` (MCP) ise yalnız kurulum düğmesi. **Votion anahtarı:** `admin` iken "Votion bu bağlantıyı kullanabilir" (`data-role="admin"`, UI-155) |
| **B5** | Sonuç/akış (`[data-preset-result]`, `aria-live="polite"`): durum, `missing[]` alan hataları, OAuth ilerleme adımları; boş durum `[data-preset-empty]` |

**`data-*` kanca tablosu (adlar kesin)**

| Kanca | Blok | Rol / kural |
|---|---|---|
| `data-preset-block="b1..b5"` | tümü | Blok kapsayıcısı; 5 blok zorunlu |
| `data-preset-search` | B1 | `<input type="search">`; ≥2 karakterde süzer (UI-157) |
| `data-preset-kind` | B1 | Segment düğmeleri; `aria-pressed` |
| `data-preset-category` | B1 | `<select>`; kategori listesi `kv:preset:list` `categories[]`'ten |
| `data-preset-grid` | B2 | `role="list"`; kart ızgarası |
| `data-preset-item` | B2 | `role="listitem"`; `data-preset-id`, `data-preset-kind`, `data-preset-ready` (UI-154) |
| `data-preset-count` | B1 | Sayaç metni; `aria-live="polite"` |
| `data-preset-detail` | B3 | Seçili preset ayrıntı kapsayıcısı |
| `data-preset-howto` | B3 | Adım listesi; her adım numaralı, her zaman görünür |
| `data-preset-form` | B4 | Alan formu (`<form>` yerine `div`; Enter bağlanmaz, UI-156) |
| `data-preset-field` | B4 | Alan sarmalı; `data-preset-field-key` = preset field `key` |
| `data-preset-field-hint` | B4 | `hint`/`howToGet` ipucu metni; alan altında hata metni de burada |
| `data-preset-connect` | B4 | Birincil düğme; `data-action="preset-connect"` |
| `data-preset-test` | B4 | "Test et"; `testCapability` yoksa gizli |
| `data-preset-result` | B5 | Sonuç metni; `aria-live="polite"` |
| `data-preset-empty` | B5 | Yalnız sonuç yokken/arama boşken görünür |

**Kurallar (bağlayıcı)**

| # | Kural |
|---|---|
| UI-151 | **Kart zorunlu alanları:** her `[data-preset-item]` **ad, vendor, kategori, `authMode` rozeti ve hazır/kurulu durumu** taşır. Durum yalnız renkle değil **metinle** de yazılır (`Hazır`, `Alan eksik`, `Kurulu`, `Bağlı`, `Hata`). Kart tıklanınca B3+B4 dolar; klavyeyle `Enter`/`Space` seçer (`tabindex="0"`). |
| UI-152 | **Sır alanları:** `secret:true` her alan `type="password"` + yanında "göster/gizle" düğmesi (`aria-pressed`) + `autocomplete="off"` taşır. Değer `console`/log/DOM özniteliğine yazılmaz; form gönderiminde yalnız `kv:preset:apply`'a geçer, yanıttan **dönmez** (API-30). |
| UI-153 | **"Nasıl alınır" her zaman görünür:** `[data-preset-howto]` adım numaralı (`1) … 2) …`) ve katlanmaz; `howToGet` metni + `url` tıklanabilir (harici tarayıcı). Alan `hint`'i ile karışmaz. |
| UI-154 | **`data-preset-ready` değerleri:** `ready\|needs-fields\|installed\|connected\|error`. Her değer **metinle** de gösterilir (renk tek başına anlam taşımaz); `needs-fields` → `--kv-preset-missing`, `ready`/`connected` → `--kv-preset-ready`. |
| UI-155 | **Votion araç anahtarı:** B4'te "Votion bu bağlantıyı kullanabilir" onay kutusu yalnız `data-role="admin"` iken görünür; işaretliyse Votion manifestine (`kv:votion:tools`) girer. `teacher`/`student` görünümünde kontrol **DOM'da yoktur** (§7.12.4). |
| UI-156 | **Form doğrulama:** zorunlu alan boşsa `kv:preset:apply` **gönderilmez**; alan altında hata metni + sunucudan dönen `E_PRESET_MISSING_FIELDS` `missing[]` ile eşlenir. Hata **ne oldu + ne yapmalı** içerir (UI-59). |
| UI-157 | **Arama:** ≥2 karakterde süzer; <2 karakterde tüm liste döner. Sonuç **sayaçla** (`[data-preset-count]`) bildirilir, `aria-live="polite"`. Eşleşme yoksa `[data-preset-empty]` görünür. |
| UI-158 | **Odak/dokunma:** her alan ve düğme **≥36 px** (UI-149), odak halkası görünür, metin/zemin kontrastı **≥4.5** (§6.10 ölçülmüş değerler). Kart ve alan sırası klavye `Tab` ile doğal akışta ilerler. |
aria-labelledby`). `data-catalog-search`, `data-audit-filter-op`, `data-audit-filter-code`, `data-audit-filter-since`, `data-audit-limit` **ad zorunlu** alanlardır. Sadece placeholder taşıyan alan K2'de **ret** (C25). |

---

| Konu | Mockup (`work/console-mockup.html`) | Bu sözleşme | Çözüm |
|---|---|---|---|
| Ekran yapısı | 3×3 ızgarada 6 panel, gezinme yok | **13 ekran** (§2; v2.5) | `team` = mockup ızgarası (ana ekran); diğerleri tek modül tam görünüm. Mockup **korunur**, gezinme gruplanmış olarak eklenir (UI-11, UI-124). |
| Değişken adları | `--bg-color`, `--primary-color` … | `--kv-*` | `--kv-*` geçerli; mockup adları kullanılmaz (UI-46). |
| Dil | `lang="en"`, İngilizce başlık | Türkçe | `lang="tr"` (UI-03). |
| Durum rozetleri | `status-active/pending/inactive` | `data-tone` + §5 sözlüğü | `data-tone` geçerli. |
| Boş panel | 6. panel "Boş Panel" | 6 panel: Ekip, Komut, Pano, Model, Ayarlar, **Durum** | 6. panel `[data-panel="status"]`: bağlantı + son eşitleme + sürüm. |

*Son - ARC · UI sözleşmesi v2.2.1 · T-043.*
