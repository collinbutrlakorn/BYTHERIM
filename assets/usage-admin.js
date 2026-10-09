// The admin page's usage report (admin.html#usage): how many people use the
// site and what they do, from the daily totals the site counts (see
// Cloud.countPage in rp/js/cloud.js). Admins only.
(function (root) {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PAGE_NAMES = { home: 'Home', big_board: 'Big Board', podcast: 'Podcast', nba: 'NBA', about: 'About', rp_hub: 'RP Hub', rp_guide: 'How the RP works',
    ncaa_rp: 'NCAA RP', draft_rp: 'Draft RP', recruiting: 'Recruiting', privacy: 'Privacy', terms: 'Terms', admin: 'Admin' };
  const EVENT_NAMES = {
    rp_new_save: 'New NCAA RP saves started', rp_sim_week: 'Weeks simulated', rp_season_done: 'Seasons finished', rp_game_watched: 'Games watched live',
    rp_summer_step: 'Summer steps played', rp_summer_rest: 'Summers played to the end', rp_cloud_save: 'Saves to an account', draft_rp_step: 'Draft RP steps run',
    draft_rp_board_add: 'Players added to Draft RP boards', recruit_profile: 'Recruit profiles opened', board_prospect: 'Big Board prospects opened',
    sign_in: 'Sign-ins', tutorial_done: 'Tutorials finished', tutorial_skipped: 'Tutorials skipped', guide_open: 'Detailed guide opened'
  };
  const nice = (k, names) => names[k] || k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  const n = v => Number(v) || 0;
  const fmt = v => n(v).toLocaleString();

  const UsageAdmin = {
    days: 30,
    data: null,
    async load(el) {
      el.innerHTML = '<p class="adm-empty">Loading usage…</p>';
      try { this.ratings = await root.Cloud.ratings().catch(() => null); this.data = await root.Cloud.usage(this.days); }
      catch (e) { el.innerHTML = `<p class="adm-empty">Couldn't read usage: ${esc(/permission|insufficient/i.test(String(e && (e.code || e.message))) ? 'the database rules need updating (paste firestore.rules into the Firebase console).' : (e.message || e))}</p>`; return; }
      this.render(el);
    },
    setDays(d, btn) { this.days = d; this.load(btn.closest('#usageBody')); },
    sum(list, key) { return list.reduce((t, d) => t + n(d[key]), 0); },
    merge(list, key) { const m = {}; list.forEach(d => Object.entries(d[key] || {}).forEach(([k, v]) => { m[k] = (m[k] || 0) + n(v); })); return Object.entries(m).sort((a, b) => b[1] - a[1]); },
    // Ratings people left with the "Rate the sim" link (rate.js).
    ratingsCard() {
      const r = this.ratings;
      if (r === undefined) return '';
      if (r === null) return '<div class="card"><div class="section-head"><h3 class="section-title">Ratings</h3></div><p class="adm-note">Couldn\'t read ratings. The database rules may need updating (paste firestore.rules into the Firebase console).</p></div>';
      const count = r.length;
      const avg = count ? r.reduce((t, x) => t + n(x.stars), 0) / count : 0;
      const dist = [5, 4, 3, 2, 1].map(s => ({ s, c: r.filter(x => n(x.stars) === s).length }));
      const top = Math.max(1, ...dist.map(x => x.c));
      const notes = r.filter(x => x.note).slice(0, 25);
      const when = t => (t ? new Date(n(t)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
      return `<div class="card rating-card"><div class="section-head"><h3 class="section-title">Ratings</h3>
          <span class="adm-note">${count ? `${avg.toFixed(1)} average from ${fmt(count)} ${count === 1 ? 'rating' : 'ratings'}` : 'No ratings yet'}</span></div>
        ${count ? `<div class="rating-dist">${dist.map(x => `<div class="rating-row"><span>${x.s} ★</span><div class="rating-bar"><i style="width:${Math.round(100 * x.c / top)}%"></i></div><b>${fmt(x.c)}</b></div>`).join('')}</div>` : ''}
        ${notes.length ? `<ul class="rating-notes">${notes.map(x => `<li><b>${'★'.repeat(n(x.stars))}${'☆'.repeat(5 - n(x.stars))}</b> <span class="adm-note">${esc(x.page ? nice(x.page, PAGE_NAMES) : '')} · ${when(x.at)}</span><p>${esc(x.note)}</p></li>`).join('')}</ul>` : (count ? '<p class="adm-note">No written notes yet.</p>' : '')}
      </div>`;
    },
    render(el) {
      const all = this.data || [];
      const week = all.slice(0, 7), today = all[0] || {};
      const views = d => Object.values(d.views || {}).reduce((t, v) => t + n(v), 0);
      const card = (label, value, sub) => `<div class="adm-card"><span class="adm-card-label">${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
      const bars = all.slice().reverse();
      const max = Math.max(1, ...bars.map(d => Math.max(n(d.visitors), views(d))));
      const PLOT = 120;   // px height of the tallest bar
      const dense = bars.length > 14;
      // Each day is a column with its numbers printed on it: visitors above
      // the bars, page views under the date. HTML rather than SVG so the
      // text stays readable at any width.
      const chart = `<div class="usage-scroll"><div class="usage-bars${dense ? ' dense' : ''}" role="img" aria-label="Visitors and page views per day">
        ${bars.map(d => { const v = views(d), u = n(d.visitors);
          return `<div class="usage-col" title="${esc(d.day)}: ${fmt(u)} visitors, ${fmt(v)} page views">
            <span class="usage-val">${fmt(u)}</span>
            <div class="usage-pair" style="height:${PLOT}px">
              <i class="usage-views" style="height:${Math.round((v / max) * PLOT)}px"></i>
              <i class="usage-visitors" style="height:${Math.round((u / max) * PLOT)}px"></i>
            </div>
            <span class="usage-day">${esc(d.day.slice(5))}</span>
            <span class="usage-pv">${fmt(v)}</span>
          </div>`; }).join('')}
      </div></div>
        <div class="usage-axis"><span>Visitors (top) · page views (bottom)</span><span>peak ${fmt(max)}</span></div>`;
      const table = (title, rows, names, empty, label) => `<div class="card"><div class="section-head"><h3 class="section-title">${title}</h3></div>
        ${rows.length ? `<table class="data-table compact usage-table"><tbody>${rows.slice(0, 15).map(([k, v]) => `<tr><td>${esc(label ? label(k) : nice(k, names))}</td><td class="usage-num">${fmt(v)}</td></tr>`).join('')}</tbody></table>` : `<p class="adm-note">${empty}</p>`}</div>`;
      const refName = k => (k === 'direct' ? 'Direct / bookmarks' : k.replace(/_/g, '.'));
      const refs = this.merge(all, 'refs');
      const mob = this.sum(all, 'mobile'), desk = this.sum(all, 'desktop');
      const nothing = !all.some(d => d.updated);
      el.innerHTML = `
        <div class="section-head usage-head"><h2 class="section-title">Site usage</h2>
          <div class="seg">${[7, 30, 90].map(d => `<button type="button" class="${d === this.days ? 'on' : ''}" onclick="UsageAdmin.setDays(${d}, this)">${d} days</button>`).join('')}</div></div>
        ${nothing ? '<p class="adm-note">No visits counted yet. Counting starts once the updated database rules (firestore.rules) are published in the Firebase console; visits from admins, from copies of the site opened locally, and from browsers asking not to be tracked aren\'t counted.</p>' : ''}
        <div class="adm-cards">
          ${card('Visitors today', fmt(today.visitors), `${fmt(today.newVisitors)} new · ${fmt(views(today))} page views`)}
          ${card('Visitors, last 7 days', fmt(this.sum(week, 'visitors')), `${fmt(this.sum(week, 'newVisitors'))} new`)}
          ${card(`Visitors, last ${all.length} days`, fmt(this.sum(all, 'visitors')), `${fmt(this.sum(all, 'newVisitors'))} new · ${fmt(all.reduce((t, d) => t + views(d), 0))} page views`)}
          ${card('Signed in', fmt(this.sum(all, 'signedIn')), 'visitor-days with an account')}
          ${card('On phones', mob + desk ? `${Math.round(100 * mob / (mob + desk))}%` : '–', `${fmt(mob)} phone · ${fmt(desk)} computer`)}
        </div>
        <div class="card"><div class="section-head"><h3 class="section-title">Per day</h3><span class="adm-note"><i class="usage-key usage-views"></i> page views <i class="usage-key usage-visitors"></i> visitors</span></div>${chart}</div>
        <div class="adm-grid2">
          ${table('Pages', this.merge(all, 'views'), PAGE_NAMES, 'No page views yet.')}
          ${table('What people did', this.merge(all, 'events'), EVENT_NAMES, 'No actions counted yet.')}
          ${table('Where visitors came from', refs, {}, 'No visitors yet.', refName)}
        </div>
        ${this.ratingsCard()}
        <p class="adm-note">Counts are daily totals with nothing that identifies a person. A visitor is one browser on one day. Admins aren't counted.</p>`;
      // On a narrow screen the chart scrolls; start at the newest days.
      const sc = el.querySelector('.usage-scroll');
      if (sc) sc.scrollLeft = sc.scrollWidth;
    },
    async start() {
      const el = document.getElementById('usageBody');
      if (!el || !root.Cloud) return;
      const on = await root.Cloud.init();
      if (!on) { el.innerHTML = ''; return; }
      root.Cloud.onChange(() => { if (root.Cloud.admin) this.load(el); else el.innerHTML = ''; });
    }
  };
  root.UsageAdmin = UsageAdmin;
  if (typeof document !== 'undefined' && !root.__ADMIN_NO_AUTOSTART && document.getElementById('usageBody')) {
    const go = () => UsageAdmin.start();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
