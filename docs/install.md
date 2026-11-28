# Installation

Keyvotion Console runs on **Windows 10/11 (x64)**. All data stays on your
machine; no account and no server are required.

## Hazır Windows paketi

1. ZIP arşivinin tamamını yeni bir klasöre çıkarın.
2. **Kur.cmd** masaüstü ve Başlat menüsü kısayollarını oluşturur. Taşınabilir kullanım için **Keyvotion Console.exe** dosyasını açın.
3. **Temiz-Deneme.cmd** ilk açılışı ayrı bir geçici profil ve proje klasörüyle gösterir. Eski ayar ve sohbetler bu oturuma yüklenmez.
4. İlk ekranda ürün tanıtımını izleyebilir, **Bağlantı kurmadan gez** seçeneğiyle arayüzü deneyebilir ya da **Model bağla** ile sağlayıcı ekleyebilirsiniz.
5. **Ayarlar → Yerel sunucu** üzerinden OpenCode durumuna bakabilirsiniz. OpenCode ayrıca kurulmuşsa konsol yerel sunucuyu başlatabilir.

### Where do I get an API key?

| Provider | Where |
| --- | --- |
| OpenAI | platform.openai.com → API keys |
| Anthropic | console.anthropic.com → API keys |
| Google Gemini | aistudio.google.com → Get API key |
| OpenRouter | openrouter.ai → Keys |
| Ollama | no key — install Ollama locally and use `http://127.0.0.1:11434` |

## Option B — From source

Requirements: Node.js **22 or newer** (26 recommended) and npm.

```powershell
git clone <this-repository> keyvotion
cd keyvotion\src
npm ci
npm start
```

On PowerShell, `npm` may need to be called as `npm.cmd`.

## Building a portable package

```powershell
node tools/package.js --verify --zip
```

This copies the local Electron runtime into `dist\Keyvotion Console\`, renames
the executable, launches it on a debug port to confirm the window opens, and
writes `dist\Keyvotion-Console-win32-x64-v3.4.0.zip`.

## Data locations

| What | Where |
| --- | --- |
| Settings | `%APPDATA%\keyvotion-console\` |
| Secrets | OS keystore via Electron `safeStorage` (encrypted) |
| Project files, board, reports | your project folder (`.team/`, `docs/`) — local only, not in the repo |

Kurulumu kaldırmak için kurulum klasöründeki `Kur.cmd /Kaldir` komutunu kullanın. Proje ve profil verileri korunur.

## Troubleshooting

- **Blank window** — run from a terminal to see logs; make sure the `resources`
  folder sits next to the executable.
- **"Port already in use"** — the local server picks another port
  automatically; check **Settings → Server**.
- **Antivirus blocks the exe** — the build is unsigned; allow it in your
  antivirus or build from source.
- **API key rejected** — press **Test** on the provider card; the message tells
  you whether the key, the model name or the network is the problem.

More questions: see [`docs/faq.md`](faq.md).
