// ================================================================
//  WORD GUESS — PewPlay
//  @bg #121420
//  @accent #5ac46e
//  @files words.js
//  Indovina la parola di 5 lettere in 6 tentativi. Parola del giorno
//  (uguale per tutti) e modalità infinita. Statistiche e condivisione.
// ================================================================
(function () {
  'use strict';
  const { clamp, sfx, store } = PP;

  const GAME_ID = 'word-guess';
  const ANSWERS = window.WORD_LIST.answers;
  const VALID = new Set(window.WORD_LIST.valid.concat(ANSWERS));
  const MODES = ['Daily', 'Unlimited'];
  const COL = { g: '#5ac46e', y: '#e2b93b', x: '#3a3d4d', key: '#5b5f73', empty: '#1d2030', border: '#3a3d55' };
  const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '<ZXCVBNM>'];
  const EPOCH = Date.UTC(2026, 0, 1);

  let mode = 0;
  let answer, guesses, marks, current, done, won, shakeT, revealT, keyState, toast, toastT, dayNo, bounceT;
  let keys = [], dailySeen = false;

  const todayNo = () => Math.floor((Date.now() - EPOCH) / 86400000);
  const stats = () => store.get(`stats-${mode}`, { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] });

  function score(guess, ans) {
    const res = Array(5).fill('x'), left = {};
    for (let i = 0; i < 5; i++) { if (guess[i] === ans[i]) res[i] = 'g'; else left[ans[i]] = (left[ans[i]] || 0) + 1; }
    for (let i = 0; i < 5; i++) if (res[i] !== 'g' && left[guess[i]]) { res[i] = 'y'; left[guess[i]]--; }
    return res;
  }

  function start() {
    guesses = []; marks = []; current = ''; done = false; won = false; shakeT = 0; revealT = 0; keyState = {}; toast = ''; toastT = 0; bounceT = 0;
    // parola del giorno già finita e già vista: si passa alla modalità infinita
    const savedDaily = store.get('daily', null);
    if (mode === 0 && dailySeen && savedDaily && savedDaily.day === todayNo() && savedDaily.done) { mode = 1; store.set('mode', 1); }
    if (mode === 0) {
      dayNo = todayNo();
      answer = ANSWERS[((dayNo % ANSWERS.length) + ANSWERS.length) % ANSWERS.length];
      const saved = store.get('daily', null);
      if (saved && saved.day === dayNo) {
        for (const g of saved.guesses) { guesses.push(g); marks.push(score(g, answer)); updateKeys(g, marks[marks.length - 1]); }
        if (saved.done) { done = true; won = saved.won; dailySeen = true; showToast(won ? 'Solved! Come back tomorrow for a new word.' : `The word was ${answer.toUpperCase()}`, 99); }
      }
    } else answer = PP.pick(ANSWERS);
  }

  function updateKeys(g, m) {
    const rank = { g: 3, y: 2, x: 1 };
    for (let i = 0; i < 5; i++) { const k = g[i]; if (!keyState[k] || rank[m[i]] > rank[keyState[k]]) keyState[k] = m[i]; }
  }

  function showToast(t, d = 1.6) { toast = t; toastT = d; }

  function type(ch) {
    if (done || revealT > 0) return;
    if (ch === '<') { current = current.slice(0, -1); sfx.tone(300, 0.03, 'square', 0.04); return; }
    if (ch === '>') return submit();
    if (current.length < 5) { current += ch.toLowerCase(); sfx.tone(520 + current.length * 30, 0.03, 'square', 0.05); }
  }

  function submit() {
    if (current.length < 5) { shakeT = 0.4; showToast('Not enough letters'); sfx.tone(160, 0.1, 'square', 0.06); return; }
    if (!VALID.has(current)) { shakeT = 0.4; showToast('Not in word list'); sfx.tone(160, 0.1, 'square', 0.06); return; }
    const m = score(current, answer);
    guesses.push(current); marks.push(m);
    revealT = 1.6;
    m.forEach((c, i) => sfx.tone(c === 'g' ? 660 : c === 'y' ? 520 : 330, 0.08, 'triangle', 0.09, null, i * 0.3 + 0.15));
    const g = current;
    current = '';
    setTimeout(() => updateKeys(g, m), 1500);
    if (g === answer) { done = true; won = true; }
    else if (guesses.length === 6) { done = true; won = false; }
    if (mode === 0) store.set('daily', { day: dayNo, guesses, done, won });
    if (done) { record(); if (mode === 0) dailySeen = true; setTimeout(finish, 1750); }
  }

  function record() {
    const st = stats();
    st.played++;
    if (won) { st.wins++; st.streak++; st.maxStreak = Math.max(st.maxStreak, st.streak); st.dist[guesses.length - 1]++; }
    else st.streak = 0;
    store.set(`stats-${mode}`, st);
  }

  function finish() {
    if (PP.state === 'paused') { setTimeout(finish, 500); return; }
    if (PP.state !== 'playing') return;
    const st = stats();
    if (won) { bounceT = 1; sfx.win(); PP.burst(PP.W / 2, PP.H * 0.3, [COL.g, '#fff', COL.y], 50, 380, 5, 1.2, 300); showToast(['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'][guesses.length - 1], 2.5); }
    else { sfx.lose(); showToast(answer.toUpperCase(), 99); }
    const dist = st.dist.map((n, i) => `${i + 1}: ${n}`).join('  ');
    PP.game.overDelay = 1400;
    PP.over(won ? `Solved in ${guesses.length}!` : 'Out of guesses',
      `${won ? '' : `The word was ${answer.toUpperCase()}.\n`}Played ${st.played} · Win ${Math.round(st.wins / st.played * 100)}% · Streak ${st.streak} · Best ${st.maxStreak}\n${dist}`,
      [{ label: 'Copy result', onClick: copyResult }]);
  }

  function shareText() {
    const head = mode === 0 ? `Word Guess #${dayNo + 1}` : 'Word Guess';
    const grid = marks.map(m => m.map(c => (c === 'g' ? '🟩' : c === 'y' ? '🟨' : '⬛')).join('')).join('\n');
    return `${head} ${won ? guesses.length : 'X'}/6\n${grid}\nhttps://www.pewplay.com/word-guess/`;
  }
  function copyResult() {
    const text = shareText();
    const ok = () => PP.floatText('Copied!', PP.W / 2, PP.H * 0.2, '#fff', 20);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
      else fallback();
    } catch (e) { fallback(); }
    function fallback() {
      try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); ok(); } catch (e) { /* niente */ }
    }
  }

  function update(dt) {
    shakeT = Math.max(0, shakeT - dt); revealT = Math.max(0, revealT - dt); toastT = Math.max(0, toastT - dt); bounceT = Math.max(0, bounceT - dt);
  }

  // ── DISEGNO ─────────────────────────────────────
  function layout() {
    const W = PP.W, H = PP.H;
    const kbH = clamp(H * 0.3, 150, 210);
    const top = 60;
    const gridH = H - top - kbH - 24;
    const tile = Math.floor(Math.min((W - 40) / 5.4, gridH / 6.5, 74));
    return { tile, gap: Math.max(4, tile * 0.1), gx: W / 2 - (tile * 5 + Math.max(4, tile * 0.1) * 4) / 2, gy: top + (gridH - (tile * 6 + Math.max(4, tile * 0.1) * 5)) / 2, kbY: H - kbH - 10, kbH };
  }

  function drawTile(ctx, x, y, s, letter, state, flip) {
    // flip: 0..1 rotazione verticale durante la rivelazione
    const k = flip === undefined ? 1 : Math.abs(Math.cos(flip * Math.PI));
    const showState = flip === undefined || flip > 0.5;
    const h = s * k;
    ctx.save();
    PP.rr(x, y + (s - h) / 2, s, Math.max(1, h), 6);
    if (state && showState) { ctx.fillStyle = COL[state]; ctx.fill(); }
    else { ctx.fillStyle = COL.empty; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = letter ? '#666b85' : COL.border; ctx.stroke(); }
    if (letter && h > 6) PP.text(letter.toUpperCase(), x + s / 2, y + s / 2 + 2, s * 0.52, '#fff', 'center', 900);
    ctx.restore();
  }

  function draw(ctx, W, H) {
    ctx.fillStyle = '#121420'; ctx.fillRect(0, 0, W, H);
    const L = layout();
    if (!guesses) { // menu: fila di esempio
      const word = 'GUESS', st = ['g', 'x', 'y', 'g', 'x'];
      for (let i = 0; i < 5; i++) drawTile(ctx, L.gx + i * (L.tile + L.gap), H * 0.18, L.tile, word[i], st[i]);
      return;
    }
    PP.text(mode === 0 ? `Daily #${todayNo() + 1}` : 'Unlimited', 16, 30, 16, '#fff', 'left', 800);
    for (let r = 0; r < 6; r++) {
      const isCur = r === guesses.length && !done;
      const off = isCur && shakeT > 0 ? Math.sin(shakeT * 50) * 8 : 0;
      for (let c = 0; c < 5; c++) {
        const x = L.gx + c * (L.tile + L.gap) + off;
        let y = L.gy + r * (L.tile + L.gap);
        if (r < guesses.length) {
          const isLast = r === guesses.length - 1;
          let flip;
          if (isLast && revealT > 0) { const t = 1.6 - revealT - c * 0.3; flip = clamp(t / 0.3, 0, 1); }
          if (isLast && won && bounceT > 0) y -= Math.max(0, Math.sin((1 - bounceT) * Math.PI * 2 - c * 0.5)) * 14;
          drawTile(ctx, x, y, L.tile, guesses[r][c], marks[r][c], flip);
        } else if (isCur) {
          const ch = current[c];
          const pop = ch && c === current.length - 1 ? 1.04 : 1;
          drawTile(ctx, x - (pop - 1) * L.tile / 2, y - (pop - 1) * L.tile / 2, L.tile * pop, ch, null);
        } else drawTile(ctx, x, y, L.tile, '', null);
      }
    }
    // tastiera
    keys = [];
    const rows = ROWS.length, kh = (L.kbH - 16) / rows, gap = 6;
    ROWS.forEach((row, ri) => {
      const units = [...row].reduce((a, ch) => a + (ch === '<' || ch === '>' ? 1.5 : 1), 0);
      const kw = Math.min(46, (W - 16 - gap * (row.length - 1)) / units);
      const totalW = units * kw + gap * (row.length - 1);
      let x = W / 2 - totalW / 2;
      for (const ch of row) {
        const w = ch === '<' || ch === '>' ? kw * 1.5 : kw;
        const y = L.kbY + ri * (kh + 5);
        const st = keyState[ch.toLowerCase()];
        PP.rr(x, y, w, kh, 6); ctx.fillStyle = st ? COL[st] : COL.key; ctx.fill();
        const label = ch === '<' ? '⌫' : ch === '>' ? 'ENTER' : ch;
        PP.text(label, x + w / 2, y + kh / 2 + 1, ch === '>' ? Math.min(13, w * 0.22) : Math.min(18, kw * 0.48), '#fff', 'center', 800);
        keys.push({ ch, x, y, w, h: kh });
        x += w + gap;
      }
    });
    if (toastT > 0 && toast) {
      ctx.font = `800 15px ${PP.FONT}`;
      const tw = ctx.measureText(toast).width + 28;
      PP.rr(W / 2 - tw / 2, L.gy - 6 - 40, tw, 36, 10); ctx.fillStyle = '#f2f2f2'; ctx.fill();
      PP.text(toast, W / 2, L.gy - 6 - 21, 15, '#121420', 'center', 800);
    }
    PP.drawFx();
  }

  function pointerDown(p) {
    for (const k of keys) if (p.x >= k.x && p.x <= k.x + k.w && p.y >= k.y && p.y <= k.y + k.h) { type(k.ch); return; }
  }
  function keyDown(code, e) {
    if (code === 'Enter') return type('>');
    if (code === 'Backspace') return type('<');
    if (/^Key[A-Z]$/.test(code)) type(code.slice(3));
  }

  function demo(n) {
    mode = n === 2 ? 1 : 0;
    guesses = []; marks = []; current = ''; done = false; won = false; keyState = {}; toast = ''; toastT = 0; revealT = 0; shakeT = 0; bounceT = 0;
    answer = ['', 'crane', 'pilot', 'sweet'][n];
    const gs = { 1: ['audio', 'stern', 'crate'], 2: ['raise', 'clout', 'polit'.replace('polit', 'point'), 'pilot'], 3: ['house'] }[n];
    for (const g of gs) { guesses.push(g); const m = score(g, answer); marks.push(m); updateKeys(g, m); }
    current = n === 1 ? 'cra' : n === 3 ? 'sw' : '';
    if (n === 2) { done = true; won = true; toast = 'Splendid!'; toastT = 99; PP.burst(PP.W / 2, PP.H * 0.3, [COL.g, '#fff', COL.y], 40, 260, 5, 2, 0); }
    dayNo = todayNo();
  }

  function icon(c, S) {
    c.fillStyle = '#121420'; c.fillRect(0, 0, S, S);
    const t = S * 0.2, gp = S * 0.03, x0 = S / 2 - (t * 3 + gp * 2) / 2;
    const rows = [['W', 'g'], ['O', 'y'], ['R', 'x'], ['D', 'g'], ['S', 'g']];
    const grid = [[rows[0], rows[1], rows[2]], [rows[3], rows[4], ['?', 'y']], [['', ''], ['', ''], ['', '']]];
    grid.slice(0, 2).forEach((row, r) => row.forEach(([l, st], k) => {
      const x = x0 + k * (t + gp), y = S * 0.28 + r * (t + gp);
      c.fillStyle = COL[st] || COL.empty; c.beginPath(); c.roundRect(x, y, t, t, S * 0.025); c.fill();
      c.fillStyle = '#fff'; c.font = `900 ${t * 0.55}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(l, x + t / 2, y + t / 2 + 2);
    }));
  }

  PP.run({
    id: GAME_ID,
    title: 'Word Guess',
    intro: 'Guess the hidden five-letter word in six tries.\nGreen: right letter, right spot. Yellow: right letter, wrong spot.',
    choices: () => [{ label: 'Mode', options: MODES, value: mode, onChange: i => { mode = i; store.set('mode', i); PP.showMain(); } }],
    bestText: () => { const s = stats(); return s.played ? `Played ${s.played} · Win ${Math.round(s.wins / s.played * 100)}% · Streak ${s.streak}` : ''; },
    pauseText: () => `${guesses.length} / 6 guesses`,
    lettersInput: true,
    init() { mode = store.get('mode', 0); },
    start, update, draw, pointerDown, keyDown, demo, icon,
  });
})();
