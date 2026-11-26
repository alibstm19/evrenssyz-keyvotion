'use strict';

/**
 * Rehber / ilk kurulum servisi (T6-1).
 *
 * Kullanici uygulamayi ilk actiginda Votion rehberi calisir: uygulamayi tanitir,
 * eksik ayarlari (saglayici anahtari, sunucu, uzaktan erisim) gosterir ve
 * "atla" secenegi sunar. Durum userData/guide.json icinde tutulur.
 *
 * Sir tutmaz: yalniz ilerleme bilgisi.
 */

const fs = require('node:fs');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');

const FILE = 'guide.json';

/** Rehber adimlari — sira baglayicidir (UI §11). */
const STEPS = Object.freeze([
  {
    id: 'welcome',
    title: 'Keyvotion Console’a hoş geldin',
    body: 'Ben Votion. Bu konsol, Keyvotion ekibini tek pencerede çalıştırır: ajanlar, görev panosu, raporlar, hafıza ve tarayıcı.',
    art: 'spark'
  },
  {
    id: 'provider',
    title: 'Model bağlantısını kur',
    body: 'Sağlayıcılar ekranından bir API anahtarı ekleyin. Anahtar DPAPI ile şifrelenir (secrets.bin / keys.bin), diske asla düz metin yazılmaz. Birden çok anahtar eklerseniz 429/kota hatasında otomatik geçiş yapılır.',
    art: 'key'
  },
  {
    id: 'server',
    title: 'Yerel sunucu',
    body: 'Ekip seansları yerel OpenCode sunucusundan okunur. Sunucu kapalıysa konsol çevrim dışı görünür — bu bir hata değil, dürüst durumdur. Bağlantı kartından başlatıp durdurabilirsiniz.',
    art: 'server'
  },
  {
    id: 'remote',
    title: 'Telefondan kontrol',
    body: 'Uzaktan Erişim ekranından sunucuyu başlatın; 10 haneli eşleşme kodu ve LAN adresi görünür. Telefonda tarayıcıyı açıp adrese gidin, kodu girin. Kod yalnız bu bilgisayardan telefona gider; kapatınca erişim biter.',
    art: 'phone'
  },
  {
    id: 'memory',
    title: 'Hafıza ve zihin haritası',
    body: 'Her işten sonra çıkarımlar hafızaya kendiliğinden yazılır. Hafıza ekranındaki zihin haritasında her nokta bir kayıttır; üzerine gelince kısa özeti görünür. Böylece ajan yeni göreve başlarken tüm geçmişi okumak zorunda kalmaz.',
    art: 'brain'
  },
  {
    id: 'votion',
    title: 'Beni her zaman çağırabilirsin',
    body: 'Sağ alttaki düğmeye basıp soru sorabilirsin: "pano durumu", "ekip ne yapıyor", "son raporlar", "bu sayfayı özetle". Yanıtı sesli veririm; mikrofon izni vermezsen yazarak devam edebilirsin.',
    art: 'wave'
  }
]);

function createGuideService(options) {
  const baseDir = options.baseDir;
  const filePath = path.join(baseDir, FILE);

  function defaults() {
    return {
      onboarded: false,
      step: 0,
      skipped: false,
      completedAt: null,
      updatedAt: new Date().toISOString()
    };
  }

  function load() {
    try {
      if (!fs.existsSync(filePath)) return defaults();
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return defaults();
      return {
        onboarded: Boolean(parsed.onboarded),
        step: Number.isInteger(parsed.step) ? Math.max(0, Math.min(STEPS.length - 1, parsed.step)) : 0,
        skipped: Boolean(parsed.skipped),
        completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
      };
    } catch {
      return defaults();
    }
  }

  function persist(state) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  function state() {
    const s = load();
    return ok({ ...s, steps: STEPS, total: STEPS.length, path: filePath });
  }

  function update(input) {
    const p = input && typeof input === 'object' ? input : {};
    const s = load();

    if (typeof p.step === 'number' && Number.isFinite(p.step)) {
      s.step = Math.max(0, Math.min(STEPS.length - 1, Math.round(p.step)));
    }
    if (p.skipped === true) s.skipped = true;
    if (p.onboarded === true) {
      s.onboarded = true;
      s.completedAt = new Date().toISOString();
    }
    if (p.onboarded === false) {
      s.onboarded = false;
      s.completedAt = null;
    }
    s.updatedAt = new Date().toISOString();

    if (p.reset === true) {
      const fresh = defaults();
      persist(fresh);
      return ok({ ...fresh, steps: STEPS, total: STEPS.length, path: filePath });
    }

    try {
      persist(s);
    } catch {
      return fail(CODES.INTERNAL, 'Rehber durumu yazılamadı.');
    }
    return ok({ ...s, steps: STEPS, total: STEPS.length, path: filePath });
  }

  return { state, update, STEPS, paths: { filePath } };
}

module.exports = { createGuideService, STEPS };
