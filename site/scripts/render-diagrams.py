"""Write the architecture diagram of the docs, one SVG for each theme.

The light and the dark file share one layout, so they cannot drift
apart. Run it from site/ after a change to the graph in src/graph.py:

    python3 scripts/render-diagrams.py

Output: public/docs/diagrams/architecture-light.svg and
architecture-dark.svg, served at /atesor/docs/diagrams/. The README of
the atesor repository shows these files from eclipse.dev.

Layout: three columns of the same width. The usual path of a run goes
down the centre column. Each side branch sits next to the node that
starts it.
"""
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent.parent / "public" / "docs" / "diagrams"

W = 780
SANS = ("ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, "
        "'Helvetica Neue', Arial, sans-serif")
MONO = ("ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, "
        "'Liberation Mono', monospace")

# The grid: three columns, 216 wide, 28 apart.
COL_W, GUTTER, LEFT = 216, 28, 32
COL_X = [LEFT + i * (COL_W + GUTTER) for i in range(3)]   # 32, 276, 520
COL_C = [x + COL_W // 2 for x in COL_X]                    # 140, 384, 628
LINE_H = 17                      # one line of description
RADIUS = 8                       # corner radius of a connector

# Brand palette (BRAND.md). Malachite means "verified" only.
THEMES = {
    "light": {
        "text": "#1B1E22", "muted": "#555D66", "line": "#8A929B",
        "node": "#FFFFFF", "node_stroke": "#9BA3AD",
        "frame": "#F2F2EF", "frame_stroke": "#C6CBD1",
        "sub": "#E8EAEC", "accent": "#2142B0", "on_accent": "#FFFFFF",
        "verified": "#2E9B6F",
    },
    "dark": {
        "text": "#ECEEEF", "muted": "#9BA3AD", "line": "#7D858F",
        "node": "#23272C", "node_stroke": "#616973",
        "frame": "#1B1E22", "frame_stroke": "#3A4047",
        "sub": "#16191C", "accent": "#8CA3FF", "on_accent": "#111316",
        "verified": "#3FBF88",
    },
}

TITLE = "Eclipse Atesor architecture"
DESC = (
    "main.py checks the URL, the recipe cache and the API key, and starts "
    "the riscv64 sandbox. A cache hit writes the recipe and stops. "
    "Otherwise the LangGraph state graph runs init_node, analyst_node (LLM) "
    "and heuristic_plan_node, or scout_node (LLM) when there is no default "
    "plan. supervisor_node routes by rules: to the build_fix_subgraph "
    "(build_node, verify_node, fix_node with an LLM) and back, to "
    "finish_node (LLM) on success, or to escalate_node at a limit. With "
    "--optimize, cached_recipe_node reuses a verified plan and "
    "optimize_node (LLM) tries faster tunes. A verified port goes into the "
    "memory, and the recipe cache uses it on the next run."
)


class Svg:
    def __init__(self, c):
        self.c = c
        self.back = []      # frames, drawn first
        self.parts = []

    def add(self, s, back=False):
        (self.back if back else self.parts).append(s)

    def text(self, x, y, s, size=12.5, color="text", font=SANS, weight=400,
             anchor="start", rotate=False):
        rot = f' transform="rotate(-90 {x} {y})"' if rotate else ""
        self.add(
            f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" '
            f'font-weight="{weight}" fill="{self.c[color]}" '
            f'text-anchor="{anchor}"{rot}>{escape(s)}</text>')

    def label(self, x, y, s, anchor="start", rotate=False):
        self.text(x, y, s, size=11.5, color="muted", anchor=anchor,
                  rotate=rotate)

    def rect(self, x, y, w, h, fill, stroke, rx=10, dash=False, width=1.25,
             back=False):
        d = ' stroke-dasharray="5 4"' if dash else ""
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
            f'fill="{self.c[fill]}" stroke="{self.c[stroke]}" '
            f'stroke-width="{width}"{d}/>', back=back)

    def node(self, x, y, name, lines=(), w=COL_W, llm=False, dash=False,
             verified=False, mono=True):
        """A box with a name and its lines of description. Returns h."""
        h = 34 + LINE_H * len(lines)
        stroke = "verified" if verified else "node_stroke"
        self.rect(x, y, w, h, "node", stroke, dash=dash,
                  width=1.75 if verified else 1.25)
        self.text(x + 14, y + 22, name, size=14, weight=600,
                  font=MONO if mono else SANS)
        for i, line in enumerate(lines):
            self.text(x + 14, y + 40 + LINE_H * i, line, color="muted")
        if llm:
            self.rect(x + w - 48, y + 9, 36, 18, "accent", "accent", rx=9,
                      width=0)
            self.text(x + w - 30, y + 22, "LLM", size=10.5, weight=700,
                      color="on_accent", anchor="middle")
        return h

    def wire(self, points, dash=False, both=False, dot=False):
        """An orthogonal connector with round corners and an arrow head."""
        d = f"M{points[0][0]} {points[0][1]}"
        for i in range(1, len(points) - 1):
            (x0, y0), (x1, y1), (x2, y2) = points[i - 1], points[i], points[i + 1]
            r = min(RADIUS, abs(x1 - x0 + y1 - y0) / 2,
                    abs(x2 - x1 + y2 - y1) / 2)
            ax = x1 - r * _sign(x1 - x0)
            ay = y1 - r * _sign(y1 - y0)
            bx = x1 + r * _sign(x2 - x1)
            by = y1 + r * _sign(y2 - y1)
            d += f" L{ax} {ay} Q{x1} {y1} {bx} {by}"
        d += f" L{points[-1][0]} {points[-1][1]}"
        dd = ' stroke-dasharray="5 4"' if dash else ""
        if dot:
            dd = ' stroke-dasharray="2 3" stroke-linecap="round"'
        start = ' marker-start="url(#head)"' if both else ""
        self.add(
            f'<path d="{d}" fill="none" stroke="{self.c["line"]}" '
            f'stroke-width="1.5" stroke-linejoin="round"{dd}{start} '
            f'marker-end="url(#head)"/>')

    def frame(self, x, y, w, h, cut=18):
        """The graph frame, with the cut top-left corner of the mark."""
        d = f"M{x + cut} {y} H{x + w} V{y + h} H{x} V{y + cut} Z"
        self.add(f'<path d="{d}" fill="{self.c["frame"]}" '
                 f'stroke="{self.c["frame_stroke"]}" stroke-width="1.25"/>',
                 back=True)

    def svg(self, height):
        head = (
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {W} {height}" width="{W}" height="{height}" '
            f'role="img" aria-labelledby="title desc">\n'
            f'<title id="title">{TITLE}</title>\n'
            f'<desc id="desc">{escape(DESC)}</desc>\n'
            f'<defs><marker id="head" viewBox="0 0 10 10" refX="8.5" '
            f'refY="5" markerWidth="6.5" markerHeight="6.5" '
            f'orient="auto-start-reverse">'
            f'<path d="M1 1 L9 5 L1 9 Z" fill="{self.c["line"]}"/>'
            f'</marker></defs>\n')
        return head + "\n".join(self.back + self.parts) + "\n</svg>\n"


