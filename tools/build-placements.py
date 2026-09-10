#!/usr/bin/env python3
"""Regenerate the Placements logo wall from the contents of site/assets/logos/.

Drop a logo into that folder, run this script, and the firm appears on the page.

Each logo is sized by OPTICAL weight rather than bounding-box height: a lockup
with thin strokes and small type (Perella Weinberg, Black Opal) carries far less
ink than a dense one (RBC, Second Summit), so matching their heights makes the
sparse ones look tiny. We measure the ink each logo actually puts on the page and
correct toward equal optical mass. See OPTICAL_K below.

Usage:
    python tools/build-placements.py          # rewrite the grid
    python tools/build-placements.py --check  # report only, change nothing

Requires Pillow. PyMuPDF is used to measure SVGs; without it SVGs fall back to
their declared viewBox and an assumed ink density (a warning is printed).
"""

import math
import os
import re
import sys

from PIL import Image

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

ROOT = os.path.dirname(os.path.abspath(os.path.join(__file__, "..")))
LOGO_DIR = os.path.join(ROOT, "site", "assets", "logos")
PAGE = os.path.join(ROOT, "site", "placements.html")

# How hard to correct toward equal optical mass.
#   0.0 = every logo gets the same bounding-box height (sparse logos look tiny)
#   1.0 = every logo gets the same ink area (sparse logos get blown up)
# 0.5 is the tuned middle.
OPTICAL_K = 0.5

BASE_H = 48.0    # reference height in px, before optical correction
MAX_W = 215.0    # a logo never renders wider than this at the reference size
MAX_H = 76.0     # ...nor taller than this
# A very long single-line wordmark (SACHEMHEAD is 11:1) hits MAX_W while its
# letters are still tiny, so allow the widest ones extra room before clamping.
WIDE_RATIO = 6.0
MAX_W_HARD = 330.0

# Filename stem -> display name. Anything not listed falls back to a title-cased
# stem and is reported, so you can add a proper name here.
NAMES = {
    "rbc": "RBC Capital Markets",
    "coatue": "Coatue Management",
    "shcm": "Sachem Head Capital Management",
    "pwp": "Perella Weinberg Partners",
    "walleye": "Walleye Capital",
    "scholdings": "SC Holdings",
    "arcadiainvestmentpartners": "Arcadia Investment Partners",
    "secondsummit": "Second Summit Partners",
    "truebluepartners": "True Blue Partners",
    "blackopalventures": "Black Opal Ventures",
    "yc": "Y Combinator",
    "hyperflex": "Hyperflex",
}

# Stems to leave off the page. Use this when two files are the same firm and you
# want to keep both on disk.
SKIP = set()

# Final hand nudges, applied after everything else. The measurements get most
# logos right but cannot judge every case: a stacked two-line lockup (RBC, Second
# Summit) sets its type at roughly half the box height, so it needs a taller box
# than a single-line wordmark before the words read at the same size. Raise a
# value to grow a logo, lower it to shrink one. 1.0 = leave it to the algorithm.
NUDGE = {
    "secondsummit": 1.35,   # stacked, and the narrowest logo in the wall
    "rbc": 1.22,            # stacked; "Capital Markets" reads small
    "coatue": 0.92,         # bare wordmark, was carrying the row
}

# Display order. Stems not listed here are appended alphabetically, so a newly
# added logo shows up at the end until you place it.
ORDER = [
    "coatue", "pwp", "rbc", "walleye", "truebluepartners", "hyperflex", "yc",
    "blackopalventures", "shcm", "arcadiainvestmentpartners", "secondsummit",
    "scholdings",
]

# When the same firm exists in several formats, keep the best one.
EXT_PRIORITY = {".svg": 0, ".png": 1, ".webp": 2, ".jpg": 3, ".jpeg": 3, ".gif": 4}
MEASURE_H = 140  # ink is counted at this VISIBLE height so counts are comparable
RENDER_H = 400   # working resolution for finding the ink bounding box
PAD_WARN = 0.88  # flag files whose artwork fills less than this of their canvas


