"""Turn the green-screen clips into transparent WebM videos for the app.

For each clip this script:
  1. lines her up with the Focus clip (same size and position in every clip),
  2. removes the green background and the green fringe on her edges,
  3. crops every clip to the same box and fades out the bottom edge,
  4. writes a VP9 WebM with transparency plus a PNG of the first frame.
It also writes app/media/clips.json with the clips' size, which the app reads.

A clip can use only part of its source and loop smoothly (see TRIM).

Usage:  python3 tools/clean_clips.py [--out app/media] [--clips idle1 drink ...]
Needs:  ffmpeg on PATH, numpy, Pillow.
"""

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source" / "clips"

CLIPS = ["idle1", "idle2", "focus", "drink", "stretch"]
# Optional: her working on a laptop, played during focus. Used when the file exists.
if (SRC / "work.mp4").exists():
    CLIPS.append("work")
# Clips that use only part of their source, as (start s, end s, frame to line up on s,
# loop blend s). The laptop clip zooms in and out of her normal pose at both ends;
# only the typing part is kept, and its last half-second blends into its start so
# it loops without a jump (the start/end pair was picked as the most alike frames).
TRIM = {"work": (2.67, 7.25, 3.0, 0.5)}
# Clips lined up by her pupils instead of her whole face: she faces the viewer
# in the laptop clip but turns slightly in the others.
BY_EYES = {"work"}
REFERENCE = "focus"          # every clip is lined up to this one
SIDE_ROOM = 60               # extra room each side, for things she holds out (the laptop)
CANVAS = (540 + 2 * SIDE_ROOM, 960)   # reference clip size (w, h) plus that room
FACE = (110, 330, 440, 620)  # her face in the reference clip's first frame (x0, y0, x1, y1)

# Keying: "greenness" = G - max(R, B). Below KEY_LO she is solid, above KEY_HI it's background.
KEY_LO, KEY_HI = 28, 95
FADE_PX = 28                 # soft fade at the bottom edge, in output pixels
PAD = 6                      # empty margin kept around her when cropping


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", str(path)],
        capture_output=True, text=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    return s["width"], s["height"], f"{num}/{den}"


