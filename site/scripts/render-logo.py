#!/usr/bin/env python3
"""Rasterise the Atesor mark to PNG.

There is no SVG rasteriser on this machine (no rsvg/inkscape/cairosvg), and
adding one would mean a system package or a new npm dependency. It is not
needed: every element of the mark is a *stroke with round caps*, so each one
is exactly "within R of a line segment", and the body is a rounded rectangle
outline. That makes the whole thing a signed-distance field, which numpy
evaluates directly and which anti-aliases correctly at any size.

Geometry is transcribed from public/assets/atesor-logo.svg. Keep the two in
step: if the SVG changes, update GEOMETRY below and re-run.

Usage:
    python3 scripts/render-logo.py [size ...]      # default 512
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent / "public" / "assets"

# ---------------------------------------------------------------- geometry --
VIEWBOX = 512.0

# linearGradient id="core-body", gradientUnits="userSpaceOnUse"
GRAD_P0 = np.array([112.0, 112.0])
GRAD_P1 = np.array([400.0, 400.0])
GRAD_C0 = np.array([0xF9, 0xA8, 0x40], dtype=float)  # #F9A840
GRAD_C1 = np.array([0xF0, 0x6C, 0x00], dtype=float)  # #F06C00

VERIFIED = np.array([0x2D, 0xD4, 0xBF], dtype=float)  # #2DD4BF

# 12 pins: stroke-width 22 -> radius 11, round caps
PIN_R = 11.0
PINS = [
    ((176, 104), (176, 58)), ((256, 104), (256, 58)), ((336, 104), (336, 58)),
    ((176, 408), (176, 454)), ((256, 408), (256, 454)), ((336, 408), (336, 454)),
    ((104, 176), (58, 176)), ((104, 256), (58, 256)), ((104, 336), (58, 336)),
    ((408, 176), (454, 176)), ((408, 256), (454, 256)), ((408, 336), (454, 336)),
]

# package body: rect 112,112 288x288 rx=54, stroke-width 26 -> half-width 13
BODY_CENTER = np.array([256.0, 256.0])
BODY_HALF = np.array([144.0, 144.0])
BODY_RADIUS = 54.0
BODY_HALF_STROKE = 13.0

# the die: polyline, stroke-width 34 -> radius 17, round cap + round join
CHECK_R = 17.0
CHECK = [((186, 258), (238, 310)), ((238, 310), (330, 206))]


def seg_distance(px, py, a, b):
    """Distance from every point in the grid to segment a-b."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / L2, 0.0, 1.0)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy))


def round_box_sdf(px, py):
    """Signed distance to the rounded-rectangle boundary (negative inside)."""
    qx = np.abs(px - BODY_CENTER[0]) - BODY_HALF[0] + BODY_RADIUS
    qy = np.abs(py - BODY_CENTER[1]) - BODY_HALF[1] + BODY_RADIUS
    outside = np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0))
    inside = np.minimum(np.maximum(qx, qy), 0.0)
    return outside + inside - BODY_RADIUS


def over(dst_rgb, dst_a, src_rgb, src_a):
    """Standard source-over compositing on premultiplied-free float buffers."""
    out_a = src_a + dst_a * (1.0 - src_a)
    safe = np.where(out_a > 0, out_a, 1.0)
    out_rgb = (
        src_rgb * src_a[..., None] + dst_rgb * dst_a[..., None] * (1.0 - src_a[..., None])
    ) / safe[..., None]
    return out_rgb, out_a


def render(size):
    px_size = VIEWBOX / size                      # user units per device pixel
    coords = (np.arange(size) + 0.5) * px_size    # pixel centres in user space
    px, py = np.meshgrid(coords, coords)

    def coverage(sd):
        """1px-wide analytic anti-aliasing from a signed distance."""
        return np.clip(0.5 - sd / px_size, 0.0, 1.0)

    # gradient colour at every pixel
    d = GRAD_P1 - GRAD_P0
    t = np.clip(((px - GRAD_P0[0]) * d[0] + (py - GRAD_P0[1]) * d[1]) / d.dot(d), 0.0, 1.0)
    grad = GRAD_C0 + (GRAD_C1 - GRAD_C0) * t[..., None]

    rgb = np.zeros((size, size, 3))
    alpha = np.zeros((size, size))

    # pins — union of capsules, so take the nearest segment
    pin_sd = np.full((size, size), np.inf)
    for a, b in PINS:
        pin_sd = np.minimum(pin_sd, seg_distance(px, py, a, b) - PIN_R)
    rgb, alpha = over(rgb, alpha, grad, coverage(pin_sd))

    # package body — an outline, so distance to the *boundary*
    rgb, alpha = over(rgb, alpha, grad, coverage(np.abs(round_box_sdf(px, py)) - BODY_HALF_STROKE))

    # the check, on top. Round joins mean a union of capsules is exact.
    chk_sd = np.full((size, size), np.inf)
    for a, b in CHECK:
        chk_sd = np.minimum(chk_sd, seg_distance(px, py, a, b) - CHECK_R)
    verified = np.broadcast_to(VERIFIED, (size, size, 3))
    rgb, alpha = over(rgb, alpha, verified, coverage(chk_sd))

    buf = np.concatenate(
        [np.rint(rgb).clip(0, 255), np.rint(alpha * 255).clip(0, 255)[..., None]], axis=2
    ).astype(np.uint8)
    return Image.fromarray(buf, mode="RGBA")


def main():
    sizes = [int(a) for a in sys.argv[1:]] or [512]
    for s in sizes:
        img = render(s)
        name = "atesor-logo.png" if s == 512 else f"atesor-logo-{s}.png"
        path = OUT_DIR / name
        img.save(path, "PNG", optimize=True)
        print(f"  wrote {path.name}  {s}x{s}  {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
