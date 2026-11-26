# FAQ

### Is my data sent anywhere?

No. Keyvotion Console has no telemetry and no cloud backend. Requests go only
to the providers you configure (and to MCP servers you install). Your board,
reports and catalogs stay on disk in plain text; secrets are encrypted with the
Windows keystore.

### Do I need an API key to open the app?

No. You can explore all 23 screens, the catalog of 124 templates and the
documentation without a key. To chat with a model you need at least one provider
key (OpenAI, Anthropic, Gemini, OpenRouter, or a local Ollama instance).

### Which models are supported?

Any model exposed by a configured provider. The model list is fetched from the
provider; local Ollama models appear automatically when Ollama is running.

### How are API keys stored?

With Electron `safeStorage`, which uses Windows DPAPI. The renderer never
receives the key — it only shows whether a key is saved. Audit entries and logs
never contain key values.

### What is `confirmToken`?

Every write action (44 channels) requires a short-lived confirmation token.
The UI asks you before changing files, settings or connections, and the main
process rejects writes without a valid token.

### What does the connection catalog include?

64 integrations with 195 capabilities (GitHub, Slack, Notion, Linear, Jira,
OpenAI, Anthropic, Stripe, …) and 60 MCP servers (filesystem, git, memory,
databases, search, …). OAuth2 is used where the provider supports it; otherwise
an API key is encrypted locally.

### Can I control the app from my phone?

Yes, on the same Wi-Fi. Enable **Remote** in the app; it shows a pairing token
and a LAN address. The server accepts only private-network clients, requires the
token on every request, limits bodies to 64 KB and requests to 60/min, and
serves no files.

### Does it work offline?

The app starts and all local features work offline. Model calls and
integrations obviously need network access.

### Why does Windows warn when I launch the exe?

The build is not code-signed yet. Choose **More info → Run anyway**, or build
from source.

### How do I update?

Download the newer ZIP and replace the app folder; your settings live in
`%APPDATA%\keyvotion-console` and are kept.

### How do I reset the first-run wizard?

Delete `onboarded` in Settings, or remove
`%APPDATA%\keyvotion-console\settings.json` to reset all settings.

### Can I add my own integration or screen?

Yes — see `CONTRIBUTING.md`. New integrations are pure JSON plus a capability
test; new screens follow the UI contract and must pass the four quality gates.

### Is there a CLI?

Not in 3.2. The product is a desktop console; scripts in `tools/` cover
packaging and verification.

### License?

MIT. See `LICENSE`.
