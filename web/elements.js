// Single source of truth for elements: Thai name, accent color, icon file (paths relative to web/).
// To add an element: drop an svg in assets/elements/ and add a line here.
const ELEMENTS = {
  fire:      { th: 'ไฟ',    color: '#e07a3a', icon: '../assets/elements/fire.svg' },
  water:     { th: 'น้ำ',   color: '#4aa3df', icon: '../assets/elements/water.svg' },
  earth:     { th: 'ดิน',   color: '#b08a4a', icon: '../assets/elements/earth.svg' },
  wind:      { th: 'ลม',    color: '#6fcf97', icon: '../assets/elements/wind.svg' },
  ice:       { th: 'น้ำแข็ง', color: '#8fd3f4', icon: '../assets/elements/ice.svg' },
  lightning: { th: 'สายฟ้า', color: '#f2c230', icon: '../assets/elements/lightning.svg' },
  light:     { th: 'แสง',   color: '#f6e7a1', icon: '../assets/elements/light.svg' },
  dark:      { th: 'มืด',   color: '#9b6bd6', icon: '../assets/elements/dark.svg' },
};

// Spells have no power/health. Uses card.kind ("spell" | "character") when present, otherwise guesses from the free-text type.
const isSpell = c => c.kind ? c.kind === 'spell' : /spell|คาถา/i.test(c.type || '');

// Heroes are the "main character" cards: gold frame, HERO ribbon. Only characters can be heroes. Set card.hero = true in cards.json.
const isHero = c => !!c.hero && !isSpell(c);

// Level up: a hero card may point at its evolved form with card.levelUp = "<id>". Evolved forms live in the extra deck (card.extra = true):
// they are never drawn from the main deck and only enter play when the hero levels up.
const isExtra = c => !!c.extra;
const isLevelForm = c => isHero(c) && isExtra(c);   // a hero's level-up form: shown as full art only
const fullArtOf = c => c.art && (c.art.fullart || c.art.normal);
// the art shown in the game, deck builder and big card: the normal version (full art is for pack openings); level-up forms only have full art
const cardArt = c => isLevelForm(c) ? fullArtOf(c) : c.art && (c.art.normal || c.art.fullart);
// which part of the art stays visible when it is cropped to the card: card field artFocus = [x, y], 0..1 like CSS background-position
const artFocus = c => Array.isArray(c.artFocus) && c.artFocus.length === 2 ? c.artFocus : [.5, .5];
const focusPos = c => artFocus(c).map(v => (v * 100).toFixed(1) + '%').join(' ');
// cost filter: 0 … 6 and 7+ (the last one means "7 or more")
const COST_STEPS = [0, 1, 2, 3, 4, 5, 6, 7];
const costChipsHtml = () => COST_STEPS.map(n => `<button class="cost-chip" data-cost="${n}" type="button" title="ค่าร่าย ${n === 7 ? '7 ขึ้นไป' : n}">${n === 7 ? '7+' : n}</button>`).join('');
const costMatch = (c, set) => !set.size || set.has(Math.min(7, c.cost || 0));
const COST_CHIP_CSS = `.costs { display: inline-flex; gap: 4px; align-items: center; } .costs .lbl { font-size: 12px; color: #b8ab8c; margin-right: 2px; }
  .cost-chip { width: 30px; height: 30px; padding: 0; border-radius: 50%; border: 2px solid #3a3346; cursor: pointer; font: 800 14px 'Cinzel', serif; color: #cfe0ff;
    background: radial-gradient(circle at 35% 30%, #2c4a86, #101a33 70%); transition: transform .1s, box-shadow .15s; }
  .cost-chip:hover { transform: translateY(-1px); } .cost-chip.on { color: #fff; border-color: #9fd0ff; background: radial-gradient(circle at 35% 30%, #5aa0ff, #1b4fd8 70%); box-shadow: 0 0 10px #5ab0ff99; }`;
// phones: no text-selection handles / magnifier / "Copy" menu / image-save sheet when you press and hold a card (forms stay editable)
const NO_SELECT_CSS = `html, body, body * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  input, textarea, select, [contenteditable], [contenteditable] * { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }
  img { -webkit-user-drag: none; }`;
(function () {
  if (typeof document === 'undefined') return;
  const st = document.createElement('style'); st.textContent = COST_CHIP_CSS + NO_SELECT_CSS; document.head.appendChild(st);
  const editable = t => t && t.closest && t.closest('input, textarea, select, [contenteditable]');
  document.addEventListener('contextmenu', e => { if (!editable(e.target)) e.preventDefault(); });          // long-press menu
  document.addEventListener('selectstart', e => { if (!editable(e.target)) e.preventDefault(); });          // text selection
})();
const ribbonText = c => isHero(c) ? (isExtra(c) ? '★ LEVEL UP ★' : '★ HERO ★') : (isExtra(c) ? 'EXTRA' : '');

