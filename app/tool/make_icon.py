"""Generates the Weather Daily app icon (sun + cloud on a sky-blue gradient).

Outputs:
  assets/icon/icon.png            1024x1024 full-bleed (iOS + legacy Android)
  assets/icon/icon_foreground.png 1024x1024 transparent, centred for adaptive

Run: python3 tool/make_icon.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

S = 1024
ASSET_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "icon")
os.makedirs(ASSET_DIR, exist_ok=True)

TOP = (41, 128, 185)      # #2980B9
BOTTOM = (109, 213, 250)  # #6DD5FA
SUN = (255, 202, 40)      # warm amber
SUN_LIGHT = (255, 224, 130)
CLOUD = (255, 255, 255)
CLOUD_SHADE = (225, 238, 248)


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (size, size), top)
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b))
    return img


def draw_sun(layer, cx, cy, r):
    d = ImageDraw.Draw(layer)
    # rays
    import math
    ray_len = r * 0.7
    ray_w = max(2, int(r * 0.16))
    for i in range(12):
        a = math.radians(i * 30)
        x1 = cx + math.cos(a) * (r + r * 0.25)
        y1 = cy + math.sin(a) * (r + r * 0.25)
        x2 = cx + math.cos(a) * (r + r * 0.25 + ray_len)
        y2 = cy + math.sin(a) * (r + r * 0.25 + ray_len)
        d.line([(x1, y1), (x2, y2)], fill=SUN, width=ray_w)
    # disc with a soft lighter core
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=SUN)
    d.ellipse([cx - r * 0.62, cy - r * 0.62, cx + r * 0.62, cy + r * 0.62], fill=SUN_LIGHT)


def draw_cloud(layer, cx, cy, w):
    d = ImageDraw.Draw(layer)
    # subtle drop shadow
    sh = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    _cloud_shape(sd, cx + w * 0.02, cy + w * 0.05, w, (20, 60, 90, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(w * 0.03))
    layer.alpha_composite(sh)
    _cloud_shape(d, cx, cy, w, CLOUD + (255,))


def _cloud_shape(d, cx, cy, w, color):
    # puffs sized relative to cloud width w
    puffs = [
        (-0.42, 0.05, 0.30),
        (-0.16, -0.18, 0.40),
        (0.16, -0.12, 0.34),
        (0.42, 0.06, 0.28),
    ]
    for px, py, pr in puffs:
        x = cx + px * w
        y = cy + py * w
        r = pr * w
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)
    # flat base
    base_h = 0.30 * w
    d.rounded_rectangle(
        [cx - 0.55 * w, cy + 0.05 * w, cx + 0.55 * w, cy + 0.05 * w + base_h],
        radius=base_h / 2, fill=color,
    )


# ---- Full-bleed icon -------------------------------------------------------
full = vertical_gradient(S, TOP, BOTTOM).convert("RGBA")
sun_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw_sun(sun_layer, S * 0.66, S * 0.40, S * 0.16)
full.alpha_composite(sun_layer)
draw_cloud(full, S * 0.46, S * 0.58, S * 0.62)
full.convert("RGB").save(os.path.join(ASSET_DIR, "icon.png"))

# ---- Adaptive foreground (transparent, centred, inside safe zone) ----------
fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
sun_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw_sun(sun_layer, S * 0.60, S * 0.40, S * 0.12)
fg.alpha_composite(sun_layer)
draw_cloud(fg, S * 0.48, S * 0.55, S * 0.46)
fg.save(os.path.join(ASSET_DIR, "icon_foreground.png"))

print("Wrote icon.png and icon_foreground.png to", os.path.abspath(ASSET_DIR))
