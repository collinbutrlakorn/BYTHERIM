/* ============================================================
   BYTHERIM — graphics renderer (admin Graphics page).

   Draws one graphic onto a canvas from plain data:
     { look: 'nba' | 'draft' | 'ncaa',
       tpl:  'statline' | 'awards' | 'leaders',
       size: '4x5' | '1x1' | '9x16',
       style: { bg, frame }  (optional: background color, gold/silver frame)
       f:    { ...the template's fields } }

   Each look has its own colors, background and card shape, and every
   template uses the same header and footer, so everything in one
   category looks like a set. The output is a PNG meant to be finished
   in Canva (a photo, a sticker, a tweak), not a locked design.
   ============================================================ */
(function (root) {
  'use strict';
  const W = 1080;
  let M = 64; // side margin; wider when the graphic has a frame
  const SIZES = {
    '4x5': { h: 1350, label: 'Instagram post (4:5)' },
    '1x1': { h: 1080, label: 'Square (1:1)' },
    '9x16': { h: 1920, label: 'Story / video cover (9:16)' }
  };
  // Exo 2 for names, numbers and titles; Inter for everything small.
  const FONT = { head: '"Exo 2", "Arial Black", sans-serif', body: '"Inter", "Helvetica Neue", Arial, sans-serif' };

  // One look per category. a = main color, b = highlight, shape = card style.
  // One look per category: a flat background color (shown when there's no
  // photo, changeable per graphic), a = the accent for the first number,
  // the label under the wordmark and the footer link.
  const LOOKS = {
    nba: { name: 'NBA', bg: '#16296b', a: '#e5243b', foot: 'BYTHERIM.COM/NBA' },
    draft: { name: 'Draft', bg: '#3b1541', a: '#e283cd', foot: 'BYTHERIM.COM/DRAFT' },
    ncaa: { name: 'NCAA', bg: '#0d3f91', a: '#1d9bf0', foot: 'BYTHERIM.COM' }
  };
  const SWATCHES = ['#16296b', '#c8122e', '#3b1541', '#964282', '#0d3f91', '#4a1ee0', '#0f6b3a', '#d9661f', '#111216'];
  const FRAMES = { gold: '#e2b45a', silver: '#b8bbc1', white: '#f4f4f4' };
  const SHARED = { text: '#ffffff', muted: 'rgba(255,255,255,0.74)', card: 'rgba(0,0,0,0.26)', line: 'rgba(255,255,255,0.16)' };
  function lookFor(g) {
    const base = LOOKS[g.look] || LOOKS.nba, st = g.style || {};
    return Object.assign({}, base, SHARED, { bg: st.bg || base.bg, frame: FRAMES[st.frame] || null });
  }

  // ------------------------------------------------------------ images
  const imgCache = new Map();
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (imgCache.has(src)) return imgCache.get(src);
    const once = (url, cors) => new Promise(res => {
      const im = new Image();
      if (cors) im.crossOrigin = 'anonymous';
      const t = setTimeout(() => res(null), 8000);
      im.onload = () => { clearTimeout(t); res(im.naturalWidth ? im : null); };
      im.onerror = () => { clearTimeout(t); res(null); };
      im.src = url;
    });
    const local = /^(data:|blob:)/.test(src) || !/^https?:/i.test(src) || (typeof location !== 'undefined' && src.startsWith(location.origin));
    // Photos from other sites need permission to be drawn into an image
    // you can download; ones that refuse go through wsrv.nl, a free image
    // proxy that allows it (same as the draft board export).
    const p = local ? once(src, false)
      : once(src, true).then(im => im || once(`https://wsrv.nl/?url=${encodeURIComponent(src)}&w=900&output=png`, true));
    imgCache.set(src, p);
    p.then(im => { if (!im) imgCache.delete(src); });
    return p;
  }
  function fontsReady() {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve();
    const want = ['italic 800 70px "Exo 2"', '800 70px "Exo 2"', '700 30px Inter', '800 30px Inter'];
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
  function logoSrc(look, team) {
    if (!team) return null;
    if (/^(https?:|data:|blob:)/.test(team)) return team;
    if (look === 'nba') { const t = nbaTeam(team); return t ? `nbalogos/${encodeURIComponent(t)}.png` : null; }
    const B = root.BTR;
    return B && B.schoolLogo ? B.schoolLogo(team) : `schoollogos/${key(team)}.png`;
  }

  // ------------------------------------------------------------ helpers
  const num = (v, d) => (v === '' || v == null || isNaN(+v) ? d : +v);
  function setFont(ctx, weight, size, family, italic, track) {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${Math.round(size)}px ${family}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${track || 0}px`;
  }
  function fit(ctx, text, max) {
    text = String(text || '');
    if (ctx.measureText(text).width <= max) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text.trimEnd() + '…';
  }
  // Largest size from `start` down to `min` that fits on one line.
  function sized(ctx, text, start, min, max, set) {
    let s = start;
    for (; s > min; s -= 2) { set(s); if (ctx.measureText(text).width <= max) break; }
    set(s);
    return { size: s, text: fit(ctx, text, max) };
  }
  // The hard drop shadow BYTHERIM's own posts use under white type.
  function shadow(ctx, on, d = 4) {
    ctx.shadowColor = on ? 'rgba(0,0,0,0.55)' : 'transparent';
    ctx.shadowOffsetX = on ? d : 0; ctx.shadowOffsetY = on ? d : 0; ctx.shadowBlur = on ? d * 1.5 : 0;
  }
  function contain(ctx, im, cx, cy, size) {
    const s = Math.min(size / im.naturalWidth, size / im.naturalHeight);
    ctx.drawImage(im, cx - im.naturalWidth * s / 2, cy - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
    return im.naturalWidth * s;
  }
  // Logos vary a lot in shape. Scale each so its area, not its longest
  // side, matches (a wide logo gets wider, a tall one taller), within a slot.
  function logoFit(ctx, im, cx, cy, box) {
    const a = im.naturalWidth / im.naturalHeight;
    let dw = box * 0.92 * Math.sqrt(a), dh = box * 0.92 / Math.sqrt(a);
    const sc = Math.min(1, box * 1.3 / dw, box * 1.05 / dh);
    dw *= sc; dh *= sc;
    ctx.drawImage(im, cx - dw / 2, cy - dh / 2, dw, dh);
    return dw;
  }
  // Number in the category color gets a thin dark edge so it holds up on any photo.
  function accentText(ctx, text, x, y, size, on) {
    if (on) { ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(5, size * 0.05); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(text, x, y); ctx.restore(); }
    ctx.fillText(text, x, y);
  }
  function ordinal(n) { const v = n % 100; return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'); }
  function prettyDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short' }) + ' ' + ordinal(d.getDate()) + ', ' + d.getFullYear();
  }

  // The photo covers the whole graphic. zoom (100-300) crops in; photoX
  // and photoY (0-100) pick which part shows.
  function drawPhoto(ctx, im, f, H) {
    const z = Math.max(1, num(f.zoom, 100) / 100);
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight) * z;
    const iw = im.naturalWidth * s, ih = im.naturalHeight * s;
    const px = num(f.photoX, 50) / 100, py = num(f.photoY, 30) / 100;
    ctx.drawImage(im, -(iw - W) * px, -(ih - H) * py, iw, ih);
  }

  // ------------------------------------------------------------ frame parts
  // Flat color; a photo on top of it, darkened by a flat black wash.
  function background(ctx, L, H, photo, f) {
    ctx.fillStyle = L.bg; ctx.fillRect(0, 0, W, H);
    if (!photo) return;
    drawPhoto(ctx, photo, f, H);
    const t = Math.max(0, Math.min(0.95, num(f.tint, 35) / 100));
    if (t) { ctx.fillStyle = `rgba(0,0,0,${t})`; ctx.fillRect(0, 0, W, H); }
    // Soft shadow that builds up from the bottom (under the numbers) and a
    // lighter one from the top (under the logo), clear in between.
    const sh = Math.max(0, Math.min(1, num(f.shade, 70) / 100));
    if (sh) {
      const gb = ctx.createLinearGradient(0, H, 0, H * 0.35);
      for (let i = 0; i <= 8; i++) { const u = i / 8; gb.addColorStop(u, `rgba(0,0,0,${(0.92 * sh * (1 - u * u * (3 - 2 * u))).toFixed(3)})`); }
      ctx.fillStyle = gb; ctx.fillRect(0, H * 0.35, W, H * 0.65);
      const gt = ctx.createLinearGradient(0, 0, 0, H * 0.28);
      for (let i = 0; i <= 8; i++) { const u = i / 8; gt.addColorStop(u, `rgba(0,0,0,${(0.6 * sh * (1 - u * u * (3 - 2 * u))).toFixed(3)})`); }
      ctx.fillStyle = gt; ctx.fillRect(0, 0, W, H * 0.28);
    }
  }

  // Top-left block: wordmark, the category between two thin lines, and
  // the date. Returns the y under it.
  const LX = M + 2; // the shared left edge for everything left-aligned
  function brandBlock(ctx, L, g, wordmark) {
    const f = g.f, cx = M + 140, wmW = 280;
    let y = M + 16;
    shadow(ctx, true, 3);
    if (wordmark) { const h = wmW * wordmark.naturalHeight / wordmark.naturalWidth; ctx.drawImage(wordmark, cx - wmW / 2, y, wmW, h); y += h; }
    else { setFont(ctx, 800, 48, FONT.head, true); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('BYTHERIM', cx, y + 44); y += 50; }
    if (!f.noLabel) {
      const label = L.name.toUpperCase();
      setFont(ctx, 800, 20, FONT.body, false, 5); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, cx + 2.5, y + 26);
      shadow(ctx, false);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(cx - wmW / 2, y + 18, (wmW - tw) / 2 - 12, 2);
      ctx.fillRect(cx + tw / 2 + 12, y + 18, (wmW - tw) / 2 - 12, 2);
      shadow(ctx, true, 3);
      y += 34;
    }
    const date = f.note === undefined ? prettyDate(new Date()) : f.note;
    if (date) { setFont(ctx, 700, 32, FONT.body, false, -1); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(fit(ctx, date, 560), LX, y + 56); y += 66; }
    shadow(ctx, false); ctx.textAlign = 'left';
    return y;
  }

  function footer(ctx, L, H) {
    const b = H - (M - 64) - 50;
    shadow(ctx, true, 2);
    setFont(ctx, 800, 22, FONT.body, false, -0.5); ctx.fillStyle = '#fff';
    ctx.fillText(L.foot, LX, b);
    setFont(ctx, 600, 22, FONT.body, false, -0.3); ctx.textAlign = 'right';
    ctx.fillText('@bytherimhoops', W - M - 2, b); ctx.textAlign = 'left';
    shadow(ctx, false);
    return b - 40; // content stops here
  }

  // Title for list graphics: a small line in the accent color over a big
  // italic title, both left-aligned.
  function listTitle(ctx, L, f, y) {
    const x = LX;
    shadow(ctx, true, 4);
    if (f.kicker) { setFont(ctx, 800, 34, FONT.body, false, -1); ctx.fillStyle = L.a; ctx.fillText(fit(ctx, f.kicker, W - M * 2), x, y + 70); y += 70; }
    if (f.title) {
      const t = sized(ctx, f.title, 88, 50, W - M * 2, s => setFont(ctx, 800, s, FONT.head, true, -1));
      ctx.fillStyle = '#fff'; ctx.fillText(t.text, x, y + t.size * 0.95 + 8); y += t.size + 14;
    }
    shadow(ctx, false);
    return y + 26;
  }

  // ------------------------------------------------------------ templates
  // Statline: matchup and result up top, the name low, then the numbers
  // big across the bottom with labels and the shooting line.
  async function statline(ctx, L, g, H, top, bottom, im) {
    const f = g.f;
    const oppLogo = f.opp ? await loadImg(logoSrc(g.look, f.opp)) : null;
    // Matchup ("vs ORL" + logo) and result ("L 122-118").
    let y = top + 70;
    shadow(ctx, true, 4);
    if (f.opp) {
      const text = `${f.where || 'vs'} ${f.opp}`;
      const t = sized(ctx, text, 62, 34, 560, s => setFont(ctx, 800, s, FONT.body, false, -3));
      ctx.fillStyle = '#fff'; ctx.fillText(t.text, LX, y + t.size * 0.8);
      if (oppLogo) { shadow(ctx, false); logoFit(ctx, oppLogo, LX + ctx.measureText(t.text).width + 66, y + t.size * 0.45, 104); shadow(ctx, true, 4); }
      y += t.size + 22;
    }
    if (f.result || f.score) {
      setFont(ctx, 800, 66, FONT.body, false, -2.5);
      let x = LX;
      if (f.result) { ctx.fillStyle = /^w/i.test(f.result) ? '#22c55e' : /^l/i.test(f.result) ? '#ef4444' : '#fff'; ctx.fillText(f.result, x, y + 52); x += ctx.measureText(f.result).width + 24; }
      if (f.score) { ctx.fillStyle = '#fff'; ctx.fillText(f.score, x, y + 52); }
    }
    shadow(ctx, false);

    // Bottom up: shooting line, labels, numbers, sub line, name.
    const stats = (f.stats || []).filter(s => s && (s.value || s.label)).slice(0, 5);
    const k = H < 1200 ? 0.82 : 1;
    let yb = bottom;
    if (f.shooting) {
      shadow(ctx, true, 3); setFont(ctx, 800, 38 * k, FONT.body, false, -1.8); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(fit(ctx, f.shooting, W - M * 2), W / 2, yb - 4); ctx.textAlign = 'left'; shadow(ctx, false);
      yb -= 76 * k;
    }
    if (stats.length) {
      const x0 = M + 30, x1 = W - M - 20, cw = (x1 - x0) / stats.length;
      const labelY = yb - 8, numY = labelY - 58 * k;
      // One size for every number: the largest that lets each fit its column.
      let ns = Math.min(210 * k, stats.length > 4 ? 170 * k : 210 * k);
      for (; ns > 60; ns -= 4) { setFont(ctx, 800, ns, FONT.head, false, -ns * 0.04); if (stats.every(s => ctx.measureText(String(s.value || '')).width <= cw - 8)) break; }
      stats.forEach((s, i) => {
        const cx = x0 + cw * (i + 0.5);
        ctx.textAlign = 'center';
        shadow(ctx, true, 6);
        setFont(ctx, 800, ns, FONT.head, false, -ns * 0.04); ctx.fillStyle = i === 0 ? L.a : '#fff';
        accentText(ctx, String(s.value || ''), cx, numY, ns, i === 0);
        shadow(ctx, true, 3);
        setFont(ctx, 800, 38 * k, FONT.head, true, 0); ctx.fillStyle = '#fff';
        ctx.fillText(fit(ctx, String(s.label || '').toUpperCase(), cw - 6), cx, labelY);
      });
      shadow(ctx, false); ctx.textAlign = 'left';
      yb = numY - ns * 0.78 - 36 * k;
    }
    const sub = [f.team, f.info].filter(Boolean).join(' • ');
    if (sub) {
      shadow(ctx, true, 3); setFont(ctx, 700, 30 * k, FONT.body, false, -1.2); ctx.fillStyle = '#fff';
      ctx.fillText(fit(ctx, sub, W - M * 2 - 60), LX, yb); shadow(ctx, false);
      yb -= 50 * k;
    }
    if (f.player) {
      shadow(ctx, true, 5);
      const n = sized(ctx, f.player, 100 * k, 50, W - M * 2 - 60, s => setFont(ctx, 800, s, FONT.head, true, -1));
      ctx.fillStyle = '#fff'; ctx.fillText(n.text, LX, yb);
      shadow(ctx, false);
    }
  }

  // Weekly awards: one block per award (team logo, award in the accent
  // color, the winner big, his line under it).
  async function awards(ctx, L, g, H, top, bottom) {
    const f = g.f;
    const rows = (f.rows || []).filter(r => r && (r.player || r.award)).slice(0, 6);
    const logos = await Promise.all(rows.map(r => loadImg(logoSrc(g.look, r.team))));
    const y0 = listTitle(ctx, L, f, top);
    if (!rows.length) return;
    const rh = Math.min(200, (bottom - y0) / rows.length), k = Math.min(1, rh / 170);
    rows.forEach((r, i) => {
      const y = y0 + i * rh, x = LX;
      let tx = x;
      if (logos[i]) { shadow(ctx, false); logoFit(ctx, logos[i], x + 54 * k, y + rh * 0.46, 88 * k); tx = x + 128 * k; }
      shadow(ctx, true, 3);
      setFont(ctx, 800, 30 * k, FONT.head, true, 0.5); ctx.fillStyle = L.a;
      ctx.fillText(fit(ctx, String(r.award || '').toUpperCase(), W - M - tx), tx, y + rh * 0.24);
      shadow(ctx, true, 4);
      const n = sized(ctx, r.player || '', 64 * k, 30, W - M - tx - 10, s => setFont(ctx, 800, s, FONT.head, true, -1));
      ctx.fillStyle = '#fff'; ctx.fillText(n.text, tx, y + rh * 0.24 + n.size * 0.98);
      if (r.detail) {
        shadow(ctx, true, 2); setFont(ctx, 700, 28 * k, FONT.body, false, -1);
        ctx.fillText(fit(ctx, r.detail, W - M - tx), tx, y + rh * 0.24 + n.size * 0.98 + 40 * k);
      }
      shadow(ctx, false);
    });
  }

  // Top performances: ranked rows (number, logo, name and line, the big
  // number on the right with its label).
  async function leaders(ctx, L, g, H, top, bottom) {
    const f = g.f;
    const rows = (f.rows || []).filter(r => r && r.player).slice(0, 10);
    const logos = await Promise.all(rows.map(r => loadImg(logoSrc(g.look, r.team))));
    const y0 = listTitle(ctx, L, f, top);
    if (!rows.length) return;
    const rh = Math.min(170, (bottom - y0) / rows.length), k = Math.min(1, rh / 150);
    rows.forEach((r, i) => {
      const y = y0 + i * rh, mid = y + rh / 2, x = LX;
      if (i) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, W - M - 10 - x, 2); }
      shadow(ctx, true, 5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      setFont(ctx, 800, 76 * k, FONT.head, false, -2); ctx.fillStyle = i === 0 ? L.a : '#fff';
      accentText(ctx, String(i + 1), x + 34 * k, mid + 4 * k, 76 * k, i === 0);
      shadow(ctx, false);
      let tx = x + 84 * k;
      if (logos[i]) { logoFit(ctx, logos[i], tx + 46 * k, mid, 76 * k); tx += 110 * k; }
      // Big number on the right.
      let right = W - M - 10;
      if (r.value) {
        shadow(ctx, true, 5); ctx.textAlign = 'right';
        setFont(ctx, 800, 84 * k, FONT.head, false, -3); ctx.fillStyle = i === 0 ? L.a : '#fff';
        const vw = ctx.measureText(r.value).width;
        accentText(ctx, String(r.value), right, mid - (f.valueLabel ? 12 * k : 0), 84 * k, i === 0);
        if (f.valueLabel) { shadow(ctx, true, 2); setFont(ctx, 800, 24 * k, FONT.head, true, 0); ctx.fillStyle = '#fff'; ctx.fillText(String(f.valueLabel).toUpperCase(), right, mid + 40 * k); }
        right -= Math.max(vw, 60) + 30;
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      shadow(ctx, true, 4);
      const n = sized(ctx, r.player, 54 * k, 26, right - tx, s => setFont(ctx, 800, s, FONT.head, true, -1));
      ctx.fillStyle = '#fff'; ctx.fillText(n.text, tx, mid + (r.detail || r.team ? -2 : n.size * 0.35));
      const sub = [r.team, r.detail].filter(Boolean).join(' • ');
      if (sub) { shadow(ctx, true, 2); setFont(ctx, 700, 26 * k, FONT.body, false, -1); ctx.fillText(fit(ctx, sub, right - tx), tx, mid + 36 * k); }
      shadow(ctx, false);
    });
  }


  // ------------------------------------------------------------ video overlay
  // A transparent 1080x1920 graphic to lay over a TikTok / Reel. Everything
  // sits inside the app's safe area: clear of the top bar, the caption
  // block at the bottom (about 520 px) and the buttons down the right (150).
  const SAFE = { left: 48, right: 150, top: 230, bottom: 520 };
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  async function overlay(ctx, L, g, H, photo) {
    const f = g.f, X = SAFE.left, CW = W - SAFE.left - SAFE.right, pad = 38, inner = CW - pad * 2, bar = 12;
    const [oppLogo, teamLogo] = await Promise.all([f.opp ? loadImg(logoSrc(g.look, f.opp)) : null, f.team ? loadImg(logoSrc(g.look, f.team)) : null]);
    const stats = (f.stats || []).filter(s => s && (s.value || s.label)).slice(0, 4);
    const big = f.layout === 'big';
    const sub = [f.team, f.info].filter(Boolean).join(' • ');
    const resColor = /^w/i.test(f.result || '') ? '#22c55e' : /^l/i.test(f.result || '') ? '#ef4444' : '#fff';
    const hasGame = !!(f.opp || f.score || f.result);
    const logoW = teamLogo ? 110 : 0;
    // ---- measure
    let cardH;
    const headH = big ? 0 : (photo ? 132 : 108);
    if (big) cardH = bar + pad + 250 + pad;
    else cardH = bar + pad + headH + (stats.length ? 30 + 160 : 0) + (hasGame ? 22 + 44 : 0) + (f.shooting ? (hasGame ? 8 : 22) + 38 : 0) + pad;
    const anchor = f.pos || 'low';
    const top = anchor === 'top' ? SAFE.top : anchor === 'mid' ? Math.round((H - cardH) / 2 - 60) : H - SAFE.bottom - cardH;
    // ---- card
    ctx.save();
    ctx.globalAlpha = Math.max(0.3, Math.min(1, num(f.opacity, 96) / 100));
    ctx.fillStyle = L.bg; rrect(ctx, X, top, CW, cardH, 34); ctx.fill();
    ctx.restore();
    ctx.save(); rrect(ctx, X, top, CW, cardH, 34); ctx.clip(); ctx.fillStyle = L.a; ctx.fillRect(X, top, CW, bar); ctx.restore();
    const x0 = X + pad, right = X + CW - pad;
    let y = top + bar + pad;
    ctx.textAlign = 'left';
    const stat = (v, i) => String(v || '');
    if (!big) {
      // header: headshot, name, team line, team logo
      let nx = x0;
      if (photo) {
        ctx.save(); rrect(ctx, x0, y, 132, 132, 22); ctx.clip();
        const s = Math.max(132 / photo.naturalWidth, 132 / photo.naturalHeight);
        ctx.drawImage(photo, x0 - (photo.naturalWidth * s - 132) * 0.5, y - (photo.naturalHeight * s - 132) * 0.12, photo.naturalWidth * s, photo.naturalHeight * s);
        ctx.restore(); nx = x0 + 132 + 26;
      }
      const maxN = right - nx - (logoW ? logoW + 12 : 0);
      const off = (headH - 108) / 2;
      if (f.player) {
        shadow(ctx, true, 3);
        const n = sized(ctx, f.player, 68, 34, maxN, s => setFont(ctx, 800, s, FONT.head, true, -1));
        ctx.fillStyle = '#fff'; ctx.fillText(n.text, nx, y + off + 66);
      }
      if (sub) { shadow(ctx, true, 2); setFont(ctx, 700, 30, FONT.body, false, -1); ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillText(fit(ctx, sub, maxN), nx, y + off + 106); }
      shadow(ctx, false);
      if (teamLogo) logoFit(ctx, teamLogo, right - logoW / 2, y + headH / 2, 92);
      y += headH;
      if (stats.length) {
        y += 30;
        const cw = inner / stats.length;
        let ns = 108;
        for (; ns > 50; ns -= 4) { setFont(ctx, 800, ns, FONT.head, false, -ns * 0.04); if (stats.every(s => ctx.measureText(stat(s.value)).width <= cw - 10)) break; }
        shadow(ctx, true, 4); ctx.textAlign = 'center';
        stats.forEach((s, i) => {
          const cx = x0 + cw * (i + 0.5);
          setFont(ctx, 800, ns, FONT.head, false, -ns * 0.04); ctx.fillStyle = i === 0 ? L.a : '#fff';
          accentText(ctx, stat(s.value), cx, y + 104, ns, i === 0);
          setFont(ctx, 800, 30, FONT.head, true, 0); ctx.fillStyle = '#fff';
          ctx.fillText(fit(ctx, String(s.label || '').toUpperCase(), cw - 8), cx, y + 148);
        });
        ctx.textAlign = 'left'; shadow(ctx, false);
        y += 160;
      }
    } else {
      // big number on the left, the name and context on the right
      const s0 = stats[0];
      const bw = 330;
      if (s0) {
        shadow(ctx, true, 5); ctx.textAlign = 'center';
        let ns = 230;
        for (; ns > 70; ns -= 4) { setFont(ctx, 800, ns, FONT.head, false, -ns * 0.05); if (ctx.measureText(stat(s0.value)).width <= bw - 10) break; }
        ctx.fillStyle = L.a; accentText(ctx, stat(s0.value), x0 + bw / 2, y + 168, ns, true);
        shadow(ctx, true, 3); setFont(ctx, 800, 44, FONT.head, true, 1); ctx.fillStyle = '#fff';
        ctx.fillText(fit(ctx, String(s0.label || '').toUpperCase(), bw), x0 + bw / 2, y + 226);
        ctx.textAlign = 'left'; shadow(ctx, false);
      }
      const tx = s0 ? x0 + bw + 30 : x0, maxT = right - tx - (logoW ? logoW + 10 : 0);
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; if (s0) ctx.fillRect(x0 + bw + 8, y + 10, 3, 220);
      shadow(ctx, true, 3);
      if (f.player) { const n = sized(ctx, f.player, 62, 30, maxT, s => setFont(ctx, 800, s, FONT.head, true, -1)); ctx.fillStyle = '#fff'; ctx.fillText(n.text, tx, y + 62); }
      if (sub) { setFont(ctx, 700, 28, FONT.body, false, -1); ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillText(fit(ctx, sub, maxT), tx, y + 104); }
      const more = stats.slice(1).map(s => `${stat(s.value)} ${String(s.label || '').toUpperCase()}`.trim()).join(' • ');
      if (more) { setFont(ctx, 800, 34, FONT.body, false, -1); ctx.fillStyle = '#fff'; ctx.fillText(fit(ctx, more, right - tx), tx, y + 158); }
      if (hasGame) {
        let gx = tx; setFont(ctx, 800, 32, FONT.body, false, -1.2);
        if (f.result) { ctx.fillStyle = resColor; ctx.fillText(f.result, gx, y + 218); gx += ctx.measureText(f.result).width + 12; }
        ctx.fillStyle = '#fff';
        const line = [f.score, f.opp ? `${f.where || 'vs'} ${f.opp}` : ''].filter(Boolean).join('  ');
        ctx.fillText(fit(ctx, line, right - gx), gx, y + 218);
      }
      shadow(ctx, false);
      if (teamLogo) logoFit(ctx, teamLogo, right - logoW / 2, y + 44, 84);
    }
    if (!big) {
      shadow(ctx, true, 2);
      if (hasGame) {
        y += 22; let gx = x0; setFont(ctx, 800, 40, FONT.body, false, -1.5);
        if (f.result) { ctx.fillStyle = resColor; ctx.fillText(f.result, gx, y + 34); gx += ctx.measureText(f.result).width + 14; }
        ctx.fillStyle = '#fff';
        const line = [f.score, f.opp ? `${f.where || 'vs'} ${f.opp}` : ''].filter(Boolean).join('  ');
        const lw = fit(ctx, line, inner - (gx - x0) - (oppLogo ? 60 : 0));
        ctx.fillText(lw, gx, y + 34);
        if (oppLogo) { shadow(ctx, false); logoFit(ctx, oppLogo, gx + ctx.measureText(lw).width + 38, y + 22, 50); shadow(ctx, true, 2); }
        y += 44;
      }
      if (f.shooting) { y += hasGame ? 8 : 22; setFont(ctx, 700, 30, FONT.body, false, -1); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(fit(ctx, f.shooting, inner), x0, y + 28); }
    }
    shadow(ctx, false);
  }


  // ------------------------------------------------------------ cover
  // Cover art: the photo, the wordmark small at the top, and one huge
  // word along the bottom with a stacked shadow. Meant to read from a
  // grid thumbnail and make people swipe. Kept clear of the 3:4 grid crop.
  async function cover(ctx, L, g, H, top, bottom, im, wordmark) {
    const f = g.f, mx = Math.max(M, 76);
    if (wordmark) {
      const w = 300, h = w * wordmark.naturalHeight / wordmark.naturalWidth;
      shadow(ctx, true, 3); ctx.drawImage(wordmark, (W - w) / 2, M - 10, w, h); shadow(ctx, false);
    }
    const text = String(f.title || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const swipe = f.swipe !== false;
    let yb = H - M - (swipe ? 84 : 22);   // baseline of the last line
    ctx.textAlign = 'center';
    if (text) {
      const maxW = W - mx * 2;
      const one = sized(ctx, text, 380, 40, maxW, s => setFont(ctx, 800, s, FONT.head, true, 0));
      let lines = [text], size = one.size;
      const words = text.split(' ');
      if (words.length > 1 && one.size < 190) {
        let best = null;
        for (let i = 1; i < words.length; i++) {
          const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
          const sa = sized(ctx, a, 380, 40, maxW, s => setFont(ctx, 800, s, FONT.head, true, 0)).size;
          const sb = sized(ctx, b, 380, 40, maxW, s => setFont(ctx, 800, s, FONT.head, true, 0)).size;
          const sz = Math.min(sa, sb);
          if (!best || sz > best.sz) best = { lines: [a, b], sz };
        }
        if (best && best.sz > one.size * 1.15) { lines = best.lines; size = best.sz; }
      }
      const lh = size * 0.9, depth = Math.max(10, size * 0.07);
      setFont(ctx, 800, size, FONT.head, true, -size * 0.01);
      lines.forEach((ln, i) => {
        const y = yb - (lines.length - 1 - i) * lh;
        shadow(ctx, false);
        ctx.fillStyle = 'rgba(8,10,24,0.8)';
        for (let d = depth; d >= 2; d -= 2) ctx.fillText(ln, W / 2 + d, y + d);
        ctx.fillStyle = '#fff'; ctx.fillText(ln, W / 2, y);
      });
      yb -= (lines.length - 1) * lh + size * 0.78 + 34;
      if (f.sub) {
        shadow(ctx, true, 4);
        const t = sized(ctx, String(f.sub).toUpperCase(), 58, 30, maxW, s => setFont(ctx, 800, s, FONT.head, true, 1));
        ctx.fillStyle = L.a; accentText(ctx, t.text, W / 2, yb, t.size, true); shadow(ctx, false);
      }
    }
    if (swipe) {
      shadow(ctx, true, 3); setFont(ctx, 800, 26, FONT.body, false, 5); ctx.fillStyle = '#fff';
      ctx.fillText(fit(ctx, String(f.swipeText || 'SWIPE FOR THE STATS').toUpperCase() + '  →', W - mx * 2), W / 2, H - M - 14);
      shadow(ctx, false);
    }
    ctx.textAlign = 'left';
  }

  const TEMPLATES = { statline, awards, leaders, cover };

  // ------------------------------------------------------------ draw
  async function draw(canvas, g, opts = {}) {
    const L = lookFor(g);
    const H = g.tpl === 'overlay' ? SIZES['9x16'].h : (SIZES[g.size] || SIZES['4x5']).h;
    const scale = opts.scale || 1;
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return canvas;
    const f = g.f || {};
    const [wordmark, photo] = await Promise.all([loadImg(opts.wordmark || 'assets/logo-header.png'), f.photo ? loadImg(f.photo) : null, fontsReady()]);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (g.tpl === 'overlay') {
      // Transparent: only the card is drawn.
      await overlay(ctx, L, { ...g, f }, H, photo);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      return canvas;
    }
    // A frame is a solid border with a thin darker keyline inside it; the
    // content moves in so it keeps the same breathing room.
    const F = L.frame ? 38 : 0;
    M = 64 + F;
    if (F) { ctx.save(); ctx.beginPath(); ctx.rect(F, F, W - F * 2, H - F * 2); ctx.clip(); }
    background(ctx, L, H, photo, f);
    if (g.tpl === 'cover') await cover(ctx, L, { ...g, f }, H, 0, 0, photo, wordmark);
    else {
      const top = brandBlock(ctx, L, { ...g, f }, wordmark);
      const bottom = footer(ctx, L, H);
      await (TEMPLATES[g.tpl] || statline)(ctx, L, { ...g, f }, H, top, bottom);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (F) {
      ctx.restore();
      ctx.fillStyle = L.frame;
      ctx.fillRect(0, 0, W, F); ctx.fillRect(0, H - F, W, F); ctx.fillRect(0, 0, F, H); ctx.fillRect(W - F, 0, F, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 3; ctx.strokeRect(F - 1.5, F - 1.5, W - F * 2 + 3, H - F * 2 + 3);
    }
    return canvas;
  }

  root.GraphicsDraw = { draw, SAFE, LOOKS, SIZES, SWATCHES, FRAMES, NBA_TEAMS, nbaTeam, logoSrc, prettyDate, W };
})(typeof window !== 'undefined' ? window : globalThis);
