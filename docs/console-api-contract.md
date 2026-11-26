# Keyvotion Console — API Sözleşmesi (T-012)

| Alan | Değer |
|---|---|
| Görev | EMİR T-012 / T-012b / T-016 · T-011 öncesi ve sırasında bağlayıcı API sözleşmesi |
| Sahip | **ARC** (tek yazar). DEV/QA bu dosyayı **yalnız okur**. |
| Sürüm | `3.3` · 2026-11-25 · dondurulmuş (v1: T-012 · v2: T-016 Tur 2 · v2.1: T-022 · v2.2: T-037 S-2 + Tur 2 kapanışı · v2.2.1: T-043 S-3/O6/API-94 · v2.2.2: T-055 API-51 9 yazma kanalı · v2.4: Tur 5 kanalları · v2.5: Tur 6 — 68 kanal / 29 yazma · v2.8: Tur 9 — 78 kanal / 32 yazma · v2.9: Tur 11 — 86 kanal / 35 yazma; yıkıcı değişiklik YOK · v3.0: Tur 12 — 100 kanal / 39 yazma; yıkıcı değişiklik YOK · **v3.1: Tur 13 — 105 kanal / 42 yazma; 30 domain; yıkıcı değişiklik YOK** · **v3.2: Tur 14 — 109 kanal / 44 yazma, 124 bağlantı şablonu; yıkıcı değişiklik YOK** · **v3.3: T-205 — 111 kanal / 45 yazma; yıkıcı değişiklik YOK**) |
| Üst belge | `docs/architecture.md` |
| Hedef sunucu | OpenCode HTTP API **2.2.0** (`/api/info` ile doğrulanır) |
| Bağlayıcılık | `src/main/opencode/*`, `src/preload/*`, `src/shared/ipc-channels.js` bu sözleşmeye uyar. |

Her kural `API-xx` kimliklidir; K2/QA'da tek tek denetlenir (§12).

**Emir maddesi → bölüm eşlemesi:** (1) uç noktalar §3 · (2) DTO beyaz listesi §4 · (3) hata haritası §5 · (4) SSE + uzlaştırma §6 · (5) IPC kanalları §7 · (6) kimlik doğrulama §2 · **Tur 2: uç noktalar §8, IPC kanalları §9.**

---

## 0.9 Sürüm notu (v3.2 → v3.3 · T-205: Otomatik Ekip Kurucu)

Kullanıcı emri (en üst yetki, 2026-11-25): *"otomatik ekip oluşturma özelliği ekle; istediği şeyi anlatsın ilk olarak lidere, lider de projeye uygun ekip ve çalışanlar oluştursun, modelleri de kendisi çalışma alanlarına göre seçsin."* **Yıkıcı değişiklik yok**: yalnız iki kanal eklenir. `kv:team:plan` **yazma yapmaz** (model çağrısı; `confirmToken` istemez), `kv:team:apply` **kadroya ekler** (`confirmToken` zorunlu; **silmez** — `replace` yalnız ileriye dönük kabul edilir). Sayılar: kanal **111** (**106 invoke + 5 push**) · yazma **45** · domain **31** (yeni domain yok) · ekran **23** · stylesheet **19** · token **117** tekil ad / **785** tanım.

## 0.8 Sürüm notu (v3.1 → v3.2 · Tur 14: Hazır Bağlantı Presetleri + Votion Tam Erişim)

Kullanıcı emri (en üst yetki, 2026-11-18, ikinci genişleme): *"hazır bağlanma yerleri ekle, uğraşmasın bir daha… Votion asistanının da her şeye erişimi olabilsin, her şeyi yapabilsin, her bağlantıyı kullanabilsin."* Tur 14 **yıkıcı değişiklik içermez**: hiçbir kanal/ekran/token adı değişmez, silinmez; yalnız **ekleme** vardır. Yeni ürün verisi `src/main/services/connection-presets.json` (**124** preset = 64 entegrasyon + 60 MCP), yeni ekran **`connect`**, yeni bölümler **§7.11** (presetler) + **§7.12** (Votion araç erişimi), UI **§15.9** + **UI-151…UI-158**. Sayılar: preset **124** · ekran **23** · stylesheet **17** (`tur14.css` en son) · kanal **109** (**104 invoke + 5 push**) · yazma **44** · token **107** · domain **31** (`+preset, +votion`; v3.1'de 30 yazılmıştı, ölçülen gerçek taban 29'du; v3.2 ile 31) · entegrasyon **64** / yetenek **195** / MCP **60**. **API-01 değişmez:** outbound **3**, inbound **2** (`presets.js` yalnız dosya okur; `votion-tools.js` ağa **çıkmaz**).

## 0.7 Sürüm notu (v2.9 → v3.0 · Tur 12: Bağlantı Katmanı)

