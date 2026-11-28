import React from 'react';
import { AbsoluteFill, Composition, interpolate, registerRoot, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const frames = 336;
const colors = { bg: '#0a1114', soft: '#9baeb2', ink: '#eff8f7', accent: '#80e7cc', line: '#304349', panel: '#142126' };
const beats = [
  { title: 'Ekibini kur.', detail: 'Bir proje tanımıyla rolleri belirle.', tag: 'EKİP', rows: [['Lider', 'Planı hazırlar'], ['Mimar', 'Yapıyı kurar'], ['Test', 'Sonucu doğrular']] },
  { title: 'İşi takip et.', detail: 'Görevleri ve son eylemleri tek yerde gör.', tag: 'PANO', rows: [['Planlandı', 'İçerik taslağı'], ['Devam ediyor', 'Arayüz düzeni'], ['Tamamlandı', 'İlk taslak']] },
  { title: 'Lider’e yaz.', detail: 'İlerlemeyi sor, engelleri birlikte çöz.', tag: 'SOHBET', rows: [['Sen', 'Sıradaki adım ne?'], ['Lider', 'Taslak hazır.'], ['Lider', 'Şimdi test ediyoruz.']] }
];

function Film() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const index = Math.min(2, Math.floor(frame / 112));
  const local = frame - index * 112;
  const beat = beats[index];
  const entrance = spring({ frame: local, fps, config: { damping: 22, stiffness: 90 } });
  const opacity = interpolate(local, [0, 12, 100, 111], [0, 1, 1, index === 2 ? 1 : 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: colors.bg, color: colors.ink, fontFamily: 'Inter, Segoe UI, sans-serif', overflow: 'hidden' }}>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 74% 50%, #133c3b 0%, #0c1b20 36%, #0a1114 75%)' }} />
    <AbsoluteFill style={{ opacity: .13, backgroundImage: 'linear-gradient(#71938e 1px, transparent 1px), linear-gradient(90deg, #71938e 1px, transparent 1px)', backgroundSize: '48px 48px', transform: `translateX(${-(frame % 48)}px) scale(1.09)`, maskImage: 'radial-gradient(ellipse at 75% 45%, black, transparent 72%)' }} />
    <div style={{ position: 'absolute', top: 45, left: 64, fontSize: 17, letterSpacing: 4, fontWeight: 700 }}>KEYVOTION <span style={{ color: colors.accent }}>CONSOLE</span></div>
    <div style={{ position: 'absolute', left: 65, top: 150, opacity, transform: `translateY(${(1 - entrance) * 23}px)`, width: 385 }}>
      <div style={{ color: colors.accent, fontSize: 16, letterSpacing: 3, fontWeight: 700 }}>{beat.tag}</div>
      <div style={{ fontSize: 61, marginTop: 12, fontWeight: 750, letterSpacing: -3 }}>{beat.title}</div>
      <div style={{ color: colors.soft, fontSize: 21, marginTop: 14, lineHeight: 1.43 }}>{beat.detail}</div>
    </div>
    <div style={{ position: 'absolute', right: 63, top: 126, width: 363, padding: 21, border: `1px solid ${colors.line}`, borderRadius: 21, backgroundColor: colors.panel, boxShadow: '0 20px 70px #051114', opacity, transform: `translateX(${(1 - entrance) * 46}px) perspective(900px) rotateY(${8 - entrance * 6}deg)` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 3px 16px', color: colors.soft, fontWeight: 650, fontSize: 14, letterSpacing: 2 }}>
        <span>{beat.tag}</span><span style={{ color: colors.accent }}>●</span>
      </div>
      {beat.rows.map(([label, message], row) => {
        const appear = spring({ frame: local - 7 - row * 7, fps, config: { damping: 23, stiffness: 120 } });
        return <div key={row} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 9, padding: '13px 14px', marginTop: 8, background: '#0d1a1f', border: `1px solid ${colors.line}`, borderRadius: 10, opacity: appear, transform: `translateY(${(1 - appear) * 15}px)` }}>
          <span style={{ fontSize: 16, color: colors.accent }}>{label}</span>
          <span style={{ fontSize: 15 }}>{message}</span>
        </div>;
      })}
    </div>
    <div style={{ position: 'absolute', bottom: 36, right: 64, left: 65, height: 2, backgroundColor: colors.line }}>
      <div style={{ height: '100%', background: colors.accent, width: `${((frame + 1) / frames) * 100}%` }} />
    </div>
  </AbsoluteFill>;
}

registerRoot(() => <Composition id="KeyvotionIntro" component={Film} durationInFrames={frames} fps={24} width={960} height={540} />);
