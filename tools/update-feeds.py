#!/usr/bin/env python3
"""Snapshot the BYTHERIM Substack + podcast feeds into data/feeds.json.

The site normally reads the feeds live through rss2json, a free converter
that sometimes errors out. When it does, assets/site.js falls back to this
snapshot (same shape rss2json returns), so posts and episodes still show.
Run by .github/workflows/update-feeds.yml; also fine to run by hand.
"""
import json, re, sys, urllib.request, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

FEEDS = {
    "substack": "https://collindunks.substack.com/feed",
    "podcast": "https://api.substack.com/feed/podcast/9314968.rss",
}
NS = {"content": "http://purl.org/rss/1.0/modules/content/",
      "itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd"}

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 BYTHERIM-feed-snapshot"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def text(el, path):
    n = el.find(path, NS)
    return (n.text or "").strip() if n is not None and n.text else ""

def stamp(s):
    try:
        return parsedate_to_datetime(s).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return s

def first_img(html):
    # The site only needs the first inline image from the full post body.
    m = re.search(r"<img[^>]+src=[\"'][^\"']+[\"'][^>]*>", html or "", re.I)
    return m.group(0) if m else ""

def convert(raw):
    ch = ET.fromstring(raw).find("channel")
    img = ch.find("image/url")
    ich = ch.find("itunes:image", NS)
    feed = {"title": text(ch, "title"), "link": text(ch, "link"),
            "description": text(ch, "description"),
            "image": (img.text if img is not None else "") or (ich.get("href") if ich is not None else "")}
    items = []
    for it in ch.findall("item"):
        enc = it.find("enclosure")
        thumb = it.find("itunes:image", NS)
        dur = text(it, "itunes:duration")
        e = {"link": enc.get("url", ""), "type": enc.get("type", "")} if enc is not None else {}
        if dur:
            e["duration"] = int(dur) if dur.isdigit() else dur
        items.append({
            "title": text(it, "title"), "link": text(it, "link"),
            "pubDate": stamp(text(it, "pubDate")),
            "description": text(it, "description"),
            "content": first_img(text(it, "content:encoded")),
            "thumbnail": thumb.get("href", "") if thumb is not None else "",
            "enclosure": e,
        })
    return {"feed": feed, "items": items}

out = {}
for key, url in FEEDS.items():
    try:
        out[key] = convert(fetch(url))
    except Exception as ex:
        print(f"{key}: failed ({ex})", file=sys.stderr)
        sys.exit(1)
    print(key, len(out[key]["items"]), "items")
json.dump(out, open("data/feeds.json", "w"), indent=1, ensure_ascii=False)
open("data/feeds.json", "a").write("\n")
