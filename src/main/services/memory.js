'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');

/*
 * Paylasilan ajan hafizasi (T4-3).
 *
 * Amac: ajanlar unutmasin. Bir ajanin ogrendigi tercih/karar digerleri
 * tarafindan da gorulur; kullaniciya ozel tercihler her zaman onde gelir.
 *
 * Depolama (proje basina):
 *   <proje>/.team/memory/memory.jsonl   — kayit kaynagi (append-only)
 *   <proje>/.team/memory/memory.md      — insan tarafindan okunabilir ayna
 *
 * Akis: topla -> damit -> sakla -> geri cagir -> enjekte et
 *   topla   : ajan/kullanici kaydi (write)
 *   damit   : kind + scope + weight ile siniflandirma (write sirasinda)
 *   sakla   : jsonl + md
 *   geri cagir: read/search
 *   enjekte : context() — ajan istemine gomulecek blok
 */

const SCOPES = Object.freeze(['user', 'team', 'project']);
const KINDS = Object.freeze(['preference', 'decision', 'fact', 'correction']);
const MAX_TEXT = 2000;

/** Onem sirasi: kullanici tercihi > ekip karari > olgu. */
const SCOPE_RANK = { user: 0, team: 1, project: 2 };
const KIND_RANK = { correction: 0, preference: 1, decision: 2, fact: 3 };

function nonEmptyString(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}

function makeId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `mem_${t}${r}`;
}