// Combat keywords (characters) and spell speeds. card.keywords = ["fearsome", ...]; spells: card.speed = "burst" | "fast" | "slow".
const KEYWORDS = {
  fearsome:    { th: 'น่าสะพรึง', en: 'Fearsome',    color: '#b06bd6', desc: 'บล็อกได้เฉพาะศัตรูที่มีพลังโจมตี 3 ขึ้นไป' },
  challenger:  { th: 'ท้าดวล',    en: 'Challenger',  color: '#e07a3a', desc: 'ตอนโจมตี เลือกได้ว่าศัตรูตัวไหนต้องบล็อก' },
  quickstrike: { th: 'ตีก่อน',    en: 'Quick Strike', color: '#f2c230', desc: 'ตีก่อนคู่ต่อสู้ ถ้าคู่ต่อสู้ตายก่อนจะไม่ถูกตีกลับ' },
  tough:       { th: 'เกราะหนา',  en: 'Tough',       color: '#b08a4a', desc: 'รับความเสียหายลดลง 1' },
  barrier:     { th: 'เกราะคาถา', en: 'Barrier',     color: '#8fd3f4', desc: 'ไม่รับความเสียหายครั้งถัดไป 1 ครั้ง' },
  ephemeral:   { th: 'ร่างแยก',   en: 'Ephemeral',   color: '#9aa3b8', desc: 'ตายเมื่อจบเทิร์น' },
  regenerate:  { th: 'ฟื้นฟู',     en: 'Regenerate',  color: '#5fd38a', desc: 'ถ้ารอดจากการโจมตีหรือบล็อก พลังชีวิตกลับเป็นเท่าก่อนการต่อสู้ (ไม่ฟื้นดาเมจจาก spell)' },
};
const SPEEDS = {
  burst: { th: 'ฉับพลัน', en: 'BURST', color: '#f5dc96', desc: 'ใช้ได้ทุกเมื่อที่ถึงตาคุณ รวมระหว่างต่อสู้ มีผลทันที อีกฝ่ายตอบโต้ไม่ได้' },
  fast:  { th: 'เร็ว',    en: 'FAST',  color: '#ff9b5a', desc: 'ใช้ได้ทุกเมื่อ รวมระหว่างต่อสู้และตอบโต้ spell อื่น อีกฝ่ายตอบโต้ได้' },
  slow:  { th: 'ช้า',     en: 'SLOW',  color: '#7fb2ff', desc: 'ใช้ได้ในเทิร์นตัวเอง นอกการต่อสู้เท่านั้น อีกฝ่ายตอบโต้ได้' },
};
const cardKeywords = c => (c.keywords || []).filter(k => KEYWORDS[k]);
const cardSpeed = c => (isSpell(c) && SPEEDS[c.speed]) ? c.speed : '';

// Icons for keywords / spell speeds (original line art, 24x24, drawn in currentColor).
// In-game (compact) views show only the icon; the detail view shows icon + name.
const KW_ICONS = {
  // circular arrow around a healing cross
  regenerate: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M18 2.8v4.4h-4.4" fill="none"/><path d="M12 8.5v7M8.5 12h7" stroke-width="2.4"/>',
  // glaring demon eye
  fearsome: '<path d="M2 12c3-5 6.5-7 10-7s7 2 10 7c-3 5-6.5 7-10 7S5 17 2 12z"/><path d="M12 7.5c1.4 1.6 1.4 7.4 0 9-1.4-1.6-1.4-7.4 0-9z" fill="currentColor"/><path d="M3.5 5.5l5 2.2M20.5 5.5l-5 2.2"/>',
  // two crossed kunai
  challenger: '<path d="M5 19L15.5 8.5M19 19L8.5 8.5"/><path d="M15.5 8.5L20 4l-1 5.2zM8.5 8.5L4 4l1 5.2z" fill="currentColor"/><circle cx="4" cy="20" r="1.6"/><circle cx="20" cy="20" r="1.6"/>',
  // kunai with speed lines
  quickstrike: '<path d="M6 18l8.5-8.5"/><path d="M14.5 9.5L21 3l-1.5 6.8z" fill="currentColor"/><circle cx="5" cy="19" r="1.6"/><path d="M2.5 11h5M4 7.5h5M2 14.5h3.5"/>',
  // riveted shield
  tough: '<path d="M12 2.5l8 3v6.2c0 5-3.4 8.3-8 9.8-4.6-1.5-8-4.8-8-9.8V5.5z"/><path d="M4.4 11h15.2M12 2.5v19"/><circle cx="8" cy="7.5" r=".9" fill="currentColor"/><circle cx="16" cy="7.5" r=".9" fill="currentColor"/><circle cx="8" cy="15" r=".9" fill="currentColor"/><circle cx="16" cy="15" r=".9" fill="currentColor"/>',
  // hexagonal chakra seal
  barrier: '<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/><circle cx="12" cy="12" r="4.2"/><path d="M12 7.8v8.4M7.8 12h8.4" opacity=".7"/>',
  // shadow-clone smoke puff
  ephemeral: '<path d="M6.5 17.5a3.8 3.8 0 0 1 .4-7.6 5 5 0 0 1 9.6-.9 3.8 3.8 0 0 1 .9 7.5"/><path d="M5 21h2.5M10.8 21h2.5M16.5 21h2.5" stroke-dasharray="0"/><path d="M9.5 13.5h5" opacity=".7"/>',
  // spell speeds
  burst: '<path d="M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z" fill="currentColor"/>',
  fast: '<path d="M4 5.5l6.5 6.5L4 18.5M12 5.5l6.5 6.5-6.5 6.5"/>',
  slow: '<path d="M6.5 3h11M6.5 21h11"/><path d="M8 3c0 4.5 8 4.8 8 9s-8 4.5-8 9M16 3c0 4.5-8 4.8-8 9s8 4.5 8 9"/><path d="M10 18.5h4" stroke-width="2.6"/>',
};
const kwIcon = (key, size) => KW_ICONS[key]
  ? `<svg viewBox="0 0 24 24" width="${size || 24}" height="${size || 24}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KW_ICONS[key]}</svg>` : '';
