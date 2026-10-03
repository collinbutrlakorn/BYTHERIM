#!/usr/bin/env python3
"""Writes the same share-preview, icon and canonical tags into every page.

Run from the repo root after adding a page or changing the domain:
    python3 tools/page-meta.py
Each page's <title> and description are kept; only the block between the
"share + icons" markers is rewritten.
"""
import html, json, re, pathlib

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
    'privacy.html':          ('/privacy.html',    'home',       None),
    'terms.html':            ('/terms.html',      'home',       None),
    '404.html':              (None,               'home',       'That page moved or never existed.'),
}
AUTHOR = 'Collin Butrlakorn'
# Profiles Google uses to connect the site, the brand and its creator.
BRAND_PROFILES = [
    'https://www.youtube.com/@BYTHERIM',
    'https://www.instagram.com/bytherimhoops/',
    'https://www.tiktok.com/@bytherim',
    'https://open.spotify.com/show/5o5uMpUFLXYs1qktXKPFJg',
    'https://podcasts.apple.com/us/podcast/bytherim-podcast/id6807326876',
    'https://collindunks.substack.com',
    'https://github.com/collinbutrlakorn/BYTHERIM',
]
# The RP apps each have their own icon and home-screen app: (icon prefix
# relative to the page, manifest relative to the page, app title).
APP_ICONS = {
    'rp/ncaa.html':          ('icons/ncaa',       'ncaa.webmanifest',       'NCAA RP'),
    'rp/draft.html':         ('icons/draft',      'draft.webmanifest',      'Draft RP'),
    'recruiting/index.html': ('icons/recruiting', 'recruiting.webmanifest', 'Recruiting'),
}
PERSON_PROFILES = ['https://x.com/bytherimhoops', 'https://collindunks.substack.com']
PAGE_TYPES = {'about.html': 'AboutPage', 'draft.html': 'CollectionPage', 'podcast.html': 'CollectionPage'}

def structured_data(rel, url, title, desc, card_url):
    org, person, site = DOMAIN + '/#org', DOMAIN + '/#collin', DOMAIN + '/#website'
    graph = [
        {'@type': 'Organization', '@id': org, 'name': 'BYTHERIM', 'alternateName': 'BYTHERIM Basketball',
         'url': DOMAIN + '/', 'logo': {'@type': 'ImageObject', 'url': DOMAIN + '/assets/icons/icon-512.png', 'width': 512, 'height': 512},
         'description': 'Independent basketball coverage: NBA draft analysis, film breakdowns, the BYTHERIM Podcast and the BYTHERIM RP college basketball universe.',
         'founder': {'@id': person}, 'sameAs': BRAND_PROFILES},
        {'@type': 'Person', '@id': person, 'name': AUTHOR, 'url': DOMAIN + '/about.html', 'jobTitle': 'Founder',
         'worksFor': {'@id': org}, 'sameAs': PERSON_PROFILES},
        {'@type': 'WebSite', '@id': site, 'url': DOMAIN + '/', 'name': 'BYTHERIM', 'inLanguage': 'en',
         'publisher': {'@id': org}, 'creator': {'@id': person}},
        {'@type': PAGE_TYPES.get(rel, 'WebPage'), '@id': url + '#page', 'url': url, 'name': html.unescape(title),
         'description': html.unescape(desc), 'isPartOf': {'@id': site}, 'author': {'@id': person},
         'primaryImageOfPage': {'@type': 'ImageObject', 'url': card_url, 'width': 1200, 'height': 630}},
    ]
    if rel == 'about.html':
        graph[-1]['mainEntity'] = {'@id': person}
    if rel == 'podcast.html':
        graph.append({'@type': 'PodcastSeries', '@id': url + '#podcast', 'name': 'BYTHERIM Podcast', 'url': url,
                      'webFeed': 'https://api.substack.com/feed/podcast/9314968.rss',
                      'author': {'@id': person}, 'publisher': {'@id': org},
                      'sameAs': [BRAND_PROFILES[3], BRAND_PROFILES[4]]})
    data = json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False, indent=1)
    return '<script type="application/ld+json">\n' + data.replace('</', '<\\/') + '\n</script>'

START, END = '<!-- share + icons -->', '<!-- /share + icons -->'
STRIP = re.compile(r'^\s*<(?:meta (?:property="og:[^"]*"|name="twitter:[^"]*"|name="theme-color"|name="apple-mobile-web-app-title")|link rel="(?:icon|canonical|manifest|apple-touch-icon|shortcut icon)")[^>]*>\s*\n', re.M)

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
        f'<meta name="author" content="{AUTHOR}">',
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
    ]
    if rel in APP_ICONS:
        icon, manifest, app = APP_ICONS[rel]
        lines += [
            f'<link rel="icon" type="image/png" sizes="32x32" href="{icon}-favicon-32.png">',
            f'<link rel="apple-touch-icon" href="{icon}-apple-touch-icon.png">',
            f'<link rel="manifest" href="{manifest}">',
            f'<meta name="apple-mobile-web-app-title" content="{app}">',
        ]
    else:
        lines += [
            f'<link rel="icon" type="image/png" sizes="32x32" href="{base}assets/icons/favicon-32.png">',
            f'<link rel="apple-touch-icon" href="{base}assets/icons/apple-touch-icon.png">',
            f'<link rel="manifest" href="{base}site.webmanifest">',
        ]
    if path:
        lines += structured_data(rel, url, title, desc, card_url).split('\n')
    lines.append(END)
    block = '\n'.join('  ' + l for l in lines) + '\n'
    anchor = re.search(r'<meta name="description"[^>]*>\n', src) or re.search(r'</title>\n', src)
    src = src[:anchor.end()] + block + src[anchor.end():]
    src = re.sub(r'\n{3,}', '\n\n', src)
    src = re.sub(re.escape(END) + r'\n[ \t]*<', END + '\n  <', src)
    f.write_text(src, encoding='utf-8')
    print('updated', rel)
