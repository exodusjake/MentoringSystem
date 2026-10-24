#!/usr/bin/env python3
"""Rebuild the deployed Tabler Icons stylesheet + font with only the icons the app uses.

The full Tabler Icons 2.47.0 set (~5,000 icons; stylesheet + TrueType font) lives in assets-src/tabler-icons/.
This scans the app for `ti-<name>` class names, then writes to public/ADMIN_/CSS/:
  tabler-icons.min.css        same rules as the original, limited to the used icons
  fonts/tabler-icons.woff2|woff|ttf   the full font with unused icon outlines emptied

Run after adding a new icon:  python3 scripts/subset-icons.py   (needs fonttools + brotli)
tests/icon-subset.test.cjs fails if a used icon is missing from the subset.
"""
import pathlib
import re
import sys

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets-src' / 'tabler-icons'
OUT_CSS = ROOT / 'public' / 'ADMIN_' / 'CSS' / 'tabler-icons.min.css'
OUT_FONTS = OUT_CSS.parent / 'fonts'

SCAN = ['src', 'index.html', 'LANDING', 'LOGIN', 'ADMIN_', 'HEAD', 'MENTOR', 'MENTEE', 'public']
EXTS = {'.js', '.html', '.css'}


def used_icons():
    names = set()
    for entry in SCAN:
        path = ROOT / entry
        files = [path] if path.is_file() else [p for p in path.rglob('*') if p.suffix in EXTS]
        for f in files:
            if f.name == 'tabler-icons.min.css':
                continue
            names.update(re.findall(r'\bti-[a-z0-9]+(?:-[a-z0-9]+)*', f.read_text(encoding='utf-8')))
    return names


def main():
    css = (SRC / 'tabler-icons.min.css').read_text(encoding='utf-8')
    head_end = css.index('.ti-')  # banner + @font-face + .ti base rule
    head, icons = css[:head_end], css[head_end:]
    rules = dict(re.findall(r'\.(ti-[a-z0-9-]+):before\{content:"\\([0-9a-f]+)"\}', icons))

    used = used_icons()
    unknown = sorted(n for n in used if n not in rules)
    keep = sorted(n for n in used if n in rules)
    if unknown:
        # Names that look like icons but aren't in Tabler (other ti- prefixed identifiers) are ignored.
        print('not Tabler icons (ignored):', ', '.join(unknown))

    # Same @font-face, minus the IE-only EOT sources (the app requires ES-module browsers).
    head = re.sub(r'src:url\("\./fonts/tabler-icons\.eot\?v2\.47\.0"\);', '', head)
    head = head.replace('src:url("./fonts/tabler-icons.eot?#iefix-v2.47.0") format("embedded-opentype"),', 'src:')
    body = ''.join(f'.{n}:before{{content:"\\{rules[n]}"}}' for n in keep)
    OUT_CSS.write_text(head + body + '\n', encoding='utf-8')

    unicodes = {int(rules[n], 16) for n in keep}
    OUT_FONTS.mkdir(parents=True, exist_ok=True)
    built = []
    for flavor, ext in ((None, 'ttf'), ('woff', 'woff'), ('woff2', 'woff2')):
        # "Hollow" subset: every table stays byte-for-byte (glyph IDs, advances, cmap, and the
        # GSUB table, which fontTools cannot parse but Chrome applies while shaping and which
        # shifts some icons by a pixel). Only the outlines of icons the app never uses are emptied.
        # A conventional subset drops GSUB and renders 15 of the used icons 1px differently.
        font = TTFont(SRC / 'fonts' / 'tabler-icons.ttf', lazy=True, recalcBBoxes=False, recalcTimestamp=False)
        cmap = font.getBestCmap()
        used_glyphs = {cmap[u] for u in unicodes if u in cmap} | {'.notdef'}
        glyf = font['glyf']
        for name in font.getGlyphOrder():
            if name not in used_glyphs:
                glyf[name] = Glyph()
        font.flavor = flavor
        tmp = OUT_FONTS / f'.tabler-icons.{ext}.tmp'
        font.save(tmp)
        built.append((tmp, OUT_FONTS / f'tabler-icons.{ext}'))
    for old in OUT_FONTS.glob('tabler-icons.*'):
        old.unlink()
    for tmp, final in built:
        tmp.rename(final)

    sizes = {p.name: p.stat().st_size for p in sorted(OUT_FONTS.glob('tabler-icons.*'))}
    print(f'{len(keep)} icons -> {OUT_CSS.relative_to(ROOT)} ({OUT_CSS.stat().st_size} B), fonts {sizes}')


if __name__ == '__main__':
    sys.exit(main())