Tur 12 **yıkıcı değişiklik içermez**: hiçbir kanal/ekran/token adı değişmez, silinmez; zorunlu
alan eklenmez. Yalnız **ekleme** vardır. Kaynak: `work/tasarim-v3.0-baglanti-katmani.md`
(Lider, 2026-11-17 · kullanıcı v3.0 bump'ını onayladı).

| Ölçüm | v2.9 | v3.0 | Fark |
|---|---|---|---|
| Kanal (§7.2) | 86 (83 invoke + 3 push) | **100** (**95 invoke + 5 push**) | +14 (12 invoke + 2 push) |
| Yazma kanalı | 35 | **39** | +4 |
| Domain (§7.1) | 26 | **28** (`+mcp, +integration`) | +2 |
| Ekran (`data-screen`) | 18 | **20** (`+integrations, +mcps`) | +2 — UI sözleşmesi §2 |
| Stylesheet | 14 | **15** (`+tur12.css`) | +1 — UI sözleşmesi §10/UI-123 |
| CSS token | 83 | **95** | +12 — UI sözleşmesi §6.8 |

> **Sayı notu (ARC, T-118):** Tasarım §2 tablosu invoke için `97` yazıyor. §3'teki dondurulmuş
> 14 kanalın **12'si invoke, 2'si push** olduğundan invoke **83 + 12 = 95**, push **3 + 2 = 5**,
> toplam **100** eder. `97 + 5 = 102 ≠ 100` aritmetiği tutmadığı için bu sözleşme **95 invoke**
> yazar; **kanal adları ve toplam 100 değişmedi**. Düzeltme Lider'in onayına sunulur.

- **MCP istemcisi (yeni domain `mcp`, 6 invoke):** `kv:mcp:list`, `kv:mcp:add`, `kv:mcp:remove`,
  `kv:mcp:connect`, `kv:mcp:tools`, `kv:mcp:call`. Gerçek JSON-RPC 2.0 (`stdio` + `http`);
  servis `McpRegistry`. Ayrıntı **§7.6**.
- **Entegrasyon kayıt defteri (yeni domain `integration`, 6 invoke):** `kv:integration:list`,
  `kv:integration:save`, `kv:integration:remove`, `kv:integration:test`,
  `kv:integration:capabilities`, `kv:integration:invoke`. Gerçek REST + `safeStorage` şifreli
  token; servis `IntegrationsService`. Ayrıntı **§7.6**.
- **Push (+2):** `kv:event:mcp` (durum/log/araç listesi) ve `kv:event:integration` (durum/log).
- **Yazma kapısı 35 → 39:** `kv:mcp:add`, `kv:mcp:remove`, `kv:integration:save`,
  `kv:integration:remove` **`confirmToken` zorunludur** (API-41, API-51a). Hepsi disk yazar
  (`.keyvotion/mcp.json`, `.keyvotion/integrations.json`).
- **Güvenlik (API-30 genişletmesi):** renderer'a **hiçbir sır dönmez**; denetime yalnız
  `id`/`providerId`/`tool` yazılır — **token, argüman ve URL yazılmaz**. CSP `connect-src 'none'`
  **değişmez** (ağ yalnız main prosesinde).
- **Ağ kuralı (API-01, T-125 + T-130):** outbound **üç** modül + host beyaz listesi; served page yalnız `remote-page.html`; renderer `connect-src 'none'`; kanal adı/sayı değişmedi.
- **API-01 inbound = `{remote.js, oauth.js}`** (T-141 düzeltmesi, gerekçeli: OAuth callback dinleyicisi `services/oauth.js` içinde, `integrations.js` yalnız outbound).
- **v3.1 (T-134, Tur 13) — özet:** entegrasyon **64** sağlayıcı / **≥192** yetenek · MCP kataloğu **60** şablon · OAuth2 (4 sağlayıcı, PKCE S256) → **22** ekran · **16** stylesheet · **105** kanal (**100 invoke + 5 push**) · **42** yazma · **101** token · **30** domain; yıkıcı değişiklik **yok** (yalnız ekleme; ayrıntı §7.9, §7.10, UI §15.5–15.8).
- **Yürürlük notu:** Sözleşme kod tesliminden **önce** yazıldı (T-118). Kod dilimleri (T-119+)
  aynı sayıları üretince `tests/tur10/contract-derive.test.js` yeşile döner; o zamana kadar
  kırmızı olması **beklenen** durumdur (tasarım §8).

---

## 0.6 Sürüm notu (v2.8 → v2.9 · Tur 11: 2040 kimliği + Yönetim Merkezi)

Tur 11 **yıkıcı değişiklik içermez**: hiçbir kanal adı değişmez, silinmez; hiçbir zorunlu alan
eklenmez. Yalnız **ekleme** vardır. (Ayrıntılı ürün gerekçesi: `docs/architecture.md`.)

| Ölçüm | v2.8 | v2.9 | Fark |
|---|---|---|---|
| Kanal | 78 (76 invoke + 2 push) | **86** (**83 invoke + 3 push**) | +8 (7 invoke + 1 push) |
| Yazma kanalı | 32 | **35** | +3 |
| Domain (§7.1) | 25 | **26** (`+audit`) | +1 |
| Ekran (`data-screen`) | 17 | **18** (`+admin`) | +1 — UI sözleşmesi §2 |
| Stylesheet | 13 | **14** (`+tur11.css`) | +1 — UI sözleşmesi §10/UI-123 |
| CSS token | 60 | **83** | +23 — UI sözleşmesi §6 |

- **Yerel model yönetimi (yeni, 7 invoke + 1 push):** `kv:models:list`, `kv:models:dir`,
  `kv:models:install`, `kv:models:cancel`, `kv:models:verify`, `kv:models:remove`,
  `kv:audit:list` ve push `kv:event:model`. Mevcut `models` domain'i **yeniden kullanılır**
  (`kv:models:catalog` uzak sağlayıcı kataloğudur, bu yedi kanal yerel dosya envanteridir).
  Tek yeni domain kelimesi: **`audit`** (denetim akışı okuma).
- **Yazma kapısı 32 → 35:** `kv:models:install`, `kv:models:cancel`, `kv:models:remove`
  `confirmToken` **zorunludur** (API-41, API-51f). Okuyan yedi kanal kapı dışıdır (API-51d).
- **Model durum sözlüğü (API-51h):** `absent | queued | downloading | verifying | ready |
  failed | paused`. İlk dilimde `runtime:{kind:'none', state:'absent'}` **dürüst** değerdir:
  yerel **çıkarım** bu turda YOKTUR, yalnız indirme/kurulum envanteri vardır.
- **İndirme güvenliği (API-51g):** URL kullanıcıdan gelmez, denetimli katalogdan gelir;
  `https:` zorunlu, host beyaz listesi, yönlendirme ≤3 (her adımda host yeniden denetimi),
  `content-length` katalog boyutuyla ±%2, `Bearer` gönderilmez, audit'e **URL değil
  `modelID`** yazılır.
- **`kv:app:info` opsiyonel `contract` alanı (API-51i):** `{apiVersion, channels,
  writeChannels}`. Ek alan olduğu için **kırıcı değildir**; Yönetim Merkezi'nin canlı
  sözleşme sayacını besler.
- **Yürürlük notu:** Bu sürüm **kod tesliminden önce** yazıldı (T-103). Kod dilimi
  (T-104+) aynı sayıları üretince `tests/tur10/contract-derive.test.js` iddiaları yeşile
  döner; o zamana kadar bu testlerin kırmızı olması **beklenen** durumdur ve QA'nın
  bilgisindedir (K3 kapısı kod diliminde işletilir).

---

## 0.5 Sürüm notu (v2.7 → v2.8 · Tur 9: Votion 2.0)

Tur 9 Votion’u gerçek asistana çevirdi. İki çağrı kanalı eklendi: `kv:voice:speak`
(sağlayıcı TTS, `voxcpm2`) ve `kv:voice:transcribe` (sağlayıcı STT, `qwen3-asr-1.7b`).
Toplam **78 kanal**, yazma kümesi **32** (yeni kanallar disk yazmaz — API-51d).
Ağ katmanı `requestExternalBinary` ile 4 `fetch` çağrısına çıktı (API-01).
- **GET/HEAD gövdesi:** `requestExternal` artık `body:null` iken gövde göndermez;
  sağlayıcı testi (`GET /models`) anında "network" hatası vermez.
- **Votion niyeti:** selamlama/teşekkür/saat gibi cümleler model gerektirmeden
  yanıtlanır; uygulama açma, ekran görüntüsü ve dosya listesi beyaz listeye eşlenir
  (`votion-actions`), iki adımlı onay gerekmez (yalnız `move`/`trash`/`browser`).
- **Votion sesi:** mikrofon → 16 kHz WAV → `kv:voice:transcribe`; yanıt →
  `kv:voice:speak` (mp3, base64). CSP’ye `media-src 'self' blob: data:` eklendi.


Tur 8 ikinci dilim yedi çağrı kanalı daha ekledi. Toplam **76 kanal**, yazma kümesi **32**.

- **Çoklu ekip (T8-5):** `kv:teams:list`, `kv:teams:act`. Her ekibin kendi lideri, üyeleri ve token bütçesi vardır; silme yoktur, arşiv vardır. `kv:teams:act` eylemleri: `create`, `update`, `switch`, `archive`, `addMember`, `removeMember`, `setModel`, `autoAssign`, `spend`.
- **Plan/not/zamanlama (T8-6):** `kv:plan:list`, `kv:plan:act`. `kv:plan:act` eylemleri: `planSave`, `planRemove`, `noteSave`, `noteRemove`, `scheduleSave`, `scheduleRemove`, `scheduleRun`, `taskAdd`, `taskUpdate`. Zamanlama türleri `daily`, `weekly`, `once`; tetiklenen görev `plan.fired` yamasıyla bildirilir.
- **Dosyalar + bağlam (T8-7):** `kv:files:list`, `kv:files:read`, `kv:files:context` — **salt okuma**. Proje kökü dışı, `..` kaçışı ve sır dosyaları (`.env`, `keys.bin`, `secrets.bin`, `*.pem`, `*.key`) reddedilir (`E_FORBIDDEN`).
- **Yeni domain'ler (§7.1):** `teams`, `plan`, `files` (toplam 24 domain).
- **Yazma kümesi (API-51a):** `kv:teams:act` ve `kv:plan:act` eklendi → **32**. `kv:files:*` yalnız okuma olduğu için kapı dışıdır.
- **Model otomatik atama:** ayrı kanal açılmadı; `kv:teams:act` içindeki `autoAssign` eylemi role göre deterministik model seçer (katalog boşsa `E_NOT_FOUND`, uydurma atama yok).

## 0.4 Sürüm notu (v2.5 → v2.6 · Tur 8)

Tur 8 tek çağrı kanalı ekledi: `kv:votion:act` (Votion masaüstü eylemleri). Toplam **69 kanal**, yazma kümesi **30**.

- **Yeni kanal:** `kv:votion:act` — eylem adı `{list, openApp, listFiles, move, trash, screenshot, browser, log}`.
- **Yeni domain (§7.1):** `votion` (toplam 21 domain).
- **Yazma kümesi (API-51a):** `kv:votion:act` eklendi → **30**. Kanal tek girdidir ama **eyleme göre kapılıdır**: `move`, `trash`, `browser` yıkıcı/geri alınamaz olduğu için `confirmToken` **zorunludur**; `list`, `listFiles`, `screenshot`, `openApp`, `log` onay istemez (bkz. API-51e).
- **Kural eklemesi (API-51e):** Votion eylemlerinde serbest komut yoktur. `openApp` yalnız beyaz listedeki 8 uygulama kimliğiyle çalışır (`shell:false`, kabuk yok). Dosya işlemleri yalnız Masaüstü/Belgeler/İndirilenler/proje köklerinin **içinde** yapılır; `..` kaçışı ve kök dışı yol `E_FORBIDDEN`. Silme kalıcı değildir: `shell.trashItem` ile Geri Dönüşüm Kutusu'na taşınır.
- **Tarayıcı otomasyonu (v2.6):** `kv:votion:act` içindeki `browser` eylemi bildirimsel adım listesi alır (`click`, `type`, `read`, `scroll`, `wait`); **serbest JavaScript çalıştırılmaz**.
- **Zaman aşımları (API-55):** `kv:votion:act` 30 sn.

## 0.3 Sürüm notu (v2.4 → v2.5 · Tur 6)

Kod gerçeği büyüdü, sözleşme yetişti. Tur 6 dokuz yeni çağrı kanalı ekledi; toplam **68 kanal**, yazma kümesi **29** oldu.

- **Yeni kanallar:** `kv:guide:state`, `kv:guide:update`, `kv:server:status`, `kv:server:start`, `kv:server:stop`, `kv:browser:summarize`, `kv:memory:auto`, `kv:memory:graph`, `kv:voice:ask`.
- **Yeni domain'ler (§7.1):** `guide`, `server`, `voice` (toplam 20 domain).
- **Yazma kümesi (API-51a):** Tur 6'nın 3'ü eklendi (`kv:guide:update`, `kv:server:start`, `kv:server:stop`) → **29**.
- **Bilinçli muafiyet (API-51d):** `kv:memory:auto` diske **append-only** ekleme yapar (silme/üzerine yazma yok), kullanıcı onayı gerektirmeyen otomatik çıkarımdır; bu yüzden `WRITE_CHANNELS` dışındadır. Karar: LDR + ARC, Tur 6. Muafiyet yalnız bu kanal içindir.
- **Zaman aşımları (API-55):** `kv:voice:ask` 130 sn (model yedeği uzun sürebilir), `kv:browser:summarize` 30 sn.

## 0. Sürüm notu (v2.1 → v2.2 · T-037)

> **v2.2.1 (T-043) notu aşağıda, ayrı başlıkta.** v2.2 notu tarihsel kayıt olarak **korunur**. Eski bir ifade artık geçerli değilse v2.2.1 notunda açıkça yazılır.

Bu sürümde **yeni davranış uydurulmadı**; yalnız YM kararları (S-2) ve kodu okuyarak doğrulanan Tur 2 gerçekleri işlendi. Kaynak kod referansları kural metinlerine gömülüdür.

**Değişti**
- **API-47 (S-2):** action için `camelCase` yasağı kaldırıldı. Domain küçük harf; action küçük harf başlar, `camelCase` serbest. Kanal adı değişikliği üç dosyayı (preload + main + renderer) birlikte değiştirir → **Mimar onayı + K3 `compare-channels`** şartı.
- **API-41:** `confirmToken` üretimi **renderer**'a taşındı; TTL **60 sn → 5 dk** (kod: `src/main/services/confirm.js` `TOKEN_TTL_MS`); süresi dolmuş anahtar kalıcı reddedilir.
- **API-81:** `parseReport` çıktısı koddaki Türkçe alan adlarına çekildi (`taskId`, `ozet`, `kanit`, `files`, `risk`, `karar`); etiket biçimleri ve bilinmeyen başlık davranışı yazıldı.
- **API-82:** dosya tarama kuralı netleştirildi (esnek `raporlar/*.md`, yedek `.team/log/*.md` için ilk boş olmayan satır şartı).
- **API-98:** `team.list` çıktısı koddaki tam biçime genişletildi (`counts`, `roster`, `updatedAt` eklendi); `sessions`/`unassigned` kesişmez.
- **§4.1:** `tokenTotal` alanı eklendi; `cost` alanının bugünkü davranışı yazıldı.
- **API-83 / API-89:** "60 sn önbellek" ifadesi kaldırıldı; kodda rapor önbelleği **yok** (her çağrı yeniden tarar, `refresh` ek etkisiz).
- **§9.1, §9.2:** `reports:list` çıktı şeması, `settings:set` onay muafiyeti ve `Report` DTO'su koda eşitlendi.

**Eklendi**
- API-100 — `reports.list` çıktı şeması + parolasız `offline:true` (hata değil).
- API-101 — dosya tarama esnekliği + yedek yolda başlık kuralı.
- API-102 — `confirmToken` doğrulama etiketleri (`missing|format|reuse|expired|capacity`), tek kullanım, fail-closed kapasite.
- API-103 — `payload.js` normalizasyonu (`sessionId`→`sessionID`, `taskId` büyük harf, `model` çift yönlü).
- API-104 — SSE zarfı `{type, data:{sessionID}, domain, seq, at}` + 37 olay adı.
- API-105 — `settings.set` `confirmToken` **gerektirmez** (verilirse tek kullanım doğrulanır).

**Kaldırıldı / geçersiz**
- API-47'deki "action'da camelCase yasak" ifadesi (S-2).
- API-41'deki "token 60 sn geçerlidir" ifadesi (kod 5 dk).
- `Report` DTO'sundaki `taskID`/`summary`/`evidence`/`changedFiles`/`decision` İngilizce alan adları (kodda yok).

**Açık (v2.2'de kapanmadı) — v2.2.1 durumu köşeli parantezde**
- **S-3 · `cost`:** YM kararı "bilinmiyorsa `null`" iken kod `toNumber()` ile **`0`** döndürüyordu (`src/main/services/sessions.js`). Sözleşme kodu yazar, karar sapması §13 O5'te **DOĞRULANMADI** olarak işaretlidir. **[v2.2.1: KAPANDI — `cost = number|null`; kod T-042 ile uydu, T-047 doğruladı.]**
- **O6 · `parseReport` bilinmeyen `## Başlık`:** YM kararı "yutulur" der; kod açık etiketin içeriğine ekler. v2.2 kod gerçeğini yazar; §13 O6'da **DOĞRULANMADI**. **[v2.2.1: KAPANDI — karar kod lehine; içerik korunur.]**
- **O7 · kapsam dışı üç kural:** API-42 (kota), API-54 (bilinmeyen alan reddi), API-55 (invoke timeout) kodda karşılıksız — §13 O7.
- **E-8 (autostart):** API tarafında kanal yok; Tur 3 planı T3-17…T3-22. Bu sürümde kural açılmadı.

---

## 0.1 Sürüm notu (v2.2 → v2.2.1 · T-043)

Küçük ve cerrahi sürüm. Kod yazılmadı; YM kararları işlendi, **O5** ve **O6** kapandı.

**1. API-94 — `E_DUPLICATE_ROLE` kaynağı `roster.md`'dir (metin netleşti)**
- "veya aktif seans başlığında" ifadesi **kaldırıldı**; yerine "canlı seans başlığı denetimi **YAPILMAZ**" yazıldı.
- Gerekçe: her `team:add`'te `GET /api/session` atmak API-94'ün kendi amacını ("sunucuya hiç göndermeden") bozar.
- `roster.assertUniqueCode(code, context)` `context.titles` destekler, **çağıran vermez** (`src/main/main.js`) — bilinçli; hata etiketi `duplicate-role:<KOD>|source:roster`.

**2. S-3 — `cost` tipi `number|null` (O5 kapandı)**
- §4.1: `cost` → **`number|null`**; `null` = bilinmiyor, kartta `— $` (UI-113). `0` **uydurulmaz**.
- `tokens` alt alanları **her zaman sayı** (0 geçerli değer), `tokenTotal` **her zaman sayı**.
- **Kod uyuyor — T-042 ile doğrulandı (T-047, 2026-11-01):** `sessions.js:41` `typeof raw.cost === 'number' && Number.isFinite(raw.cost)` → sayı, aksi halde `null`. `work/probe-cost.js` **19/19 PASS** (bağımsız YM denetimi + ARC yeniden ölçümü): gerçek `0` **korunur** (`cost:0` → `0`), `"1.5"`/`"0"`/`NaN`/`Infinity`/`null`/`true`/`{}` → `null`, alan gelmezse → `null`; `makeMissingCard` `cost:null`; `tokens.*` ve `toNumber` dokunulmadı. **Bu tamamlama v2.2.1 içindedir, v2.2.2 açılmadı** (düzeltme notu).

**3. O6 — bilinmeyen `## Başlık` içeriği korunur (O6 kapandı)**
- API-81: bilinmeyen başlık alan **açmaz**, açık etiketin içeriğine **eklenir** (içerik kaybı yok).
- Gerekçe + ölçüm: 11 rapor dosyasında **42 bilinmeyen başlık** (`## 1. Yapılan İşlemler`, `## Kanıt 1 — canlı IPC`, `## A. Paketleme İstatistikleri` …); en uzun `kanit` **4.157 karakter** (`T-040__DEV`).

**4. Kapanan açık noktalar**
- §13 **O5** ve **O6** "kapandı (v2.2.1)" olarak işaretlendi.
- **O7** (API-42/54/55) kapsam dışı: Tur 3'te DEV kararı — değişmedi.

**Geçersiz kılınan eski ifadeler:** v2.2 notundaki "`cost` bugünkü davranışı yazıldı" ve "S-3 sapması DOĞRULANMADI" satırları tarihsel kayıttır; **v2.2.1 kararı geçerlidir** (`cost = number|null`).

---

## 0.2 Sürüm notu (v2.2.1 → v2.2.2 · T-055)

Kod gerçeği değişti, sözleşme yetişti. **Kural değiştiği için** sürüm numarası yükseldi (T-053 yalnız biçimdi, o yüzden v2.2.1 kalmıştı).

**1. API-51 — yazma kanalı kümesi 8 → 9, `kv:secret:set` ZORUNLU onaylı**
- T-052 ile `kv:secret:set` onay kapısı **zorunlu** oldu ve YM acil düzeltmesiyle `WRITE_CHANNELS`'a eklendi → **9 kanal**.
- Kanıt (canlı): tokensız çağrı `E_CONFIRM_REQUIRED` + `detail:"rule:missing"`; aynı token ikinci kez `detail:"rule:reuse"`; geçerli token `ok:true`.
- §7.3 matrisinde `kv:secret:set` satırı gerçekle eşitlendi: girdi `{password, confirmToken}`, hata listesine `E_CONFIRM_REQUIRED` eklendi.
- Kod: `src/shared/ipc-channels.js` `WRITE_CHANNELS` (9), `src/main/main.js:395-405`.

**2. API-105 — `kv:settings:set` muafiyeti gerekçelendi (kural değişmedi, kapsamı netleşti)**
- Kanal yalnız yerel `config.json`'a yazar: ağa çıkmaz, silmez, **sır yazmaz** (sır `kv:secret:set`'tedir).
- `confirmToken` gerekmez; **verilirse** tek kullanım olarak doğrulanır. Gerekçe koda yorum olarak yazılıdır: `src/main/main.js:370-378`.
- **Yeni kural:** muafiyet yalnız bu kanal içindir; sonraki yazma kanalları için `confirmToken` **varsayılan zorunludur**.

**3. §5.2 — `E_PARTIAL` haritaya eklendi (kod T3-2'de gelecek)**
- `kv:command:sendMany` kısmi başarısı için tanımlandı; satırda **"kod henüz yok — T3-2"** açıkça yazılı. Bu bir *karar*, kod iddiası değildir (v2.2.1'deki `cost` deseninin aynısı).

**Kapsam dışı (bilinçli):** §7.2'deki bilinen ad uyuşmazlıkları (`kv:team:refresh`, `kv:models:list`, `kv:secret:test`) **bu sürümde düzeltilmedi**; T3-2 taslağında not olarak duruyor.


---

## 1. Temel kurallar

| # | Kural |
|---|---|
| API-01 | **Ağ kuralları (v3.0; T-130'da gelen/giden ayrıldı — yıkıcı değil):** **(a) Renderer:** ağa **çıkamaz**; CSP `connect-src 'none'` **değişmez** (API-02). **(b) Giden ağ (outbound):** **yalnız main prosesinde** ve **yalnız üç modülde** — `src/main/services/http-client.js`, `src/main/services/integrations.js`, `src/main/services/mcp-client.js`. `fetch` doğrudan ya da takma adla (`const doFetch = globalThis.fetch`) çağrılabilir — **fark etmez**; kural modül düzeyindedir, sözdizimi düzeyinde değildir. Üçü de hedef **host beyaz listesi** uygular (bkz. tablo). **Yeni outbound modül** eklemek **ARC onayı + sürüm notu** ister; bu üç dosya dışında `fetch`, `http.request`, `https.request`, `net.connect`, `dgram` **yasaktır** (**K2 denetim hatası**, kod birleşmez). **(c) Gelen ağ (inbound listener):** inbound kümesi **`{remote.js, oauth.js}`** — yalnız bu iki dosya gelen bağlantı kabul edebilir; `http.createServer`/`net.createServer`/dinleme (`listen`) **başka dosyada yasaktır**. **(c.1) `src/main/services/remote.js`** — telefon köprüsü (§7.6, API-60). **(c.2) `oauth.js`** — yalnız **OAuth2 loopback callback** dinleyicisi (§7.9), dosya `src/main/services/oauth.js` satır **220–300** (`http.createServer` :164/:220, `listen(0, '127.0.0.1')` :289, tek yol `GET /oauth/callback` :254, `OAUTH_TIMEOUT_MS = 120000` :21): `127.0.0.1`'e bağlı **geçici** sunucu, **port 0** (işletim sistemi seçer), tek yol `GET /oauth/callback`, **tek istek** sonrası `close()`, **120 sn** sonra zorla kapanır, `0.0.0.0`'a **asla** bağlanmaz, uygulama ömrü boyunca **en fazla bir** akış açıktır. **Gerekçe:** OAuth2 yetki kodu akışı tarayıcıdan geri dönüş gerektirir; callback alıcısı olmadan akış **teknik olarak imkânsızdır**. Dinleyici kendi modülündedir (`oauth.js`); **`integrations.js` yalnız outbound'dur** — içinde inbound sunucu **yoktur**. Bu istisna keyfî değildir: dinleyici yalnız `kv:oauth:start` sırasında, yalnız loopback'te, yalnız 120 sn yaşar ve yalnız `state` eşleşen **tek** isteği işler. **(c.3) Zorunlu güvenlik koşulları — `remote.js`, hepsi bugünkü kodda vardır:** (i) varsayılan **kapalı**, yalnız kullanıcı `kv:remote:start` ile açar; (ii) parola/token doğrulaması olmadan istek işlenmez — `x-kv-token` başlığı **veya** `?t=` sorgu parametresi, `crypto.timingSafeEqual` ile sabit zamanlı karşılaştırma; eksik/yanlış → `401 E_UNAUTHORIZED`. Tek istisna `GET /api/health` (jetonsuz, yalnız "açık mı"); `GET /` istemci sayfasını token'sız sunar ama **veri döndürmez**; `/api/*` geri kalanı token ister. Ek olarak yalnız **özel ağ** kaynaklı istekler (`isPrivateAddress`; değilse `403 E_FORBIDDEN`) ve IP başına dakikalık istek sınırı (`429 E_RATE_LIMIT`); (iii) yalnız `kv:remote:*` kanallarıyla yönetilir (`state`, `start`, `stop`, `rotate`); (iv) durdurma `kv:remote:stop` **veya** uygulama kapanışı — açık soketler `destroy()` edilir, dinleyici `close()` ile kapanır. **(d) Servis edilen istemci sayfası:** `src/main/services/remote-page.html` **yalnız** `remote.js` sunucusundan (`GET /`) servis edilir; CSP **yanıt başlığıyla** verilir (`default-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; frame-ancestors 'none'`); **renderer değildir** — `keyvotion://`, `file://` veya uygulama içi tarayıcıdan **açılmaz**, yalnız telefonun tarayıcısında çalışır (API-60). |
| **Yorum kuralı** | **A1 kapısı yorumları ayıklamaz.** Bir modülde geçen ağ işareti **yorumda bile** yanıltıcıdır: yorumda `fetch(` / `XMLHttpRequest` / `http.request` **yazılmaz**, onun yerine **"ağ isteği"** denir (örnek: `integrations.js` `perform` yorumu). Bu, kapıyı sözdizimi oyunuyla değil **niyetle** korur. |

**API-01 — ağ modülleri, yön ve politikalar (v3.0; T-130):**

| Modül | Yön | Neyi çağırır | Host / erişim politikası | Kanal / servis |
|---|---|---|---|---|
| `src/main/services/http-client.js` | **outbound** | OpenCode yerel sunucusu (`request`, `requestExternal`, `requestExternalBinary`, `openStream`) | Ayarlardaki sunucu `baseUrl`'i (`127.0.0.1`/LAN); başka host'a istek yok. `requestExternal` yalnız **https** + host beyaz listesi | `kv:server:*`, `kv:provider:test/failover`, `kv:chat:send`, `kv:voice:*` |
| `src/main/services/integrations.js` | **outbound** | Entegrasyon katalogundaki REST uçları (`health`, `capabilities[].verb+path`) + OAuth2 token/refresh/revoke uçları | Katalog kaydındaki `hosts[]` **beyaz listesi**; `https` zorunlu (tek istisna `allowInsecureLoopback` + `127.0.0.1`, `ollama`); host her adımda yeniden denetlenir; OAuth uçları katalogda yazılı **sabit** host'lardır | `kv:integration:*`, `kv:oauth:start/status/revoke` (IntegrationsService) |
| `src/main/services/oauth.js` | **inbound** — geçici OAuth callback dinleyicisi (§7.9), satır **220–300** (`http.createServer` :220, `listen(0,'127.0.0.1')` :289) | `GET /oauth/callback?code&state` — **yalnız** loopback (`127.0.0.1`), **port 0**, tek istek, **120 sn** ömür | `0.0.0.0`'a bağlanmaz; başka yol yok; `state` `crypto.timingSafeEqual` ile doğrulanır, eşleşmezse istek **işlenmez** (gövde okunmaz, kod değişmez); kod/token log'a yazılmaz | `kv:oauth:start` (akış sahibi) |
| `src/main/services/mcp-client.js` | **outbound** | MCP sunucusu — `stdio` alt süreç (ağ yok) veya `http` transport (JSON-RPC `POST`) | `http` transport yalnız **https**; tek istisna `allowInsecureLoopback` + `127.0.0.1`; `Mcp-Session-Id` dışında başlık taşımaz; `Authorization`/`Bearer` gönderilmez | `kv:mcp:*` (McpRegistry) |
| `src/main/services/remote.js` | **inbound** — `http.createServer` + `listen(port, '0.0.0.0')` | Telefonun tarayıcısından gelen `GET /`, `/api/health`, `/api/state`, `/api/board`, `/api/send`, `/api/new` | Varsayılan **kapalı**; yalnız **özel ağ** IP'leri; `x-kv-token` (veya `?t=`) sabit zamanlı doğrulama; `/api/health` jetonsuz; IP başına dakikalık sınır → `429`; başka arayüz yok | `kv:remote:state/start/stop/rotate` (RemoteService) |
| `src/main/services/remote-page.html` | **served** (ağ yapmaz; servis edilir) | `remote.js`'e göreli `fetch('/api/…')` (`connect-src 'self'`) | Yalnız `remote.js` `GET /` yanıtıyla sunulur; CSP yanıt başlığında; `keyvotion://`/`file://` üzerinden **açılmaz**; renderer sayılmaz | `kv:remote:state` (sayfa içeriği) |

| API-02 | Renderer hiçbir zaman sunucu adresini, parolayı veya `Authorization` başlığını görmez; yalnız `window.keyvotion` köprüsünü kullanır. |
| API-03 | `Authorization`, `password`, `apiKey`, `token` (değer olarak) hiçbir log, audit, IPC yanıtı veya hata mesajına yazılmaz. |
| API-04 | Her istek `x-opencode-directory: <proje dizini>` başlığı taşır; dizin ayarlardan gelir (varsayılan `%USERPROFILE%\Keyvotion`). |
| API-05 | Zaman aşımı: normal istekler **8 sn**, `/api/info` **3 sn**, `/api/event` bağlantı kurulumu **5 sn**. |
| API-06 | Yanıt gövdesi JSON değilse `E_PARSE` üretilir; ham gövde kullanıcıya gösterilmez, sadece ilk 120 karakter loga (redakte) yazılır. |
| API-07 | Sunucu sürümü `/api/info` ile okunur; `2.` ile başlamıyorsa `E_VERSION` üretilir ve Ayarlar'da "desteklenmeyen sürüm" gösterilir. |
| API-08 | Her yazma isteği `X-Idempotency-Key` (yerel UUID) taşır ve audit'e bu anahtar yazılır; aynı anahtarla ikinci istek gönderilmez. |

---

## 2. Kimlik doğrulama ve bağlantı

| # | Kural |
|---|---|
| API-09 | Başlık biçimi `Authorization: Basic base64("opencode:" + parola)`; kullanıcı adı **daima** `opencode` (OpenCode 2 kuralı). |
| API-10 | Parola kaynağı sırası: (1) `secrets.bin` (DPAPI), (2) `OPENCODE_PASSWORD` ortam değişkeni, (3) yok → `E_SECRET_MISSING`. |
| API-11 | Parola yalnız bellekte `main` süreçte tutulur; renderer'a dönen hiçbir nesnede bulunmaz. |
| API-12 | Bağlantı testi `GET /api/info`; sonuç `{ok, version}` veya hata kodu olarak döner, parola asla dönmez. |
| API-13 | 5 hatalı 401 denemesinden sonra istemci **60 sn** yeni deneme yapmaz (`E_LOCKED_OUT`), sayaç başarılı girişte sıfırlanır. |
| API-14 | Yalnız `http://127.0.0.1` veya `http://localhost` varsayılan kabul edilir; başka host girilirse `secureWarning: true` alanı döner ve UI uyarı gösterir (UI sözleşmesi §4.5). |

---

## 3. Uç nokta tablosu (MVP = ✅, sonraki tur = ⏳)

| # | Amaç | Yöntem · yol | İstek | Yanıt (kullanılan alanlar) | MVP |
|---|---|---|---|---|---|
| E01 | Sunucu kimliği | `GET /api/info` | — | `version, urls[0], capabilities` | ✅ |
| E02 | Proje listesi | `GET /api/project` | — | `[{id, canonical}]` | ✅ |
| E03 | Seans listesi | `GET /api/session` | — | `{data:[Session…]}` | ✅ |
| E04 | Aktif seanslar | `GET /api/session/active` | — | `{data:{<sessionID>: …}}` | ✅ |
| E05 | Seans detayı | `GET /api/session/{id}` | — | `{data:Session}` | ✅ |
| E06 | Mesajlar | `GET /api/session/{id}/message` | `?limit=` (varsayılan 20) | `{data:[Message…]}` | ✅ |
| E07 | **Komut gönder** | `POST /api/session/{id}/prompt` | `{text, delivery?}` | `{data:{…}}` | ✅ |
| E08 | **Durdur** | `POST /api/session/{id}/interrupt` | `{}` | `{data:{…}}` | ✅ |
| E09 | Model kataloğu | `GET /api/model` | — | `{location, data:[Model…]}` | ✅ |
| E10 | Sağlayıcılar | `GET /api/provider` | — | `{data:[Provider…]}` | ✅ |
| E11 | Ajanlar | `GET /api/agent` | — | `{data:[{id,name}]}` | ✅ |
| E12 | **Olay akışı** | `GET /api/event` (SSE) | — | `event: …` + `data: {type,…}` | ✅ |
| E13 | Slash komutlar | `GET /api/command` | — | `{data:[…]}` | ⏳ |
| E14 | Model değiştir | `POST /api/session/{id}/model` | `{model:{id,providerID,variant?}}` | **204 No Content** (gövde yok) | ⏳ |
| E15 | İzin talepleri | `GET /api/permission/request` | — | `{data:[…]}` | ⏳ |
| E16 | İzin yanıtı | `POST /api/session/{id}/permission/{req}/reply` | `{reply:"once"\|"always"\|"reject"}` | `{data:{…}}` | ⏳ |
| E17 | Gelen kutusu | `GET /api/session/{id}/inbox` | — | `{data:[…]}` | ⏳ |
| E18 | Zamanlanmış görevler | `GET /api/experimental/schedule` | — | `{data:[…]}` | ⏳ |

| # | Kural |
|---|---|
| API-15 | MVP'de **yazma yapan yalnız 3 uç** vardır: E07, E08, (Tur 2) E14. Üçü de `Policy.confirm` onayı olmadan çağrılamaz. |
| API-16 | E07 gövdesi `{text}`; `text` 1–8000 karakter. Boş/boşluk metin `E_BAD_REQUEST` üretir, istek **gönderilmez**. |
| API-17 | E07 yanıtı 2xx değilse kullanıcıya "gönderildi" denmez; iyimser güncelleme geri alınır. |
| API-18 | E06 `limit` en fazla 50; daha büyük değer 50'ye kırpılır. |
| API-19 | Kullanılmayan uç noktalar (fork, revert, pty, shell, fs-write, worktree, vcs) çağrılmaz; çağrı K2'de red sebebidir. |
| API-20 | `x-opencode-directory` gönderilmezse sunucu kendi cwd'sini kullanır; bu durum testte **hata** sayılır. |

---

## 4. DTO beyaz listesi (renderer'a geçen alanlar)

**Kural:** Aşağıdaki alan listesi **kapalı**dır. Listede olmayan hiçbir alan IPC sınırını geçemez (API-21). Eşleme `src/main/opencode/mappers.js` içinde yapılır.

### 4.1 `Session` (E03/E04/E05)

| Alan | Tip | Kaynak | Not |
|---|---|---|---|
| `id` | string | `id` | `ses_…` |
| `role` | `"LDR"\|"YM"\|"ARC"\|"DEV"\|"DSN"\|"QA"\|"OPS"\|null` | `roster.md` eşlemesi | yoksa `null` |
| `title` | string | `title` | 60 karakterde kırpılır |
| `agent` | string | `agent` | — |
| `providerID` | string | `model.providerID` | — |
| `modelID` | string | `model.id` | — |
| `variant` | string | `model.variant` | — |
| `state` | `"idle"\|"busy"\|"error"\|"offline"` | türetilmiş | §5 |
| `outcome` | string\|null | `outcome` | `succeeded/failed/…` |
| `tokens` | `{input,output,reasoning,cacheRead}` **nesne** | `tokens.*` | alt alanların **her biri her zaman sayı**; eksik alan `0` (0 geçerli değerdir) |
| `tokenTotal` | number | türetilmiş | `input+output+reasoning`; her zaman sayı (okunabilir toplam **yalnız** burada) |
| `cost` | **number\|null** | `cost` | `null` = **bilinmiyor** (0 uydurulmaz); kartta `— $` gösterilir (UI-113). **Kod uyuyor:** T-042 ile doğrulandı (`sessions.js:41` finite-number kontrolü; `work/probe-cost.js` 19/19) — gerçek `0` korunur, string/NaN/Infinity → `null` |
| `updatedAt` | number (epoch ms) | `time.updated` | — |
| `idleAt` | number\|null | `time.idle` | — |
| `directory` | string | `location.directory` | eşleşme filtresi |
| `inRoster` | boolean | roster kontrolü | `false` → "kadro dışı" |

**Yasak (geçmez):** `projectID`, `metadata`, `time.created/viewed`, `tokens.cache.write`, ham `model` nesnesi, `location` (tam nesne).

### 4.2 `Model` (E09)

| Alan | Tip | Not |
|---|---|---|
| `id`, `providerID`, `name`, `type`, `family` | string | — |
| `capabilities` | `{tools:boolean, input:string[], output:string[]}` | yalnız bu 3 alan |
| `variantIDs` | string[] | `variants[].id` |
| `inPool` | boolean | `models.md` havuzunda mı |

**Yasak (geçmez):** `settings` (içinde `apiKey`, `baseURL` var — ölçüldü), `package`, `compatibility`, `cost`, `variants[].settings`.

### 4.3 `Message` (E06)

| Alan | Tip | Not |
|---|---|---|
| `id` | string | — |
| `kind` | `"user"\|"assistant"\|"tool"\|"system"` | tür eşlemesi |
| `at` | string (ISO-8601 UTC) | — |
| `text` | string | 4000 karakterde kırpılır, tam metin için ayrı istek yok (MVP) |
| `toolName` | string\|null | `kind="tool"` ise |

**Yasak (geçmez):** dosya ekleri, görsel blob'ları, ham parça (`parts`) dizisi, sağlayıcı yanıt meta verisi.

### 4.4 `BoardRow` (dosyadan, E-yok)

| Alan | Tip | Not |
|---|---|---|
| `id` | `T-\d{3}` | — |
| `title` | string | — |
| `owner` | string | `LDR/YM/ARC/DEV/DSN/QA/OPS/EKİP` |
| `status` | `planlandi\|devam\|inceleme\|bitti\|red\|bloke` | ASCII |
| `statusRaw` | string | tanınmayan değer burada |
| `evidence` | string | — |
| `phase` | string | `Aşama N — …` |

### 4.5 `Settings` (renderer'a dönen)

| Alan | Tip | Not |
|---|---|---|
| `serverURL` | string | — |
| `projectDir` | string | — |
| `theme` | `"dark"\|"light"` | — |
| `secretState` | `"stored"\|"missing"\|"corrupt"` | **parolanın kendisi yok** |
| `schemaVersion` | number | — |
| `onboarded` | boolean | T-153: ilk-kurulum sihirbazı tamamlandı mı (sır değil; `config.json` beyaz listesinde) |

| # | Kural |
|---|---|
| API-21 | Beyaz liste dışı alan döndüren mapper K2'de reddedilir; QA testi `apiKey` ve `password` anahtarlarının IPC yanıtında **bulunmadığını** doğrular. |
| API-22 | `Session.state` üç sinyalden türetilir: `E04` anahtarı var → `busy`; `outcome="failed"` ve `idleAt` son → `error`; bağlantı yok → `offline`; aksi `idle`. Tek sinyal yeterli değildir. |
| API-23 | `Session.role` eşlemesi `roster.md` tablosundan okunur; dosya okunamazsa `role=null` ve UI'da `?` gösterilir, uygulama durmaz. |
| API-24 | Metin kırpması yapılan alanlar (`title` 60, `text` 4000) kırpıldığında sonuna `…` eklenir ve `truncated:true` alanı konur. |

---

## 5. Hata kodu haritası (eksiksiz)

### 5.1 Yerel zarf
Her IPC çağrısı **tek** biçim döner (API-25):

```jsonc
// başarı
{ "ok": true, "data": { /* beyaz listeli DTO */ } }
// hata
{ "ok": false, "error": {
    "code": "E_BUSY",            // §5.2
    "message": "Seans meşgul.",  // Türkçe, sır içermez
    "status": 409,               // HTTP kodu veya null
    "retryable": true,
    "detail": null               // yalnız geliştirici modunda, redakte
} }
```

| # | Kural |
|---|---|
| API-25 | Zarf dışında (ham veri, ham hata fırlatma) dönüş yasak; preload her yanıtı doğrular. |
| API-26 | `message` alanı Türkçe ve kullanıcıya gösterilebilir olmalı; ham sunucu metni `detail`'e (redakte) gider. |
| API-27 | `retryable:true` yalnız ağ/timeout/5xx/429 için; `E_BUSY` kullanıcı kararıyla yeniden gönderilebilir ama `retryable` **false**'tur (çift emir riski). |

### 5.2 Kod → durum → UI haritası

| Kod | HTTP | Ne zaman | UI durumu | Kullanıcıya metin | Davranış |
|---|---|---|---|---|---|
| `E_OK` | **200 / 201 / 204** | başarı | normal | — | veriyi uygula |
| `E_BAD_REQUEST` | 400 | geçersiz gövde/parametre | form hatası | `İstek geçersiz.` | alan işaretle, gönderme |
| `E_UNAUTHORIZED` | 401 | parola yok/yanlış | `unauthorized` | `Parola geçersiz. Ayarlar'dan yeniden girin.` | Ayarlar ekranına yönlendir, 5→60 sn kilit |
| `E_FORBIDDEN` | 403 | işlem sunucuda kapalı | `error` | `Bu işlem sunucuda kapalı.` | tekrar yok |
| `E_NOT_FOUND` | 404 | seans/mesaj yok | `error` + kart `data-missing` | `Seans bulunamadı.` | listeden düşür, tam uzlaştırma |
| `E_BUSY` | 409 | seans çalışıyor | `busy` | `Seans meşgul. Sıraya alınsın mı?` | kuyruk teklifi (E07 `delivery:"queue"`) |
| `E_CONFLICT` | 409 (diğer) | durum çakışması | `error` | `Durum değişti, yenileniyor.` | tam uzlaştırma |
| `E_DUPLICATE_ROLE` | — (yerel politika) | aynı rol kodu ikinci kez ekleniyor | form hatası | `Bu rol kodu zaten kullanımda. DEV2 gibi yeni bir kod seçin.` | istek **gönderilmez**, `[data-field="agent-code"]` `aria-invalid="true"` |
| `E_TIMEOUT` | — (AbortController) | 8/3/5 sn aşıldı | `offline` | `Sunucu yanıt vermedi.` | `retryable`, üstel geri çekilme |
| `E_RATE_LIMIT` | 429 | çok istek | `offline` | `Çok fazla istek, biraz bekleyin.` | `retryable`, 60 sn |
| `E_SERVER` | 5xx | sunucu hatası | `error` | `Sunucu hatası (kod).` | `retryable:false`, kullanıcı tetikler |
| `E_OFFLINE` | — (`ECONNREFUSED`, `EHOSTUNREACH`, `ENOTFOUND`, `ECONNRESET`) | sunucu yok | `offline` | `Sunucuya ulaşılamadı.` | 1→2→4→8→16→30 sn geri çekilme |
| `E_PARSE` | — | JSON/Markdown ayrıştırma | `error` | `Yanıt okunamadı.` | son iyi kopya korunur |
| `E_VERSION` | — | `/api/info` sürümü `2.` değil | `error` | `Desteklenmeyen sunucu sürümü.` | yazma engellenir |
| `E_SECRET_MISSING` | — | parola yok | `unauthorized` | `Kayıtlı parola yok.` | Ayarlar'a yönlendir |
| `E_SECRET_CORRUPT` | — | DPAPI çözülemedi | `unauthorized` | `Parola okunamadı, yeniden girin.` | dosya `.corrupt` olarak taşınır |
| `E_CONFIRM_REQUIRED` | — (yerel politika) | onay olmadan yazma | — | (UI'da görünmez) | istek **gönderilmez**, audit'e red yazılır |
| `E_LOCKED_OUT` | — (yerel) | 5 hatalı 401 sonrası | `unauthorized` | `Çok fazla deneme. 60 sn sonra.` | geri sayım |
| `E_INTERNAL` | — | beklenmeyen | `error` | `Beklenmeyen hata.` | loga redakte yaz |
| `E_PARTIAL` | — (yerel politika) | `kv:command:sendMany` çoklu gönderimde **bazı** hedefler başarısız | `error` (kısmi) | `Bazı hedeflere gönderilemedi.` | `results[]` hedef hedef gösterilir, başarılılar **tekrar gönderilmez** — *kod: **T3-2** (henüz yok)* |

| # | Kural |
|---|---|
| API-28 | Haritada olmayan hiçbir kod UI'a çıkmaz; bilinmeyen hata `E_INTERNAL`'a katlanır. |
| API-29 | `E_OFFLINE` ve `E_UNAUTHORIZED` **tüm** ekranları etkiler: `data-connection` rozeti değişir (UI §5.3). |
| API-30 | Her hata audit satırı üretir: `{at, code, op, target, status, idempotencyKey}` — mesaj metni ve parola yok. |

**v2.9 ek kodları (Tur 11 — §7.5 yerel model kanalları):** `E_NETWORK`, `E_DISK_FULL`,
`E_HASH_MISMATCH`, `E_CANCELLED`. Bunlar **henüz `src/shared/errors.js` içinde yoktur**; kod
diliminde (T-104+) aynı adlarla eklenecektir. Bu satır bir vaat değil, **yapılacaklar
listesidir**; eklenene kadar bu dört kodu döndüren kanal yoktur (kanallar da henüz kodda yok).
UI eşlemesi: `E_NETWORK`→`offline`, `E_DISK_FULL`→`error` + boş alan önerisi,
`E_HASH_MISMATCH`→`error` + yeniden indir önerisi, `E_CANCELLED`→`idle` (hata değil, sessiz).

---

## 6. SSE olay akışı (`GET /api/event`)

> **v2.1 (C-7):** v1 §6.1 olay tablosu **silinmiştir** — `session.updated`, `message.updated`, `session.error`, `message.removed` bu sunucuda **yoktur**. Geçerli ve tek olay adı kaynağı **§8.7**'dir (API-74). Bu bölümde yalnız uzlaştırma, sıra ve yeniden bağlanma kuralları (API-31…API-40) yaşar.

### 6.1 Olay adları — §8.7'ye taşındı

Olay adı listesi bu bölümde **tutulmaz**; tek kaynak §8.7'deki canlı `types` enum'udur. Burada kalan kurallar ad listesinden bağımsızdır ve §8.7 ile birlikte okunur.

| # | Kural |
|---|---|
| API-31 | Olay adları **opak** kabul edilir: bilinmeyen `type` hataya yol açmaz, 2 sn debounce'lu **tam uzlaştırma** tetikler (API-33). |
| API-32 | `server.connected` alındığında istemci sırayla E03 → E04 → (açık ekran verisi) çağırır; bu, abonelik kurulduktan **sonra** yapılır ki arada olay kaçmasın. |
| API-33 | Bilinmeyen olay tipi: tek seferlik 2 sn debounce ile E03 yenilenir; aynı tip 3 kez üst üste bilinmiyorsa loga `unknown-event:<type>` yazılır (bir kez). |
| API-34 | Olay yaması `{seq, at}` taşır; `seq` son uygulanandan küçük/eşitse yama **yok sayılır** (geç gelen veri geri sarmaz). |
| API-35 | Aynı seans için SSE ve poll farklı `updatedAt` verirse **büyük olan** kazanır. |
| API-36 | SSE bağlantısı koptuğunda yeniden bağlanma: 1, 2, 4, 8, 16, 30 sn (sonra 30 sn sabit) + ±%20 jitter; her denemede `data-connection` `offline`. |
| API-37 | Streaming yok (replay yok): kopma süresince kaybolan olaylar **yalnız** uzlaştırma ile telafi edilir; istemci olay geçmişi tutmaz. |
| API-38 | SSE bağlantısı tekildir (tek `EventSource`/tek abonelik); ekran başına ikinci bağlantı açılmaz. |

### 6.2 Uzlaştırma kuralları (özet tablo)

| Tetik | İşlem | Debounce |
|---|---|---|
| Açılış / `server.connected` | E03 + E04 (+ açık ekran) | yok |
| Bilinmeyen olay | E03 | 2 sn |
| Yeniden bağlanma | E03 + E04 | yok |
| Pencere odağı (`focus`) | E03 | 2 sn |
| Periyodik tur | E03 | 20 sn sabit |
| `session.text.delta` (yalnız `command` ekranı açıksa) | E06 | 500 ms |
| `.team/board.md` değişimi | dosya yeniden okunur | 300 ms |
| 404 (`E_NOT_FOUND`) | E03 + E04 | yok |

| # | Kural |
|---|---|
| API-39 | Uzlaştırma istekleri üst üste binmez: uçuşta olan tur varsa yeni tetik kuyruğa alınır, paralel istek açılmaz. |
| API-40 | Uzlaştırma sırasında ekran **boşaltılmaz**; mevcut veri korunur, gelen veri yerinde değiştirilir. |

---

## 7. IPC kanal sözleşmesi (preload ↔ main)

### 7.1 Ad kuralı
```
kv:<domain>:<action>
   domain ∈ app | team | command | board | models | reports | roster | settings | secret
            | event | memory | project | provider | skill | permission | browser
            | chat | remote | guide | server | voice | votion
            | teams | plan | files | audit | mcp | integration
            | mcp-catalog | oauth | preset
            (yalnız küçük harf; v2.4'te Tur 5 alanları — chat, remote — eklendi;
             v2.5'te Tur 6 alanları — guide, server, voice — eklendi;
             v2.6'da Tur 8 alanı — votion — eklendi;
             v2.7'de Tur 8 alanları — teams, plan, files — eklendi;
             v2.9'da Tur 11 alanı — audit — eklendi;
             v3.0'da Tur 12 alanları — mcp, integration — eklendi;
             v3.1'de Tur 13 alanları — mcp-catalog, oauth — eklendi;
             v3.2'de Tur 14 alanı — preset — eklendi; toplam 31 domain.
             Ölçülen gerçek taban: v3.1'de 29 (sözleşmede 30 yazılmıştı), v3.2 ile 31)
   action ∈ küçük harf ile başlar; camelCase SERBESTTİR (list, get, set, read, write, setLeader, keyAdd)
```

| # | Kural |
|---|---|
| API-46 | Kanal adları **yalnız** `src/shared/ipc-channels.js` içinde tanımlanır; başka dosyada string kanal adı geçmez (tek kaynak). |
| API-47 | **Ad kuralı (S-2, v2.2):** `domain` küçük harf olmak zorundadır ve yalnız §7.1 listesindekilerden biridir. `action` küçük harf başlar; **camelCase serbesttir** (`setLeader`, `read`, `write`, `keyAdd`). `:` fazlası, `_` ve domain'de büyük harf yasaktır. Doğru: `kv:team:list`, `kv:team:setLeader`, `kv:roster:read`, `kv:provider:keyAdd` · Yanlış: `kv:teamList`, `team:list`, `kv:KV:list`. **Kanal adı değişikliği `src/shared/ipc-channels.js` + `src/preload/preload.js` + `src/main/main.js` üçlüsünü birlikte değiştirir → Mimar onayı + K3 `compare-channels` şartı.** Mevcut camelCase adlar (`kv:team:setLeader`, `kv:reports:list`, `kv:roster:read`, `kv:roster:write`, `kv:provider:keyAdd`, `kv:provider:keyRemove`) **değişmez**. |
| API-48 | Renderer **ham `ipcRenderer` görmez**; preload yalnız `window.keyvotion.<domain>.<action>()` metotları açar (beyaz liste). |
| API-49 | Push (main→renderer) kanalları `kv:event:` öneki taşır; renderer bunları `window.keyvotion.on*` ile abone olur, `invoke` edemez. |
| API-50 | İstenen kanal beyaz listede yoksa preload `E_UNKNOWN_CHANNEL` zarfı döner; exception fırlatmaz. |

### 7.2 Kanal tablosu (v3.3 — T-205 dahil, 111 kanal, TAM liste)

`src/shared/ipc-channels.js` ile **birebir** olmalıdır; `tests/tur2/ipc-channels.test.js`
bu tabloyu tek kaynak olarak okur (sayı sabit kodlanmaz).

| Kanal | Yön | Girdi | Çıktı (`data`) | Servis |
|---|---|---|---|---|
| `kv:app:ping` | invoke | `{}` | `{pong:true, at}` | main |
| `kv:app:info` | invoke | `{}` | `{appVersion, schemaVersion, server:{version, connected}, contract?:{apiVersion, channels, writeChannels}}` (v2.9: `contract` opsiyonel — API-51i) | main |
| `kv:team:list` | invoke | `{}` | `{sessions:Session[], unassigned:Session[]}` (kanonik biçim: API-98) | SessionsService |
| `kv:team:add` | invoke | `{role, code, model, confirmToken}` | `{session, rosterPath}` | SessionsService |
| `kv:team:remove` | invoke | `{sessionID, confirmToken}` | `{archivedAt, backupPath}` | SessionsService |
| `kv:team:setLeader` | invoke | `{sessionID, confirmToken}` | `{rosterPath, backupPath}` | SessionsService |
| `kv:team:plan` | invoke | `{description, size?, leaderCode?}` | `{source:'model'\|'fallback', summary, members[], notes[]}` (T-205; yazma yok, model çağrısı) | TeamBuilder |
| `kv:team:apply` | invoke | `{members[], confirmToken}` | `{applied[], codes[], entries[]}` (T-205; kadroya ekler, silmez) | TeamBuilder |
| `kv:command:send` | invoke | `{sessionId, text, confirmToken}` | `{sentAt, idempotencyKey}` | MessagesService |
| `kv:command:interrupt` | invoke | `{sessionId, confirmToken}` | `{stoppedAt}` | MessagesService |
| `kv:command:messages` | invoke | `{sessionId, limit?}` | `{sessionID, limit, messages:Message[]}` (§4.3) | MessagesService |
| `kv:board:read` | invoke | `{}` | `{phase, nextID, rows:BoardRow[]}` (§4.4) | BoardService |
| `kv:board:write` | invoke | `{row, confirmToken}` | `{created, nextID, rows}` | BoardService |
| `kv:models:catalog` | invoke | `{}` | `{pool:Model[], live:Model[], guide}` (§4.2) | ModelService |
| `kv:models:assign` | invoke | `{sessionID, model, confirmToken}` | `{sessionID, model}` | ModelService |
| `kv:reports:list` | invoke | `{role?, taskId?, status?, limit?}` | `{reports:Report[]}` | ReportsService |
| `kv:settings:get` | invoke | `{}` | `Settings` (§4.5) | SettingsService |
| `kv:settings:set` | invoke | `{serverURL?, projectDir?, theme?, density?}` | `Settings` | SettingsService |
| `kv:secret:set` | invoke | `{password, confirmToken}` | `{secretState}` | SettingsService |
| `kv:secret:state` | invoke | `{}` | `{secretState}` | SettingsService |
| `kv:roster:read` | invoke | `{}` | `{entries, path}` | RosterService |
| `kv:roster:write` | invoke | `{entries, confirmToken}` | `{path, count}` | RosterService |
| `kv:memory:read` | invoke | `{scope?, kind?, role?, q?, limit?}` | `{entries, total, dir, scopes, kinds, flow}` (T4-3) | MemoryService |
| `kv:memory:write` | invoke | `{text, scope, kind, role?, tags?, weight?, confirmToken}` | `{entry, total, mdPath}` | MemoryService |
| `kv:memory:search` | invoke | `{q, scope?, limit?}` | `{q, count, entries}` | MemoryService |
| `kv:memory:context` | invoke | `{limit?, scope?}` | `{block, count, entries}` | MemoryService |
| `kv:project:list` | invoke | `{}` | `{activeId, activeDir, projects:Project[]}` | ProjectsService |
| `kv:project:create` | invoke | `{name, dir?, confirmToken}` | `{project, projects, activeId}` | ProjectsService |
| `kv:project:switch` | invoke | `{id, confirmToken}` | `{project, projects, activeId}` | ProjectsService |
| `kv:project:archive` | invoke | `{id, confirmToken}` | `{projects, activeId}` | ProjectsService |
| `kv:provider:list` | invoke | `{}` | `{providers, path, secretsPath, secretsEncrypted}` (maskeli) | ProvidersService |
| `kv:provider:save` | invoke | `{provider, confirmToken}` | `{provider, providers}` | ProvidersService |
| `kv:provider:keyAdd` | invoke | `{providerId, key, label?, confirmToken}` | `{key, providers}` | ProvidersService |
| `kv:provider:keyRemove` | invoke | `{providerId, keyId, confirmToken}` | `{providers}` | ProvidersService |
| `kv:provider:test` | invoke | `{providerId?, path?}` | `{providerId, keyId, mask, attempts[], body}` \| `E_RATE_LIMIT` | ProvidersService |
| `kv:provider:failover` | invoke | `{providerId?, path?}` | `{providerId, keyId, mask, attempts[]}` | ProvidersService |
| `kv:skill:list` | invoke | `{}` | `{skills, total, enabled, path}` | SkillsService |
| `kv:skill:save` | invoke | `{id?, name?, description?, instructions?, scope?, enabled?, confirmToken}` | `{skill, skills}` | SkillsService |
| `kv:skill:remove` | invoke | `{id, confirmToken}` | `{removed, skills}` | SkillsService |
| `kv:permission:get` | invoke | `{}` | `{matrix, roles, capabilities, path, stored}` | PermissionsService |
| `kv:permission:set` | invoke | `{matrix}` \| `{role, capability, value}`, `confirmToken` | `{matrix, roles, capabilities}` | PermissionsService |
| `kv:browser:open` | invoke | `{url, bounds:{x,y,width,height}}` | `{open, url, title, canGoBack, canGoForward, loading}` | BrowserService |
| `kv:browser:navigate` | invoke | `{url?, action?:'back'\|'forward'\|'reload', bounds?}` | aynı | BrowserService |
| `kv:browser:history` | invoke | `{action, bounds?}` | aynı | BrowserService |
| `kv:browser:close` | invoke | `{}` | `{open:false}` | BrowserService |
| `kv:browser:state` | invoke | `{}` | `{open, url, title, …}` | BrowserService |
| `kv:browser:extract` | invoke | `{limit?}` | `{title, url, text, truncated, links[], headings[]}` (T5-1: ajan sayfa okur) | BrowserService |
| `kv:chat:list` | invoke | `{role?}` | `{conversations, total, path, roleFilter}` (T5-2) | ChatService |
| `kv:chat:get` | invoke | `{id}` | `{conversation, messages, total}` | ChatService |
| `kv:chat:create` | invoke | `{role?, model?, providerId?, title?, confirmToken}` | `{conversation, conversations}` | ChatService |
| `kv:chat:send` | invoke | `{conversationId?, text, role?, model?, providerId?, temperature?, confirmToken}` | `{conversation, userMessage, message, attempts[], mask, model, latency}` \| `E_RATE_LIMIT` | ChatService |
| `kv:chat:rename` | invoke | `{id, title, confirmToken}` | `{conversation}` | ChatService |
| `kv:chat:remove` | invoke | `{id, confirmToken}` | `{removed, conversations}` | ChatService |
| `kv:chat:preview` | invoke | `{role?}` | `{block, memory, skills, permissions}` (sisteme giden bağlam) | ChatService |
| `kv:remote:state` | invoke | `{}` | `{running, port, addresses[], urls[], pairUrl, token, tokenMask, clients, requests, lastError}` (T5-4) | RemoteService |
| `kv:remote:start` | invoke | `{port?, confirmToken}` | aynı | RemoteService |
| `kv:remote:stop` | invoke | `{confirmToken}` | aynı | RemoteService |
| `kv:remote:rotate` | invoke | `{confirmToken}` | aynı (yeni eşleşme kodu) | RemoteService |
| `kv:guide:state` | invoke | `{}` | `{onboarded, step, steps[], skipped, completedAt, updatedAt, total, path}` (T6-1) | GuideService |
| `kv:guide:update` | invoke | `{step?, onboarded?, skipped?, reset?, confirmToken}` | aynı | GuideService |
| `kv:server:status` | invoke | `{probe?}` | `{running, connected, mode, url, host, port, latencyMs, version, error, hint, canStart, opencodeBin}` (T6-6) | ServerManager |
| `kv:server:start` | invoke | `{confirmToken}` | `{running, connected, mode, url, port, pid?, version?, error?, hint}` | ServerManager |
| `kv:server:stop` | invoke | `{confirmToken}` | aynı (`running:false`) | ServerManager |
| `kv:browser:summarize` | invoke | `{text?, limit?, engine?:'auto'\|'model'}` | `{title, url, summary, points[], keywords[], chars, engine:'heuristic'\|'model', modelError?}` (T6-3) | SummarizeService |
| `kv:memory:auto` | invoke | `{text, source?, role?, scope?}` | `{entries[], count, total, skipped}` (T6-4, append-only) | MemoryService |
| `kv:memory:graph` | invoke | `{limit?}` | `{nodes[], edges[], total, byScope, byKind}` (T6-4, deterministik) | MemoryService |
| `kv:voice:ask` | invoke | `{question}` | `{answer, intent, at, data:{…}}` (T6-8) | VoiceService |
| `kv:voice:speak` | invoke | `{text, voice?, model?}` | `{base64, mime, bytes, model, mask, attempts}` (T9-2) | ProvidersService (TTS) |
| `kv:voice:transcribe` | invoke | `{base64, mime?, language?, model?}` | `{text, model, mask, empty, attempts}` (T9-2) | ProvidersService (STT) |
| `kv:votion:act` | invoke | `{action, app?, root?, path?, from?, to?, steps?, limit?, confirmToken?}` | `{…eyleme özel}` (T8-2) | VotionActions |
| `kv:teams:list` | invoke | `{}` | `{teams[], activeId, active, totals, roles[], available}` (T8-5) | TeamsService |
| `kv:teams:act` | invoke | `{action, id?, name?, role?, code?, model?, tokens?, limitTokens?, force?, confirmToken}` | `{team?, assignments?, reused?, activeId?, spentTokens?, over?}` (T8-5) | TeamsService |
| `kv:plan:list` | invoke | `{teamId?}` | `{plans[], notes[], schedules[], tasks[], counts, kinds[], statuses[]}` (T8-6) | PlannerService |
| `kv:plan:act` | invoke | `{action, id?, teamId?, title?, body?, text?, status?, kind?, time?, weekdays?, once?, prompt?, role?, enabled?, confirmToken}` | `{plan?, note?, schedule?, task?, id?, archived?}` (T8-6) | PlannerService |
| `kv:files:list` | invoke | `{path?, limit?}` | `{root, dir, rel, parent, entries[], total, truncated}` (T8-7) | FilesService |
| `kv:files:read` | invoke | `{path}` | `{path, rel, name, size, ext, binary, text, truncated, lines}` (T8-7) | FilesService |
| `kv:files:context` | invoke | `{paths[], query?, maxChars?}` | `{files[], skipped[], memoryCount, chars, truncated, block}` (T8-7) | FilesService |
| `kv:models:list` | invoke | `{}` | `{runtime:{kind,state}, roots[], disk:{root,freeBytes,totalBytes}, jobs[], models[]}` (T11-1, API-51h) | ModelsStore |
| `kv:models:dir` | invoke | `{purpose:'models'}` | `{path}` — native klasör seçici; iptalde `path:null` (T11-1) | ModelsStore |
| `kv:models:install` | invoke | `{modelID, targetDir, confirmToken}` | `{jobId, state:'queued'}` (T11-1, API-51f/g) | ModelsStore |
| `kv:models:cancel` | invoke | `{jobId, confirmToken}` | `{jobId, state:'cancelled', receivedBytes}` (T11-1) | ModelsStore |
| `kv:models:verify` | invoke | `{modelID}` | `{verified, sha256, sizeBytes, elapsedMs}` (T11-1) | ModelsStore |
| `kv:models:remove` | invoke | `{modelID, confirmToken}` | `{removed, freedBytes}` (T11-1) | ModelsStore |
| `kv:audit:list` | invoke | `{limit?, op?, since?}` | `{entries[], total, truncated}` — yalnız üst veri (API-30) | AuditLog |
| `kv:mcp:list` | invoke | `{}` | `{servers:[{id,name,transport,state,toolCount,lastError,pid}], configPath, version}` (T12-1) | McpRegistry |
| `kv:mcp:add` | invoke | `{id,name,transport:'stdio'\|'http',command?,args?,url?,envRecord?,confirmToken}` | `{id,state}` (T12-1, API-51j) | McpRegistry |
| `kv:mcp:remove` | invoke | `{id,confirmToken}` | `{id,removed:true}` (T12-1) | McpRegistry |
| `kv:mcp:connect` | invoke | `{id}` | `{id,state,tools:[{name,description,inputSchema}]}` (T12-1) | McpRegistry |
| `kv:mcp:tools` | invoke | `{id}` | `{id,tools:[{name,description,inputSchema}]}` (T12-1) | McpRegistry |
| `kv:mcp:call` | invoke | `{id,tool,args?}` | `{id,tool,result:{content,isError}}` (T12-1, API-51k) | McpRegistry |
| `kv:integration:list` | invoke | `{}` | `{catalog:[...], accounts:[{id,providerId,label,state,scopes,lastTestAt}], catalogPath}` (T12-2) | IntegrationsService |
| `kv:integration:save` | invoke | `{providerId,label,token?,fields?,confirmToken}` | `{id,state}` (T12-2, API-51j) | IntegrationsService |
| `kv:integration:remove` | invoke | `{id,confirmToken}` | `{id,removed:true}` (T12-2) | IntegrationsService |
| `kv:integration:test` | invoke | `{id}` | `{id,state,latencyMs,detail}` (T12-2) | IntegrationsService |
| `kv:integration:capabilities` | invoke | `{providerId}` | `{providerId,capabilities:[{id,verb,path,summary}]}` (T12-2) | IntegrationsService |
| `kv:integration:invoke` | invoke | `{id,capability,params?}` | `{ok,status,data}` (T12-2, API-51k) | IntegrationsService |
| `kv:mcp-catalog:list` | invoke | `{category?, q?, installed?}` | `{items:[{id,name,vendor,category,transport,toolsHint,docs,installed,updateAvailable,envKeys[]}], total, catalogVersion}` (T13-2, §7.10) | McpCatalog |
| `kv:mcp-catalog:install` | invoke | `{catalogId, id?, env?, confirmToken}` | `{id, state:'stopped', installedFrom:{catalogId, catalogVersion}}` (T13-2, API-51l) | McpCatalog → McpRegistry |
| `kv:oauth:start` | invoke | `{providerId, label?, scopes?, confirmToken}` | `{flowId, providerId, state:'pending', startedAt, expiresAt}` — **`state`/`code`/token dönmez** (T13-1, §7.9) | IntegrationsService |
| `kv:oauth:status` | invoke | `{providerId?, accountId?}` | `{accounts:[{id,providerId,label,state,scopes[],expiresAt,lastRefreshAt}], flows:[{flowId,providerId,state,startedAt,expiresAt}]}` — sır yok (T13-1) | IntegrationsService |
| `kv:oauth:revoke` | invoke | `{accountId?, flowId?, confirmToken}` | `{accountId, state:'revoked', remoteRevoked:boolean}` (T13-1, API-51l) | IntegrationsService |
| `kv:preset:list` | invoke | `{kind?, category?, q?, ready?}` | `{presets:[{id,kind,refId,name,vendor,category,authMode,summary,logoHint,ready,state,requiredFields[{key,label,secret}],scopes[],docsUrl}], total, presetVersion, categories[]}` — **sır yok** (T14-1, §7.11) | PresetService |
| `kv:preset:apply` | invoke | `{presetId, values?, confirmToken}` | `{presetId, kind, refId, state:'connected'\|'installed', accountId?, serverId?, missing[]}` — `values` **dönmez** (T14-1, §7.11, API-51m) | PresetService → IntegrationsService / McpCatalog |
| `kv:votion:tools` | invoke | `{include?:'all'\|'ready'}` | `{integrations:[{id,name,category,capabilities[{id,summary,verb,params}]}], mcp:[{id,name,tools}], presetsReady, counts, truncated, bytes}` (T14-2, §7.12) | VotionTools |
| `kv:votion:invoke` | invoke | `{capabilityId, params?, confirmToken}` | `{capabilityId, kind, ok, status, result, latencyMs, auditId}` — `params` **dönmez** (T14-2, §7.12, API-51m) | VotionTools → IntegrationsService / McpRegistry |
| `kv:event:subscribe` | invoke | `{}` | `{subscribed, types[]}` | EventBus |
| `kv:event:patch` | **push** | — | `{type, data:{sessionID}, domain, seq, at, payload?}` (API-104) | EventBus |
| `kv:event:connection` | **push** | — | `{type:"connection.state", state:"connecting"\|"connected"\|"offline"\|"unauthorized", data:{sessionID}, at}` | EventBus |
| `kv:event:model` | **push** | — | `{type:'model.progress'\|'model.done'\|'model.failed', jobId, modelID, state, receivedBytes, totalBytes, percent, etaSec, at}` (T11-1) | ModelsStore |
| `kv:event:mcp` | **push** | — | `{type:'state'\|'log'\|'tools', id, state?, line?, tools?}` (T12-1) | McpRegistry |
| `kv:event:integration` | **push** | — | `{type:'state'\|'log', id, state?, message?}` (T12-2) | IntegrationsService |

> **Notlar (v3.2):** (1) Tur 10/T-090: `kv:reports:list` yanıtına `leaderCycles[]` **ek alanı** eklendi (`.team/log/decisions.md` türevi); yeni kanal açılmadı. (2) Tur 11/T-103: `kv:models:*` yerel dosya kanalları eklendi — ayrıntı §7.5. (3) Tur 12/T-118: MCP + entegrasyon kanalları eklendi — ayrıntı §7.6. (4) Tur 13/T-134: `mcp-catalog` (2) + `oauth` (3) eklendi — ayrıntı §7.9, §7.10. (5) **Tur 14/T-143:** kanal sayısı **109** (**104 invoke + 5 push**), yazma **44**, domain **31**; `preset` (2) + `votion` (2) eklendi — ayrıntı **§7.11, §7.12**. **Push kanalı sayısı 5'te sabittir**: preset/Votion durumu push ile değil `kv:preset:list` / `kv:votion:tools` yoklamasıyla okunur. Tarihsel: v3.1'de 105 kanal (100 invoke + 5 push) / 42 yazma; v3.0'da 100 (95 + 5) / 39; v2.9'da 86 (83 + 3) / 35.

| # | Kural |
|---|---|
| API-51a | **Yazma kanalı kümesi 45'tir (v3.3, `WRITE_CHANNELS`):** Tur 1-3'ün 9'u (`kv:team:add`, `kv:team:remove`, `kv:team:setLeader`, `kv:command:send`, `kv:command:interrupt`, `kv:board:write`, `kv:models:assign`, `kv:secret:set`, `kv:roster:write`) + Tur 4'ün 10'u (`kv:memory:write`, `kv:project:create`, `kv:project:switch`, `kv:project:archive`, `kv:provider:save`, `kv:provider:keyAdd`, `kv:provider:keyRemove`, `kv:skill:save`, `kv:skill:remove`, `kv:permission:set`) + Tur 5'in 7'si (`kv:chat:create`, `kv:chat:send`, `kv:chat:rename`, `kv:chat:remove`, `kv:remote:start`, `kv:remote:stop`, `kv:remote:rotate`) + Tur 6'nın 3'ü (`kv:guide:update`, `kv:server:start`, `kv:server:stop`) + Tur 8'in 3'ü (`kv:votion:act`, `kv:teams:act`, `kv:plan:act`) + Tur 11'in 3'ü (`kv:models:install`, `kv:models:cancel`, `kv:models:remove`) + Tur 12'nin 4'ü (`kv:mcp:add`, `kv:mcp:remove`, `kv:integration:save`, `kv:integration:remove`) + Tur 13'ün 3'ü (`kv:mcp-catalog:install`, `kv:oauth:start`, `kv:oauth:revoke`) + **Tur 14'ün 2'si** (`kv:preset:apply`, `kv:votion:invoke`) + **T-205'in 1'i** (`kv:team:apply`). Toplam **9 + 10 + 7 + 3 + 3 + 3 + 4 + 3 + 2 + 1 = 45**. **Tamamı `confirmToken` ZORUNLU ister** (API-41); tokensız çağrı `E_CONFIRM_REQUIRED` + `detail:"rule:missing"`, aynı token ikinci kez `detail:"rule:reuse"` döner ve istek **diske/sunucuya gitmez**. **Tur 12 gerekçesi:** dördü de disk yazar (`.keyvotion/mcp.json`, `.keyvotion/integrations.json`). **Tur 13 gerekçesi:** `mcp-catalog:install` diske yazar; `oauth:start` harici tarayıcı açar + loopback dinleyici bağlar + token yazar; `oauth:revoke` token siler ve sağlayıcıya iptal çağrısı yapar. **Tur 14 gerekçesi:** `preset:apply` bağlantı **kurar** (token/sır diske şifreli yazar, MCP kaydı ekler, gerekirse OAuth akışı açar) — geri alınamaz dış etki; `votion:invoke` **dış etkili** çağrı yapar (REST/MCP) ve her çağrı audit'e yazılır. |
| API-51e | **`kv:votion:act` eylem kapısı (v2.6):** tek kanal, iki kapı. `move`, `trash`, `browser` → `confirmToken` **zorunlu** (`E_CONFIRM_REQUIRED`). `list`, `listFiles`, `screenshot`, `openApp`, `log` → onaysız çağrılabilir **ama** yalnız beyaz liste ve izinli kökler içinde çalışır. Serbest kabuk komutu, serbest yol ve serbest JavaScript **yoktur**; ihlal `E_FORBIDDEN`. |
| API-51d | **Yazma kapısı DIŞINDA kalanlar (gerekçeli):** `settings:set` (API-105 muafiyeti), `provider:test` ve `provider:failover` (yalnız ağ çağrısı, disk yazmaz), `browser:*` ve `browser:summarize` (yalnız görünüm yönetimi / salt okuma), `chat:list` / `chat:get` / `chat:preview`, `remote:state`, `guide:state`, `server:status`, `voice:ask`, `voice:speak`, `voice:transcribe` (yalnız ağ çağrısı; disk yazmaz), `memory:graph` (yalnız okuma), `memory:auto` (yalnız append-only otomatik çıkarım — silme/üzerine yazma yok; LDR+ARC kararı, v2.5), **`models:list`, `models:dir`, `models:verify`, `audit:list` (v2.9 — yalnız okuma; `models:install`/`cancel`/`remove` kapı içindedir)**, **`mcp:list`, `mcp:connect`, `mcp:tools`, `integration:list`, `integration:test`, `integration:capabilities` (v3.0 — yalnız okuma/bağlantı denemesi; `mcp:add`/`remove`, `integration:save`/`remove` kapı içindedir; `mcp:call`/`integration:invoke` yazma sayılmaz ama API-51k dış-etki kapısına tabidir)**, **`mcp-catalog:list`, `oauth:status` (v3.1 — yalnız okuma; `mcp-catalog:install`, `oauth:start`, `oauth:revoke` kapı içindedir)**, **`preset:list`, `votion:tools` (v3.2 - yalnız okuma; `preset:apply`, `votion:invoke` kapı içindedir)**, **`team:plan` (v3.3 - yalnız model çağrısı; `team:apply` kapı içindedir)**. Bu kanallar `WRITE_CHANNELS`'a **girmez**; giriş yaparsa API-51a ihlali olur. |
| API-51f | **(T11-1) Yerel model yazma kapısı (v2.9):** `kv:models:install`, `kv:models:cancel`, `kv:models:remove` **`confirmToken` zorunludur** (API-41). Tokensız → `E_CONFIRM_REQUIRED` + `detail:"rule:missing"`; aynı token ikinci kez → `detail:"rule:reuse"`; **istek diske yazmaz, ağa çıkmaz, süreç başlatmaz**. `targetDir` mutlak olmalı; sistem kökleri (`C:\Windows`, `C:\Program Files*`), symlink/junction ile kök dışına çıkış ve yazma izni olmayan yol → `E_FORBIDDEN`. Eşzamanlı **tek** indirme işi (`jobs` kuyruğu seri). |
| API-51g | **(T11-1) İndirme güvenliği (v2.9):** indirme adresi **kullanıcıdan gelmez**; denetimli katalog `work/models.catalog.json` (`id, name, sizeBytes, sha256, url, license, runtime`) tek kaynaktır ve ARC onayıyla sürümlenir. Kurallar: (a) yalnız `https:`; (b) host **beyaz listesi** (katalogda tanımlı), her istekte denetlenir; (c) yönlendirme **en fazla 3**, her adımda host **yeniden** denetlenir; (d) `content-length` katalog `sizeBytes` ile **±%2** uyuşmazsa iptal (`E_HASH_MISMATCH` yerine `E_NETWORK` — boyut uyuşmazlığı); (e) `Authorization`/`Bearer` **gönderilmez** (yalnız kamuya açık modeller, sır yok); (f) audit'e **URL değil `modelID`** yazılır; (g) dosya `.part` uzantısıyla yazılır, `sha256` eşleşince **atomik rename** ile `ready` olur; eşleşmezse `failed` + `.part` korunur. |
| API-51h | **(T11-1) Model durum sözlüğü (v2.9):** `absent \| queued \| downloading \| verifying \| ready \| failed \| paused`. Tek doğru kaynak `kv:models:list` (`models[].state`, `jobs[].state`) ve push `kv:event:model`. İlk dilimde **yerel çıkarım yoktur**: `runtime:{kind:'none', state:'absent'}` dürüst değerdir; "çalışıyor/boşta" alanı uydurulmaz. `etaSec` yalnız son 5 sn'lik ölçülmüş hızla hesaplanır; örnek <3 ise `null` (arayüz "hesaplanıyor" der). |
| API-51i | **(T11-1) `kv:app:info` sözleşme alanı (v2.9, opsiyonel):** çıktıya `contract:{apiVersion, channels, writeChannels}` **ek alanı** eklenebilir. Ek alan olduğu için kırıcı değildir; Yönetim Merkezi'nin canlı sözleşme sayacını besler ve sapmayı görünür kılar (API-54: bilinmeyen **girdi** alanı hatadır; çıktıda ek alan serbesttir). |
| API-51j | **(T12-1/T12-2) Bağlantı katmanı yazma kapısı (v3.0):** `kv:mcp:add`, `kv:mcp:remove`, `kv:integration:save`, `kv:integration:remove` **`confirmToken` zorunludur** (API-41). Tokensız → `E_CONFIRM_REQUIRED` + `detail:\"rule:missing\"`; aynı token ikinci kez → `detail:\"rule:reuse\"`; **istek diske yazmaz, ağa çıkmaz, süreç başlatmaz**. Disk yazımı **atomiktir** (`.tmp` + `rename`). `mcp:add`: `id` tekil + `/^[a-z0-9][a-z0-9-]{1,31}$/`; `stdio` ise `command` zorunlu, `http` ise `url` **https** zorunlu (tek istisna `allowInsecureLoopback` + `127.0.0.1`). `integration:save`: katalogda `providerId` yoksa `E_NOT_FOUND`; token **safeStorage.encryptString** ile şifrelenir; `safeStorage` yoksa düz metin fallback **YOK** → `E_FORBIDDEN`. |
| API-51k | **(T12-1/T12-2) Dış etkili çağrı kapısı (v3.0):** `kv:mcp:call` ve `kv:integration:invoke` **yazma kümesinde değildir** (disk yazmaz) ama **dış etkili**dir: renderer'da onay diyaloğu ister ve gövde denetiminden geçer. `mcp:call` argümanı **1 MB** üstü, yanıtı **4 MB** üstü → `E_BAD_REQUEST`. `integration:invoke`: `capability` katalogda tanımlı olmalı; `params` şema denetimi; istek **yalnız katalogda yazılı host**'a (host beyaz listesi katalogda), `https` zorunlu; `Authorization` başlığı token'dan üretilir, **hiçbir yere loglanmaz**. İkisinde de API-30 geçerlidir. |
| API-51l | **(T13-1/T13-2) OAuth2 + MCP kataloğu yazma kapısı (v3.1):** `kv:oauth:start`, `kv:oauth:revoke`, `kv:mcp-catalog:install` **`confirmToken` zorunludur** (API-41). Tokensız → `E_CONFIRM_REQUIRED` + `detail:"rule:missing"`; aynı token ikinci kez → `detail:"rule:reuse"`; **istek tarayıcı açmaz, dinleyici bağlamaz, diske yazmaz, sağlayıcıya gitmez**. `oauth:start` yalnız `auth.kind="oauth2"` sağlayıcıda çalışır; `state`/`verifier`/`code` **renderer'a dönmez** (§7.9.5). `oauth:revoke` sağlayıcı çağrısı 8 sn'de kesilir; kesilirse `remoteRevoked:false` (sessiz başarı yok). `mcp-catalog:install` registry'yi atlamaz: aynı atomik yazım, aynı `id` doğrulaması, `E_CONFLICT` üzerine yazma yok, **süreç başlatmaz** (§7.10.3). |
| API-59 | **(T5-2) Doğrudan model sohbeti:** `kv:chat:send`, sağlayıcının `/chat/completions` ucuna gider; yerel OpenCode sunucusuna **bağımlı değildir**. Sistem istemi şu sırayla kurulur: rol personası → proje adı → paylaşılan hafıza (`kv:memory:context`, `scope=user` önce) → etkin beceriler → rolün izin satırı. Kullanıcı mesajı **ağ çağrısından önce** diske yazılır; çağrı başarısız olursa mesaj kaybolmaz. Çoklu anahtar failover API-51b ile aynıdır. Yanıtta anahtar değeri yoktur, yalnız `mask`. |
| API-60 | **(T5-4) Telefondan erişim:** `RemoteService` yalnız `node:http` kullanır (yeni bağımlılık yok). Kurallar: (a) yalnız **özel ağ** kaynaklı istekler (`10/8`, `127/8`, `192.168/16`, `172.16/12`, `169.254/16`, `::1`); genel IP → `403`; (b) `/api/*` için `x-kv-token` **zorunlu** — eksik/yanlış → `401`; sabit zamanlı karşılaştırma; (c) gövde sınırı 64 KB, IP başına 60 istek/dk → aşımda `429`; (d) `/api/health` jetonsuz ve yalnız "açık mı" bilgisini verir; (e) dosya sunumu yoktur — yalnız tek HTML sayfası + `/api/state`, `/api/send`, `/api/new`; (f) eşleşme kodu `remote.json` içinde `mode 0600` yazılır; **uzak HTTP yanıtlarında ve loglarda** tam kod görünmez (`tokenMask`) — kodu yalnız eşleştirme ekranı (`kv:remote:state`) gösterir. |
| API-61 | **(T5-1) Tarayıcıdan sayfa okuma:** `kv:browser:extract` main prosesdeki gerçek sayfada `executeJavaScript` çalıştırır; renderer'a **ağ erişimi açmaz** (`connect-src 'none'` korunur). Gezinme yalnız `http:`/`https:`; `file:`, `javascript:`, `data:` reddedilir (`E_BAD_REQUEST`). |
| API-51b | **(T4-6) Çoklu anahtar failover:** `kv:provider:test` anahtar öncelik listesini sırayla dener. `429`, kota, `401`, `403` ve `5xx` → **sıradaki sağlıklı anahtara geç**, isteği **bir kez** tekrar et. Her deneme `audit`'e yazılır: maskeli kimlik + neden + sonuç + gecikme. Tüm anahtarlar tükenirse `E_RATE_LIMIT` + `detail.tried[]` + `detail.attempts[]`. **Anahtar değeri hiçbir yanıtta/hatada/logda görünmez** (API-03); yalnız `mask` (`sk-…9f2a`). Anahtar başına sağlık durumu (`ok`/`cooldown`, 60 sn) bellekte tutulur. |
| API-51c | **(T4-3) Hafıza:** `scope ∈ user\|team\|project`, `kind ∈ preference\|decision\|fact\|correction`. `scope=user` kayıtları `kv:memory:context` çıktısında **önce** gelir. Kaynak `memory.jsonl` (append-only), ayna `memory.md`. |
| API-52 | `kv:secret:set` girdisi **tek veri alanı** taşır (`password`); `confirmToken` (API-51a) **protokol alanıdır**, veri sayılmaz ve audit'e yazılmaz. Yanıt parolayı asla geri döndürmez, yalnız `secretState`. Aynı kural `kv:provider:keyAdd` için geçerlidir: anahtar değeri yalnız `keys.bin` (DPAPI) içinde yaşar. |
| API-53 | `kv:settings:get` yanıtında parola alanı **yoktur** (yalnız `secretState`). `kv:provider:list` da anahtar **değeri** döndürmez, yalnız `mask`. |
| API-54 | Bilinmeyen girdi alanı sessizce atılmaz: şema dışı alan varsa `E_BAD_REQUEST` döner. |
| API-55 | Her `invoke` 10 sn'de zaman aşımına uğrar → `E_TIMEOUT`; `kv:provider:test`, `kv:provider:failover`, `kv:browser:*` (ve `kv:browser:summarize`), `kv:remote:start`, `kv:remote:stop`, `kv:votion:act` ve `kv:mcp:connect` 30 sn, `kv:chat:send`, `kv:voice:ask`, `kv:voice:speak`, `kv:voice:transcribe`, `kv:mcp:call`, `kv:integration:invoke` ve `kv:integration:test` 130 sn kullanır (model/uzak yanıt uzun sürebilir; §7.6.6). **v3.1:** `kv:oauth:start` **130 sn** (kullanıcı harici tarayıcıda onay verir; callback dinleyicisi 120 sn'de kapanır, kalan 10 sn raporlama payıdır — §7.9.6); `kv:mcp-catalog:install` 30 sn (atomik dosya yazımı); `kv:mcp-catalog:list`, `kv:oauth:status`, `kv:oauth:revoke` 10 sn (`revoke` sağlayıcı çağrısı 8 sn ile sınırlıdır, aşılırsa yalnız yerel silme yapılır ve `remoteRevoked:false` döner). |

### 7.3 Dönüş şeması (tek zarf — §5.1 ile aynı)

```jsonc
// başarı
{ "ok": true, "data": { /* kanal tablosundaki çıktı */ } }
// hata
{ "ok": false, "error": { "code": "E_BUSY", "message": "Seans meşgul.",
                          "status": 409, "retryable": false, "detail": null } }
```

| # | Kural |
|---|---|
| API-56 | Preload, main'den gelen her yanıtı zarf şemasına göre doğrular; şema dışıysa `E_INTERNAL` üretir (renderer'a ham nesne geçmez). |
| API-57 | Push mesajları da zarf taşır ve artan `seq` içerir; renderer `seq` küçük/eşitse yok sayar (API-34). |
| API-58 | Kanallar sürümlenmez; kırıcı değişiklik yeni kanal adı açar (`kv:team:list2` değil → ARC onayı + yeni sürüm sözleşme). |

### 7.4 K2 denetim komutları (IPC)

| # | Denetim | Beklenen |
|---|---|---|
| I1 | `Select-String -Path src -Pattern '"kv:'` | yalnız `src/shared/ipc-channels.js` |
| I2 | `Select-String -Path src/shared/ipc-channels.js -Pattern 'kv:[a-z]+:[a-z-]+"'` | her kanal API-47 kuralına uyar |
| I3 | `Select-String -Path src/renderer -Pattern 'ipcRenderer\|require\(.electron'` | 0 eşleşme |
| I4 | `Select-String -Path src/preload -Pattern 'invoke\(channel'` | kanal beyaz listesi kontrolü var |

### 7.5 Yerel model yönetimi — tam şema (v2.9, T11-1)

**Kapsam:** indirme/kurulum envanteri. **Yerel çıkarım (inference) bu sürümün kapsamı dışındadır**; `runtime` alanı bugün `{kind:'none', state:'absent'}` döner.

**1) `kv:models:list`** — girdi `{}` (şema dışı alan → `E_BAD_REQUEST`, API-54). Çıktı:

```jsonc
{
  "runtime": { "kind": "none", "state": "absent" },   // 'none' | 'ollama' | 'llama.cpp' (bu turda yalnız 'none')
  "roots": [{ "path": "C:\\Users\\…\\Keyvotion\\models", "exists": true, "writable": true }],
  "disk": { "root": "C:\\…", "freeBytes": 214748364800, "totalBytes": 512000000000 },
  "jobs": [{ "jobId": "j-7f3a", "modelID": "…", "state": "downloading",
             "receivedBytes": 12345678, "totalBytes": 4700000000, "percent": 0.26,
             "etaSec": 412, "targetDir": "…", "startedAt": "…", "error": null }],
  "models": [{ "modelID": "…", "name": "…", "state": "ready", "sizeBytes": 4700000000,
               "sha256": "…", "verified": true, "targetDir": "…", "license": "…", "runtime": "none" }]
}
```

**2) `kv:models:dir`** — girdi `{purpose:'models'}`; native klasör seçici açar. İptalde `{path:null}` (**hata değil**). Kalıcı ayar yazmaz: seçilen yol yalnız `install` çağrısına parametre olarak gider (T-101 envanterindeki `MODELS_DIR_SET` ihtiyacı bu yüzden **düştü**).

**3) `kv:models:install`** — girdi `{modelID, targetDir, confirmToken}`. Doğrulama sırası: (1) `confirmToken`, (2) katalogda `modelID` var mı, (3) `targetDir` mutlak + politika içi mi, (4) boş alan ≥ `sizeBytes × 1.2`, (5) kuyruk. Çıktı `{jobId, state:'queued'}` — **indirme bu çağrıda bitmez**; ilerleme push ile gelir.

