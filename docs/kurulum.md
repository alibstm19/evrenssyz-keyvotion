# Keyvotion Console — Kurulum ve Çalıştırma

> Durum: **v3.4.0 yayına hazır** (2026-11-25). Bu belge çalıştırma adımlarını ve
> bağlantı gereksinimlerini anlatır. Mimari: `docs/architecture.md`,
> sözleşme: `docs/console-api-contract.md`.

## 1. Ön koşullar

| Gereksinim | Sürüm | Not |
|---|---|---|
| Windows | 10 / 11 | x64 |
| Node.js | v26.x | `node -v` ile kontrol |
| npm | `npm.cmd` üzerinden | **çıplak `npm` PowerShell politikası nedeniyle kırılır** |

## 2. Kurulum

```powershell
cd src
npm.cmd install
```

Bu komut yalnız `electron@45.2.1` paketini kurar. Başka bağımlılık **yoktur** (K1 P5 kuralı).

> Not: Electron binary'si indirilmezse (postinstall atlanırsa):
> ```powershell
> cd src\node_modules\electron
> node install.js
> ```
> Doğrulama: `src\node_modules\electron\dist\electron.exe --version` → `v45.2.1`

## 3. Çalıştırma

```powershell
cd src
npm.cmd start
```

Pencere 3 saniye içinde açılır. Başlıkta **Keyvotion Console**, sağ üstte bağlantı durumu rozeti görünür.

## 4. OpenCode bağlantısı (zorunlu)

Console, çalışan bir OpenCode sunucusuna bağlanır ve **her uç kimlik doğrulama ister**
(`/api/info` dahil). Yönetilen sunucunun parolası diske yazılmadığı için kullanıcıdan istenir.

**Önerilen işletim düzeni (K1 §4.2 / karar D2):**

1. OpenChamber'i bilinen bir parolayla başlat:
   ```powershell
   $env:OPENCODE_PASSWORD = "<güçlü-parola>"
   ```
2. Console'u aynı ortam değişkeniyle aç:
   ```powershell
   $env:OPENCODE_PASSWORD = "<güçlü-parola>"
   cd src; npm.cmd start
   ```
3. Console parolayı ileride DPAPI (`safeStorage`) ile `secrets.bin`'de saklayacak (T-016+).

### Bağlantı durumları

| Rozet | Anlam | Ne yapmalı |
|---|---|---|
| Bağlı | `/api/info` → 200 | — |
| Yetkisiz | 401 — parola yanlış | Parolayı kontrol et |
| Parola gerekli | `OPENCODE_PASSWORD` tanımsız | Ortam değişkenini ayarla |
| Erişilemez | Sunucu kapalı / port yanlış | OpenChamber açık mı? Port doğru mu? |

Varsayılan adres: `http://127.0.0.1:51764` (K1 §4.1 keşif sırası).

## 5. Proje kapsamı

Console, isteklerde `x-opencode-directory: %USERPROFILE%\Keyvotion` başlığını gönderir.
Bu başlık olmadan sunucu kendi çalışma dizinini kullanır ve **yanlış projeyi** gösterir (K1 §4.2).

## 6. Testler

```powershell
node work\test-tap.js
```

Bu betik testleri çalıştırır ve **yalnız başarısız olanları** gerekçesiyle listeler; son satırda `TOPLAM FAIL: N` yazar. Hedef **0**'dır.

> **Neden `node --test tests/` değil?** Windows'ta `node --test` çıktıyı keser ve `TOPLAM FAIL` satırını göstermez; "geçti" sanılan bir koşu aslında gizli hata taşıyabilir. `test-tap.js` TAP çıktısını ayrıştırıp sayıyı kesin verir.

Kalite kapıları (hepsi `exit 0` vermeli):

```powershell
node tools\doctor.js                  # ortam + bağımlılık denetimi
node work\smoke\k3.js                 # uçtan uca duman testi (7 adım)
node work\probe-security.js           # sır/CSP/preload denetimi
node work\probe-report-integrity.js   # arşiv raporları bütünlüğü
```

## 7. Sır kuralları

- Parola **hiçbir zaman** `config.json`'a, loga veya renderer'a yazılmaz.
- `src/renderer/**` altında `apiKey`, `password`, `Authorization` geçmez (K2 denetimi).
- Renderer ağ erişimi yapamaz: CSP `connect-src 'none'`.

## 8. Hızlı başlatma

Uygulamayı konsol pencereleriyle uğraşmadan başlatmak için:

- **Görünmez Mod:** `tools\Keyvotion Console.vbs` dosyasına çift tıklayın.
- **Debug Modu (Remote DevTools):** Terminalde `powershell -ExecutionPolicy Bypass -File tools\start.ps1 -Dev` çalıştırın. Uygulama `9333` portunda CDP debug desteği ile açılır.

