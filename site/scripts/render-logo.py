#!/usr/bin/env python3
"""Rasterise the Atesor mark to PNG.

There is no SVG rasteriser on this machine (no rsvg/inkscape/cairosvg), and
adding one would mean a system package or a new npm dependency. It is not
needed: every element of the mark is a stroke with round caps and round
joins, a ring, or a disc. A round-joined polyline is exactly "within R of one
of its segments", so the whole mark is a signed-distance field that numpy
evaluates directly and that anti-aliases correctly at any size.

Geometry is transcribed from public/brand/atesor-mark.svg (the full mark) and
public/favicon.svg (the heavier small-size mark). Keep them in step: if an
SVG changes, update GEOMETRY below and re-run.

Usage:
    python3 scripts/render-logo.py          # writes every file in OUTPUTS
"""
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"

VIEWBOX = 512.0

# ---------------------------------------------------------------- colours --
INK = (0x1B, 0x1E, 0x22)        # granodiorite
CHALK = (0xEC, 0xEE, 0xEF)
PAPER = (0xF2, 0xF2, 0xEF)
BLUE = (0x21, 0x42, 0xB0)       # Egyptian blue
BLUE_LIGHT = (0x8C, 0xA3, 0xFF)  # Egyptian blue, for dark grounds

# --------------------------------------------------------------- geometry --
# Each shape: ("poly", points, stroke_width), ("ring", centre, r, stroke_width)
# or ("disc", centre, r). "line" shapes take the line colour, "pad" the pad colour.
MARK = {
    "line": [
        ("poly", [(160, 72), (440, 72), (440, 440), (72, 440), (72, 160), (160, 72)], 26),
        ("ring", (352, 180), 16, 10),
        ("poly", [(336, 180), (174, 180), (150, 204), (150, 232), (174, 256), (338, 256),
                  (362, 280), (362, 308), (338, 332), (164, 332)], 26),
    ],
    "pad": [("disc", (164, 332), 24)],
}

# Heavier strokes and no source ring, so it holds at 16-32 px.
SMALL = {
    "line": [
        ("poly", [(150, 62), (450, 62), (450, 450), (62, 450), (62, 150), (150, 62)], 48),
        ("poly", [(362, 176), (184, 176), (156, 204), (156, 228), (184, 256), (328, 256),
                  (356, 284), (356, 308), (328, 336), (180, 336)], 44),
    ],
    "pad": [("disc", (180, 336), 36)],
}

# name: (geometry, size, line colour, pad colour, background or None, scale of mark in canvas)
OUTPUTS = {
    "brand/atesor-mark-512.png": (MARK, 512, INK, BLUE, None, 1.0),
    "brand/atesor-mark-dark-512.png": (MARK, 512, CHALK, BLUE_LIGHT, None, 1.0),
    # Eclipse PMI logo field: max 200x200, transparent background.
    "brand/atesor-pmi-200.png": (MARK, 200, INK, BLUE, None, 1.0),
    # GitHub organisation avatar: square, opaque.
    "brand/github-avatar-500.png": (MARK, 500, INK, BLUE, PAPER, 0.86),
    # Web app icons.
    "brand/icon-192.png": (SMALL, 192, CHALK, BLUE_LIGHT, INK, 0.80),
    "brand/icon-512.png": (SMALL, 512, CHALK, BLUE_LIGHT, INK, 0.80),
    "apple-touch-icon.png": (SMALL, 180, CHALK, BLUE_LIGHT, INK, 0.80),
    "favicon-32.png": (SMALL, 32, INK, BLUE, None, 1.0),
}


def seg_distance(px, py, a, b):
    """Distance from every point in the grid to segment a-b."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / L2, 0.0, 1.0)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy))


def shape_sdf(px, py, shape):
    """Signed distance to one shape (negative inside the painted area)."""
    kind = shape[0]
    if kind == "poly":
        _, pts, width = shape
        d = np.full(px.shape, np.inf)
        for a, b in zip(pts, pts[1:]):
            d = np.minimum(d, seg_distance(px, py, a, b))
        return d - width / 2.0
    if kind == "ring":
        _, (cx, cy), r, width = shape
        return np.abs(np.hypot(px - cx, py - cy) - r) - width / 2.0
    if kind == "disc":
        _, (cx, cy), r = shape
        return np.hypot(px - cx, py - cy) - r
    raise ValueError(kind)


def over(dst_rgb, dst_a, src_rgb, src_a):
    """Standard source-over compositing on premultiplied-free float buffers."""
    out_a = src_a + dst_a * (1.0 - src_a)
    safe = np.where(out_a > 0, out_a, 1.0)
    out_rgb = (
        src_rgb * src_a[..., None] + dst_rgb * dst_a[..., None] * (1.0 - src_a[..., None])
    ) / safe[..., None]
    return out_rgb, out_a


def render(geometry, size, line, pad, background, scale):
    # Map pixel centres into mark space; `scale` < 1 leaves a margin round the mark.
    px_size = VIEWBOX / (size * scale)
    offset = (VIEWBOX - VIEWBOX / scale) / 2.0
    coords = offset + (np.arange(size) + 0.5) * px_size
    px, py = np.meshgrid(coords, coords)

    def coverage(sd):
        """1px-wide analytic anti-aliasing from a signed distance."""
        return np.clip(0.5 - sd / px_size, 0.0, 1.0)

    rgb = np.zeros((size, size, 3))
    alpha = np.zeros((size, size))
    if background is not None:
        rgb[:] = background
        alpha[:] = 1.0

    for role, colour in (("line", line), ("pad", pad)):
        sd = np.full((size, size), np.inf)
        for shape in geometry[role]:
            sd = np.minimum(sd, shape_sdf(px, py, shape))
        src = np.broadcast_to(np.array(colour, dtype=float), (size, size, 3))
        rgb, alpha = over(rgb, alpha, src, coverage(sd))

    buf = np.concatenate(
        [np.rint(rgb).clip(0, 255), np.rint(alpha * 255).clip(0, 255)[..., None]], axis=2
    ).astype(np.uint8)
    return Image.fromarray(buf, mode="RGBA")


def main():
    for name, (geometry, size, line, pad, background, scale) in OUTPUTS.items():
        img = render(geometry, size, line, pad, background, scale)
        path = PUBLIC / name
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path, "PNG", optimize=True)
        print(f"  wrote {name}  {size}x{size}  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
