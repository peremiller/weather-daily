"""Generates Play Store graphic assets:
  play-icon-512.png        512x512 listing icon (from the app icon)
  feature-graphic-1024x500.png  1024x500 feature graphic banner

Run: python3 store-assets/make_store_assets.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(__file__)
ICON_SRC = os.path.join(HERE, '..', 'app', 'assets', 'icon', 'icon.png')

TOP = (41, 128, 185)      # #2980B9
BOTTOM = (109, 213, 250)  # #6DD5FA
SUN = (255, 202, 40)
SUN_LIGHT = (255, 224, 130)
CLOUD = (255, 255, 255)

FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
FONT_REG = '/System/Library/Fonts/Supplemental/Arial.ttf'


# ---- 512x512 listing icon (downscale the 1024 app icon) --------------------
def make_icon():
    img = Image.open(ICON_SRC).convert('RGB').resize((512, 512), Image.LANCZOS)
    out = os.path.join(HERE, 'play-icon-512.png')
    img.save(out)
    print('Wrote', out)


# ---- shared sun + cloud motif ----------------------------------------------
def draw_sun(layer, cx, cy, r):
    d = ImageDraw.Draw(layer)
    ray_len = r * 0.7
    ray_w = max(2, int(r * 0.16))
    for i in range(12):
        a = math.radians(i * 30)
        x1 = cx + math.cos(a) * (r + r * 0.25)
        y1 = cy + math.sin(a) * (r + r * 0.25)
        x2 = cx + math.cos(a) * (r + r * 0.25 + ray_len)
        y2 = cy + math.sin(a) * (r + r * 0.25 + ray_len)
        d.line([(x1, y1), (x2, y2)], fill=SUN, width=ray_w)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=SUN)
    d.ellipse([cx - r * 0.62, cy - r * 0.62, cx + r * 0.62, cy + r * 0.62], fill=SUN_LIGHT)


def draw_cloud(layer, cx, cy, w):
    sh = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    _cloud_shape(sd, cx + w * 0.02, cy + w * 0.05, w, (20, 60, 90, 80))
    sh = sh.filter(ImageFilter.GaussianBlur(w * 0.03))
    layer.alpha_composite(sh)
    _cloud_shape(ImageDraw.Draw(layer), cx, cy, w, CLOUD + (255,))


def _cloud_shape(d, cx, cy, w, color):
    for px, py, pr in [(-0.42, 0.05, 0.30), (-0.16, -0.18, 0.40),
                       (0.16, -0.12, 0.34), (0.42, 0.06, 0.28)]:
        x, y, r = cx + px * w, cy + py * w, pr * w
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)
    base_h = 0.30 * w
    d.rounded_rectangle([cx - 0.55 * w, cy + 0.05 * w, cx + 0.55 * w, cy + 0.05 * w + base_h],
                        radius=base_h / 2, fill=color)


# ---- 1024x500 feature graphic ----------------------------------------------
def horizontal_gradient(w, h, left, right):
    img = Image.new('RGB', (w, h), left)
    d = ImageDraw.Draw(img)
    for x in range(w):
        t = x / (w - 1)
        d.line([(x, 0), (x, h)],
               fill=tuple(int(left[i] + (right[i] - left[i]) * t) for i in range(3)))
    return img


def make_feature():
    W, H = 1024, 500
    img = horizontal_gradient(W, H, TOP, BOTTOM).convert('RGBA')

    # Motif on the right (kept clear of the text).
    sun = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw_sun(sun, 885, 160, 58)
    img.alpha_composite(sun)
    draw_cloud(img, 860, 275, 240)

    d = ImageDraw.Draw(img)
    title = ImageFont.truetype(FONT_BOLD, 62)
    tag = ImageFont.truetype(FONT_REG, 31)
    d.text((70, 175), 'My Daily Weather', font=title, fill=(255, 255, 255))
    d.text((74, 268), 'Your forecast — on your phone', font=tag, fill=(235, 245, 255))
    d.text((74, 308), 'and in your chats.', font=tag, fill=(235, 245, 255))

    out = os.path.join(HERE, 'feature-graphic-1024x500.png')
    img.convert('RGB').save(out)
    print('Wrote', out)


if __name__ == '__main__':
    make_icon()
    make_feature()