**4) `kv:models:cancel`** — girdi `{jobId, confirmToken}`. `AbortController.abort()`; `.part` **silinmez** (devam ettirilebilir). Çıktı `{jobId, state:'cancelled', receivedBytes}`. Duraklat için **ayrı kanal yoktur**: `cancel` + yeniden `install` (`Range` desteklenirse kaldığı yerden, aksi hâlde baştan).

**5) `kv:models:verify`** — girdi `{modelID}`; diskteki dosyayı yeniden hash'ler. Çıktı `{verified, sha256, sizeBytes, elapsedMs}`. `ready` durumu **yalnız** `verified:true` ile verilir; katalogda `sha256` yoksa `verified:false, sha256:null` (otomatik yüklenmez).

**6) `kv:models:remove`** — girdi `{modelID, confirmToken}`; dosyayı **kalıcı** siler (geri dönüşüm kutusu yok — yol kullanıcıya onay metninde yazılır). Çıktı `{removed, freedBytes}`.

**7) `kv:audit:list`** — girdi `{limit?, op?, since?}` (varsayılan 200, üst sınır 500). Çıktı `{entries[], total, truncated}`; her giriş `{at, op, code, target, status, idempotencyKey}`. **API-30:** emir/rapor metni ve sır zaten yazılmaz; bu kanal onları geri getiremez.

