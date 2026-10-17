/* ============================================================
   BYTHERIM — graphics renderer (admin Graphics page).

   Draws one graphic onto a canvas from plain data:
     { look:  'nba' | 'draft' | 'ncaa',
       tpl:   'award' | 'ranking' | 'columns' | 'statline' | 'cover',
       size:  '4x5' | '1x1' | '9x16',
       style: { overrides of the look: bg, bg2, accent, frame, gray, logo, logoUrl, shade },
       f:     { ...the template's fields } }

   The style follows BYTHERIM's own posts: a big photo, flat color, heavy
   type, a solid frame, thin white rules between rows. Each category has
   a default look (NBA: gold frame; Draft: silver frame, black-and-white
   photo; NCAA: royal blue and yellow), and any graphic can change its
   colors. The PNG is meant to be finished in Canva.
   ============================================================ */
(function (root) {
  'use strict';
  const SIZES = {
    '4x5': { w: 1080, h: 1350, label: 'Instagram post (4:5)' },
    '5x4': { w: 1350, h: 1080, label: 'Wide (5:4)' },
    '1x1': { w: 1080, h: 1080, label: 'Square (1:1)' },
    '9x16': { w: 1080, h: 1920, label: 'Story / video cover (9:16)' }
  };
  const HEAVY = '"Archivo", "Arial Black", sans-serif';
  const NARROW = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const FRAMES = { gold: '#e2b45a', silver: '#b8bbc1' };
  const GOLD_TEXT = '#e0b255';
  const SWATCHES = ['#c8122e', '#964282', '#1d42ba', '#4a1ee0', '#0f7a3d', '#e2b45a', '#1c1c1f', '#0d0d10'];

  // One starting look per category. bg: the flat color (shows when there's
  // no photo), frame: border, topLogo: logo at the top, pattern: court lines.
  const LOOKS = {
    nba: { name: 'NBA', bg: '#c8122e', bg2: '', frame: 'gold', topLogo: 'nba', pattern: true, swatches: SWATCHES },
    draft: { name: 'Draft', bg: '#1c1c1f', bg2: '', frame: 'silver', topLogo: 'draft', pattern: false, swatches: SWATCHES },
    ncaa: { name: 'NCAA', bg: '#1d42ba', bg2: '', frame: 'none', topLogo: 'none', pattern: true, swatches: SWATCHES }
  };
  const LEAGUE_LOGOS = { nba: 'nbalogos/NBA%20logo.png', draft: 'nbalogos/NBA%20Draft.png' };

  // ------------------------------------------------------------ images
  const imgCache = new Map();
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (imgCache.has(src)) return imgCache.get(src);
    const once = (url, cors) => new Promise(res => {
      const im = new Image();
      if (cors) im.crossOrigin = 'anonymous';
      const t = setTimeout(() => res(null), 9000);
      im.onload = () => { clearTimeout(t); res(im.naturalWidth ? im : null); };
      im.onerror = () => { clearTimeout(t); res(null); };
      im.src = url;
    });
    const local = /^(data:|blob:)/.test(src) || !/^https?:/i.test(src) || (typeof location !== 'undefined' && src.startsWith(location.origin));
    // Photos from other sites need permission to be drawn into an image you
    // can download; ones that refuse go through wsrv.nl, a free image proxy.
    const p = local ? once(src, false)
      : once(src, true).then(im => im || once(`https://wsrv.nl/?url=${encodeURIComponent(src)}&w=1400&output=png`, true));
    imgCache.set(src, p);
    p.then(im => { if (!im) imgCache.delete(src); });
    return p;
  }
  function fontsReady() {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve();
    const want = ['900 80px Archivo', '800 60px Archivo', '500 40px "Barlow Condensed"', '600 40px "Barlow Condensed"', '700 40px "Barlow Condensed"'];
    return Promise.race([new Promise(r => setTimeout(r, 3500)), Promise.all(want.map(f => document.fonts.load(f).catch(() => null)))]);
  }

  // NBA logos live in /nbalogos under the team's full name.
  const NBA_TEAMS = ['Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets', 'Chicago Bulls', 'Cleveland Cavaliers',
    'Dallas Mavericks', 'Denver Nuggets', 'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers',
    'Los Angeles Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies', 'Miami Heat', 'Milwaukee Bucks', 'Minnesota Timberwolves',
    'New Orleans Pelicans', 'New York Knicks', 'OKC Thunder', 'Orlando Magic', 'Philadelphia 76ers', 'Phoenix Suns',
    'Portland Trailblazers', 'Sacramento Kings', 'San Antonio Spurs', 'Toronto Raptors', 'Utah Jazz', 'Washington Wizards'];
  const NBA_ABBR = { ATL: 0, BOS: 1, BKN: 2, BRK: 2, CHA: 3, CHO: 3, CHI: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8, GSW: 9, GS: 9, HOU: 10, IND: 11,
    LAC: 12, LAL: 13, MEM: 14, MIA: 15, MIL: 16, MIN: 17, NOP: 18, NO: 18, NYK: 19, NY: 19, OKC: 20, ORL: 21, PHI: 22, PHX: 23, PHO: 23,
    POR: 24, SAC: 25, SAS: 26, SA: 26, TOR: 27, UTA: 28, UTAH: 28, WAS: 29, WSH: 29 };
  const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function nbaTeam(name) {
    const raw = String(name || '').trim();
    if (!raw) return null;
    if (NBA_ABBR[raw.toUpperCase()] != null) return NBA_TEAMS[NBA_ABBR[raw.toUpperCase()]];
    const k = key(raw);
    return NBA_TEAMS.find(t => key(t) === k)
      || NBA_TEAMS.find(t => { const nick = key(t.split(' ').pop()); return k.includes(nick) || (k.length >= 4 && key(t).includes(k)); })
      || null;
  }
  // A team name finds an NBA logo first; anything else is tried as a school.
  function logoSrc(team) {
    if (!team) return null;
    if (/^(https?:|data:|blob:)/.test(team)) return team;
    const t = nbaTeam(team);
    if (t) return `nbalogos/${encodeURIComponent(t)}.png`;
    const B = root.BTR;
    return B && B.schoolLogo ? B.schoolLogo(team) : `schoollogos/${key(team)}.png`;
  }

  // ------------------------------------------------------------ text
  function setFont(ctx, weight, size, family, track) {
    ctx.font = `${weight} ${Math.round(size)}px ${family}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${track || 0}px`;
  }
  function fit(ctx, text, max) {
    text = String(text || '');
    if (ctx.measureText(text).width <= max) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text.trimEnd() + '…';
  }
  // Wrap words onto at most `lines` lines; explicit line breaks are kept.
  function wrap(ctx, text, max, lines) {
    const out = [];
    String(text || '').split(/\n/).forEach(par => {
      let cur = '';
      par.split(/\s+/).filter(Boolean).forEach(w => {
        const t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width <= max || !cur) cur = t; else { out.push(cur); cur = w; }
      });
      if (cur) out.push(cur);
    });
    if (out.length > lines) { const rest = out.splice(lines - 1).join(' '); out.push(fit(ctx, rest, max)); }
    return out.map(l => fit(ctx, l, max));
  }
  // Splits words into up to `n` lines of similar length ("MVP RACE" ->
  // MVP / RACE), the stacked look of BYTHERIM titles. Typed line breaks win.
  function stack(text, n) {
    text = String(text || '').trim();
    if (/\n/.test(text) || n < 2) return text;
    const w = text.split(/\s+/);
    if (w.length < 2) return text;
    n = Math.min(n, w.length);
    let best = null;
    const go = (start, left, acc) => {
      if (left === 1) { const all = [...acc, w.slice(start).join(' ')]; const m = Math.max(...all.map(l => l.length)); if (!best || m < best.m) best = { m, all }; return; }
      for (let i = start + 1; i <= w.length - left + 1; i++) go(i, left - 1, [...acc, w.slice(start, i).join(' ')]);
    };
    go(0, n, []);
    return best.all.join('\n');
  }
  // Biggest size from `start` down to `min` where every line fits.
  function fitLines(ctx, text, weight, family, start, min, max, lines, track) {
    let s = start, out;
    for (; s >= min; s -= 2) {
      setFont(ctx, weight, s, family, track(s));
      out = wrap(ctx, text, max, lines);
      if (out.every(l => !/…$/.test(l) && ctx.measureText(l).width <= max)) break;
    }
    return { size: Math.max(s, min), lines: out };
  }
  function shadow(ctx, on, blur = 18, y = 4) {
    ctx.shadowColor = on ? 'rgba(0,0,0,0.55)' : 'transparent';
    ctx.shadowBlur = on ? blur : 0; ctx.shadowOffsetY = on ? y : 0; ctx.shadowOffsetX = 0;
  }
  function initials(name) {
    const w = String(name || '?').split(/\s+/).filter(Boolean);
    return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
  }
  function drawContain(ctx, im, cx, cy, size) {
    const s = Math.min(size / im.naturalWidth, size / im.naturalHeight);
    ctx.drawImage(im, cx - im.naturalWidth * s / 2, cy - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
  }
  function teamMark(ctx, im, label, cx, cy, size) {
    if (im) { shadow(ctx, true, 10, 2); drawContain(ctx, im, cx, cy, size); shadow(ctx, false); return; }
    if (!label) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();
    setFont(ctx, 800, size * 0.28, HEAVY); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initials(label).slice(0, 3), cx, cy + 1);
    ctx.restore();
  }

  // ------------------------------------------------------------ layers
  function styleOf(g) {
    const L = LOOKS[g.look] || LOOKS.nba, s = Object.assign({}, L, g.style || {});
    const frameColor = FRAMES[s.frame] || null;
    return { L, bg: s.bg || L.bg, bg2: s.bg2 || '', frame: s.frame, frameColor, pattern: !!s.pattern, topLogo: s.topLogo,
      accent: s.frame === 'gold' ? GOLD_TEXT : '#ffffff', shade: s.shade != null ? +s.shade : 65 };
  }
  function fill(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
  // The photo covers the area; photoX (0-100) picks which part shows,
  // zoom (100-250) crops in.
  function photo(ctx, im, box, f, gray) {
    const z = Math.max(1, (+f.zoom || 100) / 100);
    const s = Math.max(box.w / im.naturalWidth, box.h / im.naturalHeight) * z;
    const iw = im.naturalWidth * s, ih = im.naturalHeight * s;
    const px = (f.photoX != null && f.photoX !== '' ? +f.photoX : 50) / 100;
    const py = (f.photoY != null && f.photoY !== '' ? +f.photoY : 20) / 100;
    ctx.save();
    ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    if (gray) ctx.filter = 'grayscale(1) contrast(1.08)';
    ctx.drawImage(im, box.x - (iw - box.w) * px, box.y - (ih - box.h) * py, iw, ih);
    ctx.filter = 'none';
    ctx.restore();
  }
  // Darkens the side the text sits on so it reads over any photo.
  function shadeSide(ctx, box, side, amount) {
    const a = Math.max(0, Math.min(1, amount / 100));
    if (!a) return;
    let g;
    if (side === 'left') { g = ctx.createLinearGradient(box.x, 0, box.x + box.w * 0.72, 0); }
    else if (side === 'bottom') { g = ctx.createLinearGradient(0, box.y + box.h, 0, box.y + box.h * 0.35); }
    else { fill(ctx, box.x, box.y, box.w, box.h, `rgba(0,0,0,${a * 0.55})`); return; }
    g.addColorStop(0, `rgba(0,0,0,${0.85 * a})`); g.addColorStop(0.55, `rgba(0,0,0,${0.55 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(box.x, box.y, box.w, box.h);
  }
  function frame(ctx, st, W, H) {
    if (!st.frameColor) return;
    const F = 46;
    ctx.fillStyle = st.frameColor;
    ctx.fillRect(0, 0, W, F); ctx.fillRect(0, H - F, W, F); ctx.fillRect(0, 0, F, H); ctx.fillRect(W - F, 0, F, H);
  }
  // Big court lines in a darker shade of the background (key, arc, circle).
  function court(ctx, W, H) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = Math.max(W, H) * 0.022; ctx.lineJoin = 'round';
    const u = Math.max(W, H) / 10;
    ctx.translate(W * 0.62, H * 0.42); ctx.rotate(-0.42);
    ctx.strokeRect(-1.6 * u, -6 * u, 3.2 * u, 5.2 * u);                 // the key
    ctx.beginPath(); ctx.arc(0, -0.8 * u, 1.6 * u, 0, Math.PI * 2); ctx.stroke(); // free-throw circle
    ctx.beginPath(); ctx.arc(0, -6 * u, 6.4 * u, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke(); // three-point arc
    ctx.beginPath(); ctx.arc(0, 4.6 * u, 1.9 * u, 0, Math.PI * 2); ctx.stroke(); // center circle
    ctx.beginPath(); ctx.moveTo(-9 * u, 4.6 * u); ctx.lineTo(9 * u, 4.6 * u); ctx.stroke(); // half-court line
    ctx.restore();
  }
  function leagueLogo(st) { return loadImg(LEAGUE_LOGOS[st.topLogo]); }
  // League logo, centered on cx with its top at y; returns its bottom.
  function drawLeague(ctx, im, cx, y, h) {
    if (!im) return y;
    const w = im.naturalWidth * h / im.naturalHeight;
    const k = w > 330 ? 330 / w : 1;
    shadow(ctx, true, 12, 3);
    ctx.drawImage(im, cx - w * k / 2, y, w * k, h * k);
    shadow(ctx, false);
    return y + h * k;
  }
  function drawBrand(ctx, im, cx, y, w, align = 'center') {
    if (!im) {
      setFont(ctx, 900, w * 0.13, HEAVY, -1); ctx.fillStyle = '#fff'; ctx.textAlign = align; ctx.fillText('BYTHERIM', cx, y + w * 0.12); ctx.textAlign = 'left';
      return;
    }
    const h = w * im.naturalHeight / im.naturalWidth;
    const x = align === 'center' ? cx - w / 2 : align === 'right' ? cx - w : cx;
    shadow(ctx, true, 10, 2);
    ctx.drawImage(im, x, y, w, h);
    shadow(ctx, false);
  }

  // ------------------------------------------------------------ templates
  // Award: one winner. Photo fills the frame, text stacked on the left.
  async function award(ctx, g, st, A, im) {
    const f = g.f;
    const [pic, team] = await Promise.all([loadImg(f.photo), loadImg(logoSrc(f.team))]);
    if (pic) { photo(ctx, pic, A, { photoX: 70, ...f }, false); shadeSide(ctx, A, 'left', st.shade); }
    const colW = A.w * 0.5, cx = A.x + A.w * 0.27;
    let y = A.y + 22;
    y = drawLeague(ctx, im.league, cx, y, A.h > 1500 ? 190 : 150) + 10;
    ctx.textAlign = 'center'; ctx.fillStyle = st.accent; shadow(ctx, true, 10, 2);
    if (f.kicker) { setFont(ctx, 400, 50, NARROW, -0.5); ctx.textBaseline = 'top'; ctx.fillText(fit(ctx, f.kicker, colW), cx, y + 6); y += 66; }
    ctx.textBaseline = 'alphabetic';
    const words = String(f.title || '').split(/\s+/).filter(Boolean).length;
    const t = fitLines(ctx, stack(String(f.title || '').toUpperCase(), Math.min(3, words)), 900, HEAVY, Math.min(110, A.h * 0.085), 48, colW, 3, s => -s * 0.05);
    t.lines.forEach(l => { y += t.size * 0.9; ctx.fillText(l, cx, y); });
    // The winner's block sits in the middle of the graphic.
    y = Math.max(y + 70, A.y + A.h * 0.47);
    ctx.fillStyle = '#fff';
    const n = fitLines(ctx, stack(f.player, 2), 800, HEAVY, Math.min(76, A.h * 0.058), 40, colW * 0.95, 2, s => -s * 0.06);
    n.lines.forEach(l => { y += n.size * 0.95; ctx.fillText(l, cx, y); });
    shadow(ctx, false);
    y += 34;
    fill(ctx, cx - colW * 0.43, y, colW * 0.86, 2, 'rgba(255,255,255,0.85)');
    y += 26;
    if (f.team) { shadow(ctx, true, 8, 2); setFont(ctx, 400, 42, NARROW, -0.5); ctx.textBaseline = 'top'; ctx.fillText(fit(ctx, f.team, colW), cx, y); ctx.textBaseline = 'alphabetic'; shadow(ctx, false); y += 58; }
    if (team) { teamMark(ctx, team, f.team, cx, y + 40, 76); y += 96; }
    if (f.line) { shadow(ctx, true, 8, 2); ctx.fillStyle = '#fff'; setFont(ctx, 600, 40, NARROW, 0); ctx.fillText(fit(ctx, f.line, colW), cx, y + 30); shadow(ctx, false); y += 56; }
    const ups = String(f.runners || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3);
    if (ups.length) {
      shadow(ctx, true, 8, 2);
      setFont(ctx, 800, 38, HEAVY, -1.5); ctx.fillText(fit(ctx, f.runnersLabel || 'Runner Ups', colW), cx, y + 40); y += 54;
      setFont(ctx, 400, 38, NARROW, -0.5); ctx.textAlign = 'left';
      const lx = cx - colW * 0.36;
      ups.forEach((u, i) => { y += 50; ctx.fillText(fit(ctx, `${i + 2}. ${u}`, colW * 0.8), lx, y); });
      shadow(ctx, false);
    }
    ctx.textAlign = 'left';
    drawBrand(ctx, im.brand, cx, A.y + A.h - 100, 300);
  }

  // Ranking: numbered rows with team logos on the left, photo on the right.
  async function ranking(ctx, g, st, A, im) {
    const f = g.f;
    const rows = (f.rows || []).filter(r => r && r.player).slice(0, 10);
    const [pic, ...logos] = await Promise.all([loadImg(f.photo), ...rows.map(r => loadImg(logoSrc(r.team)))]);
    if (pic) { photo(ctx, pic, A, { photoX: 75, ...f }, false); shadeSide(ctx, A, 'left', st.shade); }
    const cx = A.x + A.w * 0.3;
    let y = A.y + 22;
    y = drawLeague(ctx, im.league, cx, y, A.h > 1500 ? 170 : 130) + 8;
    ctx.textAlign = 'center'; shadow(ctx, true, 10, 2);
    if (f.kicker) { ctx.fillStyle = '#fff'; setFont(ctx, 400, 46, NARROW, -0.5); ctx.textBaseline = 'top'; ctx.fillText(fit(ctx, f.kicker, A.w * 0.55), cx, y + 4); ctx.textBaseline = 'alphabetic'; y += 58; }
    ctx.fillStyle = st.accent === '#ffffff' ? '#fff' : st.accent;
    const t = fitLines(ctx, stack(String(f.title || '').toUpperCase(), 2), 900, HEAVY, Math.min(124, A.h * 0.1), 50, A.w * 0.56, 2, s => -s * 0.06);
    t.lines.forEach(l => { y += t.size * 0.9; ctx.fillText(l, cx, y); });
    shadow(ctx, false);
    ctx.textAlign = 'left';
    const brandH = 120;
    const top = y + 50, bottom = A.y + A.h - brandH - 30;
    if (rows.length) {
      const rh = Math.min(f.rows.length > 7 ? 120 : 140, (bottom - top) / rows.length);
      const k = Math.max(0.7, rh / 138);
      const x0 = A.x + 40, lineEnd = A.x + A.w * 0.52;
      rows.forEach((r, i) => {
        const yy = top + i * rh, mid = yy + rh * 0.46;
        shadow(ctx, true, 8, 2);
        ctx.fillStyle = '#fff'; setFont(ctx, 800, 66 * k, HEAVY, -2); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        const num = f.numbered !== false, nx = num ? 0 : -80;
        if (num) ctx.fillText(String(i + 1), x0 + 32, mid + 2);
        shadow(ctx, false);
        teamMark(ctx, logos[i], r.team, x0 + 120 + nx, mid, 72 * k);
        const tx = x0 + 172 * Math.max(0.85, k) + nx;
        let right = lineEnd;
        if (r.move) {
          const mv = { up: ['▲', '#22c55e'], down: ['▼', '#ef4444'], same: ['—', '#ffffff'], new: ['NEW', st.accent] }[r.move];
          if (mv) { setFont(ctx, 900, (mv[0] === 'NEW' ? 30 : 46) * k, HEAVY); ctx.fillStyle = mv[1]; ctx.textAlign = 'right'; shadow(ctx, true, 6, 2); ctx.fillText(mv[0], lineEnd, mid); shadow(ctx, false); right = lineEnd - ctx.measureText(mv[0]).width - 16; }
        }
        if (r.value) {
          setFont(ctx, 900, 58 * k, HEAVY, -2); ctx.fillStyle = st.accent === '#ffffff' ? '#fff' : st.accent; ctx.textAlign = 'right';
          shadow(ctx, true, 8, 2); ctx.fillText(r.value, right, mid); shadow(ctx, false);
          right -= ctx.measureText(r.value).width + 18;
        }
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; shadow(ctx, true, 8, 2);
        let ns = Math.max(34, 54 * k), lines;
        for (; ns > 26; ns -= 2) { setFont(ctx, 500, ns, NARROW, -0.6); lines = wrap(ctx, r.player, right - tx, 2); if (lines.length === 1 || !lines.some(l => /…$/.test(l))) break; }
        const lh = ns * 0.9;
        lines.forEach((l, j) => ctx.fillText(l, tx, mid + (j - (lines.length - 1) / 2) * lh));
        shadow(ctx, false);
        ctx.textBaseline = 'alphabetic';
        fill(ctx, x0 + (f.numbered !== false ? 70 : 0), yy + rh - 4, lineEnd - x0 - (f.numbered !== false ? 70 : 0), 2, 'rgba(255,255,255,0.75)');
      });
    }
    drawBrand(ctx, im.brand, cx, A.y + A.h - brandH, 330);
  }

  // Columns: two lists side by side (standings, All-Stars, East vs West).
  async function columns(ctx, g, st, A, im) {
    const f = g.f;
    const sides = [f.left, f.right].map(c => ((c && c.rows) || []).filter(r => r && r.player).slice(0, 15));
    const all = await Promise.all([loadImg(f.photo), ...sides.flat().map(r => loadImg(logoSrc(r.team)))]);
    const pic = all[0];
    if (pic) { photo(ctx, pic, A, f, false); shadeSide(ctx, A, 'all', st.shade); }
    const cx = A.x + A.w / 2;
    let y = A.y + 26;
    if (im.league) { drawLeague(ctx, im.league, A.x + 90, y + 10, 110); }
    ctx.textAlign = 'center'; shadow(ctx, true, 12, 4); ctx.fillStyle = '#fff';
    if (f.kicker) { setFont(ctx, 500, 48, NARROW, -0.5); ctx.textBaseline = 'top'; ctx.fillText(fit(ctx, f.kicker, A.w * 0.7), cx, y + 18); ctx.textBaseline = 'alphabetic'; y += 74; }
    const t = fitLines(ctx, String(f.title || '').toUpperCase(), 900, HEAVY, 150, 70, A.w * 0.82, 1, s => -s * 0.06);
    ctx.fillStyle = st.accent === '#ffffff' || st.frame === 'gold' ? '#fff' : st.accent;
    y += t.size * 0.86; ctx.fillText(t.lines[0], cx, y);
    shadow(ctx, false);
    const colW = A.w * 0.43, gap = A.w * 0.05;
    const xs = [A.x + (A.w - colW * 2 - gap) / 2, A.x + (A.w + gap) / 2];
    const heads = [f.left && f.left.heading, f.right && f.right.heading];
    y += 30;
    const n = Math.max(sides[0].length, sides[1].length, 1);
    const top = y + (heads.some(Boolean) ? 76 : 10), bottom = A.y + A.h - 116;
    const rh = Math.min(n <= 8 ? 118 : 94, (bottom - top) / n), k = Math.min(1.35, rh / 76);
    let li = 1;
    sides.forEach((list, c) => {
      const x = xs[c];
      if (heads[c]) {
        ctx.fillStyle = '#fff'; shadow(ctx, true, 10, 3); setFont(ctx, 800, 50, HEAVY, -2); ctx.textAlign = 'center';
        ctx.fillText(String(heads[c]).toUpperCase(), x + colW / 2, y + 52); shadow(ctx, false);
      }
      list.forEach((r, i) => {
        const yy = top + i * rh, mid = yy + rh / 2;
        let tx = x;
        ctx.textBaseline = 'middle';
        if (f.numbered) {
          ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; shadow(ctx, true, 6, 2); setFont(ctx, 800, 50 * k, HEAVY, -2);
          ctx.fillText(String(i + 1), x + 26 * k, mid + 2); shadow(ctx, false);
          tx += 62 * k;
        }
        teamMark(ctx, all[li++], r.team, tx + 28 * k, mid, 56 * k);
        tx += 64 * k;
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; shadow(ctx, true, 6, 2);
        const name = f.caps ? String(r.player).toUpperCase() : r.player;
        let right = x + colW;
        if (r.mark) { ctx.textAlign = 'right'; setFont(ctx, 800, 30 * k, HEAVY); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText('★', right, mid); right -= 40 * k; }
        if (r.value) { ctx.textAlign = 'right'; setFont(ctx, 600, 36 * k, NARROW, 0); ctx.fillStyle = '#fff'; ctx.fillText(r.value, right, mid); right -= ctx.measureText(r.value).width + 14; }
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
        let ns = (f.caps ? 36 : 42) * k, lines;
        for (; ns > 18; ns -= 1) {
          if (f.caps) setFont(ctx, 800, ns, HEAVY, -ns * 0.05); else setFont(ctx, 500, ns, NARROW, -0.4);
          lines = wrap(ctx, name, right - tx - 6, 2);
          if (!lines.some(l => /…$/.test(l)) && lines.length * ns * 0.95 <= rh * 0.9) break;
        }
        const lh = ns * 0.92;
        lines.forEach((l, j) => ctx.fillText(l, tx, mid + (j - (lines.length - 1) / 2) * lh));
        shadow(ctx, false); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        fill(ctx, x + (f.numbered ? 56 * k : 0), yy + rh - 2, colW - (f.numbered ? 56 * k : 0), 2, 'rgba(255,255,255,0.6)');
      });
    });
    drawBrand(ctx, im.brand, cx, A.y + A.h - 92, 270);
  }


  // The stacked header both new layouts share: league logo, small line,
  // big title. Returns the y under it.
  function header(ctx, st, A, im, f, cx, maxW, lines, big = 118) {
    let y = drawLeague(ctx, im.league, cx, A.y + 22, A.h > 1500 ? 170 : 130) + 8;
    ctx.textAlign = 'center'; shadow(ctx, true, 10, 2);
    if (f.kicker) { ctx.fillStyle = '#fff'; setFont(ctx, 500, 46, NARROW, -0.3); ctx.textBaseline = 'top'; ctx.fillText(fit(ctx, f.kicker, maxW), cx, y + 4); ctx.textBaseline = 'alphabetic'; y += 58; }
    ctx.fillStyle = st.accent;
    const words = String(f.title || '').split(/\s+/).filter(Boolean).length;
    const t = fitLines(ctx, stack(String(f.title || '').toUpperCase(), Math.min(lines, words)), 900, HEAVY, Math.min(big, A.h * 0.095), 48, maxW, lines, s => -s * 0.06);
    t.lines.forEach(l => { y += t.size * 0.9; ctx.fillText(l, cx, y); });
    shadow(ctx, false); ctx.textAlign = 'left';
    return y;
  }

  // Statline: one big game. Name and team, then the numbers in a grid
  // with thin rules, and the shooting line.
  async function statline(ctx, g, st, A, im) {
    const f = g.f;
    const [pic, team] = await Promise.all([loadImg(f.photo), loadImg(logoSrc(f.team))]);
    if (pic) { photo(ctx, pic, A, { photoX: 72, ...f }, false); shadeSide(ctx, A, 'left', st.shade); }
    const colW = A.w * 0.52, cx = A.x + A.w * 0.28, x0 = cx - colW / 2;
    let y = header(ctx, st, A, im, f, cx, colW, 2) + 46;
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; shadow(ctx, true, 10, 2);
    const n = fitLines(ctx, stack(f.player, 2), 800, HEAVY, Math.min(70, A.h * 0.052), 36, colW, 2, s => -s * 0.06);
    n.lines.forEach(l => { y += n.size * 0.95; ctx.fillText(l, cx, y); });
    y += 18;
    const sub = [f.team, f.line].filter(Boolean).join('  ·  ');
    if (team) { teamMark(ctx, team, f.team, cx, y + 30, 58); y += 66; }
    if (sub) { shadow(ctx, true, 8, 2); setFont(ctx, 500, 36, NARROW, 0); ctx.fillStyle = '#fff'; ctx.fillText(fit(ctx, sub, colW), cx, y + 32); y += 50; }
    shadow(ctx, false);
    const stats = (f.stats || []).filter(s => s && (s.value || s.label)).slice(0, 6);
    const brandY = A.y + A.h - 100;
    if (stats.length) {
      fill(ctx, x0, y + 8, colW, 2, 'rgba(255,255,255,0.8)');
      const cols = stats.length <= 2 ? stats.length : stats.length === 4 ? 2 : 3;
      const rows = Math.ceil(stats.length / cols);
      const room = brandY - (f.shooting ? 70 : 20) - (y + 14);
      const ch = Math.min(rows > 1 ? 190 : 230, room / rows), cw = colW / cols;
      stats.forEach((s, i) => {
        const c = i % cols, r = Math.floor(i / cols), sx = x0 + cw * (c + 0.5), sy = y + 14 + r * ch;
        shadow(ctx, true, 10, 3); ctx.textAlign = 'center';
        ctx.fillStyle = i === 0 ? st.accent : '#fff';
        let vs = Math.min(ch * 0.56, 150); setFont(ctx, 900, vs, HEAVY, -vs * 0.05); while (vs > 30 && ctx.measureText(String(s.value)).width > cw - 16) { vs -= 3; setFont(ctx, 900, vs, HEAVY, -vs * 0.05); } ctx.fillText(String(s.value || ''), sx, sy + ch * 0.62);
        ctx.fillStyle = '#fff'; setFont(ctx, 600, Math.max(22, ch * 0.17), NARROW, 1.5);
        ctx.fillText(fit(ctx, String(s.label || '').toUpperCase(), cw - 10), sx, sy + ch * 0.86);
        shadow(ctx, false);
        fill(ctx, x0, sy + ch - 2, colW, 2, 'rgba(255,255,255,0.8)');
      });
      y += 14 + rows * ch;
    }
    if (f.shooting) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; shadow(ctx, true, 8, 2);
      setFont(ctx, 600, 34, NARROW, 0.5); ctx.fillText(fit(ctx, f.shooting, colW), cx, y + 46); shadow(ctx, false);
    }
    ctx.textAlign = 'left';
    drawBrand(ctx, im.brand, cx, brandY, 300);
  }

  // Weekly awards: several awards, one row each (award, winner, team logo,
  // stat line) under the stacked title.
  async function awards(ctx, g, st, A, im) {
    const f = g.f;
    const rows = (f.rows || []).filter(r => r && (r.player || r.award)).slice(0, 6);
    const [pic, ...logos] = await Promise.all([loadImg(f.photo), ...rows.map(r => loadImg(logoSrc(r.team)))]);
    const wide = !pic;
    if (pic) { photo(ctx, pic, A, { photoX: 75, ...f }, false); shadeSide(ctx, A, 'left', st.shade); }
    const colW = wide ? A.w - 120 : A.w * 0.56, cx = wide ? A.x + A.w / 2 : A.x + A.w * 0.3, x0 = cx - colW / 2;
    const top = header(ctx, st, A, im, f, cx, colW, wide ? 1 : 2, wide ? 118 : 92) + 36;
    const bottom = A.y + A.h - 130;
    if (!rows.length) { drawBrand(ctx, im.brand, cx, A.y + A.h - 100, 300); return; }
    const rh = Math.min(180, (bottom - top) / rows.length), k = Math.max(0.62, rh / 150);
    rows.forEach((r, i) => {
      const yy = top + i * rh;
      const ls = 74 * k;
      teamMark(ctx, logos[i], r.team, x0 + ls / 2 + 4, yy + rh * 0.5, ls);
      const tx = x0 + ls + 26, tw = x0 + colW - tx;
      shadow(ctx, true, 8, 2);
      ctx.fillStyle = st.accent; setFont(ctx, 700, 28 * k, NARROW, 1.5);
      ctx.fillText(fit(ctx, String(r.award || '').toUpperCase(), tw), tx, yy + rh * 0.3);
      ctx.fillStyle = '#fff'; setFont(ctx, 800, 48 * k, HEAVY, -1.8);
      ctx.fillText(fit(ctx, r.player, tw), tx, yy + rh * 0.3 + 52 * k);
      if (r.detail) { setFont(ctx, 500, 32 * k, NARROW, 0); ctx.fillText(fit(ctx, r.detail, tw), tx, yy + rh * 0.3 + 92 * k); }
      shadow(ctx, false);
      fill(ctx, x0, yy + rh - 3, colW, 2, 'rgba(255,255,255,0.75)');
    });
    drawBrand(ctx, im.brand, cx, A.y + A.h - 100, 300);
  }

  function isLight(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return false;
    const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  }

  const TEMPLATES = { statline, awards, list: ranking, single: award, columns };

  // ------------------------------------------------------------ draw
  async function draw(canvas, g, opts = {}) {
    const sz = SIZES[g.size] || SIZES['4x5'], W = sz.w, H = sz.h;
    const scale = opts.scale || 1;
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return canvas;
    const st = styleOf(g);
    const [brand, league] = await Promise.all([loadImg(opts.wordmark || 'assets/logo-header.png'), leagueLogo(st), fontsReady()]);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Flat color (or two, split down the middle), court lines, then the
    // template, which lays a photo over it when there is one.
    fill(ctx, 0, 0, W, H, st.bg);
    if (st.bg2 && g.tpl === 'columns') fill(ctx, W / 2, 0, W / 2, H, st.bg2);
    if (st.pattern) court(ctx, W, H);
    const F = st.frameColor ? 46 : 0;
    const A = { x: F, y: F, w: W - F * 2, h: H - F * 2 };
    ctx.save();
    await (TEMPLATES[g.tpl] || award)(ctx, { ...g, f: g.f || {} }, st, A, { brand, league });
    ctx.restore();
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    frame(ctx, st, W, H);
    return canvas;
  }

  root.GraphicsDraw = { draw, LOOKS, SIZES, FRAMES, NBA_TEAMS, nbaTeam, logoSrc, styleOf };
})(typeof window !== 'undefined' ? window : globalThis);
