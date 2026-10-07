#!/usr/bin/env node
// Lists cards whose text changed since their effect code was last updated (or that have no effect code yet).
//   node tools/check-effects.js            → report
//   node tools/check-effects.js --update   → after updating web/game/effects.js, mark the current card texts as synced
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'web/game/engine.js')); require(path.join(root, 'web/game/effects.js'));
const LW = globalThis.LW;
const cards = JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8'));
const syncFile = path.join(root, 'web/game/effects-sync.json');
const synced = fs.existsSync(syncFile) ? JSON.parse(fs.readFileSync(syncFile, 'utf8')) : {};
const changed = [], missing = [], fresh = [], noLevel = [];
for (const c of cards) {
  const has = !!LW.EFFECTS[c.id], text = (c.ability || []).some(a => LW.plain(a));
  if (text && !has) missing.push(c);
  else if (!synced[c.id]) fresh.push(c);
  else if (synced[c.id] !== LW.cardSig(c)) changed.push(c);
  // a hero with a level-up form + condition needs a `lvl` hook in effects.js (see nr-068)
  const lv = LW.EFFECTS[c.id] && LW.EFFECTS[c.id].lvl, cond = (c.levelUpCondition || '').trim();
  if (c.hero && c.levelUp && cond && (!lv || (lv.cond || '').trim() !== cond)) noLevel.push(c);   // missing, or the condition text was edited after the code (lvl.cond)
}
const show = (title, list) => { if (!list.length) return; console.log(`\n${title} (${list.length})`); for (const c of list) console.log(`  ${c.id}  ${c.nameEn}\n      ${(c.ability || []).map(LW.plain).join('\n      ') || '(ไม่มีข้อความ)'}`); };
if (process.argv.includes('--update')) {
  const out = {}; for (const c of cards) out[c.id] = LW.cardSig(c);
  fs.writeFileSync(syncFile, JSON.stringify(out, null, 1) + '\n');
  console.log(`synced ${cards.length} cards → web/game/effects-sync.json`);
} else {
  show('แก้ข้อความหลังเขียนโค้ด effect', changed);
  show('มีข้อความ effect แต่ยังไม่มีโค้ด', missing);
  show('ยังไม่เคยบันทึกว่าซิงก์ (การ์ดใหม่หรือไม่มี effect)', fresh.filter(c => (c.ability || []).some(a => LW.plain(a))));
  if (noLevel.length) { console.log(`\nHero ที่เงื่อนไขเลเวลอัพยังไม่มีโค้ด หรือถูกแก้หลังเขียนโค้ด (${noLevel.length})`); for (const c of noLevel) console.log(`  ${c.id}  ${c.nameEn} → ${c.levelUp}\n      เลเวลอัพ: ${c.levelUpCondition}`); }
  if (!changed.length && !missing.length && !noLevel.length) console.log('✓ effect ในเกมตรงกับข้อความการ์ดทุกใบ');
}
