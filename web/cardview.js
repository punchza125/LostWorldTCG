// LostWorld TCG — shared big card view (normal card layout) + LoR-style links between a hero, its level-up form and its hero spell.
// Needs elements.js (ELEMENTS, KEYWORDS, SPEEDS, kwIcon, isSpell, isHero). Used by play.html and deck.html.
(function () {
  const css = `  /* big DOM card = the normal card layout (full art is kept for pack openings later) */
  .bc { position: relative; width: var(--cw, min(300px, 30vw)); aspect-ratio: 630 / 880; border-radius: 14px; background: #16131c; container-type: inline-size;
    box-shadow: 0 18px 50px #000d, 0 0 30px color-mix(in srgb, var(--c) 40%, transparent); animation: bcIn .18s ease-out; }
  @keyframes bcIn { from { opacity: 0; transform: scale(.92) translateY(10px); } }
  .bc.hero { background: linear-gradient(145deg, #fff3c4 0%, #c8962e 28%, #f5dc96 50%, #8a6420 78%, #e8c56a 100%); box-shadow: 0 18px 50px #000d, 0 0 36px #e8c56a88; }
  .nc { position: absolute; inset: 2.6cqw; border: .6cqw solid var(--c); border-radius: 2.4cqw; padding: 2cqw; background: #1d1925; display: flex; flex-direction: column; gap: 1.6cqw; }
  .bc.sp .nc { border: 1.2cqw double var(--c); background: radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--c) 24%, #1d1925), #17131f 72%); }
  .bc.hero .nc { border-color: #e8c56a; }
  .nc-row { display: flex; align-items: center; gap: 2.4cqw; flex: none; }
  .nc-cost { width: 10.5cqw; height: 10.5cqw; margin: 1cqw; flex: none; transform: rotate(45deg); background: #0f0d14; border: .6cqw solid var(--c); border-radius: 1.4cqw; display: flex; align-items: center; justify-content: center; }
  .nc-cost span { transform: rotate(-45deg); font: 800 7.4cqw 'Cinzel', serif; color: #fff4dc; }
  .nc-cost.cheap span { color: #9affb0; }
  .bc.sp .nc-cost { transform: none; border-radius: 50%; background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 60%, #fff), color-mix(in srgb, var(--c) 65%, #000)); } .bc.sp .nc-cost span { transform: none; }
  .bc.hero .nc-cost { background: linear-gradient(135deg, #f5dc96, #b8862e); border-color: #fff3c4; } .bc.hero .nc-cost span { color: #2a1d05; }
  .nc-names { flex: 1; min-width: 0; } .nc-th { font-size: 6cqw; font-weight: 800; line-height: 1.15; color: #f5ecd2; } .nc-en { font: 600 2.6cqw 'Cinzel', serif; letter-spacing: .5cqw; color: #b8ab8c; }
  .nc-el { width: 11cqw; height: 11cqw; flex: none; filter: drop-shadow(0 .5cqw .6cqw #000a); }
  .nc-art { position: relative; flex: 1; min-height: 36cqw; border-radius: 1.6cqw; border: .4cqw solid #4a4256; background: #0f0d14 center / cover; }
  .bc.sp .nc-art { border-radius: 24cqw 24cqw 1.6cqw 1.6cqw / 14cqw 14cqw 1.6cqw 1.6cqw; border-color: var(--c); }
  .nc-rar { position: absolute; left: 1.8cqw; top: 1.8cqw; padding: .4cqw 1.8cqw; border-radius: 99px; background: #0b0a0fcc; border: 1px solid var(--c); font: 600 2.2cqw 'Cinzel', serif; letter-spacing: .3cqw; color: #f5dc96; }
  .bc.sp .nc-rar { left: 50%; top: auto; bottom: 1.6cqw; transform: translateX(-50%); }
  .nc-st { position: absolute; right: 1.6cqw; top: 1.6cqw; display: flex; flex-direction: column; align-items: flex-end; gap: 1cqw; }
  .nc-st span { font-size: 3cqw; font-weight: 700; padding: .3cqw 2cqw; border-radius: 99px; color: #fff; background: var(--b); }
  .nc-hero { position: absolute; left: 50%; top: -.4cqw; transform: translateX(-50%); padding: .3cqw 4cqw; border-radius: 0 0 2cqw 2cqw; font: 800 2.6cqw 'Cinzel', serif; letter-spacing: .8cqw; color: #2a1d05; background: linear-gradient(#fff3c4, #c8962e); }
  .nc-kws { display: flex; gap: 1.2cqw; flex-wrap: wrap; flex: none; }
  .bc-kw { display: inline-flex; align-items: center; gap: 1cqw; padding: .3cqw 2.4cqw .3cqw .6cqw; border-radius: 99px; font-weight: 700; font-size: 3.2cqw; color: #fff; background: color-mix(in srgb, var(--k) 55%, #0b0a10); border: .4cqw solid var(--k); }
  .bc-kw i { width: 5cqw; height: 5cqw; border-radius: 50%; background: var(--k); display: flex; align-items: center; justify-content: center; } .bc-kw svg { width: 3.6cqw; height: 3.6cqw; }
  .nc-type { display: flex; justify-content: space-between; align-items: center; padding: 1cqw 2.2cqw; border-radius: 1.2cqw; background: #2a2433; border: 1px solid #4a4256; font-size: 3cqw; font-weight: 600; color: #e9dfc3; flex: none; }
  .nc-type em { font: normal 2.3cqw 'Cinzel', serif; letter-spacing: .3cqw; color: #b8ab8c; }
  .bc.sp .nc-type { background: linear-gradient(90deg, color-mix(in srgb, var(--c) 50%, #000), color-mix(in srgb, var(--c) 16%, #14111a)); border-color: var(--c); color: #fff; }
  .nc-ab { flex: none; min-height: 14cqw; max-height: 46cqw; overflow: hidden; padding: 2cqw 2.6cqw; border-radius: 1.6cqw; background: #efe6cf; color: #2a2230; font-size: 3.5cqw; line-height: 1.5; display: flex; flex-direction: column; gap: 1cqw; }
  .nc-ab[hidden] { display: none; }
  .bc.sp .nc-ab { background: linear-gradient(#eaecf8, #d3d8ee); }
  .nc-ab b { color: #1d1925; } .nc-fl { margin-top: auto; font-size: 2.8cqw; font-style: italic; color: #5e5266; }
  .nc-stats { display: flex; justify-content: space-between; align-items: center; flex: none; }
  .bc-p, .bc-h { width: 11cqw; height: 11cqw; border: .6cqw solid #e8c56a; display: flex; align-items: center; justify-content: center; font: 800 6.6cqw 'Cinzel', serif; color: #fff4dc; text-shadow: 0 .4cqw 0 #000; }
  .bc-p { border-radius: 50%; background: radial-gradient(circle at 35% 30%, #f08050, #8a2512 70%); } .bc-h { border-radius: 2cqw; background: radial-gradient(circle at 35% 30%, #4fc07e, #164a33 70%); }
  .bc-p.up, .bc-h.up { color: #b8ffb0; } .bc-p.down, .bc-h.down { color: #ffb0a0; }
  .nc-lbl { font: 600 2.2cqw 'Cinzel', serif; letter-spacing: .3cqw; color: #b8ab8c; text-align: center; line-height: 1.2; } .nc-lbl small { display: block; font: 400 2cqw 'Noto Serif Thai', serif; letter-spacing: 0; }
  .bc-spell { flex: none; height: 9cqw; display: flex; align-items: center; justify-content: center; font: 800 3.6cqw 'Cinzel', serif; letter-spacing: 1.2cqw; color: #fff; border-top: .4cqw solid var(--c); border-bottom: .4cqw solid var(--c); }
  .bc .swirl { position: absolute; inset: 0; z-index: 3; }

  /* level-up form of a hero: full art behind the whole card, text on dark glass */
  .bc.fa .nc { background: #0f0d14 center / cover; }
  .bc.fa .nc::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(#0b0a10d0 0%, #0b0a1000 22%, #0b0a1000 42%, #0b0a10d8 66%, #0b0a10f0 100%); pointer-events: none; }
  .bc.fa .nc > * { position: relative; z-index: 1; }
  .bc.fa .nc-art { background: none; border-color: transparent; }
  .bc.fa .nc-type { background: #0b0a10a8; } .bc.fa .nc-ab { background: #0b0a10b8; color: #f1ead8; } .bc.fa .nc-ab b { color: #f5dc96; } .bc.fa .nc-fl { color: #cfc4a8; }
  /* light glare (and rainbow foil on EPIC / LEGEND / hero) that follows --gx/--gy (mouse or phone tilt, set by the page) */
  /* the big card tilts with the phone (gyroscope) / follows the mouse / can be dragged with a finger; the light follows the tilt.
     --gx / --gy = tilt (-1..1), --ga = how much it is tilted (0 at rest -> no glare) */
  .cvfan > .bc { pointer-events: auto; touch-action: none; transform: perspective(900px) rotateY(calc(var(--gx, 0) * 16deg)) rotateX(calc(var(--gy, 0) * -16deg)); transition: transform .08s linear; }
  .bc::after { content: ''; position: absolute; inset: 0; z-index: 4; border-radius: inherit; pointer-events: none; mix-blend-mode: soft-light;
    opacity: calc(.15 + var(--ga, 0) * .85);
    background: radial-gradient(ellipse 70% 55% at calc(50% + var(--gx, 0) * 60%) calc(45% + var(--gy, 0) * 60%), #ffffffee, #ffffff40 35%, transparent 70%); }
  .bc .holo { position: absolute; inset: 0; z-index: 5; border-radius: inherit; pointer-events: none; display: none; mix-blend-mode: color-dodge;
    opacity: calc(var(--ga, 0) * .55);
    background: repeating-linear-gradient(115deg, #ff5f9e33 0%, #ffd65f33 6%, #5fffa033 12%, #5fc8ff33 18%, #b15fff33 24%, #ff5f9e33 30%);
    background-size: 300% 300%; background-position: calc(50% + var(--gx, 0) * 60%) calc(50% + var(--gy, 0) * 60%);
    -webkit-mask: radial-gradient(ellipse 80% 70% at calc(50% + var(--gx, 0) * 50%) calc(45% + var(--gy, 0) * 50%), #000 20%, transparent 75%);
            mask: radial-gradient(ellipse 80% 70% at calc(50% + var(--gx, 0) * 50%) calc(45% + var(--gy, 0) * 50%), #000 20%, transparent 75%); }
  .bc.foil .holo { display: block; }
  .bc.hero::before { content: ''; position: absolute; inset: 0; z-index: 5; border-radius: inherit; pointer-events: none; mix-blend-mode: overlay;
    background: linear-gradient(115deg, transparent 40%, #fff9 48%, #ffe9a0aa 52%, transparent 60%); background-size: 260% 100%; background-position: calc(50% - var(--gx, 0) * 80%) 0; }
  /* spells = ninja scroll: cut corners + wooden rollers (cards are flat rectangles) */
  .bc.sp { background: none; box-shadow: none; filter: drop-shadow(0 16px 30px #000c) drop-shadow(0 0 18px color-mix(in srgb, var(--c) 35%, transparent)); }
  .bc.sp .nc { inset: 4.6cqw 2.6cqw; border-radius: 0; clip-path: polygon(7cqw 0, calc(100% - 7cqw) 0, 100% 7cqw, 100% calc(100% - 7cqw), calc(100% - 7cqw) 100%, 7cqw 100%, 0 calc(100% - 7cqw), 0 7cqw); }
  .bc .rod { display: none; }
  .bc.sp .rod { display: block; position: absolute; z-index: 6; left: 0; right: 0; height: 5.4cqw; border-radius: 2.7cqw; background: linear-gradient(#5a3a1c, #c9934f 30%, #f0c98a 45%, #a8733a 70%, #4a2e14); box-shadow: 0 1cqw 2cqw #000a; pointer-events: none; }
  .bc.sp .rod.top { top: 1.6cqw; } .bc.sp .rod.bot { bottom: 1.6cqw; }
  .bc.sp .nc-ab { background: #2a1d0cc8 !important; color: #f6e7c8; border: .3cqw solid #b8925a; } .bc.sp .nc-ab b { color: #ffd98a; }
  .nc-lv { margin-top: auto; padding: .8cqw 2cqw; border-radius: 1.2cqw; background: #2a2230; color: #f5dc96; font-size: 3cqw; line-height: 1.45; border: .3cqw solid #c8962e; }
  .nc-lv b { color: #e8c56a; }
  /* LoR-style fan: a hero with its level-up form and hero spell peeking out behind it */
  .gyroBtn { display: block; width: 100%; pointer-events: auto; padding: 9px 12px; text-align: left; border-radius: 12px; border: 1px solid #e8c56a88;
    background: #14111aee; color: #f5dc96; font: 600 12.5px 'Noto Serif Thai', serif; line-height: 1.35; cursor: pointer; }
  .gyroBtn[hidden] { display: none; }
  .cvfan { position: relative; display: flex; align-items: flex-start; padding-right: calc(var(--cw, min(300px, 30vw)) * .12); }   /* room for the tilted cards so nothing beside the fan is covered */
  .cvfan > .bc { z-index: 5; flex: none; }
  .cvrel { position: relative; flex: none; width: calc(var(--cw, min(300px, 30vw)) * var(--rs, .8)); margin-left: calc(var(--cw, min(300px, 30vw)) * var(--rs, .8) * -.55); margin-top: calc(var(--cw, min(300px, 30vw)) * (.1 + var(--i) * .1));
    z-index: calc(4 - var(--i)); transform: rotate(calc(3deg + var(--i) * 2deg)); transform-origin: 0 100%; filter: brightness(.9); transition: transform .2s, filter .2s; }
  .cvrel .bc { --cw: 100%; width: 100%; animation: none; box-shadow: 0 10px 30px #000c; }
  .cvrel:hover { z-index: 9; transform: rotate(0) translateY(-4%); filter: none; }
  .cvtag { position: absolute; z-index: 6; right: 4%; top: -1.5em; white-space: nowrap; padding: 2px 12px; border-radius: 99px; font: 700 12px 'Noto Serif Thai', serif; color: #2a1d05; background: linear-gradient(#fff3c4, #c8962e); box-shadow: 0 3px 8px #000a; }
  .cvtag.sp { color: #fff; background: linear-gradient(#c49aff, #6a3aa8); } .cvtag.base { color: #fff; background: linear-gradient(#7d8aa0, #3a4456); }
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // o: { cost, kws: [[key, def]], st: [[text, color]], pw, hp, pwCls, hpCls }
  function html(c, o = {}) {
    const spell = isSpell(c), el = ELEMENTS[c.element] || ELEMENTS.fire, hero = isHero(c);
    const fa = true, lvl = isLevelForm(c), art = cardArt(c), cost = o.cost ?? c.cost, st = o.st || [];   // normal art filling the card (full art is for pack openings)
    let kws = o.kws; if (!kws) { kws = (c.keywords || []).filter(k => KEYWORDS[k]).map(k => [k, KEYWORDS[k]]); if (spell && SPEEDS[c.speed]) kws.push([c.speed, SPEEDS[c.speed]]); }
    const pw = o.pw ?? (c.power || 0), hp = o.hp ?? (c.health || 0);
    const ab = (c.ability || []).filter(t => String(t).replace(/<[^>]+>/g, '').trim());
    const lv = hero && (c.levelUpCondition || '').trim();
    const hasText = ab.length || lv || (c.flavor && c.flavor !== '...');
    const foil = hero || /EPIC|LEGEND/i.test(c.rarity || '');
    return `<div class="bc${spell ? ' sp' : ''}${hero ? ' hero' : ''}${fa ? ' fa' : ''}${foil ? ' foil' : ''}" style="--c:${el.color}"><div class="nc"${fa ? ` style="background-image:url('../${esc(art)}');background-position:${focusPos(c)}"` : ''}>
      <div class="nc-row"><div class="nc-cost${cost < c.cost ? ' cheap' : ''}"><span>${cost}</span></div>
        <div class="nc-names"><div class="nc-th">${esc(c.nameTh)}</div><div class="nc-en">${esc(c.nameEn)}</div></div><img class="nc-el" src="${el.icon}" alt=""></div>
      <div class="nc-art"${fa ? '' : ` style="background-image:url('../${esc(art)}')"`}>${hero ? `<div class="nc-hero">${lvl ? '★ LEVEL UP' : '★ HERO'}</div>` : ''}<span class="nc-rar">${esc(c.rarity || '')}</span>
        <div class="nc-st">${st.map(([t, b]) => `<span style="--b:${b}">${t}</span>`).join('')}</div></div>
      ${kws.length ? `<div class="nc-kws">${kws.map(([k, x]) => `<span class="bc-kw" style="--k:${x.color}"><i>${kwIcon(k)}</i>${x.th}</span>`).join('')}</div>` : ''}
      <div class="nc-type"><span>${spell ? 'Spell' : 'Character'}</span><em>${esc(c.set || '')} · ${esc((c.id || '').split('-')[1] || '')}</em></div>
      <div class="nc-ab"${hasText ? '' : ' hidden'}>${ab.map(t => `<div>${String(t).replace(/\n/g, ' ')}</div>`).join('')}${c.flavor && c.flavor !== '...' ? `<div class="nc-fl">${esc(c.flavor)}</div>` : ''}${lv ? `<div class="nc-lv"><b>⬆ เลเวลอัพ:</b> ${esc(lv)}</div>` : ''}</div>
      ${spell ? '<div class="bc-spell">✦ SPELL ✦</div>' : `<div class="nc-stats"><div class="bc-p ${o.pwCls || ''}">${pw}</div><div class="nc-lbl">POWER · HEALTH<small>พลังโจมตี · พลังชีวิต</small></div><div class="bc-h ${o.hpCls || ''}">${hp}</div></div>`}
    </div><div class="holo"></div><div class="rod top"></div><div class="rod bot"></div><div class="swirl"></div></div>`;
  }

  // cards linked to c: the hero it levels up from, its level-up form, and the hero spell (LoR champion spell)
  function related(c, all) {
    const by = id => all.find(x => x.id === id), out = [], seen = new Set([c.id]);
    const add = (x, label, cls) => { if (x && !seen.has(x.id)) { seen.add(x.id); out.push({ card: x, label, cls }); } };
    const bases = all.filter(x => x.hero && (x.levelUp === c.id || x.heroSpell === c.id));
    if (c.levelUp) add(by(c.levelUp), '⬆ เลเวลอัพ', '');
    bases.forEach(b => add(b, b.levelUp === c.id ? '★ ร่างปกติ' : '★ Hero', 'base'));
    const owner = c.hero ? c : bases[0];
    if (owner) { add(by(owner.levelUp), '⬆ เลเวลอัพ', ''); add(by(owner.heroSpell || (bases.find(b => b.heroSpell) || {}).heroSpell), '✦ Spell ประจำ Hero', 'sp'); }
    return out.slice(0, 3);
  }
  function fan(c, all, o) {
    const rel = related(c, all || []);
    return `<div class="cvfan">${html(c, o)}${rel.map((r, i) => `<div class="cvrel" style="--i:${i}"><span class="cvtag ${r.cls}">${r.label}</span>${html(r.card)}</div>`).join('')}</div>`;
  }
  // ---------- tilt: gyroscope (phones, https only) > finger drag on the card > mouse over the card; back to flat when let go ----------
  const T = { x: 0, y: 0, tx: 0, ty: 0, gyro: false, hold: false };
  const root = document.documentElement.style;
  function onOrient(e) {
    if (e.gamma == null || e.beta == null || T.hold) return; if (!T.gyro) { T.gyro = true; updateBtn(); }
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let gx = e.gamma, gy = e.beta;
    if (ang === 90) { gx = e.beta; gy = -e.gamma; } else if (ang === -90 || ang === 270) { gx = -e.beta; gy = e.gamma; }
    if (!T.base) T.base = { gx, gy };
    T.base.gx += (gx - T.base.gx) * .02; T.base.gy += (gy - T.base.gy) * .02;     // slowly re-centre on how the phone is held
    T.tx = Math.max(-1, Math.min(1, (gx - T.base.gx) / 14)); T.ty = Math.max(-1, Math.min(1, (gy - T.base.gy) / 14));
  }
  // iOS: DeviceOrientationEvent.requestPermission() only works inside a real "tap" (touchend / click — NOT pointerdown) on an https page
  const touchDevice = matchMedia('(pointer: coarse)').matches;
  let gyroState = typeof DeviceOrientationEvent === 'undefined' ? 'none' : !window.isSecureContext ? 'insecure' : 'idle';   // idle | asking | on | denied
  function listen() { if (!listen.done) { listen.done = true; addEventListener('deviceorientation', onOrient); } }
  function enableGyro() {
    if (gyroState !== 'idle') return;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      gyroState = 'asking';
      DeviceOrientationEvent.requestPermission().then(r => { gyroState = r === 'granted' ? 'on' : 'denied'; if (r === 'granted') listen(); updateBtn(); })
        .catch(() => { gyroState = 'idle'; updateBtn(); });   // not inside a tap -> try again on the next one
    } else { gyroState = 'on'; listen(); }
  }
  addEventListener('touchend', enableGyro, true); addEventListener('click', enableGyro, true);
  function btnText() {
    if (gyroState === 'insecure') return `📱 เอียงการ์ดตามโทรศัพท์: เปิดผ่าน https://${location.hostname}:8443 ก่อน`;
    if (gyroState === 'denied') return '📱 ปิดสิทธิ์เซนเซอร์ไว้ — ตั้งค่า › Safari › การเคลื่อนไหว/การวางแนว แล้วเปิดหน้านี้ใหม่';
    if (gyroState === 'on' && !T.gyro) return '📱 เอียงโทรศัพท์ได้เลย…';
    return '📱 แตะเพื่อให้การ์ดเอียงตามโทรศัพท์';
  }
  function updateBtn() { document.querySelectorAll('.gyroBtn').forEach(b => { b.textContent = btnText(); b.hidden = T.gyro || gyroState === 'none' || !touchDevice; }); }
  addEventListener('click', e => { if (e.target.closest && e.target.closest('.gyroBtn')) { e.stopPropagation(); e.preventDefault(); enableGyro(); updateBtn(); } }, true);
  const cardAt = e => e.target && e.target.closest && e.target.closest('.cvfan > .bc');
  const aim = (el, e) => { const r = el.getBoundingClientRect(); T.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)); T.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)); };
  addEventListener('pointerdown', e => { const el = cardAt(e); if (el && e.pointerType !== 'mouse') { T.hold = el; aim(el, e); e.stopPropagation(); } }, true);
  addEventListener('pointermove', e => {
    if (T.hold) return aim(T.hold, e);
    if (e.pointerType === 'mouse' && !T.gyro) { const el = cardAt(e) || document.querySelector('.cvfan > .bc:hover'); if (el) aim(el, e); else { T.tx = 0; T.ty = 0; } }
  }, true);
  ['pointerup', 'pointercancel'].forEach(t => addEventListener(t, () => { if (T.hold) { T.hold = false; if (!T.gyro) { T.tx = 0; T.ty = 0; } } }, true));
  addEventListener('click', e => { if (cardAt(e)) e.stopPropagation(); }, true);   // touching the big card tilts it; tap outside to close
  (function step() {
    requestAnimationFrame(step);
    if (!document.querySelector('.cvfan > .bc')) return;
    T.x += (T.tx - T.x) * .14; T.y += (T.ty - T.y) * .14;
    if (Math.abs(T.x - (T.px || 0)) + Math.abs(T.y - (T.py || 0)) < .002) return; T.px = T.x; T.py = T.y;
    root.setProperty('--gx', T.x.toFixed(3)); root.setProperty('--gy', T.y.toFixed(3)); root.setProperty('--ga', Math.min(1, Math.hypot(T.x, T.y) * 1.3).toFixed(3));
  })();
  window.CardView = { html, related, fan, gyroButton: () => touchDevice && gyroState !== 'none' && !T.gyro ? `<button class="gyroBtn" type="button">${btnText()}</button>` : '' };
})();
