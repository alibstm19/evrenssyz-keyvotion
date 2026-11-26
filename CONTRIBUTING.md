# Contributing to Keyvotion Console

Thanks for taking the time to contribute. This project is a local-first Windows
desktop console; please keep changes small, measured and reversible.

## Development setup

```bash
# Node 22 or newer (26 recommended)
cd src
npm ci
npm start          # launches Electron with the app
```

`npm` may be `npm.cmd` on Windows PowerShell.

## Architecture rules (non-negotiable)

- Runtime dependency is **only** `electron`. Do not add npm packages.
- `src/renderer/**` has **no network**: CSP is `connect-src 'none'`; `webview`,
  `iframe`, `innerHTML` and inline `style=""` are forbidden.
- Raw colors live only in `src/renderer/styles/`.
- All privileged work (disk, network, MCP, models) happens in `src/main/**`.
- Every IPC channel is declared in `src/shared/ipc-channels.js` and mapped 1:1
  in `src/preload/preload.js`. Write channels require `confirmToken`.
- Never commit secrets. `.env*` is ignored; only `.env.example` is tracked.

## Quality gates

Run all four before opening a pull request:

```bash
node work/tap-count.js tests     # test totals, 0 failures
node tools/doctor.js             # 0 FAIL / 0 WARN
node tools/k3.js                 # quality gate PASSED
node work/html-check.js          # HTML DENGELI (balanced)
```

CI runs the same gates on Windows and Ubuntu with Node 22 and 26.

## Branches and commits

- Branch from `master`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`.
- Commit messages in English, imperative mood: `fix(remote): return 413 before closing socket`.
- One logical change per commit; body explains *what* and *why*.

## Adding an integration

1. Add the provider to `src/main/services/integration-catalog.json`
   (`id`, `name`, `category`, `auth`, `hosts`, `health`, `fields`, `capabilities`).
2. Add the template to `src/main/services/connection-presets.json`
   (`kind: "integration"`, same `refId`).
3. Add a test under `tests/` and run the four gates.

## Adding a screen

1. Register the id in `docs/console-ui-contract.md` §2.
2. Add the section + nav link in `src/renderer/index.html`.
3. Add a `turXX.css` layer using existing `--kv-*` tokens.
4. Wire the channel (declaration, preload, main handler). No new channels for
   existing features — reuse what is there.
5. Run the four gates and the smoke test (`node work/ldr-smoke.js`).

## Reporting bugs

Use the issue templates. Include Windows version, app version, steps to
reproduce and console output. Never paste API keys; redact tokens.
