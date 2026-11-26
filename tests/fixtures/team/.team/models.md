# Model Havuzu ve Görev→Model Kılavuzu (örnek iskelet)

Bu dosya **örnek** bir model havuzudur. Kendi sağlayıcınızın modellerini bu tabloya
yazarsınız; uygulama havuzu buradan okur (`evren/*` kimlikleri EVREN SSYZ sağlayıcısını
gösterir — kendi sağlayıcı kimliğinizle değiştirebilirsiniz).

**Politika:** Model role sabitlenmez. Her görevde Lider + Proje Yöneticisi birlikte
görevin niteliğine göre havuzdan en uygun modeli seçer.

## Havuz

| Model | Karakter | Güçlü olduğu işler |
|---|---|---|
| `evren/deepseek-v4.1-flash` | Güçlü akıl yürütme | Mimari, karmaşık kod, zor analiz |
| `evren/glm-5.3` | Sağlam genel amaçlı | Zorlu refactor, denetim, test yazımı |
| `evren/gemma-4-31b` | Orta boy genel amaçlı | Orta düzey kod, iskelet, rutin düzeltme |
| `evren/qwen3.8-flash-next` | Hızlı genel amaçlı | Koordinasyon, triyaj, özet |
| `evren/qwen3-vl-30b` | Görsel | Tasarım, ekran görüntüsü, UI denetimi |
| `evren/mimo-v2.6-pro` | Uzun bağlam | Büyük dosya analizi, doküman yazımı |
| `evren/clef` | Uzman görev modeli | Göreve göre deneme |
| `evren/laya` | Uzman görev modeli | Göreve göre deneme |
| `evren/auto` | Yönlendirici | Belirsiz görevlerde otomatik seçim |
| `evren/deepseek-ocr-2` | OCR | Görselden metin çıkarma |
| `evren/qwen3-asr-1.7b` | Ses→metin | Ses kaydı transkripti |
| `evren/qwen3-embedding-8b` | Gömme | Arama, benzerlik, RAG |

## Görev tipi → model kılavuzu (esnek; zorunlu değil)

| Görev tipi | Birincil aday | Yedek |
|---|---|---|
| Koordinasyon, görev dağıtımı, rapor derleme | `evren/qwen3.8-flash-next` | `evren/gemma-4-31b` |
| Mimari, şema, teknoloji seçimi | `evren/deepseek-v4.1-flash` | `evren/glm-5.3` |
| Zor/kritik kod (çekirdek, güvenlik) | `evren/deepseek-v4.1-flash` | `evren/glm-5.3` |
| Rutin özellik kodu ve düzeltme | `evren/gemma-4-31b` | `evren/qwen3.8-flash-next` |
| UI/UX tasarımı ve görsel doğrulama | `evren/qwen3-vl-30b` | `evren/gemma-4-31b` |
| Test yazımı, kalite denetimi | `evren/glm-5.3` | `evren/deepseek-v4.1-flash` |
| Otomasyon, ortam, derleme zinciri | `evren/gemma-4-31b` | `evren/qwen3.8-flash-next` |

