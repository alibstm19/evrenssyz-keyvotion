# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 3.2.x | Yes |
| older | No |

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private advisory flow:
**Security → Advisories → New draft security advisory** in this repository.

Include:
- affected version and Windows version,
- a minimal reproduction (steps, screenshots, logs with secrets redacted),
- impact: what an attacker could read, change or execute.

You can expect an acknowledgement within 7 days and a status update within
30 days. Please give us time to ship a fix before public disclosure.

## Scope

In scope: renderer isolation bypass, IPC/preload surface, secret storage
(`safeStorage`), path traversal in file services, OAuth callback handling,
LAN remote control (`remote.js`), MCP tool invocation, permission/RBAC checks.

Out of scope: issues that require an already-compromised OS account, social
engineering, and vulnerabilities in third-party APIs you connect to.

## Handling secrets

- Never paste API keys or tokens into issues, pull requests or screenshots.
- The app encrypts secrets with the OS keystore and never returns them to the
  renderer; logs and audit entries redact secret fields.
- `.env` files are git-ignored; only `.env.example` is tracked.

## Known limitations

- Builds are unsigned, so Windows SmartScreen may warn on first launch.
- There is no auto-update channel; download new versions manually.
- No telemetry is collected or sent.
