# /// script
# requires-python = ">=3.11"
# dependencies = ["requests", "pillow"]
# ///
"""Send a photo (plus optional extra images) and an art-direction prompt to an image-edit API.

Writes a PNG with no text on it: a 1080x1350 poster (overlay.py adds the text and the logo afterwards) or, with
--format banner, a 2400x1000 home-page banner (the site draws the post title over it).

    uv run generate.py --prompt-file prompt.txt --out bg.png [--format banner] photo.jpg [extra.png ...]

Provider: GEMINI_API_KEY or OPENAI_API_KEY. Gemini wins when both are set; --provider forces one.
Models: POSTER_GEMINI_MODEL / POSTER_OPENAI_MODEL override the defaults below.
"""
import argparse
import base64
import io
import os
import sys

import requests
from PIL import Image, ImageOps

# format -> (output size, Gemini aspect ratio, gpt-image-2 size, composition line for the guardrails).
# The banner is wider than any screen shows: FeaturedPosts.vue crops it with object-cover to ~2.85:1 on desktop and
# ~1.1:1 on a phone, so only the centre survives everywhere (see preview_banner.py).
FORMATS = {
    "poster": ((1080, 1350), "4:5", "1088x1360", "Vertical 4:5 composition."),
    "banner": ((2400, 1000), "21:9", "2016x864", "Wide 21:9 banner composition."),
}
GEMINI_MODEL = os.environ.get("POSTER_GEMINI_MODEL", "gemini-nano-banana-2.1")
OPENAI_MODEL = os.environ.get("POSTER_OPENAI_MODEL", "gpt-image-2")
MAX_INPUT_SIDE = 2048  # keeps uploads small; the models don't use more

# Sent ahead of every art-direction prompt, so no style or prompt can drop it. Leading the prompt is what keeps
# faces faithful; the text ban exists because these models garble lettering, and overlay.py draws all text instead.
GUARDRAILS = """\
The provided images are real photos of real people, taken with a modest camera. Every person must stay recognisably
themselves: the same face and facial features, hairline, skin tone, body shape, jersey, jersey number and every logo
on the clothing. Do not restyle, slim, age, beautify or swap any face.
Do enhance the photo the way a pro sports retoucher would: remove noise, blur and compression artifacts, sharpen
detail, fix exposure and white balance, recover blown highlights, and relight each person so they belong in the
scene. Enhance, never redraw.
Correct anatomy: five fingers per hand, natural limbs, a round ball.
No text, letters, words, numbers, watermarks or logos anywhere in the image except what is already printed on the
clothing.
"""


def png_bytes(path):
    img = ImageOps.exif_transpose(Image.open(path))
    img.thumbnail((MAX_INPUT_SIDE, MAX_INPUT_SIDE))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def fail_on_http_error(resp, provider):
    if resp.ok:
        return
    sys.exit(f"{provider} API error {resp.status_code}: {resp.text[:800]}")


def find_image_b64(node):
    """Last base64 image anywhere in a Gemini response (top-level output_image or steps[].content[])."""
    if isinstance(node, dict):
        if isinstance(node.get("output_image"), dict) and node["output_image"].get("data"):
            return node["output_image"]["data"]
        found = node["data"] if node.get("type") == "image" and node.get("data") else None
        for value in node.values():
            found = find_image_b64(value) or found
        return found
    if isinstance(node, list):
        found = None
        for item in node:
            found = find_image_b64(item) or found
        return found
    return None


def gemini(prompt, images, fmt):
    blocks = [{"type": "text", "text": prompt}]
    blocks += [{"type": "image", "mime_type": "image/png", "data": base64.b64encode(b).decode()} for b in images]
    resp = requests.post(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
        json={
            "model": GEMINI_MODEL,
            "input": blocks,
            "response_format": {"type": "image", "aspect_ratio": FORMATS[fmt][1], "image_size": "2K"},
        },
        timeout=600,
    )
    fail_on_http_error(resp, "Gemini")
    data = find_image_b64(resp.json())
    if not data:
        sys.exit(f"Gemini returned no image (often a safety block). Response: {resp.text[:800]}")
    return base64.b64decode(data)


def openai(prompt, images, fmt):
    # gpt-image-2 takes any size divisible by 16; older GPT image models only take fixed portrait/landscape sizes.
    if OPENAI_MODEL.startswith("gpt-image-2"):
        size = FORMATS[fmt][2]
    else:
        size = "1024x1536" if fmt == "poster" else "1536x1024"
    resp = requests.post(
        "https://api.openai.com/v1/images/edits",
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
        data={"model": OPENAI_MODEL, "prompt": prompt, "size": size, "quality": "high"},
        files=[("image[]", (f"input{i}.png", b, "image/png")) for i, b in enumerate(images)],
        timeout=600,
    )
    fail_on_http_error(resp, "OpenAI")
    return base64.b64decode(resp.json()["data"][0]["b64_json"])


def pick_provider(forced):
    if forced:
        key = {"gemini": "GEMINI_API_KEY", "openai": "OPENAI_API_KEY"}[forced]
        if not os.environ.get(key):
            sys.exit(f"--provider {forced} needs {key} to be set")
        return forced
    if os.environ.get("GEMINI_API_KEY"):
        return "gemini"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    sys.exit("No API key: set GEMINI_API_KEY or OPENAI_API_KEY (see the skill's references/api-keys.md)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+", help="main photo first, then any extra images")
    ap.add_argument("--prompt-file", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--provider", choices=["gemini", "openai"])
    ap.add_argument("--format", choices=list(FORMATS), default="poster")
    args = ap.parse_args()

    provider = pick_provider(args.provider)
    with open(args.prompt_file, encoding="utf-8") as f:
        prompt = f"{GUARDRAILS}{FORMATS[args.format][3]}\n\n{f.read()}"
    images = [png_bytes(p) for p in args.images]
    raw = (gemini if provider == "gemini" else openai)(prompt, images, args.format)

    w, h = FORMATS[args.format][0]
    image = ImageOps.fit(Image.open(io.BytesIO(raw)).convert("RGB"), (w, h), Image.LANCZOS)
    image.save(args.out)
    print(f"{provider}: wrote {args.out} ({w}x{h})")


if __name__ == "__main__":
    main()
