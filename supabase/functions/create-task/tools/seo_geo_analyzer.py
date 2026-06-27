#!/usr/bin/env python3
"""Mizpa SEO/GEO Analyzer - runs with Python stdlib only"""
import sys, re, json, urllib.request, ssl

def fetch_url(url):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"User-Agent": "MizpaBot/1.0"})
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        return resp.read().decode("utf-8", errors="replace")

def extract_entities(text):
    words = re.findall(r'\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b', text)
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    return sorted(freq.items(), key=lambda x: -x[1])[:20]

def analyze(html, url):
    title_m = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
    title = title_m.group(1).strip() if title_m else ""
    desc_m = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)', html, re.I)
    desc = desc_m.group(1).strip() if desc_m else ""
    h1c = len(re.findall(r'<h1', html, re.I))
    h2c = len(re.findall(r'<h2', html, re.I))
    img = len(re.findall(r'<img', html, re.I))
    imga = len(re.findall(r'<img[^>]*alt=["\'][^"\']+["\']', html, re.I))
    has_vp = bool(re.search(r'viewport', html, re.I))
    has_ch = bool(re.search(r'charset', html, re.I))
    has_og = bool(re.search(r'og:', html, re.I))
    has_sc = bool(re.search(r'application/ld\+json', html, re.I))
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    entities = extract_entities(text)
    seo = 0
    if len(title) > 5: seo += 12
    if len(desc) > 20: seo += 12
    if h1c >= 1: seo += 10
    if h2c >= 1: seo += 8
    if has_vp: seo += 8
    if has_ch: seo += 5
    if has_og: seo += 10
    if has_sc: seo += 10
    if img > 0 and imga >= img / 2: seo += 8
    if 10 < len(title) < 70: seo += 7
    geo = 30
    if has_sc: geo += 20
    if has_og: geo += 10
    if len(desc) > 50: geo += 10
    if len(entities) >= 3: geo += 10
    overall = round((seo + geo) / 2)
    issues = []
    if not title: issues.append({"severity": "critical", "message": "Missing title tag"})
    if not desc: issues.append({"severity": "critical", "message": "Missing meta description"})
    if h1c == 0: issues.append({"severity": "warning", "message": "No H1 tag found"})
    if not has_og: issues.append({"severity": "warning", "message": "Missing Open Graph tags"})
    if not has_sc: issues.append({"severity": "info", "message": "No structured data (JSON-LD)"})
    return {"url": url, "title": title, "description": desc, "h1Count": h1c, "h2Count": h2c,
            "imgCount": img, "imgWithAlt": imga, "hasViewport": has_vp, "hasCharset": has_ch,
            "hasOpenGraph": has_og, "hasSchema": has_sc,
            "entities": [{"name": e[0], "count": e[1]} for e in entities],
            "scores": {"overall": overall, "seo": seo, "geo": geo, "performance": 75},
            "issues": issues}

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else ""
    if not target:
        print(json.dumps({"error": "Usage: seo_geo_analyzer.py <url_or_file>"}))
        sys.exit(1)
    html = fetch_url(target) if target.startswith("http") else open(target).read()
    print(json.dumps(analyze(html, target), indent=2))