**8) `kv:event:model` (push)** — `{type:'model.progress'|'model.done'|'model.failed', jobId, modelID, state, receivedBytes, totalBytes, percent, etaSec, at}`. **Sıklık ≤4/sn** (250 ms); `receivedBytes` tek kaynak, `percent` türevdir. Renderer yeniden yüklendiyse 5 sn'de bir `kv:models:list` ile uzlaştırma yapılır (push kaçarsa durum kaybolmaz).

**Hata kodları (tamamı):** `E_NOT_FOUND` (katalogda/model yok) · `E_FORBIDDEN` (hedef klasör politikası, symlink kaçışı) · `E_DISK_FULL` (boş alan < `sizeBytes × 1.2`) · `E_NETWORK` (bağlantı, host beyaz listesi, `content-length` ±%2 sapması, yönlendirme >3) · `E_TIMEOUT` (60 sn bayt gelmedi) · `E_HASH_MISMATCH` (sha256 tutmadı) · `E_CANCELLED` (kullanıcı iptali) · `E_CONFIRM_REQUIRED` (API-41) · `E_BAD_REQUEST` (şema dışı alan, geçersiz `targetDir`) · `E_PARSE` (katalog okunamadı).

**Zaman aşımları (API-55 uzantısı):** `kv:models:install/cancel/remove` ve `kv:models:verify` çağrının **kendisi** 30 sn içinde döner (indirme arka planda sürer); `kv:models:list` 10 sn; `kv:models:dir` 130 sn (kullanıcı diyalogu bekler).

