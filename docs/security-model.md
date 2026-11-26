# Güvenlik Modeli

Keyvotion Console yüksek yetkili ajanları ve hassas API anahtarlarını yönetir. Bu yüzden güvenlik tek bir duvar değil, katmanlı bir izolasyondur.

## Tehdit modeli

| Tehdit | Etki | Mevcut kontrol | Kalan risk |
| --- | --- | --- | --- |
| Prompt injection (kötü niyetli sağlayıcı yanıtı) | İzinsiz dosya silme, veri sızdırma | Yetenek bazlı erişim + yazma kanallarında `confirmToken` | Düşük — kullanıcı onayı gerekir |
| Sır sızıntısı | API anahtarının çalınması | `safeStorage` (DPAPI) + sır renderer'a hiç dönmez | Düşük |
| Sahte OAuth callback | Yetki gaspı | Loopback dinleyici + `state` doğrulaması + PKCE (S256) | Orta — yerel makinede kötü niyetli süreç |
| Zararlı MCP sunucusu | Yerel dosya/komut erişimi | Kurulum ve her çağrı için açık onay; araç listesi görünür | Orta — kullanıcı güveni |
| Renderer XSS | Oturum gaspı, kimlik avı | CSP `connect-src 'none'`, `innerHTML` yasağı, inline stil yasağı | Çok düşük |
| Yol aşımı (path traversal) | Sistem dosyası okuma | Yol normalizasyonu + proje kökü kilidi | Düşük |
| Ayrıcalık yükseltme | `student` → `admin` | Rol kontrolü main tarafında; ödeme sağlayıcıları yalnız `admin` | Düşük |
| Tedarik zinciri | Bağımlılık saldırısı | Yalnız `electron` çalışma zamanı bağımlılığı; `doctor` denetler | Çok düşük |
| LAN'a açık port (`remote.js`) | Aynı ağdaki cihazdan erişim | Yalnız özel ağ adresleri, eşleşme jetonu, 64 KB gövde, 60 istek/dk | Orta — Wi-Fi ağına güven |

## Ağ kuralı (API-01) — ölçülmüş

`work/ldr-net-map.js` ile `src/main/**` tarandı (2026-11-22):

| Yön | Dosya | Nasıl |
| --- | --- | --- |
| Outbound (dışarı) | `services/http-client.js` | Tek çıkış noktası; global `fetch` yalnız burada (host beyaz listesi) |
| Inbound (dinleme) | `services/remote.js` | `node:http` — LAN telefon erişimi (jeton zorunlu) |
| Inbound (dinleme) | `services/oauth.js` | `node:http` — loopback OAuth callback |
| Yerel ölçüm | `services/server-manager.js` | `node:net` — yalnız `127.0.0.1:51764` port yoklaması, dışarı istek yok |

Sözleşmedeki "outbound 3" **mantıksal tüketicileri** sayar (integrations, MCP istemcisi, sağlayıcı/model çağrıları); hepsi tek `http-client.js` üzerinden gider. Kodda ağ açan modül sayısı yukarıdaki gibidir. `presets.js`, `votion-tools.js` ve `voice.js` ağ **açmaz**.

## Sır yönetimi

- **Saklama:** API anahtarları ve parolalar `safeStorage` (Windows DPAPI) ile şifrelenir; diskte düz metin yok.
- **Taşıma:** Sır renderer'a **hiç dönmez**; arayüz yalnız "kayıtlı / maskeli" durumu gösterir. `secret: true` alanlar `type="password"`.
- **Log/denetim:** Hata logları ve audit kayıtları sır içermez; alanlar maskelenir (API-30).
- **`.env`:** Depoda yalnız `.env.example` (isim listesi) bulunur; gerçek değer commit edilmez.

## Denetim (audit)

Her yazma işlemi kaydedilir: `{ op, capabilityId, status }`.
- Operasyon **parametreleri** ve sır değerleri yazılmaz.
- Votion'un yaptığı çağrılar da aynı kayda düşer (yalnız `op, capabilityId, status`).

## Rol sınırı (RBAC)

Üç rol: `admin` (tam), `teacher` (orkestrasyon), `student` (sınırlı).
- Ödeme sağlayıcıları (stripe, paypal, square, gumroad, lemon-squeezy) yalnız `admin`.
- MCP sunucusu ekleme ve sistem ayarları yalnız `admin`.
- Rol kontrolü main sürecinde yapılır; renderer'a bırakılmaz.

## Votion erişimi

- **Manifest:** `kv:votion:tools` (22 306 B, sınır 24 000) — Votion'ın görebildiği araçlar.
- **Beyaz liste:** `kv:integration:invoke`, `kv:mcp:call`, `kv:preset:apply`.
- **Onay:** Her yazma çağrısı `confirmToken` ister; onaysız yürütme yok.

## Kullanıcı için güvenlik önerileri

1. API anahtarınızı kimseyle paylaşmayın; ekran görüntüsüne almayın.
2. `admin` rolünü yalnız gerçekten gereken kişiye verin.
3. Üçüncü parti MCP sunucusu eklemeden önce kaynağını doğrulayın.
4. `remote.js` ile telefon erişimini kullanmadığınızda kapatın; güvenmediğiniz Wi-Fi'da açmayın.

## Bilinen sınırlar

- **İmzasız derleme:** Kod imzalama sertifikası yok; Windows SmartScreen ilk çalıştırmada uyarı gösterebilir ("Daha fazla bilgi → Yine de çalıştır").
- **Otomatik güncelleme yok:** Yeni sürümü elle indirirsiniz.
- **Telemetri yok:** Uygulama hiçbir kullanım verisi göndermez.
- **Yerel veri düz metin:** Pano, rapor ve katalog dosyaları diskte düz metindir; yalnız sırlar şifrelenir. Ortak kullanılan bir bilgisayarda işletim sistemi hesabınızı koruyun.
