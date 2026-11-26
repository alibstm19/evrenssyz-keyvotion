'use strict';
/**
 * Telefon sayfası (remote-page.html) kapısı — T-205.
 *
 * NEDEN: Telefonda "Bağlantı Hatası / Sunucuya ulaşılamıyor" kartı ilk
 * başarısız yoklamada açılıyor ve ağ hatasını sunucu hatasından ayırmıyordu.
 * Bu kapı, sayfanın hata akışının şu üç sözünü ölçer:
 *   1) İlk başarısız yoklama kalıcı kartı AÇMAZ (iki üst üste hata gerekir).
 *   2) Ağ hatası (fetch reddi) ile HTTP hatası ayrı cümleyle anlatılır.
 *   3) Eşleşme düğmesi ancak gerçekten bağlanınca giriş ekranını kapatır.
 *
 * Negatif kontrol kalıcıdır: aynı kontroller eski (hatalı) akış örneğine de
 * uygulanır ve orada KALMASI gerekir.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PAGE = path.join(ROOT, 'src', 'main', 'services', 'remote-page.html');

/* Eski akışın küçük ama gerçekçi örneği (HEAD'den önceki davranış). */
const LEGACY = `
  async function syncState() {
    try {
      const res = await api('/api/state');
      if (!res.ok) throw new Error('E_STATE');
      setConn(true, 'bağlı');
      $('overlay-error').hidden = true;
    } catch (e) {
      if (e.code === 'E_TOKEN') {
        showLogin('Kodun süresi dolmuş.');
      } else {
        setConn(false, 'bağlantı yok');
        if (!state.isConnected) {
          $('overlay-error').hidden = false;
          $('errorDesc').textContent = e.message || 'Sunucuya ulaşılamıyor.';
        }
      }
    }
  }
  $('pairBtn').onclick = async () => {
    try { await syncState(); $('overlay-login').hidden = true; }
    catch (e) { $('loginErr').textContent = 'Kod geçersiz.'; }
  };
  const boot = () => { syncState(); setInterval(syncState, 15000); };
`;

function check(text) {
  const src = String(text || '');
  const fails = [];
  const need = (label, cond) => { if (!cond) fails.push(label); };

  need('kalıcı kart iki hatadan sonra açılmalı (state.failures >= 2)',
    /state\.failures\s*>=\s*2/.test(src));
  need('başarılı yoklama hata sayacını sıfırlamalı',
    /state\.failures\s*=\s*0/.test(src));
  need('ağ hatası ayrı kod taşımalı (E_NETWORK)',
    /E_NETWORK/.test(src) && /throw\s*\{\s*code:\s*'E_NETWORK'/.test(src));
  need('ağ hatası ile HTTP hatası ayrı cümleyle anlatılmalı',
    /Bilgisayara ulaşılamıyor/.test(src) && /Sunucu \$\{e\.status\}|Sunucu \$\{/.test(src));
  need('403 / 429 / 500 için ayrı yönlendirme olmalı',
    /e\.status === 403/.test(src) && /e\.status === 429/.test(src) && /e\.status === 500/.test(src));
  need('eski genel "Sunucuya ulaşılamıyor" yedeği kalkmalı',
    !/e\.message \|\| 'Sunucuya ulaşılamıyor\.'/.test(src));
  need('eşleşme sonucu boolean olarak kullanılmalı',
    /const ok = await syncState\(\)/.test(src) && /if \(ok\)/.test(src));
  need('ilk yoklama düşerse hızlı yeniden deneme olmalı',
    /first\.then\(\(ok\)/.test(src) && /setTimeout\(syncState/.test(src));
  need('send hatası ham İngilizce metin taşımamalı',
    !/Bağlantı hatası occurred/.test(src));

  return fails;
}

function run() {
  const current = fs.readFileSync(PAGE, 'utf8');
  const currentFails = check(current);
  const legacyFails = check(LEGACY);
  const pass = currentFails.length === 0 && legacyFails.length > 0;
  console.log(JSON.stringify({
    current: { fails: currentFails.length, detail: currentFails },
    legacy: { fails: legacyFails.length },
    pass
  }, null, 1));
  console.log(pass ? 'TELEFON SAYFASI: GECTI' : 'TELEFON SAYFASI: KALDI');
  return pass;
}

if (require.main === module) {
  process.exit(run() ? 0 : 1);
}

module.exports = { check, run, LEGACY, PAGE };
