"""Draw the stand-in photos that seeded cases point to (case_photos.path = sample_<category>_<kind>.jpg).

There are no real photos for the seeded history, so each category gets a simple illustration per stage:
original (reported), verdict (inspection, marked up), repair (fixed) and reopen (came back, worse).
They are SVGs in data/sample_photos/, served at /samples by backend/main.py.

    python backend/seed/make_sample_photos.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "data" / "sample_photos"
CATEGORIES = ["water_leak", "plumbing", "drainage", "sanitary_fittings", "electrical", "wall_crack", "structural_crack",
              "tiles", "ceiling", "door_window", "paint", "other"]
KINDS = ["original", "verdict", "repair", "reopen"]
STAGE = {"original": "defect", "verdict": "defect", "repair": "fixed", "reopen": "worse"}
W, H = 640, 480


def stain(cx: int, cy: int, r: int, worse: bool) -> str:
    r = int(r * 1.5) if worse else r
    drips = "".join(f'<ellipse cx="{cx + dx}" cy="{cy + r + 18 + i * 6}" rx="5" ry="9" fill="#8a6a3d" opacity="0.55"/>'
                    for i, dx in enumerate((-r // 3, 0, r // 4))) if worse else ""
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{int(r * 0.75)}" fill="url(#stain)"/>'
            f'<ellipse cx="{cx + r // 3}" cy="{cy - r // 4}" rx="{r // 2}" ry="{r // 3}" fill="url(#stain)" opacity="0.8"/>{drips}')


def crack(x: int, y: int, worse: bool, width: float) -> str:
    pts = [(x, y), (x + 30, y + 40), (x + 15, y + 85), (x + 50, y + 130), (x + 35, y + 175), (x + 70, y + 215)]
    if worse:
        pts += [(x + 60, y + 255), (x + 95, y + 300)]
    path = " ".join(f"{px},{py}" for px, py in pts)
    return f'<polyline points="{path}" fill="none" stroke="#3b3631" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round"/>'


def scene(cat: str, stage: str) -> str:
    defect, worse = stage != "fixed", stage == "worse"
    if cat in ("water_leak", "ceiling"):
        bg = '<rect width="640" height="480" fill="#e9e6df"/>' + "".join(
            f'<line x1="0" y1="{y}" x2="640" y2="{y}" stroke="#d8d4cb" stroke-width="2"/>' for y in (120, 240, 360))
        mark = stain(330, 210, 85, worse) if defect else '<rect x="250" y="140" width="170" height="140" fill="#f1efe9" stroke="#e0dcd3"/>'
        return bg + '<rect x="0" y="0" width="640" height="26" fill="#cfcac0"/>' + mark
    if cat in ("wall_crack", "structural_crack"):
        width = 7 if cat == "structural_crack" else 3.5
        mark = crack(280, 90, worse, width) if defect else crack(280, 90, False, 0.8).replace("#3b3631", "#d9d1c3")
        return '<rect width="640" height="480" fill="#efe6d6"/><rect y="420" width="640" height="60" fill="#c9b79c"/>' + mark
    if cat == "tiles":
        tiles = "".join(f'<rect x="{x}" y="{y}" width="156" height="156" fill="{"#dcd6cc" if (x, y) == (164, 164) and not defect else "#ece9e3"}" stroke="#b9b2a6" stroke-width="4"/>'
                        for x in (4, 164, 324, 484) for y in (4, 164, 324))
        mark = ('<polyline points="180,190 230,245 215,280 270,300 300,310" fill="none" stroke="#5a544c" stroke-width="3"/>'
                + ('<polyline points="340,180 380,230 365,290" fill="none" stroke="#5a544c" stroke-width="3"/>' if worse else "")) if defect else ""
        return tiles + mark
    if cat == "paint":
        flakes = "".join(f'<path d="M{x} {y} q30 -20 55 5 q-10 30 -45 25 z" fill="#ffffff" stroke="#d6cfc3"/>'
                         for x, y in ((220, 160), (300, 220), (250, 280)) + (((360, 170), (190, 240)) if worse else ()))
        return '<rect width="640" height="480" fill="#a9c3c9"/>' + (flakes if defect else "")
    if cat == "electrical":
        scorch = f'<ellipse cx="320" cy="240" rx="{110 if worse else 80}" ry="{95 if worse else 70}" fill="url(#scorch)"/>' if defect else ""
        return ('<rect width="640" height="480" fill="#eeeae4"/>' + scorch
                + '<rect x="260" y="190" width="120" height="100" rx="10" fill="#fbfaf8" stroke="#b8b2a8" stroke-width="3"/>'
                + '<rect x="295" y="215" width="12" height="26" rx="2" fill="#555"/><rect x="333" y="215" width="12" height="26" rx="2" fill="#555"/>'
                + '<circle cx="320" cy="262" r="8" fill="#555"/>')
    if cat == "door_window":
        tilt = (4 if worse else 2.5) if defect else 0
        return ('<rect width="640" height="480" fill="#e8e2d6"/><rect x="190" y="40" width="260" height="440" fill="#6d5643"/>'
                f'<g transform="rotate({tilt} 205 60)"><rect x="205" y="55" width="230" height="425" fill="#a07850" stroke="#5c4634" stroke-width="3"/>'
                '<circle cx="410" cy="270" r="9" fill="#d4b26a"/></g>')
    if cat == "drainage":
        pool = f'<ellipse cx="320" cy="300" rx="{230 if worse else 170}" ry="{95 if worse else 70}" fill="#9fb8c4" opacity="0.75"/>' if defect else ""
        return ('<rect width="640" height="480" fill="#d9d5cd"/>' + pool
                + '<circle cx="320" cy="300" r="34" fill="#9a958c" stroke="#77736b" stroke-width="4"/>'
                + "".join(f'<line x1="{x}" y1="276" x2="{x}" y2="324" stroke="#6b675f" stroke-width="3"/>' for x in (306, 320, 334)))
    if cat in ("plumbing", "sanitary_fittings"):
        drops = "".join(f'<ellipse cx="330" cy="{y}" rx="6" ry="10" fill="#6c9bb5"/>' for y in ((300, 340, 380) if worse else (310, 350))) if defect else ""
        puddle = f'<ellipse cx="330" cy="440" rx="{150 if worse else 100}" ry="22" fill="#9fb8c4"/>' if defect else ""
        return ('<rect width="640" height="480" fill="#eceae5"/><rect y="420" width="640" height="60" fill="#cfcac0"/>'
                + '<rect x="160" y="80" width="340" height="90" rx="20" fill="#fafafa" stroke="#c7c3bb" stroke-width="3"/>'
                + '<rect x="315" y="170" width="30" height="80" fill="#b9bcbf"/><path d="M330 250 v30 h60 v-25" fill="none" stroke="#b9bcbf" stroke-width="22"/>'
                + drops + puddle)
    mark = f'<rect x="270" y="190" width="{140 if worse else 100}" height="{100 if worse else 70}" rx="12" fill="#8d8478" opacity="0.6"/>' if defect else ""
    return '<rect width="640" height="480" fill="#e7e3dc"/>' + mark


def inspection_markup() -> str:
    return ('<ellipse cx="330" cy="235" rx="200" ry="160" fill="none" stroke="#e11d48" stroke-width="5" stroke-dasharray="18 10"/>'
            '<g transform="translate(470 330)"><rect width="120" height="80" rx="10" fill="#1f2937"/>'
            '<rect x="12" y="12" width="96" height="34" rx="4" fill="#a7f3d0"/>'
            '<text x="60" y="36" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#065f46">CHECK</text></g>')


def svg(cat: str, kind: str) -> str:
    label = f"Sample photo · {cat.replace('_', ' ').capitalize()}"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<defs>
<radialGradient id="stain"><stop offset="0" stop-color="#8a6a3d" stop-opacity="0.75"/><stop offset="0.7" stop-color="#a9875a" stop-opacity="0.45"/><stop offset="1" stop-color="#c9b18a" stop-opacity="0"/></radialGradient>
<radialGradient id="scorch"><stop offset="0" stop-color="#1c1917" stop-opacity="0.85"/><stop offset="0.6" stop-color="#57534e" stop-opacity="0.4"/><stop offset="1" stop-color="#78716c" stop-opacity="0"/></radialGradient>
</defs>
{scene(cat, STAGE[kind])}
{inspection_markup() if kind == "verdict" else ""}
<rect x="12" y="12" rx="6" width="{len(label) * 8 + 16}" height="26" fill="#000" opacity="0.45"/>
<text x="20" y="30" font-family="Arial, sans-serif" font-size="14" fill="#fff">{label}</text>
</svg>
'''


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for cat in CATEGORIES:
        for kind in KINDS:
            (OUT / f"sample_{cat}_{kind}.svg").write_text(svg(cat, kind), encoding="utf-8")
    print(f"Wrote {len(CATEGORIES) * len(KINDS)} sample photos to {OUT}")


if __name__ == "__main__":
    main()
