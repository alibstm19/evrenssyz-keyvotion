# Changelog

All notable changes to Keyvotion Console are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- **Görünüm rolü (Yönetici/Eğitmen/Öğrenci) tamamen kaldırıldı.** Her kullanıcı
  23 ekranın tamamını, Ayarlar'ın bütün bloklarını ve MCP/entegrasyonlar dahil
  her gezinme öğesini görür. Rol seçici, `viewRole` tercihi ve rol tabanlı
  gizleme kaynaktan çıktı; eski `kv.prefs.v2` değeri yok sayılır. Rol zaten
  güvenlik sınırı değildi: yazma yine `confirmToken` + izin matrisinden geçer.
- **The view-role profile (Admin/Instructor/Student) is gone.** Everyone sees all
  23 screens, every Settings block and every nav item, including MCP and
  integrations. The picker, the `viewRole` preference and all role-based hiding
  were removed rather than disabled; an old stored value is ignored. Writes are
  still guarded by `confirmToken` and the permission matrix, so nothing loosens
  in authority.

## [3.4.0] — 2026-11-26

### Fixed
- **Telefonda artık "Bağlantı Hatası" ekranı yok.** Kök neden metin değil
  CSS'ti: `.overlay { display: flex }` sınıf kuralı, `hidden` özniteliğinin
  tarayıcı varsayılanını eziyordu; bu yüzden giriş ve hata katmanları sunucu
  sağlıklıyken bile her açılışta üst üste çiziliyordu. `[hidden] { display:
  none !important }` kuralı eklendi. Gerçek tarayıcıda 390x844 ölçüldü:
  jetonlu açılışta `hata=none giriş=none durum="bağlı"`, jetonsuz açılışta
  yalnız giriş katmanı. Yeni kalıcı kapı (`tools/verify/remote-page-render.js`)
  gizleme kuralı çıkarılmış bir kopyayı negatif kontrol olarak çizer ve orada
  hatanın GÖRÜNMESİNİ şart koşar.
- **Sunucu artık kırmızıda kalmıyor.** Otomatik bağlantı tek atımlıktı ve
  sonucu arayüze bildirmiyordu; sunucu 8 saniye sonra açılsa bile gösterge
  "Çevrimdışı" değerinde donuyordu. Ana süreç artık sunucu durumunu izler,
  değiştiğinde `server.changed` yayınlar ve artan aralıkla (1.5 → 30 sn)
  yeniden başlatmayı dener; renderer bu olayı dinleyip göstergesi gerçek
  duruma çeker. Paketlenmiş exe içinde doğrulandı.
- **The phone stops showing a fatal "Bağlantı Hatası" for a transient miss.**
  The remote page opened the full-screen error card on the very first poll —
  even though the page itself had just been served by that server — and told
  every failure "Sunucuya ulaşılamıyor", hiding whether the network, the pairing
  code, the rate limit or an app-side error was at fault. The card now waits for
  two consecutive failures, retries quickly after a dropped first poll, and
  names the real cause: network unreachable, `403` wrong network, `429` too many
  requests, `500` app-side error, expired code → login. The pairing button also
  stopped hiding the login screen after a failed attempt: it acts on the real
  result. A permanent gate (`tools/verify/remote-page.js`) checks this and keeps
  the old flow as a negative control (8 checks fail there, 0 here).
- **A view role can no longer lock you out of Settings.** With the view role set
  to Eğitmen or Öğrenci, the settings screen was hidden — but the role picker
  lives inside Settings, so the only hinted way back pointed at a screen that no
  longer existed; the `Bağlantı` nav group also kept an empty label behind. All
  roles now open Settings (teacher 12 → 13 screens, student 5 → 6), a nav group
  whose items are all hidden hides with them, and the admin-only settings blocks
  (roster, skills, permissions, Votion grants) stay visible to the admin view
  only — the settings search does not bring them back.
- **No hard-coded machine path.** The app no longer defaults to a specific
  developer's folder: the OpenCode adapter and the "add agent" dialog use
  `%USERPROFILE%\Keyvotion` (settings-derived), so a fresh install works on any
  computer instead of pointing at a directory that does not exist.
- **Finishing the guided tour no longer leaves a blank, frozen window.** The
  tour marked `<html>` with `data-tour` and then looked itself up with
  `[data-tour]`; pressing Finish therefore hid the entire document. The tour
  root is now selected by class and the page marker uses a separate attribute.
- Installing on a different machine no longer breaks on first launch. The
  default project folder is now `<your home>\Keyvotion` instead of a hard-coded
  developer path, it is created on startup, and choosing a project folder in
  settings creates it too (or rejects a path that cannot be written).
