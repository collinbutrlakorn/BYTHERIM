#!/usr/bin/env python3
"""Writes the same share-preview, icon and canonical tags into every page.

Run from the repo root after adding a page or changing the domain:
    python3 tools/page-meta.py
Each page's <title> and description are kept; only the block between the
"share + icons" markers is rewritten.
"""
import html, re, pathlib

DOMAIN = 'https://bytherim.com'
ROOT = pathlib.Path(__file__).resolve().parent.parent

# file: (public path, share card in assets/share, fallback description)
PAGES = {
    'index.html':            ('/',                'home',       None),
    'podcast.html':          ('/podcast.html',    'podcast',    None),
    'draft.html':            ('/draft.html',      'draft',      None),
    'nba.html':              ('/nba.html',        'home',       None),
    'about.html':            ('/about.html',      'home',       None),
    'rp/index.html':         ('/rp/',             'rp',         None),
    'rp/guide.html':         ('/rp/guide.html',   'rp',         None),
    'rp/ncaa.html':          ('/rp/ncaa.html',    'ncaa',       'A full Division I college basketball simulation: every program, player development, award races, the NCAA Tournament and an NBA draft every offseason.'),
    'rp/draft.html':         ('/rp/draft.html',   'draft-rp',   None),
    'recruiting/index.html': ('/recruiting/',     'recruiting', 'Recruiting rankings, prospect profiles, commitments and the transfer portal for the BYTHERIM RP universe.'),
    '404.html':              (None,               'home',       'That page moved or never existed.'),
}
START, END = '<!-- share + icons -->', '<!-- /share + icons -->'
STRIP = re.compile(r'^\s*<(?:meta (?:property="og:[^"]*"|name="twitter:[^"]*"|name="theme-color")|link rel="(?:icon|canonical|manifest|apple-touch-icon|shortcut icon)")[^>]*>\s*\n', re.M)

def attr(v): return html.escape(html.unescape(v), quote=True)

for rel, (path, card, fallback) in PAGES.items():
    f = ROOT / rel
    if not f.exists():
        continue
    src = f.read_text(encoding='utf-8')
    src = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\n?', '', src, flags=re.S)
    src = STRIP.sub('', src)
    title = re.search(r'<title>(.*?)</title>', src, re.S).group(1).strip()
    m = re.search(r'<meta name="description" content="([^"]*)"', src)
    desc = m.group(1) if m else fallback
    if not m and fallback:
        src = src.replace('</title>', f'</title>\n  <meta name="description" content="{attr(fallback)}">', 1)
    base = '/' if path is None else '../' if rel.count('/') else ''
    url = DOMAIN + (path or '/')
    card_url = f'{DOMAIN}/assets/share/{card}.jpg'
    lines = [START]
    if path:
        lines.append(f'<link rel="canonical" href="{url}">')
    lines += [
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="BYTHERIM">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:title" content="{attr(title)}">',
        f'<meta property="og:description" content="{attr(desc)}">',
        f'<meta property="og:image" content="{card_url}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{attr(title)}">',
        f'<meta name="twitter:description" content="{attr(desc)}">',
        f'<meta name="twitter:image" content="{card_url}">',
        '<meta name="theme-color" content="#06070a">',
        f'<link rel="icon" type="image/png" sizes="32x32" href="{base}assets/icons/favicon-32.png">',
        f'<link rel="apple-touch-icon" href="{base}assets/icons/apple-touch-icon.png">',
        f'<link rel="manifest" href="{base}site.webmanifest">',
        END,
    ]
    block = '\n'.join('  ' + l for l in lines) + '\n'
    anchor = re.search(r'<meta name="description"[^>]*>\n', src) or re.search(r'</title>\n', src)
    src = src[:anchor.end()] + block + src[anchor.end():]
    src = re.sub(r'\n{3,}', '\n\n', src)
    src = re.sub(re.escape(END) + r'\n[ \t]*<', END + '\n  <', src)
    f.write_text(src, encoding='utf-8')
    print('updated', rel)