function createMemoryService(options) {
  const getProjectDir = options.getProjectDir;

  function dir() {
    return path.join(getProjectDir(), '.team', 'memory');
  }
  function jsonlPath() {
    return path.join(dir(), 'memory.jsonl');
  }
  function mdPath() {
    return path.join(dir(), 'memory.md');
  }

  /** @returns {object[]} */
  function all() {
    const file = jsonlPath();
    let raw = '';
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      return [];
    }
    const out = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const e = JSON.parse(t);
        if (e && typeof e === 'object' && typeof e.text === 'string') out.push(e);
      } catch {
        // Bozuk satir tum hafizayi dusurmez.
      }
    }
    return out;
  }

  function rank(a, b) {
    const sa = SCOPE_RANK[a.scope] === undefined ? 9 : SCOPE_RANK[a.scope];
    const sb = SCOPE_RANK[b.scope] === undefined ? 9 : SCOPE_RANK[b.scope];
    if (sa !== sb) return sa - sb;
    const ka = KIND_RANK[a.kind] === undefined ? 9 : KIND_RANK[a.kind];
    const kb = KIND_RANK[b.kind] === undefined ? 9 : KIND_RANK[b.kind];
    if (ka !== kb) return ka - kb;
    const wa = Number(a.weight) || 1;
    const wb = Number(b.weight) || 1;
    if (wa !== wb) return wb - wa;
    return String(b.at || '').localeCompare(String(a.at || ''));
  }

  function filtered(query, source = all()) {
    const q = query && typeof query === 'object' ? query : {};
    let rows = source.slice();
    if (q.scope) rows = rows.filter((e) => e.scope === q.scope);
    if (q.kind) rows = rows.filter((e) => e.kind === q.kind);
    if (q.role) rows = rows.filter((e) => String(e.role || '').toUpperCase() === String(q.role).toUpperCase());
    const needle = typeof q.q === 'string' ? q.q.trim().toLocaleLowerCase('tr') : '';
    if (needle) {
      rows = rows.filter((e) => {
        const hay = `${e.text} ${(e.tags || []).join(' ')}`.toLocaleLowerCase('tr');
        return hay.includes(needle);
      });
    }
    rows.sort(q.sort === 'recent' ? (a, b) => String(b.at).localeCompare(String(a.at)) : rank);
    const limit = Number.isInteger(q.limit) && q.limit > 0 ? Math.min(q.limit, 500) : 200;
    return rows.slice(0, limit);
  }

  /** memory.md aynasini yeniden uretir (jsonl kaynak kalir). */
  function writeMd(rows) {
    const titles = { user: 'Kullanıcı tercihleri (öncelikli)', team: 'Ekip kararları', project: 'Proje notları' };
    const lines = ['# Ajan Hafızası', '', '> Kaynak: memory.jsonl · bu dosya otomatik üretilir.', ''];
    for (const scope of SCOPES) {
      const group = rows.filter((e) => e.scope === scope);
      lines.push(`## ${titles[scope]}`, '');
      if (!group.length) {
        lines.push('_(kayıt yok)_', '');
        continue;
      }
      for (const e of group.sort(rank)) {
        const tags = (e.tags || []).length ? ` \`${e.tags.join('`, `')}\`` : '';
        lines.push(`- **[${e.kind}]** ${e.text}${tags}  \n  <sub>${e.at} · ${e.role || '—'} · ${e.id}</sub>`);
      }
      lines.push('');
    }
    fs.writeFileSync(mdPath(), lines.join('\n'), 'utf8');
  }

  function read(query) {
    const source = all();
    const rows = filtered(query, source);
    return ok({
      entries: rows,
      total: source.length,
      dir: dir(),
      scopes: SCOPES.slice(),
      kinds: KINDS.slice()
    });
  }

  function search(query) {
    const q = query && typeof query === 'object' ? query : {};
    if (typeof q.q !== 'string' || !q.q.trim()) {
      return fail(CODES.BAD_REQUEST, 'Arama metni boş olamaz.');
    }
    const rows = filtered(q);
    return ok({ q: q.q, count: rows.length, entries: rows });
  }

  function write(input) {
    const p = input && typeof input === 'object' ? input : {};
    if (!nonEmptyString(p.text, MAX_TEXT)) {
      return fail(CODES.BAD_REQUEST, `Hafıza metni 1–${MAX_TEXT} karakter olmalı.`);
    }
    const scope = SCOPES.includes(p.scope) ? p.scope : 'team';
    const kind = KINDS.includes(p.kind) ? p.kind : 'fact';
    const role = typeof p.role === 'string' && p.role.trim() ? p.role.trim().slice(0, 8).toUpperCase() : 'LDR';
    const weight = Number.isFinite(Number(p.weight))
      ? Math.max(1, Math.min(5, Math.round(Number(p.weight))))
      : (kind === 'preference' ? 3 : 2);
    const tags = Array.isArray(p.tags)
      ? p.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 24)).slice(0, 8)
      : [];

    const entry = {
      id: makeId(),
      at: new Date().toISOString(),
      scope,
      role,
      kind,
      text: p.text.trim(),
      weight,
      source: typeof p.source === 'string' && p.source.trim() ? p.source.trim().slice(0, 80) : 'manual',
      tags
    };

    try {
      fs.mkdirSync(dir(), { recursive: true });
      fs.appendFileSync(jsonlPath(), `${JSON.stringify(entry)}\n`, 'utf8');
      writeMd(all());
    } catch {
      return fail(CODES.INTERNAL, 'Hafıza yazılamadı.');
    }
    return ok({ entry, total: all().length, mdPath: mdPath() });
  }

  /**
   * Ajan istemine enjekte edilecek blok. Kullanici tercihleri once gelir.
   * Sir tutmaz: yalniz hafiza metinleri.
   */
  function context(query) {
    const q = query && typeof query === 'object' ? query : {};
    const rows = filtered({ ...q, limit: Number.isInteger(q.limit) ? q.limit : 12 });
    const head = {
      user: '### Kullanıcı tercihleri (öncelikli — bunlara uy)',
      team: '### Ekip kararları',
      project: '### Proje notları'
    };
    const lines = ['## Paylaşılan ajan hafızası', ''];
    let written = 0;
    for (const scope of SCOPES) {
      const group = rows.filter((e) => e.scope === scope);
      if (!group.length) continue;
      lines.push(head[scope], '');
      for (const e of group) {
        lines.push(`- ${e.text}`);
        written += 1;
      }
      lines.push('');
    }
    if (!written) lines.push('_(hafıza boş — henüz kayıt yok)_', '');
    return ok({ block: lines.join('\n'), count: written, entries: rows });
  }

  /** Akis semasinin veri tarafi (DSN cizimi bunu kullanir). */
  function flow() {
    const rows = all();
    return ok({
      stages: [
        { id: 'collect', title: 'Topla', desc: 'Ajan ve kullanıcı kaydı', count: rows.length },
        { id: 'distill', title: 'Damıt', desc: 'kapsam + tür + ağırlık', count: rows.filter((e) => e.kind === 'preference').length },
        { id: 'store', title: 'Sakla', desc: 'memory.jsonl + memory.md', count: rows.length },
        { id: 'recall', title: 'Geri çağır', desc: 'arama + kapsam filtresi', count: rows.filter((e) => e.scope === 'user').length },
        { id: 'inject', title: 'Enjekte et', desc: 'ajan istemine bağlam', count: rows.filter((e) => (e.weight || 1) >= 3).length }
      ],
      total: rows.length,
      byScope: {
        user: rows.filter((e) => e.scope === 'user').length,
        team: rows.filter((e) => e.scope === 'team').length,
        project: rows.filter((e) => e.scope === 'project').length
      }
    });
  }

  /* ------------------------------------------------------------------ T6-4 */

  const AUTO_KINDS = Object.freeze({
    decision: /karar|karar verildi|onaylandı|kabul edildi|seçildi|seçtik/i,
    correction: /düzelt|yanlış|hata yapıldı|geri alındı|iptal|reddedildi/i,
    preference: /tercih|istiyorum|istiyoruz|bundan sonra|her zaman|asla|kural/i,
    fact: /bulundu|ölçüldü|olculdu|test|sonuç|sonuc|sayı|sayi|kanıt|kanit/i
  });

  /** Metinden cikarim turu tahmini. */
  function inferKind(text) {
    for (const [kind, re] of Object.entries(AUTO_KINDS)) {
      if (re.test(text)) return kind;
    }
    return 'fact';
  }

  /**
   * Is sonrasi otomatik cikarim (T6-4): ajanin her isinin ardindan onemli
   * satirlar hafizaya yazilir. Boylece yeni gorevde tum gecmisi okumak gerekmez.
   *
   * Ayni metin zaten varsa tekrar yazilmaz (idempotent) — gurultu olmaz.
   */
  function auto(input) {
    const p = input && typeof input === 'object' ? input : {};
    const raw = typeof p.text === 'string' ? p.text : '';
    if (!raw.trim()) return fail(CODES.BAD_REQUEST, 'Çıkarım metni boş.');

    const scope = SCOPES.includes(p.scope) ? p.scope : 'project';
    const role = typeof p.role === 'string' && p.role.trim() ? p.role.trim().slice(0, 8).toUpperCase() : 'LDR';
    const source = typeof p.source === 'string' && p.source.trim() ? p.source.trim().slice(0, 80) : 'auto';
    const extraTags = Array.isArray(p.tags)
      ? p.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 24)).slice(0, 6)
      : [];

    /* Cikarimlari satirlara bol; cok kisa/gurultulu satirlari at. */
    const lines = raw
      .split(/\r?\n|(?<=[.!?])\s+/)
      .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter((l) => l.length >= 24 && l.length <= 400)
      .slice(0, 12);

    const existing = new Set(all().map((e) => `${e.text}`.toLowerCase()));
    const written = [];

    for (const line of lines) {
      const key = line.toLowerCase();
      if (existing.has(key)) continue;
      const kind = inferKind(line);
      const tags = [...new Set([source, kind, ...extraTags])].slice(0, 8);
      const entry = {
        id: makeId(),
        at: new Date().toISOString(),
        scope,
        role,
        kind,
        text: line,
        weight: kind === 'correction' ? 4 : kind === 'decision' ? 3 : 2,
        source,
        tags
      };
      try {
        fs.mkdirSync(dir(), { recursive: true });
        fs.appendFileSync(jsonlPath(), `${JSON.stringify(entry)}\n`, 'utf8');
      } catch {
        return fail(CODES.INTERNAL, 'Hafıza yazılamadı.');
      }
      existing.add(key);
      written.push(entry);
    }

    if (written.length) {
      try { writeMd(all()); } catch { /* ayna yazilamadi — kaynak saglam */ }
    }

    return ok({ entries: written, count: written.length, total: all().length, skipped: lines.length - written.length });
  }

  /**
   * Zihin haritasi (T6-4): kayitlardan dugum + kenar uretir.
   * Merkez (hub) = proje. Kapsam halkalari, etiket baglantilari.
   * Koordinatlar deterministik (id hash) — her acilista ayni yer.
   */
  function graph(input) {
    const p = input && typeof input === 'object' ? input : {};
    const source = all();
    const rows = filtered({ limit: Number.isInteger(p.limit) ? p.limit : 160 }, source);
    const total = source.length;

    function hash(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return Math.abs(h);
    }

    const nodes = [];
    const edges = [];
    const tagIndex = new Map();

    /* hub */
    nodes.push({
      id: 'hub',
      label: 'Proje hafızası',
      kind: 'hub',
      scope: 'project',
      x: 50,
      y: 50,
      weight: 5,
      text: `${total} kayıt`
    });

    rows.forEach((e, i) => {
      const h = hash(e.id || `${i}`);
      /* halka yaricapi kapsama gore: user icte, team orta, project dista */
      const ring = e.scope === 'user' ? 22 : e.scope === 'team' ? 33 : 42;
      const angle = ((h % 3600) / 3600) * Math.PI * 2;
      const jitter = ((h >> 8) % 7) - 3;
      const x = 50 + Math.cos(angle) * (ring + jitter) * 0.92;
      const y = 50 + Math.sin(angle) * (ring + jitter) * 0.86;
      nodes.push({
        id: e.id,
        label: clipText(e.text, 46),
        kind: e.kind,
        scope: e.scope,
        role: e.role,
        weight: Number(e.weight) || 1,
        at: e.at,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        text: clipText(e.text, 220),
        source: e.source || ''
      });
      edges.push({ from: 'hub', to: e.id, kind: 'scope' });

      for (const tag of (e.tags || []).slice(0, 3)) {
        if (!tagIndex.has(tag)) tagIndex.set(tag, []);
        tagIndex.get(tag).push(e.id);
      }
    });

    /* ayni etiketi paylasan kayitlar arasinda ince bag */
    for (const [, ids] of tagIndex) {
      for (let i = 1; i < Math.min(ids.length, 6); i += 1) {
        edges.push({ from: ids[i - 1], to: ids[i], kind: 'tag' });
      }
    }

    return ok({
      nodes,
      edges,
      total,
      shown: rows.length,
      byScope: {
        user: rows.filter((e) => e.scope === 'user').length,
        team: rows.filter((e) => e.scope === 'team').length,
        project: rows.filter((e) => e.scope === 'project').length
      },
      byKind: {
        preference: rows.filter((e) => e.kind === 'preference').length,
        decision: rows.filter((e) => e.kind === 'decision').length,
        fact: rows.filter((e) => e.kind === 'fact').length,
        correction: rows.filter((e) => e.kind === 'correction').length
      }
    });
  }

  function clipText(text, max) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  return {
    read, write, search, context, flow, auto, graph,
    paths: { dir, jsonlPath, mdPath },
    SCOPES, KINDS
  };
}

module.exports = { createMemoryService, SCOPES, KINDS, MAX_TEXT };
