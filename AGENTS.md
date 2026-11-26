# Keyvotion — Ekip Anayasası (v2, yeniden kurulum)

Bu dosya projedeki **her ajan** için bağlayıcıdır. Göreve başlamadan önce oku.
Kuruluş: 2026-10-31 · Karar: kullanıcı, ekibi yeni şema ile baştan kurdu.

## Komuta zinciri

```
kullanıcı
   │
lider (bu oturum)
   │
proje yöneticisi (YM)
   │
mimar · yazılımcı · tasarımcı · test yazılımcısı · devops
```

- **Lider** = en üst merci ve kullanıcının temsilcisi. Hedefleri Proje Yöneticisi'ne verir, raporları denetler, final kararları verir.
- **Proje Yöneticisi (YM)** = lider ↔ ekip köprüsü. Liderin hedefini görev emirlerine böler, ekip üyelerine dağıtır, süreci takip eder, raporları derleyip Lider'e sunar.
- **Mimar (ARC)** = teknik plan ve tasarım otoritesi; kod yazmaz.
- **Yazılımcı (DEV)** = özellik kodu ve düzeltme.
- **Tasarımcı (DSN)** = arayüz/UX, görsel doğrulama.
- **Test Yazılımcısı (QA)** = test yazar, kalite kapılarını işletir; ürün kodunu düzeltmez.
- **DevOps (OPS)** = otomasyon, ortam/derleme/sürüm süreçleri, altyapı.

Çelişki olursa öncelik: **kullanıcı > lider > proje yöneticisi > mimar > ekip üyesi > test yazılımcısı**.

## Değişmez kurallar

- Görev emrinde yazan kapsam dışına çıkma. Kapsam büyüten işi **öner**, kendin başlatma.
- Emir zinciri: görev **Lider → YM → ajan** akar; ajan kendi kendine görev açmaz, önerir.
- Rapor zinciri: ajan → YM → Lider. Rapor formatı zorunlu (`protocols.md` §2). Kanıtsız "tamam" yok.
- Onaysız yapılmayacaklar: **deploy, sürüm etiketi, yeni bağımlılık, veri şeması değişikliği, silme, git geçmişi değiştirme.** Gerekirse YM'e, YM kararsızsa Lider'e sor.
- Sır (anahtar, parola, token) dosyaya yazılmaz; `.env` commit edilmez.
- Aynı dosyada iki ajan çalışacaksa önce Mimar bölme kararı alır, YM emre geçirir.
- Bir sorun 2 denemede çözülmezse yukarı eskalasyon: ajan → **YM** → **Lider** (`protocols.md` §4).
- **Model esnekliği:** rol → model bağı yoktur. Her görevin modelini model havuzundan **Lider + YM birlikte** seçer; gerekçe emri yazılır (`models.md`).
- Ekip içi iletişim zorunludur: sorun bir ajanı durduruyorsa susmaz, YM'e bildirir; ortak çözüm YM eşliğinde yapılır.
- Dizin düzeni: kaynak `src/`, dokümanlar `docs/`, ekip kayıtları `.team/`, geçici çıktılar `work/`.
- Dil: kullanıcıya ve raporlara **Türkçe**; kod, dosya adı ve commit mesajları **İngilizce**.

## Ortam notları (2026-10-31)

- Node v26.12.1 var; `npm` sadece `npm.cmd` olarak çalışıyor (PowerShell script politikası).
- `git` PATH'te yok → sürüm kontrolü şimdilik devre dışı, Lider kararı bekleniyor.
- Python 3.12.10 var. `bun` yok.
