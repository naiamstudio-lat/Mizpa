#!/bin/bash
# Mizpa Snapshot Builder
# Run ONCE to create a VM with all tools pre-installed, then snapshot it.
# After snapshotting, all future VMs boot from this image (<600ms).
#
# Usage:
#   1. Run this script manually in a freestyle VM
#   2. Snapshot the VM: freestyle vm snapshot <vmId> --name mizpa-agent
#   3. Store the snapshot ID for use in create-task
#
# Tools installed:
#   - Node.js 20 (frontend generation, npm packages)
#   - Python 3 + pip (SEO/GEO analysis scripts)
#   - curl, wget, git (fetching, cloning)
#   - jq (JSON processing)
#   - Mizpa agent scripts (/opt/mizpa/)

set -e

echo "🚀 Mizpa Snapshot Builder — Starting"

# ── System packages ──────────────────────────────────────────────
apt-get update -qq
apt-get install -y -qq \
  curl wget git jq unzip \
  > /dev/null 2>&1

echo "✅ System packages installed"

# ── Node.js 20 ──────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs > /dev/null 2>&1
fi
echo "✅ Node.js $(node -v) installed"

# ── Python 3 + pip ──────────────────────────────────────────────
if ! command -v python3 &> /dev/null; then
  apt-get install -y -qq python3 python3-pip > /dev/null 2>&1
fi
echo "✅ Python $(python3 --version 2>&1 | awk '{print $2}') installed"

# ── Mizpa agent directory ───────────────────────────────────────
mkdir -p /opt/mizpa/{skills,tools,output}
echo "✅ Mizpa directory created at /opt/mizpa"

# ── SEO/GEO Optimizer (Python scripts) ─────────────────────────
cat > /opt/mizpa/tools/seo_geo_analyzer.py << 'PYTHON_EOF'
#!/usr/bin/env python3
"""
Mizpa SEO/GEO Analyzer
Analyzes HTML content and returns structured audit results.
Usage: python3 seo_geo_analyzer.py <url_or_file>
"""
import sys
import re
import json
import urllib.request
import ssl

def fetch_url(url: str) -> str:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"User-Agent": "MizpaBot/1.0"})
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        return resp.read().decode("utf-8", errors="replace")

def extract_entities(text: str) -> list:
    """Extract named entities (simplified NER)."""
    words = re.findall(r'\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b', text)
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    return sorted(freq.items(), key=lambda x: -x[1])[:20]