- Search boxes match Turkish text when you type plain ASCII: `baglanti`,
  `yonetim` and `odeme` now find `Bağlantı`, `Yönetim Merkezi` and `Ödeme`.
  Applies to the command palette, the connection list, the catalog and the
  team/command/board/model filters.
- Single-line agent reports now yield the real role code and status instead of
  concatenated text, so the report filters show `DEV`, `QA`, `OPS` and friends.
- File pickers on the **Files** screen have accessible names, and every screen
  is tied to the shared page heading for screen readers.
- Dialogs announce their title, keep keyboard focus inside while open, and
  return focus to the button that opened them.
- The first-run wizard now selects the provider you just created instead of
  silently falling back to the first one.

### Added
- **Ayarlar genişledi: telefon, tanılama, hareket.** "Telefon (uzaktan
  erişim)" kartı uzaktan erişimi açıp kapatır, eşleşme kodunu yeniler, adresi
  kopyalar ve gerçek durumu gösterir. "Tanılama" kartı tek tuşla altı ölçüm
  yapar (köprü, yerel sunucu, parola kasası, telefon erişimi, proje dizini,
  denetim kaydı), her satırı tamam/dikkat diye işaretler ve kopyalanabilir bir
  rapor üretir — parola, jeton ve anahtar değerleri rapora yazılmaz. "Hareket:
  Azalt" geçiş ve animasyonları kapatır; "Görünümü sıfırla" yalnız görünüm
  tercihlerini onay diyaloğu arkasından sıfırlar, sunucu adresi/parola/proje
  dizinine dokunmaz. Hepsi paketlenmiş exe içinde ölçüldü (6/6 tanılama satırı,
  güvenli odak, hareket geri dönüşü).
- **Tanıtım EVREN SSYZ için yenilendi.** README, projenin EVREN SSYZ için
  yapıldığını, ana dayanağının EVRENSSYZ olduğunu ve API'lerin/API jetonlarının
  EVREN SSYZ adresinden alındığını anlatır; kurulum, özellik tablosu ve kalite
  kapıları güncel sürüme göre yeniden yazıldı.
- **Temiz başlangıç.** Depodaki ajan hafızası (`memory.jsonl`/`memory.md`)
  sohbet kayıtlarından arındırıldı; yeni kullanıcı uygulamayı ilk açtığında
  sohbet geçmişi, hafıza kaydı veya ekip verisi hazır gelmez.
- **Automatic team from a plain-language project brief.** On the team screen,
  "✨ Otomatik ekip kur" asks for a few sentences about the project and a size
  (3–9) and returns a roster proposal: one LDR plus role codes, responsibilities
  and a model chosen by work area, all previewed before anything is written.
  "Ekibi kur" appends the members to `.team/roster.md` through the existing
  roster service, behind a `confirmToken`; it updates an existing code in place
  and never deletes a row. If the model is unavailable or answers garbage, the
  planner degrades to a deterministic Turkish-keyword plan instead of failing,
  and the preview says "yedek plan". Two channels: `kv:team:plan` (read-only
  model call) and `kv:team:apply` (the only write, audited).
- **The connection is established at launch.** On startup the main process
  probes the local OpenCode server and starts it once if it is down, and the
  remote (phone) server restarts automatically when a pairing token already
  exists on disk — so a returning user's phone bookmark reconnects after an app
  restart. The window waits up to ~8 s for the server before it says
  "bağlantı kurulamadı", then loads team, reports, board, settings and memory
  without another click. First install still leaves the LAN port closed.
- **Keyvotion Prototip is the first-launch design.** A fresh profile (no saved
  preferences) opens in Prototip; a saved Klasik/Volt choice always wins, so
  nobody is switched back.
- **Two alternative design languages, switchable in place.** Settings → Görünüm
  and the topbar `◈` button now cycle **Klasik → Volt → Prototip** while the app
  keeps running. Volt (`volt.css`, v3.3) brings a new palette, a launcher rail and
  editorial typography; Prototip (`prototip.css`, v3.4, 1 896 lines) splits the
  shell into deck, canvas and panel with violet/teal surfaces, six palettes, three
  radii and per-screen treatments for all 23 screens. Both stylesheets speak only
  under their own `data-design` attribute, so the saved choice (or Prototip on a
  fresh profile) is one attribute away from classic. Measured in the running app:
  23/23 screens, no console error, no horizontal overflow, smallest of 55 buttons
  36 px.
- **Local access permission (Settings → This computer).** The app asks once
  before it may read anything outside your project folder. When granted, the
  Files screen browses your home folder and every drive; passwords, keys, `.env`
  and similar secret files are never read or listed, and the screen stays
  read-only. Revoke it any time — access closes immediately.