def _sign(v):
    return (v > 0) - (v < 0)


def draw(c):
    s = Svg(c)
    c1, c2, c3 = COL_X
    m1, m2, m3 = COL_C
    right = lambda x: x + COL_W            # noqa: E731

    # --- Before the graph: main.py and the recipe cache ----------------
    s.rect(c2, 16, COL_W, 34, "node", "node_stroke", rx=17)
    s.text(m2, 38, "atesor-ai --repo <url>", size=13.5, weight=600,
           font=MONO, anchor="middle")
    s.wire([(m2, 50), (m2, 70)])

    y = 72
    h = s.node(c2, y, "main.py", ["checks the URL, the recipe",
                                  "cache and the API key, then",
                                  "starts the riscv64 sandbox"])
    s.node(c3, y, "Recipe cache hit", ["no --force, no --optimize:",
                                       "write the recipe, exit 0",
                                       "or 3, build nothing"], mono=False)
    hit_y = y + 30
    s.wire([(right(c2), hit_y), (c3 - 2, hit_y)])
    s.label((right(c2) + c3) // 2, hit_y - 7, "hit", anchor="middle")
    s.node(c1, y, "riscv64 sandbox", ["Alpine or Debian container,",
                                      "under QEMU or on a native",
                                      "riscv64 machine"], mono=False)
    s.wire([(c2, hit_y), (right(c1) + 2, hit_y)])
    main_bottom = y + h
    box_bottom = main_bottom          # bottom of the sandbox box

    # --- The state graph ------------------------------------------------
    top = main_bottom + 28
    s.label(m2 + 8, main_bottom + 21, "miss")
    s.text(m2 + 18, top + 24, "LangGraph state graph", size=13, weight=700)
    s.text(m2 + 198, top + 24, "src/graph.py", size=12.5, color="muted",
           font=MONO)

    y = top + 40
    s.wire([(m2, main_bottom), (m2, y - 2)])
    h = s.node(c2, y, "init_node", ["clone in the sandbox, then",
                                    "a scripted analysis"])
    s.node(c3, y, "cached_recipe_node", ["with --optimize: reuse a",
                                         "verified cached plan, then",
                                         "go to supervisor_node"],
           dash=True)
    s.wire([(right(c2), y + 30), (c3 - 2, y + 30)], dash=True)
    # init_node clones and scans in the sandbox.
    sx_init = right(c1) - 44
    s.wire([(c2, y + 48), (sx_init, y + 48), (sx_init, box_bottom + 2)],
           dot=True)
    s.label(sx_init - 8, y + 26, "clone, scan", anchor="end")

    y2 = y + h + 32
    s.wire([(m2, y + h), (m2, y2 - 2)])
    y = y2
    h = s.node(c2, y, "analyst_node", ["read the build files and",
                                       "docs, write the analysis"],
               llm=True)

    y2 = y + h + 32
    s.wire([(m2, y + h), (m2, y2 - 2)])
    y = y2
    h = s.node(c2, y, "heuristic_plan_node", ["default plan for Make,",
                                              "CMake, autotools and Go"])
    s.node(c3, y, "scout_node", ["when there is no default",
                                 "plan: write a build plan"], llm=True)
    s.wire([(right(c2), y + 30), (c3 - 2, y + 30)])
    scout_bottom = y + h

    y2 = y + h + 40
    s.wire([(m2, y + h), (m2, y2 - 2)])
    y = y2
    h = s.node(c2, y, "supervisor_node", ["route by rules"])
    sup_mid = y + 25
    sup_bottom = y + h

    # Two-way links: build loop on the left, scout on the right.
    row = sup_bottom + 40                 # top of the next row
    s.wire([(c2 - 2, sup_mid), (m1, sup_mid), (m1, row - 2)], both=True)
    s.label(m1 + 10, sup_mid - 8, "build, then back")
    s.wire([(right(c2) + 2, sup_mid), (c3 + 160, sup_mid),
            (c3 + 160, scout_bottom + 2)], both=True)
    s.label(right(c2) + 10, sup_mid - 8, "plan, or a new plan")

    # Down: escalate below, finish to the right.
    fork = sup_bottom + 19
    s.wire([(m2, sup_bottom), (m2, row - 2)])
    s.wire([(m2, fork), (m3, fork), (m3, row - 2)])
    s.label(m2 - 8, fork + 14, "limit reached", anchor="end")
    s.label(m3 - 10, fork - 6, "SUCCESS", anchor="end")

    # The build-fix subgraph, in the left column.
    s.rect(c1, row, COL_W, 285, "sub", "frame_stroke", rx=12)
    s.text(c1 + 40, row + 24, "build_fix_subgraph", size=13, weight=700,
           font=MONO)
    sx_loop = c1 + 22
    s.wire([(sx_loop, row), (sx_loop, box_bottom + 2)], dot=True)
    s.label(sx_loop + 8, (box_bottom + row) // 2 + 60, "build, verify")
    s.label(sx_loop + 8, (box_bottom + row) // 2 + 77, "and fix commands")
    nx, nw = c1 + 32, COL_W - 64
    ny = row + 54
    nh = s.node(nx, ny, "build_node", ["plan + 23 rules"], w=nw)
    s.node(nx, ny + nh + 30, "verify_node", ["ELF check"], w=nw,
           verified=True)
    s.node(nx, ny + 2 * (nh + 30), "fix_node", ["apply a fix"], w=nw,
           llm=True)
    cx = nx + nw // 2
    s.wire([(cx, ny + nh), (cx, ny + nh + 28)])
    s.label(cx + 8, ny + nh + 19, "pass")
    s.wire([(cx, ny + 2 * nh + 30), (cx, ny + 2 * nh + 58)])
    s.label(cx + 8, ny + 2 * nh + 49, "fail")
    fix_mid = ny + 2 * (nh + 30) + nh // 2
    build_mid = ny + nh // 2
    s.wire([(nx, build_mid), (nx - 12, build_mid), (nx - 12, fix_mid),
            (nx - 2, fix_mid)])
    s.label(nx - 18, (build_mid + fix_mid) // 2, "fail", anchor="middle",
            rotate=True)
    s.wire([(nx + nw, fix_mid), (nx + nw + 12, fix_mid),
            (nx + nw + 12, build_mid), (nx + nw + 2, build_mid)])
    s.label(nx + nw + 26, (build_mid + fix_mid) // 2, "retry",
            anchor="middle", rotate=True)
    sub_bottom = row + 285

    # Escalation in the centre, finish and performance mode on the right.
    s.node(c2, row, "escalate_node", ["write a report for", "a person"])
    h = s.node(c3, row, "finish_node", ["package tests, recipe,",
                                        "learning"], llm=True)
    fin_bottom = row + h
    opt_y = fin_bottom + 50
    oh = s.node(c2, opt_y, "optimize_node", ["faster tunes, timed on",
                                             "native hardware"],
                llm=True, dash=True)
    s.wire([(c3 + 40, fin_bottom), (c3 + 40, opt_y + oh // 2),
            (right(c2) + 2, opt_y + oh // 2)], dash=True)
    s.label(c3 + 48, fin_bottom + 26, "--optimize")

    bottom = max(sub_bottom, opt_y + oh) + 20
    s.frame(16, top, 736, bottom - top)

    # --- After the graph: outputs and memory ----------------------------
    out_y = bottom + 30
    s.wire([(right(c1) + GUTTER // 2, bottom), (right(c1) + GUTTER // 2,
                                                 out_y - 2)])
    s.label(right(c1) + GUTTER // 2 + 8, bottom + 20,
            "END: main.py writes the files")
    oh = s.node(c1, out_y, "Outputs",
                ["<repo>_recipe.md, the report, state.json,",
                 "patches, logs, a zip with --package"],
                w=right(c2) - c1, mono=False)
    s.node(c3, out_y, "Memory", ["recipe cache and",
                                 "few-shot examples"], mono=False)
    s.wire([(c3 + 160, fin_bottom), (c3 + 160, out_y - 2)])
    s.label(c3 + 152, out_y - 12, "verified port", anchor="end")

    # The learning loop: memory feeds the recipe cache of the next run.
    loop_x = W - 18
    s.wire([(right(c3), out_y + 34), (loop_x, out_y + 34), (loop_x, hit_y),
            (right(c3) + 2, hit_y)], dash=True)
    s.label(loop_x + 14, (hit_y + out_y) // 2, "reused on the next run",
            anchor="middle", rotate=True)

    # --- Legend -----------------------------------------------------------
    y = out_y + oh + 36
    s.rect(c1, y - 13, 36, 18, "accent", "accent", rx=9, width=0)
    s.text(c1 + 18, y, "LLM", size=10.5, weight=700, color="on_accent",
           anchor="middle")
    s.label(c1 + 44, y, "can call an LLM")
    s.rect(c1 + 160, y - 13, 30, 18, "node", "node_stroke", rx=5)
    s.label(c1 + 198, y, "scripts and rules only")
    s.rect(c1 + 360, y - 13, 30, 18, "node", "node_stroke", rx=5,
           dash=True)
    s.label(c1 + 398, y, "--optimize only")
    s.rect(c1 + 520, y - 13, 30, 18, "node", "verified", rx=5, width=1.75)
    s.label(c1 + 558, y, "proves riscv64")
    y += 28
    s.wire([(c1, y - 4), (c1 + 34, y - 4)], dot=True)
    s.label(c1 + 44, y, "runs commands in the sandbox")
    s.label(c1, y + 28, "cached_recipe_node, analyst_node, scout_node, "
            "finish_node and optimize_node also use the sandbox.")
    s.label(c1, y + 46, "One AgentState carries the data of a run. "
            "Architecture overview gives each routing condition.")
    return s.svg(y + 62)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, colours in THEMES.items():
        path = OUT / f"architecture-{name}.svg"
        path.write_text(draw(colours), encoding="utf-8")
        print(path, path.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
