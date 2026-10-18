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
  }

  // Top-left block: wordmark, the category between two thin lines, and
  // the date. Returns the y under it.
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
    if (date) { setFont(ctx, 700, 32, FONT.body, false, -1); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(fit(ctx, date, 360), cx, y + 56); y += 66; }
    shadow(ctx, false); ctx.textAlign = 'left';
    return y;
  }

  function footer(ctx, L, H) {
    const b = H - (M - 64) - 50;
    shadow(ctx, true, 2);
    setFont(ctx, 800, 22, FONT.body, false, -0.5); ctx.fillStyle = '#fff';
    ctx.fillText(L.foot, M + 34, b);
    setFont(ctx, 600, 22, FONT.body, false, -0.3); ctx.textAlign = 'right';
    ctx.fillText('@bytherimhoops', W - M - 52, b); ctx.textAlign = 'left';
    shadow(ctx, false);
    return b - 40; // content stops here
  }

  // Title for list graphics: a small line in the accent color over a big
  // italic title, both left-aligned.
  function listTitle(ctx, L, f, y) {
    const x = M + 4;
    shadow(ctx, true, 4);
    if (f.kicker) { setFont(ctx, 800, 34, FONT.body, false, -1); ctx.fillStyle = L.a; ctx.fillText(fit(ctx, f.kicker, W - M * 2), x, y + 70); y += 70; }
    if (f.title) {
      const t = sized(ctx, f.title, 104, 54, W - M * 2, s => setFont(ctx, 800, s, FONT.head, true, -1));
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
      ctx.fillStyle = '#fff'; ctx.fillText(t.text, M + 2, y + t.size * 0.8);
      if (oppLogo) { shadow(ctx, false); contain(ctx, oppLogo, M + 2 + ctx.measureText(t.text).width + 62, y + t.size * 0.45, 100); shadow(ctx, true, 4); }
      y += t.size + 22;
    }
    if (f.result || f.score) {
      setFont(ctx, 800, 42, FONT.body, false, -1.5);
      let x = M + 62;
      if (f.result) { ctx.fillStyle = /^w/i.test(f.result) ? '#22c55e' : /^l/i.test(f.result) ? '#ef4444' : '#fff'; ctx.fillText(f.result, x, y + 36); x += ctx.measureText(f.result).width + 28; }
      if (f.score) { ctx.fillStyle = '#fff'; ctx.fillText(f.score, x, y + 36); }
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
        ctx.fillText(String(s.value || ''), cx, numY);
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
      ctx.fillText(fit(ctx, sub, W - M * 2 - 60), M + 46, yb); shadow(ctx, false);
      yb -= 50 * k;
    }
    if (f.player) {
      shadow(ctx, true, 5);
      const n = sized(ctx, f.player, 100 * k, 50, W - M * 2 - 60, s => setFont(ctx, 800, s, FONT.head, true, -1));
      ctx.fillStyle = '#fff'; ctx.fillText(n.text, M + 44, yb);
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
      const y = y0 + i * rh, x = M + 4;
      let tx = x;
      if (logos[i]) { shadow(ctx, false); contain(ctx, logos[i], x + 48 * k, y + rh * 0.46, 92 * k); tx = x + 120 * k; }
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
      const y = y0 + i * rh, mid = y + rh / 2, x = M + 4;
      shadow(ctx, true, 5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      setFont(ctx, 800, 76 * k, FONT.head, false, -2); ctx.fillStyle = i === 0 ? L.a : '#fff';
      ctx.fillText(String(i + 1), x + 34 * k, mid + 4 * k);
      shadow(ctx, false);
      let tx = x + 84 * k;
      if (logos[i]) { contain(ctx, logos[i], tx + 40 * k, mid, 78 * k); tx += 98 * k; }
      // Big number on the right.
      let right = W - M - 10;
      if (r.value) {
        shadow(ctx, true, 5); ctx.textAlign = 'right';
        setFont(ctx, 800, 84 * k, FONT.head, false, -3); ctx.fillStyle = i === 0 ? L.a : '#fff';
        const vw = ctx.measureText(r.value).width;
        ctx.fillText(r.value, right, mid - (f.valueLabel ? 12 * k : 0));
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

  const TEMPLATES = { statline, awards, leaders };

  // ------------------------------------------------------------ draw
  async function draw(canvas, g, opts = {}) {
    const L = lookFor(g);
    const H = (SIZES[g.size] || SIZES['4x5']).h;
    const scale = opts.scale || 1;
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return canvas;
    const f = g.f || {};
    const [wordmark, photo] = await Promise.all([loadImg(opts.wordmark || 'assets/logo-header.png'), f.photo ? loadImg(f.photo) : null, fontsReady()]);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // A frame is a solid border with a thin darker keyline inside it; the
    // content moves in so it keeps the same breathing room.
    const F = L.frame ? 38 : 0;
    M = 64 + F;
    if (F) { ctx.save(); ctx.beginPath(); ctx.rect(F, F, W - F * 2, H - F * 2); ctx.clip(); }
    background(ctx, L, H, photo, f);
    const top = brandBlock(ctx, L, { ...g, f }, wordmark);
    const bottom = footer(ctx, L, H);
    await (TEMPLATES[g.tpl] || statline)(ctx, L, { ...g, f }, H, top, bottom);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (F) {
      ctx.restore();
      ctx.fillStyle = L.frame;
      ctx.fillRect(0, 0, W, F); ctx.fillRect(0, H - F, W, F); ctx.fillRect(0, 0, F, H); ctx.fillRect(W - F, 0, F, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 3; ctx.strokeRect(F - 1.5, F - 1.5, W - F * 2 + 3, H - F * 2 + 3);
    }
    return canvas;
  }

  root.GraphicsDraw = { draw, LOOKS, SIZES, SWATCHES, FRAMES, NBA_TEAMS, nbaTeam, logoSrc, prettyDate, W };
})(typeof window !== 'undefined' ? window : globalThis);