- **Live "thinking" indicator.** Chat, the leader desk and the side panel now
  show a spinning glyph plus a running seconds counter while the model works,
  so a slow reply no longer looks like a frozen app.
- **Crash guard.** A renderer crash or an uncaught script error now shows a
  recovery card (refresh, copy details, close) instead of a frozen white window;
  the main process reloads a crashed renderer once and records the reason.
- `tools/verify/crash-guard.js`: throws a real uncaught error in the running app
  and asserts the recovery card appears and closes cleanly.
- **Retry a failed reply.** A failed message now becomes an error card with
  **Retry** and **Copy** instead of leaving you to retype it; retrying replaces
  the old card so the thread does not fill with duplicates.
- **Copy as Markdown.** One click turns a conversation into paste-ready
  Markdown (title, date/role/model line, speaker headings, errors as quotes).
  Clipboard writes fall back to a hidden textarea when the clipboard API is
  denied, so copying works in locked-down environments too.
- **The package is reproducible.** The ZIP used to be written by
  `Compress-Archive`, which stamps every file with its disk time, so the same
  `src/` produced a different SHA-256 on each build (measured: three builds,
  three hashes, same byte count). A small dependency-free writer now emits a
  fixed 1980-01-01 timestamp and sorted entries, so a published checksum can be
  verified by rebuilding, and `SHA256SUMS.txt` stops changing on its own.
- **One command proves the release.** `node tools/verify/publish-readiness.js`
  runs the whole release proof in order — package, freshness, tests, doctor, k3,
  HTML, the three live gates, boot budget, secret scan and the owner dry run —
  never short-circuits, prints every step as one measured line and ends with a
  single `YAYIN HAZIR: EVET/HAYIR`. The exact publish commands sit at the top,
  copied-ready but never executed. CI runs the same command with `--static`.
- **The guides tell the truth about this build.** The setup and usage guides
  still said git was missing, that no packaged build existed, and that the app
  was an "MVP, turn 1" — while the repo had history and `dist/` held a working
  v3.2.0 archive. They now state the measured git version, the real artifact
  sizes and checksum, and the stale `build/` copy by its actual version; a test
  fails if any of those claims regress.
- **Quality gates pick their own port.** Every live gate used a hard-coded
  debugging port (9479–9590); a process holding that port, or a Windows range
  Hyper-V had reserved, turned a good build red at random. The gates now ask the
  operating system for a free port with `listen(0)` through `tools/verify/lib/cdp.js`,
  and a source test fails the suite if a fixed port comes back.
- **The chat talks back to screen readers.** The reply state is a polite live
  region and a send that fails is announced assertively, so the failure is not
  visible only inside the transcript.
- **Boot time is measured, not guessed.** The launch check used to poll the
  debugger every 500 ms, so its reading jumped in 500 ms steps and looked like
  a regression. It now polls every 100 ms and fails above a 3 s budget, and a
  new gate keeps the warm start under a 800 ms median.
- **One click back to the newest message.** Scrolling up used to be a one-way
  trip: a "back to bottom" button now floats over the thread while you read
  older messages and returns you to the end, leaving focus in the composer.
- **Your place in the chat holds.** A re-render no longer jumps to the end:
  the scroll position is kept unless you were already at the bottom, and
  sending a message or opening another conversation still goes to the end.
- **One action per click.** Refresh, save, send, interrupt and install buttons
  now lock themselves with `aria-busy` for the duration of the work, so a
  double click no longer sends two commands or writes settings twice.
- **Destructive actions ask first.** Archiving a project, removing a provider
  key, deleting a skill and clearing the command history used to run on a
  single click. They now open a confirmation dialog whose initial focus is on
  *Cancel*, so pressing Enter cannot delete anything by accident.
- **Notifications that announce themselves.** The bell button carries
  `aria-expanded`, the panel has a region name, focus moves into it on open and
  returns to the bell on Esc, and every toast is a live status message with a
  visible dismiss button instead of vanishing unannounced.
- **An inert background behind dialogs.** Opening a dialog marks the app shell
  `inert`, so Tab, clicks and the screen reader virtual cursor cannot reach the
  page behind it; closing releases it and returns focus to the button that
  opened the dialog. A live gate measures the open/close cycle.
- **Actionable empty states.** "No matching tasks" now offers *Clear filter*,
  and empty memory, projects and providers open the matching add dialog, instead
  of leaving the user on a dead end.
- **Documented gates that exist.** The README now says twenty-seven gates, matches its
  own command list, and states truthfully that CI runs the four static gates; a
  test keeps the README, CI workflow and release guide in step.
- **A truthful version label.** The status bar shows the version that ships in
  `package.json` instead of a stale hard-coded string, and a test keeps the two in
  step on every release bump.
