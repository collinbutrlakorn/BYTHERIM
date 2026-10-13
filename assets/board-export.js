/* ============================================================
   BYTHERIM — big board image export (admins only).

   Draws the ranked board as a PNG for X and Instagram: top 10, 20, 30
   or 60, either as one 1080x1350 image or as slides of ten for an
   Instagram carousel. Loaded by draft.html only when an admin presses
   "Export image"; nothing here runs for anyone else.

   Everything is drawn on a canvas, so the image doesn't depend on the
   page's layout. Player photos come from other sites; one that can't be
   loaded with permission to export falls back to the player's initials
   rather than breaking the image.
   ============================================================ */
(function (root) {
  'use strict';
  const W = 1080, H = 1350, M = 56;
  const C = { night: '#06070a', surface: 'rgba(255,255,255,0.045)', line: 'rgba(255,255,255,0.10)', text: '#f4f5f7', muted: '#9aa3b2',
    purple: '#964282', lilac: '#c86fb4', gold: '#e3bb4f', up: '#4ade80', down: '#f87171' };
  const FONT = { head: '"Exo 2", "Oswald", sans-serif', disp: '"Oswald", sans-serif', body: '"Asap Condensed", sans-serif' };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLASS_LABEL = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior', INTL: 'International' };

  // ------------------------------------------------------------ assets
  const imgCache = new Map();
  function loadImg(src, cors) {
    if (!src) return Promise.resolve(null);
    if (imgCache.has(src)) return imgCache.get(src);
    const once = url => new Promise(res => {
      const im = new Image();
      if (cors) im.crossOrigin = 'anonymous';
      const timer = setTimeout(() => res(null), 8000);
      im.onload = () => { clearTimeout(timer); res(im.naturalWidth ? im : null); };
      im.onerror = () => { clearTimeout(timer); res(null); };
      im.src = url;
    });
    // The board already showed these photos without asking for export
    // permission, and a browser may answer from that cached copy, so a
    // failed first try is retried as a fresh request.
    // Some school sites don't let other sites draw their photos into an
    // image (and some block outside requests entirely), so a photo that
    // fails directly is fetched again through wsrv.nl, a free image proxy
    // that allows it. That also sidesteps a browser's cached copy.
    const viaProxy = u => `https://wsrv.nl/?url=${encodeURIComponent(u)}&w=320&output=png`;
    const p = once(src).then(im => im || (cors ? once(viaProxy(src)) : null));
    imgCache.set(src, p);
    return p;
  }
  function fontsReady() {
    if (!document.querySelector('link[data-exo2]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.dataset.exo2 = '1';
      l.href = 'https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@1,800&display=swap';
      document.head.appendChild(l);
    }
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const want = ['italic 800 70px "Exo 2"', '600 40px Oswald', '500 40px Oswald', '500 22px "Asap Condensed"', '700 22px "Asap Condensed"'];
    return Promise.race([
      new Promise(r => setTimeout(r, 3500)),
      new Promise(r => setTimeout(r, 150)).then(() => Promise.all(want.map(f => document.fonts.load(f).catch(() => null))))
    ]);
  }

  // ------------------------------------------------------------ drawing helpers
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function fit(ctx, text, max) {
    text = String(text || '');
    if (ctx.measureText(text).width <= max) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text.trimEnd() + '…';
  }
  function spaced(ctx, text, x, y, spacing, align = 'left') {
    const chars = [...String(text)];
    const width = chars.reduce((s, ch) => s + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);
    let cx = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
    const prev = ctx.textAlign; ctx.textAlign = 'left';
    chars.forEach(ch => { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; });
    ctx.textAlign = prev;
    return width;
  }
  function initials(name) {
    const w = String(name || '?').split(/\s+/).filter(Boolean);
    return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
  }

  function background(ctx) {
    ctx.fillStyle = C.night; ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(W * 0.95, -60, 40, W * 0.95, -60, 820);
    g.addColorStop(0, 'rgba(150,66,130,0.55)'); g.addColorStop(1, 'rgba(150,66,130,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(-80, H + 80, 40, -80, H + 80, 700);
    g.addColorStop(0, 'rgba(227,187,79,0.12)'); g.addColorStop(1, 'rgba(227,187,79,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Faint court lines: a three-point arc in the corner.
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(W + 40, H * 0.55, 520, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
    ctx.restore();
  }

  function header(ctx, o, logo) {
    if (logo) { const h = 40, w = logo.naturalWidth * h / logo.naturalHeight; ctx.drawImage(logo, M, M, w, h); }
    else { ctx.fillStyle = C.text; ctx.font = `italic 800 40px ${FONT.head}`; ctx.textBaseline = 'top'; ctx.fillText('BYTHERIM', M, M); }
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.muted; ctx.font = `500 22px ${FONT.body}`;
    ctx.textAlign = 'right';
    ctx.fillText(fit(ctx, o.note || `Updated ${o.date}`, 420), W - M, M + 30);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.gold; ctx.font = `500 26px ${FONT.disp}`;
    spaced(ctx, o.eyebrow.toUpperCase(), M, 168, 3);
    ctx.fillStyle = C.text; ctx.font = `italic 800 74px ${FONT.head}`;
    ctx.fillText(fit(ctx, o.title.toUpperCase(), W - M * 2 - (o.page ? 150 : 0)), M - 2, 244);
    if (o.page) {
      ctx.fillStyle = C.lilac; ctx.font = `600 30px ${FONT.disp}`; ctx.textAlign = 'right';
      ctx.fillText(o.page, W - M, 240); ctx.textAlign = 'left';
    }
  }

  function footer(ctx) {
    ctx.fillStyle = C.line; ctx.fillRect(M, H - 86, W - M * 2, 2);
    ctx.font = `600 24px ${FONT.disp}`; ctx.fillStyle = C.text;
    spaced(ctx, 'BYTHERIM.COM/DRAFT', M, H - 42, 2);
    ctx.fillStyle = C.muted; ctx.font = `500 24px ${FONT.body}`; ctx.textAlign = 'right';
    ctx.fillText('@bytherimhoops', W - M, H - 42); ctx.textAlign = 'left';
  }

  function moveOf(p, o) {
    if (!o.movement || p.rank == null) return null;
    if (p.prevRank == null) return { text: 'NEW', color: C.gold };
    const d = p.prevRank - p.rank;
    if (!d) return null;
    return { text: `${d > 0 ? '▲' : '▼'}${Math.abs(d)}`, color: d > 0 ? C.up : C.down };
  }
  function subline(p, o, compact) {
    const d = p.draft;
    const drafted = o.past && d ? (d.pick != null ? `Drafted #${d.pick}${d.team ? ' ' + d.team.abbr : ''}` : d.status) : '';
    const parts = compact
      ? [p.pos, p.isPro ? 'Pro' : p.school, drafted]
      : [p.pos, CLASS_LABEL[p.cls] || p.cls, p.isPro ? 'Professional' : p.school, drafted];
    return parts.filter(Boolean).join(' · ');
  }

  function row(ctx, p, x, y, w, h, o, imgs) {
    const k = h / 96, compact = w < 420;
    rr(ctx, x, y, w, h, 12 * k); ctx.fillStyle = C.surface; ctx.fill();
    // Tier stripe, clipped to the row's rounded corners.
    ctx.save(); rr(ctx, x, y, w, h, 12 * k); ctx.clip();
    ctx.fillStyle = o.tierColor(p.tier); ctx.fillRect(x, y, Math.max(5, 7 * k), h);
    ctx.restore();

    const mid = y + h / 2;
    let cx = x + Math.max(5, 7 * k);
    const rankW = (compact ? 50 : 76) * k + (o.wideRank ? 4 : 0);
    ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round((compact ? 34 : 42) * k)}px ${FONT.disp}`;
    ctx.fillText(String(p.rank), cx + rankW / 2, mid + 2 * k);
    cx += rankW;

    const d = h * 0.74, r = d / 2, px = cx + r, py = mid;
    ctx.save(); ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = '#1b1f2b'; ctx.fill(); ctx.clip();
    const photo = imgs.photo.get(p.id);
    if (photo) {
      const s = Math.max(d / photo.naturalWidth, d / photo.naturalHeight) * 1.08;
      const iw = photo.naturalWidth * s, ih = photo.naturalHeight * s;
      ctx.drawImage(photo, px - iw / 2, py - r - (ih - d) * 0.12, iw, ih);
    } else {
      ctx.fillStyle = C.purple; ctx.fillRect(px - r, py - r, d, d);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(d * 0.36)}px ${FONT.disp}`; ctx.fillText(initials(p.name), px, py + 1);
    }
    ctx.restore();
    ctx.strokeStyle = o.tierColor(p.tier); ctx.globalAlpha = 0.7; ctx.lineWidth = Math.max(1.5, 2.5 * k);
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    cx += d + 16 * k;

    // Right side: movement, then the school logo.
    let right = x + w - 14 * k;
    const logo = imgs.logo.get(p.school + '|' + p.isPro);
    const ls = h * (compact ? 0.46 : 0.52);
    if (logo) {
      const s = Math.min(ls / logo.naturalWidth, ls / logo.naturalHeight);
      ctx.drawImage(logo, right - logo.naturalWidth * s, mid - logo.naturalHeight * s / 2, logo.naturalWidth * s, logo.naturalHeight * s);
      right -= ls + 12 * k;
    }
    const mv = moveOf(p, o);
    if (mv) {
      ctx.font = `600 ${Math.round((compact ? 19 : 22) * k)}px ${FONT.disp}`;
      ctx.fillStyle = mv.color; ctx.textAlign = 'right';
      ctx.fillText(mv.text, right, mid + 1);
      right -= ctx.measureText(mv.text).width + 12 * k;
    }

    const textW = right - cx;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // Small rows keep their text readable on a phone: a floor on both sizes.
    const nameSize = Math.round(Math.max(compact ? 17 : 18, (compact ? 25 : 32) * k));
    const subSize = Math.round(Math.max(compact ? 13.5 : 14, (compact ? 19 : 22) * k));
    ctx.fillStyle = C.text; ctx.font = `600 ${nameSize}px ${FONT.disp}`;
    ctx.fillText(fit(ctx, p.name.toUpperCase(), textW), cx, mid - Math.max(1, k));
    ctx.fillStyle = C.muted; ctx.font = `500 ${subSize}px ${FONT.body}`;
    ctx.fillText(fit(ctx, subline(p, o, compact), textW), cx, mid + subSize + Math.max(3, 6 * k));
  }

  function layout(n) {
    // A top 10 uses the top 20's row size in the left column, leaving
    // the right half open for a featured photo added afterwards.
    if (n <= 10) return { cols: 2, gap: 12, per: 10, fill: 1 };
    if (n <= 30) return { cols: 2, gap: n <= 20 ? 12 : 9 };
    return { cols: 3, gap: 7 };
  }

  async function draw(canvas, list, o) {
    const ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    const [logo] = await Promise.all([loadImg('assets/logo-header.png', false), fontsReady()]);
    const imgs = { photo: new Map(), logo: new Map() };
    await Promise.all(list.map(async p => {
      if (/^https?:\/\//i.test(p.image || '')) imgs.photo.set(p.id, await loadImg(p.image, true));
      const key = p.school + '|' + p.isPro;
      if (!imgs.logo.has(key)) imgs.logo.set(key, null);
      const lg = await loadImg(o.logoFor(p), false);
      if (lg) imgs.logo.set(key, lg);
    }));
    background(ctx);
    header(ctx, o, logo);
    footer(ctx);
    const top = 286, bottom = H - 112;
    const L = layout(list.length);
    const { cols, gap } = L;
    const per = L.per || Math.ceil(list.length / cols);
    const colGap = cols > 1 ? 18 : 0;
    const cw = (W - M * 2 - colGap * (cols - 1)) / cols;
    const rh = Math.min(98, (bottom - top - gap * (per - 1)) / per);
    const ro = { ...o, wideRank: list.some(p => p.rank >= 10) };
    list.forEach((p, i) => {
      const c = Math.floor(i / per), r = i % per;
      row(ctx, p, M + c * (cw + colGap), top + r * (rh + gap), cw, rh, ro, imgs);
    });
    return canvas;
  }

  // ------------------------------------------------------------ dialog
  const Export = {
    opts: null, count: 10, mode: 'single', movement: true, note: '', canvases: [],

    open(opts) {
      this.opts = opts;
      this.ranked = opts.rows.filter(p => p.rank != null).sort((a, b) => a.rank - b.rank);
      this.count = Math.min(this.count, this.ranked.length) || 10;
      this.movement = !!opts.hasPrev;
      let dlg = document.getElementById('exportDialog');
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.id = 'exportDialog';
        dlg.className = 'export-dialog';
        document.body.appendChild(dlg);
        dlg.addEventListener('click', e => this.onClick(e));
        dlg.addEventListener('change', e => this.onChange(e));
        dlg.addEventListener('input', e => { if (e.target.name === 'note') { this.note = e.target.value; clearTimeout(this.t); this.t = setTimeout(() => this.preview(), 400); } });
        dlg.addEventListener('close', () => { this.canvases = []; });
      }
      this.dlg = dlg;
      this.renderForm();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      this.preview();
    },

    sizes() {
      const n = this.ranked.length;
      const out = [10, 20, 30, 60].filter(x => x <= n);
      if (n < 60 && !out.includes(n)) out.push(n);
      return out;
    },

    renderForm() {
      const sizes = this.sizes();
      const label = n => (n === this.ranked.length && ![10, 20, 30, 60].includes(n) ? `All ${n}` : `Top ${n}`);
      this.dlg.innerHTML = `
        <form method="dialog" class="export-card">
          <div class="export-head">
            <div><h2>Export the board</h2><p>${esc(this.opts.eyebrow)} · 1080×1350, sized for X and Instagram</p></div>
            <button class="export-x" value="close" aria-label="Close">×</button>
          </div>
          <div class="export-controls">
            <div class="export-group"><span>Prospects</span><div class="chip-group">${sizes.map(n => `<button type="button" class="chip${n === this.count ? ' active' : ''}" data-count="${n}">${label(n)}</button>`).join('')}</div></div>
            <div class="export-group"><span>Format</span><div class="chip-group">
              <button type="button" class="chip${this.mode === 'single' ? ' active' : ''}" data-mode="single">One image</button>
              <button type="button" class="chip${this.mode === 'slides' ? ' active' : ''}" data-mode="slides"${this.count <= 10 ? ' disabled' : ''}>Slides of 10</button>
            </div></div>
            <label class="export-group export-note"><span>Corner note</span><input name="note" type="text" maxlength="40" placeholder="Updated ${esc(this.opts.date)}" value="${esc(this.note)}"></label>
            ${this.opts.hasPrev ? `<label class="export-check"><input type="checkbox" name="movement"${this.movement ? ' checked' : ''}> Show movement since the last update</label>` : ''}
          </div>
          <div class="export-preview" id="exportPreview"><p class="export-wait">Drawing…</p></div>
          <div class="export-actions">
            <span class="export-msg" id="exportMsg"></span>
            <button type="button" class="btn btn-ghost btn-sm" data-act="share" hidden>Share</button>
            <button type="button" class="btn btn-primary btn-sm" data-act="download">Download</button>
          </div>
        </form>`;
    },

    onClick(e) {
      if (e.target === this.dlg) return this.dlg.close();
      const c = e.target.closest('[data-count]');
      if (c) { this.count = +c.dataset.count; if (this.count <= 10) this.mode = 'single'; this.renderForm(); return this.preview(); }
      const m = e.target.closest('[data-mode]');
      if (m && !m.disabled) { this.mode = m.dataset.mode; this.renderForm(); return this.preview(); }
      const a = e.target.closest('[data-act]');
      if (a && a.dataset.act === 'download') return this.download();
      if (a && a.dataset.act === 'share') return this.share();
    },
    onChange(e) {
      if (e.target.name === 'movement') { this.movement = e.target.checked; this.preview(); }
    },

    pages() {
      const list = this.ranked.slice(0, this.count);
      if (this.mode !== 'slides') return [list];
      const out = [];
      for (let i = 0; i < list.length; i += 10) out.push(list.slice(i, i + 10));
      return out;
    },

    async preview() {
      const token = (this.token = (this.token || 0) + 1);
      const box = this.dlg.querySelector('#exportPreview');
      const pages = this.pages();
      const o = this.opts;
      const base = {
        eyebrow: o.eyebrow, date: o.date, note: this.note.trim(), past: o.past, movement: this.movement,
        tierColor: o.tierColor, logoFor: o.logoFor
      };
      const total = this.count;
      const canvases = await Promise.all(pages.map(list => draw(document.createElement('canvas'), list, {
        ...base,
        title: pages.length > 1 ? `Top ${total}` : `Top ${total} Prospects`,
        page: pages.length > 1 ? `${list[0].rank}–${list[list.length - 1].rank}` : ''
      })));
      if (token !== this.token || !box.isConnected) return;
      this.canvases = canvases;
      box.className = 'export-preview' + (canvases.length > 1 ? ' many' : '');
      box.innerHTML = '';
      canvases.forEach((cv, i) => {
        const fig = document.createElement('figure');
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', `Board image ${i + 1}`);
        fig.appendChild(cv);
        if (canvases.length > 1) { const cap = document.createElement('figcaption'); cap.textContent = `${i + 1} of ${canvases.length}`; fig.appendChild(cap); }
        box.appendChild(fig);
      });
      const shareBtn = this.dlg.querySelector('[data-act="share"]');
      if (shareBtn) shareBtn.hidden = !(navigator.canShare && navigator.share);
      this.say(canvases.length > 1 ? `${canvases.length} images. Instagram fits up to 20 in a carousel; X takes 4 per post.` : '');
    },

    say(t) { const m = this.dlg.querySelector('#exportMsg'); if (m) m.textContent = t; },

    filename(i) {
      const n = this.canvases.length;
      return `bytherim-${this.opts.year}-big-board-top-${this.count}${n > 1 ? `-${i + 1}` : ''}.png`;
    },
    blobs() {
      return Promise.all(this.canvases.map(cv => new Promise((res, rej) => {
        try { cv.toBlob(b => (b ? res(b) : rej(new Error('empty'))), 'image/png'); } catch (e) { rej(e); }
      })));
    },
    async download() {
      try {
        const blobs = await this.blobs();
        for (let i = 0; i < blobs.length; i++) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blobs[i]);
          a.download = this.filename(i);
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          if (i < blobs.length - 1) await new Promise(r => setTimeout(r, 350));
        }
        if (root.BTR && BTR.track) BTR.track('board_export');
        this.say(blobs.length > 1 ? `Downloaded ${blobs.length} images. If only one arrived, allow multiple downloads for this site.` : 'Downloaded.');
      } catch (e) {
        console.error('Board export:', e);
        this.say('The image couldn\'t be saved. Try again in a moment.');
      }
    },
    async share() {
      try {
        const blobs = await this.blobs();
        const files = blobs.map((b, i) => new File([b], this.filename(i), { type: 'image/png' }));
        if (navigator.canShare && !navigator.canShare({ files })) return this.download();
        await navigator.share({ files, title: `${this.opts.eyebrow} · Top ${this.count}` });
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        this.download();
      }
    }
  };

  Export.draw = draw;
  root.BoardExport = Export;
})(window);
