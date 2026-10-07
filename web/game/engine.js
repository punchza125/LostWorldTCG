// LostWorld TCG — rules engine (prototype v0.2, round structure modelled on Legends of Runeterra).
// Pure game logic: no DOM. The renderer listens through `ui.event(type, data)` (awaited, so it can animate),
// and each side is driven by a controller ({ takeAction, declareBlocks, respond, choose }) — human UI or AI.
// Works in the browser (window.LW) and in Node (globalThis.LW) for automated test games.
//
// Round flow (LoR):  round start → both gain a mana gem (max 10) and refill, both draw 1, "every turn" effects
//   → players alternate ACTIONS starting with the attack-token holder: play a unit, cast a slow/fast spell,
//     attack (token holder, once per round) or pass. Burst spells don't use up your action.
//   → slow/fast spells go on a stack; the other player may respond with fast/burst; the stack resolves last-in-first-out.
//   → when both players pass in a row the round ends: unused mana (max 3) becomes spell mana, damage heals,
//     "this round" buffs / stun end, ephemeral units die. The attack token switches sides.
(function (root) {
  'use strict';

  const RULES = {
    startLife: 20,          // LoR nexus health
    maxMana: 10,
    spellBank: 3,           // unused mana kept for spells
    boardMax: 6,
    handMax: 10,
    openHand: 4,            // + 1 draw at the start of round 1
    mulligan: true,         // LoR: each player may send any opening cards back for new ones
    noAttackRound1: true,   // the user's rule: no attacks in the very first round
    healAtRoundEnd: false,  // LoR: damage on units stays (never heals by itself); losing a "this round" health buff cannot kill
    deckOutLoses: true,     // LoR: drawing from an empty deck loses the game
  };

  const isSpellData = c => c.kind ? c.kind === 'spell' : /spell|คาถา/i.test(c.type || '');
  const plain = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // signature of the parts of a card that effects depend on — used to spot cards edited after their effect code was written
  const cardSig = c => JSON.stringify([(c.ability || []).map(plain), c.keywords || [], c.speed || '', c.tags || [], c.cost, c.power, c.health, c.type, c.levelUp || '', c.levelUpCondition || '']);

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  class Game {
    constructor(opts) {
      this.R = Object.assign({}, RULES, opts.rules || {});
      this.rand = mulberry32(opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff));
      this.cards = {}; opts.cards.forEach(c => { this.cards[c.id] = c; });
      this.effects = opts.effects || {};
      this.synced = opts.synced || null;             // { id: signature } from web/game/effects-sync.json
      this.ui = opts.ui || { event: async () => {} };
      this.uidN = 1; this.round = 0; this.over = false; this.winner = null;
      this.logs = []; this.unsupported = new Set(); this.notes = new Set();
      this.token = 0;            // index of the player holding the attack token this round
      this.actor = null;         // index of the player whose action it is
      this.stack = [];           // spells waiting to resolve: { p, x }
      this.inChain = false; this.combat = null; this.window = null;   // window = index of the player who may respond now
      this.players = [0, 1].map(i => ({
        i, name: (opts.names || [])[i] || (i ? 'ฝ่ายตรงข้าม' : 'คุณ'), life: this.R.startLife,
        mana: 0, maxMana: 0, spellMana: 0, deck: [], hand: [], board: [], grave: [],
        nextDrawBuff: 0, attackUsed: false, controller: opts.controllers[i],
      }));
      opts.decks.forEach((ids, i) => {
        const p = this.players[i];
        p.deck = ids.filter(id => this.cards[id]).map(id => this.inst(id, i));
        this.shuffle(p.deck);
      });
      this.first = opts.first != null ? opts.first : 0;    // who holds the attack token in round 1
    }
    get turn() { return this.round; }                         // older code / UI used "turn"

    // ---------- helpers ----------
    inst(id, owner) { const p = this.players && this.players[owner], lv = p && p.leveled && p.leveled[id]; if (lv) id = lv; return { uid: this.uidN++, id, card: this.cards[id], owner, bonusP: 0, bonusH: 0 }; }
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    pick(a) { return a.length ? a[Math.floor(this.rand() * a.length)] : null; }
    me(p) { return typeof p === 'number' ? this.players[p] : p; }
    other(p) { return this.players[1 - this.me(p).i]; }
    owner(u) { return this.players[u.owner]; }
    isSpell(x) { return isSpellData(x.card || x); }
    speedOf(x) { const s = (x.card || x).speed; return s === 'burst' || s === 'fast' ? s : 'slow'; }
    tags(x) { return (x.card || x).tags || []; }
    hasTag(x, t) { return this.tags(x).some(v => v.toLowerCase() === String(t).toLowerCase()); }
    nameIs(x, en) { return ((x.card || x).nameEn || '').trim().toLowerCase() === String(en).trim().toLowerCase(); }
    alive(u) { return !!u && this.players[u.owner].board.includes(u); }
    allUnits() { return [...this.players[(this.token)].board, ...this.players[1 - this.token].board]; }
    async log(text, kind, ex) { this.logs.push({ round: this.round, text, kind }); await this.ui.event('log', Object.assign({ text, kind }, ex)); }   // ex = { player, cards } for card history
    note(text) { if (!this.notes.has(text)) { this.notes.add(text); this.logs.push({ round: this.round, text: '⚠ ' + text, kind: 'warn' }); this.ui.event('log', { text: '⚠ ' + text, kind: 'warn' }); } }
    eff(x) { return this.effects[(x.card || x).id] || null; }
    hasAbilityText(x) { return ((x.card || x).ability || []).some(a => plain(a)); }
    outdated(x) { const c = x.card || x; return !!(this.synced && this.eff(c) && this.synced[c.id] && this.synced[c.id] !== cardSig(c)); }
    markUnsupported(x) {
      const c = x.card || x;
      if (this.hasAbilityText(c) && !this.eff(c)) {
        if (!this.unsupported.has(c.id)) this.note(`${c.nameEn} (${c.id}) มี effect ที่ยังไม่ได้เขียนโค้ด — ตอนนี้เล่นแบบไม่มี effect`);
        this.unsupported.add(c.id);
      } else if (this.outdated(c)) this.note(`${c.nameEn} (${c.id}) ถูกแก้ข้อความหลังเขียนโค้ด effect — ในเกมอาจยังทำงานแบบเดิม`);
    }

    // ---------- stats ----------
    aura(u, key) {
      let n = 0;
      for (const s of this.allUnits()) { const e = this.eff(s); if (e && e.aura) { const r = e.aura(this, s, u); if (r && r[key]) n += r[key]; } }
      return n;
    }
    has(u, kw) { return !!u.kws && u.kws.has(kw); }
    power(u) { if (u.zero) return 0; return Math.max(0, (u.card.power || 0) + u.bonusP + (u.tempP || 0) + this.aura(u, 'p')); }
    maxHp(u) { return (u.card.health || 0) + u.bonusH + (u.tempH || 0) + this.aura(u, 'h'); }
    hp(u) { return this.maxHp(u) - (u.dmg || 0); }
    attackBlocked(p) {
      p = this.me(p);
      if (this.over) return 'เกมจบแล้ว';
      if (this.token !== p.i) return 'รอบนี้อีกฝ่ายถือสิทธิ์โจมตี';
      if (p.attackUsed) return 'รอบนี้โจมตีไปแล้ว';
      if (this.R.noAttackRound1 && this.round === 1) return 'รอบแรกของเกมยังโจมตีไม่ได้';
      if (this.actor !== p.i || this.combat || this.stack.length) return 'ยังไม่ถึงตาคุณ';
      return '';
    }
    canAttack(u) { return this.alive(u) && !u.stunned && !u.sealedBy && !this.attackBlocked(this.owner(u)); }
    canBlock(u, attacker) {
      if (!this.alive(u) || u.stunned) return false;
      if (attacker && this.has(attacker, 'fearsome') && this.power(u) < 3) return false;
      return true;
    }

    // ---------- costs / legality ----------
    costOf(p, x) {
      p = this.me(p); const e = this.eff(x);
      let base = Math.max(0, (x.card.cost || 0) + (x.costDelta || 0));   // costDelta = permanent change on this copy
      for (const u of p.board) { const ue = this.alive(u) && this.eff(u); if (ue && ue.handCost) base += ue.handCost(this, p, x) || 0; }   // auras like "Ninken in hand cost 1 less"
      base = Math.max(0, base);
      return e && e.cost ? e.cost(this, p, base) : base;
    }
    canPay(p, x) { p = this.me(p); const cost = this.costOf(p, x); return this.isSpell(x) ? p.mana + p.spellMana >= cost : p.mana >= cost; }
    myAction(p) { return this.actor === p.i && !this.combat && !this.inChain && this.window == null; }
    // '' when playable, otherwise the reason (shown in the UI)
    whyNot(p, x) {
      p = this.me(p); if (this.over) return 'เกมจบแล้ว';
      if (!p.hand.includes(x)) return 'ไม่อยู่บนมือ';
      if (this.isSpell(x)) {
        const sp = this.speedOf(x);
        if (sp === 'slow' && !this.myAction(p)) return 'เวทย์ช้า ใช้ได้เฉพาะตาของคุณ นอกการต่อสู้';
        if (sp !== 'slow' && !(this.myAction(p) || this.window === p.i)) return 'ยังไม่ถึงตาคุณ';
      } else {
        if (!this.myAction(p)) return 'ลงตัวละครได้เฉพาะตาของคุณ นอกการต่อสู้';
        if (p.board.length >= this.R.boardMax) return 'สนามเต็ม';
      }
      if (!this.canPay(p, x)) return 'มานาไม่พอ';
      const e = this.eff(x);
      if (e && e.canPlay) { const r = e.canPlay(this, p, x); if (r !== true && r) return r; }
      return '';
    }
    pay(p, x) {
      const cost = this.costOf(p, x);
      if (this.isSpell(x)) { const fromBank = Math.min(p.spellMana, cost); p.spellMana -= fromBank; p.mana -= cost - fromBank; }
      else p.mana -= cost;
    }

    // ---------- choices ----------
    async choose(p, options, ctx) {
      p = this.me(p); options = options.filter(Boolean);
      if (!options.length || this.over) return null;   // game over: nobody waits for an answer
      return await p.controller.choose(this, p, options, ctx || {});
    }

    // ---------- game / round flow ----------
    async start() {
      for (const p of this.players) await this.draw(p, this.R.openHand, true);
      if (this.R.mulligan) for (const p of this.players) await this.mulligan(p);
      await this.log(`เริ่มเกม — พลังชีวิตคนละ ${this.R.startLife} · ${this.players[this.first].name} ถือสิทธิ์โจมตีรอบแรก (สลับทุกรอบ)`, 'sys');
      while (!this.over) {
        await this.beginRound(); if (this.over) break;
        await this.actions(); if (this.over) break;
        await this.endRound();
        if (this.round >= 40) { await this.log('เกมยาวเกิน 40 รอบ — จบเสมอ', 'sys'); this.over = true; }
      }
      await this.ui.event('gameover', { winner: this.winner });
      return this.winner;
    }
    // LoR mulligan: replacements are drawn first, then the returned cards are shuffled back (so you never redraw them)
    async mulligan(p) {
      if (!p.controller.mulligan) return;
      const back = [...new Set(await p.controller.mulligan(this, p, [...p.hand]) || [])].filter(c => p.hand.includes(c));
      const drawn = [];
      for (const c of back) { if (!p.deck.length) break; const n = p.deck.shift(); p.hand.splice(p.hand.indexOf(c), 1, n); drawn.push(n); }
      const returned = back.slice(0, drawn.length);
      p.deck.push(...returned); this.shuffle(p.deck);
      await this.log(`${p.name} เปลี่ยนการ์ดมือแรก ${returned.length} ใบ`, 'sys');
      if (returned.length) await this.ui.event('mulligan', { player: p.i, back: returned, drawn });
    }
    async beginRound() {
      this.round++; for (const pl of this.players) pl.diedThisRound = 0;
      this.token = this.round % 2 === 1 ? this.first : 1 - this.first;
      const order = [this.players[this.token], this.players[1 - this.token]];
      for (const p of order) { p.maxMana = Math.min(this.R.maxMana, p.maxMana + 1); p.mana = p.maxMana; p.attackUsed = false; }
      await this.ui.event('round', { round: this.round, token: this.token });
      await this.log(`— รอบที่ ${this.round} · ${order[0].name} ถือสิทธิ์โจมตี · มานา ${order[0].maxMana} —`, 'turn');
      for (const p of order) { await this.draw(p, 1); if (this.over) return; }
      // "Every turn" effects = start of each round (glossary G8)
      for (const p of order) for (const u of [...p.board]) {
        if (!this.alive(u)) continue;
        const e = this.eff(u);
        if (e && e.onTurnStart) { await this.ui.event('trigger', { unit: u, kind: 'every-turn' }); await e.onTurnStart(this, p, u); await this.ui.event('trigger-end', { unit: u }); await this.checkDeaths(); if (this.over) return; }
      }
    }
    async actions() {
      let who = this.players[this.token], passes = 0, guard = 0; this.passStreak = 0;
      while (passes < 2 && !this.over && guard++ < 300) {
        this.actor = who.i;
        await this.ui.event('actor', { player: who.i });
        const r = await who.controller.takeAction(this, who);
        if (this.over) return;
        if (r === 'pass') { passes++; await this.log(`${who.name} ผ่าน`, 'sys'); } else passes = 0;
        this.passStreak = passes;           // UI: 1 = the next pass ends the round
        who = this.other(who);
      }
      this.actor = null;
    }
    async endRound() {
      for (const p of this.players) { p.spellMana = Math.min(this.R.spellBank, p.spellMana + p.mana); p.mana = 0; }
      for (const u of this.allUnits().filter(u => this.has(u, 'ephemeral'))) await this.destroy(u, 'ร่างแยกหมดเวลา');
      for (const u of this.allUnits()) {
        u.tempP = 0; u.tempH = 0; u.zero = false;
        u.stunned = !!(u.stunLock && this.allUnits().some(s => s.uid === u.stunLock && this.alive(s)));   // stunLock: kept stunned while its source is on the field
        if (u.barrierTemp) { u.barrier = false; u.barrierTemp = false; }
        if (this.R.healAtRoundEnd) u.dmg = 0;
        else if (this.hp(u) <= 0) u.dmg = this.maxHp(u) - 1;
      }
      await this.ui.event('roundend', { round: this.round });
    }

    // ---------- cards moving ----------
    async draw(p, n, opening) {
      p = this.me(p);
      for (let k = 0; k < n; k++) {
        if (!p.deck.length) {
          if (this.R.deckOutLoses) { this.over = true; this.winner = 1 - p.i; await this.log(`${p.name} ต้องจั่วแต่เด็คหมด — แพ้`, 'sys'); return; }
          continue;
        }
        const c = p.deck.shift();
        if (p.nextDrawBuff && !this.isSpell(c)) { c.bonusP += 1; c.bonusH += 1; p.nextDrawBuff--; await this.log(`${c.card.nameEn} ได้ +1|+1 จาก Ebisu`, 'buff'); }
        if (p.hand.length >= this.R.handMax) { p.grave.push(c); await this.log(`มือเต็ม — ${c.card.nameEn} ถูกทิ้ง`, 'sys'); await this.ui.event('burn', { player: p.i, card: c }); continue; }
        p.hand.push(c);
        await this.ui.event('draw', { player: p.i, card: c, opening: !!opening });
        await this.heroSpells(p);
      }
    }
    async createToHand(p, id, why) {
      p = this.me(p); const card = this.cards[id];
      if (!card) { this.note(`effect อ้างการ์ด ${id} ที่ยังไม่มีในไฟล์`); return null; }
      const c = this.inst(id, p.i); c.token = true;
      if (p.hand.length >= this.R.handMax) { await this.log(`มือเต็ม — ${card.nameEn} หายไป`, 'sys'); return null; }
      p.hand.push(c); await this.ui.event('create', { player: p.i, card: c });
      await this.log(`${p.name} ได้การ์ด ${card.nameEn} ขึ้นมือ${why ? ' (' + why + ')' : ''}`, 'draw');
      return c;
    }
    async searchToHand(p, pred, random = true) {
      p = this.me(p); const list = p.deck.filter(pred);
      if (!list.length) { await this.log('ในเด็คไม่มีการ์ดที่ตรงเงื่อนไข', 'sys'); return null; }
      const c = random ? this.pick(list) : list[0];
      p.deck.splice(p.deck.indexOf(c), 1);
      if (p.hand.length >= this.R.handMax) { p.grave.push(c); return null; }
      p.hand.push(c); await this.ui.event('draw', { player: p.i, card: c, search: true });
      await this.log(`${p.name} ค้นการ์ด ${c.card.nameEn} จากเด็คขึ้นมือ`, 'draw');
      return c;
    }
    async searchToField(p, pred) {
      p = this.me(p); const list = p.deck.filter(c => pred(c) && !this.isSpell(c));
      if (!list.length || p.board.length >= this.R.boardMax) { await this.log('ไม่มีการ์ดให้อัญเชิญจากเด็ค (หรือสนามเต็ม)', 'sys'); return null; }
      const c = this.pick(list); p.deck.splice(p.deck.indexOf(c), 1);
      return await this.enterField(p, c, { from: 'deck' });
    }
    async summon(p, id, opts) {
      p = this.me(p);
      if (!this.cards[id]) { this.note(`effect อ้างการ์ด ${id} ที่ยังไม่มีในไฟล์`); return null; }
      if (p.board.length >= this.R.boardMax) { await this.log('สนามเต็ม อัญเชิญไม่ได้', 'sys'); return null; }
      const c = this.inst(id, p.i); c.token = true;
      return await this.enterField(p, c, Object.assign({ from: 'summon' }, opts));
    }
    // ---------- hero level up (LoR champions): progress counts while the hero is on the field ----------
    levelNeed(u) { const e = this.eff(u); return u.card.hero && u.card.levelUp && this.cards[u.card.levelUp] && e && e.lvl ? e.lvl.need : 0; }
    async addLevel(u, n) {
      const need = this.levelNeed(u); if (!n || !need || !this.alive(u)) return;
      u.lvl = Math.min(need, (u.lvl || 0) + n);
      await this.ui.event('lvl', { unit: u, need });
      await this.log(`${u.card.nameEn} เลเวลอัพ ${u.lvl}/${need}`, 'buff');
      if (u.lvl >= need) await this.levelUp(u);
    }
    async levelUp(u) {      // becomes its level-up form; keeps buffs, damage and keywords it was given
      const from = u.card, to = this.cards[from.levelUp]; if (!to) return;
      const granted = [...u.kws].filter(k => !(from.keywords || []).includes(k));
      u.id = to.id; u.card = to; u.lvl = 0;
      u.kws = new Set([...(to.keywords || []), ...granted]); if (u.kws.has('barrier')) u.barrier = true;
      await this.ui.event('levelup', { unit: u, from });
      await this.log(`⬆ ${from.nameEn} เลเวลอัพ!`, 'spell');
      const p = this.players[u.owner];
      p.leveled = p.leveled || {}; p.leveled[from.id] = to.id;          // the hero stays levelled for the rest of the game
      for (const x of [...p.hand, ...p.deck, ...p.board]) if (x !== u && x.id === from.id) {
        x.id = to.id; x.card = to;
        if (x.kws) { x.kws = new Set([...(to.keywords || []), ...[...x.kws].filter(k => !(from.keywords || []).includes(k))]); x.lvl = 0; }
        if (p.hand.includes(x) || p.board.includes(x)) await this.ui.event('relevel', { card: x });
      }
      await this.heroSpells(p);
      const e = this.eff(u); if (e && e.onLevelUp) await e.onLevelUp(this, p, u);
      await this.checkDeaths();
    }
    // LoR champion spells: while a hero is on your field, copies of it in hand become its hero spell (card field heroSpell)
    sameHero(a, b) { const A = a.card || a, B = b.card || b; return !!(A.hero && B.hero) && (A.id === B.id || A.levelUp === B.id || B.levelUp === A.id || this.nameIs(A, B.nameEn)); }
    async heroSpells(p) {
      for (const x of [...p.hand]) {
        const sp = x.card.hero && x.card.heroSpell && this.cards[x.card.heroSpell];
        if (!sp || !p.board.some(u => this.alive(u) && this.sameHero(u, x))) continue;
        const y = this.inst(sp.id, p.i); y.token = true; p.hand[p.hand.indexOf(x)] = y;
        await this.ui.event('transform', { player: p.i, from: x, to: y });
        await this.log(`${x.card.nameEn} บนมือกลายเป็น ${sp.nameEn} (มี Hero อยู่บนสนามแล้ว)`, 'spell');
      }
    }
    async enterField(p, c, opts) {
      p = this.me(p); opts = opts || {};
      Object.assign(c, { dmg: 0, tempP: 0, tempH: 0, zero: false, stunned: false, sealedBy: null, survivedAttack: false, buffFrom: {} });
      c.kws = new Set([...(c.card.keywords || []), ...(opts.kws || [])]);
      c.barrier = c.kws.has('barrier'); c.barrierTemp = false;
      p.board.push(c);
      await this.ui.event('enter', { player: p.i, unit: c, from: opts.from || 'hand' });
      if (c.card.hero) await this.heroSpells(p);
      if (c.card.hero && c.card.levelUp && !this.levelNeed(c) && (c.card.levelUpCondition || '').trim()) this.note(`${c.card.nameEn}: เงื่อนไขเลเวลอัพ "${c.card.levelUpCondition}" ยังไม่ได้เขียนโค้ด`);
      this.markUnsupported(c);
      const e = this.eff(c);
      if (!opts.noETB && e && e.onPlay) { await e.onPlay(this, p, c); await this.checkDeaths(); }
      for (const o of [...p.board]) {
        if (o === c || !this.alive(o)) continue; const oe = this.eff(o);
        if (oe && oe.onAllyEnter) await oe.onAllyEnter(this, p, o, c);
        if (oe && oe.lvl && oe.lvl.allyEnter && this.alive(o)) await this.addLevel(o, oe.lvl.allyEnter(this, p, o, c));   // level-up progress
      }
      return c;
    }

    // ---------- actions ----------
    // play a card from hand. Units resolve at once; burst spells resolve at once; slow/fast spells go on the stack.
    async play(p, x) {
      p = this.me(p);
      const why = this.whyNot(p, x); if (why) { await this.log(`เล่น ${x.card.nameEn} ไม่ได้: ${why}`, 'sys'); return false; }
      const e = this.eff(x);
      if (e && e.payExtra) { const ok = await e.payExtra(this, p, x); if (!ok) { await this.log(`เล่น ${x.card.nameEn} ไม่ได้: ค่าใช้เพิ่มเติมไม่ครบ`, 'sys'); return false; } }
      x.playedCost = this.costOf(p, x);
      this.pay(p, x); p.hand.splice(p.hand.indexOf(x), 1);
      if (!this.isSpell(x)) { await this.log(`${p.name} ลง ${x.card.nameEn}`, 'play', { player: p.i, cards: [x] }); await this.enterField(p, x, { from: 'hand' }); return true; }
      const sp = this.speedOf(x);
      await this.log(`${p.name} ใช้เวทย์${sp === 'burst' ? 'ฉับพลัน' : sp === 'fast' ? 'เร็ว' : 'ช้า'} ${x.card.nameEn}`, 'spell', { player: p.i, cards: [x] });
      if (sp === 'burst') { await this.ui.event('cast', { player: p.i, card: x, burst: true }); await this.resolveSpell(p, x); return true; }
      this.stack.push({ p, x });
      await this.ui.event('cast', { player: p.i, card: x });
      if (!this.inChain && !this.combat) await this.chainFrom(this.other(p));
      return true;
    }
    async resolveSpell(p, x) {
      await this.ui.event('resolve', { player: p.i, card: x });
      this.markUnsupported(x);
      const e = this.eff(x);
      if (e && e.onCast) await e.onCast(this, p, x);
      await this.checkDeaths();
      if (!x.token) p.grave.push(x);
      await this.ui.event('spelldone', { player: p.i, card: x });
    }
    // the other player may respond; it keeps alternating while someone adds a spell; then everything resolves last-in-first-out
    async chainFrom(who) {
      this.inChain = true; let guard = 0;
      while (!this.over && guard++ < 20) {
        const before = this.stack.length;
        if (this.over) return; this.window = who.i; await who.controller.respond(this, who, { kind: 'stack' }); this.window = null;
        if (this.stack.length === before) break;
        who = this.other(who);
      }
      while (this.stack.length && !this.over) { const s = this.stack.pop(); await this.resolveSpell(s.p, s.x); }
      this.inChain = false;
    }

    // attackers: units of the token holder; challenges: { attackerUid: enemyUnit } for challenger
    async attack(p, attackers, challenges) {
      p = this.me(p); const d = this.other(p);
      if (this.attackBlocked(p)) return false;
      attackers = attackers.filter(u => this.canAttack(u) && p.board.includes(u));
      if (!attackers.length) return false;
      p.attackUsed = true;
      const forced = {};
      for (const a of attackers) { const t = challenges && challenges[a.uid]; if (t && this.has(a, 'challenger') && this.alive(t) && !t.stunned) forced[a.uid] = t; }
      this.combat = { attacker: p.i, attackers, blocks: {}, forced };
      await this.log(`${p.name} โจมตีด้วย ${attackers.map(a => a.card.nameEn).join(', ')}`, 'atk', { player: p.i, cards: [...attackers] });
      await this.ui.event('attack-declare', { player: p.i, attackers, forced });
      for (const a of attackers) { const e = this.eff(a); if (e && e.onAttack) await e.onAttack(this, p, a); }
      const blocks = Object.assign({}, forced);
      const free = attackers.filter(a => !blocks[a.uid]);
      if (free.length && d.board.some(u => this.canBlock(u))) {
        const chosen = await d.controller.declareBlocks(this, d, free, Object.values(blocks)) || {};
        const used = new Set(Object.values(blocks).map(b => b.uid));
        for (const a of free) { const b = chosen[a.uid]; if (b && !used.has(b.uid) && d.board.includes(b) && this.canBlock(b, a)) { blocks[a.uid] = b; used.add(b.uid); } }
      }
      this.combat.blocks = blocks;
      await this.ui.event('blocks', { player: d.i, blocks, attackers });
      // combat window: attacker first, both may cast fast/burst; ends when both pass in a row
      let who = p, passes = 0, guard = 0;
      while (passes < 2 && !this.over && guard++ < 20) {
        const before = this.stack.length;
        if (this.over) return; this.window = who.i; await who.controller.respond(this, who, { kind: 'combat' }); this.window = null;
        if (this.stack.length > before) { await this.chainFrom(this.other(who)); passes = 0; } else passes++;
        who = this.other(who);
      }
      // strikes: a removed / stunned blocker still leaves its attacker blocked (LoR)
      for (const a of attackers) {
        if (this.over) break;
        if (!this.alive(a) || a.stunned) continue;
        const b = blocks[a.uid];
        if (b) { if (this.alive(b) && !b.stunned) await this.fight(a, b); }
        else {
          const n = this.power(a);
          await this.ui.event('strike', { unit: a, target: null, player: d.i });
          if (n > 0) { await this.log(`${a.card.nameEn} ตีผู้เล่น ${n}`, 'dmg'); await this.damagePlayer(d, n); }
          if (this.has(a, 'ephemeral')) await this.destroy(a, 'ร่างแยกตีแล้วหายไป');
        }
        await this.checkDeaths();
      }
      this.combat = null;
      await this.ui.event('combat-end', {});
      return true;
    }
    async fight(a, b) {
      const before = new Map([a, b].map(u => [u, u.dmg || 0]));   // for Regenerate
      const hit = async (x, y) => { if (!this.alive(x) || !this.alive(y)) return; await this.ui.event('strike', { unit: x, target: y }); await this.damage(y, this.power(x), x, true); };
      if (this.has(a, 'quickstrike')) { await hit(a, b); await this.checkDeaths(); await hit(b, a); }   // quick strike: only while attacking (LoR)
      else {
        const pa = this.power(a), pb = this.power(b);
        await this.ui.event('clash', { a, b });
        await this.damage(b, pa, a, true); await this.damage(a, pb, b, true);
      }
      for (const u of [a, b]) if (this.alive(u) && this.has(u, 'ephemeral')) await this.destroy(u, 'ร่างแยกตีแล้วหายไป');   // ephemeral dies when it strikes
      for (const u of [a, b]) if (this.alive(u) && this.hp(u) > 0) { const e = this.eff(u); if (e && e.onSurviveCombat) await e.onSurviveCombat(this, this.owner(u), u, u === b); }
      // Regenerate (ฟื้นฟู): survived the fight -> health back to what it was before it (spell damage stays)
      for (const u of [a, b]) if (this.alive(u) && this.hp(u) > 0 && this.has(u, 'regenerate') && (u.dmg || 0) > before.get(u)) {
        const n = u.dmg - before.get(u); u.dmg = before.get(u);
        await this.ui.event('heal', { unit: u, amount: n }); await this.log(`${u.card.nameEn} ฟื้นฟู +${n} พลังชีวิต`, 'buff');
      }
    }

    // ---------- damage, buffs, statuses ----------
    async damage(u, n, src, combat) {
      if (!this.alive(u) || n <= 0) return 0;
      if (u.barrier) { u.barrier = false; u.barrierTemp = false; await this.ui.event('barrier', { unit: u }); await this.log(`${u.card.nameEn} กันความเสียหายด้วยเกราะคาถา`, 'buff'); return 0; }
      if (this.has(u, 'tough')) n = Math.max(0, n - 1);
      if (n <= 0) return 0;
      u.dmg = (u.dmg || 0) + n;
      if (this.hp(u) <= 0 && src && src.uid && src !== u && src.kws) u.killedBy = src;   // a unit dealt the killing blow ("เมื่อสังหาร")
      await this.ui.event('damage', { unit: u, amount: n, combat: !!combat });
      if (this.hp(u) > 0) { const e = this.eff(u); if (e && e.onSurviveDamage) await e.onSurviveDamage(this, this.owner(u), u, n); }
      return n;
    }
    async damagePlayer(p, n) {
      p = this.me(p); if (n <= 0 || this.over) return;
      p.life -= n; await this.ui.event('player-damage', { player: p.i, amount: n });
      if (p.life <= 0) { this.over = true; this.winner = 1 - p.i; await this.log(`${p.name} พลังชีวิตหมด — ${this.other(p).name} ชนะ!`, 'sys'); }
    }
    // temporary (until the round ends) unless permanent (glossary G2)
    async buff(u, pw, hp, permanent, why) {
      if (!this.alive(u)) return;
      if (permanent) { u.bonusP += pw; u.bonusH += hp; } else { u.tempP += pw; u.tempH += hp; }
      await this.ui.event('buff', { unit: u, p: pw, h: hp, permanent: !!permanent });
      await this.log(`${u.card.nameEn} ${pw >= 0 ? '+' : ''}${pw}|${hp >= 0 ? '+' : ''}${hp} ${permanent ? 'ถาวร' : '(ถึงจบรอบ)'}${why ? ' — ' + why : ''}`, 'buff');
    }
    async heal(u, n) { if (!this.alive(u)) return; const h = Math.min(n, u.dmg || 0); u.dmg -= h; if (h) await this.ui.event('heal', { unit: u, amount: h }); }
    async stun(u) {
      if (!this.alive(u)) return; u.stunned = true;
      await this.ui.event('stun', { unit: u }); await this.log(`${u.card.nameEn} ติด Stun (ถึงจบรอบ — ออกจากการต่อสู้)`, 'status');
    }
    async zeroPower(u) { if (!this.alive(u)) return; u.zero = true; await this.ui.event('status', { unit: u, text: 'Power 0' }); await this.log(`${u.card.nameEn} พลังโจมตีเป็น 0 ถึงจบรอบ`, 'status'); }
    async grantKeyword(u, kw) { if (!this.alive(u)) return; u.kws.add(kw); if (kw === 'barrier') { u.barrier = true; u.barrierTemp = true; } await this.ui.event('status', { unit: u, text: kw }); }
    async bounce(u) {
      if (!this.alive(u)) return;
      const p = this.owner(u); p.board.splice(p.board.indexOf(u), 1);
      await this.log(`${u.card.nameEn} กลับขึ้นมือ`, 'status');
      const c = { uid: u.uid, id: u.id, card: u.card, owner: u.owner, bonusP: u.bonusP, bonusH: u.bonusH, token: u.token };
      if (p.hand.length >= this.R.handMax) { await this.ui.event('death', { unit: u }); return; }
      p.hand.push(c); await this.ui.event('bounce', { unit: u, card: c, player: p.i });
    }
    async destroy(u, why) {
      if (!this.alive(u)) return;
      u.dmg = this.maxHp(u) + 99; u.destroyed = why || 'ถูกทำลาย';
      await this.checkDeaths();
    }
    async checkDeaths() {
      let again = true;
      while (again && !this.over) {
        again = false;
        for (const p of this.players) for (const u of [...p.board]) {
          if (this.hp(u) > 0) continue;
          again = true;
          p.board.splice(p.board.indexOf(u), 1);
          for (const o of this.allUnits()) if (o.sealedBy === u.uid) o.sealedBy = null;
          await this.ui.event('death', { unit: u });
          await this.log(`${u.card.nameEn} ตาย${u.destroyed ? ' (' + u.destroyed + ')' : ''}`, 'death');
          if (!u.token) p.grave.push(u);
          p.diedThisRound = (p.diedThisRound || 0) + 1;   // e.g. Fist of Fury
          const e = this.eff(u); if (e && e.onDeath) await e.onDeath(this, p, u);
          const k = u.killedBy, ke = k && this.eff(k); if (ke && ke.onKill) await ke.onKill(this, this.players[k.owner], k, u);
          for (const o of this.allUnits()) {   // watchers (e.g. Shikamaru) + level-up progress that counts deaths
            const oe = this.alive(o) && this.eff(o); if (!oe) continue;
            if (oe.onAnyDeath) await oe.onAnyDeath(this, this.players[o.owner], o, u);
            if (oe.lvl && oe.lvl.anyDeath && this.alive(o)) await this.addLevel(o, oe.lvl.anyDeath(this, this.players[o.owner], o, u));
          }
        }
      }
    }
  }

  const LW = { Game, RULES, isSpellData, plain, cardSig };
  root.LW = Object.assign(root.LW || {}, LW);
  if (typeof module !== 'undefined' && module.exports) module.exports = LW;
})(typeof window !== 'undefined' ? window : globalThis);
