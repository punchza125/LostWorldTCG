// LostWorld TCG — simple AI controller + prototype deck builder.
(function (root) {
  'use strict';

  const val = (G, u) => G.power(u) * 1.2 + G.hp(u) + (u.card.cost || 0) * 0.5;   // rough unit value

  function AI(opts) {
    opts = opts || {};
    const wait = opts.wait || (async () => {});
    return {
      isAI: true,
      // choose a target: harm → best enemy, help → best ally, sacrifice → weakest ally
      async choose(G, p, options, ctx) {
        await wait(opts.thinkMs || 0);
        if (ctx.intent === 'mode') return options[0];
        const mine = o => o && o.owner === p.i;
        let list = options;
        if (ctx.intent === 'harm') { const e = options.filter(o => !mine(o)); if (e.length) list = e; else if (ctx.optional) return null; }
        if (ctx.intent === 'help') { const a = options.filter(mine); if (a.length) list = a; else if (ctx.optional) return null; }
        if (ctx.intent === 'sacrifice') return [...list].sort((a, b) => val(G, a) - val(G, b))[0];
        return [...list].sort((a, b) => val(G, b) - val(G, a))[0];
      },
      // opening hand: send back expensive cards (keep a curve that can act in the first rounds)
      async mulligan(G, p, hand) {
        await wait(opts.thinkMs || 0);
        return hand.filter(c => (c.card.cost || 0) >= 5 || (G.isSpell(c) && (c.card.cost || 0) >= 4));
      },
      // one action per call (LoR): play a unit, cast a spell, attack, or pass. Burst spells don't end the action.
      async takeAction(G, p) {
        await wait(opts.stepMs || 0);
        for (let k = 0; k < 3 && !G.over; k++) {   // free burst spells first
          const b = p.hand.find(c => G.isSpell(c) && G.speedOf(c) === 'burst' && !G.whyNot(p, c) && this.wantsSpell(G, p, c));
          if (!b) break; await G.play(p, b);
        }
        if (G.over) return 'acted';
        const playable = p.hand.filter(c => !G.whyNot(p, c)).sort((a, b) => G.costOf(p, b) - G.costOf(p, a));
        const unit = playable.find(c => !G.isSpell(c));
        const d = G.other(p);
        const ready = p.board.filter(u => G.canAttack(u) && G.power(u) > 0);
        const wantAttack = ready.length && !G.attackBlocked(p) && (ready.reduce((s, u) => s + G.power(u), 0) >= 2 || d.board.length === 0);
        // develop first while there is mana for units, then attack, then spells
        if (unit && (!wantAttack || p.mana >= 3)) { await G.play(p, unit); return 'acted'; }
        if (wantAttack) {
          const threat = d.board.reduce((s, u) => s + G.power(u), 0);
          let atk = ready;
          if (p.life <= threat + 3) atk = ready.filter(u => G.hp(u) <= 2 || ready.length > d.board.length + 1);
          if (!atk.length && d.board.length === 0) atk = ready;
          if (atk.length) {
            const challenges = {};
            for (const a of atk.filter(u => G.has(u, 'challenger'))) {
              const t = d.board.filter(u => !u.stunned && G.hp(u) <= G.power(a)).sort((x, y) => val(G, y) - val(G, x))[0];
              if (t && !Object.values(challenges).includes(t)) challenges[a.uid] = t;
            }
            if (await G.attack(p, atk, challenges)) return 'acted';
          }
        }
        if (unit) { await G.play(p, unit); return 'acted'; }
        const spell = playable.find(c => G.isSpell(c) && G.speedOf(c) !== 'burst' && this.wantsSpell(G, p, c));
        if (spell) { await G.play(p, spell); return 'acted'; }
        return 'pass';
      },
      wantsSpell(G, p, c) {
        const id = c.card.id, d = G.other(p);
        if (['nr-008', 'nr-020', 'nr-050', 'nr-035', 'nr-034', 'nr-041', 'nr-047', 'nr-060', 'nr-037', 'nr-011', 'nr-038'].includes(id)) return d.board.length > 0;
        if (id === 'nr-012') return d.board.length >= 2;
        if (id === 'nr-040') return G.allUnits().some(u => u.stunned && u.owner !== p.i);
        if (['nr-031', 'nr-033', 'nr-017', 'nr-013'].includes(id)) return p.board.length > 0;
        if (id === 'nr-015') return p.board.some(u => G.hasTag(u, 'Team 7'));
        if (id === 'nr-058') return p.board.length >= 4;
        return true;
      },
      async declareBlocks(G, p, attackers) {
        await wait(opts.thinkMs || 0);
        const blocks = {}, used = new Set();
        const incoming = attackers.reduce((s, a) => s + G.power(a), 0);
        const lethal = incoming >= p.life;
        for (const a of [...attackers].sort((x, y) => G.power(y) - G.power(x))) {
          const cands = p.board.filter(b => !used.has(b.uid) && G.canBlock(b, a));
          // good block: survives, or kills an attacker worth more than itself
          let b = cands.find(b => G.hp(b) > G.power(a)) || cands.find(b => G.power(b) >= G.hp(a) && val(G, a) >= val(G, b));
          if (!b && lethal) b = cands.sort((x, y) => val(G, x) - val(G, y))[0];
          if (b) { blocks[a.uid] = b; used.add(b.uid); }
        }
        return blocks;
      },
      async respond(G, p, ctx) {
        await wait(opts.thinkMs || 0);
        // burst/fast tricks in combat: save a blocker that would die, or zero the strongest attacker
        if (!G.combat) return;
        const tricks = p.hand.filter(c => !G.whyNot(p, c) && ['nr-011', 'nr-037', 'nr-031'].includes(c.card.id));
        if (!tricks.length) return;
        const myBlockers = Object.entries(G.combat.blocks).filter(([, b]) => b.owner === p.i);
        for (const [auid, b] of myBlockers) {
          const a = G.combat.attackers.find(x => x.uid == auid);
          if (a && G.power(a) >= G.hp(b) && G.power(a) > 0) { await G.play(p, tricks[0]); return; }
        }
      },
    };
  }

  // ---- prototype decks (40 cards): themed by tags, filled from the rest; up to 3 copies of any card ----
  function buildDeck(cards, theme, seed) {
    const isSpell = root.LW.isSpellData;
    const usable = cards.filter(c => !c.extra);
    const max = () => 3;                  // every card up to 3 copies (decided rule)
    const score = c => {
      let s = 0; const tags = c.tags || [];
      if (theme.tags.some(t => tags.includes(t))) s += 10;
      if (theme.elements.includes(c.element)) s += 3;
      if (theme.ids && theme.ids.includes(c.id)) s += 12;
      if ((theme.avoidTags || []).some(t => tags.includes(t))) s -= 20;
      return s;
    };
    const ranked = usable.map(c => ({ c, s: score(c) })).sort((a, b) => b.s - a.s || a.c.cost - b.c.cost);
    const deck = [];
    for (const { c, s } of ranked) { if (s < 3) continue; for (let k = 0; k < Math.min(max(c), 2) && deck.length < 40; k++) deck.push(c.id); }
    // fill with neutral cards (characters first) up to 40
    for (const { c } of ranked) {
      while (deck.length < 40 && deck.filter(id => id === c.id).length < max(c) && !isSpell(c)) deck.push(c.id);
    }
    for (const { c } of ranked) while (deck.length < 40 && deck.filter(id => id === c.id).length < max(c)) deck.push(c.id);
    return deck.slice(0, 40);
  }
  const THEMES = {
    konoha: { name: 'โคโนฮะ / Team 7', tags: ['Team 7', 'Konoha', 'Team 10', 'Ino-Shika-Cho', 'Jonin', 'Ninken'], elements: ['wind', 'light', 'fire'], avoidTags: ['Gato Gang'],
      ids: ['nr-008', 'nr-015', 'nr-017', 'nr-020', 'nr-031', 'nr-033', 'nr-035', 'nr-048', 'nr-011', 'nr-010'] },
    gato: { name: 'แก๊งกาโต้ / หมอก', tags: ['Gato Gang', 'Mizukuni', 'Akatsuki'], elements: ['water', 'ice', 'dark'], avoidTags: ['Team 7'],
      ids: ['nr-034', 'nr-040', 'nr-041', 'nr-050', 'nr-058', 'nr-060', 'nr-012', 'nr-037', 'nr-013'] },
  };

  root.LW = Object.assign(root.LW || {}, { AI, buildDeck, THEMES });
  if (typeof module !== 'undefined' && module.exports) module.exports = { AI, buildDeck, THEMES };
})(typeof window !== 'undefined' ? window : globalThis);
