# Release checklist

Everything here runs offline with Node's standard library. No new dependency,
no cloud service and no signing certificate are required.

## 1. Point the public links at the repository

```powershell
node tools/set-repo-owner.js --dry-run <github-owner> [repo]   # preview, writes nothing
node tools/set-repo-owner.js <github-owner> [repo]             # apply
```

The script rewrites the GitHub links in `README.md`, `src/package.json` and
`.github/ISSUE_TEMPLATE/config.yml`, and prints the `git remote add` command.
The 5 links already point at `https://github.com/alibstm19/evrenssyz-keyvotion`
(a `--dry-run` reports all three files as unchanged), so this step is already
done for this repository; the script stays for forks and renames.

## 2. Run the quality gates

One command runs the whole release proof in the required order and ends with a
single verdict — it is the only gate that has to be looked at before publishing:

```powershell
node tools/verify/publish-readiness.js   # ... YAYIN HAZIR: EVET
```

It composes the gates below (package → freshness → tap-count → doctor → k3 →
html-check → ldr-smoke → packaged-smoke → packaged-onboard-persist →
boot-budget → secret scan → set-repo-owner dry run), never short-circuits, and
prints the exact publish commands (owner, push, `v3.4.0` tag, checksum) at the
top. Any single KALDI makes the verdict HAYIR and the exit code 1. CI runs the
same command with `--static`, because the live Electron gates need a desktop.

Individual gates:

```powershell
node tools/verify/tap-count.js tests   # {"tests":574,"pass":574,"fail":0}
node tools/doctor.js                   # Total FAILS: 0 / Total WARNS: 0
node tools/k3.js                       # K3 Gate Passed Successfully
node tools/verify/html-check.js        # HTML DENGELI
node tools/verify/ldr-smoke.js         # DUMAN TESTI: GECTI (local, needs a desktop)
node tools/verify/remote-page-render.js # TELEFON SAYFASI: GECTI (390x844, real browser)
```

`node tools/verify/ldr-smoke.js` additionally opens the real Electron shell,
visits all 23 screens and reports exceptions and console errors. It needs a
desktop session, so it is a local gate, not a CI gate.

## 3. Build the portable package

```powershell
node tools/package.js --verify --zip
node tools/verify/package-freshness.js   # PAKET TAZELIGI: GECTI
node tools/verify/packaged-smoke.js      # PAKET DUMAN: GECTI (23 ekran, 124 kart)
node tools/verify/packaged-onboard-persist.js  # ILK-KURULUM KALICILIGI: GECTI
node tools/verify/tour-close.js                # TUR KAPANISI: GECTI
node tools/verify/local-access-ui.js           # YEREL ERISIM: GECTI
node tools/verify/crash-guard.js               # COKME KALKANI: GECTI
node tools/verify/a11y.js                      # ERISILEBILIRLIK: GECTI
node tools/verify/chat-retry.js                # SOHBET TEKRAR DENE: GECTI
node tools/verify/chat-copy.js                 # SOHBET MARKDOWN: GECTI
node tools/verify/settings-search.js           # AYAR ARAMA: GECTI
node tools/verify/chat-draft.js                # SOHBET TASLAGI: GECTI
node tools/verify/screen-focus.js              # EKRAN ODAGI: GECTI
node tools/verify/shortcuts.js                 # KISAYOLLAR: GECTI
node tools/verify/skip-link.js                 # ICERIGE ATLA: GECTI
node tools/verify/version-label.js             # SURUM ETIKETI: GECTI
node tools/verify/empty-actions.js             # BOS DURUM EYLEMI: GECTI
node tools/verify/modal-inert.js               # MODAL INERT: GECTI
node tools/verify/notif-a11y.js                # BILDIRIM ERISILEBILIRLIGI: GECTI
node tools/verify/danger-confirm.js            # TEHLIKELI EYLEM ONAYI: GECTI
node tools/verify/single-flight.js             # TEK UCUS: GECTI
node tools/verify/chat-scroll.js               # SOHBET KAYDIRMA: GECTI
node tools/verify/chat-jump.js                 # EN ALTA IN: GECTI
node tools/verify/boot-budget.js               # ONYUKLEME BUTCESI: GECTI
node tools/verify/chat-a11y.js                 # SOHBET DUYURUSU: GECTI
```

The archive is reproducible: `tools/lib/deterministic-zip.js` writes a fixed
timestamp (1980-01-01) and sorted entries, so rebuilding the same `src/`
produces the **same** SHA-256. A published checksum can be verified by
rebuilding instead of trusting the upload.

The freshness gate re-hashes the packaged `resources/app` against `src/` and
fails if the source is newer than the archive, so a release cannot ship a stale
build. The packaged smoke test launches the real `.exe` with a throw-away
`USERPROFILE`, walks all 23 screens, counts the 124 connection cards, and
asserts that the app created `<home>\Keyvotion` — proof that the default project
folder follows the user, not the developer machine. `packaged-onboard-persist.js`
opens the same `.exe` three times against one profile and proves the first-run
wizard appears once, "Skip" writes `onboarded: true` to disk, and the second
launch starts without it.

Outputs:

- `dist/Keyvotion Console/Keyvotion Console.exe` — runnable folder build
- `dist/Keyvotion-Console-win32-x64-v<version>.zip` — release archive
- `dist/SHA256SUMS.txt` — checksum of the archive
- `work/package-report.json` — build time, launch check, sizes

The `--verify` flag launches the packaged executable on a CDP port the OS hands
out (`listen(0)`), so a busy or reserved port cannot fail the gate, and fails if
the window does not appear within the 3-second boot budget.

On GitHub, the **Build package** workflow does the same on a Windows runner
(`Actions → Build package → Run workflow`) and uploads the ZIP, checksums and
build report as an artifact. It does not tag or publish anything.

## 4. Publish on GitHub

Release sequence, in this order — the tag must point at a fresh package and the
release proof must be green first:

1. `node tools/verify/publish-readiness.js` must print `YAYIN HAZIR: EVET`.
2. Refresh the package from the latest `src/` commit: `node tools/package.js --verify --zip`.
3. Run the freshness gate: `node tools/verify/package-freshness.js` → `PAKET TAZELIGI: GECTI`.
4. Push `master`.
5. Create the `v3.4.0` tag on that commit and attach the fresh ZIP + `SHA256SUMS.txt`.

One-shot sequence once the owner name is known:

```powershell
node tools/set-repo-owner.js <owner> <repo>
node tools/verify/tap-count.js tests      # must print 0 fail
git add -A
git commit -m "chore: point public links at the repository"
```

1. Create an **empty** repository (no README, no license) in the browser.
2. `git remote add origin https://github.com/<owner>/<repo>.git`
3. `git push -u origin master`
4. Create a release tagged `v<version>`; attach `dist/Keyvotion-Console-win32-x64-v<version>.zip`
   and `dist/SHA256SUMS.txt` from step 3 of this checklist.
5. Paste the release notes from the matching `CHANGELOG.md` section, and keep the
   unsigned-build / SmartScreen note.
6. Verify the uploaded checksum: `certutil -hashfile <zip> SHA256` must equal the
   line in `SHA256SUMS.txt`.
7. Optionally set the social preview to `assets/social-preview.png` and the
   repository description to the first line of `README.md`.

Tags, releases and pushes are maintainer decisions; nothing in this repository
creates them automatically.

## 5. Before announcing

- CI is green on Windows and Ubuntu (Node 22 and 26).
- Screenshots in `docs/screenshots/` match the current build.
- `git status` is clean and `.env` / `secrets.bin` are not tracked.
- The build is unsigned: the release notes must keep the SmartScreen note.
