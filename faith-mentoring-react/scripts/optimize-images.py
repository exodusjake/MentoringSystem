#!/usr/bin/env python3
"""Losslessly shrink the PNGs in public/IMAGES.

Only the compressed pixel data (IDAT) is replaced, with a smaller encoding of the same pixels.
Every other chunk (IHDR, sRGB, gAMA, iCCP, cHRM, pHYs) is kept byte-for-byte, so color handling
in browsers is unchanged. A file is only rewritten if its IHDR is identical and the decoded
pixels match exactly.    Usage: python3 scripts/optimize-images.py
"""
import io
import pathlib
import struct

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent


def chunks(data):
    i = 8
    while i < len(data):
        n, kind = struct.unpack('>I4s', data[i:i + 8])
        yield kind, data[i:i + 12 + n]
        i += 12 + n


def optimize(path):
    original = path.read_bytes()
    img = Image.open(io.BytesIO(original))
    img.load()
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    fresh = dict()
    for kind, raw in chunks(buf.getvalue()):
        fresh.setdefault(kind, []).append(raw)
    old_ihdr = next(raw for kind, raw in chunks(original) if kind == b'IHDR')
    if fresh[b'IHDR'][0] != old_ihdr:
        return None  # PIL would change bit depth/color type/interlace: keep original

    out, placed = [original[:8]], False
    for kind, raw in chunks(original):
        if kind == b'IDAT':
            if not placed:
                out.append(b''.join(fresh[b'IDAT']))
                placed = True
            continue
        out.append(raw)
    result = b''.join(out)

    a = Image.open(io.BytesIO(original)).convert('RGBA')
    b = Image.open(io.BytesIO(result)).convert('RGBA')
    if a.size != b.size or a.tobytes() != b.tobytes() or len(result) >= len(original):
        return None
    path.write_bytes(result)
    return len(original), len(result)


for p in sorted((ROOT / 'public' / 'IMAGES').rglob('*.png')):
    r = optimize(p)
    print(f'{p.relative_to(ROOT)}: ' + (f'{r[0]} -> {r[1]} bytes' if r else 'kept'))
