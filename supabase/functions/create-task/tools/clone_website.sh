#!/bin/bash
# Mizpa Website Cloner
# Adapts AI Website Cloner Template concept for Mizpa
# Fetches page, extracts DOM/CSS/assets, generates React components
# Usage: clone_website.sh <url> [output_dir]
set -e

URL=${1:?"Usage: clone_website.sh <url> [output_dir]"}
OUTDIR=${2:-/opt/mizpa/output/clone-$(date +%s)}
mkdir -p "$OUTDIR"/{assets,components}

log() { echo "[$(date -Iseconds)] $1" >&2; }

log "Cloning: $URL"

# 1. Fetch HTML
log "Fetching HTML..."
HTML_FILE="$OUTDIR/index.html"
curl -sL -A "Mozilla/5.0 (compatible; MizpaBot/1.0)" --max-time 20 "$URL" > "$HTML_FILE"
HTML_SIZE=$(wc -c < "$HTML_FILE" 2>/dev/null || echo "0")
log "Downloaded: ${HTML_SIZE} bytes"

# 2. Extract CSS (inline + linked)
log "Extracting CSS..."
cat > "$OUTDIR/extract_css.py" << 'PYEOF'
#!/usr/bin/env python3
import re, json, sys, os

with open(sys.argv[1]) as f:
    html = f.read()

# Inline styles
inline_styles = re.findall(r'style=["\']([^"\']+)["\']', html)

# Linked stylesheets
css_links = re.findall(r'<link[^>]*href=["\']([^"\']+\.css[^"\']*)["\']', html, re.I)

# Extract inline CSS properties from elements
elements_with_styles = []
for match in re.finditer(r'<(\w+)([^>]*)>', html):
    tag = match.group(1)
    attrs = match.group(2)
    style_match = re.search(r'style=["\']([^"\']+)["\']', attrs)
    class_match = re.search(r'class=["\']([^"\']+)["\']', attrs)
    if style_match or class_match:
        elements_with_styles.append({
            'tag': tag,
            'style': style_match.group(1) if style_match else None,
            'class': class_match.group(1) if class_match else None,
        })

print(json.dumps({
    'linkedStylesheets': css_links[:10],
    'inlineStyleCount': len(inline_styles),
    'elementsWithStyles': elements_with_styles[:50],
}, indent=2))
PYEOF
python3 "$OUTDIR/extract_css.py" "$HTML_FILE" > "$OUTDIR/css_analysis.json"

# 3. Extract DOM structure
log "Extracting DOM structure..."
python3 -c "
import re, json, sys

with open('$HTML_FILE') as f:
    html = f.read()

