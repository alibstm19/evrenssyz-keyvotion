const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const TEAM = path.join(ROOT, '.team');

function log(status, msg) {
    console.log(`${status === 'OK' ? '[OK]' : status === 'WARN' ? '[WARN]' : '[FAIL]'} ${msg}`);
}

async function doctor() {
    let totalFail = 0;
    let totalWarn = 0;

    // 1. Environment
    try {
        const nodeVer = process.version;
        const major = parseInt(nodeVer.slice(1).split('.')[0]);
        if (major >= 20 && process.platform === 'win32') {
            log('OK', `Environment: Node ${nodeVer}, Platform ${process.platform}`);
        } else {
            log('FAIL', `Environment: Require Node >= 20 & win32. Got ${nodeVer}, ${process.platform}`);
            totalFail++;
        }
    } catch (e) {
        log('FAIL', `Env check error: ${e.message}`);
        totalFail++;
    }

    // 2. Electron Binary
    try {
        const exePath = path.join(SRC, 'node_modules', 'electron', 'dist', 'electron.exe');
        if (fs.existsSync(exePath)) {
            const version = execSync(`"${exePath}" --version`).toString().trim();
            log('OK', `Electron binary found: ${version}`);
        } else {
            log('FAIL', `Electron binary missing at ${exePath}`);
            totalFail++;
        }
    } catch (e) {
        log('FAIL', `Electron bin check error: ${e.message}`);
        totalFail++;
    }

    // 3. Package Deps
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8'));
        const deps = pkg.dependencies || {};
        const devDeps = pkg.devDependencies || {};
        const allDeps = {...deps, ...devDeps};
        const depKeys = Object.keys(allDeps);
        
        if (Object.keys(deps).length === 0 && depKeys.length === 1 && depKeys[0] === 'electron') {
            log('OK', `Dependencies: Only electron installed.`);
        } else {
            log('FAIL', `Invalid Dependencies. Allowed: ONLY electron in devDeps. Found: ${depKeys.join(', ')}`);
            totalFail++;
        }
    } catch (e) {
        log('FAIL', `Pkg check error: ${e.message}`);
        totalFail++;
    }

    // 4. Syntax Checks
    const checkPaths = [
        'src/shared/*.js',
        'src/main/**/*.js',
        'src/preload/*.js',
        'src/renderer/app.js'
    ];
    // Simple mock for globbingsince we don't have glob pkg
    const filesToCheck = [];
    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).forEach(f => {
            const p = path.join(dir, f);
            if (fs.statSync(p).isDirectory()) walk(p);
            else if (p.endsWith('.js')) filesToCheck.push(p);
        });
    }
    walk(SRC);

    let syntaxOk = true;
    filesToCheck.forEach(f => {
        try {
            execSync(`node --check "${f}"`);
        } catch (e) {
            log('FAIL', `Syntax error in ${path.relative(ROOT, f)}`);
            syntaxOk = false;
        }
    });
    if (!syntaxOk) totalFail++;
    else log('OK', `Syntax check passed for all sources.`);

    // 5. Channel Equality
    try {
        const channelsFile = path.join(SRC, 'shared', 'ipc-channels.js');
        const mainFile = path.join(SRC, 'main', 'main.js');
        const preloadFile = path.join(SRC, 'preload', 'preload.js');

        if (fs.existsSync(channelsFile) && fs.existsSync(mainFile) && fs.existsSync(preloadFile)) {
            const chanContent = fs.readFileSync(channelsFile, 'utf8');
            const mainContent = fs.readFileSync(mainFile, 'utf8');
            const prelContent = fs.readFileSync(preloadFile, 'utf8');
            /* Push kümesi tek kaynaktan (PUSH_CHANNELS) okunur — isim listesi tutulmaz. */
            const { PUSH_CHANNELS } = require(channelsFile);

            // Tek kaynak: const CHANNELS = Object.freeze({ NAME: 'kv:...', ... })
            const definedMap = new Map(
                [...chanContent.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*'(kv:[^']+)'/gm)]
                    .map(m => [m[1], m[2]])
            );
            // main.js: ipcMain.handle(CHANNELS.NAME, ...)
            const handledNames = new Set(
                [...mainContent.matchAll(/ipcMain\.handle\(\s*CHANNELS\.([A-Z][A-Z0-9_]*)/g)].map(m => m[1])
            );
            // preload.js: kopya literal tablo  NAME: 'kv:...'
            const preloadMap = new Map(
                [...prelContent.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*'(kv:[^']+)'/gm)]
                    .map(m => [m[1], m[2]])
            );
            // Gönderim yapan çağrılar: call(CH.NAME) / ipcRenderer.invoke(CH.NAME)
            const usedNames = new Set(
                [...prelContent.matchAll(/\.invoke\(\s*(?:CH|CHANNELS)\.([A-Z][A-Z0-9_]*)/g)].map(m => m[1])
            );

            const diffs = [];
            if (definedMap.size === 0) diffs.push('Kanal tanımı okunamadı (shared regex).');
            if (preloadMap.size === 0) diffs.push('Preload literal tablosu okunamadı.');
            if (handledNames.size === 0) diffs.push('main.js ipcMain.handle(CHANNELS.X) bulunamadı.');

            for (const [name, channel] of definedMap) {
                if (!/^kv:[a-z][a-z-]*:[a-zA-Z]+$/.test(channel)) diffs.push(`Kanal deseni hatalı: ${name} = ${channel}`);
                if (!preloadMap.has(name)) diffs.push(`Preload'da eksik: ${name}`);
                else if (preloadMap.get(name) !== channel) diffs.push(`Preload farklı ad: ${name} (${preloadMap.get(name)} != ${channel})`);
                const isPush = PUSH_CHANNELS.includes(channel);
                if (!isPush && !handledNames.has(name)) diffs.push(`main.js'te handler yok: ${name}`);
            }
            for (const name of preloadMap.keys()) {
                if (!definedMap.has(name)) diffs.push(`Preload'da fazla kanal: ${name}`);
            }
            for (const name of handledNames) {
                if (!definedMap.has(name)) diffs.push(`main.js'te tanımsız kanal: ${name}`);
            }
            for (const name of usedNames) {
                if (!definedMap.has(name)) diffs.push(`Preload invoke tanımsız kanal: ${name}`);
            }

            if (diffs.length === 0) {
                log('OK', `IPC Channels equal: ${definedMap.size} kanal (` +
                    `${[...definedMap.keys()].filter(n => handledNames.has(n)).length} invoke + ` +
                    `${definedMap.size - [...definedMap.keys()].filter(n => handledNames.has(n)).length} push), preload 1:1.`);
            } else {
                log('FAIL', `IPC mismatch:\n  ${diffs.join('\n  ')}`);
                totalFail++;
            }
        } else {
            log('WARN', `Cannot verify channels; missing shared/main/preload files.`);
            totalWarn++;
        }
    } catch (e) {
        log('FAIL', `Channel eq check error: ${e.message}`);
        totalFail++;
    }

    // 6. HTML Integrity
    try {
        const htmlPath = path.join(SRC, 'renderer', 'index.html');
        if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, 'utf8');
            let htmlFail = false;

            if (!html.includes("connect-src 'none'")) {
                log('FAIL', `CSP missing connect-src 'none' in index.html`);
                htmlFail = true;
            }
            const screens = [...html.matchAll(/data-screen=["'][^"']+["']/g)];
            // Ekran sayisi UI sozlesmesi §2'den okunur (sabit sayi tutulmaz).
            const uiContractPath = path.join(ROOT, 'docs', 'console-ui-contract.md');
            let expectedScreens = null;
            if (fs.existsSync(uiContractPath)) {
                const uiContract = fs.readFileSync(uiContractPath, 'utf8');
                const start = uiContract.indexOf('## 2. Ekran kimlikleri');
                const end = uiContract.indexOf('## 3.', start);
                const section = uiContract.slice(start, end > 0 ? end : uiContract.length);
                const ids = [...section.matchAll(/^\|\s*`([a-z]+)`\s*\|/gm)].map((m) => m[1]);
                expectedScreens = new Set(ids).size;
            }
            if (expectedScreens !== null && screens.length !== expectedScreens) {
                log('FAIL', `Screen count incorrect: Expected ${expectedScreens} (contract §2), got ${screens.length}`);
                htmlFail = true;
            }
            const cssLinks = [...html.matchAll(/href=["']styles\/(.+?)\.css["']/g)];
            cssLinks.forEach(m => {
                const cssPath = path.join(SRC, 'renderer', 'styles', `${m[1]}.css`);
                if (!fs.existsSync(cssPath)) {
                    log('FAIL', `CSS file missing: ${m[1]}.css`);
                    htmlFail = true;
                }
            });

            if (!htmlFail) log('OK', `HTML integrity verified.`);
            else totalFail++;
        } else {
            log('FAIL', `index.html not found.`);
            totalFail++;
        }
    } catch (e) {
        log('FAIL', `HTML check error: ${e.message}`);
        totalFail++;
    }

    // 7. Renderer Leakage
    try {
        const renDir = path.join(SRC, 'renderer');
        if (fs.existsSync(renDir)) {
            let leaks = [];
            const scanFiles = [];
            function scanWalk(dir) {
                if (!fs.existsSync(dir)) return;
                fs.readdirSync(dir).forEach(f => {
                    const p = path.join(dir, f);
                    if (fs.statSync(p).isDirectory()) scanWalk(p);
                    else if (f.endsWith('.js') || f.endsWith('.html')) scanFiles.push(p);
                });
            }
            scanWalk(renDir);

            scanFiles.forEach(f => {
                const content = fs.readFileSync(f, 'utf8');
                const relF = path.relative(ROOT, f);
                if (/fetch\(/.test(content)) leaks.push(`${relF}: fetch()`);
                if (/require\(/.test(content)) leaks.push(`${relF}: require()`);
                if (/apiKey/.test(content)) leaks.push(`${relF}: apiKey`);
                if (/Authorization/.test(content)) leaks.push(`${relF}: Authorization`);
                
                // style="..." restriction. Ignore cases where password field might be involved if necessary? 
                // Prompt said: "style=" 0 olmalı (regex ile, "data-field="password"" istisnası).
                // We'll detect any style=" that doesn't coexist in a tag having data-field="password".
                // Simplified: just flag any style=". The exception usually means certain attributes are okay, 
                // but based on phrasing let's look for the substring and alert.
                const styleMatches = [...content.matchAll(/(<[^>]*?style=["'][^"']*?["'][^>]*?>)/g)];
                styleMatches.forEach(m => {
                    if (!m[0].includes('data-field="password"')) {
                        leaks.push(`${relF}: inline style detected`);
                    }
                });
            });

            if (leaks.length === 0) {
                log('OK', `No renderer leaks detected.`);
            } else {
                log('FAIL', `Renderer leaks found:\n${leaks.join('\n')}`);
                totalFail++;
            }
        }
    } catch (e) {
        log('FAIL', `Leak check error: ${e.message}`);
        totalFail++;
    }

    // 8. Free Model Ban
    try {
        const modelDocs = path.join(TEAM, 'models.md');
        const modelSvc = path.join(SRC, 'main', 'services', 'models.js');
        let modelBanFailed = false;

        [modelDocs, modelSvc].forEach(f => {
            if (fs.existsSync(f)) {
                const c = fs.readFileSync(f, 'utf8');
                const lines = c.split('\n');
                lines.forEach((l, i) => {
                    // "opencode/*" yalnizca YASAK cumlesinde gecebilir; gercek model kimligi aranir.
                    const actualIds = [...l.matchAll(/opencode\/[a-z0-9][a-z0-9.\-]*/gi)].map(m => m[0]);
                    if (actualIds.length > 0) {
                        log('FAIL', `Forbidden model id (${actualIds.join(', ')}) in ${path.relative(ROOT, f)}:${i + 1}`);
                        modelBanFailed = true;
                    }
                });
            }
        });

        if (!modelBanFailed) log('OK', `No banned model references.`);
        else totalFail++;
    } catch (e) {
        log('FAIL', `Model ban check error: ${e.message}`);
        totalFail++;
    }

    // 9. Team Docs Accessibility
    try {
        const board = path.join(TEAM, 'board.md');
        const roster = path.join(TEAM, 'roster.md');
        let teamOk = true;
        if (fs.existsSync(board)) {
            log('OK', `Board readable (${fs.readFileSync(board, 'utf8').split('\n').length} lines).`);
        } else { teamOk = false; }
        if (fs.existsSync(roster)) {
            log('OK', `Roster readable (${fs.readFileSync(roster, 'utf8').split('\n').length} lines).`);
        } else { teamOk = false; }

        if (!teamOk) {
            log('FAIL', `Some team docs are missing.`);
            totalFail++;
        }
    } catch (e) {
        log('FAIL', `Team doc check error: ${e.message}`);
        totalFail++;
    }

    // 10. Secret Check
    try {
        const appData = process.env.APPDATA || '';
        const secretFile = path.join(appData, 'keyvotion-console', 'config.json');
        if (fs.existsSync(secretFile)) {
            const content = fs.readFileSync(secretFile, 'utf8');
            if (/password|secret|token/i.test(content)) {
                log('FAIL', `Plaintext secrets found in %APPDATA% config.json!`);
                totalFail++;
            } else {
                log('OK', `Config.json contains no plaintext secrets.`);
            }
        } else {
            log('WARN', `Config file not found at ${secretFile}. Skipping.`);
            totalWarn++;
        }
    } catch (e) {
        log('WARN', `Secret check skipped due to error: ${e.message}`);
        totalWarn++;
    }

    // 11. HTML Script Compilation (statik, vm.Script)
    // src/ altındaki her .html içindeki her <script> bloğu derlenir; kırık blok FAIL'dir.
    // Negatif senaryo için tarama kökü KV_DOCTOR_HTML_DIR ile geçici genişletilebilir
    // (kalıcı davranış değişmez; env yoksa yalnız src/ taranır).
    try {
        const vm = require('vm');
        const htmlRoots = [SRC];
        if (process.env.KV_DOCTOR_HTML_DIR) {
            for (const extra of String(process.env.KV_DOCTOR_HTML_DIR).split(path.delimiter)) {
                if (extra && fs.existsSync(extra)) htmlRoots.push(path.resolve(extra));
            }
        }

        const htmlFiles = [];
        function walkHtml(dir) {
            if (!fs.existsSync(dir)) return;
            fs.readdirSync(dir).forEach(f => {
                const p = path.join(dir, f);
                if (fs.statSync(p).isDirectory()) {
                    if (f === 'node_modules') return;
                    walkHtml(p);
                } else if (p.toLowerCase().endsWith('.html')) {
                    htmlFiles.push(p);
                }
            });
        }
        htmlRoots.forEach(walkHtml);

        const scriptFailures = [];
        let scriptBlockCount = 0;
        for (const file of htmlFiles) {
            const rel = path.relative(ROOT, file);
            const content = fs.readFileSync(file, 'utf8');
            const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
            let match;
            let blockNo = 0;
            while ((match = scriptRe.exec(content)) !== null) {
                blockNo += 1;
                const attrs = match[1] || '';
                if (/\bsrc\s*=/i.test(attrs)) continue; // harici betik: derlenecek gövde yok
                scriptBlockCount += 1;
                try {
                    new vm.Script(match[2], { filename: `${rel}#script${blockNo}` });
                } catch (e) {
                    scriptFailures.push(`${rel} blok ${blockNo}: ${e.message}`);
                }
            }
        }

        if (htmlFiles.length === 0) {
            log('FAIL', `HTML script check: HTML dosyası bulunamadı (src/).`);
            totalFail++;
        } else if (scriptFailures.length === 0) {
            log('OK', `HTML scripts compiled: ${scriptBlockCount} blok / ${htmlFiles.length} dosya (vm.Script).`);
        } else {
            log('FAIL', `HTML script compile error:\n  ${scriptFailures.join('\n  ')}`);
            totalFail++;
        }
    } catch (e) {
        log('FAIL', `HTML script check error: ${e.message}`);
        totalFail++;
    }

    console.log('\n--- SUMMARY ---');
    console.log(`Total FAILS: ${totalFail}`);
    console.log(`Total WARNS: ${totalWarn}`);
    
    process.exit(totalFail > 0 ? 1 : 0);
}

doctor();