**Audit (API-30):** `install` → `{op:'model.install', target:modelID}`; `cancel` → `{op:'model.cancel', target:modelID}`; `remove` → `{op:'model.remove', target:modelID}`. **URL, tam dosya yolu ve sha256 değeri audit'e yazılmaz** (yalnız `modelID` + sonuç).

### 7.6 Bağlantı katmanı — MCP + entegrasyon semantiği (v3.0, T12-1/T12-2)

**Kapsam:** MCP istemcisi (gerçek JSON-RPC 2.0, `stdio` + `http`) ve entegrasyon kayıt defteri
(gerçek REST, `safeStorage` ile şifreli token). Ağ **yalnız main** prosesinde çalışır; renderer
CSP `connect-src 'none'` **değişmez**.

#### 7.6.1 Veri dosyaları

| Dosya | İçerik | Kural |
|---|---|---|
| `.keyvotion/mcp.json` | `{version:1, servers:[{id,name,transport,command,args,url,envKeys,createdAt,installedFrom?}]}` | **Sır yok**; env yalnız **ad** listesi (`envKeys`), değer taşınmaz. `installedFrom` = `{catalogId, catalogVersion, snapshotSha}` — yalnız katalogdan kurulanlarda (§7.10.5) |
| `.keyvotion/integrations.json` | `{version:1, accounts:[{id,providerId,label,tokenCipher,fieldsCipher,oauth?,createdAt,lastTestAt}]}` | Token **safeStorage** ile şifreli (base64); düz metin fallback **yok**. `oauth` = `{scopes[], tokenCipher, refreshCipher, expiresAt, tokenType}` — **yalnız** `auth.kind="oauth2"` hesaplarında (§7.9) |
| `src/main/services/integration-catalog.json` | **64 sağlayıcı** (v3.1), **≥192 yetenek** (sağlayıcı başına **≥3**); `auth.kind ∈ bearer\|apiKey\|basic\|oauth2\|none` | Ürün verisi; kullanıcı **yazamaz**. `hosts[]` = host beyaz listesi (§7.6.5/6) |
| `src/main/services/mcp-catalog.json` | **60 MCP sunucu şablonu** — `{version:1, servers:[{id,name,vendor,category,transport,command?,args?,url?,envKeys?,toolsHint,docs}]}` | Ürün verisi; kullanıcı **yazamaz**; kurulum **kopyalar**, şablon **canlı bağlantı değildir** (§7.10) |

`.keyvotion/` **git'e girmez**. `list` yanıtında `token`, `tokenCipher`, `fieldsCipher` alanı
**yoktur** (API-30).

#### 7.6.2 Durum sözlükleri

| Alan | Değerler |
|---|---|
| MCP `state` | `stopped` \| `starting` \| `ready` \| `error` |
| Entegrasyon `state` | `connected` \| `degraded` \| `error` \| `untested` \| **`expired`** (v3.1 — OAuth refresh reddedildi; "Yeniden bağlan" gerekir) |
| OAuth hesap `state` | `untested` \| `pending` \| `connected` \| `expired` \| `revoked` \| `error` (§7.9.3) |
| MCP `transport` | `stdio` \| `http` |
| Push `kv:event:mcp` `type` | `state` \| `log` \| `tools` |
| Push `kv:event:integration` `type` | `state` \| `log` |

