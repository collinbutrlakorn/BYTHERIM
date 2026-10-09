// "Rate the sim": a small dialog opened from the quiet footer link on the
// RP pages. Loaded the first time someone asks for it. Ratings go to the
// database (Cloud.sendRating) and show on the admin page.
(function (root) {
  // Pages without accounts (the guide) don't load the database scripts,
  // so fetch them the first time a rating is sent from one.
  const src = document.currentScript ? document.currentScript.src.replace(/assets\/rate\.js.*$/, '') : '';
  const load = url => new Promise((ok, fail) => { const sc = document.createElement('script'); sc.src = url; sc.onload = ok; sc.onerror = fail; document.head.appendChild(sc); });
  async function cloud() {
    if (!root.Cloud) { await load(src + 'rp/js/cloud-config.js'); await load(src + 'rp/js/cloud.js'); }
    if (!root.Cloud.db) await root.Cloud.init();
    return root.Cloud;
  }
  const CSS = `
.rate-scrim { position: fixed; inset: 0; z-index: 9000; background: rgba(4,6,12,.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
.rate-panel { width: min(420px, 100%); background: var(--surface, #0f1117); color: var(--text, #f4f6fb); border: 1px solid var(--border, #2a2f3a); border-radius: 14px; padding: 20px; box-shadow: 0 16px 40px rgba(0,0,0,.4); font: 15px/1.45 system-ui, sans-serif; }
.rate-panel h2 { margin: 0 0 4px; font-size: 1.15rem; }
.rate-panel p { margin: 0 0 12px; color: var(--muted, #9aa3b2); font-size: .92rem; }
.rate-stars { display: flex; gap: 6px; margin-bottom: 12px; }
.rate-stars button { font-size: 1.9rem; line-height: 1; background: none; border: 0; padding: 2px; cursor: pointer; color: var(--border, #3a404d); }
.rate-stars button.on { color: #facc15; }
.rate-panel textarea { width: 100%; box-sizing: border-box; min-height: 84px; resize: vertical; font: inherit; color: inherit; background: transparent; border: 1px solid var(--border, #2a2f3a); border-radius: 10px; padding: 10px; }
.rate-row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; align-items: center; }
.rate-row .rate-status { margin-right: auto; font-size: .85rem; color: var(--muted, #9aa3b2); }
.rate-row button { font: inherit; font-weight: 600; border-radius: 999px; padding: 8px 16px; cursor: pointer; border: 1px solid var(--border, #2a2f3a); background: none; color: inherit; }
.rate-row button.primary { background: var(--accent, #4aa8ff); color: #04121f; border-color: transparent; }
.rate-row button:disabled { opacity: .45; cursor: default; }`;
  const LABEL = ['', 'Not for me', 'It needs work', 'Decent', 'Good', 'Great'];

  function open() {
    if (document.querySelector('.rate-scrim')) return;
    if (!document.getElementById('rateStyles')) {
      const st = document.createElement('style'); st.id = 'rateStyles'; st.textContent = CSS; document.head.appendChild(st);
    }
    const wrap = document.createElement('div');
    wrap.className = 'rate-scrim';
    wrap.innerHTML = `<div class="rate-panel" role="dialog" aria-modal="true" aria-labelledby="rateTitle">
      <h2 id="rateTitle">How's the sim?</h2>
      <p>Honest feedback helps. Stars are private, and the note is only read by Collin.</p>
      <div class="rate-stars" role="radiogroup" aria-label="Your rating">
        ${[1, 2, 3, 4, 5].map(i => `<button type="button" role="radio" aria-checked="false" aria-label="${i} star${i > 1 ? 's' : ''}: ${LABEL[i]}" data-s="${i}">★</button>`).join('')}
      </div>
      <textarea maxlength="500" placeholder="Anything you want to say? (optional)"></textarea>
      <div class="rate-row"><span class="rate-status" aria-live="polite"></span>
        <button type="button" data-act="cancel">Close</button>
        <button type="button" class="primary" data-act="send" disabled>Send</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const panel = wrap.querySelector('.rate-panel');
    const stars = wrap.querySelectorAll('.rate-stars button');
    const send = panel.querySelector('[data-act="send"]');
    const status = panel.querySelector('.rate-status');
    const text = panel.querySelector('textarea');
    let picked = 0;
    const paint = () => stars.forEach(b => { const on = +b.dataset.s <= picked; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(+b.dataset.s === picked)); });
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    stars.forEach(b => b.addEventListener('click', () => { picked = +b.dataset.s; paint(); send.disabled = false; status.textContent = LABEL[picked]; }));
    panel.querySelector('[data-act="cancel"]').addEventListener('click', close);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    send.addEventListener('click', async () => {
      send.disabled = true; status.textContent = 'Sending…';
      try {
        const C = await cloud().catch(() => null);
        if (!C || !C.enabled) throw new Error('Ratings aren\'t available right now.');
        await C.sendRating({ stars: picked, note: text.value });
        panel.innerHTML = `<h2>Thanks!</h2><p>Your rating is in. It means a lot.</p><div class="rate-row"><button type="button" class="primary" data-act="done">Done</button></div>`;
        panel.querySelector('[data-act="done"]').addEventListener('click', close);
        setTimeout(close, 2500);
      } catch (e) {
        status.textContent = (e && e.message) || 'Couldn\'t send that. Try again.';
        send.disabled = false;
      }
    });
    stars[0].focus();
  }

  root.BTRRate = { open };
})(typeof window !== 'undefined' ? window : globalThis);
