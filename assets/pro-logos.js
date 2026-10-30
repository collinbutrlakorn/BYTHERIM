// Logos for pro clubs (EuroLeague, Liga ACB, ABA League, NBL and so on).
// A file in proteamlogos/ named after the club (realmadrid.png) is used;
// a club without one shows schoollogos/pro.png.
(function (g) {
  var FALLBACK = 'schoollogos/pro.png';
  function slug(name) {
    // "Real Madrid U18", "Mega B": the senior club's logo.
    var n = String(name || '').replace(/\s+(u\s?\d{2}|b|ii|juniors?|youth)$/i, '');
    return n.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function path(name, base) {
    base = base == null ? '' : base;
    var s = slug(name);
    return s ? base + 'proteamlogos/' + s + '.png' : base + FALLBACK;
  }
  // A missing file falls back to the generic pro icon (errors don't bubble,
  // so this listens in the capture phase).
  if (g.addEventListener) g.addEventListener('error', function (e) {
    var t = e && e.target;
    if (!t || t.tagName !== 'IMG' || t.getAttribute('data-pro-fb')) return;
    var m = /^(.*?)proteamlogos\//.exec(t.src || '');
    if (!m) return;
    t.setAttribute('data-pro-fb', '1');
    t.src = m[1] + FALLBACK;
  }, true);
  g.ProLogos = { slug: slug, path: path, FALLBACK: FALLBACK };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.ProLogos;
})(typeof window !== 'undefined' ? window : globalThis);
