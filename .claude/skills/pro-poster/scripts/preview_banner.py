# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Show a home-page banner the way FeaturedPosts.vue renders it: desktop and phone crops, the dark gradient, and grey
blocks where the post title and button land. For review only; the banner itself ships without any of this.

    uv run preview_banner.py --banner banner.jpg --out preview.png
"""
import argparse

from PIL import Image, ImageDraw, ImageOps

SCALE = 2  # draw at retina size so faces stay readable in the preview
# Rendered hero size in CSS px (FeaturedPosts.vue in DefaultLayout's max-w-6xl main): padding + min-h + dots row.
# ponytail: a long, two-line title makes the card taller and crops the banner's sides further; the phone view is the
# tightest crop either way.
VIEWS = {
    "desktop": {"size": (1104, 388), "pad": 40, "title_h": 40},
    "phone": {"size": (358, 324), "pad": 24, "title_h": 30},
}
DOTS_ROW = 52


def site_gradient(w, h):
    """bg-linear-to-t from-black/85 via-black/60 to-black/25, as a black layer's alpha."""
    alpha = Image.new("L", (1, h))
    for y in range(h):
        t = 1 - y / (h - 1)  # 0 at the bottom, 1 at the top
        a = 0.85 + (0.60 - 0.85) * t * 2 if t < 0.5 else 0.60 + (0.25 - 0.60) * (t - 0.5) * 2
        alpha.putpixel((0, y), round(255 * a))
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    layer.putalpha(alpha.resize((w, h)))
    return layer


def render(banner, size, pad, title_h):
    w, h = size[0] * SCALE, size[1] * SCALE
    pad, title_h, dots = pad * SCALE, title_h * SCALE, DOTS_ROW * SCALE
    view = ImageOps.fit(banner, (w, h), Image.LANCZOS).convert("RGBA")  # object-cover, centred
    view.alpha_composite(site_gradient(w, h))
    d = ImageDraw.Draw(view)
    grey = (200, 200, 200, 230)
    # RTL: the text stack hugs the right edge (the start side), above the dots row
    button_bottom = h - pad - dots
    d.rounded_rectangle((w - pad - 140 * SCALE, button_bottom - 44 * SCALE, w - pad, button_bottom), 12 * SCALE, fill=grey)
    title_bottom = button_bottom - 44 * SCALE - 12 * SCALE
    d.rectangle((w - pad - int(w * 0.55), title_bottom - title_h, w - pad, title_bottom), fill=grey)
    return view


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--banner", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    banner = Image.open(args.banner).convert("RGB")
    views = [render(banner, **v) for v in VIEWS.values()]
    gap = 40
    sheet = Image.new("RGB", (sum(v.width for v in views) + gap, max(v.height for v in views)), (255, 255, 255))
    x = 0
    for v in views:
        sheet.paste(v, (x, 0))
        x += v.width + gap
    sheet.save(args.out)
    print(f"wrote {args.out} (desktop | phone)")


if __name__ == "__main__":
    main()
