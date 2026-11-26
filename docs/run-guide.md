# Keyvotion Console — çalıştırma rehberi (v3.3)

## Hızlı başlangıç

Proje kökünde çift tıkla: **`start.cmd`**

Elle çalıştırmak istersen:

```powershell
cd %USERPROFILE%\Keyvotion\src
npm.cmd start
```

> `npm` bu makinede yalnız `npm.cmd` olarak çalışır (PowerShell script politikası).
> Tek bağımlılık `electron` **45.2.1**; `node_modules` yoksa bir kez `cd src; npm.cmd install`.

## Neler var (ölçülmüş)

| Alan | Sayı |
|---|---|
| Ekran (sol menü) | **23** — `connect` = **Hazır Bağlantılar** |
| Stylesheet katmanı | **19** (son katman `prototip.css`) |
| IPC kanalı | **111** (106 invoke + 5 push), yazma **45** |
| Tasarım token | **117** tekil ad (**785** tanım; `tokens.css` 107) |
| Hazır bağlantı preseti | **124** (64 entegrasyon + 60 MCP) |
| Entegrasyon yeteneği | **195** (64 sağlayıcı) |
| MCP şablonu | **60** |

## Hazır bağlantılar (yeni)

Sol menüde **Hazır Bağlantılar**:

1. **Ara / filtrele** — 2+ karakter yaz, tür (Entegrasyon / MCP) ve kategori seç; sayaç canlı güncellenir.
2. **Karta tıkla** — sağda "nasıl alınır" adımları (**numaralı**, tıklanır bağlantıyla) ve gerekli alanlar gelir.
3. **Alanları doldur** — sır alanları `password` olarak açılır, "göster" ile açabilirsin.
4. **Bağlan** — onay istenir (`confirmToken`); sonuç üç yoldan biri:
   - `oauth2` → tarayıcıda onay bağlantısı (anahtar yazmadan),
   - `token`/`basic` → bağlantı kaydedilir (değer `safeStorage` ile şifrelenir, ekrana geri dönmez),
   - MCP `install` → sunucu kurulur.
5. **Votion bu bağlantıyı kullanabilir** anahtarı — asistanın o bağlantıyı kullanmasına izin verir.

## Votion asistanı

- `kv:votion:tools` manifesti asistan bağlamına **195 yetenek + 60 MCP aracı**nı verir
  (manifest **22 306 B**, bağlam bloğu **14 799 B**, sınır 24 000 B).
- `kv:votion:invoke` çağrıyı mevcut entegrasyon/MCP yoluna taşır; her çağrı **denetime** yazılır,
  kayıt yalnız `{op, capabilityId, status}` — **parametre ve sır yazılmaz**.
- Ödeme/satış sağlayıcıları (stripe, paypal, square, gumroad, lemon-squeezy) dahil **bütün
  bağlantılar her kullanıcıda görünür**; görünüm rolü T-209 ile kaldırıldı. Yazma yine
  `confirmToken` + izin matrisinden geçer.

## Doğrulama (istediğin an)

```powershell
cd %USERPROFILE%\Keyvotion
node work\tap-count.js tests   # 307 / 307 / 0
node tools\doctor.js           # 0 FAIL / 0 WARN
node tools\k3.js               # PASSED
node work\html-check.js        # DENGELI
node work\ldr-smoke.js         # uygulamayı açar, 23 ekranı gezer, 124 kart sayar
```

## Bilinen sınırlar

- Sürüm kontrolü **açık** (ölçüldü): `git 2.56.0.windows.4`, dal `master`. Push / sürüm etiketi
  bakımcı kararıdır (`docs/release.md` §4).
- **Paket hazır:** `dist\Keyvotion Console\Keyvotion Console.exe` **238,2 MB** ve
  `dist\Keyvotion-Console-win32-x64-v3.4.0.zip` **162,7 MB**; özet `dist\SHA256SUMS.txt`.
  Kaynaktan çalıştırma da geçerli: `cd src; npm.cmd start`.
- Votion'un **gerçek mikrofon** uçtan uca testi bu donanımda ölçülemedi.
- `build\Keyvotion Console\resources\app\` **eski 0.1.0** kopyasını içerir — kullanma;
  güncel çalıştırma `src/`, güncel paket `dist/`.
