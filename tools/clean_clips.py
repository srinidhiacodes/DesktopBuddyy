"""Turn the green-screen clips into transparent WebM videos for the app.

For each clip this script:
  1. lines her up with the Focus clip (same size and position in every clip),
  2. removes the green background and the green fringe on her edges,
  3. crops every clip to the same box and fades out the bottom edge,
  4. writes a VP9 WebM with transparency plus a PNG of the first frame.

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
REFERENCE = "focus"          # every clip is lined up to this one
CANVAS = (540, 960)          # reference clip size (w, h)
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


def frames(path, w, h, limit=None):
    """Yield frames as (h, w, 3) uint8 arrays (all of them, or the first `limit`)."""
    cmd = ["ffmpeg", "-v", "error", "-i", str(path)]
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


def first_frame(path):
    w, h, _ = probe(path)
    return next(frames(path, w, h, limit=1))


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


def place(rgb, s, dx, dy, bg):
    """Scale and shift a frame onto the reference canvas; empty space is filled with bg."""
    img = Image.fromarray(rgb)
    # PIL's affine maps output -> input: x_in = (x_out - dx) / s
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
        score, s, dx, dy = register(first_frame(path), ref)
        bg = background_colour(first_frame(path))
        plan[name] = dict(path=path, w=w, h=h, fps=fps, s=s, dx=dx, dy=dy, bg=bg)
        print(f"{name:8s} {w}x{h} @{fps}  scale {s:.3f}  shift ({dx:+d}, {dy:+d})  face match {score:.3f}")

    # Pass 1: one crop box that fits her in every frame of every clip.
    # The bottom is the highest of the clips' bottom edges, so none shows a hard cut.
    x0, y0, x1, y1 = CANVAS[0], CANVAS[1], 0, 0
    bottom = CANVAS[1]
    for name, p in plan.items():
        bottom = min(bottom, int(p["dy"] + p["h"] * p["s"]) - 2)
        for rgb in frames(p["path"], p["w"], p["h"]):
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
        first = None
        for rgb in frames(p["path"], p["w"], p["h"]):
            rgba = key(place(rgb, p["s"], p["dx"], p["dy"], p["bg"]))
            rgba = soft_bottom(rgba, box[3])[box[1]:box[3], box[0]:box[2]]
            if first is None:
                first = rgba.copy()
            enc.stdin.write(np.ascontiguousarray(rgba).tobytes())
        enc.stdin.close()
        enc.wait()
        Image.fromarray(first, "RGBA").save(out / f"{name}.png", optimize=True)
        print(f"wrote {dst.relative_to(ROOT)}  ({dst.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