Tek doğru kaynak: `kv:mcp:list` / `kv:integration:list` / `kv:oauth:status`; push kaçarsa arayüz bu
kanallarla uzlaştırır (5 sn'lik yoklama; OAuth akışı sürerken **2 sn**). Durum **asla yalnız renkle**
verilmez (UI-138).

#### 7.6.3 Hata kodları (tamamı)

| Kod | Ne zaman |
|---|---|
| `E_NOT_FOUND` | `id`/`providerId`/`capability`/`command` bilinmiyor |
| `E_TIMEOUT` | MCP varsayılan **20 sn** (aşılırsa alt süreç `kill()`); entegrasyon HTTP 20 sn |
| `E_PARSE` | JSON-RPC/SSE çözümlenemedi, katalog/state dosyası bozuk (`E_PARSE`) |
| `E_MCP` | JSON-RPC `error` yanıtı (`code`/`message` `detail`e taşınır) |
| `E_FORBIDDEN` | `https` ihlali, host beyaz listesi dışı, `shell:false`/env beyaz listesi ihlali, `safeStorage` yok |
| `E_BAD_REQUEST` | Şema dışı alan (API-54), `hasOnlyKeys` ihlali, argüman >1 MB, yanıt >4 MB |
| `E_CONFIRM_REQUIRED` | §7.6'nın 4 yazma kanalında `confirmToken` yok (API-41/API-51j) |
| **`E_OAUTH_STATE`** | **(v3.1)** `state` eşleşmedi, bayat, tekrar kullanıldı veya callback beklenmeyen bir akışa geldi (§7.9.4). **§5.2'nin 19 zarf koduna girmez**; OAuth akışına özeldir ve `errors.js`'e eklenmesi T-139 kod dilimindedir. |
| **`E_OAUTH_DENIED`** | **(v3.1)** Kullanıcı onay ekranında reddetti (`error=access_denied`) veya sağlayıcı `error` döndürdü; akış `revoked` durumunda biter, token yazılmaz. Aynı şekilde §5.2 dışındadır. |

#### 7.6.4 Girdi şemaları (`hasOnlyKeys` zorunlu 11 kanal — API-52 uzantısı)

`hasOnlyKeys` **şemada yazılı olmayan tek bir alanda bile** `E_BAD_REQUEST` döner; bilinmeyen
alan sessizce atılmaz. Zorunlu 11 kanal: **7 yazma** (4 × §7.6 + 3 × §7.9/§7.10) + `mcp:call` +
`integration:invoke` + `mcp-catalog:list` + `oauth:status`.

| Kural | Şema |
|---|---|
| **Yazma** `kv:mcp:add` | `{id:string(2..32, /^[a-z0-9][a-z0-9-]{1,31}$/), name:string, transport:'stdio'\|'http', command?:string (stdio'da zorunlu), args?:string[] (≤32 öğe), url?:string (http'de zorunlu, https), envRecord?:Record<string,string> (anahtarları env beyaz listesinden; değer dosyaya **yazılmaz**), confirmToken:string}` |
| **Yazma** `kv:mcp:remove` | `{id:string, confirmToken:string}` |
| **Yazma** `kv:integration:save` | `{providerId:string (katalogda olmalı), label:string (≤64), token?:string (secret alan), fields?:Record<string,string> (katalog `fields` anahtarları), confirmToken:string}` — **`auth.kind="oauth2"` sağlayıcıda `token` YASAK** (`E_BAD_REQUEST`): token yalnız `kv:oauth:start` ile gelir (§7.9). |
| **Yazma** `kv:integration:remove` | `{id:string, confirmToken:string}` |
| **Yazma** `kv:mcp-catalog:install` | `{catalogId:string (katalogda olmalı), id?:string (/^[a-z0-9][a-z0-9-]{1,31}$/, varsayılan `catalogId`), env?:Record<string,string> (anahtar ⊆ ENV_ALLOWLIST ∧ şablonun `envKeys`'i), confirmToken:string}` (§7.10.4) |
| **Yazma** `kv:oauth:start` | `{providerId:string (katalogda ve `auth.kind="oauth2"`), label?:string (≤64), scopes?:string[] (katalogdaki `scopes` kümesinin **alt kümesi**; fazlası `E_BAD_REQUEST`), confirmToken:string}` (§7.9.2) |
| **Yazma** `kv:oauth:revoke` | `{accountId?:string, flowId?:string, confirmToken:string}` — ikisinden **en az biri** zorunlu; ikisi de yoksa `E_BAD_REQUEST` |
| **Dış etkili** `kv:mcp:call` | `{id:string, tool:string, args?:object (JSON, ≤1 MB)}` — `confirmToken` **yok** (yazma değil), onay **renderer** diyaloğunda |
| **Dış etkili** `kv:integration:invoke` | `{id:string, capability:string (katalogda olmalı), params?:object (katalog `params` şeması, `max` sınırları)}` — onay renderer diyaloğunda |
| **Okuma** `kv:mcp-catalog:list` | `{category?:string (katalog kategorilerinden), q?:string (≤64), installed?:boolean}` |
| **Okuma** `kv:oauth:status` | `{providerId?:string, accountId?:string}` |

#### 7.6.5 Sır ve denetim kuralları (API-30 genişletmesi)

1. Renderer'a **hiçbir sır dönmez**: `list`, `capabilities`, `test` çıktısında token/cipher alanı yoktur.
2. Denetime **yalnız** `id` / `providerId` / `tool` yazılır; **token, argüman ve URL yazılmaz**.
   Örnek: `{op:'mcp.call', target:id, tool}` · `{op:'integration.invoke', target:providerId, tool:capability}`.
3. `Authorization` başlığı token'dan **main** prosesinde üretilir; log, hata ve push yüküne girmez.
4. MCP `stdio`: `spawn(command, args, {shell:false, cwd:projeKökü, windowsHide:true})`; env
   **beyaz liste** (`PATH`, `SystemRoot`, `TEMP`, `HOME`, `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`).
5. `https` zorunlu; tek istisna `allowInsecureLoopback` + `127.0.0.1` (testler ve `ollama`).
6. `integration:invoke` **yalnız katalogda yazılı host**'a gider (host beyaz listesi katalogda).

#### 7.6.6 Zaman aşımları (API-55 uzantısı)

`kv:mcp:connect` 30 sn · `kv:mcp:call`, `kv:integration:invoke`, `kv:integration:test` 130 sn
(uzak yanıt yavaş olabilir) · diğer `mcp:*`/`integration:*` 10 sn. MCP iç zaman aşımı 20 sn;
`stop()` sırası: stdin kapat → 2 sn → `SIGTERM` → 2 sn → `SIGKILL`.

---

### 7.9 OAuth2 — yetki kodu akışı + PKCE (v3.1, T13-1)

> **Numara notu:** §7.7 ve §7.8 bu sürümde **kullanılmaz** (boş bırakıldı); §7.9/§7.10 Tur 13'ün
> iki yeni yüzeyidir. Mevcut hiçbir bölüm numarası değişmedi.

Kapsam: **4 sağlayıcı** OAuth2 ile bağlanır (Gmail, Google Drive, Google Calendar, GitHub).
Yetki kodu + **PKCE S256**; implicit akış **yoktur**, client credentials akışı **yoktur**.
Kanal: `kv:oauth:start` (yazma), `kv:oauth:status` (okuma), `kv:oauth:revoke` (yazma) — §7.2.
Ağ: token/refresh/revoke çağrıları **`integrations.js` outbound**; callback dinleyicisi
**`oauth.js` inbound** (API-01 (c.2)) — `src/main/services/oauth.js` satır **220–300**.

#### 7.9.1 Sağlayıcılar, uçlar ve kapsamlar

Host'lar katalogda **sabit** yazılıdır; kullanıcı değiştiremez (host beyaz listesi §7.6.5/6).
`clientId` + `clientSecret` **kullanıcıdan** alınır (katalogda yalnız `fields` tanımı vardır;
depoya sır konmaz), `safeStorage` ile şifrelenir.

| Sağlayıcı | `authorize` | `token` | `revoke` | Yeniden yönlendirme | `scopes` (tam liste) |
|---|---|---|---|---|---|
| `gmail` | `https://accounts.google.com/o/oauth2/v2/auth` | `https://oauth2.googleapis.com/token` | `https://oauth2.googleapis.com/revoke` | **geçici port** (`127.0.0.1:0`) | `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly`, `.../gmail.send`, `.../gmail.modify` |
| `gdrive` | aynı Google uçları | aynı | aynı | **geçici port** | `openid`, `email`, `https://www.googleapis.com/auth/drive.readonly`, `.../drive.file` |
| `gcal` | aynı Google uçları | aynı | aynı | **geçici port** | `openid`, `email`, `https://www.googleapis.com/auth/calendar.readonly`, `.../calendar.events` |
| `github` | `https://github.com/login/oauth/authorize` | `https://github.com/login/oauth/access_token` | `https://api.github.com/applications/{client_id}/token` | **sabit port `43117`** (`http://127.0.0.1:43117/oauth/callback`) | `read:user`, `user:email`, `repo`, `read:org`, `workflow` |

**Neden iki mod?** Google "masaüstü uygulaması" istemcileri loopback'te **herhangi bir portu**
kabul eder → `port 0` (işletim sistemi seçer). GitHub OAuth App **kayıtlı callback ile birebir**
eşleşme ister → sabit port zorunludur. Katalog kaydı `auth.oauth2.redirect ∈ {ephemeral, fixed}` +
`fixedPort` taşır; mod **katalogda** yazılıdır, renderer seçemez. Sabit port doluysa `E_CONFLICT`
(`detail.port = 43117`) — sessizce başka porta **kayılmaz** (callback eşleşmez, akış yalan olur).

#### 7.9.2 Akış (metin diyagram)

```
renderer              main · integrations.js                 harici tarayıcı        sağlayıcı
   |  kv:oauth:start          |                                   |                     |
   |------------------------->| 1 confirmToken (API-41)           |                     |
   |                          | 2 providerId ∈ oauth2 mi? değilse E_BAD_REQUEST          |
   |                          | 3 state  = 32B rastgele (base64url) — YALNIZ bellekte    |
   |                          |   verifier = 43..128 karakter (base64url) — bellekte     |
   |                          |   challenge = BASE64URL(SHA256(verifier))                |
   |                          | 4 dinleyici: 127.0.0.1 : (0 | fixedPort)                 |
   |                          | 5 openExternal(authorizeUrl?response_type=code           |
   |                          |      &client_id&redirect_uri&scope&state                 |
   |                          |      &code_challenge&code_challenge_method=S256          |
   |                          |      &access_type=offline&prompt=consent[Google])        |
   |  {flowId,state:'pending'} |                                   |                     |
   |<-------------------------| 6 ------------------------------->| 7 kullanıcı onayı   |
   |                          |                                   |-------------------->|
   |                          | 8 <-- GET /oauth/callback?code=…&state=… (tek istek) ---|
   |                          | 9 state sabit zamanlı eşleşmezse → 400 + E_OAUTH_STATE    |
   |                          |   (gövde okunmaz, kod değişime GİTMEZ, dinleyici kapanır)|
   |                          |10 code + verifier → POST token (https, form-urlencoded)  |
   |                          |--------------------------------------------------------->|
   |                          |11 <-- {access_token, refresh_token?, expires_in, scope} --|
   |                          |12 safeStorage.encryptString → integrations.json (`oauth`) |
   |                          |13 dinleyici close(), 120 sn zamanlayıcı iptal             |
   |  kv:oauth:status (≤2 sn) |   state:'connected'                |                     |
   |<-------------------------|                                    |                     |
```

Kurallar:
1. **Tek eşzamanlı akış.** Akış sürerken ikinci `kv:oauth:start` → `E_BUSY` (`detail.flowId`).
2. `state` ve `verifier` **diske yazılmaz**, renderer'a **dönmez**, log/audit'e **girmez**; yalnız
   main prosesin belleğinde, 120 sn yaşar.
3. `redirect_uri` **katalogdan** üretilir; renderer'dan gelen bir URL **kabul edilmez**.
4. `state` karşılaştırması `crypto.timingSafeEqual` (aynı uzunluk değilse doğrudan `false`).
5. Callback yanıtı **sabit** bir HTML'dir (CSP `default-src 'none'; style-src 'unsafe-inline'`),
   sorgu parametreleri **yansıtılmaz** (`code`/`state` gövdeye yazılmaz — XSS ve sızıntı yok).
6. Tarayıcı **harici** açılır (`shell.openExternal`); uygulama içi tarayıcı (`kv:browser:*`)
   OAuth için **kullanılmaz** (oturum çerezleri ve CSP karışır).
7. Kod değişimi **yalnız** `https` + katalogda yazılı token host'una gider; `Authorization`
   başlığı `Basic base64(clientId:clientSecret)` ile main'de üretilir, hiçbir yere yazılmaz.

#### 7.9.3 Durum sözlüğü

| Durum | Anlam | Geçişler |
|---|---|---|
| `untested` | Hesap yok veya akış başlamadı | → `pending` (`oauth:start`) |
| `pending` | Akış açık, callback bekleniyor | → `connected` (kod değişti) · → `revoked` (`oauth:revoke`/`E_OAUTH_DENIED`) · → `error` (`E_TIMEOUT`, `E_OAUTH_STATE`) |
| `connected` | Access token geçerli (veya refresh ile yenilenebilir) | → `expired` (refresh reddedildi) · → `revoked` (`oauth:revoke`) |
| `expired` | Refresh token geçersiz/iptal edilmiş; **"Yeniden bağlan"** gerekir | → `pending` (yeniden `oauth:start`) · → `revoked` |
| `revoked` | Token silindi (yerel + mümkünse sağlayıcıda) | → `pending` |
| `error` | Son deneme hata verdi (`lastError`) | → `pending` · → `revoked` |

`expiresAt` **tahmin değildir**: `token` yanıtındaki `expires_in` ile hesaplanır, yoksa `null`.

#### 7.9.4 Hata kodları

| Kod | Ne zaman |
|---|---|
| `E_OAUTH_STATE` | `state` eşleşmedi/bayat/tekrar; callback beklenmeyen akışa geldi; `state` 120 sn sonra geçersiz |
| `E_OAUTH_DENIED` | `error=access_denied` veya sağlayıcı `error` döndürdü; kullanıcı reddetti |
| `E_TIMEOUT` | 120 sn içinde callback gelmedi (dinleyici kapanır, akış `error`) |
| `E_BAD_REQUEST` | `providerId` katalogda değil / `auth.kind ≠ oauth2`; `scopes` katalog kümesinin dışında; şema dışı alan (API-54) |
| `E_FORBIDDEN` | `https` ihlali, katalog dışı host, `safeStorage` yok (düz metin fallback **yok**), `clientSecret` eksik |
| `E_CONFLICT` | Sabit callback portu (`43117`) dolu |
| `E_BUSY` | Akış zaten açık |
| `E_CONFIRM_REQUIRED` | `oauth:start` / `oauth:revoke` `confirmToken`'sız (API-51a/API-51l) |

#### 7.9.5 Sır ve denetim (API-30 genişletmesi)

1. `clientSecret`, `access_token`, `refresh_token`, `code`, `state`, `verifier` **hiçbir** IPC
   yanıtında, push yükünde, logda, audit kaydında ve hata mesajında **görünmez**.
2. `kv:oauth:status` yalnız **üst veri** döner: `state`, `scopes[]`, `expiresAt`, `lastRefreshAt`.
3. Denetime yalnız `{op:'oauth.start'|'oauth.revoke'|'oauth.refresh', target:providerId}` yazılır;
   `accountId` yazılır, **kapsam dizesi ve token yazılmaz**.
4. `Authorization: Bearer …` başlığı **main**'de üretilir; renderer'a ne başlık ne token gider.
5. `safeStorage` yoksa OAuth **çalışmaz** (`E_FORBIDDEN`); bellekte tutup devam etmek yasaktır.

#### 7.9.6 Refresh, iptal, yeniden bağlanma

- **Refresh:** `integration:invoke` `401` alırsa **tek** kez refresh denenir (hesap başına
  single-flight; eşzamanlı iki invoke tek refresh bekler). Başarılı → istek bir kez tekrarlanır.
  Başarısız → hesap `expired`, kullanıcıya "Yeniden bağlan" (UI-144). **Renderer'ın doğrudan
  refresh kanalı yoktur** (yeni kanal açılmaz).
- **İptal:** `kv:oauth:revoke` akış açıkken çağrılırsa dinleyici kapanır, akış `revoked` olur
  (`remoteRevoked:false`). Token varsa: sağlayıcı revoke ucu **8 sn** içinde denenir; başarısızsa
  yalnız yerel şifreli kayıt silinir ve `remoteRevoked:false` döner (sessiz başarı **yok**).
- **Yeniden bağlanma:** `expired`/`revoked` hesapta `oauth:start` **aynı `accountId`** ile
  çağrılır (`label` korunur, eski cipher **üzerine yazılır**; iki kayıt birikmez).
- **Uygulama kapanışı:** açık akış varsa dinleyici `close()` + zamanlayıcı `clearTimeout`;
  yarım kalan akış diske **hiçbir şey** yazmaz.

#### 7.9.7 API-01 gerekçesi (neden inbound kümesi 2)

OAuth2 yetki kodu akışı, sağlayıcının **tarayıcıdan geri dönüş** yapmasını gerektirir; geri dönüş
alıcısı olmadan akış imkânsızdır. Bu yüzden API-01 (c) inbound kümesi
**`{remote.js, oauth.js}`** olur (dinleyici `src/main/services/oauth.js` satır **220–300**; `integrations.js` yalnız outbound'dur). İstisna **dar** tutulur: yalnız `kv:oauth:start` sırasında,
yalnız `127.0.0.1`, yalnız `/oauth/callback`, tek istek, 120 sn, tek eşzamanlı akış. Kural
genişlemez: **üçüncü bir inbound dosya** yine ARC onayı + sürüm notu ister. **A1 kapısı** bu yeni
kümeyi T-138'de buna göre denetleyecek (bugünkü A1 "inbound = 1" der → **T-138'e kadar kırmızı
olması beklenir**).

---

### 7.10 MCP kataloğu — 60 şablon (v3.1, T13-2)

**Kapsam:** `src/main/services/mcp-catalog.json` ürün verisidir; **60** MCP sunucu şablonu taşır.
Şablon **çalışan sunucu değildir**: kurulum, şablonu `.keyvotion/mcp.json`'a **kopyalar**; canlı
süreç yalnız `kv:mcp:connect` ile başlar (mevcut `McpRegistry` semantiği, §7.6).

#### 7.10.1 Şablon şeması

| Alan | Tip | Kural |
|---|---|---|
| `id` | string | `/^[a-z0-9][a-z0-9-]{1,31}$/`, katalog içinde **tekil** |
| `name` | string | Görünen ad (≤64) |
| `vendor` | string | Üretici/topluluk adı (≤48) |
| `category` | enum | `developer \| database \| cloud \| productivity \| communication \| search \| files \| observability \| ai` |
| `transport` | enum | `stdio` \| `http` |
| `command` | string? | `transport="stdio"` ise **zorunlu** (ör. `npx`, `uvx`, `node`, `docker`) |
| `args` | string[]? | ≤32 öğe; **kabuk yok** (`shell:false`) |
| `url` | string? | `transport="http"` ise **zorunlu**; **https** (loopback istisnası §7.6.5/5) |
| `envKeys` | string[]? | **Yalnız ad**; her ad `ENV_ALLOWLIST` içinde (§7.10.4). Değer taşımaz |
| `toolsHint` | string | "Bu sunucu ne yapar" — 1 cümle (≤160), araç **sayısı iddia edilmez** |
| `docs` | string | `https` belge bağlantısı (katalog verisi, tıklanabilir; renderer ağa çıkmaz — harici tarayıcı) |

**Kategori dağılımı (60):** developer **14** · database **8** · productivity **8** · cloud **6** ·
communication **6** · search **6** · files **5** · observability **4** · ai **3** = **60**.
Transport dağılımı **hedefi**: çoğunluk `stdio` (`npx`/`uvx`), en az **12** `http` (uzak MCP).
Kesin sayılar katalog dosyasından ölçülür, sözleşmede sabit yazılmaz.

#### 7.10.2 `kv:mcp-catalog:list`

`{items:[{id,name,vendor,category,transport,toolsHint,docs,installed,updateAvailable,envKeys[]}],
total, catalogVersion}` — `installed`, `mcp.json` ile `id` eşleşmesiyle; `updateAvailable`,
`installedFrom.snapshotSha` ≠ **güncel** şablon imzası (§7.10.5). Filtre: `category`, `q` (ad +
vendor + toolsHint içinde, harf duyarsız, **≥2 karakter** — UI-146), `installed`.
**Sır yok**: `env` değerleri hiçbir koşulda dönmez.

#### 7.10.3 Kurulum — `kv:mcp-catalog:install`

1. `confirmToken` doğrulanır (API-41); yoksa **hiçbir şey yazılmaz** (API-51l).
2. Şablon `catalogId` ile bulunur; yoksa `E_NOT_FOUND`.
3. `id` çakışması: `mcp.json`'da aynı `id` varsa → `E_CONFLICT` (sessiz üzerine yazma **yok**);
   `id` parametresiyle farklı ad verilebilir.
4. `env` anahtarları `ENV_ALLOWLIST` **ve** şablonun `envKeys` kümesinin alt kümesi olmalı;
   fazlası `E_BAD_REQUEST`. Değerler **safeStorage** ile şifrelenip yazılır; `safeStorage` yoksa
   değerler **yalnız bellekte** tutulur ve yanıtta `persisted:false` döner (düz metin **yok**).
5. Kayıt `McpRegistry.add` ile **aynı** atomik yoldan yazılır (`.tmp` + `rename`), aynı alan
   doğrulaması ve aynı `id` kuralı — katalog, registry'yi **atlamaz**.
6. `installedFrom = {catalogId, catalogVersion, snapshotSha}` yazılır (şablonun etkin alanlarının
   sha256'sı; `command+args+url+envKeys+transport`).
7. **Süreç başlatılmaz, ağa çıkılmaz.** Yanıt `{id, state:'stopped', installedFrom}`.

#### 7.10.4 `ENV_ALLOWLIST`

İki katman; **her ikisi de kapalı liste** (ARC sahipli, yalnız sürüm notuyla büyür):

| Katman | Adlar |
|---|---|
| **OS geçişi** (8) | `PATH`, `SystemRoot`, `TEMP`, `TMP`, `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` (§7.6.5'in 7'si + `TMP`) |
| **Sır adları** (12) | `GITHUB_TOKEN`, `GITLAB_TOKEN`, `SLACK_BOT_TOKEN`, `NOTION_TOKEN`, `LINEAR_API_KEY`, `BRAVE_API_KEY`, `FIGMA_TOKEN`, `POSTGRES_URL`, `MYSQL_URL`, `MONGODB_URI`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |

Kurallar: (a) `envKeys` yalnız **ad** taşır; değer `mcp.json`'a **asla** yazılmaz. (b) Sır
değerleri varsa **yalnız** `safeStorage` şifreli dosyasında (`.keyvotion/mcp-secrets.json`,
`{version:1, servers:{id:{KEY:"<cipher>"}}}`); düz metin fallback **yok**. (c) `stdio` süreç
ortamı **beyaz liste süzgecinden** geçer: listede olmayan hiçbir ortam değişkeni çocuk sürece
**geçmez** (miras **yok**). (d) Şablon `envKeys`'te listelenmeyen bir sır **isteyemez**.

#### 7.10.5 Şablon güncellemesi — sessiz değişiklik yasak

Katalog güncellendiğinde **kurulu sunucu değişmez**: `mcp.json`'daki kayıt, kurulum anındaki
**anlık görüntüdür** (snapshot). Kural:

1. `kv:mcp-catalog:list` yalnız `updateAvailable:true` **işaretler**; hiçbir yazma yapmaz.
2. Güncelleme **yalnız** kullanıcı açıkça `kv:mcp-catalog:install` çağırırsa olur
   (`confirmToken` + onay diyaloğu; fark — `command/args/url/envKeys` — **gösterilir**).
3. `env` değerleri güncellemede **korunur**; yeni `envKeys` eklenmişse eksik olanlar istenir,
   eskiler **silinmez**.
4. Kurulu bir sunucunun `command`/`url`'ü katalogdan **otomatik** değişmez; `mcp.json` kullanıcı
   verisidir.
5. Katalogdan **silinen** şablon, kurulu kaydı **silmez**; `installedFrom` "katalogda yok" rozetiyle
   görünür kalır (kullanıcı `kv:mcp:remove` ile kaldırır).

#### 7.10.6 Zaman aşımı ve denetim

`kv:mcp-catalog:list` 10 sn · `kv:mcp-catalog:install` 30 sn (atomik yazım). Denetime yalnız
`{op:'mcp.catalog.install', target:catalogId, extra:{id}}` yazılır; **`env` adları ve değerleri
yazılmaz**.

---

### 7.11 Bağlantı presetleri — 124 hazır kurulum (v3.2, T14-1)

**Amaç:** kullanıcı "hazır bağlanma yeri" görsün, katalog/şema öğrenmesin. **124** preset
(**64** entegrasyon + **60** MCP) tek ekranda (`connect`, UI §15.9) kart olarak sunulur; kart →
alan formu → bağlan. Kaynak dosya: `src/main/services/connection-presets.json` (ürün verisi,
kullanıcı **yazamaz**, ARC onayıyla sürümlenir). Servis: `PresetService` (`services/presets.js`).

#### 7.11.1 Şema

| Alan | Tip | Kural |
|---|---|---|
| `id` | string | `/^[a-z0-9][a-z0-9-]{1,47}$/`, **124 içinde tekil** |
| `kind` | enum | `integration` \| `mcp` |
| `refId` | string | **Birebir** işaret: `kind="integration"` → `integration-catalog.json` **`id`**'si; `kind="mcp"` → `mcp-catalog.json` **`id`**'si. **Katalogda yoksa preset geçersizdir** (`E_PRESET_UNKNOWN`), sessizce yok sayılmaz |
| `name` / `vendor` | string | Görünen ad (≤64) / üretici (≤48) |
| `category` | enum | Entegrasyonlarda katalog kategorisi; MCP'de §7.10.1 kategorileri |
| `authMode` | enum | `oauth2` \| `token` \| `apikey` \| `basic` \| `none` \| `install` — **`install` yalnız MCP** (kurulum, kimlik yok) |
| `logoHint` | string | İkon ipucu (`gmail`, `github`, `postgres` …). **Uzak görsel yüklenmez** (`connect-src 'none'`), yerel/emoji gösterim |
| `summary` | string | 1 cümle (≤160): bu bağlantı ne yapar |
| `fields[]` | dizi | `{key, label, placeholder, hint, secret, required, howToGet, url}` — `key` şablonda tekil; `secret:true` → API-30 (UI-152) |
| `scopes[]` | string[] | `authMode="oauth2"` ise **katalogdaki `scopes` alt kümesi**; değilse `[]` |
| `docsUrl` | string | `https` belge bağlantısı (harici tarayıcıda açılır) |
| `testCapability` | string? | Entegrasyonda katalog `capabilities[].id`'si; "Test et" bunu çağırır (`health` varsa önce `health`) |
| `mcpTemplate` | object? | **Yalnız** `kind="mcp"`: `mcp-catalog.json` şablonunun kurulum anındaki kopyası (`transport`, `command`/`url`, `args`, `envKeys`) — katalog **çalışma anında** okunmaz, kopya **snapshot**'tır |

**124 kayıt kuralı:** `connection-presets.json` **tam 124** kayıt taşır (64 + 60); her `refId`
katalogda **var olmalı**, her katalog kaydı için **en az bir** preset bulunmalı. Sayı **dosyadan
ölçülür**, sözleşmede sabit yazılmaz (UI-151). `presetVersion` alanı dosyada tutulur ve
`kv:preset:list` ile döner.

#### 7.11.2 Kurulum akışı (preset → bağlantı)

```
renderer                                     main
  kv:preset:list            -> 124 kart (ready, state, requiredFields)   [sır yok]
  kart seç -> alanları doldur (secret:type=password, UI-152)
  kv:preset:apply {presetId, values, confirmToken}
       | 1 confirmToken yoksa E_CONFIRM_REQUIRED (hiçbir şey yazılmaz)
       | 2 presetId yoksa E_PRESET_UNKNOWN; kind/refId tutmuyorsa E_PRESET_KIND_MISMATCH
       | 3 required alanlar eksikse E_PRESET_MISSING_FIELDS + missing[] (diske YAZILMAZ)
       | 4 authMode'a göre:
       |     oauth2  -> §7.9 akışı (clientSecret fields'tan, token safeStorage)
       |     token/apikey/basic -> IntegrationsService.save (safeStorage şifreli)
       |     install -> McpCatalog.install (§7.10.3, ENV_ALLOWLIST), süreç BAŞLATILMAZ
       |     none    -> IntegrationsService.save (sırsız kayıt; yalnız public API)
       | 5 değerler renderer'a DÖNMEZ; yanıt yalnız {presetId, kind, refId, state, accountId?, serverId?}
  {presetId, state:'connected'|'installed'}
```

**Birleşme:** akış **§15.5 B4** (katalog ekranı) ile **aynı** servis yolunu kullanır — `<a>`preset:apply`
`IntegrationsService.save` / `McpCatalog.install` / `OAuth.start`'ı **çağırır**, kendi yazma yolunu
**açmaz** (tek yazma yolu, çift doğrulama yok). `confirmToken` **bir** kez tüketilir.

#### 7.11.3 Sır ve denetim

1. `secret:true` alan değerleri **yalnız** main'de okunur, **safeStorage** ile şifrelenir; renderer'a,
   log'a, audit'e, hata mesajına **yazılmaz** (API-30/API-44). `values` yanıtta **dönmez**.
2. Denetime yalnız `{op:'preset.apply', target:presetId, extra:{kind, refId, state}}` yazılır;
   **alan değerleri ve `howToGet` metni yazılmaz**.
3. `howToGet` metni **kullanıcıya gösterilir** (UI-153) — sır değil, **yol gösterimi**; adım numaralı
   yazılır ("1) … 2) …"), `url` tıklanabilir (harici tarayıcı).
4. Preset **güncellemesi kurulu bağlantıyı sessizce değiştirmez:** kurulum anındaki `refId` +
   `mcpTemplate` snapshot'ı geçerlidir; `kv:preset:list` yalnız `ready` alanını günceller. Yeni
   zorunlu alan eklenmişse kart `needs-fields` olur, **kurulu kayıt silinmez** (§7.10.5 ile aynı ilke).
5. Hata kodları: `E_CONFIRM_REQUIRED` · `E_PRESET_UNKNOWN` · `E_PRESET_KIND_MISMATCH` ·
   `E_PRESET_MISSING_FIELDS` · `E_FORBIDDEN` (`safeStorage` yok, `https` ihlali) · `E_NOT_FOUND`
   (`refId` katalogda yok) · `E_CONFLICT` (MCP `id` çakışması) · `E_BAD_REQUEST` (şema dışı alan).

---

### 7.12 Votion araç erişimi — manifest + beyaz liste (v3.2, T14-2)

**Amaç:** Votion asistanı **kurulu** bağlantıları kullanabilsin. Votion **kendi ağ katmanını
açmaz**: yalnız `kv:votion:tools` manifestini okur ve **beyaz listedeki** kanalları çağırır.
Servis: `VotionTools` (`services/votion-tools.js`).

#### 7.12.1 Manifest — `kv:votion:tools`

```jsonc
{ "integrations": [ { "id": "...", "name": "...", "category": "...",
                      "capabilities": [ { "id": "...", "summary": "...", "verb": "GET",
                                          "params": { "limit": {"type":"number","max":50} } } ] } ],
  "mcp": [ { "id": "...", "name": "...", "tools": [ { "name": "...", "summary": "..." } ] } ],
  "presetsReady": 124, "counts": { "integrations": 64, "capabilities": 195, "mcp": 60, "tools": 0 },
  "truncated": false, "bytes": 0 }
```
`include:"ready"` yalnız **kurulu/bağlı** olanları döndürür (varsayılan `all`). `tools` sayısı
**canlıdır**: yalnız `state="ready"` MCP sunucularının araçları sayılır (bağlanmamış sunucu `0`).
Sır **yok**: token, env değeri, `clientSecret`, `params` örneği değerleri dönmez.

#### 7.12.2 Beyaz liste — Votion'un çağırabileceği kanallar

| İzinli | Gerekçe |
|---|---|
| `kv:integration:invoke` | kurulu REST yeteneği çalıştırır (API-51k dış-etki kapısı) |
| `kv:mcp:call` | bağlı MCP aracını çağırır (API-51k) |
| `kv:preset:apply` | hazır bağlantıyı kurar (yalnız kullanıcı onayıyla) |

**Yasak (açıkça):** `kv:secret:*`, `kv:provider:keyAdd|keyRemove`, `kv:oauth:start` (Votion akış
**başlatamaz**, yalnız kullanıcı), `kv:integration:save|remove`, `kv:mcp:add|remove`,
`kv:votion:tools|invoke` dışında **hiçbir** yazma kanalı. İhlal girişimi `E_FORBIDDEN` +
audit kaydı. Beyaz liste **kodda sabittir**, renderer'dan genişletilemez.

#### 7.12.3 `kv:votion:invoke`

Girdi `{capabilityId, params?, confirmToken}`. `capabilityId` biçimi `<kind>:<refId>:<capability>`
(`integration:github:list-repos`, `mcp:filesystem:read_file`) — manifestte **yoksa** `E_NOT_FOUND`.
`confirmToken` **zorunludur** (API-51a/API-51m); tokensız `E_CONFIRM_REQUIRED`.

**Her çağrı audit'e yazılır:** `{op:'votion.invoke', capabilityId, status}` + `at` — **parametre
değerleri, URL, gövde ve sır YAZILMAZ** (API-30/API-44). Yanıt `{capabilityId, kind, ok, status,
result, latencyMs, auditId}`; `params` **dönmez**.

**Zaman aşımı:** `kv:votion:invoke` **130 sn** (API-55 uzantısı: uzak REST/MCP yavaş olabilir);
`kv:votion:tools` 10 sn; `kv:preset:list` 10 sn; `kv:preset:apply` 130 sn (OAuth akışı içerebilir).

#### 7.12.4 Rol sınırı ve bağlam boyutu

1. **Görünüm rolü yok (T-209):** Görünüm rolü kaldırıldı; Votion bütün bağlantıları görür ve
   kullanır. Manifest rol nedeniyle **boş dönmez** (`integrations:[]`, `mcp:[]` yalnız gerçekten
   bağlantı yoksa oluşur). Yetki yine `confirmToken` + izin matrisindedir.
2. **Bağlam boyutu:** manifest asistan bağlamına enjekte edilirken **≤ 24 KB** (24 576 bayt) sınırı
   uygulanır. Aşarsa: (a) `capabilities` **özet** alanı 60 karaktere kırpılır, (b) `params` şemaları
   çıkarılır, (c) hâlâ aşıyorsa kategori sırasına göre kesilir ve `truncated:true` + `bytes` döner.
   **Kesme sessiz değildir**; UI'da "N bağlantı bağlam dışı" rozeti görünür (UI-155).

---

## 8. Tur 2 uç noktaları (v2 — canlı doğrulama raporu)

### 8.1 Doğrulama durumu (dürüst tablo)

Ölçüm yöntemi: `opencode api get <yol>` (CLI kendi kimlik doğrulamasını kullanır; çıplak `Invoke-WebRequest` 401 döner) + **çalışan sunucunun kendi** `/openapi.json` şeması.

| # | Uç | Yöntem | Canlı doğrulandı mı | Kanıt |
|---|---|---|---|---|
| T01 | `/api/agent` | GET | **✅ CANLI** | 7.478 bayt; `build`, `general` ajanları döndü |
| T02 | `/api/provider` | GET | **✅ CANLI** | `ollama`, `evren` sağlayıcıları; `settings.baseURL` alanı var |
| T03 | `/api/model` | GET | **✅ CANLI** | 9.583 bayt; `capabilities`, `variants[]`, `limit{context,output}`, `settings.apiKey` |
| T04 | `/api/session/{id}` | GET | **✅ CANLI** | ARC seansı tam nesne (tokens, outcome, metadata) |
| T05 | `/api/session/{id}/message?limit=N` | GET | **✅ CANLI** | 6 mesaj; `content[]` tipleri: `reasoning,text,tool`; **user mesajında metin üst düzey `text`** |
| T06 | `/api/session` | GET | **✅ CANLI** | `{"data":[…]}` 7+ seans |
| T07 | `POST /api/session` (yeni seans) | POST | **⚠️ ŞEMA (çağrılmadı)** | Gövde şeması çalışan sunucunun `/openapi.json`'undan; **yazma** olduğu için gerçek seans açılmadı |
| T08 | `PATCH /api/session/{id}` (arşiv) | PATCH | **⚠️ ŞEMA (çağrılmadı)** | `{archived:boolean}` → 204; yazma |
| T09 | `DELETE /api/session/{id}` | DELETE | **⚠️ ŞEMA (çağrılmadı)** | **VAR** (204) ama **politika yasak** (API-60) |
| T10 | `POST /api/session/{id}/model` | POST | **⚠️ ŞEMA (çağrılmadı)** | `{model:Model.Ref}` → **204**; yazma |
| T11 | `POST /api/session/{id}/agent` | POST | **⚠️ ŞEMA (çağrılmadı)** | VAR; ajan değiştirir (Tur 2 kullanmaz) |
| T12 | `/api/event` (SSE) | GET | **⚠️ KISMİ** | Olay **adları** çalışan sunucunun `types` enum'undan alındı (90+ ad, §8.7); **çerçeve biçimi** yakalanamadı (8 sn'lik abonelik denemesi boş çıktı verdi) |

| # | Kural |
|---|---|
| API-59 | "⚠️ ŞEMA" işaretli uçlar için DEV, ilk çağrıyı **elle onaylı** tek denemeyle yapar ve sonucu rapora yazar; şema doğrulanmadan otomatik test yazılmaz. |
| API-60 | `DELETE /api/session/{id}` **çağrılmaz**; ajan çıkarma yalnız arşivlemedir (`PATCH archived:true`) — kapsam belgesi F8 "silme değil". |

### 8.2 Yeni seans — `POST /api/session`

**Gövde şeması (canlı sunucu sözleşmesi, `additionalProperties:false`):**
```jsonc
{
  "id":        "string|null",     // istemci ID verebilir; null → sunucu üretir
  "parentID":  "string|null",     // alt seans; Console kullanmaz
  "title":     "string|null",     // "DEV · Yazılımcı" gibi
  "agent":     "string|null",     // /api/agent id'si (ör. "build")
  "model":     { "id": "string", "providerID": "string", "variant": "string|null" } | null,
  "location":  { "directory": "C:\\Users\\kullanici\\Keyvotion" } | null,
  "metadata":  {} | null,
  "permissions": [ … ] | null
}
```
**Yanıt:** `200` → `{ "data": Session.Info }` (§4.1 alanlarıyla eşlenir).
**Hatalar:** `400` (şema dışı alan / geçersiz), `401`, `404` (`location` veya `parentID` yok), `503` (model sağlayıcısı yok — dolaylı).

| # | Kural |
|---|---|
| API-61 | Console `POST /api/session` gövdesinde yalnız `title`, `agent`, `model`, `location` gönderir; `id`, `parentID`, `metadata`, `permissions` **gönderilmez** (`null` bile yazılmaz). |
| API-62 | `location.directory` daima ayarlardaki proje dizinidir; farklı dizin `E_BAD_REQUEST` ile reddedilir (yerel doğrulama). |
| API-63 | Yeni seans `title` biçimi `<ROL KODU> · <rol adı>` (ör. `DEV · Yazılımcı`), 60 karakter sınırı. |
| API-64 | Seans açıldıktan sonra Console `roster.md`'ye **otomatik yazmaz**; öneri üretir ve `kv:roster:write` onayı bekler (API-72). |
| API-94 | **Rol kodu tekildir (C-6, v2.2.1):** `kv:team:add`, aynı `roleCode` `roster.md`'de varsa isteği **sunucuya hiç göndermeden** `E_DUPLICATE_ROLE` ile reddeder. **Tek doğru kaynak `roster.md`'dir; canlı seans başlığı denetimi YAPILMAZ** (YM kararı). Gerekçe: her `team:add`'te `GET /api/session` atmak API-94'ün kendi amacını ("istek gönderilmez") bozar. `roster.assertUniqueCode(code, context)` `context.titles` destekler ama **çağıran vermez** (`src/main/main.js`); bu bilinçlidir, ölü kod değil, opsiyonel genişletmedir. Hata `detail` etiketi: `duplicate-role:<KOD>\|source:roster`. |
| API-95 | İkinci ajan için `roleCode` deseni `^[A-Z]{2,5}[0-9]?$` olmalı (`DEV2`, `QA2`); yeni kod **yalnız** ARC onayıyla açılır ve onay audit satırına `arcApproval:"<T-xxx>"` olarak yazılır. |

### 8.3 Arşivleme — `PATCH /api/session/{id}`

```jsonc
{ "archived": true }   // geri alma: false
```
**Yanıt:** `204` (gövde yok). **Hatalar:** `400`, `401`, `404`.

| # | Kural |
|---|---|
| API-65 | Ajan çıkarma **yalnız** `{archived:true}` ile yapılır; arşivlenen seans listeden düşer ama silinmez (geri alınabilir). |
| API-66 | Arşivleme öncesi `roster.md` yedeği alınır (`work/backup/<zaman>/roster.md`) ve yol audit'e yazılır. |

### 8.4 Model değiştirme — `POST /api/session/{id}/model`

```jsonc
{ "model": { "id": "deepseek-v4.1-flash", "providerID": "evren", "variant": "default" } }
```
`Model.Ref` zorunlu alanları: `id`, `providerID`; `variant` opsiyonel.
**Yanıt:** `204` — **gövde yok**, bu yüzden başarı yalnız HTTP koduyla anlaşılır.
**Hatalar:** `400` (`UnsupportedModelError` dahil), `401`, `404` (`SessionNotFoundError`).

| # | Kural |
|---|---|
| API-67 | Model değişimi `204` dönerse istemci seansın `providerID/modelID` alanlarını **yerel olarak** günceller ve 2 sn sonra `E03` ile doğrular (SSE `session.model.selected` da gelebilir). |
| API-68 | Model değişimi audit satırı: `{op:"model.switch", sessionID, from:"p/m", to:"p/m", key}` — onay `confirmToken` zorunlu. |
| API-69 | Havuz dışı model seçimi engellenmez ama UI uyarı gösterir ve audit'e `outsidePool:true` yazılır (K1 §4.4). |

### 8.5 Mesaj geçmişi — `GET /api/session/{id}/message?limit=N`

**Yanıt:** `{ "data": [ Message… ] }`, en yeniden geriye; `limit` varsayılan 20, üst sınır 50 (API-18).

İki ayrı gövde şekli vardır (canlı doğrulandı):

```jsonc
// user mesajı — metin ÜST DÜZEYDE
{ "id":"msg_…", "type":"user", "time":{"created":1793…},
  "text":"RAPOR T-008 …", "files":[], "agents":[], "skills":[] }

// assistant mesajı — metin content[] içinde
{ "id":"msg_…", "type":"assistant", "time":{"created":…,"streamed":…},
  "agent":"build", "model":{"id":"…","providerID":"…"},
  "content":[ {"type":"reasoning","text":"…"}, {"type":"text","text":"…"},
              {"type":"tool", …} ],
  "finish":"…", "cost":0, "tokens":{…} }
```

| # | Kural |
|---|---|
| API-70 | Mapper `type==="user"` ise metni `text` alanından, `type==="assistant"` ise `content[]` içindeki **ilk `type:"text"`** öğesinden alır; `reasoning` ve `tool` içerikleri MVP'de metin olarak gösterilmez. |
| API-71 | Eşlenmiş `Message` (§4.3) `kind` alanı: `user` → `"user"`, `assistant` → `"assistant"`, `content` içinde yalnız `tool` varsa → `"tool"`, `type:"compaction"/"idle"/"system"` → `"system"`. |

### 8.6 Katalog uçları (canlı doğrulandı)

| Uç | Şekil (kullanılan alanlar) | Not |
|---|---|---|
| `GET /api/model` | `{location, data:[{id, modelID, providerID, name, family, type, capabilities{tools,input[],output[]}, variants[{id,settings}], limit{context,output}, cost[], status, enabled, settings{apiKey,baseURL}}]}` | `settings.*` **asla** renderer'a geçmez (§4.2) |
| `GET /api/provider` | `{location, data:[{id, name, activation, package, settings{apiKey?,baseURL,provider}}]}` | `activation:"enabled"` filtresi |
| `GET /api/agent` | `{location, data:[{id, name, description, mode, hidden, permissions[]}]}` | `hidden:true` olanlar UI'da gizlenir |

| # | Kural |
|---|---|
| API-72 | Model listesi `enabled===true` ve `status==="active"` olanlarla süzülür; `hidden:true` ajanlar seçim listesine girmez. |
| API-73 | `provider` listesi yalnız `activation==="enabled"` olanları gösterir; kapalı sağlayıcının modelleri "sağlayıcı kapalı" rozetiyle pasif listelenir. |

### 8.7 SSE olay adları — canlı sunucu `types` enum'undan (doğrulandı)

`GET /api/event` ayrıca `?types=a,b,c` ile süzme destekler; `server.connected` her zaman gelir.

**Tur 2'de abone olunacak alt küme (Console için yeterli):**
```text
server.connected
session.created  session.archived  session.unarchived  session.deleted
session.renamed  session.model.selected  session.agent.selected  session.moved
session.usage.updated  session.status  session.idle
session.execution.started  session.execution.succeeded
session.execution.failed   session.execution.interrupted
session.text.started  session.text.delta  session.text.ended
session.reasoning.started  session.reasoning.delta  session.reasoning.ended
session.tool.called  session.tool.progress  session.tool.success  session.tool.failed
session.inbox.enqueued  session.inbox.delivered  session.inbox.cancelled
permission.asked  permission.replied
model.updated  provider.updated  agent.updated  config.updated  project.updated
filesystem.changed
```

**Tam enum (90+ ad, kullanılmayanlar dahil):** `location.shutdown, models-dev.refreshed, credential.updated, credential.switched, integration.updated, provider.updated, model.updated, agent.updated, session.created, session.agent.selected, session.model.selected, session.moved, session.renamed, session.metadata.updated, session.permissions, session.viewed, session.archived, session.unarchived, session.usage.updated, session.deleted, session.forked, session.inbox.delivered, session.inbox.enqueued, session.inbox.cancelled, session.inbox.delivery.changed, session.execution.started, session.execution.succeeded, session.execution.failed, session.execution.interrupted, session.instructions.updated, session.synthetic, session.skill.activated, session.shell.started, session.shell.ended, session.step.started, session.step.streamed, session.step.ended, session.step.failed, session.text.started, session.text.delta, session.text.ended, session.reasoning.started, session.reasoning.delta, session.reasoning.ended, session.tool.input.started, session.tool.input.delta, session.tool.input.ended, session.tool.called, session.tool.progress, session.tool.success, session.tool.failed, session.retry.scheduled, session.compaction.started, session.compaction.delta, session.compaction.ended, session.compaction.failed, session.revert.staged, session.revert.cleared, session.revert.committed, filesystem.changed, reference.updated, permission.asked, permission.replied, plugin.updated, project.updated, worktree.updated, worktree.resolved, command.updated, config.updated, skill.updated, pty.created, pty.updated, pty.exited, pty.deleted, persistent-pty.added, persistent-pty.removed, shell.created, shell.exited, shell.deleted, form.created, form.replied, form.cancelled, websearch.updated, session.status, session.idle, tui.prompt.append, tui.command.execute, tui.toast.show, tui.session.select, installation.updated, installation.update-available, vcs.branch.updated, mcp.status.changed, mcp.resources.changed` + `rpc.*` (eklenti).

| # | Kural |
|---|---|
| API-74 | **v1'deki §6.1 olay adları geçersizdir** (`session.updated`, `session.error`, `message.updated`, `message.removed` bu sunucuda **yok**); v2'de §8.7 listesi geçerlidir. |
| API-75 | `session.text.delta` / `session.reasoning.delta` / `session.tool.*` olayları **yalnız** gömülü görünüm (F7) açıkken işlenir; başka ekranda gelirse yok sayılır (performans). |
| API-76 | Delta olayları kalıcı değildir: gömülü görünüm kapanıp açıldığında akış `GET …/message` ile yeniden kurulur. |
| API-77 | `session.status` ve `session.idle` kart durumunu (`idle/busy/error`) günceller; `session.execution.failed` → `error`, `session.execution.started` → `busy`. |
| API-78 | `permission.asked` Tur 2'de yalnız **rozet + bildirim** üretir; yanıtlama (`E16`) Tur 3'tedir. |
| API-93 | Olay adları kodda tek kaynaktan (`src/shared/events.js`) gelir ve bu dosya §8.7 listesiyle **birebir** eşleşir; listeye olmayan bir ad eklenirse K2 denetimi (A11) başarısız sayılır. |

### 8.8 Tur 2 DTO ekleri (beyaz liste genişlemesi)

§4.1 `Session`'a eklenen alanlar:

| Alan | Tip | Kaynak |
|---|---|---|
| `archived` | boolean | `PATCH` sonrası yerel; `GET /api/session` varsayılan arşivleri döndürmez |
| `roleCode` | string\|null | roster eşlemesi (v1 `role` ile aynı) |
| `lastReportID` | string\|null | rapor taraması (§8.9) |

§4.3 `Message` düzeltmesi: `text` **user** mesajında üst düzey, **assistant** mesajında `content[]` içindedir (API-70).

| # | Kural |
|---|---|
| API-79 | `Session.archived` renderer'a **yalnız** boolean olarak geçer; arşiv listesi ayrı çağrıyla (`?archived=true` desteği doğrulanmadı) alınmaz, MVP'de arşivlenen seans listeden düşer. |

### 8.9 Rapor toplama (F5 — uç nokta yok, türetme)

Raporlar ayrı bir API'si yoktur; **mesaj metinlerinden** türetilir.

| # | Kural |
|---|---|
| API-80 | `kv:reports:list` **önce dosya kaynağını** okur (parola gerekmez), **sonra** her canlı seans için `GET …/message?limit=50` çağırır ve `text` içinde `RAPOR T-\d{3}` geçen blokları ayrıştırır (`src/main/services/reports.js`, `MESSAGE_SCAN_LIMIT = 50`). |
| API-81 | Ayrıştırma çıktısı (`parseReport`, `src/main/services/messages.js`): `taskId`, `role`, `status` (`TAMAM\|KISMİ\|BLOKE`), `ozet`, `kanit`, `files` (string[]), `risk`, `karar`, `raw` — bulunmayan alan boş string/`[]`. Etiket biçimleri: satır başı `Etiket:`, `## Etiket`, `### Etiket`, `**Etiket**` (`**Etiket:**` + aynı satırda değer dahil). **Bilinmeyen `## Başlık` (v2.2.1, YM kararı):** alan **açmaz**, **içerik KAYBOLMAZ** — açık bir etiket varsa o alanın içeriğine **eklenir** (`if (current) fields[current].push(line)`). Gerekçe: gerçek arşiv raporlarında `## 1. Yapılan İşlemler`, `## Kanıt 1 — canlı IPC`, `## A. Paketleme İstatistikleri` gibi başlıklar var; "yutulsaydı" bu içerik kaybolurdu. Ölçüm (2026-11-01, `.team/log` + `raporlar`): **11 rapor dosyası, 42 bilinmeyen başlık**, bunlar `ozet`/`kanit` alanlarına düşüyor (en uzun `kanit`: **4.157 karakter**, `T-040__DEV`). |
| API-82 | **Kaynak önceliği:** aynı `taskId` + `role` için hem dosya hem mesaj kaydı varsa dosya sürümü kazanır (`source:"file"`); mesaj kaydı elenir. Dosya yoksa `source:"message"`. (`reports.js` `fileKeys` filtresi.) |
| API-83 | Rapor taraması **her canlı seans** için 1 istek atar (`limit=50`). v2.2 itibarıyla **önbellek yoktur**: her `kv:reports:list` çağrısı yeniden tarar (`reports.js` içinde cache yok). |
| API-100 | **`reports.list` çıktı şeması:** `{ok:true, data:{reports:Report[], items:Report[], counts:{total,tamam,kismi,bloke}, offline:boolean, offlineReason:{code,message}\|null, scannedAt:string, sources:{message:number,file:number}, reportDir:string, reportDirExists:boolean}}`. `reports` ve `items` **aynı sayfayı** taşır (geriye dönük ad). `counts` filtre + tekil kümeden sayılır, `total` sayfalamadan önceki toplamdır; `limit` varsayılan **100**, tavan **200**. |
| API-101 | **Parolasız çalışma:** bağlantı yoksa `ok:true, offline:true` döner ve `offlineReason` hata kodunu taşır — bu **hata değildir**, dosya kaynaklı raporlar yine listelenir. **Dosya tarama:** `.team/log/raporlar/*.md` esnektir (BOM, boş satır, `**kalın**`/`#` başlık kabul). Yedek yol `.team/log/*.md` taramasında başlık **dosyanın kendi ilk boş olmayan satırı** olmak zorundadır (`startsWithReportTitle`); böylece alıntı blok taşıyan `decisions.md` gibi dosyalar rapor sayılmaz. |

### 8.10 Sunucu keşfi (E-7 — kayıt dosyası okuma, tarama yok)

Keşif **sıralı** ve **sınırlı**dır; her adım başarısız olursa sıradakine geçilir, hepsi başarısızsa Ayarlar formu açılır.

| Adım | Kaynak | Okunan | Zaman aşımı |
|---|---|---|---|
| 1 | `config.json` (`settings.serverURL`) | son bilinen adres | — |
| 2 | `%APPDATA%\opencode\*.json` | `port`/`url`/`server` alanı taşıyan kayıt dosyaları | 200 ms/dosya |
| 3 | `%USERPROFILE%\.config\openchamber\managed-opencode\*.json` | aynı alanlar | 200 ms/dosya |
| 4 | 1–3'te bulunan her aday için `GET /api/info` | `2.` sürüm doğrulaması (API-24) | 3 sn/adres |

| # | Kural |
|---|---|
| API-96 | **Port taraması yapılmaz** (65.535 port denenmez); keşif yalnız yukarıdaki kayıt dosyalarını okur ve en fazla 10 adayı dener — port taraması **Tur 3**'e ertelenmiştir. |
| API-97 | Keşif hiçbir dosyayı **yazmaz/değiştirmez**; bulunan adres yalnız öneri olarak forma doldurulur ve kullanıcı `test-connection` (E02) ile onaylamadan `config.json`'a yazılmaz. |

---

## 9. Tur 2 IPC kanalları (v2)

### 9.1 Kanal tablosu (kapsam belgesi §4'ün tamamı)

`v1` = T-012'de tanımlıydı; `YENİ` = v2'de ekleniyor; `AD DEĞİŞTİ` = v1 adı korunur ama yeni ad kanoniktir.

| Kanal | Durum | Yazma | Onay | Girdi | Çıktı (`data`) | Hata kodları |
|---|---|---|---|---|---|---|
| `kv:team:list` | v1 | — | — | `{includeArchived?:false}` | `{sessions:Session[], unassigned:Session[], counts:{total,inRoster,missing,outOfRoster,busy}, roster:object[], updatedAt:number}` (API-98/99) | `E_OFFLINE, E_UNAUTHORIZED, E_PARSE` |
| `kv:team:add` | **YENİ** | ✓ | ✓ `confirmToken` | `{roleCode, agent, model:{id,providerID}, title?}` | `Session` (§4.1) | `E_BAD_REQUEST, E_FORBIDDEN, E_OFFLINE, E_CONFIRM_REQUIRED, E_SECRET_MISSING, E_DUPLICATE_ROLE` |
| `kv:team:remove` | **YENİ** | ✓ | ✓ `confirmToken` | `{sessionID, archive:true}` | `{archivedAt, backupPath}` | `E_BAD_REQUEST, E_NOT_FOUND, E_CONFIRM_REQUIRED` |
| `kv:team:setLeader` | **YENİ** | ✓ | ✓ `confirmToken` + yedek | `{sessionID}` | `{rosterPath, backupPath, previousSessionID}` | `E_NOT_FOUND, E_BAD_REQUEST, E_CONFIRM_REQUIRED, E_PARSE` |
| `kv:command:send` | v1 | ✓ | ✓ `confirmToken` | `{sessionID, text, delivery?:"steer"\|"queue"}` | `{sentAt, idempotencyKey, queued}` | `E_BUSY, E_BAD_REQUEST, E_RATE_LIMIT, E_UNAUTHORIZED, E_OFFLINE, E_CONFIRM_REQUIRED` |
| `kv:command:sendMany` | **YENİ** | ✓ | ✓ tek `confirmToken` | `{sessionIDs[], text, delivery?}` | `{results:[{sessionID, ok, code}]}` | aynı + `E_PARTIAL` |
| `kv:command:interrupt` | v1 | ✓ | ✓ `confirmToken` | `{sessionID}` | `{stoppedAt}` | `E_NOT_FOUND, E_CONFIRM_REQUIRED` |
| `kv:command:messages` | v1 | — | — | `{sessionID, limit?}` | `Message[]` (§4.3) | `E_NOT_FOUND, E_OFFLINE, E_PARSE` |
| `kv:board:read` | v1 | — | — | `{}` | `{phase, nextID, rows:BoardRow[]}` | `E_PARSE, E_OFFLINE` |
| `kv:board:write` | **YENİ** | ✓ | ✓ `confirmToken` + yedek | `{id, patch:{status?,owner?,evidence?}}` veya `{append:{id,title,owner,status}}` | `{backupPath, writtenAt, rows}` | `E_CONFIRM_REQUIRED, E_CONFLICT, E_BAD_REQUEST, E_PARSE` |
| `kv:models:catalog` | **AD DEĞİŞTİ** (`kv:models:list`) | — | — | `{refresh?:false}` | `{pool:Model[], outsidePool:Model[], providers:[…], guide:[…]}` | `E_OFFLINE, E_UNAUTHORIZED, E_PARSE` |
| `kv:models:assign` | **YENİ** | ✓ | ✓ `confirmToken` | `{sessionID, model:{id,providerID,variant?}}` | `{appliedAt, verified:boolean}` | `E_BAD_REQUEST, E_NOT_FOUND, E_FORBIDDEN, E_CONFIRM_REQUIRED` |
| `kv:reports:list` | **YENİ** | — | — | `{role?, taskId?, status?, limit?}` (`taskID` de kabul edilir, `payload.js` büyük harfe çevirir) | `{reports:Report[], items:Report[], counts:{total,tamam,kismi,bloke}, offline, offlineReason, scannedAt, sources:{message,file}, reportDir, reportDirExists}` (API-100) | `E_PARSE` (parolasız `ok:true, offline:true` — API-101) |
| `kv:settings:get` | v1 | — | — | `{}` | `Settings` (§4.5) | `E_INTERNAL` |
| `kv:settings:set` | v1 | ✓ | — (`confirmToken` **gerekmez**; verilirse tek kullanım doğrulanır — API-105) | `{serverURL?, projectDir?, theme?, locale?, density?, notifications?}` | `Settings` | `E_BAD_REQUEST, E_INTERNAL` |
| `kv:secret:set` | v1 | ✓ | ✓ `confirmToken` **ZORUNLU** (v2.2.2) | `{password, confirmToken}` | `{secretState}` | `E_CONFIRM_REQUIRED, E_BAD_REQUEST, E_INTERNAL` |
| `kv:secret:state` | **YENİ** | — | — | `{}` | `{secretState:"stored"\|"missing"\|"corrupt"}` | `E_INTERNAL` |
| `kv:roster:read` | **YENİ** | — | — | `{}` | `{roles:[{code,name,sessionID,model,status}], nextID?}` | `E_PARSE, E_NOT_FOUND` |
| `kv:roster:write` | **YENİ** | ✓ | ✓ `confirmToken` + yedek | `{rows:[{code,sessionID,model?}], reason}` | `{backupPath, writtenAt, rows}` | `E_CONFIRM_REQUIRED, E_CONFLICT, E_BAD_REQUEST, E_PARSE` |
| `kv:event:subscribe` | **YENİ** | — | — | `{types?:string[]}` | `{subscribed:true, types:[…]}` | `E_OFFLINE, E_UNAUTHORIZED` |
| `kv:event:patch` | v1 (push) | — | — | — | `{type, data:{sessionID}, domain, seq, at, payload?}` (API-104) | — |
| `kv:event:connection` | v1 (push) | — | — | — | `{type:"connection.state", state, data:{sessionID}, at}` | — |

| # | Kural |
|---|---|
| API-84 | Yukarıdaki 21 kanal **kapalı kümedir**; listede olmayan kanal `E_UNKNOWN_CHANNEL` döner (API-50). |
| API-85 | `kv:command:sendMany` tek `confirmToken` ile roster'daki seanslara (en fazla 12 hedef) gönderir ve sonuçları tek tek döner; kısmi başarı `E_PARTIAL` + `results[]` ile bildirilir. |
| API-86 | `kv:board:write` ve `kv:roster:write` yazmadan **önce** `work/backup/<yyyyMMdd-HHmmss>/<dosya>` kopyası alır ve yolu yanıtta döner; yedek alınamazsa yazma yapılmaz (`E_CONFLICT`). |
| API-87 | `kv:board:write` iyimser kilitleme kullanır: girdideki `expectedHash` (okunan dosyanın SHA-256 ilk 16 karakteri) güncel dosyayla eşleşmezse `E_CONFLICT` ve hiçbir yazma yapılmaz. |
| API-88 | `kv:team:setLeader` yalnız `roster.md`'deki `LDR` satırının seans ID'sini değiştirir; başka satıra dokunursa `E_BAD_REQUEST`. |
| API-89 | `kv:reports:list` girdi filtreleri tamamen yereldir (sunucuya filtre gönderilmez); v2.2'de önbellek yoktur, `refresh` alanı kabul edilir ama ek etkisi yoktur. |
| API-90 | `kv:event:subscribe` ikinci kez çağrılırsa önceki abonelik kapatılır (tek SSE bağlantısı kuralı API-38). |
| API-91 | Tüm yeni yazma kanalları audit satırı üretir: `{at, op, target, from?, to?, backupPath?, key}` — metin ve parola yok (API-30). |
| API-92 | `kv:settings:set` içinde `density` ve `notifications` alanları **yalnız** yerel `config.json`'a yazılır, sunucuya gönderilmez. |
| API-98 | **`kv:team:list` çıktısı tek biçimdir (C-5, v2.2):** dönüş zarfı `{ok:true, data:{sessions:Session[], unassigned:Session[], counts:{total,inRoster,missing,outOfRoster,busy}, roster:object[], updatedAt:number}}`; `data` hiçbir zaman düz dizi değildir ve `extra`/`others` adı kullanılmaz. `counts`/`roster`/`updatedAt` **ek** alanlardır (`src/main/services/sessions.js`), tüketici yalnız `sessions`/`unassigned` ile de çalışabilir. |
| API-99 | `sessions` roster'da karşılığı olan seansları (karşılığı olmayan rol için `missing:true` yer tutucu kart dahil), `unassigned` roster'da olmayan aktif seansları taşır; iki dizi kesişmez ve aynı `sessionID` ikisinde birden bulunmaz. |
| API-102 | **`confirmToken` doğrulama (`src/main/services/confirm.js`):** token **renderer'da** üretilir (T-029); preload üretmez, yalnız iletir. Main biçimi `[A-Za-z0-9_-]{16,128}` ile doğrular; token **tek kullanım**dır, TTL **5 dk**'dır. Kural etiketleri: `missing` (yok/boş), `format` (desen uymuyor), `reuse` (daha önce kullanıldı), `expired` (TTL aşıldı → **kalıcı red**, `spentAt` işaretlenir), `capacity` (depo tavanı 10.000 → fail-closed red). Tümü `E_CONFIRM_REQUIRED` döner; reddetme kaydı **silinmez** (replay kapalı). |
| API-103 | **Payload normalizasyonu (`src/main/services/payload.js`, `main.js` `wrap`):** her invoke girdisi servise girmeden önce normalize edilir — `sessionId → sessionID`, `sessionIds → sessionIDs`, `taskId`/`taskID` her zaman **büyük harf** (`t-9 → T-9`), `model` çift yönlü (`{providerID,id}` → `"provider/id"` + `modelRef`; `"provider/id"` → `modelRef`). Renderer serbest ad, servis **sözleşme adı** görür. |
| API-104 | **SSE/push zarfı (v2.2):** `kv:event:patch` gövdesi `{type, data:{sessionID}, domain, seq, at, payload?}`; `kv:event:connection` gövdesi `{type:"connection.state", state, data:{sessionID}, at}`. Abone olunan olay kümesi API-74'ün alt kümesidir ve **37 ad** taşır (`src/main/services/events.js` `EVENT_TYPES`): `server.connected` + `session.*` (28) + `permission.*` (2) + `model/provider/agent/config/project/filesystem.*` (6). Zarf alanı `data.sessionID` olay gövdesinden `pickEventRef` ile çıkarılır; yoksa `null`. |
| API-105 | **`kv:settings:set` onay muafiyeti (bilinçli tasarım kararı — v2.2.2'de kapsamı netleşti):** kanal yalnız **yerel** `config.json`'a yazar (ağa çıkmaz, silmez, **sır yazmaz**; sır ayrı kanaldadır: `kv:secret:set`) → `confirmToken` **gerekmez**. Token **verilirse** tek kullanım olarak doğrulanır (API-102 gevşetilmez). Audit satırı `keys` listesiyle üretilir; `confirmToken` audit'e yazılmaz. Gerekçe koda **yorum olarak** yazılıdır (`src/main/main.js:370-378`). **Muafiyet yalnız bu kanal içindir:** yeni bir yazma kanalı açılırsa `confirmToken` **varsayılan olarak zorunludur**, muafiyet ayrı bir ARC kararı ister (API-51). |

### 9.2 `Report` DTO (yeni — §4'e ek, v2.2 koda eşitlendi)

| Alan | Tip | Not |
|---|---|---|
| `taskId` | `T-\d{3}[A-Za-z0-9-]*`\|null | başlıktan, **büyük harf** (API-103) |
| `role` | string | `ARC/DEV/…`; mesaj kaydında yoksa `session.role` |
| `status` | `TAMAM\|KISMİ\|BLOKE`\|null | `parseReport` normalize eder |
| `ozet`, `kanit`, `risk`, `karar` | string | bulunmayan alan **boş string** |
| `files` | string[] | `,;\n`/`·` ile ayrılır; yoksa `[]` |
| `raw` | string | ham blok (en fazla 4.000 karakter, `TEXT_MAX`) |
| `id` | string | `"<sessionID>:<messageID>"` veya `"file:<dosya>"` / `"log:<dosya>"` |
| `sessionID` | string\|null | mesaj kaynaklıysa seans |
| `messageID` | string\|null | mesaj kaynaklıysa |
| `sessionRole` | string\|null | yalnız mesaj kaydında |
| `at` | string (ISO-8601) \| null | mesaj `time.created`; dosya kaydında `null` |
| `source` | `"message"\|"file"` | API-82 |
| `file` | string\|null | dosya kaynaklıysa **dosya adı** (`filePath` alanı yoktur) |

**Kanıt:** `src/main/services/messages.js` `parseReport` + `src/main/services/reports.js` `readReportFiles`.

---

## 10. Yazma güvenliği (politika katmanı)

| # | Kural |
|---|---|
| API-41 | E07/E08/E14 yalnız tek kullanımlık `confirmToken` ile çağrılır. **Üretim renderer'dadır** (T-029: onay modalini geçen arayüz kendi anahtarını üretir); preload üretmez, yalnız iletir. Main doğrular: biçim `[A-Za-z0-9_-]{16,128}`, **tek kullanım**, **TTL 5 dk** ve süresi dolmuş anahtar kalıcı red (`src/main/services/confirm.js`, ayrıntı API-102). |
| API-42 | Kota: 10 sn içinde en fazla 3 yazma isteği; aşılırsa `E_RATE_LIMIT` (yerel) ve istek gönderilmez. |
| API-43 | `confirmToken` yoksa `E_CONFIRM_REQUIRED`; bu durum audit'e `blocked` olarak yazılır ve UI'a sessizce dönülür. |
| API-44 | E07/E08 başarısızsa iyimser UI güncellemesi 5 sn içinde geri alınır; kullanıcıya "gönderilemedi" gösterilir. |
| API-45 | Parola değiştiğinde tüm açık bağlantılar kapatılır ve E01 ile yeniden doğrulanır. |

---

## 11. Örnek akış — tek komut (uçtan uca)

```text
[renderer] click data-action="confirm-send"
   → ipc.invoke("command:send", {sessionID, text, confirmToken})
[main] CommandService
   1. confirmToken doğrula (API-41)           → yoksa E_CONFIRM_REQUIRED
   2. kota kontrolü (API-42)                  → aşıldıysa E_RATE_LIMIT
   3. metin 1..8000 (API-16)                  → değilse E_BAD_REQUEST
   4. audit: {op:"prompt",target,chars,key}   (metin yok)
   5. POST /api/session/{id}/prompt {text}
      headers: Authorization, x-opencode-directory, X-Idempotency-Key
   6. 200 → {ok:true,data:{sentAt}} ; 409 → E_BUSY ; 401 → E_UNAUTHORIZED …
   7. audit: sonuç kodu
[renderer] "Gönderildi" + mesaj listesini yenile (E06)
```

---

## 12. Denetim listesi (K2/QA)

| # | Denetim | Beklenen |
|---|---|---|
| A1 | `Select-String -Path src/main -Pattern 'fetch\('` | yalnız `src/main/opencode/client.js` |
| A2 | `Select-String -Path src/renderer,src/preload -Pattern 'Authorization\|apiKey\|password'` | yalnız `data-field="password"` (UI) ve preload'da `password` **kanal adı** yok |
| A3 | Mapper çıktısı: `node -e` ile örnek yanıt map'lenir | `apiKey` ve `password` anahtarı **yok** |
| A4 | `Select-String -Path src/main -Pattern 'x-opencode-directory'` | en az 1 (API-04) |
| A5 | Kod tablosu: `E_` kodları `errors.js`'te | §5.2'deki 18 kodun tamamı |
| A6 | SSE: bilinmeyen `type` gönderilir (elle) | uygulama çökmez, 2 sn içinde E03 yenilenir |
| A7 | Sunucu kapatılır (elle) | 5 sn içinde `offline`, açılınca 30 sn içinde toparlanır |
| A8 | Yanlış parola 5 kez (elle) | 6. denemede istek gitmez, `E_LOCKED_OUT` |
| A9 | Audit dosyası okunur | metin/parola yok, `idempotencyKey` var |
| A10 | `confirmToken` olmadan `command:send` çağrılır (birim testi) | `E_CONFIRM_REQUIRED`, HTTP isteği **yok** |
| A11 | `Select-String -Path src -Pattern 'session\.updated\|message\.updated\|session\.error'` | **0 eşleşme** (API-74: v1 olay adları kullanılmaz) |
| A12 | `Select-String -Path src -Pattern 'DELETE\|deleteSession\|session.remove'` | **0 eşleşme** (API-60) |
| A13 | `Select-String -Path src -Pattern 'archived'` | `PATCH` yolu var, `DELETE` yok |
| A14 | `Select-String -Path src/shared/ipc-channels.js -Pattern 'kv:'` | §7.2'deki **100 kanal** (95 invoke + 5 push); §9.1 yalnız Tur 2 tarihsel kaydıdır |
| A15 | `kv:board:write` yanlış `expectedHash` ile çağrılır | `E_CONFLICT`, dosya **değişmemiş** |
| A16 | `kv:roster:write` sonrası `work/backup/**` kontrolü | zaman damgalı yedek var |
| A17 | Mapper: `type:"user"` mesajı | metin üst düzey `text`'ten alınmış (API-70) |
| A18 | `kv:reports:list` gerçek RAPOR içeren seansla | en az 1 rapor, `status` ve `taskID` dolu |
| A19 | `kv:team:add` mevcut `roleCode` ile çağrılır | `E_DUPLICATE_ROLE`, **HTTP isteği yok** (API-94), `POST /api/session` logda görünmez |
| A20 | `kv:team:list` dönüşü incelenir | `data.sessions` ve `data.unassigned` iki dizi; düz dizi veya `extra` yok (API-98/99) |
| A21 | Sunucu keşfi kapalı ortamda çalıştırılır | yalnız kayıt dosyaları okunur, port taraması yok, en fazla 10 aday (API-96) |

---

## 13. Açık noktalar (YM'e bilgi, engel değil)

| # | Konu | Durum |
|---|---|---|
| O1 | ~~SSE olay adları (§6.1)~~ **kapandı (v2.1):** gerçek ad listesi §8.7'de, eski §6.1 tablosu silindi (API-74). |
| O2 | `GET /api/session/active` bu makinede `{"data":{}}` döndü; dolu hâlin anahtar biçimi T-011'de doğrulanacak. |
| O3 | `/api/event` yanıtının tam zarfı (`event:`/`data:` satırları) canlı testte doğrulanacak; istemci yalnız `data` JSON'unu ayrıştırır. |
| O4 | Parola kaynağı (R2) hâlâ en yüksek risk; kurulum modeli Lider onayına bağlı (T-008 D2). |
| O5 | ~~**S-3 · `cost`**~~ **kapandı (v2.2.1, T-047 ile tamamlandı):** YM kararı "bilinmiyorsa `null`" **geçerli**; `cost` tipi `number\|null` (§4.1). **Kod uyuyor:** T-042 ile doğrulandı (`sessions.js:41`; `work/probe-cost.js` 19/19 — gerçek `0` korunur, string/NaN/Infinity → `null`). Sözleşme ile kod arasında açık sapma **kalmadı**. |
| O6 | ~~**`parseReport` bilinmeyen `## Başlık`**~~ **kapandı (v2.2.1):** YM kararı — kod **doğru**, bilinmeyen başlık açık etiketin içeriğine **eklenir** (içerik kaybı yok). API-81 bu davranışı + arşiv ölçümünü (42 başlık / 11 dosya) yazar. |
| O7 | **Kapsam dışı, kodda karşılığı doğrulanmadı (DOĞRULANMADI):** API-42 (10 sn / 3 yazma kotası), API-54 (bilinmeyen girdi alanında `E_BAD_REQUEST`), API-55 (invoke 10 sn zaman aşımı) — `src/main` içinde kota/alan doğrulaması/invoke timeout kodu **yok**. T-037 kapsamı bunları değiştirmedi; Tur 3'te DEV kararı gerekir. |

*Son - ARC · API sözleşmesi v2.2.1 · T-043.*