def extract_structure(html, max_depth=5):
    \"\"\"Extract semantic DOM structure.\"\"\"
    structure = []
    
    # Find semantic elements
    for tag in ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'div']:
        pattern = f'<{tag}[^>]*>'
        matches = list(re.finditer(pattern, html, re.I))
        for m in matches[:5]:  # limit per tag
            # Get class if any
            class_match = re.search(r'class=[\"\\']([^\"\\']+)[\"\\']', m.group(0))
            structure.append({
                'tag': tag,
                'class': class_match.group(1) if class_match else None,
                'position': m.start(),
            })
    
    structure.sort(key=lambda x: x['position'])
    return structure[:30]

print(json.dumps(extract_structure(html), indent=2))
" > "$OUTDIR/dom_structure.json"

# 4. Download assets (images, fonts)
log "Downloading assets..."
python3 -c "
import re, json, sys, os, urllib.request

with open('$HTML_FILE') as f:
    html = f.read()

assets = []
# Images
for src in re.findall(r'<img[^>]*src=[\"\\']([^\"\\']+)[\"\\']', html, re.I):
    assets.append(('image', src))
# Background images in inline styles
for bg in re.findall(r'background(?:-image)?:\s*url\([\"\\']?([^\"\\')]+)[\"\\']?\)', html):
    assets.append(('background', bg))

downloaded = []
for asset_type, url in assets[:20]:
    if url.startswith('//'):
        url = 'https:' + url
    elif url.startswith('/'):
        from urllib.parse import urlparse
        parsed = urlparse('$URL')
        url = parsed.scheme + '://' + parsed.netloc + url
    
    if not url.startswith('http'):
        continue
    
    filename = url.split('/')[-1].split('?')[0]
    if not filename or '.' not in filename:
        filename = f'asset_{len(downloaded)}.png'
    
    try:
        outpath = os.path.join('$OUTDIR/assets', filename)
        urllib.request.urlretrieve(url, outpath)
        downloaded.append({'type': asset_type, 'url': url, 'file': filename, 'size': os.path.getsize(outpath)})
    except Exception as e:
        downloaded.append({'type': asset_type, 'url': url, 'error': str(e)})

print(json.dumps(downloaded, indent=2))
" > "$OUTDIR/assets_manifest.json"

ASSET_COUNT=$(python3 -c "import json; print(len(json.load(open('$OUTDIR/assets_manifest.json'))))" 2>/dev/null || echo "0")
log "Downloaded $ASSET_COUNT assets"

# 5. Generate React component structure
log "Generating React components..."
python3 -c "
import re, json, sys

with open('$HTML_FILE') as f:
    html = f.read()
with open('$OUTDIR/dom_structure.json') as f:
    dom = json.load(f)

# Convert semantic tags to React components
components = []
for node in dom:
    tag = node['tag']
    class_name = node.get('class', '')
    
    # Map HTML tags to React patterns
    if tag == 'header':
        components.append({'name': 'Header', 'type': 'layout', 'description': f'Page header (classes: {class_name})'})
    elif tag == 'nav':
        components.append({'name': 'Navigation', 'type': 'layout', 'description': f'Navigation bar (classes: {class_name})'})
    elif tag == 'main':
        components.append({'name': 'MainContent', 'type': 'layout', 'description': f'Main content area (classes: {class_name})'})
    elif tag == 'footer':
        components.append({'name': 'Footer', 'type': 'layout', 'description': f'Page footer (classes: {class_name})'})
    elif tag == 'section':
        components.append({'name': f'Section_{len(components)}', 'type': 'section', 'description': f'Content section (classes: {class_name})'})
    elif tag == 'article':
        components.append({'name': 'Article', 'type': 'content', 'description': f'Article content (classes: {class_name})'})
    elif tag == 'aside':
        components.append({'name': 'Sidebar', 'type': 'layout', 'description': f'Sidebar (classes: {class_name})'})

# Deduplicate
seen = set()
unique = []
for c in components:
    if c['name'] not in seen:
        seen.add(c['name'])
        unique.append(c)

print(json.dumps(unique, indent=2))
" > "$OUTDIR/component_plan.json"

# 6. Generate App.tsx
log "Generating App.tsx..."
python3 -c "
import json

with open('$OUTDIR/component_plan.json') as f:
    components = json.load(f)

with open('$HTML_FILE') as f:
    html = f.read()

# Extract title
import re
title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
title = title_match.group(1).strip() if title_match else 'Cloned Page'

# Build component imports
imports = '\n'.join([f\"import {c['name']} from './components/{c['name']}';\" for c in components])
# Build component JSX
jsx = '\n        '.join([f\"<{c['name']} />\" for c in components])

app_tsx = f'''import React from 'react';
{imports}

export default function App() {{
  return (
    <div className=\"min-h-screen bg-gray-50\">
      {/* Cloned from: {title} */}
      {jsx}
    </div>
  );
}}
'''

print(app_tsx)
" > "$OUTDIR/src/App.tsx"

mkdir -p "$OUTDIR/src/components"

# 7. Summary
cat > "$OUTDIR/clone_summary.json" << SUMMARY_EOF
{
  "url": "$URL",
  "outputDir": "$OUTDIR",
  "htmlSize": $(wc -c < "$HTML_FILE" 2>/dev/null || echo "0"),
  "assetsDownloaded": $ASSET_COUNT,
  "componentsPlanned": $(python3 -c "import json; print(len(json.load(open('$OUTDIR/component_plan.json'))))" 2>/dev/null || echo "0"),
  "files": {
    "html": "index.html",
    "css": "css_analysis.json",
    "dom": "dom_structure.json",
    "assets": "assets_manifest.json",
    "components": "component_plan.json",
    "app": "src/App.tsx"
  }
}
SUMMARY_EOF

log "✅ Clone complete: $OUTDIR"
cat "$OUTDIR/clone_summary.json"
