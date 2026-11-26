# Installation

Keyvotion Console runs on **Windows 10/11 (x64)**. All data stays on your
machine; no account and no server are required.

## Option A — Prebuilt app (recommended)

1. Download `Keyvotion-Console-win32-x64-v3.4.0.zip` from the Releases page.
2. Extract it anywhere (for example `C:\Apps\Keyvotion Console`). Keep the
   folder contents together.
3. Run `Keyvotion Console.exe`.
   The build is unsigned, so Windows SmartScreen may show a warning:
   **More info → Run anyway**.
4. Follow the three-step welcome wizard:
   - **Step 1** — pick a provider, paste your API key, press **Test**, then
     **Save**. Keys are encrypted with the Windows keystore.
   - **Step 2** — choose a ready-made connection (or skip it).
   - **Step 3** — pick a model.
5. Press **Skip** if you only want to look around; you can re-run the wizard
   from **Settings**.

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

Uninstalling is deleting the folder. Nothing is written outside the app folder
and your `%APPDATA%` profile.

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
