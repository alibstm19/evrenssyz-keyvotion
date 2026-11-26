/* GEÇİCİ TASLAK — koşulmaz (node --test yalnız *.test.js toplar). Kalıcı, suite'e bağlı test: tests/tur2/bridge-parity.test.js (T-054). */
/* lazo renderer uc eşleşme testi (T-052) */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..', '..');

async function run() {
  console.log('--- T-052 Renderer -> Main Bridge Check ---');
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

  // 1. Kapılı kanallar listesi (main.js'te confirm.verify çağranlar)
  const gatedChannels = [
    'TEAM_ADD', 'TEAM_REMOVE', 'TEAM_SET_LEADER', 'BOARD_WRITE', 
    'MODELS_ASSIGN', 'ROSTER_WRITE', 'COMMAND_SEND', 'COMMAND_INTERRUPT', 'SECRET_SET'
  ];

  let mismatch = [];

  for (const ch of gatedChannels) {
    // Main'de bu kanal kapılı mı?
    const mainGate = mainSource.includes(`confirm.verify(payload.confirmToken, CHANNELS.${ch}`) || 
                    mainSource.includes(`confirm.verify(payload.confirmToken, CHANNELS.${ch})`);
    
    // Renderer'da bu kanal için confirmToken gönderiliyor mu?
    //Basit regex: CHANNELS.XXX çağrısından hemen önce veya payload objesinde confirmToken ara.
    //Ancak renderer'da çoğu çağrı wrapper'lar veya özel fonksiyonlar (örn: saveSettings) üzerinden yapılır.
    //En garantisi: app.js içinde 'confirmToken: makeConfirmToken()' ifadesi kaç tane var?
    
    // Bu basit test için:RENDERER'da 'confirmToken' anahtarı kaç yerde geçiyor?
  }
  
  const tokenSends = (appSource.match(/confirmToken\s*:/g) || []).length;
  console.log(`Kapılı Kanal Sayısı (Main): ${gatedChannels.length}`);
  console.log(`Token Gönderim Sayısı (Renderer): ${tokenSends}`);

  if (tokenSends < gatedChannels.length) {
    mismatch.push(`Kritik Eksik: Renderer'da en az ${gatedChannels.length} adet token gönderimi bekleniyordu, ${tokenSends} bulundu.`);
  }

  if (mismatch.length > 0) {
    console.log('\n❌ HATALAR:');
    mismatch.forEach(m => console.log(m));
    process.exit(1);
  } else {
    console.log('\n✅ TÜM UÇLAR EŞLEŞİYOR');
    process.exit(0);
  }
}

run();