- **Skip to content.** The first Tab reveals an "İçeriğe atla" link that puts
  focus in the content area, past the twenty-three screen menu.
- **Honest shortcut sheet.** The `?` sheet now lists all nine screen shortcuts
  with their real names, generated from the same table the key handler uses —
  it previously claimed Ctrl+1 was "Ekip".
- **Screen-reader routing.** Changing screens moves focus to the new screen's
  heading and announces its name through a polite live region, so keyboard and
  screen-reader users are not left at the navigation button.
- **Draft autosave.** A half-written message is stored per conversation and
  comes back after screen switches, restarts and reloads; a quiet "draft saved"
  note confirms it, and a failed send keeps both the text and the draft.
- **Searchable settings.** A filter box over the eight settings cards narrows
  them as you type, shows how many sections match, folds Turkish `İ`/`I`, and
  clears with `Esc` — no scrolling to find "where is the theme setting".
- **Plain-language errors.** Every error code the app can emit (`E_BUSY`,
  `E_RATE_LIMIT`, `E_VERSION`, …) now maps to a full Turkish sentence instead of
  leaking the raw code into a toast; technical codes stay in the audit log.
- **Accessibility gate.** `tools/verify/a11y.js` walks all 23 screens and checks
  accessibly named screens and buttons, labelled fields, image `alt` text and
  unique `id`s — the measured promise that the UI works beyond the mouse.
- `tools/verify/tour-close.js`: opens the app, walks all 10 tour steps, presses
  Finish and asserts the document is still visible — the regression gate for the
  white-screen bug.
- `tools/verify/local-access-ui.js`: end-to-end proof that the permission starts
  off, can be granted through the dialog, really opens other drives, and can be
  revoked.
- `tools/verify/packaged-onboard-persist.js`: opens the packaged `.exe` three
  times against one profile and proves the first-run wizard shows only once —
  "Skip" writes `onboarded: true` to disk and the next launch starts clean.
- `tools/verify/packaged-smoke.js`: launches the real packaged `.exe` with a
  throw-away `USERPROFILE`, walks all 23 screens, counts the 124 connection
  cards, and asserts the app created `<home>\Keyvotion`. It is the check a
  person who downloads the ZIP actually goes through.
- `tools/verify/package-freshness.js`: compares the packaged `resources/app`
  against the source tree by SHA-256 and fails when `src/` changed after the ZIP
  was built, so a release can never ship a stale build.
- End-to-end tests for the narrowed path: applying a stdio MCP preset, an
  integration preset with a private token, an OAuth-less API-key preset, and one
  Votion tool invocation. The MCP test spawns a real server process over stdio
  JSON-RPC; the others use the product's own injection points with no network.
- Local providers that need no API key: pick **Yerel (Ollama)** or point a
  provider at `127.0.0.1`/`localhost` and test it without pasting a key. Any
  other address still requires one — nothing leaves the machine unauthenticated.
- Ready-made provider presets in the first-run wizard (OpenAI, OpenRouter,
  DeepSeek, Groq, Mistral, local Ollama) so the base URL does not have to be
  typed by hand.
- `dist/SHA256SUMS.txt` next to every packaged archive.
- `docs/release.md` and `tools/set-repo-owner.js` for a repeatable release.

## [3.2.0] — 2026-11-22

First public release.

### Added
- **23 screens**: team, command, board, models, reports, settings, chat, memory,
  projects, providers, browser, remote, guide, teams, plans, files, contexts,
  admin, integrations, MCP servers, catalog, audit and the connection wizard.
- **124 connection templates**: 64 integrations (195 capabilities) and 60 MCP
  servers, with one-click OAuth2, encrypted API keys and installable MCP tools.
- **Three-step first-run wizard**: pick a provider, paste and test the API key,
  choose a template and a model. Completion is persisted; "skip" is honored.
- **Votion assistant** with a whitelisted tool manifest (22 306 B) and
  `confirmToken` on every write.
- **LAN remote control** from a phone: private-network only, pairing token,
  64 KB body limit, 60 requests/min, no file serving.
- **Local OpenCode server manager** with a real port/`/api/info` probe.
- **Audit trail** for every write: `{ op, capabilityId, status }` only.
- Public documentation set: architecture, security model, integrations,
  install guide, FAQ.

### Security
- Renderer has no network (`connect-src 'none'`), no `webview`/`iframe`, no
  `innerHTML`, no inline styles.
- Secrets are encrypted with `safeStorage` (Windows DPAPI) and never returned to
  the renderer.
- 44 write channels require a confirmation token; RBAC limits payment providers
  to `admin`.

### Quality
- 331 automated tests (`node --test`), 0 failures.
- Four quality gates: test totals, doctor, k3, HTML integrity.
- Runtime dependency: `electron` only.