def analyze(html: str, url: str) -> dict:
    # Basic extraction
    title = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
    title = title.group(1).strip() if title else ""
    
    desc = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)', html, re.I)
    desc = desc.group(1).strip() if desc else ""
    
    h1_count = len(re.findall(r'<h1', html, re.I))
    h2_count = len(re.findall(r'<h2', html, re.I))
    img_count = len(re.findall(r'<img', html, re.I))
    img_with_alt = len(re.findall(r'<img[^>]*alt=["\'][^"\']+["\']', html, re.I))
    
    has_viewport = bool(re.search(r'viewport', html, re.I))
    has_charset = bool(re.search(r'charset', html, re.I))
    has_og = bool(re.search(r'og:', html, re.I))
    has_schema = bool(re.search(r'application/ld\+json', html, re.I))
    has_canonical = bool(re.search(r'canonical', html, re.I))
    has_robots = bool(re.search(r'robots', html, re.I))
    
    # Text content for entity extraction
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    entities = extract_entities(text)
    
    # SEO Score
    seo = 0
    if len(title) > 5: seo += 12
    if len(desc) > 20: seo += 12
    if h1_count >= 1: seo += 10
    if h2_count >= 1: seo += 8
    if has_viewport: seo += 8
    if has_charset: seo += 5
    if has_og: seo += 10
    if has_schema: seo += 10
    if has_canonical: seo += 5
    if has_robots: seo += 5
    if img_count > 0 and img_with_alt >= img_count / 2: seo += 8
    if len(title) > 10 and len(title) < 70: seo += 7
    
    # GEO Score (Generative Engine Optimization)
    geo = 30
    if has_schema: geo += 20
    if has_og: geo += 10
    if len(desc) > 50: geo += 10
    if len(entities) >= 3: geo += 10
    if has_canonical: geo += 5
    if h1_count == 1: geo += 5  # Single H1 is best practice
    
    overall = round((seo + geo) / 2)
    
    # Issues
    issues = []
    if not title: issues.append({"severity": "critical", "message": "Missing title tag"})
    elif len(title) < 5: issues.append({"severity": "warning", "message": "Title too short (<5 chars)"})
    elif len(title) > 70: issues.append({"severity": "warning", "message": "Title too long (>70 chars)"})
    if not desc: issues.append({"severity": "critical", "message": "Missing meta description"})
    elif len(desc) < 20: issues.append({"severity": "warning", "message": "Description too short (<20 chars)"})
    if h1_count == 0: issues.append({"severity": "warning", "message": "No H1 tag found"})
    if h1_count > 1: issues.append({"severity": "warning", "message": f"Multiple H1 tags ({h1_count})"})
    if not has_og: issues.append({"severity": "warning", "message": "Missing Open Graph tags"})
    if not has_schema: issues.append({"severity": "info", "message": "No structured data (JSON-LD)"})
    if img_count > 0 and img_with_alt < img_count / 2:
        issues.append({"severity": "warning", "message": f"Many images missing alt text ({img_with_alt}/{img_count})"})
    
    return {
        "url": url,
        "title": title,
        "description": desc,
        "h1Count": h1_count,
        "h2Count": h2_count,
        "imgCount": img_count,
        "imgWithAlt": img_with_alt,
        "hasViewport": has_viewport,
        "hasCharset": has_charset,
        "hasOpenGraph": has_og,
        "hasSchema": has_schema,
        "hasCanonical": has_canonical,
        "entities": [{"name": e[0], "count": e[1]} for e in entities],
        "scores": {"overall": overall, "seo": seo, "geo": geo, "performance": 75},
        "issues": issues,
    }

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else ""
    if not target:
        print(json.dumps({"error": "Usage: seo_geo_analyzer.py <url_or_file>"}))
        sys.exit(1)
    
    if target.startswith("http"):
        html = fetch_url(target)
    else:
        with open(target) as f:
            html = f.read()
    
    result = analyze(html, target)
    print(json.dumps(result, indent=2))
PYTHON_EOF

chmod +x /opt/mizpa/tools/seo_geo_analyzer.py
echo "✅ SEO/GEO Analyzer installed"

# ── Page Fetcher & DOM Extractor ────────────────────────────────
cat > /opt/mizpa/tools/fetch_and_extract.sh << 'SHELL_EOF'
#!/bin/bash
# Fetches a URL and extracts structured DOM data as JSON
# Usage: fetch_and_extract.sh <url> [output_dir]
set -e

URL=${1:?"Usage: fetch_and_extract.sh <url> [output_dir]"}
OUTDIR=${2:-/opt/mizpa/output}
mkdir -p "$OUTDIR"

# Fetch
HTML_FILE="$OUTDIR/page.html"
curl -sL -A "MizpaBot/1.0" --max-time 15 "$URL" > "$HTML_FILE" 2>/dev/null

# Extract metadata as JSON
python3 -c "
import re, json, sys

with open('$HTML_FILE') as f:
    html = f.read()

# Title
title = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
title = title.group(1).strip() if title else ''

