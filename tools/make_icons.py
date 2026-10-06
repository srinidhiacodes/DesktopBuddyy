"""Draw the tray icons (white drop on a pink circle; grey when she is off)
and the app icons for Windows (.ico) and Mac (.icns). Writes app/icons/. Needs Pillow."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "icons"
PINK = (184, 69, 127, 255)
GREY = (109, 90, 102, 255)
WHITE = (255, 255, 255, 255)


def drop(draw, cx, cy, h, fill):
    """A water drop of height h centred on (cx, cy): round bottom, pointed top."""
    r = h * 0.34
    by = cy + h / 2 - r                     # centre of the round part
    top = (cx, cy - h / 2)
    draw.ellipse((cx - r, by - r, cx + r, by + r), fill=fill)
    # sides from the tip down to where they meet the circle
    draw.polygon([top, (cx - r * 0.97, by - r * 0.25), (cx + r * 0.97, by - r * 0.25)], fill=fill)


def icon(size, bg, ring=False):
    s = 8                                   # draw big, then shrink for smooth edges
    big = size * s
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if ring:
        d.ellipse((0, 0, big - 1, big - 1), fill=WHITE)
        pad = big * 0.09
        d.ellipse((pad, pad, big - 1 - pad, big - 1 - pad), fill=bg)
    else:
        d.ellipse((0, 0, big - 1, big - 1), fill=bg)
    drop(d, big / 2, big / 2, big * 0.56, WHITE)
    return im.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, bg, ring in [("tray-on", PINK, False), ("tray-off", GREY, True)]:
        icon(16, bg, ring).save(OUT / f"{name}.png")
        icon(32, bg, ring).save(OUT / f"{name}@2x.png")
    big = icon(256, PINK)
    big.save(OUT / "app.png")
    big.save(OUT / "app.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    # Mac icon: drawn at 1024 px; Pillow writes every size macOS needs.
    icon(1024, PINK).save(OUT / "app.icns")
    print("wrote", ", ".join(sorted(p.name for p in OUT.iterdir())))


if __name__ == "__main__":
    main()