def frames(path, w, h, limit=None, start=None, end=None):
    """Yield frames as (h, w, 3) uint8 arrays: all, the first `limit`, or those
    from `start` to `end` seconds."""
    cmd = ["ffmpeg", "-v", "error", "-i", str(path)]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    if end is not None:
        cmd += ["-to", f"{end:.3f}"]
    if limit:
        cmd += ["-frames:v", str(limit)]
    p = subprocess.Popen(cmd + ["-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         stdout=subprocess.PIPE)
    size = w * h * 3
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, np.uint8).reshape(h, w, 3)
    p.wait()


def first_frame(path, at=None):
    w, h, _ = probe(path)
    return next(frames(path, w, h, limit=1, start=at))


def clip_frames(p):
    start, end = (p["trim"][0], p["trim"][1]) if p["trim"] else (None, None)
    return frames(p["path"], p["w"], p["h"], start=start, end=end)


def background_colour(rgb):
    """Average colour of the four corners (always green in these clips)."""
    c = np.concatenate([rgb[:16, :16], rgb[:16, -16:], rgb[-16:, :16], rgb[-16:, -16:]])
    return c.reshape(-1, 3).mean(0)


def grey(rgb, size=None):
    img = Image.fromarray(rgb).convert("L")
    if size:
        img = img.resize(size, Image.BICUBIC)
    return np.asarray(img, np.float64)


def match(img, tpl):
    """Normalised cross-correlation of tpl over img (valid positions only).

    Returns (best score, x, y) of the template's top-left corner.
    """
    th, tw = tpl.shape
    ih, iw = img.shape
    t = tpl - tpl.mean()
    t /= np.sqrt((t ** 2).sum())
    shape = (ih + th, iw + tw)
    corr = np.fft.irfft2(np.fft.rfft2(img, shape) * np.fft.rfft2(t[::-1, ::-1], shape), shape)
    corr = corr[th - 1:ih, tw - 1:iw]
    # Local standard deviation of each img window, from summed-area tables.
    def window_sum(a):
        c = np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        return c[th:, tw:] - c[:-th, tw:] - c[th:, :-tw] + c[:-th, :-tw]
    n = th * tw
    var = window_sum(img ** 2) - window_sum(img) ** 2 / n
    score = corr / np.sqrt(np.maximum(var, 1e-6))
    y, x = np.unravel_index(np.argmax(score), score.shape)
    return score[y, x], x, y


def register(src_rgb, ref_rgb):
    """Find scale s and offset (dx, dy) so that s*src + (dx, dy) puts her face where it is in ref.

    Her face (eyes, hair clip, nose) is the steadiest part of every clip, so it is
    used as a template and searched for at many scales, at half resolution.
    """
    q = 2
    x0, y0, x1, y1 = FACE
    rh, rw = ref_rgb.shape[:2]
    ref = grey(ref_rgb, (rw // q, rh // q))
    tpl = ref[y0 // q:y1 // q, x0 // q:x1 // q]
    sh, sw = src_rgb.shape[:2]
    base = rw / sw
    best = None
    for s in base * (1 + 0.004 * np.arange(-40, 41)):
        img = grey(src_rgb, (round(sw * s / q), round(sh * s / q)))
        score, x, y = match(img, tpl)
        if best is None or score > best[0]:
            # face top-left sits at (x, y) in the scaled source; move it to (x0, y0)
            best = (score, s, x0 - x * q, y0 - y * q)
    return best


ERODE = 4   # pixels (at half resolution) taken off dark areas when looking for pupils


def pupils(rgb):
    """Centres of her two pupils, (x, y) in pixels, left one first.

    Pupils are the large, round, very dark spots fully surrounded by her face.
    They are found at half resolution as connected dark patches that are round,
    fairly solid and of eye size; the two biggest at about the same height win.
    """
    q = 2
    h, w = rgb.shape[0] // q, rgb.shape[1] // q
    dark = np.asarray(Image.fromarray(rgb).convert("L").resize((w, h)), np.int16) < 28
    # Shrink the dark areas a little: this cuts the thin eyelash lines that join
    # each pupil to her hair, while the big round pupils survive.
    for _ in range(ERODE):
        d = dark.copy()
        d[1:, :] &= dark[:-1, :]
        d[:-1, :] &= dark[1:, :]
        d[:, 1:] &= dark[:, :-1]
        d[:, :-1] &= dark[:, 1:]
        dark = d
    seen = np.zeros_like(dark)
    found = []
    for y0, x0 in zip(*np.nonzero(dark)):
        if seen[y0, x0]:
            continue
        stack, pts = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        ys, xs = np.array(pts).T
        bw, bh = np.ptp(xs) + 1, np.ptp(ys) + 1
        area = len(pts)
        if not (0.0006 < area / (w * h) < 0.02):
            continue
        if not (0.6 < bw / bh < 1.6) or area / (bw * bh) < 0.55:
            continue
        found.append((area, xs.mean() * q, ys.mean() * q))
    found.sort(reverse=True)
    for i, a in enumerate(found):
        for b in found[i + 1:]:
            if abs(a[2] - b[2]) < 0.06 * rgb.shape[0] and abs(a[1] - b[1]) > 0.08 * rgb.shape[1]:
                left, right = sorted([a, b], key=lambda e: e[1])
                return (left[1], left[2]), (right[1], right[2])
    raise ValueError("could not find both pupils")


def face_width(rgb, eyes):
    """Width of her face (skin between her hair) around eye level, in pixels."""
    a = rgb.astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    skin = (r > g) & (g > b) & (r - b > 45) & (r > 120)
    (_, ly), (_, ry) = eyes
    widths = []
    for y in range(int(min(ly, ry)), int(max(ly, ry)) + 40, 4):
        xs = np.nonzero(skin[y])[0]
        if len(xs) > 10:
            widths.append(xs.max() - xs.min())
    return float(np.median(widths))


def register_eyes(src_rgb, ref_rgb):
    """Like register(), for clips where she faces a different way, so her face
    doesn't match the reference as a picture. Her size comes from her face width
    (eye distance would mislead: turned slightly, her eyes look closer together),
    and the point between her pupils goes where it is in the reference."""
    ref_eyes, src_eyes = pupils(ref_rgb), pupils(src_rgb)
    (ax, ay), (bx, by) = ref_eyes
    (cx, cy), (ex, ey) = src_eyes
    s = face_width(ref_rgb, ref_eyes) / face_width(src_rgb, src_eyes)
    dx = (ax + bx) / 2 - s * (cx + ex) / 2
    dy = (ay + by) / 2 - s * (cy + ey) / 2
    return 1.0, s, int(round(dx)), int(round(dy))


def place(rgb, s, dx, dy, bg):
    """Scale and shift a frame onto the reference canvas; empty space is filled with bg."""
    img = Image.fromarray(rgb)
    # PIL's affine maps output -> input: x_in = (x_out - dx) / s
    dx += SIDE_ROOM
    data = (1 / s, 0, -dx / s, 0, 1 / s, -dy / s)
    fill = tuple(int(round(v)) for v in bg)
    return np.asarray(img.transform(CANVAS, Image.AFFINE, data, Image.BICUBIC, fillcolor=fill))


def key(rgb):
    """Return an RGBA frame with the green removed and green spill cleaned off."""
    a = rgb.astype(np.float32)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    rb = np.maximum(r, b)
    greenness = g - rb
    alpha = np.clip(1 - (greenness - KEY_LO) / (KEY_HI - KEY_LO), 0, 1)
    alpha[alpha < 0.04] = 0
    # Despill: green may never be brighter than the stronger of red/blue.
    g = np.minimum(g, rb + 6)
    out = np.dstack([r, g, b, alpha * 255])
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def blend(a, b, t):
    """Mix two RGBA frames (t = share of b), weighting colour by transparency
    so no dark or green edges appear where only one frame has her."""
    a = a.astype(np.float32)
    b = b.astype(np.float32)
    wa, wb = a[:, :, 3:] * (1 - t), b[:, :, 3:] * t
    alpha = wa + wb
    rgb = (a[:, :, :3] * wa + b[:, :, :3] * wb) / np.maximum(alpha, 1e-3)
    return np.clip(np.dstack([rgb, alpha]) + 0.5, 0, 255).astype(np.uint8)


def soft_bottom(rgba, bottom):
    """Fade alpha to zero over FADE_PX rows ending at `bottom`."""
    ramp = np.linspace(1, 0, FADE_PX, dtype=np.float32)
    a = rgba[bottom - FADE_PX:bottom, :, 3].astype(np.float32) * ramp[:, None]
    rgba[bottom - FADE_PX:bottom, :, 3] = a.astype(np.uint8)
    rgba[bottom:, :, 3] = 0
    return rgba


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "app" / "media"))
    ap.add_argument("--clips", nargs="*", default=CLIPS)
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    ref = first_frame(SRC / f"{REFERENCE}.mp4")
    plan = {}
    for name in CLIPS:
        path = SRC / f"{name}.mp4"
        w, h, fps = probe(path)
        trim = TRIM.get(name)
        align = register_eyes if name in BY_EYES else register
        score, s, dx, dy = align(first_frame(path, trim[2] if trim else None), ref)
        bg = background_colour(first_frame(path))
        plan[name] = dict(path=path, w=w, h=h, fps=fps, s=s, dx=dx, dy=dy, bg=bg, trim=trim)
        print(f"{name:8s} {w}x{h} @{fps}  scale {s:.3f}  shift ({dx:+d}, {dy:+d})  face match {score:.3f}")

    # Pass 1: one crop box that fits her in every frame of every clip.
    # The bottom is the highest of the clips' bottom edges, so none shows a hard cut.
    x0, y0, x1, y1 = CANVAS[0], CANVAS[1], 0, 0
    bottom = CANVAS[1]
    for name, p in plan.items():
        bottom = min(bottom, int(p["dy"] + p["h"] * p["s"]) - 2)
        p["count"] = 0
        for rgb in clip_frames(p):
            p["count"] += 1
            al = key(place(rgb, p["s"], p["dx"], p["dy"], p["bg"]))[:, :, 3]
            ys, xs = np.nonzero(al > 8)
            x0, x1 = min(x0, xs.min()), max(x1, xs.max())
            y0, y1 = min(y0, ys.min()), max(y1, ys.max())
    y1 = min(y1, bottom)
    x0, y0 = max(0, x0 - PAD), max(0, y0 - PAD)
    x1, y1 = min(CANVAS[0], x1 + PAD + 1), y1 + 1
    # VP9 needs even sizes.
    x1 -= (x1 - x0) % 2
    y0 += (y1 - y0) % 2
    box = (int(x0), int(y0), int(x1), int(y1))
    cw, ch = box[2] - box[0], box[3] - box[1]
    print(f"crop box {box}  ->  {cw}x{ch}")

    # Pass 2: encode.
    for name, p in plan.items():
        if name not in args.clips:
            continue
        dst = out / f"{name}.webm"
        enc = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
             "-s", f"{cw}x{ch}", "-r", p["fps"], "-i", "-",
             "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30",
             "-auto-alt-ref", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
             "-an", str(dst)],
            stdin=subprocess.PIPE)
        # Smooth loop: hold back the first `fade` frames, then blend them into the
        # last `fade` frames, so the clip's end runs straight into its new start.
        fade = round(p["trim"][3] * eval(p["fps"])) if p["trim"] else 0
        held, first = [], None
        for i, rgb in enumerate(clip_frames(p)):
            rgba = key(place(rgb, p["s"], p["dx"], p["dy"], p["bg"]))
            rgba = soft_bottom(rgba, box[3])[box[1]:box[3], box[0]:box[2]]
            if i < fade:
                held.append(rgba.copy())
                continue
            k = i - (p["count"] - fade)
            if k >= 0:
                rgba = blend(rgba, held[k], (k + 1) / (fade + 1))
            if first is None:
                first = rgba.copy()
            enc.stdin.write(np.ascontiguousarray(rgba).tobytes())
        enc.stdin.close()
        enc.wait()
        Image.fromarray(first, "RGBA").save(out / f"{name}.png", optimize=True)
        print(f"wrote {dst.relative_to(ROOT)}  ({dst.stat().st_size // 1024} KB)")

    (out / "clips.json").write_text(json.dumps({"width": cw, "height": ch}) + "\n")


if __name__ == "__main__":
    main()
