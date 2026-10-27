# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "python-bidi"]
# ///
"""Lay crisp headline text, a brush-stroke name banner and a logo over a generated poster.

Image models garble Hebrew and redraw logos, so both are added here, pixel-exact.

    uv run overlay.py --bg bg.png --out final.png --headline "ממשיך!" --sub "אופיר לוי" \
        --colors "#F2B705,#1D4E9E" --pos bottom --logo logo.png --logo-pos top-right
"""
import argparse
import random
from pathlib import Path

from bidi.algorithm import get_display
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
TEXT_WIDTH = 0.86  # share of the poster width the headline may fill
BAND_Y = {"top": 0.17, "center": 0.52, "bottom": 0.78}  # headline centre, as a share of the height


def hex_rgb(value):
    value = value.strip().lstrip("#")
    if len(value) != 6:
        raise SystemExit(f"Bad colour {value!r}: use #RRGGBB")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def luminance(rgb):
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255


def font(kind, size):
    if kind == "karantina":
        return ImageFont.truetype(str(FONTS / "Karantina-Bold.ttf"), size)
    f = ImageFont.truetype(str(FONTS / "Rubik.ttf"), size)
    f.set_variation_by_axes([800 if kind == "rubik" else 600])
    return f


def fit_font(text, kind, max_width, max_size):
    size = max_size
    while size > 24 and font(kind, size).getlength(text) > max_width:
        size -= 4
    return font(kind, size)


def scrim(poster, pos):
    """Darken the text band so white type reads on any background."""
    w, h = poster.size
    mask = Image.new("L", (1, h))
    for y in range(h):
        t = y / h
        if pos == "bottom":
            a = max(0.0, (t - 0.5) / 0.5)
        elif pos == "top":
            a = max(0.0, (0.4 - t) / 0.4)
        else:
            a = max(0.0, 1 - abs(t - BAND_Y["center"]) / 0.2)
        mask.putpixel((0, y), int(175 * a ** 1.4))
    poster.paste(Image.new("RGB", (w, h), (8, 8, 14)), (0, 0), mask.resize((w, h)))


def glowing_text(poster, xy, text, fnt, fill, glow, tilt):
    """White type with a coloured glow and a hard shadow, optionally tilted like a sports headline."""
    w, h = poster.size
    layer = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(layer)
    d.text((xy[0] + 6, xy[1] + 8), text, font=fnt, fill=(0, 0, 0, 170), anchor="mm")
    glow_layer = Image.new("RGBA", (w, h))
    ImageDraw.Draw(glow_layer).text(xy, text, font=fnt, fill=glow + (255,), anchor="mm",
                                    stroke_width=10, stroke_fill=glow + (255,))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(24))
    glow_layer = Image.alpha_composite(glow_layer, glow_layer)  # doubled, so the glow survives a busy background
    d.text(xy, text, font=fnt, fill=fill + (255,), anchor="mm")
    combined = Image.alpha_composite(glow_layer, layer)
    if tilt:
        combined = combined.rotate(tilt, resample=Image.BICUBIC, center=xy)
    poster.alpha_composite(combined)


def brush_banner(poster, center, text, fnt, color, seed=7):
    """A rough paint-stroke strip behind the text (the Maccabi 'name on gold brush' look)."""
    rng = random.Random(seed)
    text_w = fnt.getlength(text)
    bw, bh = int(text_w + 120), int(fnt.size * 1.45)
    x0, y0 = center[0] - bw // 2, center[1] - bh // 2
    mask = Image.new("L", poster.size)
    d = ImageDraw.Draw(mask)
    # jagged left and right ends, a slightly wobbly body
    pts = []
    for i in range(13):
        y = y0 + bh * i / 12
        pts.append((x0 + rng.randint(-26, 26) + (i % 2) * 14, y + rng.randint(-3, 3)))
    for i in range(13):
        y = y0 + bh * (12 - i) / 12
        pts.append((x0 + bw + rng.randint(-26, 26) - (i % 2) * 14, y + rng.randint(-3, 3)))
    d.polygon(pts, fill=235)
    # dry-brush streaks: thin gaps and stray bristle lines
    for _ in range(9):
        y = rng.randint(y0, y0 + bh)
        d.line([(x0 + rng.randint(-40, 60), y), (x0 + bw - rng.randint(-40, 60), y)],
               fill=rng.choice([0, 120, 255]), width=rng.randint(1, 3))
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    paint = Image.new("RGBA", poster.size, color + (255,))
    paint.putalpha(mask)
    poster.alpha_composite(paint)
    ink = (20, 20, 28) if luminance(color) > 0.55 else (255, 255, 255)
    ImageDraw.Draw(poster).text(center, text, font=fnt, fill=ink + (255,), anchor="mm")