def load_rgba(path, height):
    """Render a logo to RGBA at the given height."""
    if path.lower().endswith(".svg"):
        if fitz is None:
            return None
        doc = fitz.open(path)
        page = doc[0]
        zoom = height / page.rect.height
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=True)
        return Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
    im = Image.open(path).convert("RGBA")
    w = max(1, round(im.width * height / im.height))
    return im.resize((w, int(height)), Image.LANCZOS)


def svg_viewbox(path):
    """Fall back to the declared SVG size when PyMuPDF is unavailable."""
    head = open(path, "r", encoding="utf-8", errors="ignore").read(2000)
    m = re.search(r'viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"', head)
    if m:
        return float(m.group(1)), float(m.group(2))
    w = re.search(r'width="([\d.]+)', head)
    h = re.search(r'height="([\d.]+)', head)
    if w and h:
        return float(w.group(1)), float(h.group(1))
    return 1.0, 1.0


def natural_size(path):
    """Intrinsic pixel size, used for the width/height attributes so the browser
    can reserve the right box before the image loads."""
    if path.lower().endswith(".svg"):
        w, h = svg_viewbox(path)
        return int(round(w)), int(round(h))
    with Image.open(path) as im:
        return im.width, im.height


def measure(path):
    """Measure a logo by its ARTWORK, not its canvas.

    Several logos ship with transparent padding baked in -- Perella Weinberg's
    file is 45% empty vertically -- so sizing by the canvas makes the artwork
    render far smaller than everything else. We find the ink bounding box, count
    ink at a common visible height, and report how much of the canvas the artwork
    actually fills so the caller can compensate.

    Returns (visible_aspect_ratio, ink_at_MEASURE_H, opaque_background, fill_h).
    """
    im = load_rgba(path, RENDER_H)
    if im is None:  # SVG with no PyMuPDF
        w, h = svg_viewbox(path)
        ratio = w / h
        return ratio, 0.22 * MEASURE_H * MEASURE_H * ratio, False, 1.0

    canvas_h = im.height
    mask = im.split()[3].point(lambda a: 255 if a > 40 else 0)
    box = mask.getbbox()
    if box:
        im = im.crop(box)
    fill_h = im.height / canvas_h if canvas_h else 1.0

    # Re-scale the artwork alone to the common height so ink is comparable.
    art = im.resize(
        (max(1, round(im.width * MEASURE_H / im.height)), MEASURE_H), Image.LANCZOS
    )
    ratio = art.width / art.height
    ink = 0
    opaque = 0
    for r, g, b, a in art.getdata():
        if a > 64:
            opaque += 1
            if 0.299 * r + 0.587 * g + 0.114 * b < 245:
                ink += 1
    # Artwork whose box is almost entirely opaque still has a background baked
    # in; flag it so it can be made transparent.
    has_bg = opaque > 0.97 * art.width * art.height
    return ratio, max(ink, 1), has_bg, max(fill_h, 0.2)


def collect():
    """One entry per firm, best format kept, ordered per ORDER."""
    best = {}
    for name in os.listdir(LOGO_DIR):
        stem, ext = os.path.splitext(name)
        ext = ext.lower()
        if ext not in EXT_PRIORITY or name.startswith((".", "_")):
            continue
        stem = stem.lower()
        if stem in SKIP:
            continue
        if stem not in best or EXT_PRIORITY[ext] < EXT_PRIORITY[best[stem][1]]:
            best[stem] = (name, ext)

    known = [s for s in ORDER if s in best]
    extra = sorted(s for s in best if s not in ORDER)
    return [(s, best[s][0]) for s in known + extra], extra


