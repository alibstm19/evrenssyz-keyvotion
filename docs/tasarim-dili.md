# Keyvotion Console — Tasarım Dili Belgesi (v1.2)

Bu belge, uygulamanın "Modern ve Profesyonel" görünümünü korumak amacıyla belirlenen görsel kuralları içerir.

## 1. Renk ve Anlamsal Sistem
Tüm renkler anlam bazlı tokenlarla yönetilir. Ham renk kullanımı yasaktır.

| Token | Anlam | Kullanım Alanı | Yasaklanan Yer |
| :--- | :--- | :--- | :--- |
| `--kv-bg` | Ana Arkaplan | Sayfa zemini | Panel içleri |
| `--kv-bg-elev-1` | Yüzey Lv1 | Navigasyon, Topbar | Küçük butonlar |
| `--kv-bg-elev-2` | Yüzey Lv2 | Kartlar, Inputlar | Genel zemin |
| `--kv-bg-hover` | Interaction | Hover efektleri | Statik elemanlar |
| `--kv-overlay` | Maskeleme | Modal arkası karartma | - |
| `--kv-fg` | Ana Metin | Başlıklar, İçerik | Yardımcı metinler |
| `--kv-fg-muted` | İkincil Metin | Açıklamalar, Labellar | Kritik uyarılar |
| `--kv-fg-subtle` | Üçüncül Metin | Placeholder, Meta bilgi | Okunması gereken içerik |
| `--kv-border` | Standart Kenarlık | Ayraçlar, Paneller | Vurgu kenarlıkları |
| `--kv-border-strong`| Güçlü Kenarlık | Modal sınırları, Focus | Genel ayraçlar |
| `--kv-accent` | Marka/Vurgu | Butonlar, Aktif öğeler | Uyarı mesajları |
| `--kv-accent-hover`| Vurgu Hover | Accent butonu hover | - |
| `--kv-on-accent` | Accent Üzeri | Vurgu rengi üzerindeki metin | - |

### Durum ve Semantik Renkler
| Token | Anlam | Kullanım |
| :--- | :--- | :--- |
| `--kv-success` | Başarı | Pozitif geri bildirim |
| `--kv-warning` | Uyarı | Riskler ve dikkat noktaları |
| `--kv-danger` | Tehlike | Hatalar, silme işlemleri |
| `--kv-info` | Bilgi | Nötr bilgilendirme |
| `--kv-focus-ring` | Fokus | `--kv-shadow-focus` temeli |
| `--kv-state-idle` | Bekleme | Pasif kartlar, nötr durumlar |
| `--kv-state-busy` | Meşgul | Çalışan süreçler |
| `--kv-state-error` | Hata | Kritik sistem hataları |
| `--kv-state-offline`| Çevrimdışı | Bağlantı kopukluğu |
| `--kv-on-state` | Durum Üzeri | Durum renkleri üzeri metin |

## 2. Tipografi
- **Fontlar:** Sans (`--kv-font-sans`) → Arayüz; Mono (`--kv-font-mono`) → Teknik veriler.
- **Ağırlıklar:** Regular (`--kv-fw-regular`), Medium (`--kv-fw-medium`), Bold (`--kv-fw-bold`).
- **Boyutlar:** 
  - `--kv-fs-xs` (12px), `--kv-fs-sm` (13px), `--kv-fs-md` (14px), 
  - `--kv-fs-lg` (16px), `--kv-fs-xl` (20px), `--kv-fs-2xl` (26px).
- **Satır Yüksekliği:** Normal (`--kv-lh-normal`), Sıkışık (`--kv-lh-tight`).

## 3. Geometri ve Düzen
4px tabanlı sistem.

| Gruplaşma | Tokenlar | Değerler | Kullanım |
| :--- | :--- | :--- | :--- |
| **Boşluk** | `--kv-space-1`, `--kv-space-2`, `--kv-space-3`, `--kv-space-4`, `--kv-space-5`, `--kv-space-6`, `--kv-space-7`, `--kv-space-8` | 4px → 64px | Padding, Margin, Gap |
| **Grid** | `--kv-grid-gap` | `var(--kv-space-4)` | Izgara mesafesi |
| **Yarıçap** | `--kv-radius-sm`, `--kv-radius-md`, `--kv-radius-lg`, `--kv-radius-pill` | 4 / 8 / 12 / 999px | Corners |
| **Gölge** | `--kv-shadow-sm`, `--kv-shadow-md`, `--kv-shadow-focus` | - | Depth |
| **Katman** | `--kv-z-modal`, `--kv-z-toast` | 100 / 110 | Z-Index |

**Sabitler:** Sidebar: `--kv-sidebar-w` (184px), Topbar: `--kv-topbar-h` (48px), Max Width: `--kv-content-max` (1440px).

## 4. Etkileşim ve Durumlar
- **Focus:** `--kv-focus-ring` renginde 2px outline.
- **Interaction:** Hoverta `--kv-bg-hover` kullanılır. Disabled öğelerde opacity ≈ 0.5.
- **Durum Belirteçleri:** Kartlarda sol kenarlık çizgisi (`border-left`) durum tokenıyla renklendirilir.

## 5. Yoğunluk (Density)
- **Comfortable (Default):** Standart boşluklar.
- **Compact (`[data-density="compact"]`):** Veri yoğun ekranlar için paddingleri `--kv-space-2` seviyesine indirir.

## 6. Hareket
- **Timing:** Fast (`--kv-dur-fast`), Normal (`--kv-dur-normal`).
- **Curve:** Tüm geçişler `--kv-ease` kullanmalıdır.
- **Accessibility:** `prefers-reduced-motion: reduce` → Süreler 0.01ms.

## 7. Yasaklar
- **❌ Ham Renk:** #hex, rgb → ✅ Token kullan.
- **❌ Zorlama:** `!important` → ✅ Seçiciyi optimize et (yalnız `[hidden]` hariç).
- **❌ Inline Stil:** `style="..."` → ✅ Class kullan.
- **❌ Sabit Px:** `margin: 13px` → ✅ Space tokenı kullan.
- **❌ Uydurma Gölge:** Özel shadow → ✅ Shadow tokenı kullan.

## 8. Karar Kaydı & Cila Katmanı
Herhangi bir yeni token ihtiyacı için ARC onayı alınmalı ve `tokens.css` güncellenmelidir.

**Cila Katmanı (`polish.css`):** Yüksek sadakatli detaylar (mikro-interaksiyonlar, skeleton yükleyiciler, derinlik efektleri ve özel durum vurguları) bu dosyada yönetilir. Burada yapılan değişiklikler mevcut bileşen yapılarını bozmadan yalnızca görsel derinliği artırmaya yönelik olmalıdır.