def knock_out_background(logo, tolerance=48):
    """Logos without transparency: make the corner colour transparent where it touches the edge.

    Only the background connected to the corners goes, so the same colour inside the logo (white lettering on a
    white-backed crest) stays."""
    rgb = logo.convert("RGB")
    w, h = rgb.size
    corner_xy = ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))
    corners = [rgb.getpixel(p) for p in corner_xy]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, bg)).convert("L")
    soft = diff.point(lambda v: 0 if v < tolerance * 0.5 else min(255, (v - tolerance * 0.5) * 6))
    reach = diff.point(lambda v: 0 if v < tolerance * 0.5 else 255)
    for p in corner_xy:
        if reach.getpixel(p) == 0:
            ImageDraw.floodfill(reach, p, 128)
    alpha = ImageChops.lighter(soft, reach.point(lambda v: 0 if v == 128 else 255))
    logo = rgb.convert("RGBA")
    logo.putalpha(alpha.filter(ImageFilter.GaussianBlur(0.8)))
    return logo


def place_logo(poster, path, corner, keep_bg):
    logo = Image.open(path)
    if logo.mode != "RGBA" and not keep_bg:
        logo = knock_out_background(logo)
    logo = logo.convert("RGBA")
    target_h = int(poster.height * 0.16)
    logo = logo.resize((int(logo.width * target_h / logo.height), target_h), Image.LANCZOS)
    margin = 44
    x = margin if corner == "top-left" else poster.width - logo.width - margin
    shadow = Image.new("RGBA", poster.size)
    shadow.paste((0, 0, 0, 150), (x + 4, margin + 8), logo.getchannel("A"))
    poster.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10)))
    poster.alpha_composite(logo, (x, margin))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bg", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--headline", default="")
    ap.add_argument("--sub", default="", help="second line, drawn on a brush stroke (usually the name)")
    ap.add_argument("--colors", default="#F2B705", help="one or two #RRGGBB, comma separated")
    ap.add_argument("--pos", choices=list(BAND_Y), default="bottom")
    ap.add_argument("--y", type=float, help="override headline centre as a share of the height, e.g. 0.7")
    ap.add_argument("--font", choices=["karantina", "rubik"], default="karantina")
    ap.add_argument("--tilt", type=float, default=0, help="degrees; 3-6 gives a dynamic look")
    ap.add_argument("--logo")
    ap.add_argument("--logo-pos", choices=["top-left", "top-right"], default="top-right")
    ap.add_argument("--logo-keep-bg", action="store_true", help="don't knock out a logo's flat background")
    args = ap.parse_args()

    colors = [hex_rgb(c) for c in args.colors.split(",") if c.strip()]
    primary, secondary = colors[0], colors[-1]
    poster = Image.open(args.bg).convert("RGB")
    w, h = poster.size

    if args.headline or args.sub:
        scrim(poster, args.pos)
    poster = poster.convert("RGBA")

    y = int(h * (args.y if args.y is not None else BAND_Y[args.pos]))
    if args.headline:
        text = get_display(args.headline)
        max_size = 230 if args.font == "karantina" else 150
        hf = fit_font(text, args.font, w * TEXT_WIDTH, max_size)
        glowing_text(poster, (w // 2, y), text, hf, (255, 255, 255), primary, args.tilt)
        y += int(hf.size * 0.62)
    if args.sub:
        text = get_display(args.sub)
        sf = fit_font(text, "rubik-sub", w * 0.62, 72)
        brush_banner(poster, (w // 2, y + int(sf.size * 0.9)), text, sf, secondary if len(colors) > 1 else primary)
    if args.logo:
        place_logo(poster, args.logo, args.logo_pos, args.logo_keep_bg)

    poster.convert("RGB").save(args.out, quality=95)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