def build():
    entries, extra = collect()
    if not entries:
        sys.exit("No logos found in %s" % LOGO_DIR)

    rows = []
    warn_bg, warn_name, warn_pad = [], [], []
    for stem, filename in entries:
        path = os.path.join(LOGO_DIR, filename)
        ratio, ink, has_bg, fill_h = measure(path)
        nat_w, nat_h = natural_size(path)
        if has_bg:
            warn_bg.append(filename)
        if stem not in NAMES:
            warn_name.append(filename)
        if fill_h < PAD_WARN:
            warn_pad.append("%s (%.0f%% empty)" % (filename, 100 * (1 - fill_h)))
        rows.append({
            "stem": stem, "file": filename, "ratio": ratio, "ink": ink,
            "nat_w": nat_w, "nat_h": nat_h, "fill_h": fill_h,
            "name": NAMES.get(stem, stem.replace("-", " ").replace("_", " ").title()),
        })

    # Correct toward equal optical mass, relative to the set's geometric mean.
    # Everything here is the size of the ARTWORK; the canvas is scaled up at the
    # end so a padded file still renders its artwork at the intended size.
    gm = math.exp(sum(math.log(r["ink"]) for r in rows) / len(rows))
    for r in rows:
        scale = (gm / r["ink"]) ** (OPTICAL_K / 2)
        h = BASE_H * scale
        cap_w = MAX_W
        if r["ratio"] > WIDE_RATIO:
            cap_w = min(MAX_W * (r["ratio"] / WIDE_RATIO) ** 0.5, MAX_W_HARD)
        if h * r["ratio"] > cap_w:      # too wide: let width govern
            h = cap_w / r["ratio"]
        h = min(h, MAX_H)
        # A hand nudge is a deliberate override, so it wins over the caps above.
        h *= NUDGE.get(r["stem"], 1.0)
        r["h"] = h                      # visible artwork height
        r["w"] = h * r["ratio"]         # visible artwork width
        # CSS sets the height of the whole image, padding included.
        r["s"] = (h / r["fill_h"]) / BASE_H

    return rows, warn_bg, warn_name, warn_pad


def render(rows):
    out = []
    for i, r in enumerate(rows):
        delay = "" if i == 0 else " --d:%.2fs;" % (i * 0.05)
        out.append(
            '          <li class="pl-firm a-fade" style="--s:%.3f;%s" title="%s">'
            '<img class="pl-firm__logo" src="assets/logos/%s" alt="%s logo" '
            'width="%d" height="%d" loading="lazy"></li>'
            % (r["s"], delay, r["name"], r["file"], r["name"], r["nat_w"], r["nat_h"])
        )
    return '<ul class="pl-grid">\n' + "\n".join(out) + "\n        </ul>"


def main():
    check = "--check" in sys.argv
    rows, warn_bg, warn_name, warn_pad = build()

    print("%-32s %-30s %6s %6s %6s" % ("file", "name", "scale", "art w", "art h"))
    for r in rows:
        print("%-32s %-30s %6.2f %6.0f %6.0f"
              % (r["file"], r["name"], r["s"], r["w"], r["h"]))

    if warn_pad:
        print("\n! Transparent padding (compensated for, but it wastes row space):")
        for w in warn_pad:
            print("    %s" % w)
        print("  Crop these to the artwork for a tighter layout.")
    if warn_name:
        print("\n! No display name for: %s" % ", ".join(warn_name))
        print("  Add the filename stem to NAMES in this script.")
    if warn_bg:
        print("\n! Baked-in background (will show as a rectangle): %s"
              % ", ".join(warn_bg))
        print("  Save these with a transparent background.")
    if fitz is None and any(r["file"].endswith(".svg") for r in rows):
        print("\n! PyMuPDF not installed; SVGs were estimated, not measured.")
        print("  pip install pymupdf   for exact sizing.")

    grid = render(rows)
    html = open(PAGE, encoding="utf-8").read()
    new, n = re.subn(r'<ul class="pl-grid">.*?</ul>', grid, html, flags=re.S)
    if n != 1:
        sys.exit("Expected exactly one .pl-grid in %s, found %d" % (PAGE, n))

    if check:
        print("\n--check: %s" % ("would change" if new != html else "already current"))
        return
    if new == html:
        print("\n%d firms; placements.html already current." % len(rows))
        return
    open(PAGE, "w", encoding="utf-8").write(new)
    print("\n%d firms written to placements.html" % len(rows))


if __name__ == "__main__":
    main()
