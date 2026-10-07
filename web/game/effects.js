// LostWorld TCG — card effects for the prototype, keyed by card id.
// Interpreted with the glossary in CLAUDE.md ("ความหมายคำใน effect") and the per-card answers in data/review-answers.json.
// Hooks: onPlay(G,p,self) · onCast(G,p,card) · onDeath · onAttack · onTurnStart · onSurviveDamage · onSurviveCombat
//        onAllyEnter(G,p,self,other) · aura(G,src,target) -> {p,h} · cost(G,p,base) · canPlay(G,p,card) -> true | reason · payExtra
// A card that has ability text but no entry here is flagged in-game as "effect not implemented yet".
(function (root) {
  'use strict';

  const enemies = (G, p) => G.other(p).board.filter(u => G.alive(u));
  const allies = (G, p, except) => p.board.filter(u => G.alive(u) && u !== except);
  const anySide = (G) => G.allUnits().filter(u => G.alive(u));
  const sideNote = (G, card) => G.note(`${card.nameEn} ยังไม่ได้ระบุฝั่งเป้าหมาย (กติกา G3) — prototype ให้เลือกได้ทั้งสองฝั่ง`);
  const tempNote = (G, card) => G.note(`${card.nameEn} ไม่ได้เขียนว่า "ถาวร" — บัฟจึงอยู่แค่ถึงจบรอบ (กติกา G2)`);
  const need = (cond, reason) => cond ? true : reason;
  const pick = (G, p, list, intent, prompt, optional) => G.choose(p, list, { intent, prompt, optional });
  const nameIs = (G, x, en) => G.nameIs(x, en);

  // ---- ninken (Kakashi's dogs) helpers ----
  const KAKASHI = 'KAKASHI HATAKE';
  const hasAlly = (G, p, self, test) => allies(G, p, self).some(test);
  const withKakashi = (pw, hp = pw) => async (G, p, self) => { if (hasAlly(G, p, self, u => nameIs(G, u, KAKASHI))) await G.buff(self, pw, hp, true, 'อยู่กับคาคาชิ'); };
  const giveKw = async (G, u, kw, why) => { if (!u || !G.alive(u)) return; u.kws.add(kw); if (kw === 'barrier') u.barrier = true; await G.ui.event('status', { unit: u, text: ({ challenger: 'ท้าดวล', tough: 'เกราะหนา', barrier: 'เกราะคาถา', quickstrike: 'ตีก่อน', fearsome: 'น่าสะพรึง', regenerate: 'ฟื้นฟู' })[kw] || kw }); await G.log(`${u.card.nameEn} ได้รับ ${kw} — ${why}`, 'buff'); };
  const gainMana = async (G, p, n, why) => { p.mana = Math.min(p.mana + n, 10); await G.log(`${p.name} ได้มานา +${n} — ${why}`, 'buff'); };

  const E = {
    // ---------- characters ----------
    'nr-001': { // Naruto: ETB 2 dmg to an enemy; +2 power while your life < 10 (C1)
      async onPlay(G, p, self) { const t = await pick(G, p, enemies(G, p), 'harm', 'นารูโตะ: เลือกตัวละครศัตรู รับความเสียหาย 2'); if (t) await G.damage(t, 2, self); },
      aura(G, src, t) { return src === t && G.owner(src).life < 10 ? { p: 2 } : null; },
    },
    'nr-002': { async onPlay(G, p) { await G.createToHand(p, 'nr-020', 'ซาสึเกะ'); } },
    'nr-003': { // other allies +0|+1 permanently (card text: "ถาวร"; C2: not herself)
      async onPlay(G, p, self) { for (const u of allies(G, p, self)) await G.buff(u, 0, 1, true, 'ซากุระ'); },
    },
    'nr-005': { // Kakashi: copy any unit's on-play effect (either side), result is ours (C3)
      async onPlay(G, p, self) {
        const list = anySide(G).filter(u => u !== self && u.id !== 'nr-005' && G.eff(u) && G.eff(u).onPlay);   // copying another Kakashi would copy forever
        const t = await pick(G, p, list, 'help', 'คาคาชิ: เลือกตัวละครที่จะก๊อป effect ลงสนาม', true);
        if (t) { await G.log(`คาคาชิก๊อป effect ลงสนามของ ${t.card.nameEn}`, 'spell'); await G.eff(t).onPlay(G, p, self); }
        for (const u of allies(G, p, self).filter(u => G.hasTag(u, 'Chunin'))) await G.buff(u, 1, 1, true, 'คาคาชิ');   // our Chunin +1|+1 permanently
      },
    },
    'nr-006': { async onDeath(G, p) { await G.searchToHand(p, c => !G.isSpell(c) && G.hasTag(c, 'Konoha')); } },
    'nr-007': { // Itachi
      async onTurnStart(G, p, self) {   // every enemy 0|-2 (no "ถาวร" -> until round end, G2); 0 health = dies
        const l = enemies(G, p); if (l.length) tempNote(G, self.card);
        for (const u of l) await G.buff(u, 0, -2, false, 'อิทาจิ');
        await G.checkDeaths();
      },
      async onPlay(G, p) { await G.createToHand(p, 'nr-020', 'อิทาจิ'); },
    },
    'nr-014': { // Shikamaru: stun a random enemy; it stays stunned while Shikamaru is on the field; if it dies, do it again
      async onPlay(G, p, self) { const t = G.pick(enemies(G, p).filter(u => !u.stunned)) || G.pick(enemies(G, p)); if (t) { await G.stun(t); t.stunLock = self.uid; } },
      async onAnyDeath(G, p, self, dead) { if (dead.stunLock === self.uid && G.alive(self)) await E['nr-014'].onPlay(G, p, self); },
    },
    'nr-018': { // Zabuza: ETB up to 2 different enemies take 2 (C7); attacks: +0|+2 permanent (C8)
      async onPlay(G, p, self) {
        const first = await pick(G, p, enemies(G, p), 'harm', 'ซาบูสะ: เลือกศัตรูตัวที่ 1 (รับ 2)');
        if (!first) return; await G.damage(first, 2, self);
        const second = await pick(G, p, enemies(G, p).filter(u => u !== first), 'harm', 'ซาบูสะ: เลือกศัตรูตัวที่ 2 (รับ 2)');
        if (second) await G.damage(second, 2, self);
      },
      async onAttack(G, p, self) { await G.buff(self, 0, 2, true, 'ซาบูสะโจมตี'); },
    },
    'nr-021': { // Hiruzen: summon Enma + Dead Demon Seal; other Konoha allies +2|+2 permanently
      async onPlay(G, p, self) {
        await G.summon(p, 'nr-022'); await G.summon(p, 'nr-023');
        for (const u of allies(G, p, self).filter(u => G.hasTag(u, 'Konoha'))) await G.buff(u, 2, 2, true, 'ฮิรุเซ็น');
      },
    },
    'nr-023': { // Seal: on entering, pick an enemy — it cannot attack while the seal is on the field (C11)
      async onPlay(G, p, self) {
        const t = await pick(G, p, enemies(G, p).filter(u => !u.sealedBy), 'harm', 'ผนึกซากอสูร: เลือกศัตรูที่ห้ามโจมตี');
        if (t) { t.sealedBy = self.uid; await G.ui.event('status', { unit: t, text: 'ถูกผนึก' }); await G.log(`${t.card.nameEn} ถูกผนึก โจมตีไม่ได้`, 'status'); }
      },
    },
    'nr-024': { /* Ebisu: on play */ async onPlay(G, p) { p.nextDrawBuff++; await G.log('ตัวละครใบถัดไปที่จั่วได้ +1|+1 ถาวร (เอบิสึ)', 'buff'); } },
    'nr-025': { async onPlay(G) { G.note('เท็นเท็น: การ์ด "คุไน ยันต์ระเบิด" ยังไม่มีในไฟล์ (C13) — effect นี้ยังไม่ทำงาน'); } },
    'nr-028': { // Naruto (clone): draw Shadow Clone from the deck ("จากในเด็ค"); other NARUTO UZUMAKI on our field +1|+1 permanently
      async onPlay(G, p, self) {
        if (!p.hand.some(c => c.id === 'nr-033')) await G.searchToHand(p, c => c.id === 'nr-033', false);   // only if no Shadow Clone in hand
        const others = allies(G, p, self).filter(u => nameIs(G, u, 'NARUTO UZUMAKI'));
        for (const u of others) await G.buff(u, 1, 1, true, 'นารูโตะ');
      },
    },
    'nr-029': { // Sakura: every turn one of our characters +1|+1 permanently (card text: "ถาวร"; cap +3 per target, C16)
      async onTurnStart(G, p, self) {
        const t = await pick(G, p, allies(G, p).filter(u => (u.buffFrom[self.uid] || 0) < 3), 'help', 'ซากุระ: เลือกพวกเรา +1|+1');
        if (t) { t.buffFrom[self.uid] = (t.buffFrom[self.uid] || 0) + 1; tempNote(G, self.card); await G.buff(t, 1, 1, false, 'ซากุระ'); }   // no "ถาวร" any more -> this round
      },
      async onPlay(G, p, self) { for (const u of allies(G, p, self).filter(u => G.hasTag(u, 'Team 7'))) await G.buff(u, 0, 1, true, 'ซากุระ'); },   // our Team 7 +0|+1 permanently
    },
    'nr-030': { // Sasuke: every turn (mandatory, C17) another ally 0|-1 permanently, Sasuke +1|+0 permanently; on play create a Fire Ball
      async onTurnStart(G, p, self) {
        const t = await pick(G, p, allies(G, p, self), 'sacrifice', 'ซาซึเกะ: เลือกพวกเรา 0|-1 ถาวร (บังคับ)');
        if (!t) return; await G.buff(t, 0, -1, true, 'ซาซึเกะ'); await G.checkDeaths(); await G.buff(self, 1, 0, true, 'ซาซึเกะ');
      },
      async onPlay(G, p) { await G.createToHand(p, 'nr-020', 'ซาซึเกะ'); },
    },
    'nr-032': { async onDeath(G, p) { await G.searchToHand(p, c => c.id === 'nr-031', false); } },   // Teuchi: Death — Ramen from the deck
    'nr-039': { // Haku: on play stun an enemy; every turn each stunned enemy takes 1 ("Health -1" = damage)
      async onPlay(G, p) { const t = await pick(G, p, enemies(G, p), 'harm', 'ฮาคุ: เลือกศัตรูที่จะ Stun'); if (t) await G.stun(t); },
      async onTurnStart(G, p, self) {
        const list = enemies(G, p).filter(u => u.stunned);
        if (!list.length) G.note('ฮาคุ: stun หมดตอนจบรอบ (กติกา G9) แต่ effect นี้ทำงานต้นรอบ จึงแทบไม่มีศัตรูติด stun — effect นี้อาจไม่เคยทำงาน');
        for (const u of list) await G.damage(u, 1, self);
      },
    },
    'nr-042': { aura(G, src, t) { return src === t && allies(G, G.owner(src)).some(u => u !== src && nameIs(G, u, 'Izumo')) ? { p: 2 } : null; } },
    'nr-043': { aura(G, src, t) { return src === t && allies(G, G.owner(src)).some(u => u !== src && nameIs(G, u, 'Kotetsu')) ? { h: 2 } : null; } },
    'nr-044': { // cost 0 while both Izumo and Kotetsu are on our field; destroy one of each only when played for 0 (C23)
      cost(G, p, base) { const b = allies(G, p); return b.some(u => nameIs(G, u, 'Izumo')) && b.some(u => nameIs(G, u, 'Kotetsu')) ? 0 : base; },
      async onPlay(G, p, self) {
        if (self.playedCost === 0) {
          const iz = allies(G, p, self).find(u => nameIs(G, u, 'Izumo')), ko = allies(G, p, self).find(u => nameIs(G, u, 'Kotetsu'));
          if (iz) await G.destroy(iz, 'รวมร่าง'); if (ko) await G.destroy(ko, 'รวมร่าง');
          await G.checkDeaths();
        }
        const l = allies(G, p, self).filter(u => G.hasTag(u, 'Konoha'));   // our other Konoha
        for (const u of l) await G.buff(u, 1, 1, true, 'อิสึโมะ & โคเท็ตสึ');   // +1|+1 permanently
      },
    },
    'nr-045': { // Ino: draw 1; our Chunin +1|+1 permanently
      async onPlay(G, p, self) { await G.draw(p, 1); for (const u of allies(G, p).filter(u => G.hasTag(u, 'Chunin'))) await G.buff(u, 1, 1, true, 'อิโนะ'); },
    },
    'nr-046': { // Genma: every character card in our deck +1|+1 permanently (C24)
      async onPlay(G, p) { let n = 0; for (const c of p.deck) if (!G.isSpell(c)) { c.bonusP++; c.bonusH++; n++; } await G.log(`ตัวละครในเด็ค ${n} ใบได้ +1|+1 ถาวร (เก็นมะ)`, 'buff'); },
    },
    'nr-049': { // Tazuna: an ally +0|+1, or +1|+1 if Team 7 (temporary per G2)
      async onPlay(G, p, self) {
        const t = await pick(G, p, allies(G, p, self), 'help', 'ทาสึนะ: เลือกพวกเรา'); if (!t) return;
        if (G.hasTag(t, 'Team 7')) await G.buff(t, 1, 1, true, 'ทาสึนะ'); else await G.buff(t, 0, 1, true, 'ทาสึนะ');   // permanent
      },
    },
    'nr-051': { // Gato
      async onSurviveDamage(G, p, self) {     // first time it survives any damage (combat or effect)
        if (self.survivedAttack) return; self.survivedAttack = true;
        await G.log('กาโต้รอดจากความเสียหายครั้งแรก — อัญเชิญ Gato Gang จากเด็ค', 'spell');
        await G.searchToField(p, c => G.hasTag(c, 'Gato Gang'));
      },
      async onDeath(G, p) { await G.searchToHand(p, c => !G.isSpell(c) && G.hasTag(c, 'Gato Gang')); },
      async onPlay(G, p, self) { const l = allies(G, p, self).filter(u => G.hasTag(u, 'Gato Gang')); if (l.length) tempNote(G, self.card); for (const u of l) await G.buff(u, 1, 1, false, 'กาโต้'); },
    },
    'nr-052': { // Mizuki: every time it survives damage, draw the top spell of the deck (C29)
      async onSurviveDamage(G, p) { const c = p.deck.find(x => G.isSpell(x)); if (c) await G.searchToHand(p, x => x === c, false); },
    },
    'nr-054': { // Zori: on play a random water character in hand costs 1 less (permanently); +2|+2 while another Gato Gang is on our field
      async onPlay(G, p) { const c = G.pick(p.hand.filter(c => !G.isSpell(c) && c.card.element === 'water')); if (c) { c.costDelta = (c.costDelta || 0) - 1; await G.log(`${c.card.nameEn} บนมือค่าร่าย -1 (โซริ)`, 'buff'); } },
      aura(G, src, t) { return src === t && allies(G, G.owner(src), src).some(u => G.hasTag(u, 'Gato Gang')) ? { p: 2, h: 1 } : null; },   // Zori +2|+1 with another Gato Gang
    },
    'nr-055': partner('Gouzu', 0, 2),
    'nr-081': spellTarget('หมัดแห่งโทสะ: เลือกศัตรูรับความเสียหาย', 'harm', false, async (G, p, t, c) => G.damage(t, p.diedThisRound ? 5 : 4, c)),   // Fist of Fury: 4, or 5 if one of ours was killed this round
    'nr-079': { // Naruto (hero): create a Shadow Clone; a random keyword (not Ephemeral) to one of our Team 7 permanently; when it kills: another Shadow Clone
      lvl: { need: 5, cond: 'ตัวละครฝ่ายเรา tag "Genin" ตาย 5 ครั้ง', anyDeath: (G, p, self, dead) => dead.owner === self.owner && G.hasTag(dead, 'Genin') ? 1 : 0 },   // level up: 5 of our Genin die (while Naruto is on the field)
      async onPlay(G, p, self) {
        await G.createToHand(p, 'nr-033', 'นารูโตะ');
        const t = await pick(G, p, allies(G, p).filter(u => G.hasTag(u, 'Team 7')), 'help', 'นารูโตะ: เลือกตัว Team 7 ที่จะได้ keyword สุ่ม');
        if (t) { const kw = G.pick(['fearsome', 'challenger', 'quickstrike', 'tough', 'barrier', 'regenerate'].filter(k => !G.has(t, k))); if (kw) await giveKw(G, t, kw, 'นารูโตะ'); }
      },
      async onKill(G, p) { await G.createToHand(p, 'nr-033', 'นารูโตะ'); },
    },
    'nr-080': { // Naruto, Bijuu Cloak: when it attacks every enemy character -1|-1 permanently; every turn the enemy loses 1 mana and we gain 1
      async onAttack(G, p) { for (const u of enemies(G, p)) await G.buff(u, -1, -1, true, 'อาภรณ์สัตว์หาง'); await G.checkDeaths(); },
      async onTurnStart(G, p) { const o = G.other(p); o.mana = Math.max(0, o.mana - 1); await G.log(`${o.name} มานา -1 (อาภรณ์สัตว์หาง)`, 'status'); await gainMana(G, p, 1, 'อาภรณ์สัตว์หาง'); },
    },
    'nr-078': spellTarget('รถถังมนุษย์: เลือกศัตรูรับความเสียหาย 4', 'harm', false, async (G, p, t, c) => {   // Human Bullet Tank: 4 damage; with Choji on our field a stunned target is destroyed
      if (t.stunned && allies(G, p).some(u => nameIs(G, u, 'Choji Akimiji') || u.card.nameTh === 'โจจิ อิคิมิจิ' || u.card.nameTh === 'โจจิ อาคิมิจิ')) await G.destroy(t, 'รถถังมนุษย์');
      else await G.damage(t, 4, c);
    }),
    'nr-074': { // Asuma: costs 1 less with a Team 10 on our field; random spell from the deck (costs 1 less), Barrier to a Team 10 or Jonin of ours
      cost(G, p, base) { return allies(G, p).some(u => G.hasTag(u, 'Team 10')) ? Math.max(0, base - 1) : base; },
      async onPlay(G, p, self) {
        const c = await G.searchToHand(p, x => G.isSpell(x)); if (c) { c.costDelta = (c.costDelta || 0) - 1; await G.log(`${c.card.nameEn} ค่าร่าย -1 (อาสึมะ)`, 'buff'); }
        const t = await pick(G, p, allies(G, p, self).filter(u => G.hasTag(u, 'Team 10') || G.hasTag(u, 'Jonin')), 'help', 'อาสึมะ: เลือก Team 10 หรือ Jonin ฝั่งเราให้ได้เกราะคาถา', true);
        if (t) await giveKw(G, t, 'barrier', 'อาสึมะ');
      },
    },
    'nr-075': { // Team 10: put an Ino-Shika-Cho character (cost < 7) from the deck onto the field; then if Shikamaru, Ino and Choji are all on our field, summon Asuma from hand or deck
      async onCast(G, p) {
        const opts = p.deck.filter(c => !G.isSpell(c) && G.hasTag(c, 'Ino-Shika-Cho') && (c.card.cost || 0) < 7);
        const seen = [...new Map(opts.map(c => [c.id, c])).values()];
        if (seen.length && p.board.length < G.R.boardMax) {
          const ch = seen.length === 1 ? { value: seen[0] } : await G.choose(p, seen.map(c => ({ label: `${c.card.nameTh} (${c.card.cost})`, value: c })), { intent: 'mode', prompt: 'ทีม 10: เลือกตัวละครจากเด็คลงสนาม' });
          const c = ch && ch.value; if (c) { p.deck.splice(p.deck.indexOf(c), 1); await G.enterField(p, c, { from: 'deck' }); }
        } else await G.log('ในเด็คไม่มี Ino-Shika-Cho ค่าร่ายน้อยกว่า 7 (หรือสนามเต็ม)', 'sys');
        const has = n => allies(G, p).some(u => nameIs(G, u, n));
        if (has('Shikamaru Nara') && has('Ino Yamanaka') && has('Choji Akimiji') && p.board.length < G.R.boardMax) {
          const h = p.hand.find(c => c.id === 'nr-074');
          if (h) { p.hand.splice(p.hand.indexOf(h), 1); await G.enterField(p, h, { from: 'deck' }); }
          else await G.searchToField(p, c => c.id === 'nr-074');
        }
      },
    },
    'nr-076': { // Chess: one of our characters +2|+2 this round — a Team 10 gets it permanently and we gain 1 mana
      canPlay(G, p) { return need(allies(G, p).length > 0, 'ต้องมีตัวละครฝั่งเรา'); },
      async onCast(G, p, c) {
        const t = await pick(G, p, allies(G, p), 'help', 'หมากรุก: เลือกพวกเรา +2|+2'); if (!t) return;
        if (G.hasTag(t, 'Team 10')) { await G.buff(t, 2, 2, true, 'หมากรุก'); await gainMana(G, p, 1, 'หมากรุก'); } else { tempNote(G, c.card); await G.buff(t, 2, 2, false, 'หมากรุก'); }
      },
    },
    'nr-077': Object.assign(spellTarget('คาถาจิตย้ายร่าง: เลือกศัตรูที่จะ Stun', 'harm', false, async (G, p, t) => G.stun(t)),   // Mind Body Switch; costs 0 with a Yamanaka on our field
      { cost(G, p, base) { return allies(G, p).some(u => G.hasTag(u, 'Yamanaka')) ? 0 : base; } }),
    'nr-073': { // Anko: a Konoha character of ours gets Barrier; create a Curse mark (nr-013) in hand
      async onPlay(G, p, self) {
        const t = await pick(G, p, allies(G, p).filter(u => G.hasTag(u, 'Konoha')), 'help', 'อันโกะ: เลือกตัวละคร Konoha ฝั่งเราที่จะได้เกราะคาถา');
        if (t) await giveKw(G, t, 'barrier', 'อันโกะ');
        await G.createToHand(p, 'nr-013', 'อันโกะ');
      },
    },
    'nr-071': { // Hayate: our Genin +2|+2 while it is on the field; Death: Jonin cards and spells in our hand cost 1 less (permanently)
      aura(G, src, t) { return t !== src && t.owner === src.owner && G.hasTag(t, 'Genin') ? { p: 2, h: 2 } : null; },
      async onDeath(G, p) {
        for (const c of p.hand) { let d = 0; if (G.hasTag(c, 'Jonin')) d--; if (G.isSpell(c)) d--; if (d) c.costDelta = (c.costDelta || 0) + d; }
        await G.log('ฮายาเตะตาย — การ์ด Jonin และเวทย์บนมือค่าร่าย -1', 'buff');
      },
    },   // Meizu: Gato Gang +0|+2 permanently
    // Kakashi (hero): on play our Team 7 +2|+2 (no "ถาวร" -> this round, G2); while on the field our Ninken in hand cost 1 less
    'nr-068': {
      lvl: { need: 4, cond: 'อัญเชิญ Ninken ลงสู่สนาม 4/4 ครั้ง', allyEnter: (G, p, self, other) => G.hasTag(other, 'Ninken') ? 1 : 0 },   // level up: summon Ninken 4 times (while Kakashi is on the field)
      async onPlay(G, p, self) { tempNote(G, self.card); for (const u of allies(G, p, self).filter(u => G.hasTag(u, 'Team 7'))) await G.buff(u, 2, 2, false, 'คาคาชิ'); },
      handCost(G, p, x) { return G.hasTag(x, 'Ninken') ? -1 : 0; },
    },
    'nr-026': { // Bisuke: our Team 7 characters +2|+2 permanently; +2|+2 itself if Kakashi is on our field
      async onPlay(G, p, self) {
        for (const u of allies(G, p, self).filter(u => G.hasTag(u, 'Team 7'))) await G.buff(u, 1, 1, true, 'บิซูเกะ');
        await withKakashi(0, 1)(G, p, self);   // itself 0|+1 with Kakashi
      },
    },
    'nr-027': { onPlay: withKakashi(2, 1) },   // Bull: +2|+1 with Kakashi
    'nr-061': { // Inari: Death — random "Genin" card from the deck; +2|+1 while our Naruto is on the field
      async onDeath(G, p) { await G.searchToHand(p, c => G.hasTag(c, 'Genin')); },
      aura(G, src, t) { return src === t && allies(G, G.owner(src), src).some(u => nameIs(G, u, 'NARUTO UZUMAKI')) ? { p: 2, h: 1 } : null; },
    },
    'nr-062': { // Pakkun: +2|+2 with Kakashi, then a Team 7 card from the deck ("จั่ว … จากในเด็ค" = search, random)
      async onPlay(G, p, self) { await withKakashi(2)(G, p, self); await G.searchToHand(p, c => G.hasTag(c, 'Team 7')); },
    },
    'nr-063': { // Urushi: +1 mana now (read as "ได้รับมานา +1"), our Team 7 +2|+2 permanently; Death: +1 mana
      async onPlay(G, p, self) {
        await gainMana(G, p, 1, 'ยุรูชิ');
        for (const u of allies(G, p, self).filter(u => G.hasTag(u, 'Team 7'))) await G.buff(u, 2, 2, true, 'ยุรูชิ');
        for (const u of allies(G, p, self).filter(u => G.hasTag(u, 'Ninken'))) await G.buff(u, 1, 1, true, 'ยุรูชิ');
      },
      async onDeath(G, p) { await gainMana(G, p, 2, 'ยุรูชิ'); },
    },
    'nr-064': { onPlay: withKakashi(0, 2),   // Shiba: +0|+2 with Kakashi; costs 1 less with a Jonin or Team 7 on our field
      cost(G, p, base) { return allies(G, p).some(u => G.hasTag(u, 'Jonin') || G.hasTag(u, 'Team 7')) ? Math.max(0, base - 1) : base; } },
    'nr-070': { // Dogs finding owner: our Ninken +0|+3 (no "ถาวร" -> this round, G2); with 2+ Ninken on our field, Kakashi from the deck
      async onCast(G, p, c) {
        const dogs = allies(G, p).filter(u => G.hasTag(u, 'Ninken')); if (dogs.length) tempNote(G, c.card);
        for (const u of dogs) await G.buff(u, 0, 3, false, 'สุนัขตามหาเจ้าของ');
        if (dogs.length > 1) await G.searchToHand(p, x => !G.isSpell(x) && nameIs(G, x, KAKASHI));
      },
    },
    'nr-065': { // Akino: +2|+2 if another Ninken is on our field; give Challenger to another Ninken
      async onPlay(G, p, self) {
        const dogs = allies(G, p, self).filter(u => G.hasTag(u, 'Ninken'));
        if (dogs.length) await G.buff(self, 2, 0, true, 'อากิโนะ');
        const t = await pick(G, p, dogs, 'help', 'อากิโนะ: เลือกนินเคนที่จะได้ท้าดวล', true); await giveKw(G, t, 'challenger', 'อากิโนะ');
      },
    },
    'nr-066': { // Uhei: +1|+1 with Kakashi; Death: random spell from the deck, it costs 1 less permanently
      onPlay: withKakashi(1),
      async onDeath(G, p) { const c = await G.searchToHand(p, c => G.isSpell(c)); if (c) { c.costDelta = (c.costDelta || 0) - 1; await G.log(`${c.card.nameEn} ค่าร่าย -1 ถาวร (อุย)`, 'buff'); } },
    },
    'nr-067': { // Guruko: give Tough to one of our characters
      async onPlay(G, p, self) { const t = await pick(G, p, allies(G, p), 'help', 'กูรูโกะ: เลือกพวกเราที่จะได้เกราะหนา'); await giveKw(G, t, 'tough', 'กูรูโกะ'); },
    },
    'nr-056': partner('Meizu', 2, 0),   // Gouzu: Gato Gang +2|+0 permanently
    'nr-059': { // Meizu & Gouzu
      canPlay(G, p) { return need(allies(G, p).some(u => u.card.element === 'water'), 'ต้องทำลายตัวละครธาตุน้ำฝั่งเรา 1 ตัว (ไม่มี)'); },
      async payExtra(G, p) {   // mandatory extra cost (C33)
        const t = await pick(G, p, allies(G, p).filter(u => u.card.element === 'water'), 'sacrifice', 'เมอิสึ & โกยุสึ: เลือกตัวละครธาตุน้ำฝั่งเราที่จะทำลาย');
        if (!t) return false; await G.destroy(t, 'ค่าใช้ของเมอิสึ & โกยุสึ'); return true;
      },
      async onPlay(G, p, self) {
        const t = await pick(G, p, allies(G, p, self).filter(u => nameIs(G, u, 'Meizu') || nameIs(G, u, 'Gouzu')), 'help', 'เลือกเมอิสึหรือโกยุสึ +1|+1');
        if (t) { tempNote(G, self.card); await G.buff(t, 1, 1, false, 'เมอิสึ & โกยุสึ'); }
        await G.searchToHand(p, c => c.card.element === 'water');          // once, on play (C34)
        G.shuffle(p.deck);
      },
    },

    // ---------- spells ----------
    'nr-008': spellTarget('กระสุนวงจักร: เลือกตัวละครศัตรูรับความเสียหาย 3', 'harm', false, async (G, p, t, c) => G.damage(t, 3, c)),
    'nr-010': { // Chunin exam: one of ours to hand, then one of theirs (C5)
      canPlay(G, p) { return need(allies(G, p).length > 0, 'ต้องมีตัวละครฝั่งเราให้ส่งกลับมือก่อน'); },
      async onCast(G, p) {
        const a = await pick(G, p, allies(G, p), 'sacrifice', 'สอบจูนิน: เลือกตัวละครฝั่งเรากลับมือ'); if (a) await G.bounce(a);
        const b = await pick(G, p, enemies(G, p), 'harm', 'สอบจูนิน: เลือกตัวละครศัตรูกลับมือ'); if (b) await G.bounce(b);
      },
    },
    'nr-011': spellTarget('คาถาสลับร่าง: เลือกตัวละคร Power เป็น 0 ถึงจบรอบ', 'harm', true, async (G, p, t) => G.zeroPower(t)),
    'nr-012': { async onCast(G, p, c) { for (const u of enemies(G, p)) await G.damage(u, 3, c); } },
    'nr-013': {   // Curse mark: one of OUR characters +3|-1 this round; a "Curse mark" character takes no -1
      canPlay(G, p) { return need(allies(G, p).length > 0, 'ต้องมีตัวละครฝั่งเรา'); },
      async onCast(G, p, c) {
        const t = await pick(G, p, allies(G, p), 'help', 'อักขระสาบ: เลือกพวกเรา +3|-1'); if (!t) return;
        const marked = G.hasTag(t, 'Curse mark') || G.hasTag(t, 'Curse-mark') || nameIs(G, t, 'Curse mark');
        tempNote(G, c.card); await G.buff(t, 3, marked ? 0 : -1, false, 'อักขระสาบ'); await G.checkDeaths();
      },
    },
    'nr-015': { async onCast(G, p) { for (const u of allies(G, p).filter(u => G.hasTag(u, 'Team 7'))) await G.buff(u, 2, 1, true, 'ภารกิจของ Team 7'); } },   // our Team 7 +2|+1 permanently
    'nr-017': {
      canPlay(G, p) { return need(allies(G, p).length > 0, 'ต้องมีตัวละครฝั่งเรา'); },
      async onCast(G, p) { const t = await pick(G, p, allies(G, p), 'sacrifice', 'เนตรวงแหวน: เลือกพวกเรา Power 0 ถึงจบรอบ'); if (t) await G.zeroPower(t); await G.draw(p, 2); },
    },
    'nr-020': Object.assign(spellTarget('บอลเพลิง: เลือกศัตรู 0|-3', 'harm', false, async (G, p, t, c) => { tempNote(G, c.card); await G.buff(t, 0, -3, false, 'บอลเพลิง'); await G.checkDeaths(); }),   // an enemy 0|-3 (no "ถาวร" -> this round)
      { cost(G, p, base) { return allies(G, p).some(u => G.hasTag(u, 'Uchiha')) ? Math.max(0, base - 2) : base; } }),   // Condition: Uchiha on our field -> cost -2
    'nr-031': {   // Ramen: one of OUR characters +0|+2 permanently
      canPlay(G, p) { return need(allies(G, p).length > 0, 'ต้องมีตัวละครฝั่งเรา'); },
      async onCast(G, p) { const t = await pick(G, p, allies(G, p), 'help', 'ราเม็ง: เลือกพวกเรา +0|+2 ถาวร'); if (t) await G.buff(t, 0, 2, true, 'ราเม็ง'); },
    },
    'nr-033': { // Shadow clone: copy an ally (cost ≤ 5) as an ephemeral clone that also runs its on-play (C19 note)
      canPlay(G, p) { return need(allies(G, p).some(u => (u.card.cost || 0) <= 5) && p.board.length < G.R.boardMax, 'ไม่มีตัวละครค่าร่าย ≤ 5 ให้ก๊อป (หรือสนามเต็ม)'); },
      async onCast(G, p, c) {
        const t = await pick(G, p, allies(G, p).filter(u => (u.card.cost || 0) <= 5), 'help', 'คาถาแยกเงา: เลือกตัวละครที่จะก๊อป');
        if (t) { const clone = G.inst(t.id, p.i); clone.token = true; clone.bonusP = t.bonusP; clone.bonusH = t.bonusH; await G.enterField(p, clone, { from: 'clone', kws: ['ephemeral'] }); }
      },
    },
    'nr-034': spellTarget('คุกน้ำ: เลือกศัตรูที่จะ Stun', 'harm', false, async (G, p, t) => G.stun(t)),
    'nr-035': Object.assign(spellTarget('พันปักษา: เลือกศัตรูรับความเสียหาย 4', 'harm', false, async (G, p, t, c) => G.damage(t, 4, c)),   // Chidori
      { cost(G, p, base) { return allies(G, p).some(u => G.hasTag(u, 'Chidori-User') || G.hasTag(u, 'Chidori user')) ? Math.max(0, base - 1) : base; } }),
    'nr-036': { async onCast(G, p) { for (const u of allies(G, p).filter(u => G.hasTag(u, 'Jonin'))) await G.buff(u, 2, 2, true, 'ประชุมหน่วยลับ'); } },   // our Jonin +2|+2 permanently
    'nr-037': spellTarget('คาถาลวงตา: เลือกตัวละคร Power 0 ถึงจบรอบ', 'harm', true, async (G, p, t) => G.zeroPower(t)),
    'nr-038': { // Icha Icha: only if the enemy has 2+ characters costing more than 5 (C21)
      canPlay(G, p) { return need(enemies(G, p).filter(u => (u.card.cost || 0) > 5).length >= 2, 'ศัตรูต้องมีตัวละครค่าร่าย > 5 อย่างน้อย 2 ตัว'); },
      async onCast(G, p) { const t = await pick(G, p, enemies(G, p), 'harm', 'อะจึ๋ย: เลือกศัตรูที่จะ Stun'); if (t) await G.stun(t); },
    },
    'nr-040': { async onCast(G, p, c) { for (const u of G.allUnits().filter(u => u.stunned)) await G.damage(u, 3, c); } },   // both sides (C22)
    'nr-041': spellTarget('เข็ม: เลือกศัตรู 0|-1 ถาวร และ Stun', 'harm', false, async (G, p, t) => { await G.buff(t, 0, -1, true, 'เข็ม'); await G.stun(t); }),   // Health -1 permanently (not damage)
    'nr-047': { // destroy one of our Konoha characters (cost, as C25), then destroy an enemy
      canPlay(G, p) { return need(allies(G, p).some(u => G.hasTag(u, 'Konoha')), 'ต้องมีตัวละครแท็ก Konoha ฝั่งเราให้ทำลาย'); },
      async onCast(G, p) {
        const a = await pick(G, p, allies(G, p).filter(u => G.hasTag(u, 'Konoha')), 'sacrifice', 'เลือกตัวละคร Konoha ฝั่งเราที่จะทำลาย'); if (!a) return; await G.destroy(a, 'ค่าใช้');
        const b = await pick(G, p, enemies(G, p), 'harm', 'เลือกศัตรูที่จะทำลาย'); if (b) await G.destroy(b);
      },
    },
    'nr-048': { async onCast(G, p) { await G.draw(p, 1); if (allies(G, p).filter(u => G.hasTag(u, 'Team 7')).length >= 2) await G.draw(p, 1); } },
    'nr-050': Object.assign(spellTarget('มังกรวารี: เลือกศัตรูที่จะทำลาย', 'harm', false, async (G, p, t) => G.destroy(t)),
      { cost(G, p, base) { return allies(G, p).some(u => G.hasTag(u, 'Water Style')) ? 5 : base; } }),
    'nr-058': { // Dirty Hand: destroy 2 of ours (1 if a Gato Gang is on our field), then another ally gains Tough
      canPlay(G, p) { const n = allies(G, p).some(u => G.hasTag(u, 'Gato Gang')) ? 1 : 2; return need(allies(G, p).length >= n + 1, `ต้องมีตัวละครฝั่งเราอย่างน้อย ${n + 1} ตัว`); },
      async onCast(G, p) {
        const n = allies(G, p).some(u => G.hasTag(u, 'Gato Gang')) ? 1 : 2;
        for (let k = 0; k < n; k++) { const t = await pick(G, p, allies(G, p), 'sacrifice', `มือสกปรก: เลือกพวกเราที่จะทำลาย (${k + 1}/${n})`); if (t) await G.destroy(t, 'ค่าใช้'); }
        const t = await pick(G, p, allies(G, p), 'help', 'มือสกปรก: เลือกพวกเราที่จะได้เกราะหนา'); if (t) await G.grantKeyword(t, 'tough');
      },
    },
    'nr-060': { // Foolish Hero: an ally −2|0 permanently unless Gato Gang (C35, C36), then an enemy back to hand
      canPlay(G, p) { return need(allies(G, p).length > 0, 'ต้องมีตัวละครฝั่งเรา'); },
      async onCast(G, p) {
        const a = await pick(G, p, allies(G, p), 'sacrifice', 'ฮีโร่ผู้โง่เขลา: เลือกพวกเรา −2|0 (Gato Gang ไม่ลด)');
        if (a && !G.hasTag(a, 'Gato Gang')) await G.buff(a, -2, 0, true, 'ฮีโร่ผู้โง่เขลา');
        const b = await pick(G, p, enemies(G, p), 'harm', 'เลือกศัตรูกลับมือ'); if (b) await G.bounce(b);
      },
    },
  };

  // Meizu / Gouzu: fetch the partner from the deck if it is not in hand; other Gato Gang on our field +0|+2 (temporary per G2, C31)
  function partner(other, pw, hp) {
    return {
      async onPlay(G, p, self) {
        if (!p.hand.some(c => G.nameIs(c, other) || G.nameIs(c, self.card.nameEn))) await G.searchToHand(p, c => G.nameIs(c, other), false);   // only if neither twin is in hand
        const l = allies(G, p, self).filter(u => G.hasTag(u, 'Gato Gang'));
        for (const u of l) await G.buff(u, pw, hp, true, self.card.nameEn);
      },
    };
  }
  // a spell with one target; anyUnit = side not specified in the card text (G3)
  function spellTarget(prompt, intent, anyUnit, fn) {
    return {
      canPlay(G, p) { return need((anyUnit ? anySide(G) : enemies(G, p)).length > 0, 'ไม่มีเป้าหมาย'); },
      async onCast(G, p, c) {
        if (anyUnit) sideNote(G, c.card);
        const t = await pick(G, p, anyUnit ? anySide(G) : enemies(G, p), intent, prompt);
        if (t) await fn(G, p, t, c);
      },
    };
  }

  // Kakashi, level-up form: when it kills a character, Chidori in hand cost 1 less permanently;
  // while on the field our Ninken in hand cost 1 less, and each Ninken we summon stuns an enemy of our choice
  E['nr-069'] = {
    async onKill(G, p) { for (const c of p.hand.filter(c => nameIs(G, c, 'Chidori') || c.card.nameTh === 'พันปักษา')) { c.costDelta = (c.costDelta || 0) - 1; await G.log(`${c.card.nameEn} บนมือค่าร่าย -1 ถาวร (คาคาชิ)`, 'buff'); } },
    handCost(G, p, x) { return G.hasTag(x, 'Ninken') ? -1 : 0; },
    async onAllyEnter(G, p, self, other) { if (!G.hasTag(other, 'Ninken')) return; const t = await pick(G, p, enemies(G, p).filter(u => !u.stunned), 'harm', 'คาคาชิ: นินเคนลงสนาม — เลือกศัตรูที่จะ Stun', true); if (t) await G.stun(t); },
  };
  root.LW = Object.assign(root.LW || {}, { EFFECTS: E });
  if (typeof module !== 'undefined' && module.exports) module.exports = { EFFECTS: E };
})(typeof window !== 'undefined' ? window : globalThis);
