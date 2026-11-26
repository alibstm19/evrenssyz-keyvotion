# Kadro — açık kaynak başlangıç iskeleti

Bu dosya **örnek** bir kadrodur: herkes kendi `roster.md` dosyasını bu tablodan
türetir. Seans kimlikleri gerçek seanslar açıldığında uygulama tarafından yazılır;
buradaki `ses_seed…` değerleri yalnız biçim örneğidir.

| Rol | Kod | Sorumluluk | Açılış modeli (varsayılan) | Seans |
|---|---|---|---|---|
| Lider | LDR | Kullanıcının temsilcisi; hedef verir, raporları denetler | `evren/deepseek-v4.1-flash` | `ses_seed000000000000000000001` |
| Proje Yöneticisi | YM | Görev dağıtımı, takip, rapor derleme | `evren/qwen3.8-flash-next` | `ses_seed000000000000000000002` |
| Mimar | ARC | Teknik plan, şema, dosya çakışması bölme | `evren/deepseek-v4.1-flash` | `ses_seed000000000000000000003` |
| Yazılımcı | DEV | Özellik kodu ve düzeltme | `evren/gemma-4-31b` | `ses_seed000000000000000000004` |
| Tasarımcı | DSN | Arayüz, UX, görsel doğrulama | `evren/qwen3-vl-30b` | `ses_seed000000000000000000005` |
| Test Yazılımcısı | QA | Test yazımı ve kalite kapıları | `evren/glm-5.3` | `ses_seed000000000000000000006` |
| DevOps | OPS | Otomasyon, derleme ve sürüm süreçleri | `evren/gemma-4-31b` | `ses_seed000000000000000000007` |

## Rol kuralları

- Her rol kodu tekil olmalıdır (2–6 karakter, harfle başlar).
- Bir rolün tek bir aktif seansı olur; değişim `roster.write` ile yapılır.
- Model seçimi role bağlı değildir; görev niteliğine göre `models.md` havuzundan seçilir.
