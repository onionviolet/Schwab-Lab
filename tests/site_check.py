"""Schwab Lab static-site sanity checks; Python standard library only."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import shutil
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]

class Tags(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.ids = []
    def handle_starttag(self, name, attrs):
        d = dict(attrs)
        if d.get("id"):
            self.ids.append(d["id"])
        for k in ("href", "src"):
            if d.get(k):
                self.links.append(d[k])

pages = {}
errors = []
for page in ROOT.glob("*.html"):
    tags = Tags()
    tags.feed(page.read_text(encoding="utf-8"))
    pages[page.name] = tags
    for id, count in Counter(tags.ids).items():
        if count > 1:
            errors.append(f"{page.name}: duplicate id #{id}")
for page, tags in pages.items():
    for raw in tags.links:
        parts = urlsplit(raw)
        if parts.scheme or parts.netloc or raw.startswith("//") or raw.startswith(("mailto:", "data:")):
            continue
        path = unquote(parts.path) if parts.path else page
        full = (ROOT / path).resolve() if path != page else ROOT / page
        if not full.is_relative_to(ROOT) or not full.exists():
            errors.append(f"{page}: missing or outside file {raw}")
            continue
        if parts.fragment and full.suffix == ".html":
            target = pages.get(full.name)
            if not target or parts.fragment not in target.ids:
                errors.append(f"{page}: broken page anchor {raw}")
if shutil.which("node"):
    for file in (ROOT / "assets" / "js").glob("*.js"):
        out = subprocess.run(["node", "--check", str(file)], capture_output=True, text=True)
        if out.returncode:
            errors.append(f"JavaScript syntax: {file.relative_to(ROOT)}: {out.stderr.strip()}")
if errors:
    print("\n".join(errors))
    raise SystemExit(1)
print(f"PASS: {len(pages)} HTML pages, local assets/anchors and JavaScript syntax")