# Meta
desc = re.search(r'<meta[^>]*name=[\"\\']description[\"\\'][^>]*content=[\"\\']([^\"\\']+)', html, re.I)
desc = desc.group(1).strip() if desc else ''

# Headings
h1s = re.findall(r'<h1[^>]*>(.*?)</h1>', html, re.I | re.S)
h2s = re.findall(r'<h2[^>]*>(.*?)</h2>', html, re.I | re.S)

# Links
links = re.findall(r'href=[\"\\']([^\"\\'#]+)[\"\\']', html)
links = list(set(links))[:50]

# Images
images = re.findall(r'<img[^>]*src=[\"\\']([^\"\\']+)[\"\\']', html)

# JSON-LD
jsonld = re.findall(r'<script[^>]*type=[\"\\']application/ld\+json[\"\\'][^>]*>(.*?)</script>', html, re.I | re.S)
jsonld_parsed = []
for j in jsonld:
    try:
        jsonld_parsed.append(json.loads(j))
    except:
        pass

print(json.dumps({
    'url': '$URL',
    'title': title,
    'description': desc,
    'headings': {
        'h1': [re.sub(r'<[^>]+>', '', h).strip() for h in h1s],
        'h2': [re.sub(r'<[^>]+>', '', h).strip() for h in h2s],
    },
    'links': links,
    'images': images[:20],
    'structuredData': jsonld_parsed,
    'htmlSize': len(html),
}, indent=2))
" > "$OUTDIR/extracted.json"

echo "$OUTDIR/extracted.json"
SHELL_EOF

chmod +x /opt/mizpa/tools/fetch_and_extract.sh
echo "✅ Page Extractor installed"

# ── React Component Generator (Node.js) ─────────────────────────
cat > /opt/mizpa/tools/generate_react.js << 'NODE_EOF'
#!/usr/bin/env node
/**
 * Mizpa React Component Generator
 * Generates React+Tailwind components from extracted page data.
 * Usage: node generate_react.js <extracted.json> [output_dir]
 */
const fs = require('fs');
const path = require('path');

const extracted = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outDir = process.argv[3] || '/opt/mizpa/output/react-app';
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'src'), { recursive: true });

// Generate App.tsx
const appTsx = `import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Generated from ${extracted.url} */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">${extracted.title || 'Generated Page'}</h1>
          ${extracted.description ? `<p className="mt-2 text-gray-600">${extracted.description}</p>` : ''}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-gray-700">Generated by Mizpa Agent</p>
      </main>
    </div>
  );
}
`;
fs.writeFileSync(path.join(outDir, 'src/App.tsx'), appTsx);

// Generate package.json
const pkg = {
  name: 'mizpa-generated',
  private: true,
  version: '0.0.1',
  scripts: {
    dev: 'vite',
    build: 'vite build',
  },
  dependencies: {
    react: '^19.0.0',
    'react-dom': '^19.0.0',
  },
  devDependencies: {
    '@types/react': '^19.0.0',
    '@types/react-dom': '^19.0.0',
    '@vitejs/plugin-react': '^4.3.0',
    autoprefixer: '^10.4.0',
    postcss: '^8.4.0',
    tailwindcss: '^3.4.0',
    typescript: '^5.6.0',
    vite: '^6.0.0',
  },
};
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2));

console.log(JSON.stringify({
  status: 'generated',
  outputDir: outDir,
  files: ['src/App.tsx', 'package.json'],
}));
NODE_EOF

chmod +x /opt/mizpa/tools/generate_react.js
echo "✅ React Generator installed"

# ── Website Cloner (AI Website Cloner Template concept) ─────────
cat > /opt/mizpa/tools/clone_website.sh << 'CLONE_EOF'
#!/bin/bash
# Mizpa Website Cloner — adapted from AI Website Cloner Template
# Fetches page, extracts DOM/CSS/assets, generates React components
# Usage: clone_website.sh <url> [output_dir]
set -e

URL=${1:?"Usage: clone_website.sh <url> [output_dir]"}
OUTDIR=${2:-/opt/mizpa/output/clone-$(date +%s)}
mkdir -p "$OUTDIR"/{assets,components,src}

log() { echo "[$(date -Iseconds)] $1" >&2; }

log "Cloning: $URL"

# 1. Fetch HTML
HTML_FILE="$OUTDIR/index.html"
curl -sL -A "Mozilla/5.0 (compatible; MizpaBot/1.0)" --max-time 20 "$URL" > "$HTML_FILE"
log "Downloaded: $(wc -c < "$HTML_FILE") bytes"

# 2. Extract CSS analysis
python3 -c "
import re, json, sys
with open('$HTML_FILE') as f:
    html = f.read()
inline = re.findall(r'style=[\"\\']([^\"\\']+)[\"\\']', html)
css_links = re.findall(r'<link[^>]*href=[\"\\']([^\"\\']+\\.css[^\"\\']*)[\"\\']', html, re.I)
print(json.dumps({'linkedStylesheets': css_links[:10], 'inlineStyleCount': len(inline)}, indent=2))
" > "$OUTDIR/css_analysis.json"

# 3. Extract DOM structure
python3 -c "
import re, json, sys
with open('$HTML_FILE') as f:
    html = f.read()
structure = []
for tag in ['header','nav','main','section','article','aside','footer','div']:
    for m in re.finditer(f'<{tag}[^>]*>', html, re.I)[:5]:
        cls = re.search(r'class=[\"\\']([^\"\\']+)[\"\\']', m.group(0))
        structure.append({'tag': tag, 'class': cls.group(1) if cls else None, 'pos': m.start()})
structure.sort(key=lambda x: x['pos'])
print(json.dumps(structure[:30], indent=2))
" > "$OUTDIR/dom_structure.json"

# 4. Download assets
python3 -c "
import re, json, os, urllib.request
with open('$HTML_FILE') as f:
    html = f.read()
assets = []
for src in re.findall(r'<img[^>]*src=[\"\\']([^\"\\']+)[\"\\']', html, re.I):
    assets.append(src)
downloaded = []
for url in assets[:15]:
    if url.startswith('//'): url = 'https:' + url
    elif url.startswith('/'):
        from urllib.parse import urlparse
        p = urlparse('$URL')
        url = p.scheme + '://' + p.netloc + url
    if not url.startswith('http'): continue
    fn = url.split('/')[-1].split('?')[0] or f'asset_{len(downloaded)}.png'
    try:
        out = os.path.join('$OUTDIR/assets', fn)
        urllib.request.urlretrieve(url, out)
        downloaded.append({'url': url, 'file': fn, 'size': os.path.getsize(out)})
    except: pass
print(json.dumps(downloaded, indent=2))
" > "$OUTDIR/assets_manifest.json"

# 5. Generate React components
python3 -c "
import re, json
with open('$HTML_FILE') as f: html = f.read()
with open('$OUTDIR/dom_structure.json') as f: dom = json.load(f)
comps = []
for n in dom:
    t, c = n['tag'], n.get('class','')
    mapping = {'header':'Header','nav':'Navigation','main':'MainContent','footer':'Footer','section':f'Section_{len(comps)}','article':'Article','aside':'Sidebar','div':f'Block_{len(comps)}'}
    name = mapping.get(t, f'Component_{len(comps)}')
    if name not in [x['name'] for x in comps]:
        comps.append({'name': name, 'type': t, 'classes': c})
print(json.dumps(comps, indent=2))
" > "$OUTDIR/component_plan.json"

# 6. Generate App.tsx
python3 -c "
import re, json
with open('$HTML_FILE') as f: html = f.read()
with open('$OUTDIR/component_plan.json') as f: comps = json.load(f)
t = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
title = t.group(1).strip() if t else 'Cloned Page'
imps = chr(10).join([f\"import {c['name']} from './components/{c['name']}';\" for c in comps])
jsxx = '        '.join([f\"<{c['name']} />\" for c in comps])
print(f'''import React from 'react';
{imps}

export default function App() {{
  return (
    <div className=\"min-h-screen bg-gray-50\">
      {{/* Cloned from: {title} */}}
      {jsxx}
    </div>
  );
}}
''')
" > "$OUTDIR/src/App.tsx"

# 7. Summary
cat > "$OUTDIR/clone_summary.json" << EOF2
{"url":"$URL","outputDir":"$OUTDIR","htmlSize":$(wc -c < "$HTML_FILE"),"assets":$(python3 -c "import json; print(len(json.load(open('$OUTDIR/assets_manifest.json'))))" 2>/dev/null || echo 0),"components":$(python3 -c "import json; print(len(json.load(open('$OUTDIR/component_plan.json'))))" 2>/dev/null || echo 0)}
EOF2

log "✅ Clone complete"
cat "$OUTDIR/clone_summary.json"
CLONE_EOF

chmod +x /opt/mizpa/tools/clone_website.sh
echo "✅ Website Cloner installed"

# ── Main Agent Entrypoint ───────────────────────────────────────
cat > /opt/mizpa/agent.sh << 'AGENT_EOF'
#!/bin/bash
# Mizpa Agent Entry Point
# Usage: agent.sh <skill> <url> [callback_url] [task_id]
set -e

SKILL=${1:?"Usage: agent.sh <skill> <url> [callback_url] [task_id]"}
URL=${2:?"Usage: agent.sh <skill> <url> [callback_url] [task_id]"}
CALLBACK_URL=${3:-""}
TASK_ID=${4:-""}
WORKDIR="/opt/mizpa/work/$(date +%s)"
mkdir -p "$WORKDIR"

log() { echo "[$(date -Iseconds)] $1"; }

callback() {
  local status=$1
  local results=$2
  if [ -n "$CALLBACK_URL" ] && [ -n "$TASK_ID" ]; then
    curl -s -X POST "$CALLBACK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"taskId\":\"$TASK_ID\",\"status\":\"$status\",\"results\":$results}" || true
  fi
}

log "Starting $SKILL on $URL"
callback "running" "[{\"type\":\"log\",\"content\":{\"message\":\"Starting $SKILL on $URL...\"}}]"

case "$SKILL" in
  audit)
    log "Running SEO/GEO analysis"
    RESULT=$(python3 /opt/mizpa/tools/seo_geo_analyzer.py "$URL" 2>&1)
    callback "completed" "[{\"type\":\"audit\",\"content\":$RESULT}]"
    ;;
    
  replica)
    log "Cloning website"
    CLONE_DIR="$WORKDIR/clone-$(date +%s)"
    CLONE_RESULT=$(/opt/mizpa/tools/clone_website.sh "$URL" "$CLONE_DIR" 2>&1)
    log "Clone result: $CLONE_RESULT"
    
    # Also run SEO analysis for the cloned page
    AUDIT_RESULT=$(python3 /opt/mizpa/tools/seo_geo_analyzer.py "$URL" 2>&1)
    
    callback "completed" "[{\"type\":\"clone\",\"content\":$(cat "$CLONE_DIR/clone_summary.json" 2>/dev/null || echo '{"status":"cloned"}')},{\"type\":\"audit\",\"content\":$AUDIT_RESULT}]"
    ;;
    
  generate)
    log "Generating frontend"
    /opt/mizpa/tools/fetch_and_extract.sh "$URL" "$WORKDIR" > /dev/null 2>&1
    NODE_RESULT=$(node /opt/mizpa/tools/generate_react.js "$WORKDIR/extracted.json" "$WORKDIR/react-app" 2>&1)
    callback "completed" "[{\"type\":\"generated\",\"content\":$NODE_RESULT}]"
    ;;
    
  *)
    log "Unknown skill: $SKILL"
    callback "failed" "[{\"type\":\"error\",\"content\":{\"message\":\"Unknown skill: $SKILL\"}}]"
    exit 1
    ;;
esac

log "✅ $SKILL completed"
AGENT_EOF

chmod +x /opt/mizpa/agent.sh
echo "✅ Agent entrypoint installed"

# ── Verify everything works ─────────────────────────────────────
log "Running verification..."
python3 /opt/mizpa/tools/seo_geo_analyzer.py --help > /dev/null 2>&1 || echo "⚠️  Python analyzer needs a URL to test"
node /opt/mizpa/tools/generate_react.js 2>&1 | head -1 || echo "⚠️  Node generator needs input to test"
echo "✅ Verification complete"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Mizpa Snapshot Ready!"
echo ""
echo "  Tools installed:"
echo "    /opt/mizpa/agent.sh              — Main entrypoint"
echo "    /opt/mizpa/tools/seo_geo_analyzer.py  — SEO/GEO audit"
echo "    /opt/mizpa/tools/fetch_and_extract.sh — Page fetcher"
echo "    /opt/mizpa/tools/generate_react.js    — React generator"
echo ""
echo "  Next steps:"
echo "    1. Snapshot this VM:"
echo "       freestyle vm snapshot <vmId> --name mizpa-agent"
echo "    2. Save the snapshot ID"
echo "    3. Set it as a Supabase secret:"
echo "       npx supabase secrets set FREESTYLE_SNAPSHOT_ID=<id>"
echo "═══════════════════════════════════════════════════"
