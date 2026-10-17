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
  const W = 1080, M = 56;
  const SIZES = {
    '4x5': { h: 1350, label: 'Instagram post (4:5)' },
    '1x1': { h: 1080, label: 'Square (1:1)' },
    '9x16': { h: 1920, label: 'Story / video cover (9:16)' }
  };
  const FONT = { head: '"Exo 2", "Oswald", sans-serif', disp: '"Oswald", sans-serif', body: '"Barlow Condensed", "Arial Narrow", sans-serif' };

  // One look per category. a = main color, b = highlight, shape = card style.
  // One look per category: a flat background color (changeable per
  // graphic), a = main color, b = highlight, shape = card style. Cards are
  // a darker tint of whatever the background is, so any color works.
  const LOOKS = {
    nba: { name: 'NBA', bg: '#16296b', a: '#ff5147', b: '#ffd04a', shape: 'cut', foot: 'BYTHERIM.COM/NBA' },
    draft: { name: 'Draft', bg: '#3b1541', a: '#e283cd', b: '#e3bb4f', shape: 'round', foot: 'BYTHERIM.COM/DRAFT' },
    ncaa: { name: 'NCAA', bg: '#0d3f91', a: '#59b8ff', b: '#ffc72c', shape: 'square', foot: 'BYTHERIM.COM' }
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
    const want = ['italic 800 70px "Exo 2"', '600 40px Oswald', '500 40px Oswald', '500 22px "Barlow Condensed"', '600 22px "Barlow Condensed"'];
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
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function shape(ctx, L, x, y, w, h) {
    if (L.shape === 'cut') {
      const c = Math.min(22, h * 0.22);
      ctx.beginPath();
      ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h);
      ctx.lineTo(x, y + h); ctx.lineTo(x, y + c); ctx.closePath();
    } else rr(ctx, x, y, w, h, L.shape === 'round' ? 16 : 3);
  }
  function card(ctx, L, x, y, w, h, stripe) {
    shape(ctx, L, x, y, w, h); ctx.fillStyle = L.card; ctx.fill();
    ctx.strokeStyle = L.line; ctx.lineWidth = 1.5; ctx.stroke();
    if (stripe) {
      ctx.save(); shape(ctx, L, x, y, w, h); ctx.clip();
      ctx.fillStyle = stripe;
      if (L.shape === 'square') ctx.fillRect(x, y, w, 5); else ctx.fillRect(x, y, 8, h);
      ctx.restore();
    }
  }
  function fit(ctx, text, max) {
    text = String(text || '');
    if (ctx.measureText(text).width <= max) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text.trimEnd() + '…';
  }
  // Largest size from `start` down to `min` that fits; ellipsis below that.
  function sized(ctx, text, font, start, min, max) {
    let s = start;
    for (; s > min; s -= 2) { ctx.font = font(s); if (ctx.measureText(text).width <= max) break; }
    ctx.font = font(s);
    return { size: s, text: fit(ctx, text, max) };
  }
  function spaced(ctx, text, x, y, sp, align = 'left') {
    const chars = [...String(text)];
    const w = chars.reduce((s, ch) => s + ctx.measureText(ch).width, 0) + sp * Math.max(0, chars.length - 1);
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    const prev = ctx.textAlign; ctx.textAlign = 'left';
    chars.forEach(ch => { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; });
    ctx.textAlign = prev;
    return w;
  }
  function wrap(ctx, text, max, lines) {
    const words = String(text || '').split(/\s+/).filter(Boolean), out = [];
    let cur = '';
    words.forEach(w => {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= max || !cur) cur = t; else { out.push(cur); cur = w; }
    });
    if (cur) out.push(cur);
    if (out.length > lines) { out.length = lines; out[lines - 1] = fit(ctx, out[lines - 1] + ' …', max); }
    return out;
  }
  function initials(name) {
    const w = String(name || '?').split(/\s+/).filter(Boolean);
    return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
  }
  function drawContain(ctx, im, cx, cy, size) {
    const s = Math.min(size / im.naturalWidth, size / im.naturalHeight);
    ctx.drawImage(im, cx - im.naturalWidth * s / 2, cy - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
  }
  function logoOrBadge(ctx, L, im, label, cx, cy, size) {
    if (im) return drawContain(ctx, im, cx, cy, size);
    if (!label) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2); ctx.fillStyle = L.line; ctx.fill();
    ctx.fillStyle = L.text; ctx.font = `600 ${Math.round(size * 0.3)}px ${FONT.disp}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initials(label).slice(0, 3), cx, cy + 1);
    ctx.restore();
  }

  // ------------------------------------------------------------ frame
  // Flat color, no gradients; each category keeps one small signature.
  function background(ctx, L, look, H) {
    ctx.fillStyle = L.bg; ctx.fillRect(0, 0, W, H);
    if (look === 'nba') {
      // Three slanted bars in the top-right corner.
      [[0, L.a], [46, '#ffffff'], [92, 'rgba(0,0,0,0.28)']].forEach(([o, c]) => {
        ctx.beginPath();
        ctx.moveTo(W - 250 + o, 0); ctx.lineTo(W - 222 + o, 0); ctx.lineTo(W - 362 + o, 230); ctx.lineTo(W - 390 + o, 230); ctx.closePath();
        ctx.fillStyle = c; ctx.fill();
      });
    } else if (look === 'draft') {
      // A three-point line running off the right edge.
      ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 26;
      ctx.beginPath(); ctx.arc(W + 40, H * 0.55, 560, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke(); ctx.restore();
    } else {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 54) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = L.b; ctx.fillRect(0, 0, W, 14);
    }
  }

  // Returns the y where the template's content starts.
  function header(ctx, L, f, wordmark) {
    const top = M + 4;
    if (wordmark) { const h = 40; ctx.drawImage(wordmark, M, top, wordmark.naturalWidth * h / wordmark.naturalHeight, h); }
    else { ctx.fillStyle = L.text; ctx.font = `italic 800 40px ${FONT.head}`; ctx.textBaseline = 'top'; ctx.fillText('BYTHERIM', M, top); }
    ctx.textBaseline = 'alphabetic';
    if (f.note) {
      ctx.fillStyle = L.muted; ctx.font = `500 24px ${FONT.body}`; ctx.textAlign = 'right';
      ctx.fillText(fit(ctx, f.note, 430), W - M, top + 30); ctx.textAlign = 'left';
    }
    let y = top + 112;
    if (f.kicker) {
      ctx.fillStyle = L.b; ctx.font = `500 26px ${FONT.disp}`;
      spaced(ctx, String(f.kicker).toUpperCase(), M, y, 3);
      y += 22;
    }
    if (f.title) {
      const t = sized(ctx, String(f.title).toUpperCase(), s => `italic 800 ${s}px ${FONT.head}`, 76, 44, W - M * 2);
      y += t.size * 0.98;
      ctx.fillStyle = L.text; ctx.fillText(t.text, M - 2, y);
      // A short underline in the look's main color.
      ctx.fillStyle = L.a; ctx.fillRect(M, y + 18, 84, 6);
      y += 50;
    } else y += 16;
    return y;
  }
  function footer(ctx, L, H) {
    ctx.fillStyle = L.line; ctx.fillRect(M, H - 86, W - M * 2, 2);
    ctx.font = `600 24px ${FONT.disp}`; ctx.fillStyle = L.text;
    spaced(ctx, L.foot, M, H - 42, 2);
    ctx.fillStyle = L.muted; ctx.font = `500 24px ${FONT.body}`; ctx.textAlign = 'right';
    ctx.fillText('@bytherimhoops', W - M, H - 42); ctx.textAlign = 'left';
    return H - 112; // content stops here
  }

  // ------------------------------------------------------------ templates
  async function statline(ctx, L, g, H, top, bottom) {
    const f = g.f;
    const [photo, logo] = await Promise.all([loadImg(f.photo), loadImg(logoSrc(g.look, f.team))]);
    const x = M, w = W - M * 2;
    // Everything under the photo has a set height, so the photo panel
    // takes whatever room is left (more room for a cutout in Canva).
    const stats = (f.stats || []).filter(s => s && (s.label || s.value));
    const cols = stats.length <= 5 ? stats.length : 3, rows = stats.length ? Math.ceil(stats.length / cols) : 0, gap = 14;
    const th = H > 1500 ? 200 : H > 1200 ? 164 : 132;
    ctx.font = `500 32px ${FONT.body}`;
    const blurbLines = f.blurb ? wrap(ctx, f.blurb, w, 3).length : 0;
    const below = 26 + (f.line ? 50 : 0) + rows * (th + gap) + (rows ? 4 : 0) + (f.shooting ? 96 : 0) + (blurbLines ? blurbLines * 42 + 12 : 0);
    const ph = Math.round(Math.max(H * 0.26, Math.min(H * 0.62, bottom - top - below)));
    // Photo panel. With no photo it stays an empty, lit panel: room to
    // drop a cutout in Canva.
    ctx.save(); shape(ctx, L, x, top, w, ph); ctx.clip();
    ctx.fillStyle = L.card; ctx.fillRect(x, top, w, ph);
    if (photo) {
      const s = Math.max(w / photo.naturalWidth, ph / photo.naturalHeight);
      const iw = photo.naturalWidth * s, ih = photo.naturalHeight * s;
      ctx.drawImage(photo, x + (w - iw) / 2, top - (ih - ph) * 0.18, iw, ih);
    }
    // A solid strip of the main color under the name.
    ctx.fillStyle = L.a; ctx.fillRect(x, top + ph - 128, w, 128);
    ctx.restore();
    shape(ctx, L, x, top, w, ph); ctx.strokeStyle = L.line; ctx.lineWidth = 1.5; ctx.stroke();
    if (logo || f.team) logoOrBadge(ctx, L, logo, f.team, x + w - 74, top + 74, 104);
    // Name and info over the bottom of the panel.
    const name = sized(ctx, String(f.player || '').toUpperCase(), s => `italic 800 ${s}px ${FONT.head}`, 80, 44, w - 64);
    // Dark text on a light strip (NCAA's sky blue), white on the rest.
    const n = parseInt(L.a.slice(1), 16), lightStrip = ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
    ctx.fillStyle = lightStrip ? '#071226' : '#fff'; ctx.fillText(name.text, x + 30, top + ph - 70);
    ctx.fillStyle = lightStrip ? 'rgba(7,18,38,0.8)' : 'rgba(255,255,255,0.88)'; ctx.font = `500 28px ${FONT.disp}`;
    spaced(ctx, fit(ctx, [f.team, f.info].filter(Boolean).join('  ·  ').toUpperCase(), w - 80), x + 32, top + ph - 28, 2);

    let y = top + ph + 26;
    if (f.line) {
      ctx.fillStyle = L.muted; ctx.font = `500 30px ${FONT.body}`;
      ctx.fillText(fit(ctx, f.line, w), x, y + 24); y += 50;
    }
    // Stat tiles: up to five in a row, a sixth starts a second row.
    if (stats.length) {
      const tw = (w - gap * (cols - 1)) / cols;
      stats.forEach((s, i) => {
        const c = i % cols, r = Math.floor(i / cols), tx = x + c * (tw + gap), ty = y + r * (th + gap);
        card(ctx, L, tx, ty, tw, th, i === 0 ? L.a : null);
        ctx.textAlign = 'center';
        const v = sized(ctx, String(s.value || ''), z => `600 ${z}px ${FONT.disp}`, Math.round(th * 0.5), 30, tw - 24);
        ctx.fillStyle = i === 0 ? L.a : L.text; ctx.fillText(v.text, tx + tw / 2, ty + th * 0.6);
        ctx.fillStyle = L.muted; ctx.font = `500 ${Math.round(Math.max(18, th * 0.15))}px ${FONT.disp}`;
        spaced(ctx, fit(ctx, String(s.label || '').toUpperCase(), tw - 20), tx + tw / 2, ty + th * 0.86, 2, 'center');
        ctx.textAlign = 'left';
      });
      y += rows * (th + gap) + 4;
    }
    if (f.shooting && y + 70 <= bottom) {
      card(ctx, L, x, y, w, 70);
      ctx.fillStyle = L.text; ctx.font = `500 32px ${FONT.disp}`; ctx.textAlign = 'center';
      ctx.fillText(fit(ctx, String(f.shooting).toUpperCase(), w - 40), x + w / 2, y + 46); ctx.textAlign = 'left';
      y += 96;
    }
    if (f.blurb && y + 40 <= bottom) {
      ctx.fillStyle = L.text; ctx.font = `500 32px ${FONT.body}`;
      const lines = wrap(ctx, f.blurb, w, Math.max(1, Math.min(3, Math.floor((bottom - y) / 42))));
      lines.forEach((l, i) => ctx.fillText(l, x, y + 30 + i * 42));
    }
  }

  async function awards(ctx, L, g, H, top, bottom) {
    const rows = (g.f.rows || []).filter(r => r && (r.player || r.award)).slice(0, 6);
    if (!rows.length) return;
    const logos = await Promise.all(rows.map(r => loadImg(logoSrc(g.look, r.team))));
    const gap = 14, x = M, w = W - M * 2;
    const rh = Math.min(H > 1500 ? 250 : 200, (bottom - top - gap * (rows.length - 1)) / rows.length);
    const k = rh / 180;
    rows.forEach((r, i) => {
      const y = top + i * (rh + gap);
      card(ctx, L, x, y, w, rh, L.a);
      const ls = rh * 0.6, lx = x + w - 28 - ls / 2;
      logoOrBadge(ctx, L, logos[i], r.team, lx, y + rh / 2, ls);
      const tx = x + 40, tw = lx - ls / 2 - 24 - tx;
      ctx.fillStyle = L.b; ctx.font = `500 ${Math.round(Math.max(17, 24 * k))}px ${FONT.disp}`;
      spaced(ctx, fit(ctx, String(r.award || '').toUpperCase(), tw), tx, y + rh * 0.27, 2.5);
      const n = sized(ctx, String(r.player || '').toUpperCase(), s => `600 ${s}px ${FONT.disp}`, Math.round(58 * k), 24, tw);
      ctx.fillStyle = L.text; ctx.fillText(n.text, tx, y + rh * 0.27 + n.size * 1.05);
      ctx.fillStyle = L.muted; ctx.font = `500 ${Math.round(Math.max(17, 27 * k))}px ${FONT.body}`;
      ctx.fillText(fit(ctx, [r.team, r.detail].filter(Boolean).join('  ·  '), tw), tx, y + rh * 0.86);
    });
  }

  async function leaders(ctx, L, g, H, top, bottom) {
    const f = g.f;
    const rows = (f.rows || []).filter(r => r && r.player).slice(0, 10);
    if (!rows.length) return;
    const logos = await Promise.all(rows.map(r => loadImg(logoSrc(g.look, r.team))));
    const gap = rows.length > 6 ? 10 : 14, x = M, w = W - M * 2;
    const rh = Math.min(H > 1500 ? 170 : 150, (bottom - top - gap * (rows.length - 1)) / rows.length);
    const k = rh / 120;
    rows.forEach((r, i) => {
      const y = top + i * (rh + gap), mid = y + rh / 2;
      card(ctx, L, x, y, w, rh, i === 0 ? L.b : L.a);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.fillStyle = i === 0 ? L.b : L.text; ctx.font = `600 ${Math.round(46 * k)}px ${FONT.disp}`;
      ctx.fillText(String(i + 1), x + 52, mid + 2);
      const ls = rh * 0.62;
      logoOrBadge(ctx, L, logos[i], r.team, x + 104 + ls / 2, mid, ls);
      // Value on the right, label under it.
      const vx = x + w - 30;
      ctx.textAlign = 'right';
      const v = sized(ctx, String(r.value || ''), s => `600 ${s}px ${FONT.disp}`, Math.round(58 * k), 26, 260);
      ctx.fillStyle = i === 0 ? L.b : L.a;
      const hasLabel = f.valueLabel && rh >= 70;
      ctx.fillText(v.text, vx, hasLabel ? mid - 8 * k : mid + 2);
      const vw = Math.max(ctx.measureText(v.text).width, 60);
      if (hasLabel) {
        ctx.fillStyle = L.muted; ctx.font = `500 ${Math.round(Math.max(15, 19 * k))}px ${FONT.disp}`;
        spaced(ctx, String(f.valueLabel).toUpperCase(), vx, mid + 30 * k, 2, 'right');
      }
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      const tx = x + 104 + ls + 22, tw = vx - vw - 30 - tx;
      const n = sized(ctx, String(r.player).toUpperCase(), s => `600 ${s}px ${FONT.disp}`, Math.round(38 * k), 18, tw);
      ctx.fillStyle = L.text; ctx.fillText(n.text, tx, mid - 2 * k);
      ctx.fillStyle = L.muted; ctx.font = `500 ${Math.round(Math.max(15, 24 * k))}px ${FONT.body}`;
      ctx.fillText(fit(ctx, [r.team, r.detail].filter(Boolean).join('  ·  '), tw), tx, mid + 30 * k);
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
    const [wordmark] = await Promise.all([loadImg(opts.wordmark || 'assets/logo-header.png'), fontsReady()]);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // A frame is a solid border; the graphic is drawn a little smaller
    // inside it so nothing gets covered.
    if (L.frame) {
      const F = 40, k = (W - F * 2) / W;
      ctx.fillStyle = L.frame; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath(); ctx.rect(F, F, W - F * 2, H - F * 2); ctx.clip();
      ctx.fillStyle = L.bg; ctx.fillRect(F, F, W - F * 2, H - F * 2);
      ctx.translate(F, (H - H * k) / 2); ctx.scale(k, k);
    }
    background(ctx, L, g.look, H);
    const top = header(ctx, L, g.f || {}, wordmark);
    const bottom = footer(ctx, L, H);
    await (TEMPLATES[g.tpl] || statline)(ctx, L, { ...g, f: g.f || {} }, H, top, bottom);
    if (L.frame) ctx.restore();
    return canvas;
  }

  root.GraphicsDraw = { draw, LOOKS, SIZES, SWATCHES, FRAMES, NBA_TEAMS, nbaTeam, logoSrc, W };
})(typeof window !== 'undefined' ? window : globalThis);