## 9. Portatif paket

Kurulum gerektirmeyen taşınabilir sürüm üretmek için:

```powershell
powershell -ExecutionPolicy Bypass -File tools\package.ps1 -Force
```

**Yapı ve Kullanım:**
Paket `dist\Keyvotion Console\` altına hazırlanır:
- `Keyvotion Console.vbs`: Çift tıkla başlat (sessiz).
- `launch.ps1`: PowerShell üzerinden başlat.
- `electron\`: Runtime binary'leri.
- `VERSION.txt` & `README.txt`: Meta bilgiler.

`-Force` parametresi hedef dizini tamamen temizler ve tertemiz bir paket üretir.


## 10. Bilinen sınırlamalar (ölçülmüş)

Bu bölümdeki her madde **ölçümle** doğrulanmıştır; tahmin yoktur.

**1) Parolasız ortamda sunucuya giden kanallar çalışmaz.** `OPENCODE_PASSWORD` (ya da `secrets.bin`) yoksa sunucuya istek **gönderilmez**; çağrı `E_SECRET_MISSING` döner (kilit: `tests/server/server-manager.test.js`). Konsol açılır, parolasız da gezilen dosya tabanlı ekranlar (pano, ekip, ayarlar, model kataloğu, raporlar) çalışmaya devam eder — sözleşmedeki 109 kanalın tam listesi ve hangi kanalın sunucu istediği: `docs/console-api-contract.md` §7.

**2) `GET /api/info` yönetilen sunucuda 401 döner.** Yönetilen OpenCode sunucusunun parolası diskte tutulmaz (DPAPI ile işletim sistemi kasasındadır). Bu yüzden konsol, gerçek "bağlı" veriyi ancak kullanıcı parolayı girdiğinde gösterir.

**3) Maliyet bilinmiyorsa `— $` yazılır, `0.00 $` yazılmaz.** Sunucu maliyet döndürmezse `cost` değeri `null`'dır ve toplam satırı "N seansın maliyeti sunucudan gelmedi" ipucunu taşır. Bilinmeyen veri toplama 0 olarak katılmaz — bu kasıtlıdır.

**4) `E_PARTIAL` / `E_PASSWORD` / `E_SCAN_LIMIT` üretilmez.** `command:send` tek seans için çalışır; çoklu gönderim (`API-85 sendMany`) v3.2.0'da **uygulanmadı**, dolayısıyla bu üç kod kod tabanında yok (denetim: `tests/c12-api-contract.test.js`).

**5) Gömülü görünüm konsol içiyle sınırlıdır.** `<webview>` ve `<iframe>` yasaktır (CSP `frame-src 'none'`); adres çubuğu yalnız `kv://` şemalı iç ekranlara gider. Dış web sayfası açılmaz — bu renderer'ın ağ erişiminin kapalı olmasının (`connect-src 'none'`) doğal sonucudur.

**6) Sürüm kontrolü açıktır (ölçüldü 2026-11-24).** `git version 2.56.0.windows.4`, dal `master`; commit geçmişi bu depoda mevcut. Paket ve ZIP `dist/` altında üretilir (`node tools/package.js --verify --zip`); **push, sürüm etiketi ve GitHub release** hâlâ bakımcı kararıdır ve onaysız yapılmaz (sıra: `docs/release.md` §4).


## 11. Karakter Kodlaması ve UTF-8 (KRİTİK)

Projeye katkıda bulunan tüm ajanlar ve geliştiriciler, dosya yazarken **UTF-8 (without BOM)** standartını kullanmalıdır. Yanlış kodlama, özellikle Türkçe karakterlerde "mojibake" (karakter bozulması) ve rapor ayrıştırma hatalarına yol açar.

- **Güvenli Yazım (Node.js):** `fs.writeFileSync(path, content, 'utf8')` veya `fs.writeFile(...)`.
- **Güvenli Yazım (PowerShell):** `[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))` (BOM'suz) veya PowerShell 7'de `Out-File -Encoding utf8NoBOM`.
- **UYARI:** Windows PowerShell 5.1'de `Out-File -Encoding utf8` ve `Set-Content -Encoding utf8` **BOM ekler**; belgenin "BOM'suz UTF-8" kuralıyla çelişir. Bu yüzden `Out-File` tek başına önerilmez.
- **Kaçınılması Gerekenler:** Basit `>` yönlendirmeleri veya varsayılan `Out-File` (Windows PowerShell'de genellikle UTF-16 veya ANSI yazar), `Set-Content` (encoding belirtilmemişse).

